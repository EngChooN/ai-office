import { Fragment } from 'react'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { JumpToBottom, useStickToBottom } from '@/components/stick-to-bottom'
import { Markdown } from '@/components/markdown'
import { AttachmentView } from '@/components/attachments'
import { meetingChairId, meetingProgress, roundBreakAt, type MeetingProgress } from '@shared/meetingProgress'
import type { Meeting, MeetingMessage, Staff } from '@shared/types'
import { t, fmtDate } from '@shared/i18n'
import { Avatar } from './StaffCard'
import { DecisionBox, EndMeetingButtons } from './MeetingPage'

/** 진행자 id: 팀장·프로젝트 리드인 참석자, 없으면 첫 참석자 */
export function useMeetingChairId(m: Meeting) {
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  return meetingChairId(m.participantIds, (id) => teams.some((tm) => tm.leadId === id) || labs.some((l) => l.leadId === id))
}

type Line = { kind: 'msg'; msg: MeetingMessage; i: number; ts: number } | { kind: 'decision'; id: string; ts: number }

/** 회의 중 화면 (A안): 참석자 줄·바퀴 막대 → 발언(새 발언은 아래로 쌓이고 바닥 근처면 따라간다) → 아래 고정 끝내기 */
export function MeetingLive({ meeting: m, progress }: { meeting: Meeting; progress: MeetingProgress }) {
  const staff = useOffice((s) => s.staff)
  const chairId = useMeetingChairId(m)
  const byId = (id: string | null) => staff.find((x) => x.id === id)
  const chair = byId(chairId)
  const k = m.participantIds.length
  // 발언과 결정 요청을 시간 순서로 한 줄에
  const lines: Line[] = [...m.messages.map((msg, i) => ({ kind: 'msg' as const, msg, i, ts: msg.ts })), ...(m.decisions ?? []).map((d) => ({ kind: 'decision' as const, id: d.id, ts: d.ts }))].sort((a, b) => a.ts - b.ts)
  const scroll = useStickToBottom(lines, (l) => (l.kind === 'msg' ? `m${l.i}` : `d${l.id}`), m.id)
  const speaker = byId(progress.speakingId)
  const nameOf = (id: string) => byId(id)?.name ?? m.messages.find((x) => x.staffId === id)?.name ?? ''

  return (
    <section className="bg-card flex min-h-[28rem] flex-col overflow-hidden rounded-xl border phone:min-h-0 phone:flex-1">
      <header className="flex flex-col gap-3 border-b p-4 phone:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', progress.state === 'decision' ? 'bg-status-waiting text-background' : 'bg-primary text-primary-foreground')}>
            {progress.state === 'decision' ? t('meeting.status.waiting') : progress.state === 'minutes' ? t('meeting.live.badgeMinutes') : t('meeting.live.badge')}
          </span>
          <h2 className="min-w-0 font-semibold break-words">{m.topic}</h2>
          {chair && <span className="text-muted-foreground text-xs">· {t('meeting.live.chair', { name: chair.name })}</span>}
        </div>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 phone:flex-col-reverse">
          <Attendees ids={m.participantIds} progress={progress} staff={staff} nameOf={nameOf} />
          <RoundBar progress={progress} k={k} />
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <div ref={scroll.ref} onScroll={scroll.onScroll} className="absolute inset-0 overflow-y-auto">
          <div ref={scroll.contentRef} className="flex min-h-full flex-col justify-end gap-3 p-4 phone:p-3">
            {lines.map((l) => {
              if (l.kind === 'decision') {
                const d = m.decisions?.find((x) => x.id === l.id)
                return d ? <DecisionBox key={l.id} meeting={m} decision={d} /> : null
              }
              const round = roundBreakAt(l.i, k)
              return (
                <Fragment key={`m${l.i}`}>
                  {round && <RoundBreak n={round} />}
                  <Speech msg={l.msg} who={byId(l.msg.staffId)} />
                </Fragment>
              )
            })}
            {progress.state === 'speaking' && speaker && <Typing who={speaker} />}
            {progress.state === 'minutes' && chair && <p className="text-muted-foreground text-xs motion-safe:animate-pulse">{t('meeting.live.minutes', { name: chair.name })}</p>}
          </div>
        </div>
        <JumpToBottom isNear={scroll.isNear} unread={scroll.unread} onClick={() => scroll.scrollToBottom(true)} />
      </div>
      {/* 끝내기는 화면 아래에 붙여 둔다 (회의록을 쓰는 중엔 이미 끝내는 중) */}
      {progress.state !== 'minutes' && <EndMeetingButtons meetingId={m.id} className="bg-card border-t px-4 py-3 phone:pb-[max(0.75rem,env(safe-area-inset-bottom))]" />}
    </section>
  )
}

