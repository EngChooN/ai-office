import { useRef, useState, type FormEvent } from 'react'
import { PencilIcon, PlayIcon, PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { useOffice } from '@/store'
import type { Schedule } from '@shared/types'
import { fmtDate, t, type TKey } from '@shared/i18n'
import { nextScheduleRun } from '@shared/schedule'
import { Avatar } from './StaffCard'
import { useNow } from './status'

const WEEKDAYS: TKey[] = ['schedule.day.sun', 'schedule.day.mon', 'schedule.day.tue', 'schedule.day.wed', 'schedule.day.thu', 'schedule.day.fri', 'schedule.day.sat']
const WORKDAYS = [1, 2, 3, 4, 5]
const PRESETS: { label: TKey; time: string; instruction: TKey }[] = [
  { label: 'schedule.preset.morning', time: '09:00', instruction: 'schedule.preset.morningInstruction' },
  { label: 'schedule.preset.evening', time: '18:00', instruction: 'schedule.preset.eveningInstruction' },
  { label: 'schedule.preset.weekly', time: '17:00', instruction: 'schedule.preset.weeklyInstruction' },
]

type Draft = Omit<Schedule, 'lastRunDate'>
const emptyDraft = (staffId = ''): Draft => ({ id: crypto.randomUUID(), staffId, label: '', time: '09:00', weekdays: WORKDAYS, instruction: '', enabled: true })
const toDraft = ({ lastRunDate: _l, ...sc }: Schedule): Draft => ({ ...sc, weekdays: [...sc.weekdays] })

/** 목록의 '다음 실행' 한 줄 — 꺼져 있으면 비운다 */
function nextRunText(sc: Schedule, now: number) {
  const at = nextScheduleRun(sc, new Date(now))
  if (at === null) return ''
  if (at <= now) return t('schedule.nextRunSoon')
  return t('schedule.nextRun', { when: fmtDate(at, { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
}

/** 예약 업무: 정해진 시각에 직원에게 지시를 보낸다 (출근 브리핑·퇴근 보고 등) */
export function SchedulePage() {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const schedules = useOffice((s) => s.schedules)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft())
  // 고치는 중인 예약 — 위 입력 칸을 그대로 쓰고, 같은 id로 저장하면 main이 덮어쓴다 (마지막 실행 날짜는 main이 유지)
  const [editingId, setEditingId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // 다음 실행 표시는 시각이 지나면 바뀌므로 1분마다 다시 그린다
  const now = useNow(60_000)
  const editing = editingId ? schedules.find((x) => x.id === editingId) : undefined

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const isValid = draft.staffId && draft.label.trim() && draft.instruction.trim() && draft.weekdays.length > 0 && draft.time
  const resetForm = (staffId = draft.staffId) => {
    setEditingId(null)
    setDraft(emptyDraft(staffId))
  }
  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    // 편집 중 목록에서 사용 여부를 바꿨을 수 있다 — 그건 목록 쪽 값을 따른다
    const enabled = editing?.enabled ?? draft.enabled
    await window.office.saveSchedule({ ...draft, enabled, label: draft.label.trim(), instruction: draft.instruction.trim() })
    resetForm()
  }
  const handleEdit = (sc: Schedule) => {
    setEditingId(sc.id)
    setDraft(toDraft(sc))
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const toggleDay = (d: number) => update({ weekdays: draft.weekdays.includes(d) ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d].sort() })

  return (
    <Page title={t('schedule.title')} description={t('schedule.desc')}>
      <form ref={formRef} onSubmit={handleSave} className={cn('bg-card mb-6 flex max-w-3xl flex-col gap-3 rounded-xl border p-4', editing && 'border-primary')}>
        {editing && <p className="text-sm font-medium">{t('schedule.editing', { label: editing.label })}</p>}
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
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="w-fit" disabled={!isValid}>
            {editing ? <SaveIcon /> : <PlusIcon />} {t(editing ? 'schedule.saveEdit' : 'schedule.save')}
          </Button>
          {editing && (
            <Button type="button" size="sm" variant="ghost" onClick={() => resetForm()}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>

      <div className="flex max-w-3xl flex-col gap-2">
        {schedules.length === 0 && <p className="text-muted-foreground text-sm">{t('schedule.empty')}</p>}
        {schedules.map((sc) => {
          const s = staff.find((x) => x.id === sc.staffId)
          const nextRun = nextRunText(sc, now)
          return (
            <div key={sc.id} className={cn('bg-card flex items-center gap-3 rounded-xl border p-3', !sc.enabled && 'opacity-50', sc.id === editingId && 'border-primary')}>
              <Avatar avatar={s?.avatar ?? 0} name={s?.name} teamId={s?.teamId} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {sc.time} · {sc.label} <span className="text-muted-foreground font-normal">— {s?.name}</span>
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {sc.weekdays.map((d) => t(WEEKDAYS[d])).join(' ')} · {sc.instruction}
                </div>
                {(nextRun || sc.lastRunDate) && (
                  <div className="text-muted-foreground text-[10px]">{[nextRun, sc.lastRunDate && t('schedule.lastRun', { date: sc.lastRunDate })].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={sc.enabled} onChange={(e) => void window.office.saveSchedule({ ...sc, enabled: e.target.checked })} /> {t('schedule.enabled')}
              </label>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => handleEdit(sc)} aria-label={t('schedule.edit')} title={t('schedule.edit')}>
                <PencilIcon className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => void window.office.runScheduleNow(sc.id)} aria-label={t('schedule.runNow')}>
                <PlayIcon className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => {
                  if (sc.id === editingId) resetForm()
                  void window.office.deleteSchedule(sc.id)
                }}
                aria-label={t('common.delete')}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          )
        })}
      </div>
    </Page>
  )
}
