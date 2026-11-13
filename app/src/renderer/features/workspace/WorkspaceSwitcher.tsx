import { useEffect, useState } from 'react'
import { ChevronDownIcon, MonitorIcon, PlusIcon, Settings2Icon } from 'lucide-react'
import { PopMenu, PopMenuItem } from '@/components/pop-menu'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { useRemoteUi } from '@/remote/ui'
import { t } from '@shared/i18n'
import { canOpenWindow, type WorkspaceView } from '@shared/workspace'
import { requestSettingsSection } from '../SettingsPage'
import { SECTION_ID } from '../settingsSections'
import { canManageWorkspaces, currentWorkspace, useWorkspaces } from './useWorkspaces'
import { WorkspaceWizard } from './WorkspaceWizard'

// 상단 이름 칸 = PC 전환 드롭다운 (1안). 연결 PC가 없으면 지금과 같은 'AI Office' 글자만 — 이 PC 화면이 바뀌지 않는다
// ⌘1~3(윈도우 Ctrl)으로 연결 PC, ⌘0으로 이 PC

const MOD_KEY = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

export function WorkspaceSwitcher() {
  const state = useWorkspaces()
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const list = state?.list ?? []
  const current = currentWorkspace(state)
  useSwitchKeys(list, state !== null)
  if (!state || (list.length === 0 && !current)) return <span className="shrink-0 font-semibold">AI Office</span>
  const pendingElsewhere = list.filter((w) => w.id !== state.current).reduce((n, w) => n + w.pending, 0)
  const switchTo = (target: string) => void window.officeWorkspaces?.switchTo(target)
  return (
    <>
      <PopMenu
        opens="down"
        label={t('workspace.switcher.label')}
        hasDot={pendingElsewhere > 0}
        className="[-webkit-app-region:no-drag]"
        buttonClassName={cn('h-7 w-auto gap-1.5 px-2 font-semibold', current && 'text-[var(--ws-current)]')}
        icon={
          <>
            <span className={cn('size-2 rounded-full', !current && 'bg-primary')} style={current ? { background: `var(--ws-${current.color})` } : undefined} />
            <span className="max-w-40 truncate">{current ? current.name : t('workspace.self')}</span>
            <ChevronDownIcon className="size-3.5 opacity-60" />
          </>
        }
      >
        {(close) => (
          <>
            <PopMenuItem onClick={() => (close(), switchTo('self'))} className={cn(state.current === 'self' && 'bg-accent')}>
              <span className="bg-primary size-2 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 truncate">{t('workspace.self')}</span>
              <span className="text-muted-foreground text-[11px]">{MOD_KEY}0</span>
            </PopMenuItem>
            {list.map((w, i) => (
              <WorkspaceRow key={w.id} w={w} index={i} isCurrent={state.current === w.id} onPick={() => (close(), switchTo(w.id))} />
            ))}
            {canManageWorkspaces() && (
              <>
                <div className="bg-border my-1 h-px" />
                <PopMenuItem icon={<PlusIcon />} onClick={() => (close(), setIsWizardOpen(true))}>
                  {t('workspace.add')}
                </PopMenuItem>
                <PopMenuItem
                  icon={<Settings2Icon />}
                  onClick={() => {
                    close()
                    useOffice.getState().setView('settings')
                    requestSettingsSection(SECTION_ID.remote)
                  }}
                >
                  {t('workspace.manage')}
                </PopMenuItem>
              </>
            )}
          </>
        )}
      </PopMenu>
      {isWizardOpen && <WorkspaceWizard list={list} initialWhat="pc" onClose={() => setIsWizardOpen(false)} />}
    </>
  )
}

function WorkspaceRow({ w, index, isCurrent, onPick }: { w: WorkspaceView; index: number; isCurrent: boolean; onPick: () => void }) {
  const canOpen = canOpenWindow(w.status)
  return (
    <PopMenuItem onClick={() => canOpen && onPick()} className={cn(isCurrent && 'bg-accent', !canOpen && 'cursor-default opacity-60')}>
      <MonitorIcon style={{ color: `var(--ws-${w.color})` }} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{w.name}</span>
        {w.status !== 'ready' && <span className="text-muted-foreground truncate text-[11px]">{t(`workspace.status.${w.status}`)}</span>}
      </span>
      {w.pending > 0 && <span className="bg-status-waiting text-background rounded-full px-1.5 text-[11px] font-semibold tabular-nums">{w.pending}</span>}
      {index < 3 && <span className="text-muted-foreground text-[11px]">{MOD_KEY}{index + 1}</span>}
    </PopMenuItem>
  )
}

/** ⌘0 = 이 PC, ⌘1~3 = 연결 PC 순서 */
function useSwitchKeys(list: WorkspaceView[], isOn: boolean) {
  useEffect(() => {
    if (!isOn || list.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !/^Digit[0-3]$/.test(e.code)) return
      const n = Number(e.code.slice(5))
      const target = n === 0 ? 'self' : list[n - 1]
      if (!target) return
      if (target !== 'self' && !canOpenWindow(target.status)) return
      e.preventDefault()
      void window.officeWorkspaces?.switchTo(target === 'self' ? 'self' : target.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, isOn])
}

/** 원격 창 위쪽 띠: 'OO의 사무실을 보는 중' + 끊김·안내. 이 PC 창에서는 그리지 않는다 */
export function WorkspaceBand() {
  const state = useWorkspaces()
  const current = currentWorkspace(state)
  const connection = useRemoteUi((s) => s.connection)
  const notice = useRemoteUi((s) => s.notice?.text)
  const isOffline = !!current && (current.status === 'offline' || connection === 'closed')
  // 창 테두리·이름 칸 색과 끊김 회색은 <html> 표시 하나로 (index.css)
  useEffect(() => {
    const root = document.documentElement
    if (current) root.dataset.wsColor = current.color
    else delete root.dataset.wsColor
    if (isOffline) root.dataset.wsOffline = ''
    else delete root.dataset.wsOffline
  }, [current, isOffline])
  if (!current) return null
  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex items-center gap-2 bg-[var(--ws-current)] px-3 py-1 text-xs font-medium text-white">
        <MonitorIcon className="size-3.5" />
        <span className="min-w-0 flex-1 truncate">{t('workspace.band.viewing', { name: current.name })}</span>
        {current.status !== 'ready' && <span className="opacity-90">{t(`workspace.status.${current.status}`)}</span>}
      </div>
      {isOffline && (
        <div className="bg-muted text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1">{t('workspace.band.offline')}</span>
          <button type="button" className="text-primary shrink-0 font-medium" onClick={() => void window.officeWorkspaces?.switchTo('self')}>
            {t('workspace.band.goHome')}
          </button>
        </div>
      )}
      {notice && <p className="bg-muted/60 text-muted-foreground px-3 py-1 text-xs">{notice}</p>}
    </div>
  )
}
