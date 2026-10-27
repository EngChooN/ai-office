// 개발 미리보기 전용 가짜 안드로이드 셸: OfficeBridge 계약(docs/specs/android-bridge.md)대로 답하고, 사무실은 고정 데이터
// 실제 어댑터(remoteOffice.ts)·폰 틀을 그대로 거치므로 pc_only·confirm_required·첨부 올리기도 브라우저에서 확인할 수 있다
// 앱(dist-mobile)에는 들어가지 않는다 — mobile-preview.html만 이 파일을 쓴다
// 주소 쿼리: view=board · select=s4 · hire=1 · more=1 · banner=reconnecting|closed · work=1 · pc=old(hello·칸 배치를 모르는 예전 PC) · decor=1(꾸미기 서랍에 가구, 놓기·옮기기·넣기 응답) · xp=28000(회사 경험치 — 개편 안내 확인용)

import { APP_VERSION } from '@/lib/changelog'
import { companyFromXp, DEFAULT_EQUIPMENT, DEFAULT_SETTINGS, type ChatMessage, type OfficeSnapshot, type Staff } from '@shared/types'
import type { GridItem, SeatSetPart } from '@shared/iso/furniture'
import type { KnowledgeInput } from '@shared/knowledge'
import { LANGS, type Lang } from '@shared/i18n'
import { DEMO_CHAT, DEMO_LAB, DEMO_LIVE, DEMO_MEETING, DEMO_STAFF, DEMO_TASKS, DEMO_TEAMS } from './demoData'

// 미리보기도 휴대폰처럼 손가락 기기로 친다 (단축키 문구·Enter 줄바꿈 확인용)
const realMatchMedia = window.matchMedia.bind(window)
window.matchMedia = (query: string) => {
  const m = realMatchMedia(query)
  if (query.includes('pointer: coarse')) Object.defineProperty(m, 'matches', { value: true })
  return m
}

const now = Date.now()
const min = 60_000
const params = new URLSearchParams(location.search)

const mk = (id: string, name: string, role: string, avatar: number, teamId: string | null, status: Staff['status'], activity: string, extra: Partial<Staff> = {}): Staff => ({
  id,
  kind: 'hired',
  name,
  role,
  avatar,
  model: 'default',
  cwd: '/Users/me/flitto/poc/claude-office',
  ownCwd: '/Users/me/flitto/poc/claude-office',
  cwdSource: 'own',
  systemPrompt: '',
  approvalMode: 'ask',
  sessionId: 'sess',
  teamId,
  labIds: ['lab1'],
  refDocs: [],
  equipment: DEFAULT_EQUIPMENT,
  pid: null,
  status,
  activity,
  approvals: [],
  costUsd: 1.234,
  tokensIn: 812_000,
  tokensOut: 64_000,
  deskIndex: 0,
  hiredAt: now - 30 * 86_400_000,
  stats: { tasksDone: 12, toolCalls: 340, approvals: 21, xp: 520, level: 4, progress: 0.4 },
  meetingId: null,
  statusSince: now - 12 * min,
  todayDone: 3,
  ...extra,
})

const staff: Staff[] = [
  mk('s1', '정리드', '팀장', 1, 't1', 'working', 'Edit'),
  mk('s2', '박패턴', 'FE 설계 (패턴·유지보수성)', 2, 't1', 'idle', '', { cwd: '/Users/me/flitto/web-flitto', ownCwd: '/Users/me/flitto/web-flitto', statusSince: now - 2 * min }),
  mk('s3', '최가독', 'FE 설계 (가독성·재활용)', 3, 't1', 'working', 'Read'),
  mk('s4', '한리뷰', '코드 리뷰어', 4, 't1', 'waiting', '결재 대기: 파일 수정', {
    approvals: [{ id: 'a1', staffId: 's4', toolName: 'Edit', summary: '파일 수정: docs/specs/remote-protocol-v2.md', createdAt: now - 8 * min }],
    statusSince: now - 8 * min,
  }),
  mk('s5', '김기획', '기획자 (PM)', 5, 't2', 'idle', ''),
  mk('s6', '이디자', '디자이너', 6, 't3', 'waiting', '질문: 탭 순서', {
    approvals: [
      {
        id: 'a2',
        staffId: 's6',
        toolName: 'AskUserQuestion',
        summary: '아래 탭 순서를 어떻게 할까요?',
        createdAt: now - 5 * min,
        questions: [
          {
            question: '아래 탭 순서를 어떻게 할까요?',
            header: '탭',
            multiSelect: false,
            options: [
              { label: '사무실 먼저', description: 'PC 사이드바와 같은 순서' },
              { label: '결재함 먼저', description: '자주 쓰는 것 먼저' },
            ],
          },
        ],
      },
    ],
    statusSince: now - 5 * min,
  }),
  mk('s7', '오큐에이', 'QA', 7, 't1', 'error', '에뮬레이터 연결 실패', { statusSince: now - 3 * min }),
  mk('s8', '김버전', '버전관리·빌드', 8, 't1', 'idle', ''),
  mk('s9', '임안드', '안드로이드 개발자', 9, 't1', 'working', 'Bash'),
  mk('s10', '강백엔', '백엔드 개발자', 10, 't1', 'working', 'Edit'),
]

