export type DecideOutcome = 'approved' | 'rejected' | 'failed'

/** 결재 처리 결과를 확인한 뒤에만 '승인·반려'로 본다: false 응답·오류는 모두 실패 */
export async function decideOutcome(run: () => Promise<boolean> | boolean, allow: boolean): Promise<DecideOutcome> {
  try {
    return (await run()) === true ? (allow ? 'approved' : 'rejected') : 'failed'
  } catch {
    return 'failed'
  }
}
