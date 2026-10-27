import { useState } from 'react'
import { ChevronRightIcon, Loader2Icon, PlusIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { IS_MOBILE_SHELL } from '@/shell'
import { t } from '@shared/i18n'
import { BROWSER_EQUIPMENT } from '@shared/browserTools'
import { COMPUTER_EQUIPMENT } from '@shared/computerTools'
import type { CustomMcp } from '@shared/customMcp'
import type { Equipment, EquipmentCatalog, EquipmentMcp, McpSourceKind } from '@shared/types'
import { McpAddDialog, type McpAddTab } from './McpAddDialog'

// 장비 탭 › 연결 도구: 한 줄에 상태 점·이름·켜기 스위치. 출처·명령·이유·고치기/삭제는 줄을 펼쳐서 본다 + 새로 고침 + 직접 추가
// 휴대폰에서는 목록과 켜기만 (새로 고침·추가·고치기·삭제는 PC 전용 기능)

/** 목록 순서(출처별) — claude.ai 커넥터는 맨 아래에 접어 둔다 */
const GROUP_ORDER: McpSourceKind[] = ['builtin', 'user', 'local', 'project', 'plugin', 'custom', 'desktop', 'settings', 'claudeai']
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

  // 브라우저·컴퓨터 조작은 결재를 꼭 거치므로 "결재 없이 쓰기"에서 뺀다
  const userMcp = eq.mcpServers.filter((n) => n !== BROWSER_EQUIPMENT && n !== COMPUTER_EQUIPMENT)
  const isEmpty = servers.every((m) => m.isBuiltin)

  const toggle = (name: string) => setEq((e) => ({ ...e, mcpServers: e.mcpServers.includes(name) ? e.mcpServers.filter((x) => x !== name) : [...e.mcpServers, name] }))
  const rowOf = (m: EquipmentMcp, isReasonShown = true) => {
    const kind = kindOf(m)
    return (
      <McpRow
        key={`${kind}-${m.name}`}
        m={m}
        source={groupTitle(kind, cwd)}
        // claude.ai 커넥터는 이유를 묶음 아래에 한 번만 보여 준다
        isReasonShown={isReasonShown}
        isOn={eq.mcpServers.includes(m.name)}
        onToggle={() => toggle(m.name)}
        onEdit={kind === 'custom' && !IS_MOBILE_SHELL ? () => void handleEdit(m.name) : undefined}
        onDelete={kind === 'custom' && !IS_MOBILE_SHELL ? () => void handleDelete(m.name) : undefined}
      />
    )
  }
  // 출처 순서대로 한 목록에 — 출처는 줄을 펼치면 보인다. claude.ai 커넥터는 켤 수 없어 맨 아래에 접어 둔다
  const listed = GROUP_ORDER.filter((k) => k !== 'claudeai').flatMap((kind) => servers.filter((m) => kindOf(m) === kind))
  const claudeai = servers.filter((m) => kindOf(m) === 'claudeai')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">🔌 {t('equipment.mcp.title')}</h3>
        <span className="text-muted-foreground mr-auto text-[11px]">{t('equipment.mcp.count', { n: eq.mcpServers.length })}</span>
        {refresh === 'done' && <span className="text-status-working text-[11px]">{t('equipment.mcp.refreshed')}</span>}
        {!IS_MOBILE_SHELL && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="size-8 px-0"
              disabled={refresh === 'busy'}
              title={refresh === 'busy' ? t('equipment.mcp.refreshing') : t('equipment.mcp.refresh')}
              aria-label={t('equipment.mcp.refresh')}
              onClick={() => void handleRefresh()}
            >
              {refresh === 'busy' ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog({ tab: 'command', editing: null })}>
              <PlusIcon /> {t('equipment.mcp.add')}
            </Button>
          </>
        )}
      </div>
      {refresh === 'failed' && <p className="text-status-waiting text-[11px]">{t('equipment.mcp.refreshFail')}</p>}
      {catalog && isEmpty && <p className="text-muted-foreground text-xs">{t('equipment.mcp.empty')}</p>}

      {catalog && listed.length > 0 && <div className="divide-y rounded-md border">{listed.map((m) => rowOf(m))}</div>}

      {catalog && claudeai.length > 0 && (
        <details className="text-muted-foreground text-[11px]">
          <summary className="cursor-pointer py-0.5">
            {groupTitle('claudeai', cwd)} ({claudeai.length}) · {t('equipment.mcp.group.claudeaiNote')}
          </summary>
          <div className="mt-1 flex flex-col gap-1 opacity-70">
            <div className="divide-y rounded-md border">{claudeai.map((m) => rowOf(m, false))}</div>
            <p>
              {claudeai[0].reasonText}
              {!IS_MOBILE_SHELL && (
                <button type="button" className="text-primary ml-1 hover:underline" onClick={() => setDialog({ tab: 'url', editing: null })}>
                  {t('equipment.mcp.toCustom')}
                </button>
              )}
            </p>
          </div>
        </details>
      )}

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
      <details className="text-muted-foreground text-[11px]">
        <summary className="cursor-pointer">
          ⓘ {t('equipment.mcp.cost')} <span className="underline">{t('equipment.mcp.costMoreLabel')}</span>
        </summary>
        {t('equipment.mcp.costMore')}
      </details>

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

