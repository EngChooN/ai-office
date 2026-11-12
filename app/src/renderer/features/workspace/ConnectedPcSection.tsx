import { useState } from 'react'
import { MonitorIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fmtDate, t } from '@shared/i18n'
import { canOpenWindow, WORKSPACE_MAX, type WorkspaceView } from '@shared/workspace'
import { useWorkspaces } from './useWorkspaces'
import { ColorPicker, WorkspaceWizard } from './WorkspaceWizard'

// 설정 › 연결 › 연결한 PC: 이름·색 바꾸기, 열기, 해제(목록에서만 — 그 PC 사무실은 그대로), PC 추가. 이 PC 창 전용

export function ConnectedPcSection() {
  const state = useWorkspaces()
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  if (!state) return null
  const { list } = state
  return (
    <div className="flex flex-col gap-2 text-sm">
      {list.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('workspace.manage.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((w) => (editId === w.id ? <EditRow key={w.id} w={w} onDone={() => setEditId(null)} /> : <Row key={w.id} w={w} onEdit={() => setEditId(w.id)} />))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setIsWizardOpen(true)}>
          <PlusIcon /> {t('workspace.add')}
        </Button>
        <span className="text-muted-foreground text-xs">{t('workspace.manage.count', { n: list.length, max: WORKSPACE_MAX })}</span>
      </div>
      {isWizardOpen && <WorkspaceWizard list={list} onClose={() => setIsWizardOpen(false)} />}
    </div>
  )
}

function Row({ w, onEdit }: { w: WorkspaceView; onEdit: () => void }) {
  const remove = async () => {
    if (!window.confirm(t('workspace.manage.removeConfirm', { name: w.name }))) return
    await window.officeWorkspaces?.remove?.(w.id)
  }
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs">
      <MonitorIcon className="size-4" style={{ color: `var(--ws-${w.color})` }} />
      <span className="text-sm font-medium">{w.name}</span>
      <span className="text-muted-foreground">{t(`workspace.status.${w.status}`)}</span>
      <span className="text-muted-foreground">· {t('workspace.lastUsed', { when: fmtDate(w.lastUsedAt, { month: 'short', day: 'numeric' }) })}</span>
      <span className="ml-auto flex gap-1">
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={!canOpenWindow(w.status)} onClick={() => void window.officeWorkspaces?.switchTo(w.id)}>
          {t('workspace.manage.open')}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onEdit}>
          {t('workspace.manage.edit')}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => void remove()}>
          {t('workspace.manage.remove')}
        </Button>
      </span>
    </li>
  )
}

function EditRow({ w, onDone }: { w: WorkspaceView; onDone: () => void }) {
  const [name, setName] = useState(w.name)
  const [color, setColor] = useState(w.color)
  const save = async () => {
    await window.officeWorkspaces?.update?.(w.id, { name, color })
    onDone()
  }
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t('workspace.field.name')}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs" />
      </label>
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-1">
        <Button size="sm" onClick={() => void save()} disabled={!name.trim()}>
          {t('workspace.manage.save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('dialog.cancel')}
        </Button>
      </div>
    </li>
  )
}
