// 가짜 window.office — 실제 앱 화면을 그대로 그리기 위한 고정 데이터 (설계 목업 캡처 전용)
import { companyFromXp, DEFAULT_EQUIPMENT, DEFAULT_SETTINGS, type ChatMessage, type OfficeSnapshot, type Staff } from '@shared/types'

const now = Date.now()
const min = 60_000
const p = new URLSearchParams(location.search)

const mk = (id: string, name: string, role: string, avatar: number, teamId: string | null, status: Staff['status'], activity: string, extra: Partial<Staff> = {}): Staff => ({
  id, kind: 'hired', name, role, avatar, model: 'default', cwd: '/Users/me/flitto/poc/claude-office', ownCwd: '', cwdSource: 'none', systemPrompt: '', approvalMode: 'ask', sessionId: null,
  teamId, labIds: ['lab1'], refDocs: [], equipment: DEFAULT_EQUIPMENT, pid: null, status, activity, approvals: [], costUsd: 1.234, tokensIn: 812_000, tokensOut: 64_000,
  deskIndex: 0, hiredAt: now - 30 * 86_400_000, stats: { tasksDone: 12, toolCalls: 340, approvals: 21, xp: 520, level: 4, progress: 0.4 }, meetingId: null,
  statusSince: now - 12 * min, todayDone: 3, ...extra,
})

const staff: Staff[] = [
  mk('s1', '정리드', '팀장', 1, 't1', 'working', '회의 결과 카드 정리 중'),
  mk('s2', '박패턴', 'FE 설계 (패턴·유지보수성)', 2, 't1', 'idle', ''),
  mk('s3', '최가독', 'FE 설계 (가독성·재활용)', 3, 't1', 'working', 'mobile/install.ts 작성 중'),
  mk('s4', '한리뷰', '코드 리뷰어', 4, 't1', 'waiting', '결재 대기: 파일 수정', {
    approvals: [{ id: 'a1', staffId: 's4', toolName: 'Edit', summary: '파일 수정: docs/specs/remote-protocol-v2.md', createdAt: now - 8 * min }],
    statusSince: now - 8 * min,
  }),
  mk('s5', '김기획', '기획자 (PM)', 5, 't2', 'idle', ''),
  mk('s6', '이디자', '디자이너', 6, 't3', 'waiting', '질문: 탭 순서', {
    approvals: [{ id: 'a2', staffId: 's6', toolName: 'AskUserQuestion', summary: '아래 탭 순서를 어떻게 할까요?', createdAt: now - 5 * min,
      questions: [{ question: '아래 탭 순서를 어떻게 할까요?', header: '탭', multiSelect: false, options: [{ label: '사무실 먼저', description: 'PC 사이드바와 같은 순서' }, { label: '결재함 먼저', description: '자주 쓰는 것 먼저' }] }] }],
    statusSince: now - 5 * min,
  }),
  mk('s7', '오큐에이', 'QA', 7, 't1', 'error', '에뮬레이터 연결 실패', { statusSince: now - 3 * min }),
  mk('s8', '김버전', '버전관리·빌드', 8, 't1', 'idle', ''),
  mk('s9', '임안드', '안드로이드 개발자', 9, 't1', 'working', 'WebView 브리지 작성 중'),
  mk('s10', '강백엔', '백엔드 개발자', 10, 't1', 'working', 'POST /v2/call 라우터 작성 중'),
]

