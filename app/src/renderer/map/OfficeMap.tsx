import { useSeatStatus } from './iso/seatStatus'
import { headcountOf, useFloorVisits } from './iso/floorVisits'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { DoorOpenIcon, MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOD_KEY } from '@/lib/platform'
import { IS_MOBILE_SHELL, IS_TOUCH } from '@/shell'
import { useOffice, useViewLevel, viewLevelOf } from '@/store'
import { buildFloors, MAX_LEVEL, officeOf, staffFloor } from '@shared/officeLevel'
import { COMPANY_LEVELS, isMeetingLive } from '@shared/types'
import { dioramaPreviewUrl, DioramaStreet, drawDioramaDoorGlow, paintDiorama } from './exteriorDiorama'
import { clampCamera, dioramaFit, dioramaLayout, dioramaWorld, isOnOffice, zoomCameraAt, type DioramaCamera } from './exteriorLayout'
import { isNightTime } from '@shared/dayNight'
import { officeStage } from './officeStage'
import { DecorDrawer } from './DecorDrawer'
import { canExportScene, RecordingFrame, SceneExportButton, SceneExportNotice } from '@/features/sceneExport/SceneExport'
import { useSceneExport } from '@/features/sceneExport/useSceneExport'
import { DemoDayBanner, DemoDayNowButton } from '@/features/DemoStage'
import { isReducedMotion } from '@/lib/reducedMotion'
import { t } from '@shared/i18n'
import { levelTitle } from '@shared/i18n/names'

const NIGHT_CHECK_MS = 60_000
/** 문 불빛이 켜지고 꺼지는 속도 (초당) */
const GLOW_SPEED = 5

/** 낮밤 자동이면 1분마다 다시 본다 (외관을 켜 둔 채 저녁이 돼도 바뀌게) */
function useIsNight() {
  const dayNight = useOffice((s) => s.settings.dayNight)
  const [isNight, setIsNight] = useState(() => isNightTime({ dayNight }))
  useEffect(() => {
    setIsNight(isNightTime({ dayNight }))
    const timer = setInterval(() => setIsNight(isNightTime({ dayNight })), NIGHT_CHECK_MS)
    return () => clearInterval(timer)
  }, [dayNight])
  return isNight
}

const ZOOM_STEP = 1.25
/** 이만큼(CSS px) 움직여야 끌기로 본다 (그 전에 떼면 누르기) */
const DRAG_PX = 8

/** 오른쪽 아래 확대·축소·전체 보기 버튼과 왼쪽 아래 조작 안내 (건물 안·밖 같이 쓴다) */
function ZoomControls({ onZoom, onFit }: { onZoom: (factor: number) => void; onFit: () => void }) {
  return (
    <>
      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-lg border border-hud-border bg-hud shadow-lg">
        <button type="button" onClick={() => onZoom(ZOOM_STEP)} className="p-2 text-hud-foreground hover:bg-hud-foreground/10" aria-label={t('map.zoomIn')}>
          <PlusIcon className="size-4" />
        </button>
        <button type="button" onClick={() => onZoom(1 / ZOOM_STEP)} className="p-2 text-hud-foreground hover:bg-hud-foreground/10" aria-label={t('map.zoomOut')}>
          <MinusIcon className="size-4" />
        </button>
        <button type="button" onClick={onFit} className="p-2 text-hud-foreground hover:bg-hud-foreground/10" aria-label={t('map.fitView')} title={t('map.fitView')}>
          <MaximizeIcon className="size-4" />
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-hud px-2 py-1 text-[11px] text-hud-foreground/70">{IS_TOUCH ? t('map.hintTouch') : t('map.hintDesktop', { mod: MOD_KEY })}</div>
    </>
  )
}

/** 사무실 외관 거리: 건물을 누르면 1층으로 들어간다. 사람·차가 지나가고, 문에 마우스를 올리면 불이 켜진다.
 * 거리 크기는 화면과 상관없이 정해져 있고, 건물 안처럼 스크롤·핀치로 확대·축소, 끌어서 둘러본다 */
