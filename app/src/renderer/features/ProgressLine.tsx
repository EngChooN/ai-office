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

/** 대기 메시지를 펼쳐 두는 최대 수 — 넘으면 "대기 N건"으로 접는다 */
const WAITING_OPEN_MAX = 3

/**
 * 대기 메시지: 일하는 중에 보내 앱이 들고 있는 지시 — 기록을 위로 스크롤해도 보이게 입력칸 바로 위(스크롤 영역 밖)에 둔다.
 * 마우스를 올리면(터치 화면은 늘) '지금 보내기'(하던 일을 멈추고 바로 전한다)·'취소'. 보내지면 기록에 지시로 들어가고 여기서 빠진다
 */
export function WaitingCards({ staffId, waiting }: { staffId: string; waiting: readonly { id: string; text: string }[] }) {
  const cards = waiting.map((w) => (
    <li key={w.id} className="group border-status-waiting/40 bg-status-waiting/10 flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-status-waiting flex items-center gap-1.5 text-[11px] font-medium">
          <span className="bg-status-waiting size-1.5 shrink-0 rounded-full" />
          {t('progress.waiting.label')}
        </span>
        <p title={w.text} className="line-clamp-2 min-w-0 text-xs break-words whitespace-pre-line">
          {w.text}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" onClick={() => void window.office.waitingAction(staffId, w.id, 'now')} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-2 py-1 text-[11px] font-medium">
          {t('progress.waiting.sendNow')}
        </button>
        <button type="button" onClick={() => void window.office.waitingAction(staffId, w.id, 'cancel')} className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md border px-2 py-1 text-[11px]">
          {t('progress.waiting.cancel')}
        </button>
      </div>
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
