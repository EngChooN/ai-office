import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import type { Payslip } from '@shared/types'
import { Avatar } from './StaffCard'
import { formatTokens } from './status'
import { PlanHoldBanner, PlanUsageCard } from './PlanUsageCard'
import { SecretaryFace } from './secretary/SecretaryFace'
import { SECRETARY_ID } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'

/** 직원별 토큰을 볼 기간 — 오늘·이번 주는 지금 기준, 달은 고른 달 */
type Range = 'day' | 'week' | 'month'
const RANGE_LABEL: Record<Range, TKey> = { day: 'payroll.range.day', week: 'payroll.range.week', month: 'payroll.range.month' }

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 급여 명세서: 실제 한도인 엔진(Claude·Codex) 플랜 사용률 + 직원별로 쓴 토큰 (앱이 정하던 토큰·비용 한도는 없앴다) */
export function PayrollPage() {
  const monthCost = useOffice((s) => s.monthCostUsd)
  const [range, setRange] = useState<Range>('month')
  const [month, setMonth] = useState(thisMonth)
  const [slip, setSlip] = useState<Payslip | null>(null)

  // 사용량이 늘면(monthCost가 바뀌면) 다시 받는다
  useEffect(() => {
    void window.office.payslip(range === 'month' ? month : range).then(setSlip)
  }, [range, month, monthCost])

  const rows = [...(slip?.rows ?? [])].sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut))
  const total = rows.reduce((n, r) => n + r.tokensIn + r.tokensOut, 0)

  return (
    <Page
      title={t('payroll.title')}
      description={t('payroll.desc')}
      actions={range === 'month' && <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />}
    >
      <PlanHoldBanner className="mb-4 max-w-3xl" />
      <PlanUsageCard />

      <div className="mb-3 flex max-w-3xl items-center gap-2">
        <div role="radiogroup" aria-label={t('payroll.range.label')} className="flex gap-1.5">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={cn('rounded-md border px-2.5 py-1 text-xs', range === r && 'border-primary bg-accent')}
            >
              {t(RANGE_LABEL[r])}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {(slip?.savedTokens ?? 0) > 0 && <span className="mr-3">{t('payroll.saved', { n: formatTokens(slip!.savedTokens) })}</span>}
          {t('payroll.total', { n: formatTokens(total) })}
        </span>
      </div>

      {/* 휴대폰: 표는 가로로 밀어서 보고 직원 칸은 고정 */}
      <div className="overflow-x-auto">
        <table className="phone:min-w-[620px] w-full max-w-3xl text-sm [&_td]:px-3 [&_th]:px-3 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
          <thead className="text-muted-foreground text-left text-xs">
            <tr className="border-b">
              <th className="phone:sticky phone:left-0 phone:bg-background py-2 font-medium">{t('payroll.col.staff')}</th>
              <th className="w-24 text-right font-medium">{t('payroll.col.tasksDone')}</th>
              <th className="w-28 text-right font-medium" title={t('payroll.col.tokensIn.hint')}>
                {t('payroll.col.tokensIn')}
              </th>
              <th className="w-28 text-right font-medium">{t('payroll.col.tokensOut')}</th>
              <th className="w-56 font-medium">{t('payroll.col.share')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground py-4 text-sm">
                  {t('payroll.empty')}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const used = r.tokensIn + r.tokensOut
              const share = total > 0 ? used / total : 0
              return (
                <tr key={r.staffId} className="border-b border-dashed">
                  <td className="phone:sticky phone:left-0 phone:bg-background py-2">
                    <div className="flex items-center gap-2">
                      {r.staffId === SECRETARY_ID ? <SecretaryFace className="size-7" /> : <Avatar avatar={r.avatar} name={r.name} className="size-7" />}
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-muted-foreground text-xs">{roleLabel(r.role)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right tabular-nums">{r.tasksDone}</td>
                  <td className="text-right tabular-nums">{formatTokens(r.tokensIn)}</td>
                  <td className="text-right tabular-nums">{formatTokens(r.tokensOut)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted h-1.5 flex-1 rounded-full">
                        <div className="bg-primary h-full rounded-full" style={{ width: `${share * 100}%` }} />
                      </div>
                      <span className="w-12 text-right tabular-nums">{Math.round(share * 100)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Page>
  )
}
