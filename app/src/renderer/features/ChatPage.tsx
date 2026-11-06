import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, FlaskConicalIcon, MegaphoneIcon, MessagesSquareIcon, SendIcon, UsersIcon, ZapIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { AttachButton, AttachmentView, DraftAttachments, useDraftAttachments } from '@/components/attachments'
import { cn } from '@/lib/utils'
import { handleComposerKey, NEWLINE_HINT } from '@/lib/composerKeys'
import { commandDescription, commandItem, manualItem, SlashMenu, usePersonalManuals, useSlashKeys, useStaffCommands, type SlashMode } from '@/components/slash-menu'
import { matchCommands, runsOnEnter } from '@shared/slashCommands'
import { useOffice } from '@/store'
import type { Approval, ChatApproval, ChatApprovalResult, ChatMessage, ChatSendMode, Lab, Staff, StaffStatus, Team } from '@shared/types'
import { chatApprovalView } from '@shared/chatApproval'
import { chatLines, chatRoomMembers, chatRoomMentionTargets, findRoom, labRoomId, parseRoom, roomLabs, roomTeams, type ChatLine, type ChatRoomInfo } from '@shared/chatRooms'
import { ALL_MENTION, mentionTargets, mentionToken, OFFICE_SENDER, parseMentions, type MentionKind, type MentionTarget } from '@shared/mention'
import { fmtDate, t, type TKey } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'
import { Avatar } from './StaffCard'
import { Markdown } from '@/components/markdown'
import { MentionText, MentionTextarea, remarkMentions } from '@/components/mention-text'
import { JumpToBottom, useStickToBottom } from '@/components/stick-to-bottom'
import { QuestionBox } from './QuestionBox'
import { ProgressLine, WaitingCards } from './ProgressLine'
import { STATUS_META } from './status'
import { progressesForRoom } from '@shared/progressView'
import { AlwaysApproveButton } from './AutoApprove'

const MENTION_MAX = 6
const KIND_ORDER: MentionKind[] = ['all', 'team', 'lab', 'staff']
/** 자동완성 묶음 제목 */
const KIND_LABEL: Record<MentionKind, TKey> = { all: 'chat.kind.all', team: 'chat.kind.team', lab: 'chat.kind.lab', staff: 'chat.kind.staff' }
/** 처리된 결재·질문 말풍선에 붙는 결과 */
const RESULT_LABEL: Record<ChatApprovalResult, TKey> = {
  approved: 'chat.approval.approved',
  rejected: 'chat.approval.rejected',
  answered: 'chat.approval.answered',
  skipped: 'chat.approval.skipped',
  canceled: 'chat.approval.canceled',
  withdrawn: 'chat.approval.withdrawn',
  superseded: 'chat.approval.superseded',
}

type RoomInfo = ChatRoomInfo<Team, Lab>

/** 지금 보고 있는 팀·랩 방 (방이 없어진 팀·랩이면 전체 방) */
function useChatRoom(): RoomInfo | undefined {
  const chatRoom = useOffice((s) => s.chatRoom)
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  return useMemo(() => findRoom(chatRoom, teams, labs), [chatRoom, teams, labs])
}

/** 사무실 단체방: 직원 보고·결재 요청·위임이 채팅으로 흐르고, @직원·@팀·@랩·@전체 로 바로 지시한다. 전체 방 + 팀별 방 + 랩별 방 */
export function ChatPage() {
  const room = useChatRoom()
  const title = !room ? t('chat.title') : room.kind === 'lab' ? t('chat.labRoom.title', { lab: room.name }) : t('chat.room.title', { team: room.name })
  const description = t(!room ? 'chat.description' : room.kind === 'lab' ? 'chat.labRoom.description' : 'chat.room.description', { all: ALL_MENTION })
  return (
    <div className="flex h-full flex-col">
      <div className="phone:px-4 phone:py-3 short:py-1.5 typing:hidden border-b px-6 py-4">
        <h1 className="short:text-base text-lg font-semibold">{title}</h1>
        <p className="text-muted-foreground short:hidden text-xs">{description}</p>
        <RemoteLine />
        <RoomTabs current={room?.room} />
        <RoomStatusStrip room={room} />
      </div>
      <MessageList room={room?.room} />
      <Composer room={room} />
    </div>
  )
}

/** 상태 줄에 펼쳐 두는 사람 수 — 넘으면 "+N명"으로 접는다 */
const STRIP_MAX = 6
/** 일하는 사람·확인이 필요한 사람을 앞에 */
const STATUS_ORDER: Record<StaffStatus, number> = { working: 0, waiting: 1, error: 2, netWait: 3, idle: 4, offline: 5 }
/** 지시 요약 앞 머리말("[업무 보드] ", "[OO 랩] ")은 상태 줄에서 뺀다 */
const stripHead = (text: string) => text.replace(/^\[[^\]]+\]\s*/, '')

