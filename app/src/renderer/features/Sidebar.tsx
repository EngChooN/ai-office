import { MegaphoneIcon, MessageSquareIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/changelog'
import { useOffice, useWorkMode } from '@/store'
import { t } from '@shared/i18n'
import { GAME_VIEWS, NAV_ITEMS, useNavBadges } from './nav'
import { updateActions } from '@/lib/update'
import { useUpdateBadge } from './AppUpdate'
import { openFeedbackIssue } from '@/lib/feedback'

export function Sidebar() {
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const isWorkMode = useWorkMode()
  const badges = useNavBadges()
  const newVersion = useUpdateBadge()
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
          {Boolean(badges[v]) && <span className="bg-status-waiting shrink-0 rounded-full px-1.5 text-[10px] font-semibold text-black">{badges[v]}</span>}
        </button>
      ))}
      <button
        type="button"
        onClick={openFeedbackIssue}
        className="text-muted-foreground hover:bg-accent/60 hover:text-foreground mt-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs"
      >
        <MessageSquareIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={t('settingsPage.guide.feedback')}>{t('settingsPage.guide.feedback')}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setView('updates')
          // 새 버전이 있으면 안내 창을 다시 연다
          if (newVersion) updateActions.openNotice()
        }}
        data-tour="nav-updates"
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs',
          view === 'updates' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        <MegaphoneIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={t('nav.updates')}>{t('nav.updates')}</span>
        {newVersion ? (
          <span className="bg-status-waiting shrink-0 rounded-full px-1.5 text-[10px] font-semibold text-black" title={t('update.badge', { version: newVersion })}>
            {t('update.badgeShort')}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] tabular-nums opacity-70">v{APP_VERSION}</span>
        )}
      </button>
    </nav>
  )
}