const snap: OfficeSnapshot = {
  staff,
  teams: [
    { id: 't1', name: '개발팀', color: '#4a7fe0', leadId: 's1', kind: 'hired', floor: 1 },
    { id: 't2', name: '기획팀', color: '#e8925a', leadId: 's5', kind: 'hired', floor: 1 },
    { id: 't3', name: '디자인 팀', color: '#9b6ad6', leadId: 's6', kind: 'hired', floor: 2 },
  ],
  labs: [{ id: 'lab1', name: '클로드 오피스 전담 랩', color: '#58b07a', goal: '클로드 오피스를 계속해서 발전해 나가는 랩', cwd: '/Users/me/flitto/poc/claude-office', leadId: 's1', memberIds: staff.map((s) => s.id) }],
  company: companyFromXp(5200),
  runs: [],
  tasks: [
    { id: 'k1', title: '안드로이드 1.1: PC 화면 그대로 옮기기', detail: '', status: 'doing', assigneeId: 's1', teamId: 't1', labId: 'lab1', result: '', createdAt: now - 86_400_000, updatedAt: now - 10 * min,
      plan: { spec: '## 목표\nPC 앱 전체를 폰·태블릿으로', subtasks: [{ title: '프로토콜 v2', detail: '', assigneeId: 's8', assigneeName: '김버전' }, { title: '폰 배치안', detail: '', assigneeId: 's6', assigneeName: '이디자' }], status: 'waiting', feedback: '', isAggregating: false, proposedAt: now - 20 * min } },
    { id: 'k2', title: '폰 배치안 (PC 화면 재배치)', detail: '', status: 'doing', assigneeId: 's6', teamId: 't3', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 5 * min },
    { id: 'k3', title: 'PC 서버 v2 + SSE', detail: '', status: 'todo', assigneeId: 's10', teamId: 't1', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 3600_000 },
    { id: 'k4', title: '화면 모바일 빌드·어댑터', detail: '', status: 'todo', assigneeId: null, teamId: 't1', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 3600_000 },
    { id: 'k5', title: '원격 프로토콜 v2 규격', detail: '', status: 'review', assigneeId: 's8', teamId: 't1', labId: 'lab1', result: 'remote-protocol-v2.md 작성', createdAt: now - 7200_000, updatedAt: now - 30 * min },
    { id: 'k6', title: '구조 설계: 모바일 빌드·브리지', detail: '', status: 'done', assigneeId: 's2', teamId: 't1', labId: 'lab1', result: '설계서 전달', createdAt: now - 7200_000, updatedAt: now - 40 * min },
    { id: 'k7', title: '보안 리뷰 (v2)', detail: '', status: 'todo', assigneeId: 's4', teamId: 't1', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 3600_000 },
  ],
  meetings: [{ id: 'm1', topic: '클로드 오피스 안드로이드 앱 개발', participantIds: ['s1', 's5', 's6', 's8'], rounds: 2, status: 'done', messages: [{ staffId: 's5', name: '김기획', text: 'PC 앱을 그대로 옮기는 쪽으로 정리할게요.', ts: now - 86_400_000 }], summary: '- 원격 v2로 OfficeApi 전체 호출\n- 할 일: 폰 배치안', createdAt: now - 86_400_000 }],
  schedules: [{ id: 'sc1', staffId: 's1', label: '출근 브리핑', time: '09:00', weekdays: [1, 2, 3, 4, 5], instruction: '어제 한 일과 오늘 할 일을 정리해 주세요', enabled: true, lastRunDate: null }],
  settings: { ...DEFAULT_SETTINGS, isOnboarded: true, tokenBudget: { day: 2_000_000, week: 10_000_000, month: 30_000_000 }, isWorkMode: p.get('work') === '1' },
  monthCostUsd: 31.2,
  planUsage: [{ type: 'five_hour', percent: 42, resetsAt: now + 2 * 3600_000, status: 'allowed', updatedAt: now - 5 * min }, { type: 'seven_day', percent: 63, resetsAt: now + 3 * 86_400_000, status: 'allowed', updatedAt: now - 5 * min }],
  funds: 128_400_000,
  shop: { owned: {}, surfaces: {}, placed: [], gear: {} },
  claimable: 2,
}

const chat: ChatMessage[] = [
  { id: 1, ts: now - 50 * min, from: 's5', text: '안드로이드 1.1 기획서 올렸어요. **PC 앱 그대로 옮기기**가 목표예요.' },
  { id: 2, ts: now - 40 * min, from: 'me', text: '@개발팀 프로토콜 v2부터 시작해 주세요' },
  { id: 3, ts: now - 30 * min, from: 's8', text: 'remote-protocol-v2.md 작성했습니다. 분류 R 55 · S 17 · P 6 · C 2 · U 1' },
  { id: 4, ts: now - 6 * min, from: 's6', text: '폰 배치안 작업 시작했어요. 아래 탭 순서 질문 하나 드렸어요.' },
]

const slip = { month: '2026-10', rows: staff.slice(0, 6).map((s) => ({ staffId: s.id, name: s.name, role: s.role, avatar: s.avatar, costUsd: 3.21, tokensIn: 2_100_000, tokensOut: 180_000, tasksDone: 9 })), totalUsd: 31.2, budgetUsd: 50, totalTokens: 18_400_000,
  periods: [{ period: 'day', usedTokens: 1_200_000, limitTokens: 2_000_000 }, { period: 'week', usedTokens: 8_600_000, limitTokens: 10_000_000 }, { period: 'month', usedTokens: 18_400_000, limitTokens: 30_000_000 }] }

