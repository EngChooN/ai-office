import { useState } from 'react'
import { AlertCircleIcon, GaugeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOffice } from '@/store'
import type { Staff } from '@shared/types'
import { fmtDate, fmtNumber, t } from '@shared/i18n'
import { Avatar } from './StaffCard'

/** 요금제 사용량이 이만큼(%) 넘으면 노란 알림 */
const PLAN_ALERT_PERCENT = 80
const PLAN_HIDDEN_KEY = 'office:planAlertHiddenDay'

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

function resetTime(at: number) {
  const d = new Date(at)
  const isToday = d.toDateString() === new Date().toDateString()
  return fmtDate(d, isToday ? { hour: 'numeric', minute: '2-digit' } : { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** 빨강: 문제로 멈춘 직원 (닫기 없음 — 고치면 사라진다). 2명 이상이면 한 줄로 합쳐 '문제' 걸러보기로 */
function ErrorAlert({ errored, onShowErrors }: { errored: Staff[]; onShowErrors: () => void }) {
  const select = useOffice((s) => s.select)
  const setStaffDraft = useOffice((s) => s.setStaffDraft)
  const one = errored.length === 1 ? errored[0] : null
  return (
    <div role="alert" className="bg-status-error/10 border-status-error/30 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-2 text-sm">
      {one ? <Avatar avatar={one.avatar} name={one.name} teamId={one.teamId} className="size-5" /> : <AlertCircleIcon className="text-status-error size-4 shrink-0" />}
      <p className="min-w-0 flex-1 truncate">
        <b>{one ? t('alertBar.error.one', { name: one.name }) : t('alertBar.error.many', { n: fmtNumber(errored.length) })}</b>
        {one?.activity && <span className="text-muted-foreground"> — {one.activity}</span>}
      </p>
      {one ? (
        <>
          <Button
            size="sm"
            className="bg-status-error hover:bg-status-error/90 h-7 text-xs text-white"
            onClick={() => {
              // 카드의 '다시 시도'와 같다 — 패널을 열고 지시창만 채운다 (보내기는 대표가)
              select(one.id)
              setStaffDraft({ staffId: one.id, text: t('staffCard.retryDraft') })
            }}
          >
            {t('alertBar.retry')}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => select(one.id)}>
            {t('alertBar.details')}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onShowErrors}>
          {t('alertBar.view')}
        </Button>
      )}
    </div>
  )
}

/** 노랑: 요금제 사용량 80% 이상 — '오늘은 그만 보기'는 날짜별로 이 기기에 기억 */
function PlanAlert() {
  const planUsage = useOffice((s) => s.planUsage)
  const setView = useOffice((s) => s.setView)
  const [hiddenDay, setHiddenDay] = useState(() => localStorage.getItem(PLAN_HIDDEN_KEY))
  const top = planUsage.filter((p) => p.percent !== null).sort((a, b) => b.percent! - a.percent!)[0]
  if (!top || top.percent! < PLAN_ALERT_PERCENT || hiddenDay === dayKey()) return null
  const hide = () => {
    const today = dayKey()
    localStorage.setItem(PLAN_HIDDEN_KEY, today)
    setHiddenDay(today)
  }
  const percent = fmtNumber(top.percent!)
  return (
    <div role="status" className="bg-status-waiting/10 border-status-waiting/30 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-2 text-sm">
      <GaugeIcon className="text-status-waiting size-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate">
        <b>{t('alertBar.plan.title')}</b>
        <span className="text-muted-foreground"> — {top.resetsAt ? t('alertBar.plan.detail', { n: percent, time: resetTime(top.resetsAt) }) : t('alertBar.plan.detailNoTime', { n: percent })}</span>
      </p>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setView('payroll')}>
        {t('alertBar.plan.viewCost')}
      </Button>
      <Button size="sm" variant="ghost" className="text-muted-foreground h-7 text-xs" onClick={hide}>
        {t('alertBar.plan.hideToday')}
      </Button>
    </div>
  )
}

/** 직원 목록 맨 위 알림 줄(최대 2줄) — 문제 생김·요금제 많이 씀. 일이 있을 때만 보인다 */
export function AlertBar({ staff, onShowErrors }: { staff: Staff[]; onShowErrors: () => void }) {
  const errored = staff.filter((s) => s.status === 'error')
  return (
    <div className="flex min-w-0 flex-col gap-2 empty:hidden">
      {errored.length > 0 && <ErrorAlert errored={errored} onShowErrors={onShowErrors} />}
      <PlanAlert />
    </div>
  )
}