const snapshot = {
  staff,
  teams: [
    { id: 't1', name: '개발팀', color: '#4a7fe0', leadId: 's1', kind: 'hired', floor: 1 },
    // 층을 정하지 않은 팀은 레벨 층수에 나뉜다 (teamFloors)
    { id: 't2', name: '기획팀', color: '#e8925a', leadId: 's5', kind: 'hired' },
    { id: 't3', name: '디자인 팀', color: '#9b6ad6', leadId: 's6', kind: 'hired' },
  ],
  labs: [{ id: 'lab1', name: '클로드 오피스 전담 랩', color: '#58b07a', goal: '클로드 오피스를 계속해서 발전해 나가는 랩', cwd: '/Users/me/flitto/poc/claude-office', leadId: 's1', memberIds: staff.map((s) => s.id) }],
  company: companyFromXp(Number(params.get('xp')) || 5200),
  runs: [],
  tasks: [
    {
      id: 'k1',
      title: '안드로이드 1.1: PC 화면 그대로 옮기기',
      detail: '',
      status: 'doing',
      assigneeId: 's1',
      teamId: 't1',
      labId: 'lab1',
      result: '',
      createdAt: now - 86_400_000,
      updatedAt: now - 10 * min,
      plan: {
        spec: '## 목표\nPC 앱 전체를 폰·태블릿으로',
        subtasks: [
          { title: '프로토콜 v2', detail: '', assigneeId: 's8', assigneeName: '김버전' },
          { title: '폰 배치안', detail: '', assigneeId: 's6', assigneeName: '이디자' },
        ],
        status: 'waiting',
        feedback: '',
        isAggregating: false,
        proposedAt: now - 20 * min,
      },
    },
    { id: 'k2', title: '폰 배치안 (PC 화면 재배치)', detail: '', status: 'doing', assigneeId: 's6', teamId: 't3', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 5 * min },
    { id: 'k3', title: 'PC 서버 v2 + SSE', detail: '', status: 'todo', assigneeId: 's10', teamId: 't1', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 3600_000 },
    { id: 'k4', title: '화면 모바일 빌드·어댑터', detail: '', status: 'todo', assigneeId: null, teamId: 't1', labId: 'lab1', result: '', createdAt: now - 3600_000, updatedAt: now - 3600_000 },
    { id: 'k5', title: '원격 프로토콜 v2 규격', detail: '', status: 'review', assigneeId: 's8', teamId: 't1', labId: 'lab1', result: 'remote-protocol-v2.md 작성', createdAt: now - 7200_000, updatedAt: now - 30 * min },
    { id: 'k6', title: '구조 설계: 모바일 빌드·브리지', detail: '', status: 'done', assigneeId: 's2', teamId: 't1', labId: 'lab1', result: '설계서 전달', createdAt: now - 7200_000, updatedAt: now - 40 * min },
  ],
  meetings: [
    {
      id: 'm1',
      topic: '클로드 오피스 안드로이드 앱 개발',
      participantIds: ['s1', 's5', 's6', 's8'],
      rounds: 2,
      status: 'done',
      messages: [{ staffId: 's5', name: '김기획', text: 'PC 앱을 그대로 옮기는 쪽으로 정리할게요.', ts: now - 86_400_000 }],
      summary: '- 원격 v2로 OfficeApi 전체 호출\n- 할 일: 폰 배치안',
      createdAt: now - 86_400_000,
      // 결정 카드 미리보기: 직접·위임·옛 위임(결정자 기록 없음)·회의 끝내기
      decisions: [
        { id: 'd1', askedBy: 's5', askedByName: '김기획', question: '폰 앱 첫 배포는 사내 테스트용 APK로만 할까요?', options: ['APK만', '스토어 비공개 트랙'], answer: 'APK만', kind: 'direct', decidedById: 'me', decidedByName: '대표', choice: 'APK만', decidedAt: now - 86_000_000, ts: now - 86_100_000 },
        { id: 'd2', askedBy: 's6', askedByName: '이디자', question: '폰 배치에서 하단 탭을 몇 개로 둘까요? 지금 PC 사이드바 메뉴는 9개인데, 폰에서는 자주 쓰는 4개(대시보드·결재함·단체방·업무 보드)만 탭에 두고 나머지는 "더 보기" 시트로 옮기는 안과, 5개(회의실 추가)로 두는 안이 있어요. 회의실은 주 1~2회 쓰지만 결정 요청이 오면 바로 들어가야 해서 고민입니다.', options: ['4개', '5개'], answer: '', kind: 'delegated', decidedById: 's1', decidedByName: '정리드', choice: '4개', reason: '결정 요청은 결재함에서 바로 답할 수 있어 회의실 탭이 없어도 된다', decidedAt: now - 85_900_000, ts: now - 86_050_000 },
        { id: 'd3', askedBy: 's8', askedByName: '강백엔', question: '원격 v2 서버는 PC 앱이 켜질 때 항상 열어 둘까요, 대표가 켰을 때만 열까요? 항상 열면 폰 연결이 바로 되지만 같은 네트워크의 다른 기기에서도 포트가 보입니다.', options: [], answer: '', ts: now - 86_000_000 },
        { id: 'd4', askedBy: 's5', askedByName: '김기획', question: '아이콘은 PC와 같게 할까요?', options: ['같게', '따로'], answer: '', endedByMeeting: true, ts: now - 85_800_000 },
      ],
    },
    {
      id: 'm2',
      topic: '회의·협업 흐름 개선',
      participantIds: ['s1', 's5', 's6'],
      rounds: 2,
      status: 'waiting',
      messages: [{ staffId: 's6', name: '이디자', text: '결정 카드 색을 상태별로 나눴어요. 하나만 정해 주세요.', ts: now - 3 * min }],
      summary: '',
      createdAt: now - 10 * min,
      decisions: [
        { id: 'd5', askedBy: 's6', askedByName: '이디자', question: '답하기 전 결정도 2줄로 접을까요? 접으면 결재함이 짧아지지만, 대표가 질문 전문을 안 보고 답할 수 있어요. 펼친 채로 두면 길어도 한 번에 읽고 답할 수 있습니다. 답한 결정은 어느 쪽이든 2줄로 접어요.', options: ['펼친 채로', '접기'], answer: null, ts: now - 2 * min },
      ],
    },
  ],
  schedules: [{ id: 'sc1', staffId: 's1', label: '출근 브리핑', time: '09:00', weekdays: [1, 2, 3, 4, 5], instruction: '어제 한 일과 오늘 할 일을 정리해 주세요', enabled: true, lastRunDate: null }],
  settings: { ...DEFAULT_SETTINGS, isOnboarded: true, tokenBudget: { day: 2_000_000, week: 10_000_000, month: 30_000_000 }, isWorkMode: params.get('work') === '1' },
  monthCostUsd: 31.2,
  planUsage: [
    { type: 'five_hour', percent: 42, resetsAt: now + 2 * 3600_000, status: 'allowed', updatedAt: now - 5 * min },
    { type: 'seven_day', percent: 63, resetsAt: now + 3 * 86_400_000, status: 'allowed', updatedAt: now - 5 * min },
  ],
  funds: 128_400_000,
  shop:
    params.get('decor') === '1'
      ? {
          owned: { 'prop-printer': 1, 'prop-plant': 2, desk: 2, chair: 3, 'lv-folding-desk': 4, 'lv-folding-chair': 4, 'lv-fridge': 1, 'sofa-green': 1, bookshelf: 2, 'rug-round': 1, foosball: 1, 'beanbag-blue': 2, aquarium: 1 },
          surfaces: {},
          placed: [],
          grid: [
            { uid: 'g1', itemId: 'prop-printer', floor: 1, gx: 0, gy: 5, rot: 0 },
            { uid: 'g2', itemId: 'prop-plant', floor: 1, gx: 0, gy: 9, rot: 0 },
            { uid: 'g3', itemId: 'sofa-green', floor: 1, gx: 2, gy: 10, rot: 0 },
            { uid: 'g4', itemId: 'aquarium', floor: 1, gx: 7, gy: 10, rot: 0 },
          ],
          gear: {},
          schema: 2,
        }
      : { owned: {}, surfaces: {}, placed: [], grid: [], gear: {} },
  claimable: 2,
  // auto=1: 자동결재 중 (2시간 30분 남음)
  autoApprove:
    params.get('auto') === '1'
      ? { config: { mode: 'hours', until: now + 150 * min }, isActive: true, endsAt: now + 150 * min, startsAt: null, counts: { edit: 3, command: 2, other: 0, answered: 1 } }
      : { config: { mode: 'off' }, isActive: false, endsAt: null, startsAt: null, counts: { edit: 0, command: 0, other: 0, answered: 0 } },
  // 비서 화면 미리보기 (확인 카드·첨삭 카드)
  secretary: {
    isBusy: false,
    activity: '',
    usageTodayTokens: 48_300,
    isLimited: false,
    messages: [
      { id: 1, ts: now - 4 * min, role: 'me', text: '개발팀 만들고 프론트 개발자 한 명 뽑아서 넣어 줘' },
      {
        id: 2,
        ts: now - 4 * min,
        role: 'secretary',
        text: '',
        card: {
          id: 'c1',
          kind: 'confirm',
          title: '이렇게 할까요?',
          risk: 'normal',
          status: 'pending',
          createdAt: now - 60_000,
          warnings: ['작업 폴더는 "지정 없음"이에요. 지시한 프로젝트로 가서 일해요.'],
          steps: [
            { method: 'createTeam', label: '팀 만들기 — 개발팀', detail: '이름: 개발팀', args: ['개발팀', '#4a7fe0'], status: 'pending', editable: { 이름: '개발팀' } },
            { method: 'hire', label: '직원 고용 — 김프론트', detail: '직무: 프론트엔드 개발 · 팀: 1번에서 만든 것 · 작업 폴더: 지정 없음', args: [{}], status: 'pending', editable: { 이름: '김프론트', 직무: '프론트엔드 개발', '작업 폴더': '' } },
          ],
        },
      },
      { id: 3, ts: now - 4 * min, role: 'secretary', text: '두 단계를 확인 카드로 만들었어요. 이렇게 할까요? [실행]을 눌러야 진행돼요.\n\n[조직도 열기](#view=org)', tokens: 21_400 },
      { id: 4, ts: now - 2 * min, role: 'me', text: '오큐에이 업무 지침 좀 다듬어 줘' },
      {
        id: 5,
        ts: now - 2 * min,
        role: 'secretary',
        text: '',
        card: {
          id: 'c2',
          kind: 'edit',
          title: '오큐에이 업무 지침 다듬기',
          risk: 'normal',
          status: 'pending',
          createdAt: now - 60_000,
          warnings: [],
          steps: [{ method: 'updateStaff', label: '직원 정보 바꾸기 — 오큐에이 업무 지침', detail: '', args: [], status: 'pending' }],
          edit: { targetLabel: '오큐에이 업무 지침', original: 'qa를 한다.\n버그 찾으면 보고 한다.\n보고는 너무 길지 않게.', revised: '당신은 QA 담당이에요.\n버그를 찾으면 재현 순서와 함께 보고해요.\n보고는 세 줄 안으로 써요.', reasons: ['역할을 먼저 밝혔어요', '재현 순서를 넣었어요', '보고 길이를 정했어요'] },
        },
      },
    ],
  },
} as unknown as OfficeSnapshot

