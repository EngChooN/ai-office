import { create } from 'zustand'
import { AUTO_APPROVE_OFF, companyFromXp, DEFAULT_SETTINGS, SECRETARY_FOCUS, withSettingsDefaults, type ChatMessage, type LogEntry, type Manual, type OfficeSnapshot } from '@shared/types'
import { EMPTY_SHOP } from '@shared/economy'
import { clampFloor } from '@shared/officeLevel'
import { applyLanguage } from '@/lib/i18n'
import { applyUiTheme } from '@/lib/uiTheme'
import { t } from '@shared/i18n'

export type View = 'secretary' | 'map' | 'dashboard' | 'org' | 'board' | 'inbox' | 'chat' | 'meeting' | 'manuals' | 'knowledge' | 'gallery' | 'schedule' | 'report' | 'payroll' | 'settings' | 'updates' | 'shop'

interface OfficeState extends OfficeSnapshot {
  selectedId: string | null
  view: View
  hireOpen: boolean
  /** 직원 마켓 창 (채용 창 안에서 열린다 — openMarket은 채용 창과 함께 연다) */
  isMarketOpen: boolean
  liveLogs: LogEntry[]
  chat: ChatMessage[]
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
  setMarketOpen(open: boolean): void
  openMarket(): void
  /** 비서 빠른 창(⌘K·메뉴바 "비서에게 말하기") */
  isQuickSecretaryOpen: boolean
  setQuickSecretaryOpen(open: boolean): void
  pushLog(entry: LogEntry): void
  pushChat(m: ChatMessage): void
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
  isMarketOpen: false,
  liveLogs: [],
  chat: [],
  meetingPreset: null,
  isLoaded: false,
  manuals: [],
  refreshManuals: async () => set({ manuals: await window.office.listManuals() }),
  tourRequest: 0,
  requestTour: () => set((s) => ({ tourRequest: s.tourRequest + 1, view: shownView('map', s.settings.isWorkMode) })),
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
  setHireOpen: (hireOpen) => set(hireOpen ? { hireOpen } : { hireOpen, isMarketOpen: false }),
  setMarketOpen: (isMarketOpen) => set({ isMarketOpen }),
  openMarket: () => set({ hireOpen: true, isMarketOpen: true }),
  isQuickSecretaryOpen: false,
  setQuickSecretaryOpen: (isQuickSecretaryOpen) => set({ isQuickSecretaryOpen }),
  pushLog: (entry) => set((s) => ({ liveLogs: [...s.liveLogs.slice(-LIVE_LOG_MAX + 1), entry] })),
  // 같은 id면 결재 결과로 바뀐 메시지 → 제자리에서 바꾼다
  pushChat: (m) => set((s) => (s.chat.some((x) => x.id === m.id) ? { chat: s.chat.map((x) => (x.id === m.id ? m : x)) } : { chat: [...s.chat.slice(-CHAT_MAX + 1), m] })),
}))

/** main 프로세스 이벤트를 store에 연결한다 (앱 시작 시 1회) */
export function connectOffice() {
  const { setSnapshot, pushLog, pushChat, select } = useOffice.getState()
  void window.office.snapshot().then(setSnapshot)
  void window.office.chatHistory().then((chat) => useOffice.setState({ chat }))
  // 메뉴바 "비서에게 말하기"는 직원 대신 비서 표시가 온다 → 빠른 창
  const focus = (id: string) => (id === SECRETARY_FOCUS ? useOffice.setState({ isQuickSecretaryOpen: true }) : select(id))
  const offs = [window.office.onSnapshot(setSnapshot), window.office.onLog(pushLog), window.office.onChat(pushChat), window.office.onFocus(focus)]
  return () => offs.forEach((off) => off())
}

export const staffName = (id: string) => (id === 'me' ? t('common.me') : (useOffice.getState().staff.find((s) => s.id === id)?.name ?? t('common.formerStaff')))

/** 업무 모드인지. 게임 요소를 숨길지는 이 훅 하나로만 읽는다 */
export const useWorkMode = () => useOffice((s) => s.settings.isWorkMode)

/** 사무실을 그릴 레벨 (미리보기 포함) */
export const useViewLevel = () => useOffice(viewLevelOf)
