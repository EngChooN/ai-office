import { cn } from '@/lib/utils'
import { useOffice, useWorkMode } from '@/store'
import { t } from '@shared/i18n'
import { notifiableVersion, updateActions, useUpdateStore } from '@/lib/update'
import { NAV_GROUP_DEFS, groupOfView, visibleTabs } from './navGroups'
import { useNavBadges } from './nav'

/** 묶음 화면 위쪽 탭 줄 (PC·폰 공용). 탭이 하나뿐인 묶음(비서·사무실·결재함·상점)이나 업무 모드에서 하나만 남으면 숨긴다 */
export function NavTabs() {
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const isWorkMode = useWorkMode()
  const badges = useNavBadges()
  const newVersion = notifiableVersion(useUpdateStore((s) => s.status))
  const group = groupOfView(NAV_GROUP_DEFS, view)
  const tabs = group ? visibleTabs(group, isWorkMode) : []
  if (tabs.length < 2) return null

  return (
    // 폰에서 입력 중이면 화면 제목처럼 숨긴다. 탭이 넘치면 가로로 밀어 본다 (스크롤바는 숨김 — 탭 밑줄 -mb-px 때문에 세로 스크롤바가 생겼음)
    <div role="tablist" className="typing:hidden flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] border-b px-4 phone:px-2">
      {tabs.map(({ view: v, labelKey }) => {
        const isSelected = view === v
        const isUpdates = v === 'updates'
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => {
              setView(v)
              // 새 버전이 있으면 안내 창을 다시 연다 (옛 사이드바 '업데이트 소식'과 같게)
              if (isUpdates && newVersion) updateActions.openNotice()
            }}
            data-tour={`nav-${v}`}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm whitespace-nowrap short:py-1.5',
              isSelected ? 'border-primary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t(labelKey)}
            {Boolean(badges[v]) && <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-background">{badges[v]}</span>}
            {isUpdates && newVersion && (
              <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-background" title={t('update.badge', { version: newVersion })}>
                {t('update.badgeShort')}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
