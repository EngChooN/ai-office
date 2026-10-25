// 참고 문서(직원·팀·랩에 등록한 CONTEXT.md·SPEC 같은 파일) 규칙
// main(저장·프롬프트·Read 허용)·renderer(입력 검사·표시)·테스트가 같은 함수를 쓴다. 파일 시스템은 직접 보지 않고 exists 함수로 받는다

import { t } from './i18n/index.ts'

/** 대상(직원·팀·랩) 하나에 등록할 수 있는 문서 수 */
export const REF_DOCS_PER_TARGET = 5
/** 직원 한 명의 프롬프트에 넣는 문서 합계 */
export const REF_DOCS_TOTAL = 15
/** 랩 "추천 추가"로 프로젝트 폴더에서 찾는 파일 */
export const SUGGESTED_REF_DOCS = ['CLAUDE.md', 'CONTEXT.md', 'README.md']

export type RefDocReject = 'empty' | 'relative' | 'network' | 'duplicate' | 'limit'

export const REF_DOC_REJECT_LABEL: Record<RefDocReject, string> = {
  empty: '경로가 비어 있어요',
  relative: '절대 경로(/…, C:\\… 또는 ~/…)만 넣을 수 있어요',
  network: '네트워크 폴더(\\\\서버\\…)는 아직 넣을 수 없어요. 내 PC에 있는 파일을 골라 주세요',
  duplicate: '이미 등록된 문서예요',
  limit: `한 곳에 ${REF_DOCS_PER_TARGET}개까지 등록할 수 있어요`,
}

// 경로 규칙은 여기 한 곳에서만 정한다
// 맥: /a/b · 윈도우: C:\a\b (드라이브 문자는 대문자, 구분자는 \로 통일). 입력 모양으로 판단하므로 어느 OS에서 돌려도 같은 결과다
const DRIVE = /^([A-Za-z]):(?:[\\/]|$)/
const SEP = /[\\/]/
const isUnc = (p: string) => /^[\\/]{2}/.test(p) && p.includes('\\')
const isWindowsPath = (p: string) => DRIVE.test(p)

/** 비교용 키: 윈도우 파일 시스템은 대소문자를 가리지 않으므로 윈도우 경로는 소문자로 비교한다 (맥은 그대로) */
export const refDocKey = (path: string) => (isWindowsPath(path) ? path.toLowerCase() : path)

/** 네트워크 폴더(UNC: \\서버\공유)인지 — 아직 받지 않는다 */
export const isNetworkPath = (input: string) => isUnc(input.trim())

