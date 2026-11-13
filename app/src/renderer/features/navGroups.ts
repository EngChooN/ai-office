// 메뉴 묶음 (순수 로직 — 아이콘·store 없이 테스트한다). 사이드바는 묶음을, 묶음 화면 위쪽은 탭(View)을 그린다
// 기존 View 값은 그대로 두고 묶음이 View 목록을 가진다 → setView('payroll') 같은 바로가기는 그 묶음의 그 탭으로 보인다
import type { View } from '@/store'
import type { TKey } from '@shared/i18n'

export type NavGroupId = 'secretary' | 'map' | 'staff' | 'work' | 'inbox' | 'talk' | 'knowhow' | 'records' | 'shop' | 'config'

export interface NavTabDef {
  view: View
  labelKey: TKey
}

export interface NavGroupDef {
  id: NavGroupId
  labelKey: TKey
  tabs: NavTabDef[]
}

const tab = (view: View, labelKey: TKey): NavTabDef => ({ view, labelKey })

/** 사이드바 순서. 탭이 하나인 묶음은 id를 View와 같게 둔다 (data-tour="nav-<id>"가 옛 메뉴와 같게) */
export const NAV_GROUP_DEFS: NavGroupDef[] = [
  { id: 'secretary', labelKey: 'nav.secretary', tabs: [tab('secretary', 'nav.secretary')] },
  { id: 'map', labelKey: 'nav.map', tabs: [tab('map', 'nav.map')] },
  { id: 'staff', labelKey: 'navGroup.staff', tabs: [tab('dashboard', 'nav.dashboard'), tab('org', 'nav.org')] },
  { id: 'work', labelKey: 'navGroup.work', tabs: [tab('board', 'navTab.board'), tab('schedule', 'nav.schedule'), tab('gallery', 'navTab.gallery')] },
  { id: 'inbox', labelKey: 'nav.inbox', tabs: [tab('inbox', 'nav.inbox')] },
  { id: 'talk', labelKey: 'navGroup.talk', tabs: [tab('chat', 'nav.chat'), tab('meeting', 'nav.meeting')] },
  { id: 'knowhow', labelKey: 'navGroup.knowhow', tabs: [tab('manuals', 'navTab.manuals'), tab('knowledge', 'nav.knowledge')] },
  { id: 'records', labelKey: 'navGroup.records', tabs: [tab('report', 'nav.report'), tab('payroll', 'nav.payroll')] },
  { id: 'shop', labelKey: 'nav.shop', tabs: [tab('shop', 'nav.shop')] },
  { id: 'config', labelKey: 'navGroup.config', tabs: [tab('settings', 'navTab.settings'), tab('updates', 'nav.updates')] },
]

/** 업무 모드에선 사무실(게임 화면)과 상점(게임 재화)을 메뉴에서 뺀다 */
export const GAME_VIEWS = new Set<View>(['map', 'shop'])

/** 이 모드에서 보이는 탭 */
export function visibleTabs<G extends Pick<NavGroupDef, 'tabs'>>(group: G, isWorkMode: boolean): G['tabs'] {
  return isWorkMode ? group.tabs.filter((x) => !GAME_VIEWS.has(x.view)) : group.tabs
}

/** 이 모드에서 보이는 묶음 (탭이 하나도 안 남으면 뺀다) */
export function visibleGroups<G extends Pick<NavGroupDef, 'tabs'>>(groups: G[], isWorkMode: boolean): G[] {
  return groups.filter((g) => visibleTabs(g, isWorkMode).length > 0)
}

/** 이 화면이 들어 있는 묶음 */
export function groupOfView<G extends Pick<NavGroupDef, 'tabs'>>(groups: G[], view: View): G | undefined {
  return groups.find((g) => g.tabs.some((x) => x.view === view))
}

/** 묶음 배지 = 보이는 탭 배지의 합 */
export function groupBadge(group: Pick<NavGroupDef, 'tabs'>, badges: Partial<Record<View, number>>, isWorkMode: boolean): number {
  return visibleTabs(group, isWorkMode).reduce((n, x) => n + (badges[x.view] ?? 0), 0)
}

