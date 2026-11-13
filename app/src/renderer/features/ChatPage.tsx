import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, FlaskConicalIcon, InfoIcon, MegaphoneIcon, MessagesSquareIcon, PaperclipIcon, PlusIcon, SearchIcon, SendIcon, UsersIcon, ZapIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { AttachButton, AttachmentView, DraftAttachments, useDraftAttachments } from '@/components/attachments'
import { cn } from '@/lib/utils'
import { handleComposerKey, NEWLINE_HINT } from '@/lib/composerKeys'
import { commandDescription, commandItem, manualItem, SlashMenu, usePersonalManuals, useSlashKeys, useStaffCommands, type SlashMode } from '@/components/slash-menu'
import { matchCommands, runsOnEnter } from '@shared/slashCommands'
import { manualLabel } from '@shared/manualName'
import { useOffice } from '@/store'
import type { Approval, ChatApproval, ChatApprovalResult, ChatMessage, ChatSendMode, Lab, Staff, Team } from '@shared/types'
import { chatApprovalView } from '@shared/chatApproval'
import { chatLines, chatResponder, chatRoomMembers, chatRoomMentionTargets, findRoom, parseRoom, type ChatLine, type ChatRoomInfo } from '@shared/chatRooms'
import { ALL_MENTION, mentionTargets, mentionToken, OFFICE_SENDER, parseMentions, slashButtonDraft, type MentionKind, type MentionTarget } from '@shared/mention'
import { fmtDate, t, tr, type TKey } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'
import { Avatar } from './StaffCard'
import { Markdown } from '@/components/markdown'
import { MentionText, MentionTextarea, remarkMentions } from '@/components/mention-text'
import { JumpToBottom, useStickToBottom } from '@/components/stick-to-bottom'
import { QuestionBox } from './QuestionBox'
import { useDecide } from './useDecide'
import { usePendingSends, type SendInput } from './usePendingSends'
import type { PendingSend } from '@shared/pendingSend'
import { ProgressLine, WaitingCards } from './ProgressLine'
import { statusMetaOf } from './status'
import { progressesForRoom } from '@shared/progressView'
import { AlwaysApproveButton } from './AutoApprove'
import { BubbleMenu, ChatSearch, DeliveryLine, PlanNotice, ReplyBar, ReplyQuote, ReportActions, ReservationCards, ReserveMenu, reservationInput, useSearchHighlight } from './ChatExtras'
import { firstUnread, roomKey, seenOf } from '@shared/chatUnread'
import { keyName } from '@/lib/keyName'
import { DuoIcon, IconText } from '@/components/duo-icon'
import { splitLeadingIcon } from '@shared/iconText'
import { doingOf, stripHead, unreadText, useRoomEntries, useRoomPeople } from './chatRoomHooks'
import { ChatSide } from './ChatSide'
import { RoomListColumn, useRoomListLayout } from './RoomListColumn'
import { chatWidthOf, CHIP_MIN_WIDTH, summarizeRoomPeople } from '@shared/chatRoomLayout'
import { ChatSlimBar } from './ChatSlimBar'
import { PopMenu, PopMenuItem } from '@/components/pop-menu'

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

/** 내 말풍선(대표 글·앱이 대표 이름으로 남긴 알림) — 맨 앞 이모지가 아이콘 20종이면 아이콘으로 보여 준다(저장 글은 그대로) */
function MeText({ text, targets }: { text: string; targets: MentionTarget[] }) {
  const { icon, rest } = splitLeadingIcon(text)
  if (!icon) return <MentionText text={text} targets={targets} onPrimary />
  return (
    <>
      <DuoIcon name={icon} size={15} label={text.slice(0, text.length - rest.length).trim()} className="mr-1" />
      <MentionText text={rest} targets={targets} onPrimary />
    </>
  )
}

