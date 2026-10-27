// 멈춘 직원 진단 (docs/specs/secretary-gaps.md G3): 직원 한 명의 세션 활동을 읽기만 해서 모은다 (상태를 바꾸지 않음)
import type { LogEntry, Staff, StaffActivity } from './types'

export const ACTIVITY_RECENT_TOOLS = 5
export const ACTIVITY_RECENT_ERRORS = 3
const TEXT_MAX = 200

const clip = (t: string) => (t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX)}…` : t)

/** logs는 오래된 것부터. queue는 아직 차례를 기다리는 카드(제목 포함) */
export function buildStaffActivity(staff: Pick<Staff, 'id' | 'name' | 'status' | 'statusSince' | 'activity' | 'approvals'>, logs: LogEntry[], queue: { taskId: string; title: string }[], now: number): StaffActivity {
  const tail = (type: LogEntry['type'], n: number) =>
    logs
      .filter((l) => l.type === type)
      .slice(-n)
      .map((l) => ({ ts: l.ts, text: clip(l.text) }))
  const last = logs.length ? logs[logs.length - 1].ts : null
  return {
    staffId: staff.id,
    name: staff.name,
    status: staff.status,
    statusSince: staff.statusSince,
    activity: staff.activity,
    lastActivityAt: last,
    idleMs: last === null ? null : Math.max(0, now - last),
    pendingApprovals: staff.approvals.map((a) => ({ id: a.id, toolName: a.toolName, summary: clip(a.summary), createdAt: a.createdAt, isQuestion: Boolean(a.questions?.length) })),
    recentTools: tail('tool', ACTIVITY_RECENT_TOOLS),
    recentErrors: tail('error', ACTIVITY_RECENT_ERRORS),
    queue,
  }
}

const mins = (ms: number) => (ms < 60_000 ? '방금' : ms < 3_600_000 ? `${Math.floor(ms / 60_000)}분 전` : `${Math.floor(ms / 3_600_000)}시간 ${Math.floor((ms % 3_600_000) / 60_000)}분 전`)
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const STATUS: Record<string, string> = { idle: '대기', working: '일하는 중', waiting: '결재·답을 기다리는 중', offline: '꺼짐', error: '오류', }

/** 비서에게 줄 짧은 글 + 한 줄 판단 단서 */
export function compactStaffActivity(a: StaffActivity, now: number): string {
  const lines = [
    `## ${a.name} [${a.staffId}] — ${STATUS[a.status] ?? a.status} (${mins(now - a.statusSince)}부터)${a.activity ? ` · ${a.activity}` : ''}`,
    `- 마지막 활동: ${a.lastActivityAt === null ? '기록 없음(최근 24시간)' : `${hhmm(a.lastActivityAt)} (${mins(a.idleMs ?? 0)})`}`,
  ]
  if (a.pendingApprovals.length) lines.push('### 대기 중인 결재·질문', ...a.pendingApprovals.map((p) => `- [${p.id}] ${p.isQuestion ? '질문' : p.toolName} (${mins(now - p.createdAt)}): ${p.summary}`))
  if (a.recentTools.length) lines.push('### 최근 도구 호출', ...a.recentTools.map((t) => `- ${hhmm(t.ts)} ${t.text}`))
  if (a.recentErrors.length) lines.push('### 최근 오류', ...a.recentErrors.map((t) => `- ${hhmm(t.ts)} ${t.text}`))
  if (a.queue.length) lines.push('### 대기열 카드', ...a.queue.map((q) => `- [${q.taskId}] ${q.title}`))
  let hint: string
  if (a.pendingApprovals.length) hint = '결재·질문 대기 때문에 멈춰 있어요. 대표가 답하면 이어져요.'
  else if (a.status === 'error') hint = '오류 상태예요. 최근 오류를 확인하세요.'
  else if (a.status === 'working') hint = a.idleMs !== null && a.idleMs >= 10 * 60_000 ? '일하는 중인데 10분 넘게 활동 기록이 없어요. 오래 생각 중이거나 멈췄을 수 있어요.' : '최근에 활동이 있어 일하는 중으로 보여요.'
  else hint = '지금 일하는 중이 아니에요.'
  lines.push(`판단 단서: ${hint}`)
  return lines.join('\n')
}
