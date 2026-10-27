import { useSeatStatus } from './iso/seatStatus'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { DoorOpenIcon, MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOD_KEY } from '@/lib/platform'
import { IS_MOBILE_SHELL, IS_TOUCH } from '@/shell'
import { useOffice, useViewLevel, viewLevelOf } from '@/store'
import { buildFloors, MAX_LEVEL, officeOf, staffFloor } from '@shared/officeLevel'
import { COMPANY_LEVELS, isMeetingLive } from '@shared/types'
import { dioramaPreviewUrl, DioramaStreet, drawDioramaDoorGlow, paintDiorama } from './exteriorDiorama'
import { dioramaFit, dioramaLayout, isOnOffice } from './exteriorLayout'
import { isNightTime } from '@shared/dayNight'
import { officeStage } from './officeStage'
import { DecorDrawer } from './DecorDrawer'
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

interface ExteriorView {
  W: number
  H: number
  scale: number
}

/** 사무실 외관 거리: 건물을 누르면 1층으로 들어간다. 사람·차가 지나가고, 문에 마우스를 올리면 불이 켜진다 */
function OfficeExterior() {
  const level = useViewLevel()
  const isNight = useIsNight()
  const setInside = useOffice((s) => s.setInside)
  const setViewFloor = useOffice((s) => s.setViewFloor)
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<ExteriorView | null>(null)
  const [isHover, setIsHover] = useState(false)
  const nextLevel = level < MAX_LEVEL ? level + 1 : null
  const nextUrl = useMemo(() => (!nextLevel ? '' : dioramaPreviewUrl(nextLevel, isNight)), [nextLevel, isNight])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const { floors } = officeOf(level)

  // 화면 높이로 정수 배율을 정하고, 남는 폭은 거리를 옆으로 늘려 채운다 (새 사무실은 땅 판이 다 보이는 배율, 남는 곳은 하늘)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const fit = () => {
      const { W, H, scale } = dioramaFit(level, host.clientWidth, host.clientHeight)
      setView((v) => (v && v.W === W && v.H === H && v.scale === scale ? v : { W, H, scale }))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    return () => observer.disconnect()
  }, [level])

  // 그리기와 누르기 판정이 같은 배치를 쓴다 (낮밤까지 같은 값 — 판정만 옛 배치로 남지 않게)
  const layout = useMemo(() => (view ? dioramaLayout(level, isNight, view.W, view.H) : null), [view, level, isNight])

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
  const at = (x: number) => (view ? x * view.scale : 0)
  // 내 건물(그림·부지) 위에서만 손 모양·외곽선 빛, 누르면 들어간다. 이웃 건물·잔디·길은 반응 없다
  const isOnBuilding = (e: MouseEvent<HTMLDivElement>) => !!layout && isOnOffice(layout, e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)

  return (
    <div ref={hostRef} className="absolute inset-0 touch-none overflow-hidden bg-[#1b1e25]">
      {view && layout && (
        <div
          className={cn('absolute bottom-0 left-1/2 -translate-x-1/2', isHover && 'cursor-pointer')}
          style={{ width: view.W * view.scale, height: view.H * view.scale }}
          onMouseMove={(e) => setIsHover(isOnBuilding(e))}
          onMouseLeave={() => setIsHover(false)}
          onClick={(e) => isOnBuilding(e) && handleEnter()}
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
          {isHover && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-white/10 bg-[#1a1d28]/90 px-2 py-0.5 text-xs whitespace-nowrap text-white shadow-lg"
              style={{ left: at(layout.door.x + layout.door.w / 2), top: at(layout.door.y) - 10 }}
            >
              {t('map.enter')}
            </span>
          )}
        </div>
      )}
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <div className="pointer-events-none rounded-lg border border-white/10 bg-[#1a1d28]/90 px-3 py-2 text-xs text-white shadow-lg">
          <div className="font-semibold">
            Lv.{level} {COMPANY_LEVELS[level - 1]?.title}
          </div>
          <div className="text-white/70">{t('map.buildingFloors', { floors })}</div>
        </div>
        {nextLevel && (
          <div className="relative w-fit" onMouseEnter={() => setIsPreviewOpen(true)} onMouseLeave={() => setIsPreviewOpen(false)}>
            <span
              tabIndex={0}
              onFocus={() => setIsPreviewOpen(true)}
              onBlur={() => setIsPreviewOpen(false)}
              className="block cursor-default rounded-md border border-white/10 bg-[#1a1d28]/80 px-2 py-1 text-[11px] text-white/80"
            >
              {t('map.nextPreview')}
            </span>
            {isPreviewOpen && (
              <div role="tooltip" className="absolute top-full left-0 z-10 mt-1 w-72 rounded-lg border border-white/10 bg-[#1a1d28]/95 p-2 text-[11px] text-white shadow-lg">
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
  const floors = useMemo(() => buildFloors(level, staff, teams, meetings.filter(isMeetingLive)), [level, staff, teams, meetings])

  return (
    <div className="absolute top-3 left-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setInside(false)}
        className="flex w-fit items-center gap-1.5 rounded-lg border border-white/10 bg-[#1a1d28]/90 px-3 py-1.5 text-xs text-white shadow-lg hover:bg-[#1a1d28]"
      >
        <DoorOpenIcon className="size-3.5" /> {t('map.exit')}
      </button>
      {floors.length > 1 && (
        <nav aria-label={t('map.floorMinimap')} className="flex w-44 flex-col gap-1 rounded-lg border border-white/10 bg-[#1a1d28]/90 p-1.5 text-[11px] text-white shadow-lg">
          {[...floors].reverse().map((f) => (
            <button
              key={f.floor}
              type="button"
              onClick={() => setViewFloor(f.floor)}
              aria-current={f.floor === viewFloor ? 'true' : undefined}
              className={cn('flex flex-col gap-0.5 rounded-md border px-2 py-1 text-left', f.floor === viewFloor ? 'border-primary bg-primary/20' : 'border-white/10 hover:bg-white/10')}
            >
              <span className="flex items-center justify-between font-mono font-bold">
                {f.floor}F<span className="font-sans font-normal text-white/60">{t('map.peopleCount', { n: f.staff.length })}</span>
              </span>
              <span className="truncate text-white/60">
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
    <div role="group" aria-label={t('map.floorMove')} className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-1 rounded-full border border-white/10 bg-[#1a1d28]/90 p-1 shadow-lg">
      {Array.from({ length: floors }, (_, i) => floors - i).map((floor) => (
        <button
          key={floor}
          type="button"
          onClick={() => setViewFloor(floor)}
          aria-pressed={floor === viewFloor}
          className={cn('size-8 rounded-full font-mono text-xs font-bold', floor === viewFloor ? 'bg-primary text-primary-foreground' : 'text-white hover:bg-white/10')}
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
  // 휴대폰: 지도를 덜 가리게 한 줄로 접어 두고 누르면 펼친다
  const [isOpen, setIsOpen] = useState(false)
  const isDrawerOpen = isDecorating
  // 외관에서 꾸미기를 켜면 안으로 들어가서 꾸민다
  const handleDecorate = () => {
    if (!isDecorating) setInside(true)
    setDecorating(!isDecorating)
  }
  const rows = [
    { label: t('map.stat.staff'), value: staff.length, color: 'text-white' },
    { label: t('map.stat.working'), value: staff.filter((s) => s.status === 'working').length, color: 'text-status-working' },
    { label: t('map.stat.waiting'), value: staff.filter((s) => s.status === 'waiting').length, color: 'text-status-waiting' },
    { label: t('map.stat.idle'), value: staff.filter((s) => s.status === 'idle' && !s.meetingId).length, color: 'text-muted-foreground' },
  ]
  return (
    <div className="absolute top-3 right-3 flex flex-col items-end gap-2" data-tour="hud">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn('phone:flex hidden items-center gap-2 rounded-lg border border-white/10 bg-[#1a1d28]/90 px-3 py-1.5 font-mono text-[11px] shadow-lg', isOpen && 'phone:hidden')}
      >
        <span className="text-primary font-bold">{t('map.companyLevel', { level: company.level })}</span>
        <span className="text-status-waiting">{t('map.stat.waiting')} {rows[2].value}</span>
      </button>
      <div
        onClick={() => setIsOpen(false)}
        className={cn(
          'pointer-events-none w-48 rounded-lg border border-white/10 bg-[#1a1d28]/90 px-3 py-2 font-mono text-[11px] leading-5 shadow-lg',
          isOpen ? 'phone:pointer-events-auto' : 'phone:hidden',
          // 칸 사무실을 꾸미는 동안은 현황 대신 서랍을 버튼 아래에
          isDrawerOpen && 'hidden',
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-primary font-bold">{t('map.companyLevel', { level: company.level })}</span>
          <span className="text-muted-foreground">{levelTitle(company.level, company.title)}</span>
        </div>
        <div className="my-1 h-1.5 overflow-hidden rounded-full bg-white/10">
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
      <button
        type="button"
        onClick={handleDecorate}
        className={`rounded-lg border px-3 py-1.5 text-xs shadow-lg ${isDecorating ? 'border-primary bg-primary text-primary-foreground' : 'border-white/10 bg-[#1a1d28]/90 text-white'}`}
      >
        {isDecorating ? t('map.decorEnd') : t('map.decorStart')}
      </button>
      {!IS_MOBILE_SHELL && !isDecorating && <DemoDayNowButton />}
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
  const ZOOM_STEP = 1.25

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
      <Hud />
      {!IS_MOBILE_SHELL && <DemoDayBanner />}
      {isInside && (
        <>
          <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1a1d28]/90 shadow-lg">
            <button type="button" onClick={() => scene()?.zoomBy(ZOOM_STEP)} className="p-2 text-white hover:bg-white/10" aria-label={t('map.zoomIn')}>
              <PlusIcon className="size-4" />
            </button>
            <button type="button" onClick={() => scene()?.zoomBy(1 / ZOOM_STEP)} className="p-2 text-white hover:bg-white/10" aria-label={t('map.zoomOut')}>
              <MinusIcon className="size-4" />
            </button>
            <button type="button" onClick={() => scene()?.fitView()} className="p-2 text-white hover:bg-white/10" aria-label={t('map.fitView')} title={t('map.fitView')}>
              <MaximizeIcon className="size-4" />
            </button>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-[#1a1d28]/80 px-2 py-1 text-[11px] text-white/70">{IS_TOUCH ? t('map.hintTouch') : t('map.hintDesktop', { mod: MOD_KEY })}</div>
        </>
      )}
    </div>
  )
}
