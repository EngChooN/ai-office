import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowUpIcon, CheckIcon, CircleStopIcon, DownloadIcon, SendIcon, SquareTerminalIcon, UserMinusIcon, XIcon, ZapIcon } from 'lucide-react'
import { NativeSelect } from '@/components/ui/select'
import { AttachButton, AttachmentView, DraftAttachments, useDraftAttachments } from '@/components/attachments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { handleComposerKey, NEWLINE_HINT, SEND_HINT, STOP_HINT } from '@/lib/composerKeys'
import { useOffice, useWorkMode } from '@/store'
import { ROLE_PRESETS, type ApprovalMode, type DailyRecord, type LogEntry, type LogType, type ModelChoice, type Staff } from '@shared/types'
import { AvatarEditor } from './AvatarEditor'
import { EquipmentTab } from './EquipmentTab'
import { QuestionBox, StopWorkButton } from './QuestionBox'
import { RefDocsEditor } from './RefDocsEditor'
import { ReviewTab } from './ReviewTab'
import { StaffExportDialog } from './StaffExportDialog'
import { LiveMiniView } from './LiveMiniView'
import { Avatar, StatusDot } from './StaffCard'
import { formatCost, formatTokens, shortPath, workDirLabel } from './status'
import { Markdown } from '@/components/markdown'
import { commandItem, manualItem, SlashMenu, usePersonalManuals, useSlashKeys, useStaffCommands, type SlashMode } from '@/components/slash-menu'
import { matchCommands, runsOnEnter } from '@shared/slashCommands'
import { mergeRefDocs, REF_DOCS_TOTAL } from '@shared/refDocs'
import { fmtDate, t, type TKey } from '@shared/i18n'

const EXTERNAL_REFRESH_MS = 5000
const LOG_LABEL: Record<LogType, TKey> = {
  instruction: 'staffPanel.log.instruction',
  reply: 'staffPanel.log.reply',
  tool: 'staffPanel.log.tool',
  approval: 'staffPanel.log.approval',
  status: 'staffPanel.log.status',
  result: 'staffPanel.log.result',
  error: 'staffPanel.log.error',
  delegate: 'staffPanel.log.delegate',
  commit: 'staffPanel.log.commit',
}
/** "지시·보고만" 보기에서 남기는 기록 */
const CONVERSATION_TYPES = new Set<LogType>(['instruction', 'reply'])
const CONVERSATION_ONLY_KEY = 'office:logConversationOnly'

// 기록 보기 방식은 이 기기에서만 기억하면 충분하다 (못 읽으면 전체 보기)
function readConversationOnly() {
  try {
    return localStorage.getItem(CONVERSATION_ONLY_KEY) === '1'
  } catch {
    return false
  }
}

