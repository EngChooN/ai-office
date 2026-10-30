import type { Staff, StaffProgress } from '@shared/types'
import { PROGRESS_LABEL, PROGRESS_STATUS } from '@shared/progressView'
import { t } from '@shared/i18n'
import { cn } from '@/lib/utils'
import { Avatar } from './StaffCard'
import { STATUS_META } from './status'

/** 지시를 받은 직원이 답하기 전까지의 상태 한 줄 (#9) — 대화방(chat)과 직원 패널 업무 탭(panel)이 같이 쓴다 */
export function ProgressLine({ staff, progress, variant }: { staff: Pick<Staff, 'name' | 'avatar' | 'activity' | 'teamId'>; progress: StaffProgress; variant: 'chat' | 'panel' }) {
  const meta = STATUS_META[PROGRESS_STATUS[progress.state]]
  const detail = progress.state === 'working' && staff.activity ? staff.activity : ''
  const more = progress.queued > 0 ? t('progress.more', { count: progress.queued }) : ''
  const dot = <span className={cn('size-2 shrink-0 rounded-full', meta.dot, progress.state === 'working' && 'animate-pulse')} />

  if (variant === 'chat') {
    return (
      <div role="status" className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
        <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} className="size-5" />
        <span className="text-foreground max-w-[40%] min-w-0 truncate font-medium">{staff.name}</span>
        {dot}
        <span className={cn('min-w-0 truncate font-medium', meta.text)}>{t(PROGRESS_LABEL[progress.state])}</span>
        {detail && <span className="min-w-0 truncate">· {detail}</span>}
        {more && <span className="shrink-0">· {more}</span>}
      </div>
    )
  }

  return (
    <section role="status" className="border-b px-4 py-3 text-xs">
      <div className="flex items-center gap-2">
        {dot}
        <span className={cn('font-medium', meta.text)}>{t(PROGRESS_LABEL[progress.state])}</span>
        {more && <span className="text-muted-foreground ml-auto">{more}</span>}
      </div>
      {progress.text && <p className="mt-1 truncate">{progress.text}</p>}
      {detail && <p className="text-muted-foreground mt-0.5 truncate">{detail}</p>}
    </section>
  )
}
