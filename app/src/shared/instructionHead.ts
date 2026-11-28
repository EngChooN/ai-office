// 직원에게 보낸 '지시' 글을 화면용으로 나눈다 (순수 함수 · 저장된 글은 바꾸지 않는다)
// 머리말([X의 도움 요청]·[X의 지시]·[업무 매뉴얼: X]) · 제목 · 보고 안내 줄을 떼어 본문만 남긴다.
// 형식은 사전(staff.msg.helpRequest·delegated)에서 정규식을 만들어 사전 문구가 바뀌어도 따라간다.
import staff from './i18n/dict/staff.ts'

export type InstructionSourceKind = 'help' | 'delegated' | 'manual'
export type InstructionParts = {
  source?: { kind: InstructionSourceKind; name: string } // help·delegated는 보낸 사람 이름, manual은 매뉴얼 이름
  title?: string // 머리말 바로 뒤 '[제목]'의 괄호 뗀 글
  body: string // 머리말·제목·보고 안내 줄·매뉴얼 안내 문장을 뺀 나머지 (앞뒤 공백 정리)
  reportTo?: string // '(끝나면 결과를 X에게 보고하세요)'의 X
}

const TITLE_MAX = 80
const LANG_KEYS = ['ko', 'en', 'ja', 'zh'] as const
const NAME = '([^\\n\\[\\]]+?)'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** 사전 틀 → 정규식 조각: 자리표시자는 이름 잡기, 나머지는 글자 그대로 */
const toPattern = (tpl: string) => tpl.split(/(\{\w+\})/).map((p) => (/^\{\w+\}$/.test(p) ? NAME : escape(p))).join('')

/** 사전 틀의 첫 줄에서 본문 자리({text}·{instruction}) 앞까지가 머리말 */
const headOf = (tpl: string, bodyKey: string) => tpl.split('\n')[0].split(bodyKey)[0].trimEnd()

type Head = { kind: InstructionSourceKind; re: RegExp }
const HEADS: Head[] = [
  ...LANG_KEYS.map((l) => ({ kind: 'help' as const, re: new RegExp(`^${toPattern(headOf(staff['staff.msg.helpRequest'][l], '{text}'))}(?=\\s|$)`) })),
  ...LANG_KEYS.map((l) => ({ kind: 'delegated' as const, re: new RegExp(`^${toPattern(headOf(staff['staff.msg.delegated'][l], '{instruction}'))}(?=\\s|$)`) })),
  // 매뉴얼 지시는 StaffPanel이 한국어로만 조립한다
  { kind: 'manual', re: /^\[업무 매뉴얼: ([^\n\[\]]+?)\](?=\s|$)/ },
]
/** 보고 안내 줄 (helpRequest 틀의 둘째 줄) — 한 줄 전체일 때만 */
const REPORT_RES = LANG_KEYS.map((l) => new RegExp(`^[ \\t]*${toPattern(staff['staff.msg.helpRequest'][l].split('\n')[1] ?? '')}[ \\t]*$`, 'm'))

const manualNote = (name: string) => new RegExp(`^[ \\t]*"${escape(name)}" 스킬\\(매뉴얼\\)을 사용해서 처리해 주세요\\.`)

/** 머리말 하나만 맞춰 본다 */
function matchHead(text: string): { kind: InstructionSourceKind; name: string; len: number } | undefined {
  for (const h of HEADS) {
    const m = h.re.exec(text)
    if (m) return { kind: h.kind, name: m[1].trim(), len: m[0].length }
  }
  return undefined
}

export function splitInstruction(text: string): InstructionParts {
  if (typeof text !== 'string') return { body: text == null ? '' : String(text) }
  try {
    const head = matchHead(text)
    if (!head || !head.name) return { body: text }
    let rest = text.slice(head.len)
    // 매뉴얼 안내 문장은 머리말의 일부로 보고, 그 뒤 줄바꿈 하나까지 뗀다 (본문 첫 줄의 [제목]도 제목으로 읽는다)
    if (head.kind === 'manual') {
      const note = manualNote(head.name).exec(rest)
      if (note) rest = rest.slice(note[0].length).replace(/^[ \t]*\r?\n/, '')
    }

    // 제목: 같은 줄에 공백만 두고 이어지는 [..] — 다른 머리말·마크다운 링크·너무 긴 글은 제목 아님
    let title: string | undefined
    const tm = /^[ \t]*\[([^\n\[\]]+)\]/.exec(rest)
    if (tm) {
      const after = rest.slice(tm[0].length)
      const inner = tm[1].trim()
      const isLink = after.startsWith('(')
      const isHead = Boolean(matchHead(rest.replace(/^[ \t]+/, '')))
      if (inner && !isLink && !isHead && inner.length <= TITLE_MAX && /^(\s|$)/.test(after)) {
        title = inner
        rest = after
      }
    }

    // 보고 안내 줄: 어디 있든 한 줄 전체면 뺀다 (뒤에 붙는 리더 간 선택지·같은 폴더 안내는 본문에 남긴다)
    let reportTo: string | undefined
    for (const re of REPORT_RES) {
      const m = re.exec(rest)
      if (!m) continue
      reportTo = m[1].trim()
      rest = rest.slice(0, m.index) + rest.slice(m.index + m[0].length).replace(/^\n/, '')
      break
    }

    return {
      source: { kind: head.kind, name: head.name },
      ...(title ? { title } : {}),
      body: rest.trim(),
      ...(reportTo ? { reportTo } : {}),
    }
  } catch {
    return { body: text }
  }
}