const STATUS_DOT = { ok: 'bg-status-working', auth: 'bg-status-waiting', unsupported: 'bg-status-idle' } as const
const STATUS_TEXT = { ok: 'text-status-working', auth: 'text-status-waiting', unsupported: 'text-muted-foreground' } as const

/** 한 줄: 상태 점 · 이름 · 켜기 스위치. 줄을 누르면 출처·명령/주소·이유·고치기/삭제가 펼쳐진다.
 *  불러올 수 없으면 켤 수 없다(켜져 있던 건 끌 수 있게). 문제가 있으면 상태 글자를 이름 옆에 함께 보인다 */
function McpRow({
  m,
  source,
  isReasonShown,
  isOn,
  onToggle,
  onEdit,
  onDelete,
}: {
  m: EquipmentMcp
  source: string
  isReasonShown: boolean
  isOn: boolean
  onToggle: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const status = statusOf(m)
  const isDisabled = status === 'unsupported' && !isOn
  const reason = m.isBuiltin ? (m.unavailable ?? (m.name === COMPUTER_EQUIPMENT ? t('equip.computer.desc') : t('equip.browser.desc'))) : m.reasonText
  const name = m.isBuiltin ? (m.name === COMPUTER_EQUIPMENT ? `🖱️ ${t('equip.computer.name')}` : `🌐 ${t('equip.browser.name')}`) : m.name
  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button type="button" aria-expanded={isOpen} title={t('equipment.mcp.details')} onClick={() => setIsOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRightIcon className={cn('text-muted-foreground size-3 shrink-0 transition-transform', isOpen && 'rotate-90')} />
          <span title={t(`equipment.mcp.status.${status}`)} className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[status])} />
          <span className="truncate font-medium">{name}</span>
          {status !== 'ok' && <span className={cn('shrink-0 text-[11px]', STATUS_TEXT[status])}>{t(`equipment.mcp.status.${status}`)}</span>}
        </button>
        <Switch checked={isOn} disabled={isDisabled} onCheckedChange={onToggle} aria-label={name} />
      </div>
      {isOpen && (
        <div className="text-muted-foreground flex flex-col gap-1 pr-2 pb-2 pl-7 text-[11px]">
          <span>
            {t('equipment.mcp.source')}: {source}
            {m.sourceKind === 'plugin' && ` · ${m.source}`}
          </span>
          {m.detail && <code className="font-mono text-[10px] break-all">{m.detail}</code>}
          {isReasonShown && reason && <span className={cn(!(m.isBuiltin && !m.unavailable) && 'text-status-waiting')}>{reason}</span>}
          {m.notice && <span className="text-status-waiting">{m.notice}</span>}
          {(onEdit || onDelete) && (
            <div className="flex gap-1">
              {onEdit && (
                <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onEdit}>
                  {t('equipment.mcp.edit')}
                </Button>
              )}
              {onDelete && (
                <Button size="sm" variant="ghost" className="text-destructive h-6 px-2 text-[11px]" onClick={onDelete}>
                  {t('equipment.mcp.delete')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