function OfficeExterior() {
  const level = useViewLevel()
  const isNight = useIsNight()
  const setInside = useOffice((s) => s.setInside)
  const setViewFloor = useOffice((s) => s.setViewFloor)
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [host, setHost] = useState<{ w: number; h: number } | null>(null)
  const [isHover, setIsHover] = useState(false)
  const nextLevel = level < MAX_LEVEL ? level + 1 : null
  const nextUrl = useMemo(() => (!nextLevel ? '' : dioramaPreviewUrl(nextLevel, isNight)), [nextLevel, isNight])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const { floors } = officeOf(level)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setHost((v) => (v && v.w === el.clientWidth && v.h === el.clientHeight ? v : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 그리기와 누르기 판정이 같은 배치를 쓴다 (낮밤까지 같은 값 — 판정만 옛 배치로 남지 않게). 화면 크기와는 상관없다
  const layout = useMemo(() => {
    const { W, H } = dioramaWorld(level)
    return dioramaLayout(level, isNight, W, H)
  }, [level, isNight])
  const fit = host ? dioramaFit(level, host.w, host.h).scale : 1
  // 처음 자리: 땅 판 가운데(위 핀 자리 몫으로 살짝 위), 땅 판이 다 보이는 배율
  const home = useMemo(() => ({ x: layout.ox + layout.board.cv.w / 2, y: layout.oy + layout.board.cv.h * 0.45 }), [layout])
  // 배율은 '처음 배율의 몇 배'로 둔다 — 창 크기가 바뀌어도 보이는 범위가 같은 비율로 유지된다
  const [cam, setCam] = useState<{ x: number; y: number; rel: number } | null>(null)
  useEffect(() => setCam(null), [level])
  const view = host ? clampCamera({ ...(cam ?? home), zoom: fit * (cam?.rel ?? 1) }, fit, layout.W, layout.H, host.w, host.h) : null
  const viewRef = useRef(view)
  viewRef.current = view
  const commit = (v: DioramaCamera) => {
    if (host) setCam({ ...clampCamera(v, fit, layout.W, layout.H, host.w, host.h), rel: v.zoom / fit })
  }
  const commitRef = useRef(commit)
  commitRef.current = commit
  const zoomAt = (factor: number, sx: number, sy: number) => {
    const v = viewRef.current
    if (v && host) commitRef.current(zoomCameraAt(v, v.zoom * factor, sx, sy, host.w, host.h))
  }
  const zoomAtRef = useRef(zoomAt)
  zoomAtRef.current = zoomAt

  // 휠·트랙패드 핀치로 확대·축소 (건물 안과 같은 비율). 페이지가 같이 스크롤되지 않게 passive를 끈다
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAtRef.current(e.deltaY > 0 ? 0.9 : 1.1, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 끌어서 이동 · 두 손가락 핀치. 끌다가 뗀 것은 누르기(들어가기)로 치지 않는다
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; y: number; cam: DioramaCamera; moved: boolean } | null>(null)
  const pinch = useRef<{ dist: number; midX: number; midY: number } | null>(null)
  const wasDrag = useRef(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const pinchOf = () => {
    const [a, b] = [...pointers.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 }
  }
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // 거리 그림 위에서만 (버튼·안내 칸은 그대로 눌리게)
    if (e.button !== 0 || !view || !stageRef.current?.contains(e.target as Node)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    wasDrag.current = false
    if (pointers.current.size === 2) {
      pinch.current = pinchOf()
      drag.current = null
      wasDrag.current = true
    } else drag.current = { x: e.clientX, y: e.clientY, cam: view, moved: false }
  }
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const v = viewRef.current
    if (!v || !host) return
    if (pinch.current && pointers.current.size === 2) {
      const now = pinchOf()
      const r = e.currentTarget.getBoundingClientRect()
      const zoomed = zoomCameraAt(v, (v.zoom * now.dist) / Math.max(1, pinch.current.dist), now.midX - r.left, now.midY - r.top, host.w, host.h)
      commit({ ...zoomed, x: zoomed.x - (now.midX - pinch.current.midX) / zoomed.zoom, y: zoomed.y - (now.midY - pinch.current.midY) / zoomed.zoom })
      pinch.current = now
      return
    }
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) {
      d.moved = true
      wasDrag.current = true
      // 끌기가 시작된 뒤에만 붙잡는다 (처음부터 잡으면 클릭이 거리 그림에 가지 않는다)
      e.currentTarget.setPointerCapture(e.pointerId)
      setIsHover(false)
    }
    if (d.moved) commit({ ...d.cam, x: d.cam.x - (e.clientX - d.x) / d.cam.zoom, y: d.cam.y - (e.clientY - d.y) / d.cam.zoom })
  }
  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    // 핀치에서 한 손가락만 남으면 그 손가락으로 이어서 끈다
    const rest = [...pointers.current.values()][0]
    drag.current = rest && viewRef.current ? { ...rest, cam: viewRef.current, moved: true } : null
  }

  // 배경은 크기·레벨·낮밤이 바뀔 때만 다시 그리고, 사람·차·구름·문 불빛은 매 프레임
  const hoverRef = useRef(false)
  hoverRef.current = isHover
  useEffect(() => {
    const canvas = canvasRef.current
    if (!layout || !canvas) return
    const { W, H } = layout
    canvas.width = W
    canvas.height = H
    const [skyCanvas, scene, front] = [0, 0, 0].map(() => Object.assign(document.createElement('canvas'), { width: W, height: H }))
    const isStill = isReducedMotion()
    paintDiorama(skyCanvas, scene, front, layout, isNight)
    const street = new DioramaStreet(W, H, layout, isNight, isStill)
    const step = (dt: number) => street.step(dt)
    const drawClouds = (c: CanvasRenderingContext2D) => street.drawClouds(c)
    const drawFront = (c: CanvasRenderingContext2D, g: number) => {
      street.drawTraffic(c)
      // 거리 건너편 이웃 건물은 지나가는 사람·차보다 앞
      c.drawImage(front, 0, 0)
      drawDioramaDoorGlow(c, layout, g)
    }
    const c = canvas.getContext('2d')!
    c.imageSmoothingEnabled = false
    let glow = 0
    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      // 첫 프레임의 rAF 시각은 last보다 이를 수 있다 — 음수면 걷기 프레임 번호가 음수가 되어 그림이 없다(drawImage 오류)
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
      last = now
      step(dt)
      glow = Math.max(0, Math.min(1, glow + (hoverRef.current ? 1 : -1) * GLOW_SPEED * dt))
      c.drawImage(skyCanvas, 0, 0)
      drawClouds(c)
      c.drawImage(scene, 0, 0)
      drawFront(c, glow)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [layout, isNight])

  const handleEnter = () => {
    setViewFloor(1)
    setInside(true)
  }
  const at = (x: number) => (view ? x * view.zoom : 0)
  // 내 건물(그림·부지) 위에서만 손 모양·외곽선 빛, 누르면 들어간다. 이웃 건물·잔디·길은 반응 없다
  const isOnBuilding = (e: MouseEvent<HTMLDivElement>) => isOnOffice(layout, e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 touch-none overflow-hidden bg-[#1b1e25]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 캔버스는 처음부터 붙여 둔다 (그리기가 배치만 보고 돌기 때문 — 화면 크기를 재기 전엔 숨김) */}
      <div
        ref={stageRef}
        className={cn('absolute', isHover && 'cursor-pointer', !view && 'invisible')}
        style={view && host ? { left: host.w / 2 - view.x * view.zoom, top: host.h / 2 - view.y * view.zoom, width: layout.W * view.zoom, height: layout.H * view.zoom } : undefined}
        onMouseMove={(e) => !drag.current?.moved && setIsHover(isOnBuilding(e))}
        onMouseLeave={() => setIsHover(false)}
        onClick={(e) => !wasDrag.current && isOnBuilding(e) && handleEnter()}
      >
          <canvas ref={canvasRef} className="block size-full" style={{ imageRendering: 'pixelated' }} />
          <button
            type="button"
            onClick={handleEnter}
            onFocus={() => setIsHover(true)}
            onBlur={() => setIsHover(false)}
            aria-label={t('map.enterOffice')}
            className="pointer-events-none absolute rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#ffe08a]"
            style={{ left: at(layout.body.x), top: at(layout.body.y), width: at(layout.body.w), height: at(layout.body.h) }}
          />
          {isHover && view && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-hud-border bg-hud px-2 py-0.5 text-xs whitespace-nowrap text-hud-foreground shadow-lg"
              style={{ left: at(layout.door.x + layout.door.w / 2), top: at(layout.door.y) - 10 }}
            >
              {t('map.enter')}
            </span>
          )}
      </div>
      <ZoomControls onZoom={(f) => host && zoomAt(f, host.w / 2, host.h / 2)} onFit={() => setCam(null)} />
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <div className="pointer-events-none rounded-lg border border-hud-border bg-hud px-3 py-2 text-xs text-hud-foreground shadow-lg">
          <div className="font-semibold">
            Lv.{level} {COMPANY_LEVELS[level - 1]?.title}
          </div>
          <div className="text-hud-foreground/70">{t('map.buildingFloors', { floors })}</div>
        </div>
        {nextLevel && (
          <div className="relative w-fit" onMouseEnter={() => setIsPreviewOpen(true)} onMouseLeave={() => setIsPreviewOpen(false)}>
            <span
              tabIndex={0}
              onFocus={() => setIsPreviewOpen(true)}
              onBlur={() => setIsPreviewOpen(false)}
              className="block cursor-default rounded-md border border-hud-border bg-hud px-2 py-1 text-[11px] text-hud-foreground/80"
            >
              {t('map.nextPreview')}
            </span>
            {isPreviewOpen && (
              <div role="tooltip" className="absolute top-full left-0 z-10 mt-1 w-72 rounded-lg border border-hud-border bg-hud p-2 text-[11px] text-hud-foreground shadow-lg">
                <img src={nextUrl} alt="" className="mb-1 block h-auto w-full rounded" style={{ imageRendering: 'pixelated' }} />
                {t('map.nextPreviewLine', { level: nextLevel, title: levelTitle(nextLevel, COMPANY_LEVELS[nextLevel - 1].title), floors: officeOf(nextLevel).floors })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 건물 안 왼쪽 위: 밖으로 나가기 + (층이 여럿이면) 층 미니맵 */
function Minimap() {
  const level = useViewLevel()
  const staff = useOffice((s) => s.staff)
  const teams = useOffice((s) => s.teams)
  const meetings = useOffice((s) => s.meetings)
  const viewFloor = useOffice((s) => s.viewFloor)
  const setViewFloor = useOffice((s) => s.setViewFloor)
  const setInside = useOffice((s) => s.setInside)
  const visits = useFloorVisits((s) => s.visits)
  const floors = useMemo(() => buildFloors(level, staff, teams, meetings.filter(isMeetingLive)), [level, staff, teams, meetings])

  return (
    <div className="absolute top-3 left-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setInside(false)}
        className="flex w-fit items-center gap-1.5 rounded-lg border border-hud-border bg-hud px-3 py-1.5 text-xs text-hud-foreground shadow-lg hover:bg-card"
      >
        <DoorOpenIcon className="size-3.5" /> {t('map.exit')}
      </button>
      {floors.length > 1 && (
        <nav aria-label={t('map.floorMinimap')} className="flex w-44 flex-col gap-1 rounded-lg border border-hud-border bg-hud p-1.5 text-[11px] text-hud-foreground shadow-lg">
          {[...floors].reverse().map((f) => (
            <button
              key={f.floor}
              type="button"
              onClick={() => setViewFloor(f.floor)}
              aria-current={f.floor === viewFloor ? 'true' : undefined}
              className={cn('flex flex-col gap-0.5 rounded-md border px-2 py-1 text-left', f.floor === viewFloor ? 'border-primary bg-primary/20' : 'border-hud-border hover:bg-hud-foreground/10')}
            >
              <span className="flex items-center justify-between font-mono font-bold">
                {f.floor}F<span className="font-sans font-normal text-hud-foreground/60">{t('map.peopleCount', { n: headcountOf(f.floor, f.staff.map((x) => x.id), visits) })}</span>
              </span>
              <span className="truncate text-hud-foreground/60">
                {f.teams
                  .filter((t) => t.kind === 'hired')
                  .map((t) => t.name)
                  .join(' · ') || (f.floor === 1 ? t('map.lobby') : t('map.emptyFloor'))}
              </span>
              {f.meetingRoom.meetings.length > 0 && <span className="text-primary truncate">{t('map.inMeeting')}</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

/** 오른쪽 엘리베이터식 층 버튼 (층이 2개 이상일 때만) */
function FloorButtons() {
  const level = useViewLevel()
  const viewFloor = useOffice((s) => s.viewFloor)
  const setViewFloor = useOffice((s) => s.setViewFloor)
  const { floors } = officeOf(level)
  if (floors < 2) return null
  return (
    <div role="group" aria-label={t('map.floorMove')} className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-1 rounded-full border border-hud-border bg-hud p-1 shadow-lg">
      {Array.from({ length: floors }, (_, i) => floors - i).map((floor) => (
        <button
          key={floor}
          type="button"
          onClick={() => setViewFloor(floor)}
          aria-pressed={floor === viewFloor}
          className={cn('size-8 rounded-full font-mono text-xs font-bold', floor === viewFloor ? 'bg-primary text-primary-foreground' : 'text-hud-foreground hover:bg-hud-foreground/10')}
        >
          {floor}
        </button>
      ))}
    </div>
  )
}

/** 맵 오른쪽 위 현황판: 회사 레벨·직원 현황·꾸미기 모드 */
function Hud() {
  const staff = useOffice((s) => s.staff)
  const company = useOffice((s) => s.company)
  const running = useOffice((s) => s.meetings.find(isMeetingLive))
  const isDecorating = useOffice((s) => s.isDecorating)
  const setDecorating = useOffice((s) => s.setDecorating)
  const previewLevel = useOffice((s) => s.previewLevel)
  const seatShort = useSeatStatus()
  const setInside = useOffice((s) => s.setInside)
  const isInside = useOffice((s) => s.isInside)
  const isRecording = useSceneExport((s) => s.phase === 'recording')
  // 장면 내보내기는 건물 안 장면만 (외관은 아직 범위 밖), 꾸미는 동안은 숨긴다
  const canExport = !IS_MOBILE_SHELL && canExportScene() && isInside && !isDecorating
  // 휴대폰: 지도를 덜 가리게 한 줄로 접어 두고 누르면 펼친다
  const [isOpen, setIsOpen] = useState(false)
  const isDrawerOpen = isDecorating
  // 외관에서 꾸미기를 켜면 안으로 들어가서 꾸민다
  const handleDecorate = () => {
    if (!isDecorating) setInside(true)
    setDecorating(!isDecorating)
  }
  const rows = [
    { label: t('map.stat.staff'), value: staff.length, color: 'text-hud-foreground' },
    { label: t('map.stat.working'), value: staff.filter((s) => s.status === 'working').length, color: 'text-status-working' },
    { label: t('map.stat.waiting'), value: staff.filter((s) => s.status === 'waiting').length, color: 'text-status-waiting' },
    { label: t('map.stat.idle'), value: staff.filter((s) => s.status === 'idle' && !s.meetingId).length, color: 'text-muted-foreground' },
  ]
  return (
    <div className="absolute top-3 right-3 flex flex-col items-end gap-2" data-tour="hud">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn('phone:flex hidden items-center gap-2 rounded-lg border border-hud-border bg-hud px-3 py-1.5 font-mono text-[11px] shadow-lg', isOpen && 'phone:hidden')}
      >
        <span className="text-primary font-bold">{t('map.companyLevel', { level: company.level })}</span>
        <span className="text-status-waiting">{t('map.stat.waiting')} {rows[2].value}</span>
      </button>
      <div
        onClick={() => setIsOpen(false)}
        className={cn(
          'pointer-events-none w-48 rounded-lg border border-hud-border bg-hud px-3 py-2 font-mono text-[11px] leading-5 shadow-lg',
          isOpen ? 'phone:pointer-events-auto' : 'phone:hidden',
          // 칸 사무실을 꾸미는 동안은 현황 대신 서랍을 버튼 아래에
          isDrawerOpen && 'hidden',
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-primary font-bold">{t('map.companyLevel', { level: company.level })}</span>
          <span className="text-muted-foreground">{levelTitle(company.level, company.title)}</span>
        </div>
        <div className="my-1 h-1.5 overflow-hidden rounded-full bg-hud-foreground/10">
          <div className="bg-primary h-full" style={{ width: `${Math.round(company.progress * 100)}%` }} />
        </div>
        <div className="text-muted-foreground mb-1 text-[10px]">{company.progress < 1 ? t('map.nextXp', { xp: company.nextXp - company.xp }) : t('map.maxSize')}</div>
        {previewLevel !== null && <div className="text-status-waiting mb-1 text-[10px]">{t('map.previewDev', { level: previewLevel })}</div>}
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-6">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={r.color}>{r.value}</span>
          </div>
        ))}
        {seatShort.short > 0 && (
          <div className="text-status-waiting mt-1 text-[10px] leading-4 whitespace-normal">
            {t('map.seatShort', { short: seatShort.short, next: seatShort.next ? t('map.seatShortNext', { level: seatShort.next.level, cap: seatShort.next.cap }) : '' })}
          </div>
        )}
        {running && (
          <div className={running.status === 'waiting' ? 'text-status-waiting mt-1 truncate' : 'text-primary mt-1 truncate'}>
            {running.status === 'waiting' ? t('map.meetingWaiting') : t('map.meetingRunning', { topic: running.topic })}
          </div>
        )}
      </div>
      <div className="flex items-start gap-2">
        {canExport && <SceneExportButton />}
        <button
          type="button"
          onClick={handleDecorate}
          disabled={isRecording}
          className={`rounded-lg border px-3 py-1.5 text-xs shadow-lg disabled:opacity-50 ${isDecorating ? 'border-primary bg-primary text-primary-foreground' : 'border-hud-border bg-hud text-hud-foreground'}`}
        >
          {isDecorating ? t('map.decorEnd') : t('map.decorStart')}
        </button>
      </div>
      {!isDecorating && <DemoDayNowButton />}
      {isDrawerOpen && <DecorDrawer />}
    </div>
  )
}

export function OfficeMap() {
  const isInsideWanted = useOffice((s) => s.isInside)
  const [isStageReady, setStageReady] = useState(false)
  // 장면이 준비되기 전에는 안으로 들어가도 바깥 화면을 그대로 둔다 (준비되면 바로 들어간다)
  const isInside = isInsideWanted && isStageReady
  const hostRef = useRef<HTMLDivElement>(null)
  const scene = () => officeStage.mainScene()

  // 게임은 앱 전체가 함께 쓴다 (직원 프로필·대시보드 카드의 실시간 미니 뷰도 같은 장면) — 지도는 캔버스를 빌려 와 붙인다
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    officeStage.attachMap(host, () => setStageReady(true))
    return () => officeStage.detachMap(host)
  }, [])

  // 다른 층 직원을 고르면(카드·알림 등) 그 층으로 옮겨 보여 준다
  const selectedId = useOffice((s) => s.selectedId)
  useEffect(() => {
    const st = useOffice.getState()
    const s = st.staff.find((x) => x.id === selectedId)
    if (s) st.setViewFloor(staffFloor(s, st.teams, viewLevelOf(st), undefined, st.staff))
  }, [selectedId])

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full touch-none overflow-hidden" />
      {isInside ? (
        <>
          <Minimap />
          <FloorButtons />
        </>
      ) : (
        <OfficeExterior />
      )}
      <RecordingFrame />
      <Hud />
      <DemoDayBanner />
      <SceneExportNotice />
      {isInside && <ZoomControls onZoom={(f) => scene()?.zoomBy(f)} onFit={() => scene()?.fitView()} />}
    </div>
  )
}
