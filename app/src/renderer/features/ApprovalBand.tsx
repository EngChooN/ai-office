import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Staff } from '@shared/types'
import { approvalHeadline } from '@shared/approvalEffect'
import { bandApproveId } from '@shared/approvalBand'
import { t } from '@shared/i18n'

/**
 * 세로 폰(slim:) 직원 패널: 결재 칸 대신 한 줄 띠 "결재 N건 · 첫 건 요약 · [승인] [보기]".
 * 보기는 기존 결재 카드 목록을 펼친다(onToggle). 승인은 bandApproveId가 허락한 1건에만 — 나머지는 펼쳐서 원문을 보고 처리
 */
export function ApprovalBand({ staff, isOpen, onToggle }: { staff: Staff; isOpen: boolean; onToggle: () => void }) {
  const first = staff.approvals[0]
  if (!first) return null
  const approveId = bandApproveId(staff.approvals)
  return (
    <div className="bg-status-waiting/10 slim:flex hidden min-h-11 shrink-0 items-center gap-2 border-b px-3 text-xs">
      <b className="text-status-waiting shrink-0">{t('staffPanel.approvals.title', { n: staff.approvals.length })}</b>
      <span className="min-w-0 flex-1 truncate">{first.questions ? first.questions[0]?.question : approvalHeadline(first)}</span>
      {approveId && !isOpen && (
        <Button size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => void window.office.decide(approveId, true)}>
          <CheckIcon /> {t('staffPanel.approvals.approve')}
        </Button>
      )}
      <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={onToggle} aria-expanded={isOpen}>
        {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />} {t(isOpen ? 'staffPanel.approvals.fold' : 'staffPanel.band.view')}
      </Button>
    </div>
  )
}
