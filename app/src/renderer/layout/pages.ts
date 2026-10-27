// 메뉴(View)마다 그리는 화면 — PC 틀(DesktopShell)과 폰 틀(PhoneShell)이 같이 쓴다
import { BoardPage } from '@/features/BoardPage'
import { ChatPage } from '@/features/ChatPage'
import { Dashboard } from '@/features/Dashboard'
import { InboxPage } from '@/features/InboxPage'
import { KnowledgePage } from '@/features/KnowledgePage'
import { GalleryPage } from '@/features/GalleryPage'
import { ManualsPage } from '@/features/ManualsPage'
import { MeetingPage } from '@/features/MeetingPage'
import { OrgPage } from '@/features/OrgPage'
import { PayrollPage } from '@/features/PayrollPage'
import { ReportPage } from '@/features/ReportPage'
import { SchedulePage } from '@/features/SchedulePage'
import { SettingsPage } from '@/features/SettingsPage'
import { ShopPage } from '@/features/ShopPage'
import { UpdatesPage } from '@/features/UpdatesPage'
import { OfficeMap } from '@/map/OfficeMap'
import { SecretaryPage } from '@/features/secretary/SecretaryPage'
import type { View } from '@/store'

export const PAGES: Record<View, () => React.JSX.Element> = {
  secretary: SecretaryPage,
  map: OfficeMap,
  dashboard: Dashboard,
  org: OrgPage,
  board: BoardPage,
  updates: UpdatesPage,
  shop: ShopPage,
  inbox: InboxPage,
  chat: ChatPage,
  meeting: MeetingPage,
  manuals: ManualsPage,
  knowledge: KnowledgePage,
  gallery: GalleryPage,
  schedule: SchedulePage,
  report: ReportPage,
  payroll: PayrollPage,
  settings: SettingsPage,
}
