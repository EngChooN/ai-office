import { CheckCheckIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/ui/page'
import { useOffice } from '@/store'
import { pendingMeetingDecisions } from '@shared/meetingDecisions'
import { DecisionBox, EndMeetingButtons } from './MeetingPage'
import { PlanCard } from './PlanCard'
import { QuestionBox, StopWorkButton } from './QuestionBox'
import { RunCard } from './RunCard'
import { Avatar } from './StaffCard'
import { AlwaysApproveButton, AutoHandledList } from './AutoApprove'
import { shortPath, workDirLabel } from './status'
import { fmtDate, t } from '@shared/i18n'

/** 결재함: 모든 직원의 권한 요청을 한곳에서 도장 찍는다 */
export function InboxPage() {
  const staff = useOffice((s) => s.staff)
  const select = useOffice((s) => s.select)
  const approvals = staff.flatMap((s) => s.approvals.map((a) => ({ ...a, staff: s }))).sort((a, b) => a.createdAt - b.createdAt)
  // 질문을 사무실로 받은 외부 직원은 위 질문 카드로 보여 준다
  const externalWaiting = staff.filter((s) => s.kind === 'external' && s.status === 'waiting' && s.approvals.length === 0)
  const meetings = useOffice((s) => s.meetings)
  const checkingRuns = useOffice((s) => s.runs).filter((r) => r.status === 'checking')
  const waitingPlans = useOffice((s) => s.tasks).filter((tk) => tk.plan?.status === 'waiting')
  const decisions = pendingMeetingDecisions(meetings)

  const handleAll = (allow: boolean) => {
    if (!allow && !window.confirm(t('inbox.confirmRejectAll'))) return
    // 질문은 답해야 하므로 모두 승인·반려에서 뺀다
    for (const a of approvals) if (!a.questions) void window.office.decide(a.id, allow)
  }

  return (
    <Page
      title={t('inbox.title')}
      description={t('inbox.description')}
      actions={
        approvals.length > 1 && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleAll(true)}>
              <CheckCheckIcon /> {t('inbox.approveAll')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleAll(false)}>
              {t('inbox.rejectAll')}
            </Button>
          </div>
        )
      }
    >
      {waitingPlans.length > 0 && (
        <div className="mb-6 flex max-w-3xl flex-col gap-3">
          <h2 className="text-status-waiting text-sm font-semibold">{t('inbox.section.plans')}</h2>
          {waitingPlans.map((tk) => (
            <PlanCard key={tk.id} task={tk} />
          ))}
        </div>
      )}
      {checkingRuns.length > 0 && (
        <div className="mb-6 flex max-w-3xl flex-col gap-3">
          <h2 className="text-status-waiting text-sm font-semibold">{t('inbox.section.runs')}</h2>
          {checkingRuns.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}
      {decisions.length > 0 && (
        <div className="mb-6 flex max-w-3xl flex-col gap-3">
          <h2 className="text-status-waiting text-sm font-semibold">{t('inbox.section.decisions')}</h2>
          {decisions.map(({ meeting, decision }) => (
            <div key={decision.id} className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">📋 {meeting.topic}</span>
              <DecisionBox meeting={meeting} decision={decision} />
              <EndMeetingButtons meetingId={meeting.id} />
            </div>
          ))}
        </div>
      )}
      {approvals.length === 0 && externalWaiting.length === 0 && decisions.length === 0 && checkingRuns.length === 0 && waitingPlans.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('inbox.empty')}</p>
      )}
      <div className="flex max-w-3xl flex-col gap-3">
        {approvals.map((a) => (
          <div key={a.id} className="bg-card flex items-start gap-3 rounded-xl border p-4">
            <button type="button" onClick={() => select(a.staff.id)}>
              <Avatar avatar={a.staff.avatar} name={a.staff.name} teamId={a.staff.teamId} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-semibold">{a.staff.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {a.staff.role} ·{' '}
                  {fmtDate(a.createdAt, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {a.questions ? (
                <div className="mt-2">
                  <QuestionBox approval={a} />
                </div>
              ) : (
                <>
                  <div className="mt-1 text-sm font-medium">{a.toolName}</div>
                  <pre className="bg-muted text-muted-foreground selectable mt-1 max-h-32 overflow-auto rounded p-2 font-mono text-xs break-all whitespace-pre-wrap">{a.summary}</pre>
                </>
              )}
            </div>
            {!a.questions && (
              <div className="flex flex-col gap-2">
                <Button size="sm" onClick={() => void window.office.decide(a.id, true)}>
                  <CheckIcon /> {t('inbox.approve')}
                </Button>
                <AlwaysApproveButton approval={a} staffName={a.staff.name} />
                <Button size="sm" variant="outline" onClick={() => void window.office.decide(a.id, false)}>
                  {t('inbox.reject')}
                </Button>
                {a.staff.kind === 'hired' && <StopWorkButton staffId={a.staff.id} />}
              </div>
            )}
          </div>
        ))}
        {externalWaiting.length > 0 && (
          <>
            <h2 className="text-muted-foreground mt-4 text-sm font-semibold">{t('inbox.externalWaiting')}</h2>
            {externalWaiting.map((s) => (
              <button key={s.id} type="button" onClick={() => select(s.id)} className="bg-card flex items-center gap-3 rounded-xl border p-3 text-left">
                <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {s.activity} · {workDirLabel(s)}
                  </div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
      {/* 자리 비운 동안 대신 처리한 것 */}
      <div className="mt-6">
        <AutoHandledList />
      </div>
    </Page>
  )
}