/**
 * 구성원 상태 줄 (방 제목 아래): 누가 무슨 일을 하는지 — 이 방에서 시킨 일뿐 아니라 업무 카드·1:1 지시로 하는 일도 보인다.
 * 팀·랩 방은 구성원 전원, 전체 방은 일하는 중·확인 필요·오류인 사람만. 마우스를 올리면 자세히, 누르면 직원 패널
 */
function RoomStatusStrip({ room }: { room: RoomInfo | undefined }) {
  const staff = useOffice((s) => s.staff)
  const select = useOffice((s) => s.select)
  const [isOpen, setIsOpen] = useState(false)
  const [tip, setTip] = useState<{ staff: Staff; rect: DOMRect } | null>(null)
  const people = useMemo(() => {
    const hired = staff.filter((s) => s.kind === 'hired' && !s.isPractice)
    const list = room ? chatRoomMembers(room, hired) : hired.filter((s) => s.status !== 'idle' && s.status !== 'offline')
    return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  }, [staff, room])
  if (people.length === 0) return null
  const shown = isOpen ? people : people.slice(0, STRIP_MAX)
  const tipStaff = tip && people.find((p) => p.id === tip.staff.id)
  return (
    <div aria-label={t('chat.status.list')} className={cn('short:hidden mt-2 flex gap-1.5', isOpen ? 'flex-wrap' : 'overflow-hidden')}>
      {shown.map((s) => {
        const meta = STATUS_META[s.status]
        const doing = s.status === 'working' ? stripHead(s.progress?.text ?? '') || s.activity : ''
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => select(s.id)}
            onMouseEnter={(e) => setTip({ staff: s, rect: e.currentTarget.getBoundingClientRect() })}
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => setTip({ staff: s, rect: e.currentTarget.getBoundingClientRect() })}
            onBlur={() => setTip(null)}
            className={cn(
              'bg-card hover:bg-accent flex max-w-60 min-w-0 shrink-0 items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs',
              s.status === 'working' && 'border-status-working/50',
              (s.status === 'waiting' || s.status === 'netWait') && 'border-status-waiting/50',
              s.status === 'error' && 'border-status-error/50',
            )}
          >
            <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-5" />
            <span className="shrink-0 font-medium">{s.name}</span>
            <span className={cn('size-2 shrink-0 rounded-full', meta.dot, s.status === 'working' && 'animate-pulse')} />
            <span className={cn('min-w-0 truncate', doing ? 'text-muted-foreground' : meta.text)}>{doing || meta.label}</span>
          </button>
        )
      })}
      {people.length > STRIP_MAX && (
        <button type="button" onClick={() => setIsOpen((v) => !v)} className="text-muted-foreground hover:bg-accent shrink-0 rounded-full border px-2.5 py-0.5 text-xs">
          {isOpen ? t('chat.status.less') : t('chat.status.more', { count: people.length - STRIP_MAX })}
        </button>
      )}
      {tip && tipStaff && createPortal(<StatusTip staff={tipStaff} rect={tip.rect} />, document.body)}
    </div>
  )
}

/** 상태 줄 칸에 마우스를 올리면 뜨는 설명: 맡은 일 · 지금 하는 것 · 뒤에 기다리는 일 */
function StatusTip({ staff: s, rect }: { staff: Staff; rect: DOMRect }) {
  const meta = STATUS_META[s.status]
  const task = s.progress?.text ? stripHead(s.progress.text) : ''
  const queued = s.progress?.queued ?? 0
  return (
    <div
      role="tooltip"
      className="bg-popover text-popover-foreground pointer-events-none fixed z-50 flex w-72 flex-col gap-1 rounded-lg border p-3 text-xs shadow-lg"
      style={{ left: Math.min(rect.left, window.innerWidth - 296), top: rect.bottom + 6 }}
    >
      <div className="flex items-center gap-1.5 font-medium">
        {s.name} · {roleLabel(s.role)}
        <span className={cn('ml-1 size-2 shrink-0 rounded-full', meta.dot)} />
        <span className={meta.text}>{meta.label}</span>
      </div>
      {task && (
        <>
          <span className="text-muted-foreground mt-1 text-[11px]">{t('chat.status.task')}</span>
          <p className="line-clamp-2">{task}</p>
        </>
      )}
      {s.status === 'working' && s.activity && (
        <>
          <span className="text-muted-foreground text-[11px]">{t('chat.status.now')}</span>
          <p className="line-clamp-2">{s.activity}</p>
        </>
      )}
      {queued > 0 && <span className="text-muted-foreground text-[11px]">{t('chat.status.queued', { count: queued })}</span>}
      <span className="text-primary mt-1 text-[11px]">{t('chat.status.open')}</span>
    </div>
  )
}

