import { useMemo, useState, type KeyboardEvent } from 'react'
import { CheckIcon, FolderIcon, PlusIcon, SendIcon, Trash2Icon, ZapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { handleComposerKey, NEWLINE_HINT } from '@/lib/composerKeys'
import { useOffice } from '@/store'
import { IS_REMOTE_SCREEN } from '@/shell'
import type { AiProvider, ApprovalMode, ModelChoice, Staff } from '@shared/types'
import { quickRoomId, quickStaffIdOf, sortQuickChats } from '@shared/quickChat'
import { unreadByRoom } from '@shared/chatUnread'
import { fmtDate, t } from '@shared/i18n'
import { useProviders } from './ProviderCards'
import { CLAUDE_MODEL_ROWS, claudeModelName } from './modelOptions'
import { statusMetaOf } from './status'
import { unreadText } from './chatRoomHooks'
import { QuickManageDialog } from './QuickManageDialog'
import type { SendInput } from './usePendingSends'

// 빠른 대화 화면: 방 목록의 '＋ 빠른 대화'·묶음, 시작 창, 대화 머리·입력창 (docs/specs/quick-chat-design.md, 시안 docs/design/quick-chat)
// 임시 직원은 파랑 점선으로 정식 직원과 구분한다

/** 방 목록 묶음에 펼쳐 두는 최근 대화 수 — 전체는 '모두 보기'(관리 창) */
const RECENT_MAX = 3
/** 임시 직원 강조색 (앱의 정보 파랑) */
const TEMP_DASH = 'border-[1.5px] border-dashed border-sky-700 dark:border-sky-300'
export const TEMP_TEXT = 'text-sky-700 dark:text-sky-300'

const PROVIDERS: readonly AiProvider[] = ['claude', 'codex']
export const engineName = (p: AiProvider) => (p === 'codex' ? 'GPT' : 'Claude')
export const quickTitleOf = (s: Pick<Staff, 'quickTitle'>) => s.quickTitle || t('quick.untitled')
const titleOf = quickTitleOf

/** role="radio" 묶음 키보드: 고른 것만 Tab으로 들어가고, 화살표로 앞뒤 (끝에서 돌아간다·못 고르는 건 건너뛴다) */
function radioKeys<T>(values: readonly T[], current: T, onPick: (v: T) => void, isDisabled: (v: T) => boolean = () => false) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const from = values.indexOf(current)
    for (let i = 1; i <= values.length; i++) {
      const v = values[(from + step * i + values.length * i) % values.length]
      if (isDisabled(v)) continue
      onPick(v)
      // 고른 단추로 초점도 옮긴다 (같은 묶음 안 role=radio 순서 = values 순서)
      const radios = e.currentTarget.closest('[role=radiogroup]')?.querySelectorAll<HTMLElement>('[role=radio]')
      radios?.[values.indexOf(v)]?.focus()
      return
    }
  }
}

/** 빠른 대화 목록 (진행 중 먼저, 최근 순) */
export function useQuickChats() {
  const staff = useOffice((s) => s.staff)
  return useMemo(() => sortQuickChats(staff.filter((s) => s.kind === 'hired')), [staff])
}

/** 지금 보고 있는 빠른 대화의 임시 직원 (빠른 대화 방이 아니면 undefined) */
export function useQuickRoomStaff(): Staff | undefined {
  const chatRoom = useOffice((s) => s.chatRoom)
  const staff = useOffice((s) => s.staff)
  const id = quickStaffIdOf(chatRoom)
  return id ? staff.find((s) => s.id === id && s.isQuick) : undefined
}

/** 지우기: 확인 창 → 대화 기록·세션 파일·임시 직원 삭제. 보고 있던 방이면 전체 방으로 */
async function deleteQuick(s: Staff, isViewing: boolean, leave: () => void) {
  if (!window.confirm(t('quick.confirmDelete', { title: titleOf(s) }))) return
  try {
    await window.office.deleteQuickChat(s.id)
  } catch {
    showToast(t('quick.deleteFailed'))
    return
  }
  if (isViewing) leave()
}

