import { SparklesIcon, BookOpenIcon, LibraryIcon, GalleryHorizontalEndIcon, BanknoteIcon, StoreIcon, CalendarClockIcon, ClipboardCheckIcon, FileTextIcon, KanbanIcon, LayoutGridIcon, MapIcon, MessagesSquareIcon, NetworkIcon, PresentationIcon, SettingsIcon, UsersIcon } from 'lucide-react'
import { useOffice, useWorkMode, type View } from '@/store'
import { GAME_VIEWS, NAV_GROUP_DEFS, groupEntryView, rememberTab, tourTarget, type NavGroupDef, type NavGroupId } from './navGroups'
import { pendingMeetingDecisions } from '@shared/meetingDecisions'
import { t, type TKey } from '@shared/i18n'

// 메뉴 목록 한 곳: PC 사이드바와 폰 아래 탭·더보기가 같은 순서·이름·아이콘을 쓴다

// 이름은 키로 두고 읽을 때 번역한다 (언어를 바꾸면 바로 바뀌게)
const item = (view: View, labelKey: TKey, icon: typeof MapIcon) => ({
  view,
  icon,
  get label() {
    return t(labelKey)
  },
})

export const NAV_ITEMS: { view: View; readonly label: string; icon: typeof MapIcon }[] = [
  // 무엇이든 시키는 입구라 맨 위 (secretary-ui.md 1절)
  item('secretary', 'nav.secretary', SparklesIcon),
  item('map', 'nav.map', MapIcon),
  item('dashboard', 'nav.dashboard', LayoutGridIcon),
  item('org', 'nav.org', NetworkIcon),
  item('board', 'nav.board', KanbanIcon),
  item('inbox', 'nav.inbox', ClipboardCheckIcon),
  item('chat', 'nav.chat', MessagesSquareIcon),
  item('meeting', 'nav.meeting', PresentationIcon),
  item('manuals', 'nav.manuals', BookOpenIcon),
  item('knowledge', 'nav.knowledge', LibraryIcon),
  item('gallery', 'nav.gallery', GalleryHorizontalEndIcon),
  item('schedule', 'nav.schedule', CalendarClockIcon),
  item('report', 'nav.report', FileTextIcon),
  item('payroll', 'nav.payroll', BanknoteIcon),
  item('shop', 'nav.shop', StoreIcon),
  item('settings', 'nav.settings', SettingsIcon),
]

export { GAME_VIEWS }

const GROUP_ICONS: Record<NavGroupId, typeof MapIcon> = {
  secretary: SparklesIcon,
  map: MapIcon,
  staff: UsersIcon,
  work: KanbanIcon,
  inbox: ClipboardCheckIcon,
  talk: MessagesSquareIcon,
  knowhow: BookOpenIcon,
  records: FileTextIcon,
  shop: StoreIcon,
  config: SettingsIcon,
}

export type NavGroup = NavGroupDef & { icon: typeof MapIcon; readonly label: string }

/** 사이드바·폰 더보기의 묶음 (이름은 읽을 때 번역) */
export const NAV_GROUPS: NavGroup[] = NAV_GROUP_DEFS.map((g) => ({
  ...g,
  icon: GROUP_ICONS[g.id],
  get label() {
    return t(g.labelKey)
  },
}))

// 묶음마다 마지막으로 본 탭 (앱을 켜 둔 동안). 어떤 경로로 화면이 바뀌어도(바로가기·비서 링크) 따라 적는다
let lastTabs: Partial<Record<NavGroupId, View>> = rememberTab({}, NAV_GROUP_DEFS, useOffice.getState().view)
useOffice.subscribe((s) => {
  lastTabs = rememberTab(lastTabs, NAV_GROUP_DEFS, s.view)
})

/** 사이드바·더보기에서 묶음을 누를 때: 그 묶음에서 마지막으로 본 탭을 연다 */
export function useOpenGroup() {
  const setView = useOffice((s) => s.setView)
  const isWorkMode = useWorkMode()
  return (group: NavGroupDef) => setView(groupEntryView(group, lastTabs, isWorkMode))
}

/** 투어·튜토리얼이 가리킬 data-tour (탭이 보이면 탭, 아니면 묶음) */
export const navTourTarget = (view: View) => tourTarget(NAV_GROUP_DEFS, view)

/** 메뉴 옆 숫자 (결재함·회의실·업무 보드·상점) */
export function useNavBadges(): Partial<Record<View, number>> {
  const staff = useOffice((s) => s.staff)
  const tasks = useOffice((s) => s.tasks)
  const claimable = useOffice((s) => s.claimable)
  const meetings = useOffice((s) => s.meetings)
  const checkingRuns = useOffice((s) => s.runs.filter((r) => r.status === 'checking').length)
  const waitingPlans = useOffice((s) => s.tasks.filter((t) => t.plan?.status === 'waiting').length)
  const pendingDecisions = pendingMeetingDecisions(meetings).length
  return {
    inbox: staff.reduce((n, s) => n + s.approvals.length + (s.kind === 'external' && s.status === 'waiting' && s.approvals.length === 0 ? 1 : 0), 0) + pendingDecisions + checkingRuns + waitingPlans,
    meeting: pendingDecisions,
    board: tasks.filter((t) => t.status === 'review').length,
    shop: claimable,
  }
}
