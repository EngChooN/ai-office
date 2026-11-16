// 예전(1.4.1까지) 첫 실행 안내에서 직원에게 첫 업무를 실제로 맡겨 봤는지 — 그 사람에게는 업무 연습을 '실제로 해 봤어요'로 보이고
// 단체방·결재함 처음 힌트를 띄우지 않는다. 지금 첫 실행 안내에는 실제 첫 업무 단계가 없어 새로 기록하지 않는다
const FIRST_TASK_DONE_KEY = 'aiOffice.firstTaskDone'

export function hasDoneFirstTask(): boolean {
  try {
    return localStorage.getItem(FIRST_TASK_DONE_KEY) === '1'
  } catch {
    return false
  }
}
