// 데모데이 발표장 화면 (PC 전용): 데모데이가 시작되면 막이 닫혔다 열리며 이 화면으로 옮겨 오고, 직원이 차례로 연단에 나와 발표한다.
// 무대·사람·이펙트는 Phaser 장면(map/iso/demoStageScene), 스크린 슬라이드·말풍선·반응 버튼·전환 막은 여기 DOM이 그린다.
// 발표 진행은 PC(main)가 하고 이 화면은 보여 주기만 해서, 사무실로 돌아가도 발표는 계속된다 (회의실 기록에서 다시 볼 수 있다)
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as Phaser from 'phaser'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { isReducedMotion } from '@/lib/reducedMotion'
import { useOffice, useWorkMode } from '@/store'
import { DemoStageScene, type StageLayout } from '@/map/iso/demoStageScene'
import { ART_KIT, artStageCurtainPanel, STAGE_COLORS, toCanvas } from '@/map/iso/isoArt'
import { attachmentUrl, isImageAttachment, isMeetingLive, type Meeting } from '@shared/types'
import { DEMO_COMMENT_MAX, type DemoReaction } from '@shared/gallery'
import { useNow } from './status'
import { t } from '@shared/i18n'

/** 진행 표시가 이만큼 멈춰 있으면 앱이 꺼졌다 켜진 옛 회의로 보고 발표장으로 부르지 않는다 */
const STALE_MS = 90_000
const SLIDE_MS = 3_000
const TYPING_MS_PER_CHAR = 45
const NOTE_MS = 2_500
const ERROR_MS = 3_000
/** 전환 (명세 6절): 어두워지며 막이 닫히고 → "🎤 데모데이" → 막이 열린다 / 돌아갈 땐 막 없이 페이드 */
const CURTAIN_CLOSE_AT = 100
const TITLE_AT = 600
const CURTAIN_OPEN_AT = 1_100
const LEAVE_MS = 300
const CARD_BG = '#eef6fb'

const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '') : String(e))

/** 지금 진행 중인 데모데이 (오래 멈춘 옛 기록은 뺀다) */
export function liveDemoOf(meetings: Meeting[], now = Date.now()) {
  return meetings.find((m) => m.kind === 'demo' && m.demo && isMeetingLive(m) && now < m.demo.startedAt + m.demo.durationMs + STALE_MS) ?? null
}

/** 앱 전체에 한 번 붙는다: 새 데모데이가 시작되면 발표장으로 옮기고, 열려 있으면 발표장을 그린다 */
export function DemoStage() {
  const stageId = useOffice((s) => s.demoStageId)
  const setStageId = useOffice((s) => s.setDemoStageId)
  const live = useOffice((s) => liveDemoOf(s.meetings))
  const isWorkMode = useWorkMode()
  // 한 회의는 한 번만 저절로 연다 — 사무실로 돌아간 뒤 다시 끌려오지 않게
  const autoOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!live || isWorkMode || autoOpenedRef.current === live.id) return
    autoOpenedRef.current = live.id
    if (Date.now() - live.createdAt < STALE_MS) setStageId(live.id)
  }, [live, isWorkMode, setStageId])
  return stageId ? <StageOverlay key={stageId} meetingId={stageId} onClose={() => setStageId(null)} /> : null
}

type Curtain = 'open' | 'closed'