const impl: Record<string, unknown> = {
  platform: 'darwin',
  snapshot: async () => snap,
  chatHistory: async () => chat,
  listManuals: async () => [{ name: 'work-flow', description: '기획→디자인→개발→리뷰→QA', kind: 'process', scope: 'user', projectDir: null, path: '/x', body: '', steps: [] }, { name: 'fix-qa', description: 'QA 티켓 수정', kind: 'personal', scope: 'user', projectDir: null, path: '/y', body: '', steps: [] }],
  timeline: async () => staff.slice(0, 5).map((s, i) => ({ id: i, staffId: s.id, ts: now - i * 7 * min, type: 'result', text: `${s.name}: 작업을 마쳤어요` })),
  getRecord: async (id: string) => ({ staffId: id, logs: [{ id: 1, staffId: id, ts: now - 20 * min, type: 'instruction', text: '폰 배치안을 만들어 주세요' }, { id: 2, staffId: id, ts: now - 10 * min, type: 'reply', text: '기존 화면을 390폭으로 캡처해 볼게요.' }], costUsd: 1.2, tokensIn: 800_000, tokensOut: 60_000 }),
  payslip: async () => slip,
  ledger: async () => [{ ts: now - 3600_000, amount: 3_000_000, kind: 'bonus', label: '업무 완료 보너스' }],
  missions: async () => ({ daily: [], achievements: [] }),
  dailyReport: async () => '## 오늘 한 일\n- 프로토콜 v2 규격',
  hooksStatus: async () => ({ installed: false, isAskInstalled: false, port: 47823 }),
  claudeStatus: async () => ({ isLoggedIn: true, email: 'me@example.com', authMethod: 'claude.ai', hasTerminalClaude: true }),
  remoteStatus: async () => ({ isEnabled: true, isListening: true, port: 47900, host: '', connectHost: '203.0.113.10', isLanOnly: false, fingerprint: 'sha256/abc', upnp: { state: 'ok', externalAddress: '203.0.113.10', isCarrierShared: false, isDoubleNat: false }, error: null, lockedUntil: null, recentAccess: [], isTokenUsed: true, isKeyRegenerated: false, isQrReady: false }),
  equipmentCatalog: async () => ({ mcpServers: [], skills: [] }),
  listAgentTemplates: async () => [],
  missingFiles: async () => [],
  workChanges: async () => ({ cwd: '/Users/me/x', isGit: true, branch: 'main', files: [], diff: '', hasGh: true, ahead: 0 }),
  refreshPlanUsage: async () => snap.planUsage,
}

window.office = new Proxy(impl, {
  get(target, name: string) {
    if (name in target) return target[name]
    if (name.startsWith('on')) return () => () => {}
    return async () => undefined
  },
}) as never

localStorage.setItem('office:lastSeenVersion', '0.8.1')
localStorage.setItem('office:lastSeenLevel', '99')

if (p.get('shell') === 'phone') {
  await import('./harness.css')
  await import('./phone.css')
  const { createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PhoneShell } = await import('./PhoneShell')
  document.documentElement.dataset.platform = 'android'
  const sec = p.get('sec')
  const { SecretaryPage } = await import('./SecretaryMock')
  const override = sec ? () => createElement(SecretaryPage, { scene: sec as never }) : undefined
  createRoot(document.getElementById('root')!).render(createElement(PhoneShell, { showMore: p.get('more') === '1', banner: p.get('banner'), frame: p.get('frame') !== '0', override, overrideTitle: sec ? '비서' : undefined }))
} else if (p.get('sec') || p.get('quick')) {
  await import('./harness.css')
  const { createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { SecretaryDesk } = await import('./SecretaryDesk')
  document.documentElement.dataset.platform = 'darwin'
  createRoot(document.getElementById('root')!).render(createElement(SecretaryDesk, { scene: p.get('sec') ?? 'home', quick: p.get('quick') === '1' }))
} else {
  await import('/src/renderer/main.tsx')
}
const { useOffice } = await import('@/store')

// 첫 스냅샷이 들어온 뒤 보여 줄 화면을 정한다
setTimeout(() => {
  const s = useOffice.getState()
  const view = (p.get('view') ?? 'map') as never
  s.setView(view)
  if (p.get('inside') === '1') s.setInside(true)
  if (p.get('floor')) s.setViewFloor(Number(p.get('floor')))
  if (p.get('select')) s.select(p.get('select'))
  if (p.get('hire') === '1') s.setHireOpen(true)
  if (p.get('decorate') === '1') s.setDecorating(true)
}, 300)