function writeConversationOnly(isOn: boolean) {
  try {
    localStorage.setItem(CONVERSATION_ONLY_KEY, isOn ? '1' : '0')
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

const PANEL_WIDTH_KEY = 'office:staffPanelWidth'
const DEFAULT_PANEL_WIDTH = 380
const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 960

// 가운데 화면이 너무 좁아지지 않도록 창 폭의 70%까지만 넓힌다
function clampPanelWidth(width: number) {
  return Math.round(Math.min(Math.max(width, MIN_PANEL_WIDTH), MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, window.innerWidth * 0.7)))
}

// 패널 폭도 이 기기에서만 기억한다 (못 읽으면 기본 폭)
function readPanelWidth() {
  try {
    const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    return saved > 0 ? clampPanelWidth(saved) : DEFAULT_PANEL_WIDTH
  } catch {
    return DEFAULT_PANEL_WIDTH
  }
}

function writePanelWidth(width: number) {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(width))
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

/** 업무 기록·지시 입력 글자 크기 (px) — 기본은 예전 text-xs와 같은 12 */
const LOG_FONT_SIZES = [12, 13, 14, 16, 18]
const DEFAULT_LOG_FONT = 0
const LOG_FONT_KEY = 'office:logFontSize'

// 글자 크기도 이 기기에서만 기억한다 (못 읽으면 기본 크기)
function readLogFont() {
  try {
    const i = LOG_FONT_SIZES.indexOf(Number(localStorage.getItem(LOG_FONT_KEY)))
    return i >= 0 ? i : DEFAULT_LOG_FONT
  } catch {
    return DEFAULT_LOG_FONT
  }
}

function writeLogFont(i: number) {
  try {
    localStorage.setItem(LOG_FONT_KEY, String(LOG_FONT_SIZES[i]))
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

const LOG_COLOR: Partial<Record<LogType, string>> = {
  instruction: 'text-primary',
  approval: 'text-status-waiting',
  result: 'text-status-working',
  error: 'text-status-error',
  delegate: 'text-sky-400',
  commit: 'text-violet-400',
}
type PanelTab = 'work' | 'review' | 'equip' | 'profile'
const TAB_LABEL: Record<PanelTab, TKey> = {
  work: 'staffPanel.tab.work',
  review: 'staffPanel.tab.review',
  equip: 'staffPanel.tab.equip',
  profile: 'staffPanel.tab.profile',
}
const MODELS: ModelChoice[] = ['default', 'opus', 'sonnet', 'haiku']
/** 기본 모델만 번역하고 모델 이름은 그대로 */
const modelLabel = (model: Staff['model']) => (model === 'default' ? t('staffPanel.model.default') : { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' }[model])

export function StaffPanel() {
  const staff = useOffice((s) => s.staff.find((x) => x.id === s.selectedId))
  const [width, setWidth] = useState(readPanelWidth)
  if (!staff) return null
  return <PanelBody key={staff.id} staff={staff} width={width} onResize={setWidth} />
}

// 지시를 입력하는 동안 기록 줄이 다시 그려지지 않도록 한 줄씩 메모한다
const LogRow = memo(function LogRow({ entry: l }: { entry: LogEntry }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-[3.4em] shrink-0 tabular-nums">
        {fmtDate(l.ts, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}
      </span>
      <span className={cn('w-[2.6em] shrink-0 font-medium', LOG_COLOR[l.type] ?? 'text-muted-foreground')}>{t(LOG_LABEL[l.type])}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {l.type === 'reply' || l.type === 'result' ? <Markdown>{l.text}</Markdown> : <span className="selectable break-words whitespace-pre-wrap">{l.text}</span>}
        <AttachmentView attachments={l.attachments} size="sm" />
      </div>
    </div>
  )
})

/** 패널 왼쪽 가장자리를 끌어 폭을 바꾼다. 더블클릭하면 기본 폭으로 */
function ResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    let latest = width
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const handleMove = (ev: PointerEvent) => {
      latest = clampPanelWidth(startWidth + startX - ev.clientX)
      onResize(latest)
    }
    const handleUp = () => {
      handle.removeEventListener('pointermove', handleMove)
      handle.removeEventListener('pointerup', handleUp)
      handle.removeEventListener('pointercancel', handleUp)
      writePanelWidth(latest)
    }
    handle.addEventListener('pointermove', handleMove)
    handle.addEventListener('pointerup', handleUp)
    handle.addEventListener('pointercancel', handleUp)
  }
  const handleDoubleClick = () => {
    onResize(DEFAULT_PANEL_WIDTH)
    writePanelWidth(DEFAULT_PANEL_WIDTH)
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('staffPanel.resize.label')}
      title={t('staffPanel.resize.title')}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      className="hover:bg-primary/40 active:bg-primary/60 phone:hidden absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors"
    />
  )
}

function PanelBody({ staff, width, onResize }: { staff: Staff; width: number; onResize: (width: number) => void }) {
  const select = useOffice((s) => s.select)
  const liveLogs = useOffice((s) => s.liveLogs)
  const [record, setRecord] = useState<DailyRecord | null>(null)
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<PanelTab>('work')
  const logEndRef = useRef<HTMLDivElement>(null)
  const isHired = staff.kind === 'hired'

  useEffect(() => {
    const load = () => void window.office.getRecord(staff.id).then(setRecord)
    load()
    if (isHired) return
    const timer = setInterval(load, EXTERNAL_REFRESH_MS)
    return () => clearInterval(timer)
    // 고용 직원은 턴이 끝나 비용이 바뀔 때마다 오늘 사용량을 다시 읽는다
  }, [staff.id, isHired, staff.costUsd])

  const logs = useMemo<LogEntry[]>(() => {
    const base = record?.logs ?? []
    if (!isHired) return base
    const lastId = base.at(-1)?.id ?? 0
    return [...base, ...liveLogs.filter((l) => l.staffId === staff.id && l.id > lastId)]
  }, [record, liveLogs, staff.id, isHired])
  const [isConversationOnly, setIsConversationOnly] = useState(readConversationOnly)
  const [logFont, setLogFont] = useState(readLogFont)
  const fontSize = LOG_FONT_SIZES[logFont]
  const handleLogFont = (step: number) => {
    const next = Math.min(LOG_FONT_SIZES.length - 1, Math.max(0, logFont + step))
    setLogFont(next)
    writeLogFont(next)
  }
  const shownLogs = useMemo(() => (isConversationOnly ? logs.filter((l) => CONVERSATION_TYPES.has(l.type)) : logs), [logs, isConversationOnly])
  const handleConversationOnly = (isOn: boolean) => {
    setIsConversationOnly(isOn)
    writeConversationOnly(isOn)
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [logs.length, isConversationOnly])

  const todayTokens = isHired ? null : record ? record.tokensIn + record.tokensOut : 0
  const handleClose = () => select(null)
  const draftFiles = useDraftAttachments()
  const [pickedManual, setPickedManual] = useState<ManualChoice | null>(null)
  // now: 일하는 중이면 하던 일을 멈추고 바로 전한다 (끼어들기) · 아니면 하던 일이 끝난 뒤 이어서 처리한다
  const handleSend = async (isNow = false, typed = draft) => {
    const text = typed.trim().replace(/^\/\S*\s*/, (m) => (pickedManual ? '' : m))
    if (!text && draftFiles.files.length === 0) return
    setDraft('')
    const attachments = await draftFiles.upload()
    draftFiles.clear()
    const choice = pickedManual
    setPickedManual(null)
    if (choice?.scope) {
      void window.office.startRun({ manualName: choice.name, scope: choice.scope, input: text, attachments })
      return
    }
    // /명령(스킬 포함)은 그대로 보낸다 — 막힌 명령·/clear는 main이 판정한다. 개인 매뉴얼을 고르면 그 스킬을 쓰라고 분명히 적어 보낸다
    const body = text || '첨부한 파일을 확인해 주세요.'
    const instruction = choice ? `[업무 매뉴얼: ${choice.name}] "${choice.name}" 스킬(매뉴얼)을 사용해서 처리해 주세요.\n${body}` : body
    if (isNow) void window.office.interrupt(staff.id, instruction, attachments)
    else void window.office.instruct(staff.id, instruction, attachments)
  }
  const isBusy = staff.status === 'working' || staff.status === 'waiting'
  const hasDraft = Boolean(draft.trim()) || draftFiles.files.length > 0

  // '/'로 시작하는 첫 낱말을 치는 동안: 위에 '내 매뉴얼'(개인 매뉴얼 + 랩·팀 프로세스), 아래에 'Claude 명령'.
  // 📘 매뉴얼·/ 명령 버튼으로 열면 그쪽만 보인다
  const slashQuery = isHired && !pickedManual ? (draft.match(/^\/(\S*)$/)?.[1] ?? null) : null
  const [slashMode, setSlashMode] = useState<SlashMode>('all')
  useEffect(() => {
    if (slashQuery === null) setSlashMode('all')
  }, [slashQuery])
  const openSlash = (mode: SlashMode) => {
    setSlashMode(mode)
    setDraft((d) => (d.startsWith('/') ? d : `/${d}`))
  }
  const isMenuOpen = slashQuery !== null
  const personalManuals = usePersonalManuals(isMenuOpen)
  const commands = useStaffCommands([staff.id], isMenuOpen && slashMode !== 'manual')
  const processes = useProcessChoices(staff)
  const q = (slashQuery ?? '').toLowerCase()
  const manualChoices: ManualChoice[] =
    !isMenuOpen || slashMode === 'command'
      ? []
      : [
          ...personalManuals
            .filter((m) => staff.equipment.skills === 'all' || staff.equipment.skills.includes(m.name))
            .map((m) => ({ name: m.name, label: m.name, description: m.description })),
          ...processes,
        ].filter((m) => m.name.toLowerCase().includes(q))
  // 스킬 목록 중 매뉴얼실에 있는 개인 매뉴얼(이름 대조)은 '내 매뉴얼' 쪽에만 둔다
  const manualNames = new Set(personalManuals.map((m) => m.name))
  const slashCommands =
    !isMenuOpen || slashMode === 'manual' || !commands ? [] : matchCommands(commands.filter((c) => !manualNames.has(c.name)), q)
  const isLoading = slashMode !== 'manual' && !commands
  const slashItems =
    isLoading && manualChoices.length === 0
      ? null
      : [
          ...manualChoices.map((m) =>
            m.scope ? { ...manualItem(m.name), key: `run:${m.label}`, label: `🔁 ${m.label}`, tag: t('staffPanel.manual.startProcess') } : manualItem(m.name, m.description),
          ),
          ...slashCommands.map(commandItem),
        ]
  // 매뉴얼·프로세스는 고른 표시로 바꾸고, 명령은 "/이름 "까지 채워 인자를 이어 쓰게 한다(한 번 더 Enter로 보내기)
  // 매뉴얼·프로세스·꼭 넣을 인자가 있는 명령은 채우기만, 나머지 명령은 Enter면 바로 보낸다
  const handleSlashPick = (i: number, isEnter = false) => {
    if (i >= manualChoices.length) {
      const command = slashCommands[i - manualChoices.length]
      if (isEnter && runsOnEnter(command)) return void handleSend(false, `/${command.name}`)
      return setDraft(`/${command.name} `)
    }
    setPickedManual(manualChoices[i])
    setDraft('')
  }
  const slashKeys = useSlashKeys(slashItems?.length ?? 0, slashQuery, handleSlashPick)

  // Esc는 Claude Code처럼 하던 일을 멈춘다 (쓰던 글은 그대로 둔다)
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashKeys.onKeyDown(e)) return
    if (e.key === 'Escape' && isBusy && !e.nativeEvent.isComposing) {
      e.preventDefault()
      return handleInterrupt()
    }
    handleComposerKey(e, () => void handleSend(), setDraft)
  }
  const handleInterrupt = () => void window.office.interrupt(staff.id)
  const [resumeError, setResumeError] = useState('')
  const handleResume = async () => {
    try {
      setResumeError(await window.office.resumeInTerminal(staff.id))
    } catch {
      setResumeError(t('staffPanel.resume.error'))
    }
  }
  const handleFire = () => {
    if (window.confirm(t('staffPanel.fire.confirm', { name: staff.name }))) void window.office.fire(staff.id)
  }
  const [isExportOpen, setExportOpen] = useState(false)

  return (
    <aside
      style={{ width }}
      className="bg-card phone:fixed phone:inset-0 phone:bottom-[var(--ime,0px)] phone:h-auto phone:z-40 phone:w-full! phone:border-l-0 phone:pr-[env(safe-area-inset-right)] phone:pl-[env(safe-area-inset-left)] short:overflow-y-auto relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l"
    >
      <ResizeHandle width={width} onResize={onResize} />
      <header className="flex items-start gap-3 border-b p-4">
        <HeaderPortrait staff={staff} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{staff.name}</span>
            <StatusDot staff={staff} />
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {staff.role}
            {isHired && ` · ${modelLabel(staff.model)}`}
          </div>
          <div className="text-muted-foreground selectable truncate text-xs" title={staff.cwd}>
            {workDirLabel(staff)}
          </div>
          {/* 사무실에서 나눈 대화를 터미널의 Claude Code에서 그대로 이어 쓴다 (쉬는 중일 때만) */}
          {isHired && staff.sessionId && (
            <button
              type="button"
              onClick={() => void handleResume()}
              disabled={isBusy}
              title={
                isBusy
                  ? t('staffPanel.resume.busyTitle')
                  : t('staffPanel.resume.title')
              }
              className="text-primary mt-1 flex items-center gap-1 text-xs hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              <SquareTerminalIcon className="size-3.5" /> {t('staffPanel.resume.button')}
              {isBusy && <span className="text-muted-foreground">{t('staffPanel.resume.afterWork')}</span>}
            </button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose} aria-label={t('common.close')}>
          <XIcon />
        </Button>
      </header>
      {resumeError && <p className="text-status-error border-b px-4 py-2 text-xs">{resumeError}</p>}

      {staff.approvals.length > 0 && (
        <section className="flex max-h-[50%] shrink-0 flex-col gap-2 overflow-y-auto border-b p-4">
          <h3 className="text-status-waiting text-xs font-semibold">{t('staffPanel.approvals.title', { n: staff.approvals.length })}</h3>
          {staff.approvals.map((a) => (
            <div key={a.id} className="bg-muted flex flex-col gap-2 rounded-lg p-3">
              {a.questions ? (
                <QuestionBox approval={a} />
              ) : (
                <>
                  <div className="text-sm font-medium">{a.toolName}</div>
                  <div className="text-muted-foreground selectable line-clamp-3 font-mono text-xs break-all">{a.summary}</div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void window.office.decide(a.id, true)}>
                      <CheckIcon /> {t('staffPanel.approvals.approve')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void window.office.decide(a.id, false)}>
                      {t('staffPanel.approvals.reject')}
                    </Button>
                    {isHired && <StopWorkButton staffId={staff.id} className="ml-auto" />}
                  </div>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {
        <div className="flex border-b px-4 text-xs">
          {(isHired ? (['work', 'review', 'equip', 'profile'] as const) : (['work', 'review'] as const)).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn('-mb-px border-b-2 px-3 py-2', tab === key ? 'border-primary text-foreground font-medium' : 'text-muted-foreground border-transparent')}
            >
              {t(TAB_LABEL[key])}
            </button>
          ))}
        </div>
      }

      {tab === 'review' ? (
        <ReviewTab staff={staff} />
      ) : tab === 'equip' && isHired ? (
        <EquipmentTab staff={staff} />
      ) : tab === 'profile' && isHired ? (
        <Profile staff={staff} />
      ) : (
        <>
          <section className="flex items-center gap-4 border-b px-4 py-3 text-xs">
            <span className="text-muted-foreground">{t('staffPanel.usage.today')}</span>
            <span>{t('staffPanel.usage.tokens', { n: formatTokens(isHired ? (record?.tokensIn ?? 0) + (record?.tokensOut ?? 0) : (todayTokens ?? 0)) })}</span>
            {isHired && <span>{formatCost(record?.costUsd ?? 0)}</span>}
            {isHired && <span className="text-muted-foreground ml-auto">{t('staffPanel.usage.total', { cost: formatCost(staff.costUsd) })}</span>}
          </section>

          {/* 제목·보기 토글은 기록을 스크롤해도 보이도록 스크롤 영역 밖에 둔다 */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <h3 className="text-muted-foreground text-xs font-semibold">{t('staffPanel.log.title')}</h3>
            <div className="ml-auto flex items-center rounded-md border" role="group" aria-label={t('staffPanel.font.label')}>
              <button
                type="button"
                onClick={() => handleLogFont(-1)}
                disabled={logFont === 0}
                aria-label={t('staffPanel.font.smaller')}
                title={t('staffPanel.font.smaller')}
                className="text-muted-foreground hover:text-foreground px-1.5 text-[10px] disabled:opacity-40"
              >
                {t('staffPanel.font.smallerIcon')}
              </button>
              <span className="text-muted-foreground border-x px-1 text-[10px] tabular-nums" title={t('staffPanel.font.sizeTitle')}>
                {fontSize}
              </span>
              <button
                type="button"
                onClick={() => handleLogFont(1)}
                disabled={logFont === LOG_FONT_SIZES.length - 1}
                aria-label={t('staffPanel.font.larger')}
                title={t('staffPanel.font.larger')}
                className="text-muted-foreground hover:text-foreground px-1.5 text-[13px] disabled:opacity-40"
              >
                {t('staffPanel.font.largerIcon')}
              </button>
            </div>
            <label className="text-muted-foreground flex cursor-pointer items-center gap-1 text-[11px]">
              <input type="checkbox" checked={isConversationOnly} onChange={(e) => handleConversationOnly(e.target.checked)} />
              {t('staffPanel.log.conversationOnly')}
            </label>
          </div>
          {/* 가로 폰: 패널 전체를 밀어 올려 보도록 기록 칸 높이를 지킨다 */}
          <section className="short:min-h-[70dvh] flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4" style={{ fontSize }}>
            {shownLogs.length === 0 && <p className="text-muted-foreground">{t('staffPanel.log.empty')}</p>}
            {shownLogs.map((l) => (
              <LogRow key={`${l.id}-${l.ts}`} entry={l} />
            ))}
            <div ref={logEndRef} />
          </section>
        </>
      )}

      {tab === 'review' || tab === 'equip' ? null : isHired ? (
        <footer className="flex flex-col gap-2 border-t p-4">
          <DraftAttachments files={draftFiles.files} onRemove={draftFiles.remove} />
          {pickedManual && <PickedManual manual={pickedManual} onRemove={() => setPickedManual(null)} />}
          {slashQuery !== null && (
            <SlashMenu query={slashQuery} items={slashItems} active={slashKeys.active} onPick={handleSlashPick} emptyText={slashMode === 'manual' ? t('slashMenu.emptyManual') : undefined} />
          )}
          {/* 입력 상자 안: 왼쪽 첨부, 오른쪽 보내기. 일하는 중이면 비어 있을 땐 "멈추기", 글을 쓰면 "끝나면 보내기"·"지금 끼어들기" 두 갈래를 글자로 보여 준다 */}
          <div className="border-input focus-within:ring-ring/50 flex items-end gap-1 rounded-lg border px-1.5 py-1 focus-within:ring-2">
            <AttachButton onPick={draftFiles.add} className="shrink-0" />
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              {...draftFiles.bind}
              placeholder={
                isBusy
                  ? t('staffPanel.composer.busyPlaceholder', { keys: `${STOP_HINT}${NEWLINE_HINT}` })
                  : t('staffPanel.composer.placeholder', { name: staff.name, keys: `${SEND_HINT}${NEWLINE_HINT}` })
              }
              className="field-sizing-content max-h-40 min-h-8 min-w-0 flex-1 resize-none border-0 px-1 py-1.5 focus-visible:ring-0"
              style={{ fontSize }}
            />
            {isBusy && !hasDraft ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 px-2.5 text-xs"
                onClick={handleInterrupt}
                title={t('staffPanel.composer.stopTitle')}
              >
                <CircleStopIcon /> {t('staffPanel.composer.stop')}
              </Button>
            ) : isBusy ? (
              <div className="flex shrink-0 gap-1">
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void handleSend()} title={t('staffPanel.composer.queueTitle')}>
                  {t('staffPanel.composer.queue')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => void handleSend(true)}
                  title={t('staffPanel.composer.interruptTitle')}
                >
                  <ZapIcon /> {t('staffPanel.composer.interrupt')}
                </Button>
              </div>
            ) : (
              <Button type="button" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => void handleSend()} disabled={!hasDraft} aria-label={t('staffPanel.composer.send')} title={t('staffPanel.composer.sendTitle')}>
                <ArrowUpIcon className="size-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openSlash('manual')} title={t('slashMenu.manualButtonTitle')}>
              {t('slashMenu.manualButton')}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openSlash('command')} title={t('slashMenu.buttonTitle')}>
              {t('slashMenu.button')}
            </Button>
            {window.officePack && (
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setExportOpen(true)}>
                <DownloadIcon /> {t('pack.export.button')}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-muted-foreground ml-auto" onClick={handleFire}>
              <UserMinusIcon /> {t('staffPanel.fire.button')}
            </Button>
            <StaffExportDialog open={isExportOpen} onOpenChange={setExportOpen} initialId={staff.id} />
          </div>
        </footer>
      ) : (
        <ExternalActions staff={staff} />
      )}
    </aside>
  )
}

const PROFILE_DATE: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

/** 직원 프로필·성장: 레벨·경험치·누적 실적·소속 팀·예약 업무 */
function Profile({ staff }: { staff: Staff }) {
  // 업무 모드에선 레벨·경험치를 숨기고 업무 지표 칸만 남긴다
  const isWorkMode = useWorkMode()
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const schedules = useOffice(useShallow((s) => s.schedules.filter((x) => x.staffId === staff.id)))
  const setView = useOffice((s) => s.setView)
  const team = teams.find((tm) => tm.id === staff.teamId)
  const st = staff.stats
  const items = [
    { label: t('staffPanel.profile.tasksDone'), value: st.tasksDone },
    { label: t('staffPanel.profile.toolCalls'), value: st.toolCalls },
    { label: t('staffPanel.profile.approvals'), value: st.approvals },
    { label: t('staffPanel.profile.totalPay'), value: formatCost(staff.costUsd) },
  ]
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {!isWorkMode && <AvatarEditor value={staff.avatar} role={staff.role} onChange={(avatar) => void window.office.updateStaff(staff.id, { avatar })} />}
      <NameRole key={`${staff.name}\n${staff.role}`} staff={staff} />
      {!isWorkMode && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">Lv.{st.level}</span>
            <span className="text-muted-foreground text-xs">{t('staffPanel.profile.xp', { n: st.xp })}</span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${Math.round(st.progress * 100)}%` }} />
          </div>
          <p className="text-muted-foreground text-[11px]">{t('staffPanel.profile.xpRule')}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className="bg-muted rounded-lg p-3">
            <div className="text-muted-foreground text-[11px]">{it.label}</div>
            <div className="text-lg font-semibold">{it.value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">📘 {t('staffPanel.profile.skills')}</span>
        <div className="flex flex-wrap gap-1">
          {staff.equipment.skills === 'all' ? (
            <span className="bg-muted rounded-full px-2 py-0.5">{t('staffPanel.profile.skillsAll')}</span>
          ) : staff.equipment.skills.length === 0 ? (
            <span className="text-muted-foreground">{t('staffPanel.profile.skillsNone')}</span>
          ) : (
            staff.equipment.skills.map((n) => (
              <span key={n} className="bg-primary/15 text-primary rounded-full px-2 py-0.5 font-medium">
                📘 {n}
              </span>
            ))
          )}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{t('staffPanel.profile.model')}</span>
        <NativeSelect value={staff.model} onChange={(e) => void window.office.updateStaff(staff.id, { model: e.target.value as ModelChoice })}>
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {modelLabel(m)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{t('staffPanel.profile.team')} {team?.leadId === staff.id && (isWorkMode ? t('staffPanel.profile.lead') : t('staffPanel.profile.leader'))}</span>
        <NativeSelect
          value={staff.teamId ?? ''}
          onChange={(e) =>
            void window.office.updateStaff(staff.id, {
              teamId: e.target.value || null,
            })
          }
        >
          <option value="">{t('staffPanel.noTeam')}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <WorkDir staff={staff} />
      {staff.kind === 'hired' && <StaffRefDocs staff={staff} />}
      <div className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{t('staffPanel.profile.schedules')}</span>
        {schedules.length === 0 && <span className="text-muted-foreground">{t('staffPanel.profile.none')}</span>}
        {schedules.map((sc) => (
          <span key={sc.id}>
            {sc.time} · {sc.label}
            {!sc.enabled && t('staffPanel.profile.scheduleOff')}
          </span>
        ))}
        <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setView('schedule')}>
          {t('staffPanel.profile.manageSchedules')}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t('staffPanel.profile.hiredAt', { date: fmtDate(staff.hiredAt, PROFILE_DATE) })}</p>
    </section>
  )
}

/** 이름·직무 바꾸기. 저장된 값이 바뀌면 key로 새로 열려 입력값도 맞춰진다 */
function NameRole({ staff }: { staff: Staff }) {
  const [name, setName] = useState(staff.name)
  const [role, setRole] = useState(staff.role)
  const nextName = name.trim()
  const nextRole = role.trim()
  const isDirty = nextName !== staff.name || nextRole !== staff.role
  const isValid = nextName !== '' && nextRole !== ''
  const handleSave = () => {
    if (isDirty && isValid) void window.office.updateStaff(staff.id, { name: nextName, role: nextRole })
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSave()
  }
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t('staffPanel.profile.name')}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKeyDown} className="h-8 text-xs" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t('staffPanel.profile.role')}</span>
          <Input value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={handleKeyDown} className="h-8 text-xs" />
        </label>
      </div>
      {isDirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" disabled={!isValid} onClick={handleSave}>
            {t('common.save')}
          </Button>
          <span className="text-muted-foreground text-[11px]">{isValid ? t('staffPanel.profile.nameHint') : t('staffPanel.profile.nameRequired')}</span>
        </div>
      )}
    </div>
  )
}

/** 작업 폴더: 직접 지정하거나, 지정 안 하면 홈 폴더에서 어떤 프로젝트 일이든 맡는다 */
const NO_DOCS: string[] = []

/** 직원 참고 문서. 팀·랩 문서까지 합쳐 프롬프트 합계 상한을 넘으면 빠지는 수를 알려 준다 */
function StaffRefDocs({ staff }: { staff: Staff }) {
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  const docs = staff.refDocs ?? NO_DOCS
  const omitted = useMemo(() => {
    const team = teams.find((tm) => tm.id === staff.teamId)
    const myLabs = labs.filter((l) => l.memberIds.includes(staff.id) || l.leadId === staff.id)
    // 없는 파일은 main이 세션을 열 때 빼므로 여기선 모두 있다고 보고 센다 (최대치 기준 안내)
    return mergeRefDocs([{ label: '개인', docs }, ...(team ? [{ label: team.name, docs: team.refDocs ?? [] }] : []), ...myLabs.map((l) => ({ label: l.name, docs: l.refDocs ?? [] }))], () => true)
      .omitted
  }, [docs, staff.id, staff.teamId, teams, labs])
  return (
    <div className="flex flex-col gap-1">
      <RefDocsEditor target={{ kind: 'staff', id: staff.id }} docs={docs} audience={t('staffPanel.refDocs.audience')} />
      {omitted > 0 && (
        <span className="text-status-waiting text-[11px]">
          {t('staffPanel.refDocs.omitted', { total: REF_DOCS_TOTAL, n: omitted })}
        </span>
      )}
    </div>
  )
}

function WorkDir({ staff }: { staff: Staff }) {
  const handlePick = async () => {
    const dir = await window.office.pickFolder()
    if (dir) void window.office.updateStaff(staff.id, { cwd: dir })
  }
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{t('staffPanel.workDir.title')}</span>
      {staff.ownCwd ? (
        <span className="selectable truncate font-mono text-[11px]" title={staff.ownCwd}>
          {shortPath(staff.ownCwd)}
        </span>
      ) : (
        <span>{t('staffPanel.workDir.none')}</span>
      )}
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void handlePick()}>
          {staff.ownCwd ? t('staffPanel.workDir.change') : t('staffPanel.workDir.pick')}
        </Button>
        {staff.ownCwd && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void window.office.updateStaff(staff.id, { cwd: '' })}>
            {t('staffPanel.workDir.clear')}
          </Button>
        )}
      </div>
      <span className="text-muted-foreground text-[11px]">{t('staffPanel.workDir.hint')}</span>
    </div>
  )
}

/** 외부 직원: 정식 채용(대화 이어받기) 또는 해고(세션 종료) */
function ExternalActions({ staff }: { staff: Staff }) {
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const select = useOffice((s) => s.select)
  const [isRecruiting, setIsRecruiting] = useState(false)
  const [role, setRole] = useState<string>(ROLE_PRESETS[1])
  const [model, setModel] = useState<ModelChoice>('default')
  const [teamId, setTeamId] = useState('')
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('ask')
  const [order, setOrder] = useState('')
  const [isSending, setIsSending] = useState(false)

  /** 원래 창은 그대로 두고, 대화를 복사한 분신이 사무실에서 지시를 받아 일한다 */
  const orderFiles = useDraftAttachments()
  const handleFork = async () => {
    const text = order.trim()
    if (!text) return
    setIsSending(true)
    const attachments = await orderFiles.upload()
    orderFiles.clear()
    const clone = await window.office.forkExternal(staff.id, text, attachments)
    setIsSending(false)
    setOrder('')
    if (clone) select(clone.id)
  }

  const handleFire = async () => {
    if (!window.confirm(t('staffPanel.external.fireConfirm', { name: staff.name }))) return
    if (!(await window.office.fireExternal(staff.id))) window.alert(t('staffPanel.external.fireFailed'))
  }
  const handleRecruit = async () => {
    if (!window.confirm(t('staffPanel.external.recruitConfirm', { name: staff.name }))) return
    const hired = await window.office.recruitExternal(staff.id, {
      role,
      model,
      teamId: teamId || null,
      approvalMode,
    })
    if (hired) select(hired.id)
  }

  return (
    <footer className="flex flex-col gap-2 border-t p-4 text-xs">
      <DraftAttachments files={orderFiles.files} onRemove={orderFiles.remove} />
      <Textarea value={order} onChange={(e) => setOrder(e.target.value)} {...orderFiles.bind} placeholder={t('staffPanel.external.placeholder', { name: staff.name })} className="max-h-32 min-h-14 resize-none" />
      <div className="flex items-center gap-2">
        <AttachButton onPick={orderFiles.add} />
        <Button size="sm" onClick={handleFork} disabled={!order.trim() || isSending || !staff.sessionId}>
          <SendIcon /> {t('staffPanel.external.fork')}
        </Button>
        <span className="text-muted-foreground">{t('staffPanel.external.forkHint')}</span>
      </div>
      <div className="border-t" />
      {isRecruiting ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value)} className="h-8 flex-1 text-xs">
              {ROLE_PRESETS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </NativeSelect>
            <NativeSelect value={model} onChange={(e) => setModel(e.target.value as ModelChoice)} className="h-8 w-24 text-xs">
              <option value="default">{t('staffPanel.external.modelDefault')}</option>
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
            </NativeSelect>
          </div>
          <div className="flex gap-2">
            <NativeSelect value={teamId} onChange={(e) => setTeamId(e.target.value)} className="h-8 flex-1 text-xs">
              <option value="">{t('staffPanel.noTeam')}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)} className="h-8 w-28 text-xs">
              <option value="ask">{t('staffPanel.external.approveAll')}</option>
              <option value="acceptEdits">{t('staffPanel.external.acceptEdits')}</option>
            </NativeSelect>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleRecruit}>
              {t('staffPanel.external.recruit')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsRecruiting(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setIsRecruiting(true)} disabled={!staff.sessionId}>
            {t('staffPanel.external.recruit')}
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground ml-auto" onClick={handleFire} disabled={!staff.pid}>
            <UserMinusIcon /> {t('staffPanel.external.fire')}
          </Button>
        </div>
      )}
    </footer>
  )
}

/** 지시창에서 고를 수 있는 매뉴얼 — scope가 있으면 랩·팀 프로세스(실행 시작), 없으면 개인 매뉴얼(스킬로 지시) */
interface ManualChoice {
  name: string
  label: string
  description?: string
  scope?: { kind: 'lab' | 'team'; id: string }
}

/** 이 직원이 속한 랩·팀의 프로세스 */
function useProcessChoices(staff: Staff): ManualChoice[] {
  const labs = useOffice((s) => s.labs)
  const teams = useOffice((s) => s.teams)
  return [
    ...labs
      .filter((l) => l.memberIds.includes(staff.id))
      .flatMap((l) => (l.manuals ?? []).map((m): ManualChoice => ({ name: m, label: `${m} · 🧪 ${l.name}`, scope: { kind: 'lab', id: l.id } }))),
    ...teams
      .filter((tm) => tm.id === staff.teamId)
      .flatMap((tm) => (tm.manuals ?? []).map((m): ManualChoice => ({ name: m, label: `${m} · ${tm.name}`, scope: { kind: 'team', id: tm.id } }))),
  ]
}

/** 고른 매뉴얼 표시 — 보내면 프로세스는 실행을 시작하고, 개인 매뉴얼은 그 스킬을 쓰라고 지시한다 */
function PickedManual({ manual, onRemove }: { manual: ManualChoice; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 font-medium">
        {manual.scope ? '🔁' : '📘'} {manual.label}
      </span>
      <button type="button" className="text-muted-foreground" onClick={onRemove}>
        {t('staffPanel.manual.remove')}
      </button>
    </div>
  )
}

/** 머리말 얼굴 자리: 사무실 지도에서 지금 움직이는 모습을 작게 (업무 탭 높이를 뺏지 않게 머리말 안에 둔다). 업무 모드면 정지 아바타 */
function HeaderPortrait({ staff }: { staff: Staff }) {
  const isWorkMode = useWorkMode()
  if (isWorkMode) return <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} className="size-12" />
  return <LiveMiniView staff={staff} isCompact className="w-28 shrink-0" />
}