const chat: ChatMessage[] = [
  { id: 1, ts: now - 50 * min, from: 's5', text: '안드로이드 1.1 기획서 올렸어요. **PC 앱 그대로 옮기기**가 목표예요.' },
  { id: 2, ts: now - 40 * min, from: 'me', text: '@개발팀 프로토콜 v2부터 시작해 주세요' },
  // 스크립트·위험한 링크가 섞인 보고도 글자로만 보여야 한다 (XSS 확인용)
  { id: 3, ts: now - 30 * min, from: 's8', text: '규격 정리했습니다 <script>OfficeBridge.postMessage("x")</script> <img src=x onerror=alert(1)> [링크](javascript:alert(1))' },
  { id: 4, ts: now - 6 * min, from: 's6', text: '폰 배치안 작업 시작했어요. 아래 탭 순서 질문 하나 드렸어요.' },
] as ChatMessage[]

const remoteStatus = {
  isEnabled: true,
  isListening: true,
  port: 47900,
  host: '',
  connectHost: '203.0.113.10',
  isLanOnly: false,
  lanOnly: false,
  isLanNoticePending: false,
  fingerprint: 'sha256/abc',
  upnp: { state: 'ok', externalAddress: '203.0.113.10', isCarrierShared: false, isDoubleNat: false },
  error: null,
  lockedUntil: null,
  recentAccess: [],
  isTokenUsed: true,
  isKeyRegenerated: false,
  isFullAccess: true,
  isQrReady: false,
}

