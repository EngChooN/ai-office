// 비서 도구가 돌려주는 글을 짧게 (QA: 질문 한 건에 12만~27만 토큰 — snapshot 60KB를 통째로 넘겼다)
// JSON 대신 필요한 칸만 한 줄씩. 질문에 맞는 부분(section)만, 기간 요약은 미리 묶어서. electron 없음 (scripts/secretary.test.mts)

import type { OfficeMethod } from '../shared/officeApiShape.ts'
import { t } from '../shared/i18n/index.ts'
import type { AutoApproveState, AutoHandled, DailyRecord, LogEntry, Manual, OfficeSnapshot, SecretaryCompare, Task } from '../shared/types.ts'

/** 도구 결과 한 번의 상한 (글자) */
export const COMPACT_MAX = 6000
const LINE_MAX = 160

const clip = (t: string, n = LINE_MAX) => {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n)}…` : one
}
const ago = (ms: number, now: number) => {
  const m = Math.max(0, Math.round((now - ms) / 60_000))
  return m < 60 ? `${m}분째` : `${Math.round(m / 60)}시간째`
}
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const STATUS: Record<string, string> = { working: '일하는 중', waiting: '확인 필요', error: '오류', idle: '쉬는 중', offline: '퇴근' }
const TASK_STATUS: Record<string, string> = { todo: '할 일', doing: '진행 중', review: '검토', done: '완료' }

export const capText = (t: string, max = COMPACT_MAX) => (t.length > max ? `${t.slice(0, max)}\n…(더 있음 — 범위를 좁혀 다시 조회하세요)` : t)

export type OverviewSection = 'all' | 'people' | 'approvals' | 'tasks' | 'org' | 'settings' | 'schedules'

/** 사무실 현황을 질문에 맞는 부분만 (기본: 사람 + 결재 대기) */
export function compactOverview(snap: OfficeSnapshot, section: OverviewSection = 'all', now = Date.now()): string {
  const hired = snap.staff.filter((s) => s.kind === 'hired')
  const team = (id: string | null) => snap.teams.find((t) => t.id === id)?.name ?? ''
  const name = (id: string | null) => (id ? (snap.staff.find((s) => s.id === id)?.name ?? '') : '')
  const out: string[] = []
  const counts = Object.entries(STATUS)
    .map(([k, label]) => [label, hired.filter((s) => s.status === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${l} ${n}`)
    .join(' · ')
  if (section === 'all' || section === 'people') {
    out.push(`## 직원 (고용 ${hired.length}명: ${counts || '없음'}${snap.staff.length > hired.length ? ` · 외부 세션 ${snap.staff.length - hired.length}` : ''})`)
    for (const s of hired) out.push(`- ${s.name} [${s.id}] ${s.role}${team(s.teamId) ? ` · ${team(s.teamId)}` : ''} · ${STATUS[s.status] ?? s.status} ${ago(s.statusSince, now)}${s.activity ? ` · ${clip(s.activity, 60)}` : ''}${s.approvals.length ? ` · 대기 ${s.approvals.length}` : ''}`)
  }
  if (section === 'all' || section === 'approvals') {
    const approvals = snap.staff.flatMap((s) => s.approvals.map((a) => ({ a, s })))
    const plans = snap.tasks.filter((t) => t.plan?.status === 'waiting')
    out.push(`## 결재 대기 ${approvals.length}건 · 기획 확인 ${plans.length}건`)
    for (const { a, s } of approvals) out.push(`- [${a.id}] ${s.name} · ${a.questions ? `질문: ${clip(a.questions.map((q) => `${q.question} (${q.options.map((o) => o.label).join('/')})`).join(' / '), 200)}` : `${a.toolName}: ${clip(a.summary, 200)}`} · ${ago(a.createdAt, now)}`)
    for (const t of plans) out.push(`- 기획 [${t.id}] ${clip(t.title, 60)} · ${name(t.assigneeId)} · 하위 ${t.plan!.subtasks.length}건`)
  }
  if (section === 'tasks') {
    const open = snap.tasks.filter((t) => t.status !== 'done').sort((a, b) => b.updatedAt - a.updatedAt)
    out.push(`## 업무 카드 (열린 것 ${open.length} · 완료 ${snap.tasks.length - open.length})`)
    for (const t of open.slice(0, 40)) out.push(`- [${t.id}] ${clip(t.title, 70)} · ${TASK_STATUS[t.status]} · ${name(t.assigneeId) || '담당 없음'}${t.plan ? ` · 기획 ${t.plan.status}${t.plan.isPaused ? '(멈춤)' : ''}` : ''}`)
  }
  if (section === 'org') {
    out.push('## 팀')
    for (const t of snap.teams.filter((x) => x.kind === 'hired')) out.push(`- ${t.name} [${t.id}] · 팀장 ${name(t.leadId) || '없음'} · ${hired.filter((s) => s.teamId === t.id).map((s) => s.name).join(', ') || '팀원 없음'}`)
    out.push('## 랩')
    for (const l of snap.labs) out.push(`- ${l.name} [${l.id}] · 리드 ${name(l.leadId) || '없음'} · 멤버 ${l.memberIds.map(name).filter(Boolean).join(', ') || '없음'} · 목표: ${clip(l.goal, 80)}${l.cwd ? ` · 폴더 ${l.cwd}` : ''}`)
  }
  if (section === 'schedules') {
    out.push(`## 예약 업무 (${snap.schedules.length}개)`)
    for (const x of snap.schedules.slice(0, 40)) out.push(`- [${x.id}] ${clip(x.label, 60)} · ${name(x.staffId) || '퇴사자'} · ${x.time} · ${weekdaysText(x.weekdays)} · ${x.enabled ? '켬' : '끔'} · 지시: ${clip(x.instruction, 100)}`)
    if (!snap.schedules.length) out.push('없어요. 새로 만들려면 saveSchedule로 제안하세요.')
  }
  if (section === 'settings') {
    const st = snap.settings
    out.push(
      '## 설정',
      `- 업무 모드 ${st.isWorkMode ? '켬' : '끔'} · 월 비용 예산 $${st.monthlyBudgetUsd} · 토큰 한도 일 ${st.tokenBudget.day} / 주 ${st.tokenBudget.week} / 월 ${st.tokenBudget.month}`,
      `- 근무시간 ${st.workHours.isEnabled ? `${st.workHours.start}–${st.workHours.end}` : '끔'} · 이번 달 비용 $${snap.monthCostUsd.toFixed(2)}`,
      `- 자동결재: ${autoText(snap.autoApprove, now)}`,
    )
  }
  return capText(out.join('\n'))
}

