import { memo, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { CheckIcon, ChevronRightIcon, FlaskConicalIcon, MegaphoneIcon, MessagesSquareIcon, SendIcon, UsersIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AttachButton, AttachmentView, DraftAttachments, useDraftAttachments } from '@/components/attachments'
import { cn } from '@/lib/utils'
import { handleComposerKey, NEWLINE_HINT } from '@/lib/composerKeys'
import { commandDescription, commandItem, manualItem, SlashMenu, usePersonalManuals, useSlashKeys, useStaffCommands } from '@/components/slash-menu'
import { matchCommands, runsOnEnter } from '@shared/slashCommands'
import { useOffice } from '@/store'
import type { Approval, ChatApproval, ChatApprovalResult, ChatMessage, Staff, Team } from '@shared/types'
import { chatApprovalView } from '@shared/chatApproval'
import { chatLines, roomMentionTargets, roomTeams, type ChatLine } from '@shared/chatRooms'
import { ALL_MENTION, mentionTargets, mentionToken, OFFICE_SENDER, parseMentions, type MentionKind, type MentionTarget } from '@shared/mention'
import { fmtDate, t, type TKey } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'
import { Avatar } from './StaffCard'
import { Markdown } from '@/components/markdown'
import { JumpToBottom, useStickToBottom } from '@/components/stick-to-bottom'
import { QuestionBox } from './QuestionBox'
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

/** 지금 보고 있는 팀 방 (방이 없어진 팀이면 전체 방) */
function useRoomTeam(): Team | undefined {
  const chatRoom = useOffice((s) => s.chatRoom)
  const teams = useOffice((s) => s.teams)
  return chatRoom ? roomTeams(teams).find((tm) => tm.id === chatRoom) : undefined
}

/** 사무실 단체방: 직원 보고·결재 요청·위임이 채팅으로 흐르고, @직원·@팀·@랩·@전체 로 바로 지시한다. 전체 방 + 팀별 방 */
export function ChatPage() {
  const team = useRoomTeam()
  return (
    <div className="flex h-full flex-col">
      <div className="phone:px-4 phone:py-3 short:py-1.5 typing:hidden border-b px-6 py-4">
        <h1 className="short:text-base text-lg font-semibold">{team ? t('chat.room.title', { team: team.name }) : t('chat.title')}</h1>
        <p className="text-muted-foreground short:hidden text-xs">{team ? t('chat.room.description', { all: ALL_MENTION }) : t('chat.description', { all: ALL_MENTION })}</p>
        <RoomTabs current={team?.id} />
      </div>
      <MessageList room={team?.id} />
      <Composer team={team} />
    </div>
  )
}

/** 방 목록: 전체 / 팀들 (project 종류·연습 팀은 방이 없다) */
function RoomTabs({ current }: { current: string | undefined }) {
  const teams = useOffice((s) => s.teams)
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const rooms = roomTeams(teams)
  if (rooms.length === 0) return null
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
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto" role="tablist" aria-label={t('chat.rooms')}>
      {tab('all', t('chat.room.all'), !current, () => setChatRoom(null))}
      {rooms.map((tm) => tab(tm.id, tm.name, current === tm.id, () => setChatRoom(tm.id), tm.color))}
    </div>
  )
}

const lineKey = (l: ChatLine) => (l.kind === 'message' ? String(l.message.id) : `room:${l.room}:${l.lastId}`)

// 입력 중엔 메시지 목록이 다시 그려지지 않도록 목록과 입력창을 나눠 각자 구독한다
function MessageList({ room }: { room: string | undefined }) {
  const chat = useOffice((s) => s.chat)
  const staff = useOffice((s) => s.staff)
  const teams = useOffice((s) => s.teams)
  const select = useOffice((s) => s.select)
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const lines = useMemo(() => chatLines(chat, room), [chat, room])
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
              const tm = teams.find((x) => x.id === line.room)
              return <RoomSummary key={`room:${line.room}:${line.firstId}`} team={tm} count={line.count} onOpen={tm ? () => setChatRoom(line.room) : undefined} />
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
                onSelect={select}
              />
            )
          })}
        </div>
      </div>
      <JumpToBottom isNear={scroll.isNear} unread={scroll.unread} onClick={() => scroll.scrollToBottom(true)} />
    </div>
  )
}

