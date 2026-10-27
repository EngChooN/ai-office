import { useState } from 'react'
import { Loader2Icon, PlusIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IS_MOBILE_SHELL } from '@/shell'
import { t } from '@shared/i18n'
import { BROWSER_EQUIPMENT } from '@shared/browserTools'
import type { CustomMcp } from '@shared/customMcp'
import type { Equipment, EquipmentCatalog, EquipmentMcp, McpSourceKind } from '@shared/types'
import { McpAddDialog, type McpAddTab } from './McpAddDialog'

// 장비 탭 › 연결 도구: 출처별 묶음 + 상태(●사용 가능 ◐인증 필요 ✕불러올 수 없음) + 새로 고침 + 직접 추가
// 휴대폰에서는 목록과 켜기만 (새로 고침·추가·고치기·삭제는 PC 전용 기능)

/** 묶음 순서 — Claude Desktop·설정 파일은 항목이 있을 때만, claude.ai 커넥터는 맨 아래 회색 */
const GROUP_ORDER: McpSourceKind[] = ['builtin', 'user', 'local', 'project', 'plugin', 'custom', 'desktop', 'settings', 'claudeai']
const HIDDEN_WHEN_EMPTY: McpSourceKind[] = ['desktop', 'settings']
const REFRESHED_SHOWN_MS = 3000

type RefreshState = 'idle' | 'busy' | 'done' | 'failed'

function groupTitle(kind: McpSourceKind, cwd: string) {
  if (kind === 'builtin') return t('equipment.mcp.group.builtin')
  if (kind === 'plugin') return t('equipment.mcp.group.plugin')
  if (kind === 'project') return t('equipment.mcp.group.project')
  // 왜 이 직원에게만 보이는지 덜 헷갈리게 작업 폴더 이름을 붙인다
  if (kind === 'local') return `${t('equipment.mcp.group.local')} · ${cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd}`
  return t(`equip.source.${kind}`)
}

/** 앱 기본 장비는 status 대신 unavailable로 못 쓰는 이유를 준다 */
const statusOf = (m: EquipmentMcp) => (m.isBuiltin ? (m.unavailable ? 'unsupported' : 'ok') : (m.status ?? 'ok'))

function StatusMark({ m }: { m: EquipmentMcp }) {
  const status = statusOf(m)
  return (
    <span className={cn('shrink-0 text-[11px]', status === 'ok' && 'text-status-working', status === 'auth' && 'text-status-waiting', status === 'unsupported' && 'text-muted-foreground')}>
      {status === 'ok' ? '●' : status === 'auth' ? '◐' : '✕'} {t(`equipment.mcp.status.${status}`)}
    </span>
  )
}