/** 참석자 줄: 말하는 사람은 테두리+"말하는 중", 이번 바퀴를 마친 사람은 ✓·흐리게, 다음 사람은 "다음" */
function Attendees({ ids, progress, staff, nameOf }: { ids: string[]; progress: MeetingProgress; staff: Staff[]; nameOf: (id: string) => string }) {
  return (
    <ul className="flex min-w-0 gap-3 overflow-x-auto pb-1 phone:w-full">
      {ids.map((id) => {
        const s = staff.find((x) => x.id === id)
        const isSpeaking = progress.speakingId === id
        const isDone = progress.doneIds.includes(id)
        const isNext = progress.nextId === id
        return (
          <li key={id} className="flex w-14 shrink-0 flex-col items-center gap-1 text-center" aria-current={isSpeaking ? 'true' : undefined}>
            <span className={cn('relative rounded-full p-0.5', isSpeaking && 'ring-primary ring-2', isDone && !isSpeaking && 'opacity-50')}>
              <Avatar avatar={s?.avatar ?? 0} name={s?.name ?? nameOf(id)} teamId={s?.teamId} className="size-9" />
              {isDone && !isSpeaking && (
                <span className="bg-status-working text-background absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full" aria-label={t('meeting.live.done')}>
                  <CheckIcon className="size-3" />
                </span>
              )}
            </span>
            <span className={cn('w-full truncate text-[11px]', isSpeaking && 'font-semibold')}>{s?.name ?? nameOf(id)}</span>
            {isSpeaking && <span className="text-primary text-[10px] font-medium">{t('meeting.live.speaking')}</span>}
            {isNext && !isSpeaking && <span className="text-muted-foreground text-[10px]">{progress.state === 'decision' ? t('meeting.live.decision') : t('meeting.live.next')}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** 몇 바퀴째 막대: 칸 하나 = 한 바퀴, 지금 바퀴는 말한 사람 수만큼 채운다 */
function RoundBar({ progress, k }: { progress: MeetingProgress; k: number }) {
  return (
    <div className="flex min-w-48 flex-1 flex-col gap-1.5 phone:w-full">
      <span className="text-xs font-medium tabular-nums">{t('meeting.live.round', { n: progress.round, total: progress.rounds })}</span>
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={progress.rounds * k} aria-valuenow={(progress.round - 1) * k + progress.spokenInRound}>
        {Array.from({ length: progress.rounds }, (_, i) => {
          const fill = i + 1 < progress.round ? 1 : i + 1 === progress.round ? progress.spokenInRound / k : 0
          return (
            <span key={i} className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <span className="bg-primary block h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${Math.round(fill * 100)}%` }} />
            </span>
          )
        })}
      </div>
    </div>
  )
}

function RoundBreak({ n }: { n: number }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-[11px]" role="separator">
      <span className="bg-border h-px flex-1" />
      {t('meeting.live.roundBreak', { n })}
      <span className="bg-border h-px flex-1" />
    </div>
  )
}

function Speech({ msg, who }: { msg: MeetingMessage; who: Staff | undefined }) {
  return (
    <div className="flex gap-2">
      <Avatar avatar={who?.avatar ?? 0} name={who?.name ?? msg.name} teamId={who?.teamId} className="size-8" />
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">{msg.name}</span> {fmtDate(msg.ts, { hour: '2-digit', minute: '2-digit' })}
        </div>
        <Markdown className="bg-background mt-1 rounded-lg border px-3 py-2 text-sm">{msg.text}</Markdown>
        {msg.attachments?.length ? (
          <div className="mt-1.5">
            <AttachmentView attachments={msg.attachments} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 지금 말하는 사람 자리: 점 세 개 (움직임 줄이기면 멈춘 점) */
function Typing({ who }: { who: Staff }) {
  return (
    <div className="flex gap-2" aria-live="polite">
      <span className="ring-primary rounded-full ring-2">
        <Avatar avatar={who.avatar} name={who.name} teamId={who.teamId} className="size-8" />
      </span>
      <div>
        <div className="text-xs">
          <span className="font-medium">{who.name}</span> <span className="text-primary">{t('meeting.live.speaking')}</span>
        </div>
        <span className="bg-background mt-1 inline-flex gap-1 rounded-full border px-3 py-2" aria-hidden>
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="bg-primary size-1.5 rounded-full motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
      </div>
    </div>
  )
}
