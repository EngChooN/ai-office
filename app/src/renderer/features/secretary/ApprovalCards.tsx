import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOffice } from '@/store'
import { fmtDate, t } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'
import { decideOutcome, type DecideOutcome } from './decideOutcome'
import { ApprovalSummary } from '../ApprovalSummary'
import { Avatar } from '../StaffCard'

/** 비서 답 안의 결재 카드: 결재함(InboxPage)과 같은 본문(ApprovalSummary)·같은 처리(decide). 이미 처리된 결재는 "이미 처리됐어요" */
export function ApprovalCards({ ids }: { ids: string[] }) {
  const staff = useOffice((s) => s.staff)
  const [done, setDone] = useState<Record<string, DecideOutcome>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const found = new Map(staff.flatMap((s) => s.approvals.map((a) => [a.id, { a, s }] as const)))
  const decide = async (id: string, allow: boolean) => {
    if (busy[id]) return
    setBusy((b) => ({ ...b, [id]: true }))
    const outcome = await decideOutcome(() => window.office.decide(id, allow), allow)
    setBusy((b) => ({ ...b, [id]: false }))
    // 실패면 카드를 그대로 두고 문구만 (다시 눌러 볼 수 있게)
    setDone((d) => ({ ...d, [id]: outcome }))
  }
  return (
    <div className="flex flex-col gap-2">
      {ids.map((id) => {
        const hit = found.get(id)
        if (!hit || done[id] === 'approved' || done[id] === 'rejected')
          return (
            <div key={id} className="bg-muted/50 text-muted-foreground rounded-xl border px-3 py-2 text-xs">
              {done[id] ? t(`secretary.approvals.${done[id]}`) : t('secretary.approvals.gone')}
            </div>
          )
        const { a, s } = hit
        return (
          <div key={id} className="bg-card flex flex-col gap-2 rounded-xl border p-3">
            <div className="flex items-center gap-2 text-sm">
              <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-6" />
              <span className="font-semibold">{s.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {roleLabel(s.role)} · {fmtDate(a.createdAt, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {a.requestedBy && <div className="text-muted-foreground text-xs">{t('approval.requestedBy', { name: a.requestedBy })}</div>}
            <ApprovalSummary approval={a} boxClassName="bg-card" />
            {done[id] === 'failed' && <div className="text-destructive text-xs">{t('secretary.approvals.failed')}</div>}
            <div className="flex gap-2">
              <Button size="sm" disabled={busy[id]} onClick={() => void decide(id, true)}>
                <CheckIcon /> {t('inbox.approve')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy[id]} onClick={() => void decide(id, false)}>
                {t('inbox.reject')}
              </Button>
            </div>
          </div>
        )
      })}
      <button type="button" onClick={() => useOffice.getState().setView('inbox')} className="text-muted-foreground self-start text-xs underline-offset-2 hover:underline">
        {t('secretary.approvals.openInbox')}
      </button>
    </div>
  )
}
