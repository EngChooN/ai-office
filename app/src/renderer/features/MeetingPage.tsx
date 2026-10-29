import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CheckIcon, ChevronDownIcon, FlaskConicalIcon, MinusIcon, PresentationIcon, SquareIcon, UsersIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { useOffice } from '@/store'
import { isMeetingLive, type Meeting, type MeetingDecision } from '@shared/types'
import { t, fmtDate, type TKey } from '@shared/i18n'
import { Avatar, PracticeBadge } from './StaffCard'
import { useTutorialMeetingId, useTutorialStep } from './Tutorial'
import { Markdown } from '@/components/markdown'
import { AttachmentView } from '@/components/attachments'
import { buildGroups, groupState, toggleGroup, type PickGroup } from './meetingPick'
import { meetingRoomOf, nextMeetingRoomLevel } from '@shared/officeLevel'
import { CEO_NAME, decisionView, type DecisionState, type DecisionView } from '@shared/meetingDecisions'

/** 이 인원을 넘으면 회의가 오래 걸린다고 알려 준다 (모두가 바퀴마다 한 번씩 발언) */
const LONG_MEETING = 10
const ROUND_OPTIONS = [1, 2, 3]
const STATUS_LABEL: Record<Meeting['status'], TKey> = {
  running: 'meeting.status.running',
  waiting: 'meeting.status.waiting',
  done: 'meeting.status.done',
  failed: 'meeting.status.failed',
  stopped: 'meeting.status.stopped',
}

/** 회의실: 직원 여럿을 불러 한 주제로 돌아가며 발언하고, 회의록·할 일을 남긴다 */
export function MeetingPage() {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const meetings = useOffice((s) => s.meetings)
  const [topic, setTopic] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [rounds, setRounds] = useState(2)
  const [openId, setOpenId] = useState<string | null>(null)
  const running = meetings.find(isMeetingLive)
  const preset = useOffice((s) => s.meetingPreset)
  const setMeetingPreset = useOffice((s) => s.setMeetingPreset)
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  const groups = useMemo(() => buildGroups(staff, teams, labs), [staff, teams, labs])
  const [notice, setNotice] = useState<string | null>(null)
  // 튜토리얼에서 회의 시작을 건너뛰었어도 '할 일로 올리기' 단계에선 연습 회의를 펼쳐 둔다
  const tutorialMeetingId = useTutorialMeetingId()
  const isTodoStep = useTutorialStep() === 'b3'
  // 회의실이 클수록(회사 레벨) 더 많이 부를 수 있다
  const level = useOffice((s) => s.company.level)
  const capacity = meetingRoomOf(level).capacity
  const nextLevel = nextMeetingRoomLevel(level)

  // 인원 초과 안내는 몇 초 뒤 사라진다
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  // 랩 카드의 "랩 회의"에서 넘어오면 주제·참석자를 미리 채운다
  useEffect(() => {
    if (!preset) return
    setTopic(preset.topic)
    setPicked(preset.participantIds.slice(0, capacity))
    setMeetingPreset(null)
  }, [preset, setMeetingPreset, capacity])

  const toggle = (id: string) => {
    setNotice(null)
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < capacity ? [...p, id] : p))
  }
  const handleGroup = (g: PickGroup) => {
    const r = toggleGroup(picked, g, capacity)
    setPicked(r.picked)
    setNotice(r.skipped === 0 ? null : r.added === 0 ? t('meeting.notice.full', { capacity }) : t('meeting.notice.partial', { capacity, total: r.added + r.skipped, added: r.added }))
  }
  const isFull = picked.length >= capacity
  const handleStart = async (e: FormEvent) => {
    e.preventDefault()
    if (!topic.trim() || picked.length < 2) return
    const m = await window.office.startMeeting({ topic: topic.trim(), participantIds: picked, rounds })
    setOpenId(m.id)
    setTopic('')
    setPicked([])
    setNotice(null)
  }

  return (
    <Page title={t('meeting.title')} description={t('meeting.description')}>
      <form onSubmit={handleStart} className="bg-card mb-6 flex max-w-3xl flex-col gap-3 rounded-xl border p-4">
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('meeting.topicPlaceholder')} disabled={Boolean(running)} />
        {groups.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="text-muted-foreground w-8 shrink-0 pt-1.5 text-xs">{t('meeting.groups')}</span>
            <div className="flex flex-wrap items-center gap-2">
              {groups.map((g, i) => (
                <GroupChip key={g.key} group={g} picked={picked} max={capacity} isFull={isFull} divider={i > 0 && g.kind !== groups[i - 1].kind} onClick={() => handleGroup(g)} />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-start gap-3">
          <span className="text-muted-foreground w-8 shrink-0 pt-1.5 text-xs">{t('meeting.staff')}</span>
          <div className="flex flex-wrap gap-2">
            {staff.length === 0 && <span className="text-muted-foreground text-xs">{t('meeting.noStaff')}</span>}
            {staff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                aria-pressed={picked.includes(s.id)}
                className={cn('phone:min-h-9 flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs', picked.includes(s.id) && 'border-primary bg-accent')}
              >
                <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-6" /> {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs">
          <span className={cn('tabular-nums', isFull ? 'text-status-waiting' : 'text-muted-foreground')}>
            {t('meeting.attendance', { count: picked.length, capacity })}
            {picked.length < 2 && ` · ${t('meeting.minTwo')}`}
          </span>
          {isFull && nextLevel && (
            <span className="text-muted-foreground ml-2">
              · {t('meeting.roomGrows', { level: nextLevel, capacity: meetingRoomOf(nextLevel).capacity })}
            </span>
          )}
          {picked.length > LONG_MEETING && <span className="text-status-waiting ml-2">· {t('meeting.tooMany', { count: picked.length })}</span>}
          {notice && <span className="text-status-waiting ml-2">{notice}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">{t('meeting.rounds')}</span>
          {ROUND_OPTIONS.map((r) => (
            <button key={r} type="button" onClick={() => setRounds(r)} className={cn('rounded-md border px-2 py-0.5 text-xs', rounds === r && 'border-primary bg-accent')}>
              {t('meeting.roundN', { n: r })}
            </button>
          ))}
          <Button type="submit" size="sm" className="ml-auto" disabled={!topic.trim() || picked.length < 2 || Boolean(running)} data-tour="tut-meeting-start">
            <PresentationIcon /> {running ? t('meeting.inProgress') : t('meeting.start')}
          </Button>
        </div>
      </form>

      <div className="flex max-w-3xl flex-col gap-3">
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} isOpen={openId === m.id || isMeetingLive(m) || (isTodoStep && m.id === tutorialMeetingId)} onToggle={() => setOpenId(openId === m.id ? null : m.id)} />
        ))}
      </div>
    </Page>
  )
}

