import { cn } from '@/lib/utils'
import { t } from '@shared/i18n'
import type { Staff } from '@shared/types'

/** 연결이 끊겼거나 다시 짝지어야 하는 원격 직원 — 목록·카드·지도에서 회색으로 보인다 */
export const isRemoteDim = (staff: Pick<Staff, 'remote'>) => staff.remote?.state === 'offline' || staff.remote?.state === 'unpaired'

/** 다른 PC에 있는 직원 표시("원격"). 이 PC 직원이면 그리지 않는다. 끊김·다시 짝짓기는 회색 */
export function RemoteBadge({ staff, className }: { staff: Pick<Staff, 'remote'>; className?: string }) {
  const remote = staff.remote
  if (!remote) return null
  const title = `${t('peer.tag', { name: remote.peerName })} · ${t(`peer.state.${remote.state}`)}`
  return (
    <span
      title={title}
      className={cn('shrink-0 rounded border px-1.5 text-[10px] font-semibold', isRemoteDim(staff) ? 'text-muted-foreground border-muted-foreground/40' : 'border-primary/40 text-primary', className)}
    >
      {t('peer.badge')}
    </span>
  )
}