/** 방 목록(ChatSide)의 '＋ 빠른 대화' 버튼과 '빠른 대화' 묶음 — 최근 3개 + 모두 보기(관리 창), 안 읽은 수, 마우스를 올리면 휴지통 */
export function QuickRoomSection({ onPicked }: { onPicked?: () => void }) {
  const chats = useQuickChats()
  const chatRoom = useOffice((s) => s.chatRoom)
  const isChatView = useOffice((s) => s.view === 'chat')
  const openChatRoom = useOffice((s) => s.openChatRoom)
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const setStartOpen = useOffice((s) => s.setQuickStartOpen)
  const chat = useOffice((s) => s.chat)
  const chatSeen = useOffice((s) => s.chatSeen)
  const unread = useMemo(() => (chatSeen ? unreadByRoom(chat, chatSeen) : {}), [chat, chatSeen])
  const [isManageOpen, setManageOpen] = useState(false)
  const shown = chats.slice(0, RECENT_MAX)
  // 1차는 PC 전용 — 휴대폰 화면에는 묶음을 그리지 않는다
  if (IS_REMOTE_SCREEN) return null
  return (
    <div className="mt-2 flex flex-col gap-0.5 border-t pt-2">
      <span className="text-muted-foreground/70 px-2 pb-0.5 text-[11px] font-medium">{t('quick.section')}</span>
      <button
        type="button"
        data-room-item
        onClick={() => {
          setStartOpen(true)
          onPicked?.()
        }}
        className={cn('flex min-h-8 items-center justify-center gap-1.5 rounded-[10px] bg-sky-50 px-2 text-sm font-semibold dark:bg-sky-950/60', TEMP_DASH, TEMP_TEXT)}
      >
        <PlusIcon className="size-3.5 shrink-0" />
        {t('quick.new')}
      </button>
      {shown.map((s) => {
        const room = quickRoomId(s.id)
        const isActive = isChatView && chatRoom === room
        const when = s.quickClosedAt ?? s.hiredAt
        // 보고 있는 방은 곧 읽음 처리되므로 0 (ChatSide 방 목록과 같은 규칙)
        const unreadCount = isActive ? 0 : (unread[room] ?? 0)
        return (
          <div key={s.id} className={cn('group flex min-h-8 items-center rounded-[10px]', isActive ? 'bg-accent' : 'hover:bg-accent/60')}>
            <button
              type="button"
              data-room-item
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                openChatRoom(room)
                onPicked?.()
              }}
              className={cn('flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm', isActive ? 'text-foreground font-medium' : 'text-muted-foreground')}
            >
              <span className={cn('size-2 shrink-0 rounded-full', s.quickClosedAt ? 'bg-muted-foreground/40' : s.status === 'working' ? 'bg-status-working' : 'bg-sky-600 dark:bg-sky-300')} />
              <span className="flex min-w-0 flex-1 flex-col py-0.5 leading-tight">
                <span className="truncate">{titleOf(s)}</span>
                <span className="text-muted-foreground/80 truncate text-[10px] font-normal">
                  {engineName(s.provider)} · {fmtDate(when, { month: 'numeric', day: 'numeric' })}
                </span>
              </span>
              {s.approvals.length > 0 && <span className="bg-status-waiting size-1.5 shrink-0 rounded-full" title={t('chat.unread.approval')} />}
              {unreadCount > 0 && (
                <span className="bg-status-error dark:text-background min-w-4 shrink-0 rounded-full px-1.5 text-center text-[10px] leading-4 font-semibold text-white" aria-label={t('chat.unread.count', { count: unreadCount })}>
                  {unreadText(unreadCount)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void deleteQuick(s, isActive, () => setChatRoom(null))}
              className="text-muted-foreground hover:text-status-error mr-1 hidden size-6 shrink-0 items-center justify-center rounded-md group-focus-within:flex group-hover:flex"
              title={t('quick.delete')}
              aria-label={`${t('quick.delete')} · ${titleOf(s)}`}
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        )
      })}
      {/* 하나라도 있으면 늘 보인다 — 개수·용량·사용량을 보고 골라 지우는 관리 창 */}
      {chats.length > 0 && (
        <button type="button" onClick={() => setManageOpen(true)} className="text-muted-foreground hover:text-foreground px-2 py-1 text-left text-xs" title={t('quick.manage.title')}>
          {t('quick.showAll', { count: chats.length })}
        </button>
      )}
      <QuickManageDialog open={isManageOpen} onOpenChange={setManageOpen} />
    </div>
  )
}

/** 파일 고칠 때: 매번 묻기 / 자동 허용 (시작 창·설정 공통) */
export function QuickApprovalToggle({ value, onChange }: { value: ApprovalMode; onChange: (v: ApprovalMode) => void }) {
  const options: { value: ApprovalMode; label: string }[] = [
    { value: 'ask', label: t('quick.approval.ask') },
    { value: 'acceptEdits', label: t('quick.approval.acceptEdits') },
  ]
  return (
    <div className="flex flex-col gap-1">
      <div className="bg-muted flex w-fit rounded-lg p-0.5" role="radiogroup" aria-label={t('quick.approval.label')}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            tabIndex={value === o.value ? 0 : -1}
            onKeyDown={radioKeys(
              options.map((x) => x.value),
              value,
              onChange,
            )}
            onClick={() => onChange(o.value)}
            className={cn('focus-ring rounded-md px-3 py-1 text-xs font-medium', value === o.value ? 'bg-background shadow-sm' : 'text-muted-foreground')}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === 'acceptEdits' && <span className="text-muted-foreground text-xs">{t('quick.approval.acceptEditsHint')}</span>}
    </div>
  )
}