const slip = {
  month: new Date().toISOString().slice(0, 7),
  rows: staff.slice(0, 6).map((s) => ({ staffId: s.id, name: s.name, role: s.role, avatar: s.avatar, costUsd: 3.21, tokensIn: 2_100_000, tokensOut: 180_000, tasksDone: 9 })),
  totalUsd: 31.2,
  budgetUsd: 50,
  totalTokens: 18_400_000,
  periods: [
    { period: 'day', usedTokens: 1_200_000, limitTokens: 2_000_000 },
    { period: 'week', usedTokens: 8_600_000, limitTokens: 10_000_000 },
    { period: 'month', usedTokens: 18_400_000, limitTokens: 30_000_000 },
  ],
}

// demo=ko|en|ja|zh: 소개 사이트 스크린샷용 가상 회사로 바꾼다 (demoData.ts)
const demo = params.get('demo') as Lang | null
if (demo && LANGS.includes(demo)) {
  const nameOf = (id: string) => DEMO_STAFF.find((s) => s.id === id)?.name[demo] ?? ''
  staff.splice(
    0,
    staff.length,
    ...DEMO_STAFF.map((s) => {
      const live = DEMO_LIVE[s.id]
      const a = live.approval
      return mk(s.id, s.name[demo], s.role[demo], s.avatar, s.teamId, live.status, a ? a.summary[demo] : (live.activity ?? ''), {
        cwd: DEMO_LAB.cwd,
        ownCwd: DEMO_LAB.cwd,
        labIds: [DEMO_LAB.id],
        statusSince: now - 4 * min,
        approvals: a
          ? [{ id: `a-${s.id}`, staffId: s.id, toolName: a.toolName, summary: a.summary[demo], createdAt: now - 4 * min, ...(a.options ? { questions: [{ question: a.summary[demo], header: '', multiSelect: false, options: a.options[demo].map((label) => ({ label, description: '' })) }] } : {}) }]
          : [],
      })
    }),
  )
  snapshot.teams = DEMO_TEAMS.map((t) => ({ id: t.id, name: t.name[demo], color: t.color, leadId: t.leadId, kind: 'hired' })) as unknown as OfficeSnapshot['teams']
  snapshot.labs = [{ id: DEMO_LAB.id, name: DEMO_LAB.name[demo], color: DEMO_LAB.color, goal: DEMO_LAB.goal[demo], cwd: DEMO_LAB.cwd, leadId: DEMO_LAB.leadId, memberIds: staff.map((s) => s.id) }]
  snapshot.tasks = DEMO_TASKS.map((t) => ({
    id: t.id,
    title: t.title[demo],
    detail: '',
    status: t.status,
    assigneeId: t.assigneeId,
    teamId: t.teamId,
    labId: DEMO_LAB.id,
    result: t.result?.[demo] ?? '',
    createdAt: now - (t.ago + 60) * min,
    updatedAt: now - t.ago * min,
    plan: t.plan
      ? { spec: t.plan.spec[demo], subtasks: t.plan.subtasks.map((p) => ({ title: p.title[demo], detail: '', assigneeId: p.assigneeId, assigneeName: nameOf(p.assigneeId) })), status: 'waiting', feedback: '', isAggregating: false, proposedAt: now - t.ago * min }
      : null,
  }))
  const m = DEMO_MEETING
  snapshot.meetings = [
    {
      id: m.id,
      topic: m.topic[demo],
      participantIds: m.participantIds,
      rounds: 2,
      status: 'waiting',
      messages: m.lines.map((l) => ({ staffId: l.from, name: nameOf(l.from), text: l.text[demo], ts: now - l.ago * min })),
      summary: '',
      createdAt: now - 25 * min,
      decisions: [{ id: 'dd1', askedBy: m.decision.askedBy, askedByName: nameOf(m.decision.askedBy), question: m.decision.question[demo], options: m.decision.options[demo], answer: null, ts: now - 10 * min }],
    },
  ] as unknown as OfficeSnapshot['meetings']
  snapshot.schedules = []
  snapshot.settings = { ...snapshot.settings, language: demo }
  snapshot.secretary = { ...snapshot.secretary!, messages: [] }
  chat.splice(0, chat.length, ...DEMO_CHAT.map((c, i) => ({ id: i + 1, ts: now - c.ago * min, from: c.from, text: c.text[demo] }) as ChatMessage))
  slip.rows = staff.slice(0, 6).map((s) => ({ staffId: s.id, name: s.name, role: s.role, avatar: s.avatar, costUsd: 3.21, tokensIn: 2_100_000, tokensOut: 180_000, tasksDone: 9 }))
}