const DAY = ['일', '월', '화', '수', '목', '금', '토']
const weekdaysText = (days: number[]) => (days.length >= 7 ? '매일' : days.length ? [...days].sort().map((d) => DAY[d] ?? '?').join('·') : '요일 없음')

function autoText(a: AutoApproveState, now: number) {
  if (a.isActive) return `켜져 있음${a.endsAt ? ` (${Math.max(0, Math.round((a.endsAt - now) / 60_000))}분 남음)` : ''} · 대신 승인 ${a.counts.edit + a.counts.command + a.counts.other} · 대신 답함 ${a.counts.answered} · 기다리게 함 ${a.counts.waited ?? 0}`
  return a.config.mode === 'daily' ? `매일 ${a.config.start}–${a.config.end} (지금은 밖)` : '꺼짐'
}

/** 직원 한 명 자세히 — 첨삭할 업무 지침(전문)·작업 폴더·장비·결재 대기·최근 기록 */
export function compactStaffDetail(snap: OfficeSnapshot, staffId: string, record: DailyRecord | null, now = Date.now()): string {
  const s = snap.staff.find((x) => x.id === staffId)
  if (!s) return '그 직원을 찾지 못했어요.'
  const lines = [
    `## ${s.name} [${s.id}] ${s.role}`,
    `- ${STATUS[s.status] ?? s.status} ${ago(s.statusSince, now)}${s.activity ? ` · ${clip(s.activity, 80)}` : ''}`,
    `- 팀 ${snap.teams.find((t) => t.id === s.teamId)?.name ?? '없음'} · 모델 ${s.model} · 결재 방식 ${s.approvalMode === 'acceptEdits' ? '파일 수정 자율' : '모두 결재'} · 작업 폴더 ${s.cwdSource === 'none' ? '지정 없음' : s.cwd}`,
    `- 장비 (setEquipment에 그대로 넘기는 값): 연결 도구 ${(s.equipment.mcpServers ?? []).join(', ') || '없음'} · 스킬 ${s.equipment.skills === 'all' ? '전부' : s.equipment.skills.join(', ') || '없음'} · 월 예산 ${s.equipment.monthlyBudgetUsd ? `$${s.equipment.monthlyBudgetUsd}` : '제한 없음'}`,
    `- 결재 없이 쓰는 도구: ${s.equipment.allowedTools.join(', ') || '없음'} · 막는 도구: ${s.equipment.disallowedTools.join(', ') || '없음'}`,
    `- 참고 문서: ${s.refDocs?.join(', ') || '없음'}`,
    `- 오늘 완료 ${s.todayDone} · 이번 세션 비용 $${s.costUsd.toFixed(2)}`,
    '### 업무 지침 (원문 그대로)',
    s.systemPrompt || '(비어 있음)',
  ]
  if (s.approvals.length) lines.push('### 결재 대기', ...s.approvals.map((a) => `- [${a.id}] ${a.toolName}: ${clip(a.summary, 200)}`))
  if (record) lines.push('### 오늘 기록 (최근)', ...compactLogs(record.logs, 15))
  return capText(lines.join('\n'), COMPACT_MAX + 4000)
}

