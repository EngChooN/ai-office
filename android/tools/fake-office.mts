// dev-server-v2용 가짜 사무실 — PC 화면 모바일 빌드가 그대로 그릴 수 있는 OfficeSnapshot 모양
// 데이터는 정리드의 브라우저 미리보기(app/src/renderer/mobile/preview/fakeShell.ts)와 같게 맞췄다

import { companyFromXp, DEFAULT_EQUIPMENT, DEFAULT_SETTINGS } from '../../app/src/shared/types.ts'

const now = Date.now()
const min = 60_000

const mk = (id: string, name: string, role: string, avatar: number, teamId: string | null, status: string, activity: string, extra: Record<string, unknown> = {}) => ({
  id, kind: 'hired', name, role, avatar, model: 'default',
  cwd: '/Users/me/flitto/poc/claude-office', ownCwd: '/Users/me/flitto/poc/claude-office', cwdSource: 'own',
  systemPrompt: '', approvalMode: 'ask', sessionId: 'sess', teamId, labIds: ['lab1'], refDocs: [],
  equipment: DEFAULT_EQUIPMENT, pid: null, status, activity, approvals: [] as unknown[],
  costUsd: 1.234, tokensIn: 812_000, tokensOut: 64_000, deskIndex: 0, hiredAt: now - 30 * 86_400_000,
  stats: { tasksDone: 12, toolCalls: 340, approvals: 21, xp: 520, level: 4, progress: 0.4 },
  meetingId: null, statusSince: now - 12 * min, todayDone: 3,
  ...extra,
})

export const staff = [
  mk('s1', '정리드', '팀장', 1, 't1', 'working', 'Edit'),
  mk('s2', '박패턴', 'FE 설계 (패턴·유지보수성)', 2, 't1', 'idle', '', { statusSince: now - 2 * min }),
  mk('s3', '최가독', 'FE 설계 (가독성·재활용)', 3, 't1', 'working', 'Read'),
  mk('s4', '한리뷰', '코드 리뷰어', 4, 't1', 'waiting', '결재 대기: 파일 수정', {
    approvals: [{ id: 'a1', staffId: 's4', toolName: 'Edit', summary: '파일 수정: docs/specs/remote-protocol-v2.md', createdAt: now - 8 * min }],
    statusSince: now - 8 * min,
  }),
  mk('s5', '김기획', '기획자', 5, 't2', 'idle', ''),
  mk('s6', '이디자', '디자이너', 6, 't3', 'waiting', '질문 대기', {
    approvals: [{
      id: 'q1', staffId: 's6', toolName: 'AskUserQuestion', summary: '아래 탭 순서', createdAt: now - 6 * min,
      questions: [{ question: '폰 아래 탭에 무엇을 둘까요?', header: '아래 탭', multiSelect: false, options: [{ label: '사무실·단체방·보드·결재함', description: '기획서 그대로' }, { label: '대시보드 먼저', description: '업무 모드 기준' }] }],
    }],
  }),
  mk('s7', '오큐에이', 'QA', 7, 't1', 'idle', ''),
  mk('s8', '김버전', '버전 관리', 8, 't1', 'working', 'Write'),
  mk('s9', '임안드', '안드로이드 개발자', 9, 't1', 'working', 'Bash'),
  mk('s10', '강백엔', '백엔드 개발자', 10, 't1', 'working', 'Edit'),
]

const planUsage = [
  { type: 'five_hour', percent: 42, resetsAt: now + 2 * 3600_000, status: 'allowed', updatedAt: now - 5 * min },
  { type: 'seven_day', percent: 63, resetsAt: now + 3 * 86_400_000, status: 'allowed', updatedAt: now - 5 * min },
]