const impl: Record<string, (...args: never[]) => unknown> = {
  snapshot: () => snapshot,
  chatHistory: () => chat,
  remoteStatus: () => remoteStatus,
  listManuals: () => [
    { name: 'work-flow', description: '기획→디자인→개발→리뷰→QA', kind: 'process', scope: 'user', projectDir: null, path: '/x', body: '', steps: [] },
    { name: 'fix-qa', description: 'QA 티켓 수정', kind: 'personal', scope: 'user', projectDir: null, path: '/y', body: '', steps: [] },
  ],
  timeline: () => staff.slice(0, 5).map((s, i) => ({ id: i, staffId: s.id, ts: now - i * 7 * min, type: 'result', text: `${s.name}: 작업을 마쳤어요` })),
  getRecord: (id: string) => ({
    staffId: id,
    logs: [
      { id: 1, staffId: id, ts: now - 20 * min, type: 'instruction', text: '📱 원격 폰 배치안을 만들어 주세요' },
      { id: 2, staffId: id, ts: now - 10 * min, type: 'reply', text: '기존 화면을 390폭으로 캡처해 볼게요.\n\n| 화면 | 상태 |\n|---|---|\n| 보드 | 완료 |' },
    ],
    costUsd: 1.2,
    tokensIn: 800_000,
    tokensOut: 60_000,
  }),
  payslip: () => slip,
  ledger: () => [{ ts: now - 3600_000, amount: 3_000_000, kind: 'bonus', label: '업무 완료 보너스' }],
  missions: () => ({ daily: [], achievements: [] }),
  dailyReport: () => '## 오늘 한 일\n- 프로토콜 v2 규격',
  hooksStatus: () => ({ installed: false, isAskInstalled: false, port: 47823 }),
  claudeStatus: () => ({ isLoggedIn: true, email: 'me@example.com', authMethod: 'claude.ai', hasTerminalClaude: true }),
  equipmentCatalog: () => ({ mcpServers: [], skills: [] }),
  refreshEquipment: () => ({ mcpServers: [], skills: [] }),
  customMcpList: () => [],
  listAgentTemplates: () => [],
  missingFiles: () => [],
  workRevertInfo: () => ({ available: false, startedAt: 0, files: [], skipped: [] }),
  workChanges: () => ({ cwd: '/Users/me/x', isGit: true, branch: 'main', files: [], diff: '', hasGh: true, ahead: 0 }),
  refreshPlanUsage: () => snapshot.planUsage,
  releasePlanHold: async () => {},
  // decor=1: 칸 배치를 고정 데이터에 바로 반영하고 snapshot 이벤트로 알린다 (PC 메인 검사는 하지 않음)
  placeGridItem: (itemId: string, floor: number, gx: number, gy: number, rot: number) => {
    const uid = crypto.randomUUID()
    setGrid([...snapshot.shop.grid, { uid, itemId, floor, gx, gy, rot: rot as 0 }])
    return { uid }
  },
  moveGridItem: (uid: string, floor: number, gx: number, gy: number, rot: number) => setGrid(snapshot.shop.grid.map((g) => (g.uid === uid ? { ...g, floor, gx, gy, rot: rot as 0 } : g))),
  setGridItemOn: (uid: string, isOn: boolean) => setGrid(snapshot.shop.grid.map((g) => (g.uid === uid ? { ...g, isOn } : g))),
  stowAllGrid: (floor: number, keepSeats: boolean) => {
    const out = snapshot.shop.grid.filter((g) => (floor === 0 || g.floor === floor) && !(keepSeats && /desk|chair/.test(g.itemId)))
    setGrid(snapshot.shop.grid.filter((g) => !out.includes(g)))
    return out
  },
  restoreGridItems: (items: GridItem[]) => setGrid([...snapshot.shop.grid, ...items.filter((i) => !snapshot.shop.grid.some((g) => g.uid === i.uid))]),
  moveSeatSet: (floor: number, parts: SeatSetPart[]) =>
    setGrid([...snapshot.shop.grid.filter((g) => !parts.some((p) => p.uid === g.uid)), ...parts.map((p) => ({ uid: p.toUid ?? p.uid, itemId: snapshot.shop.grid.find((g) => g.uid === p.uid)?.itemId ?? p.itemId, floor, gx: p.gx, gy: p.gy, rot: p.rot }))]),
  storeItem: (uid: string) => setGrid(snapshot.shop.grid.filter((g) => g.uid !== uid)),
  approveAlways: async () => true,
  approvalRules: async () => [],
  deleteApprovalRule: async () => {},
  knowledgeList: async () => [],
  saveKnowledge: async (input: KnowledgeInput) => ({ id: input.id ?? 'k1', kind: input.kind, title: input.title, body: input.body, tags: input.tags ?? [], staffId: null, staffName: '', docPath: input.docPath ?? null, createdAt: now, updatedAt: now }),
  deleteKnowledge: async () => {},
  galleryList: async () => [],
  deleteGalleryEntry: async () => {},
  runDemoDayNow: async () => {},
  demoReact: async () => {},
  autoApproveLog: () =>
    params.get('auto') === '1'
      ? [
          { id: 'h1', at: now - 40 * min, staffId: 's3', staffName: '최가독', kind: 'approval', toolName: 'Edit', summary: 'src/renderer/layout/PhoneShell.tsx', category: 'edit' },
          { id: 'h2', at: now - 32 * min, staffId: 's9', staffName: '임안드', kind: 'approval', toolName: 'Bash', summary: './gradlew assembleDebug', category: 'command' },
          { id: 'h3', at: now - 20 * min, staffId: 's6', staffName: '이디자', kind: 'answer', toolName: 'AskUserQuestion', summary: '아래 탭 순서를 어떻게 할까요? → 사무실 먼저 (근거: 폰 배치안 2-2절)', category: 'other' },
        ]
      : [],
}