const LOG_LABEL: Record<string, string> = { instruction: '지시', reply: '보고', result: '완료', error: '오류', approval: '결재', status: '상태', delegate: '위임', commit: '커밋', tool: '도구' }

/** 기록은 도구 줄을 빼고 최근 것부터 n줄 */
export function compactLogs(logs: LogEntry[], n = 30) {
  return logs
    .filter((l) => l.type !== 'tool')
    .slice(-n)
    .map((l) => `- ${hhmm(l.ts)} ${LOG_LABEL[l.type] ?? l.type}: ${clip(l.text)}`)
}

export interface PeriodInput {
  since: number
  until: number
  snapshot: OfficeSnapshot
  logs: LogEntry[]
  autoLog: AutoHandled[]
}

/**
 * 기간 요약 ("밤사이 뭐 했어?", 아침 브리핑·퇴근 요약): 직원별 완료·보고·오류·결재 수, 끝낸 업무 카드,
 * 자동결재 요약(대신 승인·대신 답한 질문·기다리게 한 것), 지금 결재함에 남은 질문 — 미리 묶어서 짧게
 */
export function compactPeriod({ since, until, snapshot, logs, autoLog }: PeriodInput): string {
  const inRange = logs.filter((l) => l.ts >= since && l.ts < until)
  const name = (id: string) => snapshot.staff.find((s) => s.id === id)?.name ?? '퇴사자'
  const lines = [`## ${new Date(since).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ~ ${new Date(until).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`]
  const byStaff = new Map<string, LogEntry[]>()
  for (const l of inRange) byStaff.set(l.staffId, [...(byStaff.get(l.staffId) ?? []), l])
  lines.push(`### 직원별 (${byStaff.size}명이 움직임)`)
  for (const [id, ls] of byStaff) {
    const c = (t: string) => ls.filter((l) => l.type === t).length
    const lastResult = ls.filter((l) => l.type === 'result' || l.type === 'reply').at(-1)
    lines.push(`- ${name(id)}: 완료 ${c('result')} · 지시 ${c('instruction')} · 결재 ${c('approval')} · 오류 ${c('error')}${lastResult ? ` · 마지막 보고: ${clip(lastResult.text, 120)}` : ''}`)
  }
  const done: Task[] = snapshot.tasks.filter((t) => t.updatedAt >= since && t.updatedAt < until && (t.status === 'done' || t.status === 'review'))
  lines.push(`### 끝낸 업무 카드 ${done.length}`)
  for (const t of done.slice(0, 15)) lines.push(`- ${clip(t.title, 80)} · ${t.status === 'done' ? '완료' : '검토 대기'} · ${t.assigneeId ? name(t.assigneeId) : ''}`)
  const autos = autoLog.filter((h) => h.at >= since && h.at < until)
  const approved = autos.filter((h) => h.kind === 'approval')
  const answered = autos.filter((h) => h.kind === 'answer')
  const cat = (k: string) => approved.filter((h) => h.category === k).length
  lines.push(`### 자동결재: 대신 승인 ${approved.length}건(수정 ${cat('edit')} · 명령 ${cat('command')} · 기타 ${cat('other')}) · 대신 답한 질문 ${answered.length}건 · 지금 ${autoText(snapshot.autoApprove, until)}`)
  for (const h of answered.slice(-10)) lines.push(`- ${hhmm(h.at)} ${h.staffName}: ${clip(h.summary, 160)}`)
  const waitingQuestions = snapshot.staff.flatMap((s) => s.approvals.filter((a) => a.questions).map((a) => ({ a, s })))
  const waitingOther = snapshot.staff.reduce((n, s) => n + s.approvals.filter((a) => !a.questions).length, 0)
  lines.push(`### 지금 결재함에 남은 것: 질문 ${waitingQuestions.length}건 · 결재 ${waitingOther}건`)
  for (const { a, s } of waitingQuestions) lines.push(`- [${a.id}] ${s.name}: ${clip(a.questions!.map((q) => q.question).join(' / '), 160)} (${hhmm(a.createdAt)}부터)`)
  return capText(lines.join('\n'))
}

/** 그 밖의 조회 결과: 긴 글자는 자르고 전체 길이도 상한 */
export function compactGeneric(v: unknown): string {
  const text = JSON.stringify(v ?? null, (k, x) => (k === 'secretary' || k === 'layout' || k === 'attachments' ? undefined : typeof x === 'string' && x.length > 400 ? `${x.slice(0, 400)}…` : x))
  return capText(text)
}