export const snapshot = () => ({
  staff,
  teams: [
    { id: 't1', name: '개발팀', color: '#4a7fe0', leadId: 's1', kind: 'hired', floor: 1 },
    { id: 't2', name: '기획팀', color: '#e8925a', leadId: 's5', kind: 'hired', floor: 1 },
    { id: 't3', name: '디자인 팀', color: '#9b6ad6', leadId: 's6', kind: 'hired', floor: 1 },
  ],
  labs: [{ id: 'lab1', name: '클로드 오피스 전담 랩', color: '#58b07a', goal: '클로드 오피스를 계속해서 발전해 나가는 랩', cwd: '/Users/me/flitto/poc/claude-office', leadId: 's1', memberIds: staff.map((s) => s.id) }],
  company: companyFromXp(5200),
  runs: [],
  tasks: [
    {
      id: 'k1', title: '안드로이드 1.1: PC 화면 그대로 옮기기', detail: '', status: 'doing', assigneeId: 's1', teamId: 't1', labId: 'lab1', result: '',
      createdAt: now - 86_400_000, updatedAt: now - 10 * min,
      plan: { spec: '## 목표\nPC 앱 전체를 폰·태블릿으로', subtasks: [{ title: '프로토콜 v2', detail: '', assigneeId: 's8', assigneeName: '김버전' }, { title: '폰 배치안', detail: '', assigneeId: 's6', assigneeName: '이디자' }], status: 'waiting', feedback: '', isAggregating: false, proposedAt: now - 20 * min },
    },
    { id: 'k2', title: '폰 배치안 (PC 화면 재배치)', detail: '', status: 'doing', assigneeId: 's6', teamId: 't3', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 5 * min },
    { id: 'k3', title: 'PC 서버 v2 + SSE', detail: '', status: 'todo', assigneeId: 's10', teamId: 't1', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 3600_000 },
    { id: 'k4', title: '안드로이드 셸·브리지', detail: '', status: 'doing', assigneeId: 's9', teamId: 't1', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 3600_000 },
    { id: 'k5', title: '원격 프로토콜 v2 규격', detail: '', status: 'review', assigneeId: 's8', teamId: 't1', labId: 'lab1', result: 'remote-protocol-v2.md 작성', createdAt: now - 7200_000, updatedAt: now - 30 * min },
    { id: 'k6', title: '구조 설계: 모바일 빌드·브리지', detail: '', status: 'done', assigneeId: 's2', teamId: 't1', labId: 'lab1', result: '설계서 전달', createdAt: now - 7200_000, updatedAt: now - 40 * min },
  ],
  meetings: [],
  schedules: [],
  settings: { ...DEFAULT_SETTINGS, isOnboarded: true, tokenBudget: { day: 2_000_000, week: 10_000_000, month: 30_000_000 } },
  monthCostUsd: 31.2,
  planUsage,
  funds: 128_400_000,
  shop: { owned: {}, surfaces: {}, placed: [], gear: {} },
  claimable: 2,
})

export const chat: Record<string, unknown>[] = [
  { id: 1, ts: now - 50 * min, from: 's5', text: '안드로이드 1.1 기획서 올렸어요. **PC 앱 그대로 옮기기**가 목표예요.' },
  { id: 2, ts: now - 40 * min, from: 'me', text: '@개발팀 프로토콜 v2부터 시작해 주세요' },
  { id: 3, ts: now - 6 * min, from: 's6', text: '폰 배치안 작업 시작했어요. 아래 탭 순서 질문 하나 드렸어요.' },
]

const slip = {
  month: new Date().toISOString().slice(0, 7),
  rows: staff.slice(0, 6).map((s) => ({ staffId: s.id, name: s.name, role: s.role, avatar: s.avatar, costUsd: 3.21, tokensIn: 2_100_000, tokensOut: 180_000, tasksDone: 9 })),
  totalUsd: 31.2, budgetUsd: 50, totalTokens: 18_400_000,
  periods: [
    { period: 'day', usedTokens: 1_200_000, limitTokens: 2_000_000 },
    { period: 'week', usedTokens: 8_600_000, limitTokens: 10_000_000 },
    { period: 'month', usedTokens: 18_400_000, limitTokens: 30_000_000 },
  ],
}

/** 조회 메서드의 고정 답. 없는 메서드는 dev-server-v2가 { called } 로 답한다 */
export const reads: Record<string, (...args: any[]) => unknown> = {
  snapshot,
  chatHistory: () => chat,
  listManuals: () => [{ name: 'work-flow', description: '기획→디자인→개발→리뷰→QA', kind: 'process', scope: 'user', projectDir: null, path: '/x', body: '', steps: [] }],
  timeline: () => staff.slice(0, 5).map((s, i) => ({ id: i, staffId: s.id, ts: now - i * 7 * min, type: 'result', text: `${s.name}: 작업을 마쳤어요` })),
  getRecord: (id: string) => ({ staffId: id, logs: [{ id: 1, staffId: id, ts: now - 20 * min, type: 'instruction', text: '📱 원격 폰 배치안을 만들어 주세요' }], costUsd: 1.2, tokensIn: 800_000, tokensOut: 60_000 }),
  payslip: () => slip,
  ledger: () => [{ ts: now - 3600_000, amount: 3_000_000, kind: 'bonus', label: '업무 완료 보너스' }],
  missions: () => ({ daily: [], achievements: [] }),
  dailyReport: () => '## 오늘 한 일\n- 프로토콜 v2 규격',
  hooksStatus: () => ({ installed: false, isAskInstalled: false, port: 47823 }),
  claudeStatus: () => ({ isLoggedIn: true, email: 'me@example.com', authMethod: 'claude.ai', hasTerminalClaude: true }),
  equipmentCatalog: () => ({ mcpServers: [], skills: [] }),
  listAgentTemplates: () => [],
  missingFiles: () => [],
  workChanges: () => ({ cwd: '/Users/me/x', isGit: true, branch: 'main', files: [], diff: '', hasGh: true, ahead: 0 }),
  refreshPlanUsage: () => planUsage,
}