/** 사무실 단체방: 직원 보고·결재 요청·위임이 채팅으로 흐르고, @직원·@팀·@랩·@전체 로 바로 지시한다. 전체 방 + 팀별 방 + 랩별 방 */
export function ChatPage() {
  const room = useChatRoom()
  // 휴대폰·원격 화면: 보낸 글이 PC에서 돌아올 때까지 보여 줄 '보내는 중' 말풍선
  const pendingSends = usePendingSends()
  const title = !room ? t('chat.title') : room.kind === 'lab' ? t('chat.labRoom.title', { lab: room.name }) : t('chat.room.title', { team: room.name })
  const description = t(!room ? 'chat.description' : room.kind === 'lab' ? 'chat.labRoom.description' : 'chat.room.description', { all: ALL_MENTION })
  // 대화 찾기: 제목 옆 🔍 또는 ⌘F·Ctrl+F (분할 화면은 상단 바 🔍가 store 신호로 연다)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchRequest = useOffice((s) => s.chatSearchRequest)
  const firstRequest = useRef(searchRequest)
  useEffect(() => {
    if (searchRequest !== firstRequest.current) setIsSearchOpen(true)
  }, [searchRequest])
  const [searchQuery, setSearchQuery] = useState('')
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && keyName(e) === 'f') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // 데스크톱 왼쪽 방 목록: 행 폭을 재서 좁으면 56px 띠로 (회의실 화면과 같은 판정)
  const listLayout = useRoomListLayout()
  const { rowRef, rowWidth, mode: listMode } = listLayout
  // 좌우 분할(split:): 머리는 찾기 칸만 남기고, 방 목록·지금 하는 일은 왼쪽 칸(ChatSide, 키보드가 열리면 숨김)으로
  return (
    <div className="flex h-full flex-col">
      {/* 세로 폰(slim:): 머리 4줄 대신 46px 한 줄 — 방 이름 ▾(방·회의실)·일하는 직원·결재 대기·찾기·방 설명 ⓘ */}
      <ChatSlimBar room={room} title={room ? room.name : t('nav.chat')} description={description} onSearch={() => setIsSearchOpen((v) => !v)} />
      {/* 데스크톱: 머리 2줄(방 이름·꼬리표·ⓘ·🔍 / 직원 줄) + 왼쪽 방 목록(좁으면 56px 띠) */}
      <div className="phone:hidden border-b px-4 pt-3 pb-2">
        <div className="flex h-8 items-center gap-1.5">
          <h1 className="min-w-0 truncate text-base font-semibold">{room ? room.name : t('chat.room.allName')}</h1>
          {room && <span className="text-muted-foreground shrink-0 rounded-full border px-1.5 text-[10px] leading-4">{t(room.kind === 'lab' ? 'chat.head.tagLab' : 'chat.head.tagTeam')}</span>}
          <span className="flex-1" />
          <PopMenu opens="down" icon={<InfoIcon />} label={t('chat.slim.about')} buttonClassName="size-8 p-0">
            {() => (
              <div className="max-w-72 p-1.5">
                <p className="text-muted-foreground text-xs">{description}</p>
                {/* 띠일 때는 방 목록 맨 아래 '다른 PC' 줄이 안 보이므로 여기서 */}
              </div>
            )}
          </PopMenu>
          <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => setIsSearchOpen((v) => !v)} title={t('chat.search.open')} aria-label={t('chat.search.open')}>
            <SearchIcon />
          </Button>
        </div>
        <RoomStatusStrip room={room} isSummary isFaces={chatWidthOf(rowWidth, listMode) < CHIP_MIN_WIDTH && rowWidth > 0} />
      </div>
      {/* 폰 배치(가로 짧은 폰·분할·세로 폰)는 예전 머리 그대로 */}
      <div className="phone:block phone:px-4 phone:py-3 short:py-1.5 typing:hidden split:hidden slim:hidden hidden border-b px-6 py-4">
        <div className="split:hidden slim:hidden flex items-start gap-2">
          <h1 className="short:text-base flex-1 text-lg font-semibold">{title}</h1>
          <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => setIsSearchOpen((v) => !v)} title={t('chat.search.open')} aria-label={t('chat.search.open')}>
            <SearchIcon />
          </Button>
        </div>
        <div className="split:hidden slim:hidden">
          <p className="text-muted-foreground short:hidden text-xs">{description}</p>
          <RoomTabs current={room?.room} />
        </div>
        <div className="split:hidden slim:hidden">
          <RoomStatusStrip room={room} />
        </div>
      </div>
      {/* 찾기 줄은 한 곳에만 — 두 머리에 따로 두면 숨은 쪽이 방을 바꿀 때 onQuery('')로 보이는 쪽 검색어를 지운다 */}
      {isSearchOpen && (
        <div className="border-b px-4 pb-2">
          <ChatSearch room={room?.room} onClose={() => setIsSearchOpen(false)} onQuery={setSearchQuery} />
        </div>
      )}
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <RoomListColumn room={room} layout={listLayout} />
        <ChatSide room={room} className="side:flex hidden" />
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList room={room?.room} searchQuery={isSearchOpen ? searchQuery : ''} pending={pendingSends.items} onRetry={pendingSends.retry} />
          <Composer room={room} onSend={pendingSends.send} />
        </div>
      </div>
    </div>
  )
}