/** 묶음마다 마지막으로 본 탭을 적는다 (같은 내용이면 같은 객체) */
export function rememberTab(last: Partial<Record<NavGroupId, View>>, groups: NavGroupDef[], view: View): Partial<Record<NavGroupId, View>> {
  const g = groupOfView(groups, view)
  if (!g || last[g.id] === view) return last
  return { ...last, [g.id]: view }
}

/** 사이드바에서 묶음을 누르면 열 화면: 마지막으로 본 탭(지금 모드에서 보일 때), 없으면 첫 탭 */
export function groupEntryView(group: NavGroupDef, last: Partial<Record<NavGroupId, View>>, isWorkMode: boolean): View {
  const tabs = visibleTabs(group, isWorkMode)
  const remembered = last[group.id]
  return remembered && tabs.some((x) => x.view === remembered) ? remembered : (tabs[0]?.view ?? group.tabs[0].view)
}

/**
 * 투어·튜토리얼이 가리킬 곳: 그 화면의 탭이 보이면 탭, 아니면 사이드바(폰은 더보기) 묶음.
 * '|'로 이은 후보를 useTourTarget이 앞에서부터 찾는다
 */
export function tourTarget(groups: NavGroupDef[], view: View): string {
  const g = groupOfView(groups, view)
  if (!g || g.id === view) return `nav-${view}`
  return `nav-${view}|nav-${g.id}`
}

/**
 * 묶음 화면 위쪽 탭 줄을 그릴지. PC에서는 '대화' 묶음(단체방·회의실)이 왼쪽 방 목록의 회의실 줄로 오가므로 탭 줄을 뺀다.
 * 폰은 방 목록이 없어 그대로 탭 줄을 쓴다 (PhoneShell은 이 함수를 부르지 않는다)
 */
export function showsTabRow(groupId: NavGroupId | undefined, shell: 'desktop' | 'phone'): boolean {
  return !(shell === 'desktop' && groupId === 'talk')
}

/** 직원 패널 탭 (사무실·직원 목록에서 직원을 누르면 열리는 패널). 순서 = 화면 순서. 비서 지침도 이 이름을 쓴다 */
export type StaffPanelTab = 'work' | 'approvals' | 'review' | 'equip' | 'profile'
export const STAFF_PANEL_TAB_LABEL: Record<StaffPanelTab, TKey> = {
  work: 'staffPanel.tab.work',
  approvals: 'approvalTab.tab',
  review: 'staffPanel.tab.review',
  equip: 'staffPanel.tab.equip',
  profile: 'staffPanel.tab.profile',
}

type Label = (key: TKey) => string

/**
 * 메뉴 안내 한 줄: "비서·사무실·직원(직원 목록·팀 구성)·…". 묶음 이름 뒤 괄호에 탭 이름(탭이 하나면 생략).
 * note[묶음 id]가 있으면 그 묶음 뒤 괄호에 덧붙인다 (정의에 없는 설명 — 직원 패널, 설정 분류 등). 비서 지침이 메뉴 정의를 따라가게 쓴다
 */
export function navOutline(label: Label, note: Partial<Record<NavGroupId, string>> = {}): string {
  return NAV_GROUP_DEFS.map((g) => {
    const inner = [g.tabs.length > 1 ? g.tabs.map((x) => label(x.labelKey)).join('·') : '', note[g.id] ?? ''].filter(Boolean).join(', ')
    return inner ? `${label(g.labelKey)}(${inner})` : label(g.labelKey)
  }).join('·')
}

/** 화면 이동 링크 목록: "map(사무실) dashboard(직원 › 직원 목록) …" (비서 화면 자신은 뺀다) */
export function viewLinkList(label: Label): string {
  return NAV_GROUP_DEFS.flatMap((g) =>
    g.tabs.filter((x) => x.view !== 'secretary').map((x) => (g.tabs.length > 1 ? `${x.view}(${label(g.labelKey)} › ${label(x.labelKey)})` : `${x.view}(${label(x.labelKey)})`)),
  ).join(' ')
}
