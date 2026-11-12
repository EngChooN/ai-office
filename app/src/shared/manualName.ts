// 매뉴얼 이름 규칙 한 곳 — main(파일 쓰기)·화면·직원 팩이 같은 규칙을 쓴다 (순수 함수)
// name = 영문 내부 이름(스킬 폴더·AI 호출명), title = 사람이 보는 이름(한글 등 자유)

export const MANUAL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/
export const isValidManualName = (name: string) => MANUAL_NAME_RE.test(name)

/** SKILL.md frontmatter에서 표시 이름을 담는 키 — Claude Code·Codex가 이 키를 문제 삼으면 여기만 바꾼다 */
export const TITLE_KEY = 'title'
export const TITLE_MAX = 100

/** 표시 이름을 한 줄·길이 상한으로 정리한다 (빈 값이면 '') */
export const cleanTitle = (title: string | undefined) => (title ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)

/** 화면에 보일 이름: 표시 이름이 있으면 그것, 없으면 내부 이름 */
export const manualLabel = (m: { name: string; title?: string }) => cleanTitle(m.title) || m.name

/** 영문·숫자가 이만큼 안 되면 의미 없는 이름이라 보고 무작위 이름을 쓴다 ('PR 리뷰' → 'pr'은 너무 짧다) */
const MIN_SLUG = 4

/** 표시 이름에서 내부 이름 후보를 만든다 — 영문·숫자가 충분하면 그걸, 아니면 manual-무작위 6자 (같은 제목이 늘 같은 이름이 되면 팩 가져오기에서 다른 매뉴얼이 조용히 건너뛰어진다) */
export function slugFromTitle(title: string, random: () => number = Math.random): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55)
    .replace(/-+$/, '')
  if (base.length >= MIN_SLUG) return base
  return `manual-${random().toString(36).slice(2, 8).padEnd(6, '0')}`
}

/** 이미 쓰는 이름이면 -2, -3… 을 붙여 비어 있는 이름을 돌려준다 (63자를 넘지 않게 앞을 자른다) */
export function uniqueManualName(base: string, isTaken: (name: string) => boolean, random?: () => number): string {
  const b = isValidManualName(base) ? base : slugFromTitle(base, random)
  let name = b
  for (let n = 2; isTaken(name); n++) name = `${b.slice(0, 63 - String(n).length - 1).replace(/-+$/, '')}-${n}`
  return name
}

/** 고치기 저장에서 표시 이름 정하기: 안 보냈으면(undefined) 기존 값 유지, ''면 지운다 (비서가 title 없이 고쳐도 제목이 안 사라지게) */
export const resolveTitle = (prevTitle: string | undefined, inputTitle: string | undefined) => cleanTitle(inputTitle === undefined ? prevTitle : inputTitle)