/** 전체 방에 접어 보여 주는 팀 방 글 한 줄 — 누르면 그 방으로 */
function RoomSummary({ team, count, onOpen }: { team: Team | undefined; count: number; onOpen: (() => void) | undefined }) {
  const label = t('chat.room.summary', { team: team?.name ?? t('chat.room.deletedTeam'), count })
  return (
    <div className="flex justify-center">
      <button
        type="button"
        disabled={!onOpen}
        onClick={onOpen}
        className="text-muted-foreground hover:bg-accent flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs disabled:hover:bg-transparent"
      >
        <MessagesSquareIcon className="size-3.5 shrink-0" style={team ? { color: team.color } : undefined} />
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
  onSelect,
}: {
  message: ChatMessage
  senderId: string | undefined
  senderName: string
  senderAvatar: number
  senderTeamId: string | null
  pendingApproval: Approval | undefined
  onSelect: (id: string) => void
}) {
  const isMe = m.from === 'me'
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
          {isMe ? m.text : <Markdown>{m.text}</Markdown>}
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
    <div className="mt-2 flex gap-2 border-t pt-2">
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

function Composer({ team }: { team: Team | undefined }) {
  const [draft, setDraft] = useState('')
  const hired = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  // 팀 방에서는 방 참여자와 @전체(= 팀 전원)만 부른다
  const targets = useMemo(() => (team ? roomMentionTargets(team, hired) : mentionTargets(hired, teams, labs)), [team, hired, teams, labs])
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
  const slashCommands = [...matched.filter((c) => manualNames.has(c.name)), ...matched.filter((c) => !manualNames.has(c.name))]
  const slashItems = commands && slashCommands.map((c) => (manualNames.has(c.name) ? manualItem(c.name, commandDescription(c)) : commandItem(c)))
  // 꼭 넣을 인자가 없는 명령은 Enter면 바로 보낸다 (매뉴얼·Tab·클릭은 채우기만)
  const handleSlashPick = (i: number, isEnter = false) => {
    const command = slashCommands[i]
    const filled = draft.replace(/\/\S*$/, `/${command.name}`)
    if (isEnter && runsOnEnter(command) && !manualNames.has(command.name)) return void handleSend(filled)
    setDraft(`${filled} `)
  }
  const slashKeys = useSlashKeys(slashCommands.length, slashQuery, handleSlashPick)

  const draftFiles = useDraftAttachments()
  const handleSend = async (typed = draft) => {
    const text = typed.trim()
    if (!text && draftFiles.files.length === 0) return
    setDraft('')
    const attachments = await draftFiles.upload()
    draftFiles.clear()
    void window.office.sendChat(text, attachments, team?.id)
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => slashKeys.onKeyDown(e) || handleComposerKey(e, () => void handleSend(), setDraft)
  // 같은 이름의 직원·팀·랩이 있으면 "@디자인(팀)"처럼 종류를 붙여 고른 대상에게 가게 한다
  const handleMention = (tg: MentionTarget) => setDraft((d) => d.replace(/@(\S*)$/, `${mentionToken(tg, targets)} `))

  // 멘션 없이 보내면 누가 받는지: 전체 방은 알맞은 한 명, 팀 방은 팀장(없으면 팀 안에서 한 명)
  const roomLead = team?.leadId ? staffById.get(team.leadId) : undefined
  const noneLabel = !team ? t('chat.recipientsNone') : roomLead ? t('chat.room.recipientsLead', { name: roomLead.name }) : t('chat.room.recipientsNoLead')

  return (
    <div className="typing:py-2 relative border-t p-4">
      {slashQuery !== null && (
        <SlashMenu
          query={slashQuery}
          items={slashItems}
          active={slashKeys.active}
          onPick={handleSlashPick}
          note={recipientIds.length > 1 ? t('slashMenu.commonOnly', { count: recipientIds.length }) : undefined}
          className="absolute bottom-full left-4 mb-1 w-80 max-w-[calc(100%-2rem)]"
        />
      )}
      {suggestions.length > 0 && (
        <div className="bg-popover absolute bottom-full left-4 mb-1 flex max-h-80 min-w-56 flex-col overflow-y-auto rounded-lg border p-1 shadow-lg">
          {suggestions.map((g) => (
            <div key={g.kind} className="flex flex-col">
              <span className="text-muted-foreground px-2 pt-1 text-[10px]">{t(KIND_LABEL[g.kind])}</span>
              {g.items.map((tg) => (
                <button key={tg.key} type="button" onClick={() => handleMention(tg)} className="hover:bg-accent flex items-center gap-2 rounded px-2 py-1 text-left text-sm">
                  <TargetIcon target={tg} staff={staffById.get(tg.memberIds[0])} /> {tg.name}
                  <span className="text-muted-foreground ml-auto pl-3 text-xs">
                    {tg.kind === 'staff'
                      ? roleLabel(staffById.get(tg.memberIds[0])?.role ?? '')
                      : tg.kind === 'all'
                        ? t(team ? 'chat.room.allMembers' : 'chat.allHired', { count: tg.memberIds.length })
                        : t('chat.peopleCount', { count: tg.memberIds.length })}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="mx-auto mb-2 max-w-3xl">
        <DraftAttachments files={draftFiles.files} onRemove={draftFiles.remove} />
        {parsed && <Recipients parsed={parsed} staffOf={(id) => staffById.get(id)} hasStaff={hired.length > 0} noneLabel={noneLabel} />}
      </div>
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <AttachButton onPick={draftFiles.add} className="size-9" />
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={handleKeyDown} {...draftFiles.bind} rows={1} placeholder={t(team ? 'chat.room.placeholder' : 'chat.placeholder', { all: ALL_MENTION, newline: String(NEWLINE_HINT) })} className="field-sizing-content max-h-32 min-h-9 resize-none py-[7px]" />
        <Button onClick={() => void handleSend()} disabled={!draft.trim() && draftFiles.files.length === 0}>
          <SendIcon />
        </Button>
      </div>
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
