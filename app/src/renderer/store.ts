import { create } from 'zustand'
import { AUTO_APPROVE_OFF, companyFromXp, DEFAULT_SETTINGS, SECRETARY_FOCUS, SECRETARY_PAGE_FOCUS, viewFromFocus, withSettingsDefaults, type ChatMessage, type LogEntry, type Manual, type OfficeSnapshot } from '@shared/types'
import { EMPTY_SHOP } from '@shared/economy'
import { clampFloor } from '@shared/officeLevel'
import { applyLanguage } from '@/lib/i18n'
import { applyUiTheme } from '@/lib/uiTheme'
import { t } from '@shared/i18n'
import { appendChat } from '@shared/chatRooms'
import { markSeen, type ChatSeen } from '@shared/chatUnread'

export type View = 'secretary' | 'map' | 'dashboard' | 'org' | 'board' | 'inbox' | 'chat' | 'meeting' | 'manuals' | 'knowledge' | 'gallery' | 'schedule' | 'report' | 'payroll' | 'settings' | 'updates' | 'shop'

interface OfficeState extends OfficeSnapshot {
  selectedId: string | null
  view: View
  hireOpen: boolean
  /** 분할 화면 상단 바 🔍가 대화 찾기를 열어 달라는 신호 (값이 바뀔 때마다 한 번 연다 — 열림 상태 자체는 대화방이 가진다) */
  chatSearchRequest: number
  /** 직원 마켓 창 (채용 창 안에서 열린다 — openMarket은 채용 창과 함께 연다) */
  isMarketOpen: boolean
  liveLogs: LogEntry[]
  chat: ChatMessage[]
  /** 단체방에서 보고 있는 방 — null = 전체 방, 팀 id = 팀 방, 'lab:<랩 id>' = 랩 방 */
  chatRoom: string | null
  setChatRoom(room: string | null): void
  /** 단체방 화면으로 가서 그 방을 연다 (조직도 팀 카드 '팀 대화방', 랩 카드 '랩 대화방') */
  openChatRoom(room: string | null): void
  /** 랩 회의 열기 등에서 회의실 화면에 미리 채울 참석자 */
  meetingPreset: { topic: string; participantIds: string[] } | null
  /** 첫 스냅샷을 받았는지 (설정을 읽기 전 안내창이 깜빡이지 않게) */
  isLoaded: boolean
  /** 업무 매뉴얼 목록 (파일에서 읽으므로 필요할 때 새로 고친다) */
  manuals: Manual[]
  refreshManuals(): Promise<void>
  /** 설정에서 "둘러보기 다시"를 누를 때마다 올라가는 번호 */
  tourRequest: number
  requestTour(): void
  /** 설정에서 "연습 튜토리얼"을 누를 때마다 올라가는 번호 (연습 고르기 창을 연다) */
  practiceRequest: number
  requestPractice(): void
  /** 사무실 꾸미기(가구 옮기기) 모드 */
  isDecorating: boolean
  /** 개발용 레벨 미리보기 (null = 실제 회사 레벨). 경험치·자금은 그대로 둔다 */
  previewLevel: number | null
  /** 사무실 안에서 보고 있는 층 */
  viewFloor: number
  /** 외관을 지나 건물 안에 들어와 있는지 */
  isInside: boolean
  /** 발표장 화면에 띄운 데모데이 회의 (null = 닫힘) */
  demoStageId: string | null
  setDemoStageId(id: string | null): void
  setPreviewLevel(level: number | null): void
  setViewFloor(floor: number): void
  setInside(v: boolean): void
  setMeetingPreset(p: { topic: string; participantIds: string[] } | null): void
  setDecorating(v: boolean): void
  setSnapshot(s: OfficeSnapshot): void
  select(id: string | null): void
  setView(view: View): void
  setHireOpen(open: boolean): void
  requestChatSearch(): void
  setMarketOpen(open: boolean): void
  openMarket(): void
  /** 비서 빠른 창(⌘K·메뉴바 "비서에게 말하기") */
  isQuickSecretaryOpen: boolean
  setQuickSecretaryOpen(open: boolean): void
  pushLog(entry: LogEntry): void
  pushChat(m: ChatMessage): void
  /** 화면에 불러온 범위 밖의 대화(검색 결과 앞뒤)를 제자리에 끼워 넣는다 */
  mergeChat(list: ChatMessage[]): void
  /** 방마다 마지막으로 본 메시지 (안 읽은 수) — 이 PC에만 저장 */
  chatSeen: ChatSeen | null
  markChatSeen(room: string | null | undefined, lastId: number): void
  /** 입력칸 위 답장 줄: reply = 답장 · redo = 🔁 다시 해 줘 */
  chatReply: { id: number; mode: 'reply' | 'redo' } | null
  setChatReply(reply: { id: number; mode: 'reply' | 'redo' } | null): void
  /** 입력칸에 넣을 글 (예약 '고치기', 오류 '다시 보내기', 🔁) — nonce가 바뀔 때마다 한 번 넣는다 */
  chatDraft: { text: string; nonce: number } | null
  setChatDraft(text: string): void
  /** 이 메시지로 스크롤하고 잠깐 강조한다 (답장 인용·보고 보기·검색 결과) */
  chatFocus: { id: number; nonce: number } | null
  focusChat(id: number): void
  /** 결재함을 열며 이 카드의 기획안으로 스크롤한다 (대화방 기획안 카드 '결재함에서 보기') */
  planFocus: string | null
  openPlanInInbox(taskId: string | null): void
}