function StageOverlay({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const meeting = useOffice((s) => s.meetings.find((m) => m.id === meetingId))
  const staff = useOffice((s) => s.staff)
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<DemoStageScene | null>(null)
  const [layout, setLayout] = useState<StageLayout | null>(null)
  const [isShown, setIsShown] = useState(false)
  const [curtain, setCurtain] = useState<Curtain>('open')
  const [isTitleShown, setIsTitleShown] = useState(false)
  const [note, setNote] = useState<{ text: string; key: number } | null>(null)
  const isStill = useMemo(() => isReducedMotion(), [])

  const leave = () => {
    setIsShown(false)
    setTimeout(onClose, LEAVE_MS)
  }

  // 들어오는 전환
  useEffect(() => {
    const timers = [setTimeout(() => setIsShown(true), 0)]
    if (!isStill)
      timers.push(
        setTimeout(() => setCurtain('closed'), CURTAIN_CLOSE_AT),
        setTimeout(() => setIsTitleShown(true), TITLE_AT),
        setTimeout(() => {
          setIsTitleShown(false)
          setCurtain('open')
        }, CURTAIN_OPEN_AT),
      )
    return () => timers.forEach(clearTimeout)
  }, [isStill])

  // 장면은 이 화면이 떠 있는 동안만 돈다 (닫으면 게임째 없앤다. 창이 가려지면 Phaser가 알아서 멈춘다)
  useEffect(() => {
    const host = hostRef.current!
    const scene = new DemoStageScene(setLayout, () => {
      if (isReducedMotion()) return leave()
      setCurtain('closed')
      setTimeout(leave, 700)
    })
    sceneRef.current = scene
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, transparent: true, pixelArt: true, scale: { mode: Phaser.Scale.RESIZE }, scene: [scene], banner: false })
    return () => {
      sceneRef.current = null
      game.destroy(true)
    }
    // leave는 매번 새로 만들지만 하는 일이 같다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const demo = meeting?.demo
  const isDone = !meeting || !isMeetingLive(meeting)
  // 객석 = 참석자 + (참석자가 아닌) 총평하는 리드
  const cast = useMemo(() => {
    const ids = [...(meeting?.participantIds ?? [])]
    if (demo?.presenterId && !ids.includes(demo.presenterId)) ids.push(demo.presenterId)
    return ids.flatMap((id) => {
      const s = staff.find((x) => x.id === id)
      return s ? [{ id, avatar: s.avatar, name: s.name }] : []
    })
  }, [meeting?.participantIds, demo?.presenterId, staff])

  useEffect(() => {
    if (!demo) return
    sceneRef.current?.sync({ cast, presenterId: demo.presenterId, phase: demo.phase, mvpId: demo.mvpId, isDone })
  }, [cast, demo, isDone])

  if (!meeting || !demo) return null
  const presenter = cast.find((c) => c.id === demo.presenterId) ?? null
  const isSpeaking = !isDone && !!presenter && (demo.phase === 'present' || demo.phase === 'remark')
  const speech = isSpeaking ? ([...meeting.messages].reverse().find((m) => m.staffId === demo.presenterId) ?? meeting.messages.at(-1))?.text ?? '' : ''
  const status = isDone ? t('stage.done') : !presenter ? t('stage.waiting') : demo.phase === 'remark' ? t('stage.remark', { name: presenter.name }) : t('stage.progress', { index: demo.index, total: demo.total, name: presenter.name })

  const handleReacted = (kind: DemoReaction, text?: string) => {
    sceneRef.current?.react(kind)
    if (kind !== 'comment' || !text) return
    const key = Date.now()
    setNote({ text, key })
    setTimeout(() => setNote((n) => (n?.key === key ? null : n)), NOTE_MS)
  }

  return (
    <div className={cn('fixed inset-0 z-40 overflow-hidden transition-opacity duration-500', !isShown && 'opacity-0')} style={{ backgroundColor: STAGE_COLORS.dim }}>
      {layout && <Slide layout={layout} meeting={meeting} name={presenter?.name ?? ''} />}
      <div ref={hostRef} className="absolute inset-0" />
      {layout && isSpeaking && speech && <SpeechBubble key={`${demo.presenterId}-${demo.startedAt}`} at={layout.head} text={speech} startedAt={demo.startedAt} />}
      {layout && note && <NoteBubble key={note.key} at={layout.head} text={note.text} />}

      <div className="absolute inset-x-0 top-0 flex items-center gap-3 p-3">
        <Button size="sm" variant="secondary" onClick={leave}>
          <ArrowLeftIcon /> {t('stage.back')}
        </Button>
        <span className="truncate rounded-full bg-black/40 px-3 py-1 text-sm text-white">{status}</span>
      </div>
      {!isDone && presenter && demo.phase !== 'remark' && <ReactionBar meeting={meeting} presenterId={presenter.id} onReacted={handleReacted} />}

      {!isStill && <Curtains curtain={curtain} isTitleShown={isTitleShown} />}
    </div>
  )
}

/** 스크린: 작업물 사진을 차례로 (없으면 업무 제목 카드). 캔버스 뒤에서 배경의 뚫린 스크린 자리에 기울여 맞춘다 */
function Slide({ layout, meeting, name }: { layout: StageLayout; meeting: Meeting; name: string }) {
  const now = useNow(SLIDE_MS / 3)
  const demo = meeting.demo!
  const W = 320
  const H = 180
  const [p0, p1, , p3] = layout.quad
  const style: CSSProperties = {
    width: W,
    height: H,
    transformOrigin: '0 0',
    transform: `matrix(${(p1.x - p0.x) / W}, ${(p1.y - p0.y) / W}, ${(p3.x - p0.x) / H}, ${(p3.y - p0.y) / H}, ${p0.x}, ${p0.y})`,
  }
  const images = demo.slides.filter(isImageAttachment)
  const image = images.length ? images[Math.floor(Math.max(0, now - demo.startedAt) / SLIDE_MS) % images.length] : null
  const isBlank = !demo.presenterId || demo.phase === 'remark'
  return (
    <div className="absolute top-0 left-0 overflow-hidden" style={{ ...style, backgroundColor: STAGE_COLORS.screenOff }}>
      {isBlank ? null : image ? (
        <img key={image.id} src={attachmentUrl(image)} alt={image.name} className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col" style={{ backgroundColor: CARD_BG }}>
          <div className="h-1/5 shrink-0" style={{ backgroundColor: ART_KIT.K.orange }} />
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="line-clamp-3 text-lg font-bold text-[#2a2230]">{demo.cardTitle}</span>
            <span className="text-sm text-[#4a4f80]">{name}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** 발표 말풍선: PC가 단계 시작 시각을 주므로 늦게 열어도 그만큼 타이핑된 채로 보인다 */
function SpeechBubble({ at, text, startedAt }: { at: { x: number; y: number }; text: string; startedAt: number }) {
  const now = useNow(TYPING_MS_PER_CHAR)
  const shown = text.slice(0, Math.max(0, Math.floor((now - startedAt) / TYPING_MS_PER_CHAR)))
  return (
    <div className="pointer-events-none absolute w-max max-w-xs -translate-x-1/2 -translate-y-full rounded-xl border-2 border-[#2a2230] bg-white px-3 py-2 text-sm leading-snug whitespace-pre-wrap text-[#2a2230] shadow-lg" style={{ left: at.x, top: at.y }}>
      {shown}
      <span className="invisible">{text.slice(shown.length)}</span>
    </div>
  )
}

/** 대표 한마디: 발표자 머리 위(발표 말풍선 위)에 잠깐 */
function NoteBubble({ at, text }: { at: { x: number; y: number }; text: string }) {
  return (
    <div className="pointer-events-none absolute w-max max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-xl border-2 bg-white px-3 py-1.5 text-xs text-[#2a2230] shadow-lg" style={{ left: at.x + 120, top: at.y - 24, borderColor: ART_KIT.K.orange }}>
      💬 {text}
    </div>
  )
}

/** 대표 반응: 👏 박수 · 🏆 오늘의 MVP(데모데이당 1명) · 💬 한마디 (지식 창고 피드백) — AI를 부르지 않는다 */
function ReactionBar({ meeting, presenterId, onReacted }: { meeting: Meeting; presenterId: string; onReacted: (kind: DemoReaction, text?: string) => void }) {
  const [isBusy, setIsBusy] = useState(false)
  const [isWriting, setIsWriting] = useState(false)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const mvpId = meeting.demo?.mvpId ?? null

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(''), ERROR_MS)
    return () => clearTimeout(timer)
  }, [error])

  const send = async (kind: DemoReaction, text?: string) => {
    setIsBusy(true)
    try {
      await window.office.demoReact(meeting.id, presenterId, kind, text)
      onReacted(kind, text)
      if (kind === 'comment') {
        setComment('')
        setIsWriting(false)
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
      {error && <span className="rounded-md bg-black/60 px-3 py-1 text-xs text-white">{error}</span>}
      <div className="flex items-center gap-2 rounded-full bg-black/50 p-1.5 shadow-lg">
        <Button size="sm" variant="secondary" className="rounded-full" disabled={isBusy} onClick={() => void send('clap')}>
          👏 {t('stage.react.clap')}
        </Button>
        <Button size="sm" variant="secondary" className="rounded-full" disabled={isBusy || !!mvpId} onClick={() => void send('mvp')} title={mvpId ? t('stage.react.mvpDone') : undefined}>
          🏆 {t('stage.react.mvp')}
        </Button>
        {isWriting ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (comment.trim()) void send('comment', comment.trim())
            }}
          >
            <Input autoFocus value={comment} maxLength={DEMO_COMMENT_MAX} onChange={(e) => setComment(e.target.value)} placeholder={t('stage.react.placeholder')} className="h-8 w-64 rounded-full bg-white text-xs text-black" />
            <Button size="sm" type="submit" className="rounded-full" disabled={isBusy || !comment.trim()}>
              {t('stage.react.send')}
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="secondary" className="rounded-full" disabled={isBusy} onClick={() => setIsWriting(true)}>
            💬 {t('stage.react.comment')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** 전환 막 두 폭 (이디자 막 그림을 가로로 이어 붙인다) + 닫혀 있는 동안 가운데 글자 */
function Curtains({ curtain, isTitleShown }: { curtain: Curtain; isTitleShown: boolean }) {
  const url = useMemo(() => toCanvas(artStageCurtainPanel(40, 300)).toDataURL(), [])
  const panel = 'absolute inset-y-0 w-1/2 transition-transform duration-500 ease-in-out [image-rendering:pixelated]'
  const bg: CSSProperties = { backgroundImage: `url(${url})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }
  const isClosed = curtain === 'closed'
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={cn(panel, 'left-0', !isClosed && '-translate-x-full')} style={bg} />
      <div className={cn(panel, 'right-0', !isClosed && 'translate-x-full')} style={bg} />
      <div className={cn('absolute inset-0 flex items-center justify-center text-4xl font-bold text-white drop-shadow-lg transition-opacity duration-300', !isTitleShown && 'opacity-0')}>{t('stage.title')}</div>
    </div>
  )
}

/** 사무실 위 배너: 데모데이 진행 중 · 발표장 가기 (발표장이 닫혀 있을 때만) */
export function DemoDayBanner() {
  const live = useOffice((s) => liveDemoOf(s.meetings))
  const stageId = useOffice((s) => s.demoStageId)
  const setStageId = useOffice((s) => s.setDemoStageId)
  if (!live || stageId) return null
  return (
    <button type="button" onClick={() => setStageId(live.id)} className="bg-primary text-primary-foreground absolute top-3 left-1/2 -translate-x-1/2 animate-pulse rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg motion-reduce:animate-none">
      🎤 {t('stage.banner')}
    </button>
  )
}

/** 사무실 빠른 버튼: 데모데이 지금 열기 (발표할 결과물이 없으면 PC가 단체방에 안내만 남긴다) */
export function DemoDayNowButton() {
  const live = useOffice((s) => liveDemoOf(s.meetings))
  const [hint, setHint] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  useEffect(() => {
    if (!hint) return
    const timer = setTimeout(() => setHint(''), ERROR_MS)
    return () => clearTimeout(timer)
  }, [hint])
  if (live) return null
  const handleOpen = async () => {
    setIsBusy(true)
    await window.office.runDemoDayNow()
    setIsBusy(false)
    // 열렸으면 발표장이 저절로 뜬다. 조금 기다려도 안 열렸으면 발표할 게 없던 것
    setTimeout(() => !liveDemoOf(useOffice.getState().meetings) && setHint(t('stage.empty')), 1_500)
  }
  return (
    <>
      <button type="button" disabled={isBusy} onClick={() => void handleOpen()} className="rounded-lg border border-white/10 bg-[#1a1d28]/90 px-3 py-1.5 text-xs text-white shadow-lg disabled:opacity-60">
        🎤 {t('stage.openNow')}
      </button>
      {hint && <div className="w-48 rounded-lg bg-[#1a1d28]/90 px-3 py-2 text-[11px] leading-4 text-white/80 shadow-lg">{hint}</div>}
    </>
  )
}
