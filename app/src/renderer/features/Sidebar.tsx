import { MegaphoneIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/changelog'
import { useOffice, useWorkMode } from '@/store'
import { t } from '@shared/i18n'
import { GAME_VIEWS, NAV_ITEMS, useNavBadges } from './nav'

export function Sidebar() {
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const isWorkMode = useWorkMode()
  const badges = useNavBadges()
  // 업무 모드에선 사무실(게임 화면)과 상점(게임 재화)을 메뉴에서 뺀다
  const items = isWorkMode ? NAV_ITEMS.filter((i) => !GAME_VIEWS.has(i.view)) : NAV_ITEMS

  return (
    <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2">
      {items.map(({ view: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          data-tour={`nav-${v}`}
          className={cn(
            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
            view === v ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
          <span className="flex-1">{label}</span>
          {Boolean(badges[v]) && <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-black">{badges[v]}</span>}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setView('updates')}
        data-tour="nav-updates"
        className={cn(
          'mt-auto flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs',
          view === 'updates' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        <MegaphoneIcon className="size-3.5" />
        <span className="flex-1">{t('nav.updates')}</span>
        <span className="tabular-nums">v{APP_VERSION}</span>
      </button>
    </nav>
  )
}
