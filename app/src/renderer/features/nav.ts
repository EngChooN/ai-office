import { SparklesIcon, BookOpenIcon, BanknoteIcon, StoreIcon, CalendarClockIcon, ClipboardCheckIcon, FileTextIcon, KanbanIcon, LayoutGridIcon, MapIcon, MessagesSquareIcon, NetworkIcon, PresentationIcon, SettingsIcon } from 'lucide-react'
import { useOffice, type View } from '@/store'
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
  item('schedule', 'nav.schedule', CalendarClockIcon),
  item('report', 'nav.report', FileTextIcon),
  item('payroll', 'nav.payroll', BanknoteIcon),
  item('shop', 'nav.shop', StoreIcon),
  item('settings', 'nav.settings', SettingsIcon),
]

/** 업무 모드에선 사무실(게임 화면)과 상점(게임 재화)을 메뉴에서 뺀다 */
export const GAME_VIEWS = new Set<View>(['map', 'shop'])

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