/** 팀·랩 칩: 구성원 선택 정도에 따라 해제·부분선택·선택 3가지 상태 */
function GroupChip({ group: g, picked, max, isFull, divider, onClick }: { group: PickGroup; picked: string[]; max: number; isFull: boolean; divider: boolean; onClick: () => void }) {
  const { state, selected } = groupState(g, picked, max)
  const Icon = g.kind === 'team' ? UsersIcon : FlaskConicalIcon
  const total = g.memberIds.length
  const dimmed = isFull && state !== 'on'
  return (
    <>
      {divider && <span aria-hidden className="bg-border h-5 w-px" />}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={state === 'on' ? true : state === 'partial' ? 'mixed' : false}
        title={dimmed ? t('meeting.group.full', { max }) : g.kind === 'team' ? t('meeting.group.team', { count: total }) : t('meeting.group.lab', { count: total })}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
          state === 'partial' && 'border-primary bg-accent/50 border-dashed',
          state === 'on' && 'border-primary bg-accent',
          dimmed && 'opacity-50',
        )}
      >
        <Icon className="size-3.5 shrink-0" style={{ color: g.color }} />
        <span className="max-w-[10rem] truncate">{g.name}</span>
        <span className="text-muted-foreground tabular-nums">{selected > 0 && selected < total ? `${selected}/${total}` : total}</span>
        {state === 'partial' && <MinusIcon className="size-3" />}
        {state === 'on' && <CheckIcon className="size-3" />}
      </button>
    </>
  )
}

