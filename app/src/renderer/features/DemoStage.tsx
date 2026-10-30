// 데모데이 발표장 화면 (PC·휴대폰): 데모데이가 시작되면 막이 닫혔다 열리며 이 화면으로 옮겨 오고, 직원이 차례로 연단에 나와 발표한다.
// 무대·사람·이펙트는 Phaser 장면(map/iso/demoStageScene), 스크린 슬라이드·하단 대화창·반응 버튼·전환 막은 여기 DOM이 그린다.
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
import { officeStage } from '@/map/officeStage'
import { ART_KIT, artStageCurtainPanel, STAGE_COLORS, toCanvas } from '@/map/iso/isoArt'
import { avatarUrl } from '@/map/sprites'
import { attachmentUrl, isImageAttachment, isMeetingLive, type Attachment, type Meeting } from '@shared/types'
import { DEMO_COMMENT_MAX, plainSpeech, speechPageAt, wrapSpeech, type DemoReaction, type DemoStage as DemoProgress } from '@shared/gallery'
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
/** 무대는 이 비율로 레터박스한다 (창 비율이 달라도 그림·글자가 늘어나지 않게) */
const STAGE_ASPECT = 16 / 9
/** 30fps면 걷기·꽃가루가 충분히 부드럽고, 그리는 일이 절반이 된다 */
const STAGE_FPS = 30
const CARD_BG = '#eef6fb'
/** 대화창 한 쪽에 들어가는 줄 수 */
const DIALOG_LINES = 3
/** 대화창 색: 남색 반투명 판 + 두 겹 각진 테두리 (무대 벽·스크린 테두리와 같은 계열) */
const DIALOG_BG = 'rgba(28, 34, 56, 0.86)'
const DIALOG_EDGE = '#b8bdcb'

/** 대화창·키보드에서 Enter/Space를 가로채면 안 되는 곳 (한마디 입력·버튼) */
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest('input, textarea, select, button, [contenteditable="true"]')

