import { useState, type FormEvent } from 'react'
import { PlayIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { useOffice } from '@/store'
import type { Schedule } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { Avatar } from './StaffCard'

const WEEKDAYS: TKey[] = ['schedule.day.sun', 'schedule.day.mon', 'schedule.day.tue', 'schedule.day.wed', 'schedule.day.thu', 'schedule.day.fri', 'schedule.day.sat']
const WORKDAYS = [1, 2, 3, 4, 5]
const PRESETS: { label: TKey; time: string; instruction: TKey }[] = [
  { label: 'schedule.preset.morning', time: '09:00', instruction: 'schedule.preset.morningInstruction' },
  { label: 'schedule.preset.evening', time: '18:00', instruction: 'schedule.preset.eveningInstruction' },
  { label: 'schedule.preset.weekly', time: '17:00', instruction: 'schedule.preset.weeklyInstruction' },
]

type Draft = Omit<Schedule, 'lastRunDate'>
const emptyDraft = (staffId = ''): Draft => ({ id: crypto.randomUUID(), staffId, label: '', time: '09:00', weekdays: WORKDAYS, instruction: '', enabled: true })

/** 예약 업무: 정해진 시각에 직원에게 지시를 보낸다 (출근 브리핑·퇴근 보고 등) */
export function SchedulePage() {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const schedules = useOffice((s) => s.schedules)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft())

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const isValid = draft.staffId && draft.label.trim() && draft.instruction.trim() && draft.weekdays.length > 0
  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    await window.office.saveSchedule({ ...draft, label: draft.label.trim(), instruction: draft.instruction.trim() })
    setDraft(emptyDraft(draft.staffId))
  }
  const toggleDay = (d: number) => update({ weekdays: draft.weekdays.includes(d) ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d].sort() })

  return (
    <Page title={t('schedule.title')} description={t('schedule.desc')}>
      <form onSubmit={handleSave} className="bg-card mb-6 flex max-w-3xl flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => update({ label: t(p.label), time: p.time, instruction: t(p.instruction) })} className="rounded-md border px-2 py-1 text-xs">
              {t(p.label)}
            </button>
          ))}
        </div>
        <div className="phone:flex-wrap flex gap-2">
          <NativeSelect value={draft.staffId} onChange={(e) => update({ staffId: e.target.value })} className="w-40">
            <option value="">{t('schedule.staff')}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <Input value={draft.label} onChange={(e) => update({ label: e.target.value })} placeholder={t('schedule.namePlaceholder')} />
          <Input type="time" value={draft.time} onChange={(e) => update({ time: e.target.value })} className="phone:w-36 w-28" />
        </div>
        <div className="flex gap-1">
          {WEEKDAYS.map((dayKey, d) => (
            <button key={d} type="button" onClick={() => toggleDay(d)} className={cn('phone:size-10 size-7 rounded-md border text-xs', draft.weekdays.includes(d) && 'border-primary bg-accent')}>
              {t(dayKey)}
            </button>
          ))}
        </div>
        <Textarea value={draft.instruction} onChange={(e) => update({ instruction: e.target.value })} placeholder={t('schedule.instructionPlaceholder')} className="min-h-16" />
        <Button type="submit" size="sm" className="w-fit" disabled={!isValid}>
          <PlusIcon /> {t('schedule.save')}
        </Button>
      </form>

      <div className="flex max-w-3xl flex-col gap-2">
        {schedules.length === 0 && <p className="text-muted-foreground text-sm">{t('schedule.empty')}</p>}
        {schedules.map((sc) => {
          const s = staff.find((x) => x.id === sc.staffId)
          return (
            <div key={sc.id} className={cn('bg-card flex items-center gap-3 rounded-xl border p-3', !sc.enabled && 'opacity-50')}>
              <Avatar avatar={s?.avatar ?? 0} name={s?.name} teamId={s?.teamId} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {sc.time} · {sc.label} <span className="text-muted-foreground font-normal">— {s?.name}</span>
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {sc.weekdays.map((d) => t(WEEKDAYS[d])).join(' ')} · {sc.instruction}
                </div>
                {sc.lastRunDate && <div className="text-muted-foreground text-[10px]">{t('schedule.lastRun', { date: sc.lastRunDate })}</div>}
              </div>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={sc.enabled} onChange={(e) => void window.office.saveSchedule({ ...sc, enabled: e.target.checked })} /> {t('schedule.enabled')}
              </label>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => void window.office.runScheduleNow(sc.id)} aria-label={t('schedule.runNow')}>
                <PlayIcon className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => void window.office.deleteSchedule(sc.id)} aria-label={t('common.delete')}>
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          )
        })}
      </div>
    </Page>
  )
}
