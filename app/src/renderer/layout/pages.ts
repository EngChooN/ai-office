// 메뉴(View)마다 그리는 화면 — PC 틀(DesktopShell)과 폰 틀(PhoneShell)이 같이 쓴다
// 모든 화면은 열 때 불러온다. 처음 열리는 화면(사무실 지도)은 main.tsx가 App과 함께 받아 두고(loadPage) 첫 화면에 바로 그린다.
// 나머지는 첫 화면이 뜬 뒤 쉬는 틈에 미리 불러 두어 메뉴를 바꿀 때 빈 화면이 거의 보이지 않는다
import { createElement, lazy, type ComponentType } from 'react'
import type { View } from '@/store'

type Loader = () => Promise<ComponentType>

const LOADERS: Record<View, Loader> = {
  map: () => import('@/map/OfficeMap').then((m) => m.OfficeMap),
  secretary: () => import('@/features/secretary/SecretaryPage').then((m) => m.SecretaryPage),
  dashboard: () => import('@/features/Dashboard').then((m) => m.Dashboard),
  org: () => import('@/features/OrgPage').then((m) => m.OrgPage),
  board: () => import('@/features/BoardPage').then((m) => m.BoardPage),
  updates: () => import('@/features/UpdatesPage').then((m) => m.UpdatesPage),
  shop: () => import('@/features/ShopPage').then((m) => m.ShopPage),
  inbox: () => import('@/features/InboxPage').then((m) => m.InboxPage),
  chat: () => import('@/features/ChatPage').then((m) => m.ChatPage),
  meeting: () => import('@/features/MeetingPage').then((m) => m.MeetingPage),
  manuals: () => import('@/features/ManualsPage').then((m) => m.ManualsPage),
  knowledge: () => import('@/features/KnowledgePage').then((m) => m.KnowledgePage),
  gallery: () => import('@/features/GalleryPage').then((m) => m.GalleryPage),
  schedule: () => import('@/features/SchedulePage').then((m) => m.SchedulePage),
  report: () => import('@/features/ReportPage').then((m) => m.ReportPage),
  payroll: () => import('@/features/PayrollPage').then((m) => m.PayrollPage),
  settings: () => import('@/features/SettingsPage').then((m) => m.SettingsPage),
}

/** 다 받은 화면 — 있으면 Suspense 없이 바로 그린다 */
const loaded: Partial<Record<View, ComponentType>> = {}
/** 받기 전에 그리려 한 화면의 lazy 컴포넌트 — 한 번 만들면 계속 같은 것을 써서 다 받은 뒤에도 화면이 다시 마운트되지 않게 */
const lazies: Partial<Record<View, ComponentType>> = {}

/** 화면 코드를 받아 둔다 (이미 받았으면 바로 끝) */
export function loadPage(view: View): Promise<ComponentType> {
  const done = loaded[view]
  if (done) return Promise.resolve(done)
  return LOADERS[view]().then((page) => (loaded[view] = page))
}

/** 화면 하나를 그린다 — 받는 중이면 위쪽 Suspense가, 받지 못하면 위쪽 PageErrorBoundary가 맡는다 */
export function renderPage(view: View) {
  const Page = lazies[view] ?? loaded[view] ?? (lazies[view] = lazy(() => loadPage(view).then((page) => ({ default: page }))))
  return createElement(Page)
}

/** 받지 못한 화면을 다시 받게 한다 — lazy는 실패를 기억하므로 새로 만든다 */
export function retryPage(view: View) {
  delete lazies[view]
}

let isPreloaded = false
/** 첫 화면이 뜬 뒤 쉬는 틈에 나머지 화면을 미리 불러 둔다 (한 번만) */
export function preloadPages() {
  if (isPreloaded) return
  isPreloaded = true
  const run = () => (Object.keys(LOADERS) as View[]).forEach((view) => void loadPage(view).catch(() => {}))
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 5_000 })
  else setTimeout(run, 1_500)
}