/** 지금 스크린에 떠 있는 사진 (SLIDE_MS마다 다음 장) */
function slideAt(demo: DemoProgress, now: number) {
  const images = demo.slides.filter(isImageAttachment)
  return { images, index: Math.floor(Math.max(0, now - demo.startedAt) / SLIDE_MS) % Math.max(1, images.length) }
}

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
  const [zoomed, setZoomed] = useState<Attachment | null>(null)
  const isStill = useMemo(() => isReducedMotion(), [])
  // 화면을 닫으면 남은 타이머도 함께 치운다 (늦게 온 onClose가 새로 연 발표장을 닫지 않게)
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      fn()
    }, ms)
    timersRef.current.add(timer)
  }
  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach(clearTimeout)
  }, [])

  const leave = () => {
    setIsShown(false)
    later(onClose, LEAVE_MS)
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

  // 장면은 이 화면이 떠 있는 동안만 돈다 (닫으면 게임째 없앤다). 그동안 밑에 깔린 사무실 지도는 재우고, 창이 숨으면 장면도 잔다
  useEffect(() => {
    const host = hostRef.current!
    const scene = new DemoStageScene(setLayout, () => {
      if (isReducedMotion()) return leave()
      setCurtain('closed')
      later(leave, 700)
    })
    sceneRef.current = scene
    // 캔버스는 기기 px(CSS px × 배율)로 만들고 CSS로 줄여 보인다 — RESIZE 모드는 CSS px로 그려 레티나에서 뭉개진다 (사무실 지도와 같은 방식)
    const sizeOf = () => {
      const dpr = window.devicePixelRatio || 1
      return { w: Math.max(1, Math.round(host.clientWidth * dpr)), h: Math.max(1, Math.round(host.clientHeight * dpr)) }
    }
    const first = sizeOf()
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, transparent: true, pixelArt: true, fps: { limit: STAGE_FPS }, scale: { mode: Phaser.Scale.NONE, width: first.w, height: first.h }, scene: [scene], banner: false })
    const fit = () => {
      const { w, h } = sizeOf()
      game.canvas.style.width = `${host.clientWidth}px`
      game.canvas.style.height = `${host.clientHeight}px`
      game.canvas.style.display = 'block'
      game.scale.resize(w, h)
    }
    game.events.once(Phaser.Core.Events.READY, fit)
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    // 다른 배율의 모니터로 옮기면 크기는 그대로라 ResizeObserver가 울리지 않는다
    window.addEventListener('resize', fit)
    const offShown = window.officeWindow?.onShown((isShown) => (isShown ? game.loop.wake() : game.loop.sleep()))
    officeStage.setCovered(true)
    return () => {
      sceneRef.current = null
      observer.disconnect()
      window.removeEventListener('resize', fit)
      offShown?.()
      officeStage.setCovered(false)
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
  const isBlankScreen = !demo.presenterId || demo.phase === 'remark'
  const speech = isSpeaking ? ([...meeting.messages].reverse().find((m) => m.staffId === demo.presenterId) ?? meeting.messages.at(-1))?.text ?? '' : ''
  // 진행 상태가 없거나 끝났으면 진행 표시를 숨긴다 (앱을 다시 켰을 때 옛 '3/7'이 남지 않게)
  const status = isDone || !presenter ? '' : demo.phase === 'remark' ? t('stage.remark', { name: presenter.name }) : t('stage.progress', { index: demo.index, total: demo.total, name: presenter.name })

  const handleReacted = (kind: DemoReaction, text?: string) => {
    sceneRef.current?.react(kind)
    if (kind !== 'comment' || !text) return
    const key = Date.now()
    setNote({ text, key })
    later(() => setNote((n) => (n?.key === key ? null : n)), NOTE_MS)
  }

  return (
    // 위 h-11은 앱 상단 바(창 드래그·신호등·윈도우 창 버튼) 자리라 비워 둔다 — 그 아래만 덮는다
    <div className={cn('fixed inset-x-0 top-11 bottom-0 z-40 overflow-hidden transition-opacity duration-500', !isShown && 'opacity-0')} style={{ backgroundColor: STAGE_COLORS.dim }}>
      {/* 무대 상자: 16:9로 가운데 맞춤. 캔버스·슬라이드·대화창이 같은 상자 좌표를 쓴다 */}
      <div className="absolute inset-0 flex items-center justify-center [container-type:size]">
        <div className="relative [container-type:size]" style={{ width: `min(100cqw, 100cqh * ${STAGE_ASPECT})`, aspectRatio: STAGE_ASPECT }}>
          {layout && <Slide layout={layout} meeting={meeting} name={presenter?.name ?? ''} />}
          <div ref={hostRef} className="absolute inset-0" />
          {layout && !isBlankScreen && slideAt(demo, Date.now()).images.length > 0 && <ScreenZoomButton layout={layout} onOpen={() => {
            const { images, index } = slideAt(demo, Date.now())
            setZoomed(images[index] ?? null)
          }} />}
          {isSpeaking && speech && <StageDialog key={`${demo.presenterId}-${demo.startedAt}`} avatar={presenter.avatar} name={presenter.name} text={speech} startedAt={demo.startedAt} durationMs={demo.durationMs} isPaused={!!zoomed} />}
          {layout && note && <NoteBubble key={note.key} at={layout.head} text={note.text} />}
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center gap-3 p-3">
        <Button size="sm" variant="secondary" onClick={leave}>
          <ArrowLeftIcon /> {t('stage.back')}
        </Button>
        {status && <span className="truncate rounded-full bg-black/40 px-3 py-1 text-sm text-white">{status}</span>}
      </div>
      {!isDone && presenter && demo.phase !== 'remark' && <ReactionBar meeting={meeting} presenterId={presenter.id} onReacted={handleReacted} />}

      {zoomed && <ZoomedSlide image={zoomed} onClose={() => setZoomed(null)} />}
      {!isStill && <Curtains curtain={curtain} isTitleShown={isTitleShown} />}
    </div>
  )
}

/** 스크린: 작업물 사진을 차례로 (없으면 업무 제목 카드). 캔버스 뒤에서 배경의 뚫린 스크린 자리에 기울여 맞춘다 */
function Slide({ layout, meeting, name }: { layout: StageLayout; meeting: Meeting; name: string }) {
  const now = useNow(SLIDE_MS / 3)
  const demo = meeting.demo!
  // 카드 비율을 스크린 비율에 맞춰야 글자가 한쪽으로 늘어나지 않는다
  const [p0, p1, , p3] = layout.quad
  const H = 180
  const W = Math.round((H * Math.hypot(p1.x - p0.x, p1.y - p0.y)) / (Math.hypot(p3.x - p0.x, p3.y - p0.y) || 1))
  const style: CSSProperties = {
    width: W,
    height: H,
    transformOrigin: '0 0',
    transform: `matrix(${(p1.x - p0.x) / W}, ${(p1.y - p0.y) / W}, ${(p3.x - p0.x) / H}, ${(p3.y - p0.y) / H}, ${p0.x}, ${p0.y})`,
  }
  const { images, index: shownIndex } = slideAt(demo, now)
  const isBlank = !demo.presenterId || demo.phase === 'remark'
  return (
    <div className="absolute top-0 left-0 overflow-hidden" style={{ ...style, backgroundColor: STAGE_COLORS.screenOff }}>
      {/* 사진은 모두 한 번만 올려 두고 보이는 것만 바꾼다 (넘길 때마다 다시 불러오지 않게) */}
      {/* 캡처 비율은 제각각이라 잘라 내거나 늘리지 않고(contain) 남는 곳은 검은 여백, 둘레는 각진 두 줄 테두리로 픽셀 화면처럼 */}
      {isBlank ? null : images.length ? (
        <div className="absolute inset-0 p-2" style={{ backgroundColor: ART_KIT.K.dark }}>
          <div className="relative size-full bg-black" style={{ boxShadow: `0 0 0 2px ${ART_KIT.K.metalL}, 0 0 0 4px #2a2230` }}>
            {images.map((image, i) => (
              <img key={image.id} src={attachmentUrl(image)} alt={image.name} decoding="async" className={cn('absolute inset-0 size-full object-contain', i !== shownIndex && 'invisible')} />
            ))}
          </div>
        </div>
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

/** 스크린 위 투명 버튼: 누르면 지금 사진을 크게 (캔버스가 위에 덮여 있어 슬라이드 자체는 클릭을 못 받는다) */
function ScreenZoomButton({ layout, onOpen }: { layout: StageLayout; onOpen: () => void }) {
  const xs = layout.quad.map((p) => p.x)
  const ys = layout.quad.map((p) => p.y)
  const [left, top] = [Math.min(...xs), Math.min(...ys)]
  // 스크린이 벽을 따라 기울어 있어 네모 버튼을 스크린 모양으로 잘라 낸다
  const clipPath = `polygon(${layout.quad.map((p) => `${p.x - left}px ${p.y - top}px`).join(', ')})`
  const style: CSSProperties = { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top, clipPath }
  return <button type="button" aria-label={t('stage.zoom')} title={t('stage.zoom')} onClick={onOpen} className="absolute cursor-zoom-in" style={style} />
}

/** 크게 보기: 발표장 전체를 덮는다. 다시 누르거나 Esc로 닫는다 */
function ZoomedSlide({ image, onClose }: { image: Attachment; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])
  return (
    <button type="button" aria-label={t('stage.zoomClose')} title={t('stage.zoomClose')} onClick={onClose} className="absolute inset-0 z-10 flex cursor-zoom-out items-center justify-center bg-black/85 p-6">
      <img src={attachmentUrl(image)} alt={image.name} className="max-h-full max-w-full object-contain" style={{ boxShadow: `0 0 0 3px ${ART_KIT.K.metalL}, 0 0 0 6px #2a2230` }} />
    </button>
  )
}

/**
 * 하단 대화창 (RPG식): 왼쪽 발표자 그림, [이름], 마크다운을 걷은 본문을 2~3줄씩 쪽으로 나눠 타이핑한다.
 * PC가 준 단계 시작 시각·길이로 쪽을 저절로 넘겨 발표 진행과 맞추고(늦게 열어도 지난 쪽은 넘어가 있다),
 * 클릭·Enter·Space면 치는 중엔 그 쪽을 다 보이고, 다 쳤으면 다음 쪽으로 넘긴다
 */
function StageDialog({ avatar, name, text, startedAt, durationMs, isPaused }: { avatar: number; name: string; text: string; startedAt: number; durationMs: number; isPaused: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<string[]>([])
  const [skip, setSkip] = useState<{ page: number; at: number } | null>(null)
  const [revealedPage, setRevealedPage] = useState(-1)
  const [now, setNow] = useState(() => Date.now())
  const plain = useMemo(() => plainSpeech(text), [text])

  // 본문 칸의 폭·글꼴로 줄을 나눠 쪽을 만든다 (창 크기가 바뀌면 다시)
  useEffect(() => {
    const body = bodyRef.current!
    const ctx = document.createElement('canvas').getContext('2d')!
    const paginate = () => {
      ctx.font = getComputedStyle(body).font
      const lines = wrapSpeech(plain, body.clientWidth, (s) => ctx.measureText(s).width)
      const next: string[] = []
      for (let i = 0; i < lines.length; i += DIALOG_LINES) next.push(lines.slice(i, i + DIALOG_LINES).join('\n'))
      setPages(next.length ? next : [''])
    }
    paginate()
    const observer = new ResizeObserver(paginate)
    observer.observe(body)
    return () => observer.disconnect()
  }, [plain])

  const at = speechPageAt(
    pages.map((p) => p.length),
    { startedAt, durationMs, now, msPerChar: TYPING_MS_PER_CHAR, skip },
  )
  const isTyped = at.shown >= (pages[at.page]?.length ?? 0) || revealedPage === at.page
  const shown = isTyped ? (pages[at.page] ?? '') : (pages[at.page] ?? '').slice(0, at.shown)

  // 발표 단계가 끝날 때까지만 시계를 돌린다 (쪽이 저절로 넘어가야 해서 다 쳐도 멈추지 않는다)
  useEffect(() => {
    const endAt = startedAt + durationMs
    if (Date.now() >= endAt) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= endAt) clearInterval(timer)
    }, TYPING_MS_PER_CHAR)
    return () => clearInterval(timer)
  }, [startedAt, durationMs])

  const handleNext = () => {
    if (!isTyped) return setRevealedPage(at.page)
    if (!at.isLast) setSkip({ page: at.page + 1, at: Date.now() })
  }
  const nextRef = useRef(handleNext)
  nextRef.current = handleNext
  useEffect(() => {
    if (isPaused) return
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat || isTyping(e.target)) return
      e.preventDefault()
      nextRef.current()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isPaused])

  return (
    <button
      type="button"
      aria-label={t('stage.next')}
      onClick={handleNext}
      // 세로 폰: 무대 상자가 낮아 글이 넘치므로 상자 안이 아니라 바로 아래에 쌓는다
      className="portrait:top-full portrait:bottom-auto portrait:inset-x-0 portrait:mt-3 portrait:max-h-none portrait:gap-3 portrait:p-3 absolute inset-x-[3%] bottom-[2.5%] flex max-h-[25cqh] items-stretch gap-[2cqh] p-[1.6cqh] text-left text-white [image-rendering:pixelated]"
      style={{ backgroundColor: DIALOG_BG, boxShadow: `inset 0 0 0 2px ${DIALOG_EDGE}, inset 0 0 0 4px #2a2230, 0 0 0 2px #2a2230` }}
    >
      <div className="portrait:h-14 flex aspect-square h-[15cqh] shrink-0 items-end justify-center self-center" style={{ backgroundColor: 'rgba(0,0,0,0.25)', boxShadow: `inset 0 0 0 2px ${ART_KIT.K.metal}` }}>
        <img src={avatarUrl(avatar)} alt="" className="h-[90%] object-contain [image-rendering:pixelated]" />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col gap-[0.6cqh]">
        <span className="text-[clamp(12px,2.4cqh,19px)] font-bold" style={{ color: STAGE_COLORS.goldL }}>
          [{name}]
        </span>
        {/* 3줄 높이를 늘 잡아 두어 쪽이 바뀌어도 창이 출렁이지 않는다 */}
        <div ref={bodyRef} className="text-[clamp(13px,2.6cqh,21px)] leading-[1.45] whitespace-pre-wrap" style={{ minHeight: `${DIALOG_LINES * 1.45}em` }}>
          {shown}
        </div>
        {isTyped && !at.isLast && <span className="absolute right-0 bottom-0 animate-bounce text-[clamp(10px,2cqh,16px)] motion-reduce:animate-none" style={{ color: STAGE_COLORS.goldL }}>▼</span>}
      </div>
    </button>
  )
}

/** 대표 한마디: 발표자 머리 위에 잠깐 (마크다운 기호는 걷는다) */
function NoteBubble({ at, text }: { at: { x: number; y: number }; text: string }) {
  return (
    <div className="pointer-events-none absolute w-max max-w-[16rem] -translate-x-1/2 -translate-y-full border-2 bg-white px-3 py-1.5 text-xs text-[#2a2230] shadow-lg" style={{ left: at.x + 120, top: at.y - 24, borderColor: ART_KIT.K.orange }}>
      <span className="line-clamp-3 whitespace-pre-line">💬 {plainSpeech(text)}</span>
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
    // 오른쪽 위: 하단 대화창·한마디 말풍선과 겹치지 않게. 세로 폰은 위쪽 돌아가기 줄과 겹치므로 화면 아래(키보드 위)로
    <div className="portrait:top-auto portrait:bottom-[var(--ime,0px)] portrait:left-0 portrait:items-center absolute top-0 right-0 flex flex-col items-end gap-2 p-3">
      <div className="portrait:max-w-full portrait:flex-wrap portrait:justify-center portrait:rounded-3xl flex items-center gap-2 rounded-full bg-black/50 p-1.5 shadow-lg">
        <Button size="sm" variant="secondary" className="rounded-full" disabled={isBusy} onClick={() => void send('clap')}>
          👏 {t('stage.react.clap')}
        </Button>
        <Button size="sm" variant="secondary" className="rounded-full" disabled={isBusy || !!mvpId} onClick={() => void send('mvp')} title={mvpId ? t('stage.react.mvpDone') : undefined}>
          🏆 {t('stage.react.mvp')}
        </Button>
        {isWriting ? (
          <form
            className="portrait:basis-full flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (comment.trim()) void send('comment', comment.trim())
            }}
          >
            <Input autoFocus value={comment} maxLength={DEMO_COMMENT_MAX} onChange={(e) => setComment(e.target.value)} placeholder={t('stage.react.placeholder')} className="portrait:w-auto portrait:min-w-0 portrait:flex-1 h-8 w-64 rounded-full bg-white text-xs text-black" />
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
      {error && <span className="rounded-md bg-black/60 px-3 py-1 text-xs text-white">{error}</span>}
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