function MeetingCard({ meeting: m, isOpen, onToggle }: { meeting: Meeting; isOpen: boolean; onToggle: () => void }) {
  const staff = useOffice((s) => s.staff)
  // 튜토리얼 회의: 결정을 할 일로 올리는 단계에서만 버튼을 보인다
  const isTutorialMeeting = useTutorialMeetingId() === m.id
  const tutorialStep = useTutorialStep()
  return (
    <div className="bg-card rounded-xl border">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <span
          className={cn(
            'rounded px-1.5 text-[11px] font-semibold',
            m.status === 'running' && 'bg-primary text-primary-foreground animate-pulse',
            m.status === 'waiting' && 'bg-status-waiting animate-pulse text-background',
            !isMeetingLive(m) && 'bg-muted',
          )}
        >
          {t(STATUS_LABEL[m.status])}
        </span>
        {m.isPractice && <PracticeBadge className="text-[11px]" />}
        <span className="flex-1 font-medium">{m.topic}</span>
        <span className="text-muted-foreground text-xs">{fmtDate(m.createdAt, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </button>
      {/* 연습 회의는 대본이 끝내므로 끝내기 버튼을 두지 않는다 */}
      {isMeetingLive(m) && !m.isPractice && <EndMeetingButtons meetingId={m.id} className="px-4 pb-3" />}
      {isOpen && (
        <div className="flex flex-col gap-3 border-t p-4">
          {m.messages.map((msg, i) => {
            const s = staff.find((x) => x.id === msg.staffId)
            return (
              <div key={i} className="flex gap-2">
                <Avatar avatar={s?.avatar ?? 0} name={s?.name} teamId={s?.teamId} className="size-7" />
                <div className="min-w-0">
                  <div className="text-muted-foreground text-xs">{msg.name}</div>
                  <Markdown className="text-sm">{msg.text}</Markdown>
                  {msg.attachments?.length ? (
                    <div className="mt-1.5">
                      <AttachmentView attachments={msg.attachments} />
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          {(m.decisions ?? []).map((d) => (
            <DecisionBox key={d.id} meeting={m} decision={d} />
          ))}
          {m.status === 'running' && <p className="text-muted-foreground animate-pulse text-xs">{t('meeting.preparing')}</p>}
          {m.summary && (
            <div className="bg-muted rounded-lg p-3 text-sm">
              <div className="mb-1 text-xs font-semibold">{t('meeting.minutes')}</div>
              <Markdown>{m.summary}</Markdown>
              {isTutorialMeeting && tutorialStep === 'b3' && (
                <Button size="sm" className="mt-2" onClick={() => void window.office.tutorialAct({ type: 'createTodos' })} data-tour="tut-todos">
                  {t('tutorial.meeting.createTodos')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 마음이 바뀌면 회의를 중간에 끝낸다 — 지금 하는 발언까지만 듣고 멈춘다 */
export function EndMeetingButtons({ meetingId, className }: { meetingId: string; className?: string }) {
  const [ending, setEnding] = useState<'wrapup' | 'discard' | null>(null)
  const end = (mode: 'wrapup' | 'discard') => {
    setEnding(mode)
    void window.office.endMeeting(meetingId, mode)
  }
  if (ending) return <p className={cn('text-muted-foreground text-xs', className)}>{ending === 'wrapup' ? t('meeting.end.endingWrapup') : t('meeting.end.endingDiscard')}</p>
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button size="sm" variant="outline" onClick={() => end('wrapup')}>
        <SquareIcon /> {t('meeting.end.wrapup')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => end('discard')}>
        {t('meeting.end.discard')}
      </Button>
    </div>
  )
}

// 결정 상태별 색 (docs/specs/meeting-decisions-design.md 1절 매핑표) — 배경·좌측 보더·라벨
const DECISION_STYLE: Record<DecisionState, { box: string; label: string }> = {
  pending: { box: 'border-status-waiting bg-status-waiting/10', label: 'text-status-waiting bg-status-waiting/20' },
  direct: { box: 'border-l-status-working bg-status-working/10', label: 'text-status-working bg-status-working/20' },
  delegated: { box: 'border-l-primary bg-muted/40', label: 'text-primary bg-primary/15' },
  ended: { box: 'border-l-status-idle bg-muted/40', label: 'text-muted-foreground bg-muted' },
  unanswered: { box: 'border-l-status-idle bg-muted/40', label: 'text-muted-foreground bg-muted' },
}

/** 결정 배지 문구 — decisionView().label은 요약·회의록용 한국어라 화면은 상태로 다시 만든다 */
function decisionLabel(view: DecisionView, meeting: Meeting) {
  switch (view.state) {
    case 'pending':
      return t('meeting.decision.label.pending')
    case 'direct':
      return t('meeting.decision.label.direct')
    case 'ended':
    case 'unanswered':
      return t('meeting.decision.label.unanswered')
    case 'delegated':
      if (view.deciderName) return t('meeting.decision.label.delegatedTo', { name: view.deciderName === CEO_NAME ? t('meeting.decision.ceo') : view.deciderName })
      if (view.isLegacy) return t('meeting.decision.label.delegatedNoRecord')
      return t(isMeetingLive(meeting) ? 'meeting.decision.label.delegatedDeciding' : 'meeting.decision.label.delegatedUndecided')
  }
}

/** 회의 중 대표(나)에게 온 결정 요청: 선택지·직접 입력·"알아서 정해". 답한 뒤엔 유형 라벨과 최종 선택을 보여 준다 */
export function DecisionBox({ meeting, decision }: { meeting: Meeting; decision: MeetingDecision }) {
  const [custom, setCustom] = useState('')
  const answer = (text: string) => void window.office.answerMeetingDecision(meeting.id, decision.id, text)
  const view = decisionView(decision, meeting)
  const isPending = view.state === 'pending'
  const style = DECISION_STYLE[view.state]
  // 위임인데 결정자를 모르면(옛 데이터·아직 못 정함) 라벨을 덜 강조한다
  const labelClass = view.state === 'delegated' && !view.deciderName ? 'text-muted-foreground bg-primary/15' : style.label
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border border-l-4 p-3 text-sm', style.box)}>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1">
          <span className="font-semibold">🙋 {decision.askedByName}</span>
          <span className="text-muted-foreground"> {t('meeting.decision.request')}</span>
        </span>
        <Badge className={cn('border-transparent', labelClass)}>{decisionLabel(view, meeting)}</Badge>
      </div>
      {/* 답하기 전엔 전문을 보고 답하도록 펼친 채로, 답한 결정만 2줄로 접는다 */}
      <DecisionQuestion text={view.question} isCollapsible={!isPending} />
      {isPending ? (
        <>
          {decision.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {decision.options.map((o) => (
                <Button key={o} size="sm" variant="outline" onClick={() => answer(o)}>
                  {o}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('meeting.decision.customPlaceholder')} className="h-8 text-xs" />
            <Button size="sm" onClick={() => answer(custom)} disabled={!custom.trim()}>
              {t('meeting.decision.answer')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => answer('')}>
              {t('meeting.decision.auto')}
            </Button>
          </div>
        </>
      ) : (
        view.choice && (
          <div className="flex flex-col gap-0.5 text-xs">
            <span>→ {view.choice}</span>
            {view.reason && <span className="text-muted-foreground">{view.reason}</span>}
          </div>
        )
      )}
    </div>
  )
}

const canAnimateHeight = () => CSS.supports('interpolate-size', 'allow-keywords') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 결정 질문: 접으면 2줄(…), '더 보기/접기' 버튼으로만 펼친다. 2줄 이하면 버튼을 그리지 않는다 */
function DecisionQuestion({ text, isCollapsible }: { text: string; isCollapsible: boolean }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  // 말줄임(…)은 접는 움직임이 끝난 뒤에 다시 건다
  const [isClamped, setIsClamped] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !isCollapsible) return
    const measure = () => setHasMore(el.scrollHeight > parseFloat(getComputedStyle(el).lineHeight) * 2 + 1)
    measure()
    // 창 크기·폰 회전으로 폭이 바뀌면 다시 잰다
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isCollapsible, text])
  const isFolding = isCollapsible && hasMore
  const toggle = () => {
    if (!isOpen) {
      setIsClamped(false)
      setIsOpen(true)
      return
    }
    setIsOpen(false)
    if (!canAnimateHeight()) setIsClamped(true)
  }
  return (
    <>
      <div
        id={id}
        ref={ref}
        onTransitionEnd={(e) => e.propertyName === 'height' && !isOpen && setIsClamped(true)}
        className={cn(
          'font-medium break-words whitespace-pre-wrap select-text',
          isFolding && 'overflow-hidden [interpolate-size:allow-keywords] transition-[height] motion-reduce:transition-none',
          isFolding && (isOpen ? 'h-auto duration-200 ease-out' : 'h-[2lh] duration-150 ease-in'),
          isCollapsible && isClamped && 'line-clamp-2',
        )}
      >
        {text}
      </div>
      {isFolding && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={isOpen}
          aria-controls={id}
          onClick={toggle}
          className="text-muted-foreground active:bg-accent h-7 self-start px-2 text-xs"
        >
          {isOpen ? t('meeting.question.collapse') : t('meeting.question.more')}
          <ChevronDownIcon className={cn('size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none', isOpen && 'rotate-180')} />
        </Button>
      )}
    </>
  )
}
