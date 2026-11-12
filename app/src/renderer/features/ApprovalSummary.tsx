import { useId, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tr, trOr } from '@shared/i18n'
import { toolDisplayName } from '@shared/computerTools'
import { approvalSummaryView } from '@shared/approvalAiGuess'
import type { Approval } from '@shared/types'
import { WaitReasonLine } from './WaitReasonLine'

const RAW_BOX = 'text-muted-foreground selectable max-h-32 overflow-auto rounded p-2 font-mono text-[11px] break-all whitespace-pre-wrap'

/**
 * 결재 카드 본문(질문·다른 PC 변경 묶음 제외): 제목 → AI 추정 → 기다리는 이유 → 복원됨 → 원문.
 * 효과 문장(effectI18n)이 있으면 그게 제목이다. 확실한 효과 문장이면 원문을 접고, 결과를 모른다는 문장·AI 추정이면 원문을 펼쳐 둔다(approvalSummaryView).
 * boxClassName: 원문 박스 바탕 (카드 바탕이 bg-muted인 곳은 bg-card로 뒤집는다)
 */
export function ApprovalSummary({ approval: a, boxClassName = 'bg-muted' }: { approval: Approval; boxClassName?: string }) {
  const id = useId()
  const [isOpen, setIsOpen] = useState(false)
  const raw = trOr(a.summaryI18n, a.summary)
  const isCommand = a.toolName === 'Bash'
  const view = approvalSummaryView(a)
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm font-medium break-keep [overflow-wrap:anywhere]">{view.headline ? tr(view.headline) : toolDisplayName(a.toolName)}</div>
      {view.guess && <div className="text-muted-foreground text-xs break-keep [overflow-wrap:anywhere]">{tr(view.guess)}</div>}
      <WaitReasonLine reason={a.waitReason} />
      {a.isRestored && <div className="text-muted-foreground text-xs">↻ {t('approval.restored')}</div>}
      {!view.rawOpen ? (
        <>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={id}
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center gap-0.5 self-start text-xs font-medium whitespace-nowrap opacity-70 hover:opacity-100"
          >
            {t(isOpen ? (isCommand ? 'approval.effect.hideCommand' : 'approval.effect.hideContent') : isCommand ? 'approval.effect.showCommand' : 'approval.effect.showContent')}
            <ChevronDownIcon className={cn('size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none', isOpen && 'rotate-180')} />
          </button>
          {isOpen && <pre id={id} className={cn(RAW_BOX, boxClassName)}>{raw}</pre>}
        </>
      ) : (
        <pre className={cn(RAW_BOX, boxClassName)}>{raw}</pre>
      )}
    </div>
  )
}
