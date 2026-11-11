import { cn } from '@/lib/utils'
import { t, type TKey } from '@shared/i18n'
import type { ApprovalWaitReason } from '@shared/types'
import { DuoIcon } from '@/components/duo-icon'

/** 기다리는 이유별 문구 — 이유가 늘면 여기 키가 빠져 typecheck에서 걸린다 */
const WAIT_REASON_KEY: Record<ApprovalWaitReason, TKey> = {
  risky: 'approval.wait.risky',
  command: 'approval.wait.command',
  'danger-path': 'approval.wait.danger-path',
  capture: 'approval.wait.capture',
  browser: 'approval.wait.browser',
  computer: 'approval.wait.computer',
  mcp: 'approval.wait.mcp',
  url: 'approval.wait.url',
  question: 'approval.wait.question',
  'written-file': 'approval.wait.written-file',
  'build-script': 'approval.wait.build-script',
}

/** 결재 카드: 자동결재·자율 진행 중인데도 기다리는 이유 한 줄. 평소 결재(이유 없음)엔 아무것도 그리지 않는다 */
export function WaitReasonLine({ reason, className }: { reason?: ApprovalWaitReason; className?: string }) {
  if (!reason) return null
  return <div className={cn('text-muted-foreground text-xs', className)}><DuoIcon name="pause" size={12} className="mr-1" />{t(WAIT_REASON_KEY[reason])}</div>
}
