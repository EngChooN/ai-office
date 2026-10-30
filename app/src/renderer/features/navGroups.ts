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