export function McpSection({
  cwd,
  eq,
  setEq,
  catalog,
  setCatalog,
}: {
  cwd: string
  eq: Equipment
  setEq: React.Dispatch<React.SetStateAction<Equipment>>
  catalog: EquipmentCatalog | null
  setCatalog: (c: EquipmentCatalog) => void
}) {
  const [refresh, setRefresh] = useState<RefreshState>('idle')
  const [dialog, setDialog] = useState<{ tab: McpAddTab; editing: CustomMcp | null } | null>(null)
  const servers = catalog?.mcpServers ?? []
  const kindOf = (m: EquipmentMcp): McpSourceKind => (m.isBuiltin ? 'builtin' : (m.sourceKind ?? 'user'))

  const handleRefresh = async () => {
    setRefresh('busy')
    try {
      const next = await window.office.refreshEquipment(cwd)
      setCatalog(next)
      setRefresh(next.isProbeFailed ? 'failed' : 'done')
    } catch {
      setRefresh('failed')
    }
    setTimeout(() => setRefresh((r) => (r === 'done' ? 'idle' : r)), REFRESHED_SHOWN_MS)
  }
  // 직접 추가 목록이 바뀌면 출처·상태가 붙은 카탈로그를 다시 받는다
  const reloadCatalog = () => void window.office.equipmentCatalog(cwd).then(setCatalog)
  const handleEdit = async (name: string) => {
    const editing = (await window.office.customMcpList()).find((c) => c.name === name)
    if (editing) setDialog({ tab: 'command', editing })
  }
  const handleDelete = async (name: string) => {
    if (!window.confirm(t('equipment.mcp.deleteConfirm', { name }))) return
    await window.office.deleteCustomMcp(name)
    reloadCatalog()
  }

  // 브라우저는 결재를 꼭 거치므로 "결재 없이 쓰기"에서 뺀다
  const userMcp = eq.mcpServers.filter((n) => n !== BROWSER_EQUIPMENT)
  const isEmpty = servers.every((m) => m.isBuiltin)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="mr-auto text-xs font-semibold">🔌 {t('equipment.mcp.title')}</h3>
        {refresh === 'done' && <span className="text-status-working text-[11px]">{t('equipment.mcp.refreshed')}</span>}
        {!IS_MOBILE_SHELL && (
          <>
            <Button size="sm" variant="ghost" disabled={refresh === 'busy'} onClick={() => void handleRefresh()}>
              {refresh === 'busy' ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {refresh === 'busy' ? t('equipment.mcp.refreshing') : t('equipment.mcp.refresh')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog({ tab: 'command', editing: null })}>
              <PlusIcon /> {t('equipment.mcp.add')}
            </Button>
          </>
        )}
      </div>
      {refresh === 'failed' && <p className="text-status-waiting text-[11px]">{t('equipment.mcp.refreshFail')}</p>}
      <details className="text-muted-foreground text-[11px]">
        <summary className="cursor-pointer">
          ⓘ {t('equipment.mcp.cost')} <span className="underline">{t('equipment.mcp.costMoreLabel')}</span>
        </summary>
        {t('equipment.mcp.costMore')}
      </details>
      {catalog && isEmpty && <p className="text-muted-foreground text-xs">{t('equipment.mcp.empty')}</p>}

      {catalog &&
        GROUP_ORDER.map((kind) => {
          const items = servers.filter((m) => kindOf(m) === kind)
          if (!items.length && HIDDEN_WHEN_EMPTY.includes(kind)) return null
          const isClaudeai = kind === 'claudeai'
          return (
            // 빈 묶음은 접어 두고 개수(0)만 보인다
            <details key={kind} open={items.length > 0} className={cn(isClaudeai && 'opacity-60')}>
              <summary className="text-muted-foreground cursor-pointer py-0.5 text-[11px]">
                {groupTitle(kind, cwd)} ({items.length}){isClaudeai && ` · ${t('equipment.mcp.group.claudeaiNote')}`}
              </summary>
              <div className="flex flex-col gap-1">
                {items.map((m) => (
                  <McpRow
                    key={`${kind}-${m.name}`}
                    m={m}
                    // claude.ai 커넥터는 이유를 묶음 아래에 한 번만 보여 준다
                    isReasonShown={!isClaudeai}
                    isOn={eq.mcpServers.includes(m.name)}
                    onToggle={() => setEq((e) => ({ ...e, mcpServers: e.mcpServers.includes(m.name) ? e.mcpServers.filter((x) => x !== m.name) : [...e.mcpServers, m.name] }))}
                    onEdit={kind === 'custom' && !IS_MOBILE_SHELL ? () => void handleEdit(m.name) : undefined}
                    onDelete={kind === 'custom' && !IS_MOBILE_SHELL ? () => void handleDelete(m.name) : undefined}
                  />
                ))}
                {isClaudeai && items.length > 0 && (
                  <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
                    {items[0].reasonText}
                    {!IS_MOBILE_SHELL && (
                      <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-[11px]" onClick={() => setDialog({ tab: 'url', editing: null })}>
                        {t('equipment.mcp.toCustom')}
                      </Button>
                    )}
                  </p>
                )}
              </div>
            </details>
          )
        })}

      {userMcp.length > 0 && (
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={userMcp.every((n) => eq.allowedTools.includes(n))}
            onChange={(e) => setEq((x) => ({ ...x, allowedTools: e.target.checked ? [...new Set([...x.allowedTools, ...userMcp])] : x.allowedTools.filter((tool) => !userMcp.includes(tool)) }))}
          />
          {t('equipment.mcp.autoAllow')}
        </label>
      )}
      <p className="text-muted-foreground text-[11px]">{t('equipment.mcp.count', { n: eq.mcpServers.length })}</p>

      {!IS_MOBILE_SHELL && (
        <McpAddDialog
          isOpen={Boolean(dialog)}
          onOpenChange={(open) => !open && setDialog(null)}
          initialTab={dialog?.tab ?? 'command'}
          editing={dialog?.editing ?? null}
          others={servers.filter((m) => !m.isBuiltin && m.sourceKind !== 'custom')}
          onSaved={reloadCatalog}
        />
      )}
    </div>
  )
}

/** 한 줄: 상자를 누르면 켜고 끈다. 불러올 수 없으면 켤 수 없고(켜져 있던 건 끌 수 있게) 이유를 늘 보여 준다 */
function McpRow({ m, isReasonShown, isOn, onToggle, onEdit, onDelete }: { m: EquipmentMcp; isReasonShown: boolean; isOn: boolean; onToggle: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const isDisabled = statusOf(m) === 'unsupported' && !isOn
  const reason = m.isBuiltin ? (m.unavailable ?? t('equip.browser.desc')) : m.reasonText
  return (
    <div className="flex items-start gap-1">
      <button type="button" onClick={onToggle} disabled={isDisabled} title={m.detail} className={cn('min-w-0 flex-1 rounded-md border px-2 py-1 text-left text-xs disabled:opacity-60', isOn && 'border-primary bg-accent')}>
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{m.isBuiltin ? `🌐 ${t('equip.browser.name')}` : m.name}</span>
          {m.sourceKind === 'plugin' && <span className="text-muted-foreground truncate">· {m.source}</span>}
          <span className="ml-auto">
            <StatusMark m={m} />
          </span>
        </span>
        {m.detail && <div className="text-muted-foreground truncate font-mono text-[10px]">{m.detail}</div>}
        {isReasonShown && reason && <div className={cn('text-[11px]', m.isBuiltin && !m.unavailable ? 'text-muted-foreground' : 'text-status-waiting')}>{reason}</div>}
      </button>
      {onEdit && (
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {t('equipment.mcp.edit')}
        </Button>
      )}
      {onDelete && (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          {t('equipment.mcp.delete')}
        </Button>
      )}
    </div>
  )
}