/** 시작 창: Claude / GPT 카드 + 작업 폴더(선택) + 파일 고칠 때 */
export function QuickStartDialog() {
  const isOpen = useOffice((s) => s.isQuickStartOpen)
  const setOpen = useOffice((s) => s.setQuickStartOpen)
  const openChatRoom = useOffice((s) => s.openChatRoom)
  const defaultApproval = useOffice((s) => s.settings.quickApproval ?? 'ask')
  const { status, isChecking } = useProviders(isOpen)
  const [picked, setProvider] = useState<AiProvider>('claude')
  const [cwd, setCwd] = useState('')
  const [approval, setApproval] = useState<ApprovalMode | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const approvalMode = approval ?? defaultApproval
  const isReady = (p: AiProvider) => status?.[p].state === 'ready'
  // 고른 쪽이 준비되지 않았고 다른 쪽이 준비됐으면 그쪽으로 (고른 값은 그대로 둔다)
  const other: AiProvider = picked === 'claude' ? 'codex' : 'claude'
  const provider: AiProvider = status && !isReady(picked) && isReady(other) ? other : picked
  const close = () => {
    setOpen(false)
    setCwd('')
    setApproval(null)
  }
  const start = async () => {
    setIsStarting(true)
    try {
      const s = await window.office.startQuickChat({ provider, ...(cwd ? { cwd } : {}), approvalMode })
      close()
      openChatRoom(quickRoomId(s.id))
    } catch {
      showToast(t('quick.start.failed'))
    } finally {
      setIsStarting(false)
    }
  }
  const card = (p: AiProvider) => {
    const isPicked = provider === p
    const ready = isReady(p)
    return (
      <button
        key={p}
        type="button"
        role="radio"
        aria-checked={isPicked}
        tabIndex={isPicked ? 0 : -1}
        onKeyDown={radioKeys(PROVIDERS, provider, setProvider, (v) => Boolean(status) && !isReady(v))}
        disabled={Boolean(status) && !ready}
        onClick={() => setProvider(p)}
        className={cn(
          'focus-ring relative flex flex-1 flex-col gap-1 rounded-[14px] border p-3 text-left disabled:opacity-50',
          isPicked ? 'border-primary ring-primary/20 border-2 ring-4' : 'hover:bg-accent/50',
        )}
      >
        {isPicked && <CheckIcon className="text-primary absolute top-2 right-2 size-4" />}
        <span className="flex items-center gap-2 font-semibold">
          <span className={cn('flex size-6 items-center justify-center rounded-md text-xs font-bold text-white', p === 'codex' ? 'bg-emerald-700' : 'bg-orange-600')}>{p === 'codex' ? 'G' : 'C'}</span>
          {engineName(p)}
        </span>
        <span className="text-muted-foreground text-xs">{t(p === 'codex' ? 'quick.start.gptDesc' : 'quick.start.claudeDesc')}</span>
        <span className={cn('text-[11px]', ready ? 'text-status-working' : 'text-muted-foreground')}>{!status ? t('quick.start.checking') : ready ? t('quick.start.ready') : t('quick.start.notReady')}</span>
      </button>
    )
  }
  return (
    <Dialog open={isOpen} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('quick.start.title')}</DialogTitle>
          <DialogDescription>{t('quick.start.desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('quick.start.ask')}</span>
            <div className="flex gap-3" role="radiogroup" aria-label={t('quick.start.ask')}>
              {card('claude')}
              {card('codex')}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('quick.start.folder')}</span>
            <div className="flex items-center gap-2">
              <FolderIcon className="text-muted-foreground size-4 shrink-0" />
              <span className={cn('min-w-0 flex-1 truncate text-xs', !cwd && 'text-muted-foreground')} title={cwd}>
                {cwd || t('quick.start.folderNone')}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const picked = await window.office.pickFolder()
                  if (picked) setCwd(picked)
                }}
              >
                {t('quick.start.folderPick')}
              </Button>
              {cwd && (
                <Button size="sm" variant="ghost" onClick={() => setCwd('')}>
                  {t('quick.start.folderClear')}
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('quick.approval.label')}</span>
            <QuickApprovalToggle value={approvalMode} onChange={setApproval} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void start()} disabled={isStarting || isChecking || !status || !isReady(provider)}>
            {t('quick.start.go')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 입력창 옆 모델 고르기 — 같은 엔진 안에서만 (엔진 바꾸기는 2차) */
function QuickModelSelect({ staff }: { staff: Staff }) {
  const isCodex = staff.provider === 'codex'
  const { status } = useProviders(isCodex)
  const models = isCodex ? ['default', ...(status?.codex.models ?? [])] : CLAUDE_MODEL_ROWS.map((r) => r.value as string)
  const list = models.includes(staff.model) ? models : [...models, staff.model]
  const label = (m: string) => (m === 'default' ? t('quick.model.default') : isCodex ? m : claudeModelName(m))
  return (
    <NativeSelect
      value={staff.model}
      onChange={(e) => void window.office.updateStaff(staff.id, { model: e.target.value as ModelChoice })}
      aria-label={t('quick.model.label')}
      title={t('quick.model.hint')}
      className={cn('h-9 w-auto max-w-36 rounded-full text-xs', TEMP_TEXT)}
    >
      {list.map((m) => (
        <option key={m} value={m}>
          {`${engineName(staff.provider)} · ${label(m)}`}
        </option>
      ))}
    </NativeSelect>
  )
}

/** 빠른 대화 머리: 제목 · '임시 직원 · Claude' 점선 이름표 · 상태·폴더·결재 방식 · 끝내기 · 지우기 */
export function QuickChatHead({ staff: s }: { staff: Staff }) {
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const meta = statusMetaOf(s)
  const folder = s.cwdSource === 'own' && s.ownCwd ? s.ownCwd.split(/[\\/]/).filter(Boolean).at(-1) : t('quick.head.noFolder')
  return (
    <div className="border-b px-4 pt-3 pb-2">
      <div className="flex min-h-8 items-center gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold">{titleOf(s)}</h1>
        <span className={cn('shrink-0 rounded-full px-2 text-[11px] leading-5 font-medium', TEMP_DASH, TEMP_TEXT)}>{t('quick.head.tag', { engine: engineName(s.provider) })}</span>
        <span className="flex-1" />
        {!s.quickClosedAt && (
          <Button size="sm" variant="outline" onClick={() => void window.office.closeQuickChat(s.id)} title={t('quick.closeHint')}>
            {t('quick.close')}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => void deleteQuick(s, true, () => setChatRoom(null))} title={t('quick.delete')} aria-label={t('quick.delete')}>
          <Trash2Icon />
        </Button>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
        <span>{s.quickClosedAt ? t('quick.head.closed') : meta.label}</span>
        <span>·</span>
        <span className="max-w-60 truncate" title={s.cwd}>
          {folder}
        </span>
        <span>·</span>
        <span>
          {t('quick.head.approval', { mode: t(s.approvalMode === 'acceptEdits' ? 'quick.approval.acceptEdits' : 'quick.approval.ask') })}
        </span>
      </div>
    </div>
  )
}

/** 빠른 대화 입력창: 모델 칩 + 글 + 보내기 (일하는 중이면 '끝나면 보내기'·'지금 끼어들기') */
export function QuickComposer({ staff: s, onSend }: { staff: Staff; onSend: (input: SendInput) => Promise<boolean> }) {
  const [draft, setDraft] = useState('')
  const isBusy = s.status === 'working' && !s.quickClosedAt
  const send = async (mode: 'wait' | 'now' = 'wait') => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    try {
      if (!(await onSend({ text, attachments: [], room: quickRoomId(s.id), mode, replyTo: undefined }))) throw new Error('send failed')
    } catch {
      setDraft((d) => d || text)
      showToast(t('common.sendFailedKept'))
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => handleComposerKey(e, () => void send(), setDraft)
  return (
    <div className="border-t px-4 py-2.5">
      {/* 좁은 채팅 칸에서 일하는 중 단추 둘이 글칸을 밀어내지 않게 줄을 넘긴다 */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-end gap-2">
        <QuickModelSelect staff={s} />
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={t('quick.placeholder', { newline: String(NEWLINE_HINT) })}
          className="field-sizing-content placeholder-shown:field-sizing-fixed placeholder-shown:h-9 max-h-32 min-h-9 min-w-40 flex-1 basis-40 resize-none py-[7px]"
        />
        {isBusy ? (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" className="px-2 text-xs" onClick={() => void send()} title={t('staffPanel.composer.queueTitle')}>
              {t('staffPanel.composer.queue')}
            </Button>
            <Button className="px-2.5 text-xs" onClick={() => void send('now')} title={t('staffPanel.composer.interruptTitle')}>
              <ZapIcon /> {t('staffPanel.composer.interrupt')}
            </Button>
          </div>
        ) : (
          <Button onClick={() => void send()} disabled={!draft.trim()} title={t('quick.send')} aria-label={t('quick.send')}>
            <SendIcon />
          </Button>
        )}
      </div>
    </div>
  )
}

/** 대화가 비었을 때 한 줄 안내 */
export function QuickEmpty() {
  return <p className="text-muted-foreground py-10 text-center text-sm">{t('quick.empty')}</p>
}
