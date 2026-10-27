import { useEffect, useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import type { LogEntry, LogType } from '@shared/types'
import { fmtDate, t, trOr, type TKey } from '@shared/i18n'
import { Avatar } from './StaffCard'
import { Markdown } from '@/components/markdown'

const DAY_MS = 24 * 60 * 60 * 1000
const LOG_LABEL: Record<LogType, TKey> = {
  instruction: 'report.log.instruction',
  reply: 'report.log.reply',
  tool: 'report.log.tool',
  approval: 'report.log.approval',
  status: 'report.log.status',
  result: 'report.log.result',
  error: 'report.log.error',
  delegate: 'report.log.delegate',
  commit: 'report.log.commit',
}
const LOG_COLOR: Partial<Record<LogType, string>> = {
  instruction: 'text-primary',
  approval: 'text-status-waiting',
  result: 'text-status-working',
  error: 'text-status-error',
  delegate: 'text-sky-400',
  commit: 'text-violet-400',
}
const HIDE_TOOLS_KEY: LogType = 'tool'

const toDateInput = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 보고서: 사무실 전체 타임라인 + 하루치 일일 보고서 */
export function ReportPage() {
  const staff = useOffice((s) => s.staff)
  const liveLogs = useOffice((s) => s.liveLogs)
  const [date, setDate] = useState(() => toDateInput(Date.now()))
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [report, setReport] = useState('')
  const [isToolsShown, setIsToolsShown] = useState(false)
  const dayStart = new Date(`${date}T00:00:00`).getTime()

  useEffect(() => {
    void window.office.timeline(dayStart).then((all) => setLogs(all.filter((l) => l.ts < dayStart + DAY_MS)))
    void window.office.dailyReport(dayStart).then(setReport)
  }, [dayStart, liveLogs.length])

  const shown = logs.filter((l) => isToolsShown || l.type !== HIDE_TOOLS_KEY).reverse()

  return (
    // 넓으면 타임라인 | 보고서 두 칸, 좁으면(본문 768px 미만) 위아래로 쌓는다
    <div className="@container h-full">
      <div className="flex h-full flex-col @3xl:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b @3xl:border-r @3xl:border-b-0">
          <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
            <h1 className="text-lg font-semibold whitespace-nowrap">{t('report.timeline')}</h1>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40 shrink-0" />
            <label className="text-muted-foreground ml-auto flex items-center gap-1 text-xs whitespace-nowrap">
              <input type="checkbox" checked={isToolsShown} onChange={(e) => setIsToolsShown(e.target.checked)} /> {t('report.showTools')}
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {shown.length === 0 && <p className="text-muted-foreground text-sm">{t('report.empty')}</p>}
            {shown.map((l) => {
              const s = staff.find((x) => x.id === l.staffId)
              return (
                <div key={l.id} className="flex gap-2 border-b border-dashed py-1.5 text-xs">
                  <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
                    {fmtDate(l.ts, { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                  <Avatar avatar={s?.avatar ?? 0} name={s?.name} teamId={s?.teamId} className="size-4" />
                  <span className="w-16 shrink-0 truncate font-medium">{s?.name ?? t('common.formerStaff')}</span>
                  <span className={cn('w-8 shrink-0 font-medium', LOG_COLOR[l.type] ?? 'text-muted-foreground')}>{t(LOG_LABEL[l.type])}</span>
                  <span className="selectable line-clamp-3 min-w-0 flex-1 break-words">{trOr(l.textI18n, l.text)}</span>
                </div>
              )
            })}
          </div>
        </section>
        <section className="flex min-h-0 flex-1 flex-col @3xl:w-[420px] @3xl:flex-none">
          <div className="flex items-center gap-2 border-b px-6 py-4">
            <h2 className="font-semibold whitespace-nowrap">{t('report.daily')}</h2>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void navigator.clipboard.writeText(report)}>
              <CopyIcon /> {t('report.copy')}
            </Button>
          </div>
          <Markdown className="min-h-0 flex-1 overflow-y-auto p-6 text-sm">{report}</Markdown>
        </section>
      </div>
    </div>
  )
}
