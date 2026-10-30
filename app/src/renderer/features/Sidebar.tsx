import { MessageSquareIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOffice, useWorkMode } from '@/store'
import { t } from '@shared/i18n'
import { NAV_GROUPS, useNavBadges, useOpenGroup } from './nav'
import { NAV_GROUP_DEFS, groupBadge, groupOfView, visibleGroups } from './navGroups'
import { useUpdateBadge } from './AppUpdate'
import { openFeedbackIssue } from '@/lib/feedback'

export function Sidebar() {
  const view = useOffice((s) => s.view)
  const isWorkMode = useWorkMode()
  const badges = useNavBadges()
  const newVersion = useUpdateBadge()
  const openGroup = useOpenGroup()
  // 묶음 이름만 둔다 — 비슷한 화면은 그 화면 위쪽 탭(NavTabs). 업무 모드에선 사무실·상점을 뺀다
  const groups = visibleGroups(NAV_GROUPS, isWorkMode)
  const currentId = groupOfView(NAV_GROUP_DEFS, view)?.id

  return (
    <nav className="flex min-h-0 w-44 shrink-0 flex-col gap-0.5 border-r p-2">
      {/* 창이 낮으면 메뉴만 스크롤하고 아래 의견 보내기는 남긴다. 포커스 테두리가 잘리지 않게 안쪽 여백을 둔다 */}
      <div className="-m-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
        {groups.map((g) => {
          const Icon = g.icon
          const badge = groupBadge(g, badges, isWorkMode)
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => openGroup(g)}
              data-tour={`nav-${g.id}`}
              aria-current={currentId === g.id ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                currentId === g.id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{g.label}</span>
              {badge > 0 && <span className="bg-status-waiting shrink-0 rounded-full px-1.5 text-[10px] font-semibold text-background">{badge}</span>}
              {/* 새 버전은 '설정' 묶음에 (탭 '업데이트 소식'에도 같은 표시) */}
              {g.id === 'config' && newVersion && (
                <span className="bg-status-waiting shrink-0 rounded-full px-1.5 text-[10px] font-semibold text-background" title={t('update.badge', { version: newVersion })}>
                  {t('update.badgeShort')}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={openFeedbackIssue}
        className="text-muted-foreground hover:bg-accent/60 hover:text-foreground mt-1 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs"
      >
        <MessageSquareIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={t('settingsPage.guide.feedback')}>{t('settingsPage.guide.feedback')}</span>
      </button>
    </nav>
  )
}
