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
        {progress.requestedBy && <span className="bg-muted text-muted-foreground truncate rounded px-1.5 py-0.5">{t('progress.helpFrom', { name: progress.requestedBy })}</span>}
        {more && <span className="text-muted-foreground ml-auto shrink-0">{more}</span>}
      </div>
      {progress.text && <p className="mt-1 truncate">{progress.text}</p>}
      {detail && <p className="text-muted-foreground mt-0.5 truncate">{detail}</p>}
    </section>
  )
}

/** 대기 중 카드에 펼쳐 두는 최대 수 — 넘으면 "대기 N건"으로 접는다 */
const WAITING_OPEN_MAX = 3

/** 일하는 중에 받아 줄 선 지시 — 기록을 위로 스크롤해도 보이게 입력칸 바로 위(스크롤 영역 밖)에 둔다. 처리를 시작하거나 대기열이 비면 progress에서 빠져 사라진다 */
export function WaitingCards({ waiting }: { waiting: readonly { text: string }[] }) {
  const cards = waiting.map((w, i) => (
    <li key={i} className="border-status-waiting/40 bg-status-waiting/10 flex min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2">
      <span className="text-status-waiting flex items-center gap-1.5 text-[11px] font-medium">
        <span className="bg-status-waiting size-1.5 shrink-0 rounded-full" />
        {t('progress.waiting.label')}
      </span>
      <p className="line-clamp-2 min-w-0 text-xs break-words">{w.text}</p>
      <span className="text-muted-foreground text-[11px]">{t('progress.queued')}</span>
    </li>
  ))
  return (
    <section aria-label={t('progress.waiting.list')} className="max-h-[40%] shrink-0 overflow-y-auto border-t px-4 py-2">
      {waiting.length > WAITING_OPEN_MAX ? (
        <details>
          <summary className="text-status-waiting cursor-pointer text-xs font-medium">{t('progress.more', { count: waiting.length })}</summary>
          <ol className="mt-2 flex flex-col gap-1.5">{cards}</ol>
        </details>
      ) : (
        <ol className="flex flex-col gap-1.5">{cards}</ol>
      )}
    </section>
  )
}
