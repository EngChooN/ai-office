import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Staff } from '@shared/types'
import { approvalHeadline } from '@shared/approvalEffect'
import { bandApproveId } from '@shared/approvalBand'
import { t } from '@shared/i18n'

/**
 * 직원 패널 대화 탭 위 한 줄 띠: "결재 N건이 기다려요 · 첫 건 요약 (외 n건) · [승인] [결재 보기]".
 * 결재 카드는 결재 탭에 있다. 승인은 bandApproveId가 허락한 간단하고 안전한 1건에만 — 나머지는 결재 탭에서 원문을 보고 처리
 */
export function ApprovalBand({ staff, onView }: { staff: Staff; onView: () => void }) {
  const first = staff.approvals[0]
  if (!first) return null
  const approveId = bandApproveId(staff.approvals)
  const head = first.questions ? (first.questions[0]?.question ?? '') : approvalHeadline(first)
  const rest = staff.approvals.length - 1
  return (
    <div className="bg-status-waiting/10 slim:min-h-11 slim:px-3 flex min-h-[30px] shrink-0 items-center gap-2 border-b px-4 py-1 text-xs">
      <b className="text-status-waiting shrink-0">{t('approvalTab.strip', { n: staff.approvals.length })}</b>
      <span className="text-muted-foreground min-w-0 flex-1 truncate">{rest > 0 ? t('approvalTab.stripMore', { first: head, n: rest }) : head}</span>
      {approveId && (
        <Button size="sm" className="slim:h-7 h-6 shrink-0 px-2 text-xs" onClick={() => void window.office.decide(approveId, true)}>
          <CheckIcon /> {t('staffPanel.approvals.approve')}
        </Button>
      )}
      <Button size="sm" variant="outline" className="slim:h-7 border-status-waiting/50 h-6 shrink-0 px-2 text-xs" onClick={onView}>
        {t('approvalTab.view')}
      </Button>
    </div>
  )
}