/** 상태 줄에 펼쳐 두는 사람 수 — 넘으면 "+N명"으로 접는다 */
const STRIP_MAX = 6
/** 대화 칸이 좁을 때 겹쳐 보여 주는 얼굴 수 */
const FACES_MAX = 3

/**
 * 구성원 상태 줄 (방 제목 아래): 누가 무슨 일을 하는지 — 이 방에서 시킨 일뿐 아니라 업무 카드·1:1 지시로 하는 일도 보인다.
 * 팀·랩 방은 구성원 전원, 전체 방은 일하는 중·확인 필요·오류인 사람만. 마우스를 올리면 자세히, 누르면 직원 패널
 */
function RoomStatusStrip({ room, isSummary, isFaces }: { room: RoomInfo | undefined; /** 앞에 'N명 · M명 일하는 중' (데스크톱 머리 2줄) */ isSummary?: boolean; /** 대화 칸이 좁으면 칩 대신 얼굴 겹침 — 누르면 모두 펼침 */ isFaces?: boolean }) {
  const select = useOffice((s) => s.select)
  const [isOpen, setIsOpen] = useState(false)
  const [tip, setTip] = useState<{ staff: Staff; rect: DOMRect } | null>(null)
  const people = useRoomPeople(room)
  if (people.length === 0) return null
  const shown = isOpen ? people : people.slice(0, STRIP_MAX)
  const tipStaff = tip && people.find((p) => p.id === tip.staff.id)
  const chips = (
    <div
      aria-label={t('chat.status.list')}
      // 접힌 줄은 가로로 넘긴다 — 마우스 휠(세로)도 가로 이동으로 바꿔 준다
      onWheel={(e) => {
        const el = e.currentTarget
        if (isOpen || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return
        el.scrollLeft += e.deltaY
      }}
      onScroll={() => setTip(null)}
      className={cn('short:hidden flex gap-1.5', !isSummary && 'mt-2', isOpen ? 'flex-wrap' : 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]')}
    >
      {shown.map((s) => {
        const meta = statusMetaOf(s)
        const doing = doingOf(s)
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
  if (isSummary) {
    const { total, working } = summarizeRoomPeople(people)
    const summary = (
      <span className="text-muted-foreground shrink-0 text-xs">
        {t('chat.head.total', { total })} · {working > 0 ? <span className="text-status-working font-medium">{t('chat.head.working', { working })}</span> : t('chat.head.idle')}
      </span>
    )
    if (isFaces && !isOpen)
      return (
        <button type="button" onClick={() => setIsOpen(true)} className="hover:bg-accent mt-1.5 flex items-center gap-2 rounded-full pr-2" aria-label={t('chat.status.list')}>
          <span className="flex shrink-0 -space-x-1.5">
            {people.slice(0, FACES_MAX).map((s) => (
              <Avatar key={s.id} avatar={s.avatar} name={s.name} teamId={s.teamId} className="ring-background size-5 ring-2" />
            ))}
          </span>
          {summary}
        </button>
      )
    return (
      <div className={cn('mt-1.5 flex gap-2', isOpen ? 'items-start' : 'items-center')}>
        <span className={cn('flex shrink-0', isOpen && 'py-1')}>{summary}</span>
        <div className="min-w-0 flex-1">{chips}</div>
      </div>
    )
  }
  return chips
}

/** 상태 줄 칸에 마우스를 올리면 뜨는 설명: 맡은 일 · 지금 하는 것 · 뒤에 기다리는 일 */
function StatusTip({ staff: s, rect }: { staff: Staff; rect: DOMRect }) {
  const meta = statusMetaOf(s)
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

/** 이 방에서 보낸 대기 메시지 (일하는 직원에게 '끝나면 보내기'로 보낸 말) — 입력칸 바로 위.
 *  기본 max-h-[40%]는 여기서 너무 작게 잡혀 한 장에도 스크롤이 생기므로 고정 높이로 둔다 */
function RoomWaiting({ room }: { room: string | undefined }) {
  const staff = useOffice((s) => s.staff)
  const items = useMemo(
    () => staff.flatMap((s) => (s.progress?.waiting ?? []).filter((w) => (w.room ?? undefined) === (room || undefined)).map((w) => ({ ...w, staffId: s.id, name: s.name }))),
    [staff, room],
  )
  if (items.length === 0) return null
  return <WaitingCards items={items} className="mx-auto max-h-40 w-full max-w-3xl border-t-0 px-0" />
}

/** 가로 방 탭(가로 짧은 폰 머리): 전체 / 팀들 / 랩들 (project 종류·연습 팀, 연습 랩은 방이 없다) — 계산은 왼쪽 방 목록과 같은 useRoomEntries */
function RoomTabs({ current }: { current: string | undefined }) {
  const entries = useRoomEntries(current, t('chat.room.all'))
  if (entries.length === 1) return null
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]" role="tablist" aria-label={t('chat.rooms')}>
      {entries.flatMap((e, i) => [
        // 묶음이 바뀌는 자리에 '팀'·'랩' 제목
        ...(e.group !== 'all' && entries[i - 1]?.group !== e.group
          ? [
              <span key={`group:${e.group}`} className="text-muted-foreground/70 ml-1 flex shrink-0 items-center text-[11px] font-medium">
                {t(e.group === 'team' ? 'chat.room.groupTeams' : 'chat.room.groupLabs')}
              </span>,
            ]
          : []),
        <button
          key={e.key}
          type="button"
          role="tab"
          aria-selected={e.isActive}
          onClick={e.select}
          className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs', e.isActive ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent text-muted-foreground')}
        >
          {e.color && <span className="size-2 rounded-full" style={{ background: e.color }} />}
          {e.label}
          {e.unread > 0 && (
            <span className="bg-status-error dark:text-background rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white" aria-label={t('chat.unread.count', { count: e.unread })}>
              {unreadText(e.unread)}
            </span>
          )}
          {e.hasApproval && <span className="bg-status-waiting size-1.5 rounded-full" title={t('chat.unread.approval')} />}
        </button>,
      ])}
    </div>
  )
}

const lineKey = (l: ChatLine) => (l.kind === 'message' ? String(l.message.id) : `room:${l.room}:${l.lastId}`)

// 입력 중엔 메시지 목록이 다시 그려지지 않도록 목록과 입력창을 나눠 각자 구독한다
function MessageList({ room, searchQuery, pending, onRetry }: { room: string | undefined; searchQuery: string; pending: PendingSend[]; onRetry: (tempId: string) => void }) {
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
  const roomPending = useMemo(() => pending.filter((p) => roomKey(p.room) === roomKey(room)), [pending, room])
  useEffect(() => {
    if (roomPending.length) scroll.scrollToBottom()
    // 새로 보내는 글이 생길 때(개수가 늘 때)만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomPending.length])
  const lastLine = lines.at(-1)
  const last = lastLine?.kind === 'message' ? lastLine.message : undefined
  useEffect(() => {
    if (last?.from === 'me') scroll.scrollToBottom()
    // 새 말이 붙을 때만 본다 (상한 500에 닿아도 개수 대신 마지막 id로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id])

  // 안 읽은 수: 방에 들어온 순간 마지막으로 본 자리를 잡아 '여기부터 새 메시지' 줄을 긋고, 보고 있는 방은 바로 읽음으로
  const chatSeen = useOffice((s) => s.chatSeen)
  const markChatSeen = useOffice((s) => s.markChatSeen)
  // 들어올 때 안 읽었던 글만 센다 (보는 중에 새로 온 글은 줄을 옮기지 않는다)
  const [entered, setEntered] = useState<{ room: string; divider: { id: number; count: number } | null } | null>(null)
  useEffect(() => {
    if (chatSeen && entered?.room !== roomKey(room)) setEntered({ room: roomKey(room), divider: firstUnread(chat, room, seenOf(chatSeen, room)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 방에 들어올 때 한 번
  }, [chatSeen, room, entered?.room])
  const divider = entered && entered.room === roomKey(room) ? entered.divider : null
  const lastInRoom = useMemo(() => chat.reduce((max, m) => (roomKey(m.room) === roomKey(room) ? Math.max(max, m.id) : max), 0), [chat, room])
  useEffect(() => {
    if (lastInRoom) markChatSeen(room, lastInRoom)
  }, [lastInRoom, room, markChatSeen])

  // 답장 인용·보고 보기·검색 결과로 갈 때: 그 말풍선으로 스크롤하고 잠깐 강조한다
  const chatFocus = useOffice((s) => s.chatFocus)
  const [flashId, setFlashId] = useState<number | null>(null)
  useEffect(() => {
    if (!chatFocus) return
    const el = scroll.ref.current?.querySelector(`[data-chat-id="${chatFocus.id}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    setFlashId(chatFocus.id)
    // 한 번 갔으면 비운다 — 남겨 두면 새 메시지가 올 때마다·방에 다시 들어올 때마다 그 말풍선으로 되돌아간다
    useOffice.setState({ chatFocus: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로 가라고 할 때와 그 말풍선이 그려졌을 때
  }, [chatFocus, lines.length])
  useEffect(() => {
    if (flashId === null) return
    const timer = setTimeout(() => setFlashId(null), 1600)
    return () => clearTimeout(timer)
  }, [flashId])
  useSearchHighlight(scroll.contentRef.current, searchQuery, lines)

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
              <div key={m.id} data-chat-id={m.id} className={cn('flex flex-col gap-3 rounded-2xl transition-shadow', flashId === m.id && 'ring-primary/70 ring-2 ring-offset-4 ring-offset-background')}>
              {divider?.id === m.id && (
                <div className="text-status-error flex items-center gap-2 text-[11px] before:h-px before:flex-1 before:bg-status-error/40 after:h-px after:flex-1 after:bg-status-error/40">{t('chat.unread.divider', { count: divider.count })}</div>
              )}
              <Bubble
                message={m}
                senderId={sender?.id}
                senderName={sender?.name ?? t('common.formerStaff')}
                senderAvatar={sender?.avatar ?? 0}
                senderTeamId={sender?.teamId ?? null}
                pendingApproval={m.approval && pendingById.get(m.approval.id)}
                mentions={mentions}
                onSelect={select}
              />
              </div>
            )
          })}
          {roomPending.map((p) => (
            <PendingBubble key={p.tempId} pending={p} onRetry={onRetry} />
          ))}
          <ProgressLines room={room} />
        </div>
      </div>
      <JumpToBottom isNear={scroll.isNear} unread={scroll.unread} onClick={() => scroll.scrollToBottom(true)} />
    </div>
  )
}

/** 휴대폰·원격 화면에서 막 보낸 내 글 — PC가 돌려주기 전까지 '보내는 중', 실패하면 '보내지 못했어요 · 다시 보내기' */
function PendingBubble({ pending: p, onRetry }: { pending: PendingSend; onRetry: (tempId: string) => void }) {
  const isFailed = p.status === 'failed'
  return (
    <div className="flex flex-row-reverse gap-2" data-pending={p.tempId}>
      <div className="split:max-w-[82%] flex max-w-[75%] flex-col items-end gap-0.5">
        <div className={cn('bg-primary text-primary-foreground max-w-full min-w-0 rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap', !isFailed && 'opacity-60')}>
          {p.text}
          {p.attachments.length > 0 && (
            <div className="mt-2">
              <AttachmentView attachments={p.attachments} />
            </div>
          )}
        </div>
        <span className={cn('text-[10px]', isFailed ? 'text-destructive' : 'text-muted-foreground')} role={isFailed ? 'alert' : 'status'}>
          {isFailed ? t('chat.pending.failed') : t('chat.pending.sending')}
          {isFailed && (
            <>
              {' · '}
              <button type="button" className="focus-ring phone:min-h-8 font-semibold underline" onClick={() => onRetry(p.tempId)}>
                {t('chat.pending.retry')}
              </button>
            </>
          )}
        </span>
      </div>
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
        <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs"><IconText text={m.text} size={13} isLeadingOnly /></span>
      </div>
    )
  return (
    <div className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
      {!isMe && (
        <button type="button" onClick={() => senderId && onSelect(senderId)}>
          <Avatar avatar={senderAvatar} name={senderName} teamId={senderTeamId} className="size-8" />
        </button>
      )}
      <div className={cn('split:max-w-[82%] flex max-w-[75%] flex-col gap-0.5', isMe && 'items-end')}>
        {!isMe && (
          <span className="text-muted-foreground text-xs">
            {senderName}
            {m.isReport && ` · ${t('chat.report.label')}`}
          </span>
        )}
        {/* 기획안 확인 요청은 글 대신 카드로만 (같은 말을 두 번 보이지 않게) */}
        <div className={cn('group selectable relative max-w-full min-w-0 rounded-2xl px-3 py-2 text-sm', isMe ? 'bg-primary text-primary-foreground whitespace-pre-wrap' : 'bg-card border', m.plan && 'hidden')}>
          <BubbleMenu message={m} isMe={isMe} />
          {m.replyTo && <ReplyQuote reply={m.replyTo} isMe={isMe} />}
          <FoldableText text={m.text}>{isMe ? <MeText text={m.text} targets={mentions} /> : <Markdown plugins={plugins}>{m.text}</Markdown>}</FoldableText>
          {m.attachments?.length ? (
            <div className="mt-2">
              <AttachmentView attachments={m.attachments} />
            </div>
          ) : null}
          {m.approval && <ApprovalActions link={m.approval} pending={pendingApproval} staffName={senderName} />}
        </div>
        {m.plan && <PlanNotice plan={m.plan} />}
        {!isMe && m.isReport && !m.plan && <ReportActions message={m} />}
        {isMe && <DeliveryLine message={m} />}
        <span className="text-muted-foreground text-[10px]">
          {m.scheduled && <span className="text-primary mr-1"><IconText text={t(m.scheduled.kind === 'once' ? 'chat.reserve.sentOnce' : 'chat.reserve.sentRepeat')} size={12} /></span>}
          {fmtDate(m.ts, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
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
    return <p className="text-muted-foreground mt-2 border-t pt-2 text-xs break-words"><IconText text={view.result ? t(RESULT_LABEL[view.result], { answer: view.answer ?? '' }) : t('chat.approval.done')} size={13} /></p>
  const a = view.approval
  if (a.questions)
    return (
      <div className="mt-2 border-t pt-2">
        <QuestionBox approval={a} />
      </div>
    )
  return <PendingApprovalButtons approval={a} staffName={staffName} />
}

/** 말풍선 글(저장된 원문)은 그대로 두고, 효과 문장이 있으면 버튼 위에 제목처럼 한 줄 (화면 언어를 바꾸면 다시 번역된다).
 * 승인·반려는 누르자마자 '처리 중', 결과를 확인한 뒤에 치운다 (처리된 뒤 결과 글은 위 'done'이 보여 준다) */
function PendingApprovalButtons({ approval: a, staffName }: { approval: Approval; staffName: string }) {
  const { isBusy, isDone, isFailed, decide } = useDecide(a.id)
  if (isDone) return null
  return (
    <div className="mt-2 flex flex-col gap-2 border-t pt-2">
      {a.effectI18n && <p className="text-sm font-medium break-keep [overflow-wrap:anywhere]">{tr(a.effectI18n)}</p>}
      {isFailed && <p className="text-destructive text-xs">{t('secretary.approvals.failed')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={isBusy} onClick={() => void decide(true)}>
          <CheckIcon /> {t('inbox.approve')}
        </Button>
        <AlwaysApproveButton approval={a} staffName={staffName} />
        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void decide(false)}>
          {t('inbox.reject')}
        </Button>
        {isBusy && <span className="text-muted-foreground text-xs">{t('approval.processing')}</span>}
      </div>
    </div>
  )
}

function Composer({ room, onSend }: { room: RoomInfo | undefined; onSend: (input: SendInput) => void }) {
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
  const personalManuals = usePersonalManuals(slashQuery !== null)
  const manualNames = new Set(personalManuals.map((m) => m.name))
  const manualTitles = new Map(personalManuals.map((m) => [m.name, manualLabel(m)]))
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
  const slashItems = commands && slashCommands.map((c) => (manualNames.has(c.name) ? manualItem(c.name, commandDescription(c), manualTitles.get(c.name)) : commandItem(c)))
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
  // 답장: 입력칸 위 인용 줄. 멘션 없이 직원 말에 답하면 그 직원이 받는다
  const reply = useOffice((s) => s.chatReply)
  const setReply = useOffice((s) => s.setChatReply)
  const replied = useOffice((s) => (s.chatReply ? s.chat.find((m) => m.id === s.chatReply!.id) : undefined))
  const replyStaff = replied && (!parsed || parsed.matched.length === 0) ? staffById.get(replied.from) : undefined
  // 다른 화면이 넣어 달라는 글(예약 고치기·다시 보내기·🔁)
  const chatDraft = useOffice((s) => s.chatDraft)
  useEffect(() => {
    if (!chatDraft) return
    setDraft(chatDraft.text)
    focusEnd()
    // 넣었으면 비운다 — 남겨 두면 대화방에 다시 들어올 때마다 옛 글이 또 채워진다
    useOffice.setState({ chatDraft: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로 넣으라고 할 때만
  }, [chatDraft?.nonce])
  useEffect(() => {
    if (reply) focusEnd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply?.id, reply?.mode])
  // 방을 옮기면 답장 줄을 내린다 (다른 방 메시지에 답하지 않게)
  useEffect(() => () => setReply(null), [room?.room, setReply])
  // 직원 패널처럼: 일하는 직원에게는 기본(Enter)이 '끝나면 보내기'(대기 메시지), '지금 끼어들기'는 하던 일을 멈추고 바로 전한다
  const handleSend = async (typed = draft, mode: ChatSendMode = 'wait') => {
    const text = typed.trim()
    if (!text && draftFiles.files.length === 0) return
    setDraft('')
    slashRest.current = ''
    const replyTo = reply?.id
    setReply(null)
    const attachments = await draftFiles.upload()
    draftFiles.clear()
    onSend({ text, attachments, room: room?.room, mode, replyTo })
  }
  // 보내기 옆 ▾: 예약 보내기·반복 지시
  const [isReserveOpen, setIsReserveOpen] = useState(false)
  const [reserveNote, setReserveNote] = useState('')
  const handleReserve = async (pick: Parameters<typeof reservationInput>[0]) => {
    const text = draft.trim()
    if (!text) return setReserveNote(t('chat.reserve.empty'))
    setIsReserveOpen(false)
    setReserveNote('')
    setDraft('')
    setReply(null)
    const attachments = await draftFiles.upload()
    draftFiles.clear()
    void window.office.saveChatReservation(reservationInput(pick, text, room?.room ?? null, attachments))
  }
  // 같은 이름의 직원·팀·랩이 있으면 "@디자인(팀)"처럼 종류를 붙여 고른 대상에게 가게 한다
  // 고른 뒤에는 입력창에 포커스를 주고 커서를 끝(넣은 "@이름 " 뒤)으로 — 글이 바뀐 다음 프레임에 옮긴다
  const inputId = useId()
  const handleMention = (tg: MentionTarget) => {
    setDraft((d) => d.replace(/@(\S*)$/, `${mentionToken(tg, targets)} `))
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

  // 📘 매뉴얼·/ 명령 버튼: 받는 사람(멘션 → 없으면 멘션 없이 보낼 때 받을 직원: 팀장·랩장, 전체 방은 알맞은 한 명)의
  // "@이름 /"를 넣어 바로 메뉴를 띄운다. 쓰던 글은 고른 명령 뒤에 다시 붙인다
  const slashRest = useRef('')
  const openSlash = (mode: 'manual' | 'command') => {
    const members = (room ? chatRoomMembers(room, hired) : hired).filter((s) => !s.isPractice)
    const leadIds = new Set([...teams, ...labs].map((g) => g.leadId))
    const fallbackId = chatResponder('', room, members.map((s) => ({ id: s.id, role: s.role, status: s.status, isOverBudget: false, isLead: leadIds.has(s.id) })))
    const next = slashButtonDraft(draft, targets, fallbackId)
    if (!next) return
    slashRest.current = next.rest
    setSlashMode(mode)
    setDraft(next.draft)
    focusEnd()
  }

  // 받는 사람 중 지금 일하는 직원 — 있으면 보내기 버튼이 '끝나면 보내기 · 지금 끼어들기'로 바뀐다 (결재 대기·/명령·다른 PC 직원은 바로 보낸다)
  const targetIds = parsed && parsed.matched.length > 0 ? parsed.recipientIds : replyStaff ? [replyStaff.id] : roomLead ? [roomLead.id] : []
  const busy = targetIds.flatMap((id) => {
    const s = staffById.get(id)
    return s && s.status === 'working' && s.approvals.length === 0 ? [s] : []
  })
  const hasDraft = Boolean(draft.trim()) || draftFiles.files.length > 0
  const isBusySend = busy.length > 0 && hasDraft && !parsed?.body.startsWith('/')
  const isLab = room?.kind === 'lab'
  const noneLabel = replyStaff
    ? t('chat.reply.to', { name: replyStaff.name })
    : !room
    ? t('chat.recipientsNone')
    : roomLead
      ? t(isLab ? 'chat.labRoom.recipientsLead' : 'chat.room.recipientsLead', { name: roomLead.name })
      : t(isLab ? 'chat.labRoom.recipientsNoLead' : 'chat.room.recipientsNoLead')

  // 세로 폰: 멘션 없이 보내면 받을 사람(답장 상대·팀장·랩 리드)을 입력칸 옆 칩으로
  const chipName = replyStaff?.name ?? roomLead?.name
  return (
    <div className="typing:py-2 split:px-3 split:py-2 slim:px-3 slim:py-2 relative border-t p-4">
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
      <ReservationCards room={room?.room} />
      <RoomWaiting room={room?.room} />
      <div className="slim:mb-1 mx-auto mb-2 max-w-3xl">
        {reply && <ReplyBar reply={reply} onCancel={() => setReply(null)} />}
        <DraftAttachments files={draftFiles.files} onRemove={draftFiles.remove} />
        {/* 분할·세로 폰은 받는 사람 줄을 @를 쓸 때만 (세로 폰은 기본 받는 사람을 입력칸 옆 칩으로) */}
        {parsed && <div className={cn(parsed.matched.length === 0 && 'split:hidden', parsed.matched.length === 0 && chipName && 'slim:hidden')}><Recipients parsed={parsed} staffOf={(id) => staffById.get(id)} hasStaff={hired.length > 0} noneLabel={noneLabel} /></div>}
        {isBusySend && (
          <p className="text-status-working mt-1 flex items-center gap-1.5 text-xs">
            <span className="bg-status-working size-1.5 shrink-0 animate-pulse rounded-full" />
            {t('chat.busyNote', { names: busy.map((s) => s.name).join(', ') })}
          </p>
        )}
      </div>
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <AttachButton onPick={draftFiles.add} className="split:hidden slim:hidden size-9" />
        {/* 분할·세로 폰: 첨부·예약·매뉴얼·명령을 ＋ 하나에 (기존 버튼·흐름 그대로) */}
        <PopMenu icon={<PlusIcon />} label={t('chat.plusMenu')} className="split:block slim:block hidden">
          {(close) => (
            <>
              <AttachButton onPick={(files) => (draftFiles.add(files), close())} className="hover:bg-accent flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-sm">
                <PaperclipIcon className="size-4" />
                {t('attach.attach')}
              </AttachButton>
              <PopMenuItem icon={<DuoIcon name="schedule" size={16} />} onClick={() => (close(), setIsReserveOpen(true))}>
                {t('chat.reserve.menu')}
              </PopMenuItem>
              {hired.length > 0 && (
                <>
                  <PopMenuItem onClick={() => (close(), openSlash('manual'))}>
                    <IconText text={t('slashMenu.manualButton')} size={16} />
                  </PopMenuItem>
                  <PopMenuItem onClick={() => (close(), openSlash('command'))}>{t('slashMenu.button')}</PopMenuItem>
                </>
              )}
            </>
          )}
        </PopMenu>
        {chipName && (!parsed || parsed.matched.length === 0) && (
          <span className="bg-primary/10 text-primary slim:inline-flex hidden h-9 max-w-[35%] shrink-0 items-center rounded-full px-2.5 text-xs font-medium" title={noneLabel}>
            <span className="truncate">@{chipName}</span>
          </span>
        )}
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
          className="field-sizing-content placeholder:truncate placeholder-shown:field-sizing-fixed placeholder-shown:h-9 placeholder-shown:overflow-hidden placeholder-shown:whitespace-nowrap max-h-32 min-h-9 resize-none py-[7px]"
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
        <Button variant="ghost" className="split:hidden slim:hidden w-6 shrink-0 px-0" onClick={() => setIsReserveOpen((v) => !v)} title={t('chat.reserve.menu')} aria-label={t('chat.reserve.menu')} aria-expanded={isReserveOpen}>
          <ChevronDownIcon />
        </Button>
      </div>
      {isReserveOpen && (
        <ReserveMenu
          onPick={(p) => void handleReserve(p)}
          onSendNow={() => {
            setIsReserveOpen(false)
            void handleSend()
          }}
          onClose={() => {
            setIsReserveOpen(false)
            setReserveNote('')
          }}
        />
      )}
      {reserveNote && <p className="text-status-waiting mx-auto mt-1 max-w-3xl text-xs">{reserveNote}</p>}
      {hired.length > 0 && (
        <div className="typing:hidden split:hidden slim:hidden mx-auto mt-1 flex max-w-3xl items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openSlash('manual')} title={t('chat.manualButtonTitle')}>
            <IconText text={t('slashMenu.manualButton')} size={13} />
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