/** 이 방에서 보낸 대기 메시지 (일하는 직원에게 '끝나면 보내기'로 보낸 말) — 입력칸 바로 위 */
function RoomWaiting({ room }: { room: string | undefined }) {
  const staff = useOffice((s) => s.staff)
  const items = useMemo(
    () => staff.flatMap((s) => (s.progress?.waiting ?? []).filter((w) => (w.room ?? undefined) === (room || undefined)).map((w) => ({ ...w, staffId: s.id, name: s.name }))),
    [staff, room],
  )
  if (items.length === 0) return null
  return <WaitingCards items={items} className="mx-auto w-full max-w-3xl border-t-0 px-0" />
}

/** 다른 PC 직원이 랩에 있으면 "원격 · 피어명" 한 줄 (연결이 끊긴 PC는 흐리게) */
function RemoteLine() {
  const peers = useOffice(useShallow((s) => [...new Map(s.staff.flatMap((x) => (x.remote ? [[x.remote.peerId, `${x.remote.peerName}\t${x.remote.state}`] as const] : []))).values()]))
  if (peers.length === 0) return null
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 text-xs">
      {peers.map((p) => {
        const [name, state] = p.split('\t')
        const isDim = state === 'offline' || state === 'unpaired'
        return (
          <span key={p} className={isDim ? 'text-muted-foreground' : 'text-primary'} title={t(`peer.state.${state as 'online'}`)}>
            🌐 {t('peer.chatLine', { name })}
          </span>
        )
      })}
    </p>
  )
}

/** 방 목록: 전체 / 팀들 / 랩들 (project 종류·연습 팀, 연습 랩은 방이 없다) */
function RoomTabs({ current }: { current: string | undefined }) {
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const teamRooms = roomTeams(teams)
  const labRooms = roomLabs(labs)
  if (teamRooms.length === 0 && labRooms.length === 0) return null
  const tab = (key: string, label: string, isActive: boolean, onClick: () => void, color?: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs', isActive ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent text-muted-foreground')}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  )
  const groupLabel = (key: string, label: string) => (
    <span key={key} className="text-muted-foreground/70 ml-1 flex shrink-0 items-center text-[11px] font-medium">
      {label}
    </span>
  )
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]" role="tablist" aria-label={t('chat.rooms')}>
      {tab('all', t('chat.room.all'), !current, () => setChatRoom(null))}
      {teamRooms.length > 0 && groupLabel('group:teams', t('chat.room.groupTeams'))}
      {teamRooms.map((tm) => tab(tm.id, tm.name, current === tm.id, () => setChatRoom(tm.id), tm.color))}
      {labRooms.length > 0 && groupLabel('group:labs', t('chat.room.groupLabs'))}
      {labRooms.map((lb) => tab(labRoomId(lb.id), lb.name, current === labRoomId(lb.id), () => setChatRoom(labRoomId(lb.id)), lb.color))}
    </div>
  )
}

const lineKey = (l: ChatLine) => (l.kind === 'message' ? String(l.message.id) : `room:${l.room}:${l.lastId}`)