// PC 서버(v2 분류표)와 같은 응답
const PC_ONLY: Record<string, string> = { pickFolder: 'enter_path', pickFiles: 'enter_path', openAttachment: 'download_file', resumeInTerminal: 'open_on_pc', openClaudeLogin: 'open_on_pc', remoteQr: 'open_on_pc', setRemoteFullAccess: 'open_on_pc' }

function setGrid(grid: OfficeSnapshot['shop']['grid']) {
  snapshot.shop = { ...snapshot.shop, grid }
  setTimeout(() => port.onmessage?.({ data: JSON.stringify({ type: 'event', name: 'snapshot', data: { ...snapshot } }) }), 60)
}

type Port = { postMessage(text: string): void; onmessage: ((e: { data: string }) => void) | null }
const port: Port = {
  onmessage: null,
  postMessage(text) {
    const msg = JSON.parse(text)
    const reply = (m: unknown) => setTimeout(() => port.onmessage?.({ data: JSON.stringify(m) }), 30)
    const ok = (result: unknown) => reply({ type: 'result', id: msg.id, ok: true, result: result === undefined ? null : result })
    const fail = (status: number, code: string, message: string, alternative?: string) => reply({ type: 'result', id: msg.id, ok: false, error: { status, code, message, ...(alternative ? { alternative } : {}) } })
    if (msg.type === 'ready') {
      reply({ type: 'hello', platform: 'android', appVersion: '1.1.0-preview', protocol: 2, isTablet: innerWidth >= 840 })
      reply({ type: 'connection', state: 'open' })
      const banner = params.get('banner')
      if (banner) setTimeout(() => port.onmessage?.({ data: JSON.stringify({ type: 'connection', state: banner }) }), 1200)
      // ime=259: 셸 1.1.0처럼 키보드를 띄운 척 — WebView는 그대로, <html>의 --ime와 insets 메시지로 알린다 (features:['ime']를 보낸 화면만)
      const ime = Number(params.get('ime'))
      if (ime > 0 && msg.features?.includes('ime'))
        setTimeout(() => {
          document.documentElement.style.setProperty('--ime', `${ime}px`)
          port.onmessage?.({ data: JSON.stringify({ type: 'insets', ime }) })
          const kb = document.body.appendChild(document.createElement('div'))
          kb.textContent = `가상 키보드 (ime ${ime}px)`
          kb.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${ime}px;z-index:100;display:flex;align-items:center;justify-content:center;color:#fff;font:13px sans-serif;background:repeating-linear-gradient(45deg,#3a3f55,#3a3f55 10px,#2a2e40 10px,#2a2e40 20px)`
        }, 1500)
      return
    }
    if (msg.type === 'call') {
      // PC 서버처럼: hello는 아는 능력만 돌려주고, 예전 PC는 hello·칸 배치를 모른다 (office-iso-tech.md 4-3절)
      const isOldPc = params.get('pc') === 'old'
      if (isOldPc && (msg.method === 'hello' || msg.method === 'placeGridItem' || msg.method === 'moveGridItem')) return fail(404, 'unknown_method', '알 수 없는 메서드예요')
      if (msg.method === 'hello') return ok({ capabilities: (msg.args[0]?.capabilities ?? []).filter((c: string) => c === 'iso-office') })
      if (PC_ONLY[msg.method]) return fail(422, 'pc_only', '휴대폰에서는 할 수 없어요. PC에서 해 주세요', PC_ONLY[msg.method])
      const isCutting = msg.method === 'regenerateRemoteQr' || (msg.method === 'setRemoteEnabled' && msg.args[0] === false)
      if (isCutting && !msg.confirm) return fail(400, 'confirm_required', '이 휴대폰의 연결이 끊어져요. 확인한 뒤 다시 보내 주세요')
      return ok(impl[msg.method]?.(...(msg.args as never[])))
    }
    if (msg.type === 'upload') return ok({ id: crypto.randomUUID(), name: msg.name, mime: msg.mime, size: Math.floor((msg.base64.length * 3) / 4) })
    if (msg.type === 'download') return ok(msg.name)
  },
}
window.OfficeBridge = port

// 처음 띄울 때 안내창이 뜨지 않게
try {
  localStorage.setItem('office:lastSeenVersion', APP_VERSION)
  // xp=…면 개편 안내를 보려고 비워 둔다 (예전 레벨은 경험치로 센다)
  if (!params.has('xp')) {
    localStorage.setItem('office:lastSeenLevel', '99')
    localStorage.setItem('office:levelRevamp20Seen', '1')
  }
} catch {}