/** 사무실을 그릴 레벨: 미리보기가 있으면 그 레벨. 화면은 모두 이 값으로 층수·외관을 정한다 */
export const viewLevelOf = (s: Pick<OfficeState, 'previewLevel' | 'company'>) => s.previewLevel ?? s.company.level

const LIVE_LOG_MAX = 500
const CHAT_MAX = 500

/** 업무 모드에선 사무실(게임 화면)을 열지 않고 대시보드를 보여 준다 */
const shownView = (view: View, isWorkMode: boolean): View => (isWorkMode && view === 'map' ? 'dashboard' : view)

export const useOffice = create<OfficeState>((set) => ({
  staff: [],
  teams: [],
  labs: [],
  runs: [],
  company: companyFromXp(0),
  tasks: [],
  meetings: [],
  schedules: [],
  settings: DEFAULT_SETTINGS,
  monthCostUsd: 0,
  planUsage: [],
  funds: 0,
  claimable: 0,
  shop: EMPTY_SHOP,
  autoApprove: AUTO_APPROVE_OFF,
  selectedId: null,
  view: 'map',
  hireOpen: false,
  chatSearchRequest: 0,
  isMarketOpen: false,
  liveLogs: [],
  chat: [],
  chatRoom: null,
  setChatRoom: (chatRoom) => set({ chatRoom }),
  openChatRoom: (chatRoom) => set((s) => ({ chatRoom, view: shownView('chat', s.settings.isWorkMode) })),
  meetingPreset: null,
  isLoaded: false,
  manuals: [],
  refreshManuals: async () => set({ manuals: await window.office.listManuals() }),
  tourRequest: 0,
  requestTour: () => set((s) => ({ tourRequest: s.tourRequest + 1, view: shownView('map', s.settings.isWorkMode) })),
  practiceRequest: 0,
  requestPractice: () => set((s) => ({ practiceRequest: s.practiceRequest + 1 })),
  isDecorating: false,
  previewLevel: null,
  viewFloor: 1,
  isInside: false,
  demoStageId: null,
  setDemoStageId: (demoStageId) => set({ demoStageId }),
  setPreviewLevel: (previewLevel) => set((s) => ({ previewLevel, viewFloor: clampFloor(s.viewFloor, viewLevelOf({ ...s, previewLevel })) })),
  setViewFloor: (floor) => set((s) => ({ viewFloor: clampFloor(floor, viewLevelOf(s)) })),
  setInside: (isInside) => set({ isInside }),
  setMeetingPreset: (meetingPreset) => set({ meetingPreset }),
  setDecorating: (isDecorating) => set(isDecorating ? { isDecorating, selectedId: null } : { isDecorating }),
  setSnapshot: (snap) =>
    // 옛 main 프로세스가 보낸 스냅샷처럼 새 설정 칸(tokenBudget 등)이 비어 있어도 화면이 깨지지 않게 채운다
    // 업무 모드면 사무실 대신 대시보드로 시작하고, 사무실을 보던 중에 켜도 대시보드로 옮긴다
    set((s) => {
      const settings = withSettingsDefaults(snap.settings)
      applyLanguage(settings.language)
      applyUiTheme(settings)
      const view = shownView(s.view, settings.isWorkMode)
      // 레벨이 내려가 보던 층이 없어지면 1층으로
      const viewFloor = clampFloor(s.viewFloor, viewLevelOf({ previewLevel: s.previewLevel, company: snap.company }))
      return { ...snap, settings, view, viewFloor, isLoaded: true, selectedId: s.selectedId && snap.staff.some((x) => x.id === s.selectedId) ? s.selectedId : null }
    }),
  select: (selectedId) => set({ selectedId }),
  setView: (view) => set((s) => ({ view: shownView(view, s.settings.isWorkMode) })),
  requestChatSearch: () => set((s) => ({ chatSearchRequest: s.chatSearchRequest + 1 })),
  setHireOpen: (hireOpen) => set(hireOpen ? { hireOpen } : { hireOpen, isMarketOpen: false }),
  setMarketOpen: (isMarketOpen) => set({ isMarketOpen }),
  openMarket: () => set({ hireOpen: true, isMarketOpen: true }),
  isQuickSecretaryOpen: false,
  setQuickSecretaryOpen: (isQuickSecretaryOpen) => set({ isQuickSecretaryOpen }),
  pushLog: (entry) => set((s) => ({ liveLogs: [...s.liveLogs.slice(-LIVE_LOG_MAX + 1), entry] })),
  // 같은 id면 결재 결과로 바뀐 메시지 → 제자리에서 바꾼다. 방마다 최근 CHAT_MAX개
  pushChat: (m) => set((s) => ({ chat: appendChat(s.chat, m, CHAT_MAX) })),
  mergeChat: (list) =>
    set((s) => {
      const byId = new Map(s.chat.map((m) => [m.id, m]))
      for (const m of list) if (!byId.has(m.id)) byId.set(m.id, m)
      return { chat: [...byId.values()].sort((a, b) => a.id - b.id) }
    }),
  chatSeen: null,
  markChatSeen: (room, lastId) =>
    set((s) => {
      if (!s.chatSeen) return {}
      const next = markSeen(s.chatSeen, room, lastId)
      if (next === s.chatSeen) return {}
      saveChatSeen(next)
      return { chatSeen: next }
    }),
  chatReply: null,
  setChatReply: (chatReply) => set({ chatReply }),
  chatDraft: null,
  setChatDraft: (text) => set((s) => ({ chatDraft: { text, nonce: (s.chatDraft?.nonce ?? 0) + 1 } })),
  chatFocus: null,
  focusChat: (id) => set((s) => ({ chatFocus: { id, nonce: (s.chatFocus?.nonce ?? 0) + 1 } })),
  planFocus: null,
  openPlanInInbox: (planFocus) => set((s) => (planFocus ? { planFocus, view: shownView('inbox', s.settings.isWorkMode) } : { planFocus })),
}))