// 입력 중엔 메시지 목록이 다시 그려지지 않도록 목록과 입력창을 나눠 각자 구독한다
function MessageList({ room }: { room: string | undefined }) {
  const chat = useOffice((s) => s.chat)
  const staff = useOffice((s) => s.staff)
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  const select = useOffice((s) => s.select)
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const lines = useMemo(() => chatLines(chat, room), [chat, room])
  // 말풍선 속 @이름 강조: 지금 있는 직원·팀·랩 이름과 맞을 때만
  const hiredKey = staff.flatMap((s) => (s.kind === 'hired' && !s.isPractice ? [`${s.id}\t${s.name}\t${s.teamId ?? ''}`] : [])).join('\n')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 직원 상태가 바뀔 때마다 말풍선을 다시 그리지 않게 이름·팀이 바뀔 때만
  const hired = useMemo(() => staff.filter((s) => s.kind === 'hired' && !s.isPractice), [hiredKey])
  const mentions = useMemo(() => mentionTargets(hired, teams.filter((x) => !x.isPractice), labs.filter((x) => !x.isPractice)), [hired, teams, labs])
  // 아직 기다리는 결재·질문 — 말풍선에서 바로 처리한다
  const pendingById = useMemo(() => new Map(staff.flatMap((s) => s.approvals.map((a) => [a.id, a]))), [staff])
  const scroll = useStickToBottom(lines, lineKey, `chat:${room ?? ''}`)
  // 내가 보낸 말은 위를 읽던 중이어도 바로 보이게
  const lastLine = lines.at(-1)
  const last = lastLine?.kind === 'message' ? lastLine.message : undefined
  useEffect(() => {
    if (last?.from === 'me') scroll.scrollToBottom()
    // 새 말이 붙을 때만 본다 (상한 500에 닿아도 개수 대신 마지막 id로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroll.ref} onScroll={scroll.onScroll} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div ref={scroll.contentRef} className="mx-auto flex max-w-3xl flex-col gap-3">
          {lines.map((line) => {
            if (line.kind === 'roomSummary') {
              const info = findRoom(line.room, teams, labs)
              const isLab = parseRoom(line.room)?.kind === 'lab'
              return <RoomSummary key={`room:${line.room}:${line.firstId}`} info={info} isLab={isLab} count={line.count} onOpen={info ? () => setChatRoom(line.room) : undefined} />
            }
            const m = line.message
            const sender = staff.find((s) => s.id === m.from)
            return (
              <Bubble
                key={m.id}
                message={m}
                senderId={sender?.id}
                senderName={sender?.name ?? t('common.formerStaff')}
                senderAvatar={sender?.avatar ?? 0}
                senderTeamId={sender?.teamId ?? null}
                pendingApproval={m.approval && pendingById.get(m.approval.id)}
                mentions={mentions}
                onSelect={select}
              />
            )
          })}
          <ProgressLines room={room} />
        </div>
      </div>
      <JumpToBottom isNear={scroll.isNear} unread={scroll.unread} onClick={() => scroll.scrollToBottom(true)} />
    </div>
  )
}

/** 이 방에서 받은 지시를 아직 처리 중인 직원들 (#9) — 작업 내용이 바뀔 때 말풍선 목록이 다시 그려지지 않게 따로 구독한다 */
function ProgressLines({ room }: { room: string | undefined }) {
  const staff = useOffice((s) => s.staff)
  const working = useMemo(() => progressesForRoom(staff.filter((s) => s.kind === 'hired' && !s.isPractice), room), [staff, room])
  if (working.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      {working.map((s) => (
        <ProgressLine key={s.id} staff={s} progress={s.progress} variant="chat" />
      ))}
    </div>
  )
}

/** 전체 방에 접어 보여 주는 팀·랩 방 글 한 줄 — 누르면 그 방으로 */
function RoomSummary({ info, isLab, count, onOpen }: { info: RoomInfo | undefined; isLab: boolean; count: number; onOpen: (() => void) | undefined }) {
  const label = isLab ? t('chat.labRoom.summary', { lab: info?.name ?? t('chat.labRoom.deleted'), count }) : t('chat.room.summary', { team: info?.name ?? t('chat.room.deletedTeam'), count })
  const color = info ? (info.kind === 'lab' ? info.lab.color : info.team.color) : undefined
  return (
    <div className="flex justify-center">
      <button
        type="button"
        disabled={!onOpen}
        onClick={onOpen}
        className="text-muted-foreground hover:bg-accent flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs disabled:hover:bg-transparent"
      >
        <MessagesSquareIcon className="size-3.5 shrink-0" style={color ? { color } : undefined} />
        {label}
        {onOpen && <ChevronRightIcon className="size-3.5 shrink-0" />}
      </button>
    </div>
  )
}

// 직원 상태가 바뀌어도 보낸 사람 이름·아바타가 같으면 말풍선은 그대로 둔다
const Bubble = memo(function Bubble({
  message: m,
  senderId,
  senderName,
  senderAvatar,
  senderTeamId,
  pendingApproval,
  mentions,
  onSelect,
}: {
  message: ChatMessage
  senderId: string | undefined
  senderName: string
  senderAvatar: number
  senderTeamId: string | null
  pendingApproval: Approval | undefined
  mentions: MentionTarget[]
  onSelect: (id: string) => void
}) {
  const isMe = m.from === 'me'
  const plugins = useMemo(() => [remarkMentions(mentions)], [mentions])
  if (m.from === OFFICE_SENDER)
    return (
      <div className="flex justify-center">
        <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs">{m.text}</span>
      </div>
    )
  return (
    <div className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
      {!isMe && (
        <button type="button" onClick={() => senderId && onSelect(senderId)}>
          <Avatar avatar={senderAvatar} name={senderName} teamId={senderTeamId} className="size-8" />
        </button>
      )}
      <div className={cn('flex max-w-[75%] flex-col gap-0.5', isMe && 'items-end')}>
        {!isMe && <span className="text-muted-foreground text-xs">{senderName}</span>}
        <div className={cn('selectable min-w-0 rounded-2xl px-3 py-2 text-sm', isMe ? 'bg-primary text-primary-foreground whitespace-pre-wrap' : 'bg-card border')}>
          <FoldableText text={m.text}>{isMe ? <MentionText text={m.text} targets={mentions} onPrimary /> : <Markdown plugins={plugins}>{m.text}</Markdown>}</FoldableText>
          {m.attachments?.length ? (
            <div className="mt-2">
              <AttachmentView attachments={m.attachments} />
            </div>
          ) : null}
          {m.approval && <ApprovalActions link={m.approval} pending={pendingApproval} staffName={senderName} />}
        </div>
        <span className="text-muted-foreground text-[10px]">{fmtDate(m.ts, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
})

/** 긴 말풍선: 몇 줄로 접고 '더보기 / 접기' 버튼으로 펼친다. 넘치지 않으면 버튼을 그리지 않는다 */
function FoldableText({ text, children }: { text: string; children: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || isOpen) return
    const measure = () => setHasMore(el.scrollHeight > el.clientHeight + 1)
    measure()
    // 창 폭이 바뀌면 줄 수도 바뀌니 다시 잰다
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isOpen, text])
  return (
    <>
      <div id={id} ref={ref} className={cn(!isOpen && 'max-h-[12lh] overflow-hidden')}>
        {children}
      </div>
      {hasMore && (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={id}
          onClick={() => setIsOpen((v) => !v)}
          className="mt-1 flex items-center gap-0.5 text-xs font-medium opacity-70 hover:opacity-100"
        >
          {isOpen ? t('chat.bubble.less') : t('chat.bubble.more')}
          <ChevronDownIcon className={cn('size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none', isOpen && 'rotate-180')} />
        </button>
      )}
    </>
  )
}

/** 결재 요청·질문 말풍선 아래: 기다리는 중이면 결재함과 같은 버튼, 처리됐으면 결과 */
function ApprovalActions({ link, pending, staffName }: { link: ChatApproval; pending: Approval | undefined; staffName: string }) {
  const view = chatApprovalView(link, pending)
  if (view.kind === 'done')
    return <p className="text-muted-foreground mt-2 border-t pt-2 text-xs break-words">{view.result ? t(RESULT_LABEL[view.result], { answer: view.answer ?? '' }) : t('chat.approval.done')}</p>
  const a = view.approval
  if (a.questions)
    return (
      <div className="mt-2 border-t pt-2">
        <QuestionBox approval={a} />
      </div>
    )
  return (
    <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
      <Button size="sm" onClick={() => void window.office.decide(a.id, true)}>
        <CheckIcon /> {t('inbox.approve')}
      </Button>
      <AlwaysApproveButton approval={a} staffName={staffName} />
      <Button size="sm" variant="outline" onClick={() => void window.office.decide(a.id, false)}>
        {t('inbox.reject')}
      </Button>
    </div>
  )
}

function Composer({ room }: { room: RoomInfo | undefined }) {
  const [draft, setDraft] = useState('')
  const hired = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  // 팀·랩 방에서는 방 참여자와 @전체(= 팀·랩 전원)만 부른다
  const targets = useMemo(() => (room ? chatRoomMentionTargets(room, hired) : mentionTargets(hired, teams, labs)), [room, hired, teams, labs])
  const staffById = useMemo(() => new Map(hired.map((s) => [s.id, s])), [hired])

  // 마지막 단어가 @로 시작하면 전체·팀·랩·직원 후보를 띄운다 (구성원이 없는 대상은 빼고)
  const mentionQuery = draft.match(/@(\S*)$/)?.[1]
  const suggestions = useMemo(() => {
    if (mentionQuery === undefined) return []
    const hits = targets.filter((tg) => tg.memberIds.length > 0 && tg.name.includes(mentionQuery))
    return KIND_ORDER.map((kind) => ({ kind, items: hits.filter((tg) => tg.kind === kind).slice(0, MENTION_MAX) })).filter((g) => g.items.length > 0)
  }, [mentionQuery, targets])
  const parsed = useMemo(() => (draft.trim() ? parseMentions(draft, targets) : null), [draft, targets])

  // "@이름 /명령": 멘션 뒤 본문이 /로 시작하면 받는 직원의 명령을 띄운다 (여러 명이면 모두가 쓸 수 있는 것만).
  // 개인 매뉴얼(매뉴얼실과 이름 대조)은 '내 매뉴얼' 묶음으로 위에, 나머지는 'Claude 명령' 묶음으로 아래에
  const slashToken = draft.match(/\s\/(\S*)$/)?.[1]
  const recipientIds = parsed?.recipientIds ?? []
  const slashQuery = slashToken !== undefined && recipientIds.length > 0 && parsed?.body === `/${slashToken}` ? slashToken : null
  const commands = useStaffCommands(recipientIds, slashQuery !== null)
  const manualNames = new Set(usePersonalManuals(slashQuery !== null).map((m) => m.name))
  const matched = slashQuery === null || !commands ? [] : matchCommands(commands, slashQuery)
  // 📘 매뉴얼·/ 명령 버튼으로 열면 그쪽만 보인다
  const [slashMode, setSlashMode] = useState<SlashMode>('all')
  useEffect(() => {
    if (slashQuery === null) setSlashMode('all')
  }, [slashQuery])
  const slashCommands = [
    ...(slashMode === 'command' ? [] : matched.filter((c) => manualNames.has(c.name))),
    ...(slashMode === 'manual' ? [] : matched.filter((c) => !manualNames.has(c.name))),
  ]
  const slashItems = commands && slashCommands.map((c) => (manualNames.has(c.name) ? manualItem(c.name, commandDescription(c)) : commandItem(c)))
  // 꼭 넣을 인자가 없는 명령은 Enter면 바로 보낸다 (매뉴얼·Tab·클릭은 채우기만)
  const handleSlashPick = (i: number, isEnter = false) => {
    const command = slashCommands[i]
    const filled = draft.replace(/\/\S*$/, `/${command.name}`)
    // 버튼을 누를 때 쓰고 있던 글은 명령 뒤에 다시 붙인다
    const rest = slashRest.current
    slashRest.current = ''
    if (rest) return setDraft(`${filled} ${rest}`)
    if (isEnter && runsOnEnter(command) && !manualNames.has(command.name)) return void handleSend(filled)
    setDraft(`${filled} `)
  }
  const slashKeys = useSlashKeys(slashCommands.length, slashQuery, handleSlashPick)

  const draftFiles = useDraftAttachments()
  // 직원 패널처럼: 일하는 직원에게는 기본(Enter)이 '끝나면 보내기'(대기 메시지), '지금 끼어들기'는 하던 일을 멈추고 바로 전한다
  const handleSend = async (typed = draft, mode: ChatSendMode = 'wait') => {
    const text = typed.trim()
    if (!text && draftFiles.files.length === 0) return
    setDraft('')
    slashRest.current = ''
    const attachments = await draftFiles.upload()
    draftFiles.clear()
    void window.office.sendChat(text, attachments, room?.room, mode)
  }
  // 같은 이름의 직원·팀·랩이 있으면 "@디자인(팀)"처럼 종류를 붙여 고른 대상에게 가게 한다
  // 고른 뒤에는 입력창에 포커스를 주고 커서를 끝(넣은 "@이름 " 뒤)으로 — 글이 바뀐 다음 프레임에 옮긴다
  const inputId = useId()
  const handleMention = (tg: MentionTarget) => {
    // 매뉴얼·명령 버튼으로 받는 사람부터 고르던 중이면 "@이름 /"까지 넣어 바로 메뉴를 띄운다
    const slash = pendingSlash.current
    pendingSlash.current = null
    if (slash) setSlashMode(slash)
    setDraft((d) => d.replace(/@(\S*)$/, `${mentionToken(tg, targets)} ${slash ? '/' : ''}`))
    focusEnd()
  }
  const focusEnd = () => {
    requestAnimationFrame(() => {
      const el = document.getElementById(inputId)
      if (!(el instanceof HTMLTextAreaElement)) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }
  // @ 후보도 슬래시 메뉴와 같은 키(↑↓·Enter·Tab). Esc로 닫으면 글이 바뀔 때까지만 닫아 둔다 (onChange에서 푼다)
  const [closedDraft, setClosedDraft] = useState<string | null>(null)
  const isMentionOpen = suggestions.length > 0 && closedDraft !== draft
  const mentionItems = isMentionOpen ? suggestions.flatMap((g) => g.items) : []
  const mentionKeys = useSlashKeys(mentionItems.length, isMentionOpen ? (mentionQuery ?? null) : null, (i) => handleMention(mentionItems[i]))
  const mentionListRef = useRef<HTMLDivElement>(null)
  const mentionOptionId = (index: number) => `${inputId}-mention-${index}`
  useEffect(() => {
    mentionListRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [mentionKeys.active, isMentionOpen])
  const closeMentions = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isMentionOpen || e.key !== 'Escape' || e.nativeEvent.isComposing) return false
    e.preventDefault()
    e.stopPropagation()
    setClosedDraft(draft)
    return true
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => slashKeys.onKeyDown(e) || mentionKeys.onKeyDown(e) || closeMentions(e) || handleComposerKey(e, () => void handleSend(), setDraft)

  // 멘션 없이 보내면 누가 받는지: 전체 방은 알맞은 한 명, 팀·랩 방은 팀장·랩 리드(없으면 방 안에서 한 명)
  const roomLead = room?.leadId ? staffById.get(room.leadId) : undefined

  // 📘 매뉴얼·/ 명령 버튼: 받는 사람(멘션 → 없으면 팀장·랩장)의 "@이름 /"를 넣어 메뉴를 띄운다.
  // 받을 사람을 정할 수 없으면(전체 방) "@"로 사람부터 고르게 한다. 쓰던 글은 고른 명령 뒤에 다시 붙인다
  const slashRest = useRef('')
  const pendingSlash = useRef<'manual' | 'command' | null>(null)
  const openSlash = (mode: 'manual' | 'command') => {
    const body = parsed?.body ?? ''
    const rest = body.startsWith('/') ? '' : body
    const prefix = parsed && parsed.recipientIds.length > 0 ? (draft.trimEnd().endsWith(body) ? draft.trimEnd().slice(0, draft.trimEnd().length - body.length).trimEnd() : '') : ''
    const leadTarget = roomLead && targets.find((tg) => tg.kind === 'staff' && tg.memberIds[0] === roomLead.id)
    slashRest.current = prefix ? rest : draft.trim()
    if (prefix || leadTarget) {
      setSlashMode(mode)
      setDraft(`${prefix || mentionToken(leadTarget!, targets)} /`)
    } else {
      pendingSlash.current = mode
      setDraft('@')
    }
    focusEnd()
  }

  // 받는 사람 중 지금 일하는 직원 — 있으면 보내기 버튼이 '끝나면 보내기 · 지금 끼어들기'로 바뀐다 (결재 대기·/명령·다른 PC 직원은 바로 보낸다)
  const targetIds = parsed && parsed.matched.length > 0 ? parsed.recipientIds : roomLead ? [roomLead.id] : []
  const busy = targetIds.flatMap((id) => {
    const s = staffById.get(id)
    return s && s.status === 'working' && s.approvals.length === 0 && !s.remote ? [s] : []
  })
  const hasDraft = Boolean(draft.trim()) || draftFiles.files.length > 0
  const isBusySend = busy.length > 0 && hasDraft && !parsed?.body.startsWith('/')
  const isLab = room?.kind === 'lab'
  const noneLabel = !room
    ? t('chat.recipientsNone')
    : roomLead
      ? t(isLab ? 'chat.labRoom.recipientsLead' : 'chat.room.recipientsLead', { name: roomLead.name })
      : t(isLab ? 'chat.labRoom.recipientsNoLead' : 'chat.room.recipientsNoLead')

  return (
    <div className="typing:py-2 relative border-t p-4">
      {slashQuery !== null && (
        <SlashMenu
          query={slashQuery}
          items={slashItems}
          active={slashKeys.active}
          onPick={handleSlashPick}
          note={recipientIds.length > 1 ? t('slashMenu.commonOnly', { count: recipientIds.length }) : undefined}
          emptyText={slashMode === 'manual' ? t('slashMenu.emptyManual') : undefined}
          className="absolute bottom-full left-4 mb-1 w-80 max-w-[calc(100%-2rem)]"
        />
      )}
      {isMentionOpen && (
        <div ref={mentionListRef} id={`${inputId}-mentions`} role="listbox" className="bg-popover absolute bottom-full left-4 mb-1 flex max-h-80 min-w-56 flex-col overflow-y-auto rounded-lg border p-1 shadow-lg">
          {suggestions.map((g) => (
            <div key={g.kind} className="flex flex-col">
              <span className="text-muted-foreground px-2 pt-1 text-[10px]">{t(KIND_LABEL[g.kind])}</span>
              {g.items.map((tg) => {
                const index = mentionItems.indexOf(tg)
                return (
                  <button
                    key={tg.key}
                    id={mentionOptionId(index)}
                    type="button"
                    role="option"
                    aria-selected={index === mentionKeys.active}
                    // 누르는 동안 입력창 포커스를 뺏지 않는다 (고른 뒤 바로 이어 쓰게)
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => mentionKeys.setActive(index)}
                    onClick={() => handleMention(tg)}
                    className={cn('flex items-center gap-2 rounded px-2 py-1 text-left text-sm', index === mentionKeys.active && 'bg-accent')}
                  >
                    <TargetIcon target={tg} staff={staffById.get(tg.memberIds[0])} /> {tg.name}
                    <span className="text-muted-foreground ml-auto pl-3 text-xs">
                      {tg.kind === 'staff'
                        ? roleLabel(staffById.get(tg.memberIds[0])?.role ?? '')
                        : tg.kind === 'all'
                          ? t(!room ? 'chat.allHired' : isLab ? 'chat.labRoom.allMembers' : 'chat.room.allMembers', { count: tg.memberIds.length })
                          : t('chat.peopleCount', { count: tg.memberIds.length })}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <RoomWaiting room={room?.room} />
      <div className="mx-auto mb-2 max-w-3xl">
        <DraftAttachments files={draftFiles.files} onRemove={draftFiles.remove} />
        {parsed && <Recipients parsed={parsed} staffOf={(id) => staffById.get(id)} hasStaff={hired.length > 0} noneLabel={noneLabel} />}
        {isBusySend && (
          <p className="text-status-working mt-1 flex items-center gap-1.5 text-xs">
            <span className="bg-status-working size-1.5 shrink-0 animate-pulse rounded-full" />
            {t('chat.busyNote', { names: busy.map((s) => s.name).join(', ') })}
          </p>
        )}
      </div>
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <AttachButton onPick={draftFiles.add} className="size-9" />
        <MentionTextarea
          id={inputId}
          aria-expanded={isMentionOpen}
          aria-controls={isMentionOpen ? `${inputId}-mentions` : undefined}
          aria-activedescendant={isMentionOpen ? mentionOptionId(mentionKeys.active) : undefined}
          value={draft}
          targets={targets}
          onChange={(e) => {
            setDraft(e.target.value)
            setClosedDraft(null)
          }}
          onKeyDown={handleKeyDown}
          {...draftFiles.bind}
          rows={1}
          placeholder={t(!room ? 'chat.placeholder' : isLab ? 'chat.labRoom.placeholder' : 'chat.room.placeholder', { all: ALL_MENTION, newline: String(NEWLINE_HINT) })}
          className="field-sizing-content max-h-32 min-h-9 resize-none py-[7px]"
        />
        {isBusySend ? (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" className="px-2 text-xs" onClick={() => void handleSend()} title={t('staffPanel.composer.queueTitle')}>
              {t('staffPanel.composer.queue')}
            </Button>
            <Button className="px-2.5 text-xs" onClick={() => void handleSend(draft, 'now')} title={t('staffPanel.composer.interruptTitle')}>
              <ZapIcon /> {t('staffPanel.composer.interrupt')}
            </Button>
          </div>
        ) : (
          /* 폰: 직원 패널·비서 보내기처럼 정원 */
          <Button onClick={() => void handleSend()} disabled={!hasDraft} className="phone:w-10 phone:px-0">
            <SendIcon />
          </Button>
        )}
      </div>
      {hired.length > 0 && (
        <div className="typing:hidden mx-auto mt-1 flex max-w-3xl items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openSlash('manual')} title={t('chat.manualButtonTitle')}>
            {t('slashMenu.manualButton')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openSlash('command')} title={t('chat.commandButtonTitle')}>
            {t('slashMenu.button')}
          </Button>
        </div>
      )}
    </div>
  )
}

function TargetIcon({ target: tg, staff }: { target: MentionTarget; staff: Staff | undefined }) {
  if (tg.kind === 'staff') return <Avatar avatar={staff?.avatar ?? 0} name={staff?.name} teamId={staff?.teamId} className="size-5" />
  const Icon = tg.kind === 'all' ? MegaphoneIcon : tg.kind === 'team' ? UsersIcon : FlaskConicalIcon
  return <Icon className="size-4 shrink-0" style={tg.color ? { color: tg.color } : undefined} />
}

/** 보내기 전에 누가 받는지 보여 주는 줄 */
function Recipients({ parsed, staffOf, hasStaff, noneLabel }: { parsed: ReturnType<typeof parseMentions>; staffOf: (id: string) => Staff | undefined; hasStaff: boolean; noneLabel: string }) {
  if (!hasStaff) return null
  if (parsed.matched.length === 0) return <p className="text-muted-foreground mt-1 text-xs">{noneLabel}</p>
  return (
    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      {t('chat.recipients')} ·
      {parsed.matched.map((tg) => (
        <span key={tg.key} className={cn('flex items-center gap-1 rounded-md border px-1.5 py-0.5', tg.memberIds.length === 0 && 'border-dashed opacity-60')}>
          <TargetIcon target={tg} staff={staffOf(tg.memberIds[0])} />
          <span className="text-foreground max-w-[10rem] truncate">{tg.name}</span>
          {tg.kind !== 'staff' && <span className="tabular-nums">{tg.memberIds.length === 0 ? t('chat.noMembers') : tg.memberIds.length}</span>}
        </span>
      ))}
      <span className="tabular-nums">· {t('chat.peopleCount', { count: parsed.recipientIds.length })}</span>
      {parsed.duplicates > 0 && <span className="tabular-nums">· {t('chat.duplicatesExcluded', { count: parsed.duplicates })}</span>}
    </div>
  )
}
