import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileDiffIcon, GalleryHorizontalEndIcon, LinkIcon, PresentationIcon, Trash2Icon } from 'lucide-react'
import { AttachmentView } from '@/components/attachments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { filterGallery, type DemoDayConfig, type GalleryEntry, type GalleryPeriod } from '@shared/gallery'
import { fmtDate, t, type TKey } from '@shared/i18n'

const PERIODS: GalleryPeriod[] = ['week', 'month', 'all']
const WEEKDAYS: TKey[] = ['schedule.day.sun', 'schedule.day.mon', 'schedule.day.tue', 'schedule.day.wed', 'schedule.day.thu', 'schedule.day.fri', 'schedule.day.sat']

/** 갤러리 목록 — 화면을 열 때 받고, 보드 카드가 바뀌면(검토로 넘어가면) 다시 받는다 */
function useGallery() {
  const tasks = useOffice((s) => s.tasks)
  const [entries, setEntries] = useState<GalleryEntry[]>([])
  const refresh = useCallback(async () => setEntries(await window.office.galleryList()), [])
  const reviewCount = tasks.filter((x) => x.status === 'review' || x.status === 'done').length
  useEffect(() => {
    void refresh()
  }, [refresh, reviewCount])
  return { entries, refresh }
}

/** 결과물 갤러리: 끝난 업무의 캡처·링크·바뀐 파일 카드 + 매주 데모데이 설정 */
export function GalleryPage() {
  const { entries, refresh } = useGallery()
  const labs = useOffice((s) => s.labs)
  const [staffId, setStaffId] = useState('')
  const [labId, setLabId] = useState('')
  const [period, setPeriod] = useState<GalleryPeriod>('month')

  // 직원 칸은 갤러리에 카드가 있는 사람만 (해고한 직원도 이름으로 남는다)
  const people = useMemo(() => [...new Map(entries.map((e) => [e.staffId, e.staffName])).entries()], [entries])
  const shown = useMemo(() => filterGallery(entries, { staffId: staffId || undefined, labId: labId || undefined, period }, Date.now()), [entries, staffId, labId, period])

  const handleDelete = async (e: GalleryEntry) => {
    if (!window.confirm(t('gallery.confirmDelete', { title: e.title }))) return
    await window.office.deleteGalleryEntry(e.id)
    void refresh()
  }

  return (
    <Page title={t('gallery.title')} description={t('gallery.description')}>
      <DemoDayBar />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="bg-muted flex w-fit rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={cn('rounded-md px-3 py-1 text-xs font-medium', period === p ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              {t(`gallery.period.${p}`)}
            </button>
          ))}
        </div>
        <NativeSelect value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-8 w-36 text-xs" aria-label={t('gallery.filter.staff')}>
          <option value="">{t('gallery.filter.staff')}</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        {labs.length > 0 && (
          <NativeSelect value={labId} onChange={(e) => setLabId(e.target.value)} className="h-8 w-36 text-xs" aria-label={t('gallery.filter.lab')}>
            <option value="">{t('gallery.filter.lab')}</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <span className="text-muted-foreground ml-auto text-xs">{t('gallery.count', { n: shown.length })}</span>
      </div>
      {shown.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-start gap-2 rounded-xl border border-dashed p-6 text-sm">
          <GalleryHorizontalEndIcon className="size-5" />
          {entries.length === 0 ? t('gallery.empty') : t('gallery.noMatch')}
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {shown.map((e) => (
            <GalleryCard key={e.id} entry={e} onDelete={() => void handleDelete(e)} />
          ))}
        </ul>
      )}
    </Page>
  )
}

function GalleryCard({ entry: e, onDelete }: { entry: GalleryEntry; onDelete: () => void }) {
  const lab = useOffice((s) => s.labs.find((l) => l.id === e.labId))
  const added = e.files.reduce((n, f) => n + f.added, 0)
  const removed = e.files.reduce((n, f) => n + f.removed, 0)
  return (
    <li className="bg-card flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={e.title}>
            {e.title}
          </p>
          <p className="text-muted-foreground truncate text-[11px]">
            {e.staffName}
            {lab ? ` · ${lab.name}` : ''} · {fmtDate(e.finishedAt, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={onDelete} aria-label={t('common.delete')}>
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      <AttachmentView attachments={e.images} size="md" />
      {e.summary && <p className="text-muted-foreground line-clamp-5 text-xs whitespace-pre-wrap">{e.summary}</p>}
      {e.links.length > 0 && (
        <ul className="flex flex-col gap-0.5" aria-label={t('gallery.links')}>
          {e.links.map((u) => (
            <li key={u} className="flex min-w-0 items-center gap-1 text-[11px]">
              <LinkIcon className="text-muted-foreground size-3 shrink-0" />
              <a href={u} target="_blank" rel="noreferrer" className="text-primary truncate underline underline-offset-2" title={u}>
                {u.replace(/^https?:\/\//, '')}
              </a>
            </li>
          ))}
        </ul>
      )}
      {e.files.length > 0 && (
        <details className="mt-auto text-[11px]">
          <summary className="text-muted-foreground flex cursor-pointer items-center gap-1">
            <FileDiffIcon className="size-3" />
            {t('gallery.files', { n: e.files.length, added, removed })}
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-4 font-mono">
            {e.files.map((f) => (
              <li key={f.path} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate" title={f.path}>
                  {f.path}
                </span>
                <span className="text-status-working">+{f.added}</span>
                <span className="text-status-error">−{f.removed}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

/** 데모데이 설정 줄: 매주 요일·시각 + 지금 열기 */
function DemoDayBar() {
  const demo = useOffice((s) => s.settings.demoDay)
  const [isRan, setIsRan] = useState(false)
  const update = (patch: Partial<DemoDayConfig>) => void window.office.updateSettings({ demoDay: { ...demo, ...patch } })

  const handleRunNow = async () => {
    await window.office.runDemoDayNow()
    setIsRan(true)
  }

  return (
    <section className="bg-card mb-4 flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <PresentationIcon className="text-primary size-4" />
        <span className="text-sm font-semibold">{t('gallery.demo.title')}</span>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={demo.isEnabled} onChange={(e) => update({ isEnabled: e.target.checked })} /> {t('gallery.demo.enable')}
        </label>
        <label className="flex items-center gap-1.5 text-xs" title={t('gallery.demo.aiHint')}>
          <input type="checkbox" checked={demo.isAi} onChange={(e) => update({ isAi: e.target.checked })} /> {t('gallery.demo.ai')}
        </label>
        <div className="flex items-center gap-1.5" aria-label={t('gallery.demo.when')}>
          <NativeSelect value={demo.weekday} onChange={(e) => update({ weekday: Number(e.target.value) })} className="h-8 w-20 text-xs" disabled={!demo.isEnabled}>
            {WEEKDAYS.map((k, d) => (
              <option key={k} value={d}>
                {t(k)}
              </option>
            ))}
          </NativeSelect>
          <Input type="time" value={demo.time} onChange={(e) => e.target.value && update({ time: e.target.value })} className="h-8 w-28 text-xs" disabled={!demo.isEnabled} />
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => void handleRunNow()}>
          {t('gallery.demo.runNow')}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{isRan ? t('gallery.demo.ran') : t('gallery.demo.desc')}</p>
    </section>
  )
}