/** 사용법 문서에서 찾을 말이 든 줄만 (없으면 목차) — SPEC 통째(수만 자)를 넘기지 않는다 */
export function guideLines(body: string, query?: string): string {
  const lines = body.split('\n')
  const words = (query ?? '').split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1)
  if (words.length === 0) return capText(lines.filter((l) => /^#{1,3} /.test(l) || /^\| \d+ \| /.test(l)).map((l) => (l.startsWith('|') ? l.split('|').slice(1, 3).join('|').trim() : l)).join('\n'))
  const scored = lines.map((l, i) => ({ i, n: words.filter((w) => l.includes(w)).length })).filter((x) => x.n > 0)
  scored.sort((a, b) => b.n - a.n || a.i - b.i)
  const picked = scored.slice(0, 12).sort((a, b) => a.i - b.i)
  return capText(picked.map((x) => (lines[x.i].length > 700 ? `${lines[x.i].slice(0, 700)}…` : lines[x.i])).join('\n') || '찾는 말이 든 줄이 없어요. 다른 말로 찾아 보세요.')
}

/** 매뉴얼 한 개 전문 — 본문과 프로세스 단계를 그대로 (합치기·고치기에 쓴다). 길면 잘라 알린다 */
export const MANUAL_BODY_MAX = 20_000
export function compactManual(m: Manual): string {
  const body = m.body.length > MANUAL_BODY_MAX ? `${m.body.slice(0, MANUAL_BODY_MAX)}\n…(본문이 길어 ${MANUAL_BODY_MAX}자까지만 보여 드렸어요)` : m.body
  const lines = [`## ${m.name} (${m.kind === 'process' ? '프로세스' : '개인'}, ${m.scope === 'user' ? '내 매뉴얼' : `프로젝트 ${m.projectDir ?? ''}`})`, `- 경로(previousPath·deleteManual에 쓰는 값): ${m.path}`, `- 설명: ${m.description}`, '### 본문 (원문 그대로)', body || '(비어 있음)']
  if (m.steps.length) {
    lines.push('### 프로세스 단계')
    for (const [i, st] of m.steps.entries()) lines.push(`${i + 1}. [${st.id}] ${st.title} · 담당 ${st.role}${st.needsMyCheck ? ' · 내 확인' : ''}${st.onRevise ? ` · 되돌림→${st.onRevise}(최대 ${st.maxLoops}번)` : ''}\n   ${st.instruction}`)
  }
  return lines.join('\n')
}

/** 확인 카드의 글 비교를 실제 값으로 만든다 — 모델이 쓴 글이 아니라 앱이 가진 지금 글 ↔ 바꿀 글 */
export function compareSteps(snap: OfficeSnapshot, manuals: Manual[], steps: { method: OfficeMethod; args: unknown[] }[]): SecretaryCompare[] {
  const text = (label: string, before: string | undefined, after: unknown): SecretaryCompare[] => (typeof after === 'string' ? [{ kind: 'text', label, before: before ?? '', after }] : [])
  return steps.flatMap(({ method, args }) => {
    const [a0, a1] = args as [unknown, Record<string, unknown> | string | undefined]
    const patch = typeof a1 === 'object' && a1 ? a1 : {}
    if (method === 'saveManual' && a0 && typeof a0 === 'object') {
      const m = a0 as { name?: unknown; scope?: unknown; body?: unknown }
      // 고치기·이름 바꾸기는 previousPath, 같은 이름·범위로 덮어쓰기는 그 매뉴얼이 원문
      const before = typeof a1 === 'string' ? manuals.find((x) => x.path === a1) : manuals.find((x) => x.name === m.name && x.scope === m.scope)
      return text(t('secretary.compareLabel.manual', { name: String(m.name ?? '') }), before?.body, m.body)
    }
    if (method === 'deleteManual' && typeof a0 === 'string') {
      const gone = manuals.find((x) => x.path === a0)
      return gone ? text(t('secretary.compareLabel.manualDelete', { name: gone.name }), gone.body, '') : []
    }
    if (method === 'updateStaff') {
      const who = snap.staff.find((x) => x.id === a0)
      return who ? text(t('secretary.compareLabel.staffPrompt', { name: who.name }), who.systemPrompt, patch.systemPrompt) : []
    }
    if (method === 'updateTask') {
      const task = snap.tasks.find((x) => x.id === a0)
      return task ? text(`업무 카드 ${task.title} 설명`, task.detail, patch.detail) : []
    }
    if (method === 'updateLab') {
      const lab = snap.labs.find((x) => x.id === a0)
      return lab ? text(`${lab.name} 목표`, lab.goal, patch.goal) : []
    }
    return []
  })
}
