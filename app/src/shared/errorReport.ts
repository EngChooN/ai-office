// 피드백에 붙이는 최근 오류 기록 — 모양·본문 조립·길이 자르기 (순수 함수, 가리기는 main/errorLog가 저장할 때 끝낸다)
// 이슈는 공개되므로 여기로 오는 글은 이미 가려진 것이어야 한다

/** 오류가 난 곳: 메인 프로세스 · 화면 · 직원 실행 */
export type ErrorSource = 'main' | 'renderer' | 'staff'

export interface ErrorEntry {
  /** 마지막으로 난 시각 (ms) */
  at: number
  source: ErrorSource
  /** 가려진 오류 글 */
  message: string
  /** 같은 오류가 이어서 난 횟수 */
  count: number
}

/** preload가 window.officeErrors로 내놓는 것 (PC 앱 창 전용 errors:* 채널) */
export interface OfficeErrorsApi {
  /** 최근 오류 (새것이 앞, 이미 가려진 글) */
  list(): Promise<ErrorEntry[]>
  /** 화면에서 난 오류 알리기 (메인이 가려서 넣는다) */
  report(text: string): void
}

/** 남겨 두는 최근 오류 수 */
export const ERROR_LOG_MAX = 20
/** 오류 한 건의 글 길이 상한 (가린 뒤에 자른다) */
export const ERROR_MESSAGE_MAX = 800
/** 이슈 본문 전체 길이 상한 — 작성 주소 길이 제한 때문에 */
export const ISSUE_BODY_MAX = 6000

export const ERROR_LOG_HEADING = '### Error log'
const FENCE = '```'

/** 미리 보기·본문·클립보드에 같은 글로 쓴다 (새것이 위) */
export function formatErrorLog(entries: ErrorEntry[]): string {
  return entries
    .map((e) => `[${new Date(e.at).toISOString()}] ${e.source}${e.count > 1 ? ` x${e.count}` : ''}\n${e.message}`)
    .join('\n\n')
    .replaceAll(FENCE, "'''") // 코드 블록이 중간에 닫히지 않게
}

/**
 * 본문(base) 뒤에 오류 기록 절을 붙이되 전체가 max를 넘지 않게 기록을 자른다.
 * 잘리면 기록 끝에 '…'를 두고 블록 아래에 truncatedNote를 단다. 기록을 한 줄도 못 넣으면 절 없이 안내만 단다
 */
export function fitIssueBody(base: string, log: string, truncatedNote: string, max = ISSUE_BODY_MAX): { body: string; isTruncated: boolean } {
  if (!log) return { body: base, isTruncated: false }
  const open = `\n\n${ERROR_LOG_HEADING}\n${FENCE}\n`
  const close = `\n${FENCE}`
  const full = base + open + log + close
  if (full.length <= max) return { body: full, isTruncated: false }
  const note = `\n\n${truncatedNote}`
  const room = max - base.length - open.length - close.length - note.length - 2 // '\n…'
  // 안내까지 못 넣으면 본문만 (본문 자체는 자르지 않는다 — 기록 때문에 상한을 넘기지 않게만)
  if (room <= 0) return { body: base.length + note.length <= max ? base + note : base, isTruncated: true }
  let cut = log.slice(0, room)
  const lineEnd = cut.lastIndexOf('\n')
  if (lineEnd > room / 2) cut = cut.slice(0, lineEnd) // 가능하면 줄 끝에서 자른다
  return { body: base + open + cut + '\n…' + close + note, isTruncated: true }
}
