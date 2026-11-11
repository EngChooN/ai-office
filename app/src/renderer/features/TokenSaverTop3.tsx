import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOffice } from '@/store'
import { t } from '@shared/i18n'
import { pickSavers, type Saver, type SaverAction } from '@shared/tokenSaving'
import type { PayslipRow, Staff } from '@shared/types'
import { Avatar } from './StaffCard'
import { formatTokens } from './status'
import { claudeModelName } from './modelOptions'

const patchOf = (a: SaverAction, isUndo: boolean) => {
  const value = isUndo ? a.from : a.to
  return a.kind === 'model' ? { model: value } : { memory: value as Staff['memory'] }
}

/** 급여 화면: 이번 주 토큰을 많이 쓴 직원 중 설정 한 단계로 아낄 수 있는 3명 — [아끼기]는 그 직원 하나만 바꾸고 되돌릴 수 있다 */
export function TokenSaverTop3() {
  const monthCost = useOffice((s) => s.monthCostUsd)
  const staff = useOffice((s) => s.staff)
  const [rows, setRows] = useState<PayslipRow[]>([])
  // 아낀 직원의 직전 값 (앱을 끄면 잊는다) — 바꾼 뒤에도 줄을 그대로 두고 '되돌리기'를 보여 준다
  const [changed, setChanged] = useState<Record<string, SaverAction>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void window.office.payslip('week').then((slip) => setRows(slip.rows))
  }, [monthCost])

  // 바꾼 직원은 바꾸기 전 값으로 계산해야 목록에서 빠지지 않는다
  const asBefore = staff.map((s) => (changed[s.id] ? { ...s, ...patchOf(changed[s.id], true) } : s))
  const savers = pickSavers(rows, asBefore)
  if (savers.length === 0) return null

  const apply = async (saver: Saver, isUndo: boolean) => {
    setFailed((f) => ({ ...f, [saver.staffId]: false }))
    try {
      await window.office.updateStaff(saver.staffId, patchOf(saver.action, isUndo))
      setChanged(({ [saver.staffId]: _, ...rest }) => (isUndo ? rest : { ...rest, [saver.staffId]: saver.action }))
    } catch {
      setFailed((f) => ({ ...f, [saver.staffId]: true }))
    }
  }

  return (
    <section className="bg-card mb-6 flex max-w-3xl flex-col gap-3 rounded-xl border p-4">
      <header className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{t('tokenSaver.title')}</h2>
        <p className="text-muted-foreground text-xs">{t('tokenSaver.desc')}</p>
      </header>
      <ul className="flex flex-col divide-y divide-dashed">
        {savers.map((saver) => {
          const s = staff.find((x) => x.id === saver.staffId)
          const isChanged = !!changed[saver.staffId]
          return (
            <li key={saver.staffId} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <Avatar avatar={s?.avatar ?? 0} name={s?.name ?? ''} className="size-7 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="truncate font-medium">{s?.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{t('tokenSaver.tokens', { n: formatTokens(saver.tokens) })}</span>
                </div>
                <div className="text-muted-foreground text-xs">{t(`tokenSaver.reason.${saver.reason}`)}</div>
                {failed[saver.staffId] && <div className="text-status-error text-xs">{t('tokenSaver.failed')}</div>}
              </div>
              <div className="phone:w-36 flex w-60 shrink-0 flex-col items-end gap-0.5 text-right">
                {isChanged ? (
                  <span className="text-xs">
                    {t('tokenSaver.done')} ·{' '}
                    <button type="button" className="focus-ring text-primary underline-offset-2 hover:underline" onClick={() => void apply(saver, true)}>
                      {t('tokenSaver.undo')}
                    </button>
                  </span>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void apply(saver, false)}>
                      {t('tokenSaver.save')}
                    </Button>
                    <span className="text-muted-foreground text-[11px]">{saver.action.kind === 'model' ? t('tokenSaver.hint.model', { to: claudeModelName(saver.action.to) }) : t('tokenSaver.hint.memory')}</span>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