const CHAT_SEEN_KEY = 'aiOffice.chatSeen'

function loadChatSeen(): ChatSeen | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAT_SEEN_KEY) ?? 'null') as ChatSeen | null
    return v && typeof v.baseline === 'number' && v.rooms && typeof v.rooms === 'object' ? v : null
  } catch {
    return null
  }
}

function saveChatSeen(seen: ChatSeen) {
  try {
    localStorage.setItem(CHAT_SEEN_KEY, JSON.stringify(seen))
  } catch {
    // 저장하지 못해도 이번 실행 동안은 화면 상태로 센다
  }
}

/**
 * 단체방 기록을 다시 읽는다. 응답을 기다리는 사이 실시간으로 온 글(onChat)은 응답으로 덮어쓰지 않고 그 위에 다시 얹는다
 * — 휴대폰은 기록(HTTP)과 실시간 글(이벤트 스트림)이 다른 길로 와서, 먼저 온 새 글이나 결재 결과로 바뀐 글이 옛 기록에 묻힐 수 있다
 */
export function loadChatHistory() {
  const before = new Set(useOffice.getState().chat)
  void window.office.chatHistory().then((history) =>
    useOffice.setState((s) => {
      // 처음 켠 PC는 지금까지의 대화를 다 읽은 것으로 시작한다
      let chatSeen = s.chatSeen ?? loadChatSeen()
      if (!chatSeen) {
        chatSeen = { baseline: history.reduce((max, m) => Math.max(max, m.id), 0), rooms: {} }
        saveChatSeen(chatSeen)
      }
      return { chat: s.chat.filter((m) => !before.has(m)).reduce((chat, m) => appendChat(chat, m, CHAT_MAX), history), chatSeen }
    }),
  )
}

/** main 프로세스 이벤트를 store에 연결한다 (앱 시작 시 1회) */
export function connectOffice() {
  const { setSnapshot, pushLog, pushChat, select } = useOffice.getState()
  void window.office.snapshot().then(setSnapshot)
  loadChatHistory()
  // 메뉴바 "비서에게 말하기"는 직원 대신 비서 표시가 온다 → 빠른 창
  // 바탕화면 비서 "앱에서 열기"는 비서 화면으로 (확인 카드를 거기서 이어 한다)
  const focus = (id: string) => {
    if (id === SECRETARY_FOCUS) useOffice.setState({ isQuickSecretaryOpen: true })
    else if (id === SECRETARY_PAGE_FOCUS) useOffice.getState().setView('secretary')
    else if (viewFromFocus(id)) useOffice.getState().setView(viewFromFocus(id) as View)
    else select(id)
  }
  const offs = [window.office.onSnapshot(setSnapshot), window.office.onLog(pushLog), window.office.onChat(pushChat), window.office.onFocus(focus)]
  return () => offs.forEach((off) => off())
}

export const staffName = (id: string) => (id === 'me' ? t('common.me') : (useOffice.getState().staff.find((s) => s.id === id)?.name ?? t('common.formerStaff')))

/** 업무 모드인지. 게임 요소를 숨길지는 이 훅 하나로만 읽는다 */
export const useWorkMode = () => useOffice((s) => s.settings.isWorkMode)

/** 사무실을 그릴 레벨 (미리보기 포함) */
export const useViewLevel = () => useOffice(viewLevelOf)
