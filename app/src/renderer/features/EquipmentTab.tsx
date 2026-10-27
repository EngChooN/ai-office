import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Equipment, EquipmentCatalog, Staff } from '@shared/types'
import { READ_ONLY_BASH, RISKY_BASH } from '@shared/bashPolicy'
import { McpSection } from './McpSection'
import { NotOnWindows } from '@/components/not-on-windows'
import { t } from '@shared/i18n'
import type { TKey } from '@shared/i18n'

/** 자주 쓰는 도구 권한 묶음 */
const TOOL_PRESETS: { label: TKey; hint: TKey; allow?: string[]; deny?: string[] }[] = [
  { label: 'equipment.preset.noShell', hint: 'equipment.preset.noShell.hint', deny: ['Bash'] },
  { label: 'equipment.preset.autoShell', hint: 'equipment.preset.autoShell.hint', allow: ['Bash'] },
  { label: 'equipment.preset.autoRead', hint: 'equipment.preset.autoRead.hint', allow: [READ_ONLY_BASH] },
  { label: 'equipment.preset.noRisky', hint: 'equipment.preset.noRisky.hint', deny: [RISKY_BASH] },
  { label: 'equipment.preset.noWeb', hint: 'equipment.preset.noWeb.hint', deny: ['WebSearch', 'WebFetch'] },
  { label: 'equipment.preset.autoWeb', hint: 'equipment.preset.autoWeb.hint', allow: ['WebSearch', 'WebFetch'] },
  { label: 'equipment.preset.autoEdit', hint: 'equipment.preset.autoEdit.hint', allow: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] },
  { label: 'equipment.preset.autoCapture', hint: 'equipment.preset.autoCapture.hint', allow: ['mcp__office__capture_screen'] },
]

function Chip({ isOn, onClick, children, title, disabled }: { isOn: boolean; onClick: () => void; children: React.ReactNode; title?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} className={cn('rounded-md border px-2 py-1 text-left text-xs disabled:opacity-60', isOn && 'border-primary bg-accent')}>
      {children}
    </button>
  )
}

/** 장비 지급: 연결 도구(MCP)·스킬·도구 권한. 바꾸면 다음 지시부터 새 장비로 일한다 */
export function EquipmentTab({ staff }: { staff: Staff }) {
  const [catalog, setCatalog] = useState<EquipmentCatalog | null>(null)
  const [eq, setEq] = useState<Equipment>(staff.equipment)
  const isDirty = JSON.stringify(eq) !== JSON.stringify(staff.equipment)

  useEffect(() => {
    void window.office.equipmentCatalog(staff.cwd).then(setCatalog)
  }, [staff.cwd])

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const presetOn = (p: (typeof TOOL_PRESETS)[number]) => (p.allow ?? []).every((tool) => eq.allowedTools.includes(tool)) && (p.deny ?? []).every((tool) => eq.disallowedTools.includes(tool))
  const togglePreset = (p: (typeof TOOL_PRESETS)[number]) => {
    const on = presetOn(p)
    // 켤 때는 반대 묶음(금지↔자율)을 함께 풀어 둘이 동시에 켜지지 않게 한다
    setEq((e) => ({
      ...e,
      allowedTools: on ? e.allowedTools.filter((tool) => !p.allow?.includes(tool)) : [...new Set([...e.allowedTools.filter((tool) => !p.deny?.includes(tool)), ...(p.allow ?? [])])],
      disallowedTools: on ? e.disallowedTools.filter((tool) => !p.deny?.includes(tool)) : [...new Set([...e.disallowedTools.filter((tool) => !p.allow?.includes(tool)), ...(p.deny ?? [])])],
    }))
  }
  // 월 예산은 없앴다 (실제 한도는 Claude 플랜이 정한다) — 예전에 정한 값도 지운다
  const handleSave = () => void window.office.setEquipment(staff.id, { ...eq, monthlyBudgetUsd: 0 })

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm">
      <McpSection cwd={staff.cwd} eq={eq} setEq={setEq} catalog={catalog} setCatalog={setCatalog} />

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold">🧰 {t('equipment.skills.title')}</h3>
        <Chip isOn={eq.skills === 'all'} onClick={() => setEq((e) => ({ ...e, skills: e.skills === 'all' ? [] : 'all' }))}>
          {t('equipment.skills.all')}
        </Chip>
        {eq.skills !== 'all' && (
          <div className="flex flex-wrap gap-1">
            {catalog?.skills.length === 0 && <p className="text-muted-foreground text-xs">{t('equipment.skills.empty')}</p>}
            {catalog?.skills.map((sk) => (
              <Chip
                key={`${sk.source}-${sk.name}`}
                isOn={(eq.skills as string[]).includes(sk.name)}
                onClick={() => setEq((e) => ({ ...e, skills: toggleIn(e.skills as string[], sk.name) }))}
                title={sk.description}
              >
                {sk.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={!eq.lightModelOff} onChange={(e) => setEq((x) => ({ ...x, lightModelOff: !e.target.checked }))} />
        {t('equipment.lightModel')}
      </label>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold">🛡️ {t('equipment.tools.title')}</h3>
        <NotOnWindows reason={t('equipment.tools.captureMacOnly')} />
        <div className="grid grid-cols-2 gap-1">
          {TOOL_PRESETS.map((p) => (
            <Chip key={p.label} isOn={presetOn(p)} onClick={() => togglePreset(p)}>
              <span className="font-medium">{t(p.label)}</span>
              <div className="text-muted-foreground text-[10px]">{t(p.hint)}</div>
            </Chip>
          ))}
        </div>
      </div>

      <Button size="sm" className="w-fit" disabled={!isDirty} onClick={handleSave}>
        {t('equipment.save')}
      </Button>
      <p className="text-muted-foreground -mt-3 text-[11px]">{t('equipment.saveNote')}</p>
    </section>
  )
}