/** "~"는 홈으로 바꾸고 "."·".."·겹친 구분자를 정리한다. 절대 경로가 아니거나 네트워크 폴더면 null */
export function normalizeRefDocPath(input: string, home: string): string | null {
  const raw = input.trim()
  if (isUnc(raw)) return null
  // 윈도우 홈이면 "~\"도 받는다 (맥은 \가 파일 이름에 쓰일 수 있는 글자라 "~/"만)
  const tilde = isWindowsPath(home) ? /^~[\\/]/ : /^~\//
  const expanded = raw === '~' ? home : tilde.test(raw) ? `${home}/${raw.slice(2)}` : raw
  const drive = expanded.match(DRIVE)?.[1]
  if (!drive && !expanded.startsWith('/')) return null
  const parts: string[] = []
  for (const part of drive ? expanded.slice(2).split(SEP) : expanded.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return drive ? `${drive.toUpperCase()}:\\${parts.join('\\')}` : `/${parts.join('/')}`
}

/** 저장 전 검사: 정규화하고, 대상 안 중복은 하나만, 상한을 넘으면 뒤는 거부한다 (순서는 입력 그대로) */
export function sanitizeRefDocs(inputs: string[], home: string) {
  const docs: string[] = []
  const rejected: { input: string; reason: RefDocReject }[] = []
  for (const input of inputs) {
    const doc = input.trim() ? normalizeRefDocPath(input, home) : null
    const reason: RefDocReject | null = !input.trim()
      ? 'empty'
      : isNetworkPath(input)
        ? 'network'
        : !doc
          ? 'relative'
          : docs.some((d) => refDocKey(d) === refDocKey(doc))
            ? 'duplicate'
            : docs.length >= REF_DOCS_PER_TARGET
              ? 'limit'
              : null
    if (reason) rejected.push({ input, reason })
    else docs.push(doc!)
  }
  return { docs, rejected }
}

/** 직원에게 닿는 문서 묶음 하나 (개인·팀·랩) */
export interface RefDocSource {
  /** 출처 표기 (예: "개인", "팀 디자인", "랩 클로드 오피스") */
  label: string
  docs: string[]
}

export interface MergedRefDoc {
  path: string
  sources: string[]
}

/**
 * 개인 ∪ 팀 ∪ 랩을 합친다. 넘겨준 순서(개인 → 팀 → 랩)대로 남기고, 같은 경로는 하나로 합쳐 출처를 모두 적는다.
 * 없는 파일은 빼서 missing으로, 합계 상한을 넘은 수는 omitted로 돌려준다.
 */
export function mergeRefDocs(sources: RefDocSource[], exists: (path: string) => boolean, total = REF_DOCS_TOTAL) {
  const byPath = new Map<string, MergedRefDoc>()
  const missing: string[] = []
  for (const source of sources) {
    for (const path of source.docs) {
      const known = byPath.get(refDocKey(path))
      if (known) {
        if (!known.sources.includes(source.label)) known.sources.push(source.label)
        continue
      }
      if (missing.includes(path)) continue
      if (!exists(path)) {
        missing.push(path)
        continue
      }
      byPath.set(refDocKey(path), { path, sources: [source.label] })
    }
  }
  const all = [...byPath.values()]
  return { docs: all.slice(0, total), missing, omitted: Math.max(0, all.length - total) }
}

/** 직원 맥락에 넣는 안내 (내용은 넣지 않고 경로만, 공백·한글 경로도 그대로 쓰게 백틱으로 감싼다) */
export function refDocsPrompt(merged: { docs: MergedRefDoc[]; omitted: number }) {
  if (merged.docs.length === 0) return ''
  return [
    t('staff.refdocs.intro'),
    ...merged.docs.map((d) => `- \`${d.path}\` (${d.sources.join(' · ')})`),
    ...(merged.omitted > 0 ? [t('staff.refdocs.omitted', { n: merged.omitted })] : []),
  ].join('\n')
}

/** 직원에게 전달된 문서를 읽는 Read인지 ("모두 결재" 직원도 결재 없이) — 경로를 정규화해서 비교하므로 ..·상대 경로·끝 슬래시로 다른 파일이 걸리지 않는다 */
export function isRefDocRead(toolName: string, input: Record<string, unknown>, docs: ReadonlySet<string>, home: string) {
  if (toolName !== 'Read' || typeof input.file_path !== 'string') return false
  // '..'는 글자로 접으면 등록 경로가 되어도, 중간에 폴더 링크가 있으면 실제로는 다른 파일을 연다 → 결재로 보낸다 (윈도우 \ 구분도)
  if (input.file_path.split(SEP).includes('..')) return false
  const path = normalizeRefDocPath(input.file_path, home)
  return path !== null && [...docs].some((d) => refDocKey(d) === refDocKey(path))
}

/** 랩 프로젝트 폴더에서 추천할 문서: 있는 파일 중 아직 등록하지 않은 것 */
export function suggestRefDocs(cwd: string | null, registered: string[], exists: (path: string) => boolean) {
  if (!cwd) return []
  // 프로젝트 폴더와 같은 구분자로 잇는다 (윈도우 C:\proj → C:\proj\CLAUDE.md)
  const sep = isWindowsPath(cwd) ? '\\' : '/'
  const dir = cwd.replace(/[\\/]+$/, '')
  const keys = new Set(registered.map(refDocKey))
  return SUGGESTED_REF_DOCS.map((name) => `${dir}${sep}${name}`).filter((p) => !keys.has(refDocKey(p)) && exists(p))
}

/** 경로의 파일 이름과 폴더 (목록 두 줄 표시용) */
export function splitRefDocPath(path: string) {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const dir = path.slice(0, i)
  // 맨 위 폴더는 "/" 또는 "C:\"
  return { name: path.slice(i + 1), dir: !dir ? '/' : /^[A-Za-z]:$/.test(dir) ? `${dir}\\` : dir }
}
