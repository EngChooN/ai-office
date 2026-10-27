// 사무실 무대: Phaser 게임 하나를 앱 전체가 함께 쓴다 — 사무실 지도와 직원 프로필·대시보드 카드의 실시간 미니 뷰
//
// 방식: 보조 카메라 + 캔버스 아래 미니 뷰 칸
// - 지도와 같은 장면(IsoOfficeScene)에 미니 뷰마다 카메라를 하나 더 달아 그 직원을 따라가게 한다. 장면은 한 번만 움직인다.
// - 카메라는 게임 캔버스의 지도 영역 아래 "미니 뷰 칸"(지도 밖이라 잘려 안 보임)에 그리고, 그린 직후 칸을 각 창의 <canvas>로 복사한다.
// - 다른 층 직원은 그 층만 그리는 고정 층 장면(IsoOfficeScene floor 옵션)에서 따라간다. 지도가 같은 층을 보고 있으면 지도 장면을 쓴다
//   (같은 층을 두 장면이 따로 움직이지 않게 — 지도와 미니 뷰 동작이 어긋나지 않는다).
// - 지도 화면이 닫혀 있어도 게임은 숨은 자리(parking)에서 미니 뷰만 그린다. 그릴 창이 없으면 루프를 재운다.

import * as Phaser from 'phaser'
import { IS_TOUCH } from '@/shell'
import { useOffice, viewLevelOf } from '@/store'
import { buildFloors, officeOf, staffFloor } from '@shared/officeLevel'
import { isMeetingLive } from '@shared/types'
import { IsoOfficeScene } from './IsoOfficeScene'
import { useFloorVisits } from './iso/floorVisits'
import { afterNextRender } from './renderSignal'

/** 미니 뷰 기본 크기 (CSS px) — 창은 이 비율로 그린다 */
export const MINI_W = 200
export const MINI_H = 140
/**
 * 창이 기본 비율보다 넓으면(폭이 넓은 대시보드 카드) 높이는 그대로 두고 그만큼 넓게 그린다 —
 * 늘려서 잘라 확대하지 않고 사무실 좌우가 더 보인다. 이 비율까지만 넓힌다
 */
const MINI_MAX_ASPECT = 4
/** 창 비율(가로/세로)을 그릴 수 있는 범위로 */
export const clampMiniAspect = (aspect: number) => (Number.isFinite(aspect) && aspect > 0 ? Math.min(MINI_MAX_ASPECT, Math.max(MINI_W / MINI_H, aspect)) : MINI_W / MINI_H)
/** 동시에 움직이는 미니 뷰 수 (넘는 창은 정지 그림) */
const SLOTS = 8
const COLS = 2
/**
 * 미니 뷰 카메라 (세계 px 기준). 미니 뷰는 늘 MINI_H(140 CSS px) 높이로 그리므로 보이는 세계 높이 = 140 ÷ (zoom × compact)
 * - zoom: 세계 1px → CSS px. 지도 기본 확대보다 조금 크게
 * - followUp: 따라갈 때 발밑보다 이만큼 위를 화면 가운데에
 * - compactZoom·compactFollowUp: 프로필·대시보드 카드의 작은 창 — 조금 멀리서
 * 칸 사무실(IsoOfficeScene): 앉으면 몸이 18px 뜨고(좌석 9 아트px) 앉은 키 44px, 책상은 발밑 앞(+gy) 칸이라 발밑 아래 ~48px까지 내려온다.
 * → 보이는 높이 약 122px, 가운데를 발밑 위 20px에 두면 머리(−62)부터 책상 앞면(+40)까지 들어온다 (기술 설계 1-5절, C2 측정 6절)
 */
const MINI_FRAME = { zoom: 1.6, followUp: 24, compactZoom: 0.72, compactFollowUp: 20 }
const MINI_ZOOM = MINI_FRAME.zoom
const FOLLOW_UP = MINI_FRAME.followUp
const COMPACT_ZOOM = MINI_FRAME.compactZoom
const COMPACT_FOLLOW_UP = MINI_FRAME.compactFollowUp
/**
 * 미니 뷰 갱신 빈도 (초당). 프로필은 부드럽게, 대시보드 카드는 여러 개라 낮게.
 * 폰은 한 단계 낮추고, 배터리로 돌 때(충전 중 아님)는 한 단계 더 낮춘다 — PC 프로필이 배터리에서 12인 것은 의도한 값
 */
const FPS = {
  profile: { pc: 24, touch: 12, pcBattery: 12, touchBattery: 8 },
  card: { pc: 12, touch: 8, pcBattery: 8, touchBattery: 6 },
} as const
/** 고정 층 장면을 쓰지 않으면 잠깐 뒤 재운다 (층을 오가는 직원 때문에 바로 재우지 않는다) */
const FLOOR_SLEEP_MS = 5_000
/** 직원이 어느 장면에 있는지 다시 보는 간격 */
const ASSIGN_MS = 500

const MAIN = 'office'
const floorKey = (floor: number) => `office-f${floor}`

export interface MiniHandle {
  /** 따라갈 직원을 바꾼다 */
  setStaff(staffId: string): void
  /** 창 비율(가로/세로)이 바뀌었을 때 */
  setAspect(aspect: number): void
  dispose(): void
}

interface View {
  staffId: string
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  slot: number
  onActive(isActive: boolean): void
  cam: Phaser.Cameras.Scene2D.Camera | null
  sceneKey: string | null
  target: Phaser.GameObjects.Container | null
  /** 다른 층 회의에 간 직원: 그 층 회의 테이블을 비춘다 (그 층 장면에는 이 직원 캐릭터가 없다) */
  isMeetingView: boolean
  /** 대시보드 카드처럼 작은 창 — 갱신을 낮추고 카메라를 조금 멀리 */
  isCompact: boolean
  /** 그리는 비율 (가로/세로, clampMiniAspect 범위) */
  aspect: number
  lastCopy: number
  /** 이번 프레임에 이 창을 그린다 */
  isDue: boolean
}

/** 미니 뷰가 지금 그릴 게 있는지 — 따라가던 캐릭터가 층 바꾸기로 지워졌으면(active false) 그리지 않는다 */
const isLive = (v: View) => Boolean(v.cam) && (v.isMeetingView || Boolean(v.target?.active))

class OfficeStage {
  private game: Phaser.Game | null = null
  private parking: HTMLDivElement | null = null
  private mapHost: HTMLElement | null = null
  private mapObserver: ResizeObserver | null = null
  private mapSize = { w: 0, h: 0 }
  private views = new Set<View>()
  private floorUsedAt = new Map<number, number>()
  private assignTimer = 0
  private ready: Promise<void> | null = null
  private isOnBattery = false
  /** 창이 최소화·숨김이면 false — 그동안은 지도도 미니 뷰도 그리지 않는다 */
  private isWindowShown = true
  /** 발표장처럼 화면 전체를 덮는 장면이 떠 있으면 true — 안 보이는 지도는 그리지 않는다 */
  private isCovered = false

  /** 화면 배율이 바뀌면(창을 다른 해상도 모니터로 옮김) 알려 주는 질의 — 바뀔 때마다 새 배율로 다시 건다 */
  private dprQuery: MediaQueryList | null = null
  /** 캔버스·칸을 맞춘 배율 */
  private appliedDpr = 0
  private readonly onDprChange = () => {
    if (this.dpr === this.appliedDpr) return
    this.watchDpr()
    // 캔버스·칸·카메라 확대가 모두 배율로 정해진다 — 그대로 두면 칸을 새 배율로 읽어 미니 뷰가 1/4로 줄고 나머지는 검게 남는다
    for (const v of this.views) {
      this.sizeCanvas(v)
      this.dropCamera(v)
      v.lastCopy = 0
    }
    this.layout()
    this.assign()
  }

  private watchDpr() {
    this.appliedDpr = this.dpr
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = typeof matchMedia === 'function' ? matchMedia(`(resolution: ${this.dpr}dppx)`) : null
    this.dprQuery?.addEventListener('change', this.onDprChange)
  }

  setWindowShown(isShown: boolean) {
    if (this.isWindowShown === isShown) return
    this.isWindowShown = isShown
    this.updateLoop()
  }
  setCovered(isCovered: boolean) {
    if (this.isCovered === isCovered) return
    this.isCovered = isCovered
    this.updateLoop()
  }
  private fpsOf(v: View) {
    const f = FPS[v.isCompact ? 'card' : 'profile']
    if (IS_TOUCH) return this.isOnBattery ? f.touchBattery : f.touch
    return this.isOnBattery ? f.pcBattery : f.pc
  }

  private get dpr() {
    return window.devicePixelRatio || 1
  }

  /** 미니 뷰 칸 한 개의 캔버스 픽셀 크기 (레티나는 2배까지). 칸은 가장 넓은 비율 폭으로 잡고, 창마다 그 안에서 자기 폭만 쓴다 */
  private get slotPx() {
    const r = Math.min(2, this.dpr)
    return { w: Math.round(MINI_H * MINI_MAX_ASPECT * r), h: Math.round(MINI_H * r), r }
  }

  /** 이 창이 칸에서 쓰는 폭 (캔버스 px) */
  private viewW(v: View) {
    return Math.round(MINI_H * v.aspect * this.slotPx.r)
  }

  mainScene(): IsoOfficeScene | undefined {
    return this.game?.scene.getScene(MAIN) as IsoOfficeScene | undefined
  }

  // ── 게임 ─────────────────────────────────────────────

  private ensureGame(): Promise<void> {
    if (this.ready) return this.ready
    this.parking = Object.assign(document.createElement('div'), { ariaHidden: 'true' })
    // 화면 밖 자리: 지도가 닫혀 있는 동안 캔버스를 둔다 (display:none이면 그리기가 멈추는 브라우저가 있다)
    Object.assign(this.parking.style, { position: 'fixed', left: '-100000px', top: '0', width: '1px', height: '1px', overflow: 'hidden', pointerEvents: 'none' })
    document.body.append(this.parking)
    const { w, h } = this.canvasSize()
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.mapHost ?? this.parking,
      backgroundColor: '#1b1e25',
      pixelArt: true,
      scale: { mode: Phaser.Scale.NONE, width: w, height: h },
      scene: [IsoOfficeScene],
      banner: false,
    })
    this.game = game
    this.watchBattery()
    this.watchDpr()
    game.events.on(Phaser.Core.Events.PRE_RENDER, () => this.beforeRender())
    game.events.on(Phaser.Core.Events.POST_RENDER, () => this.afterRender())
    this.ready = new Promise((resolve) => {
      game.events.once(Phaser.Core.Events.READY, () => {
        this.layout()
        resolve()
      })
    })
    return this.ready
  }

  /**
   * 캔버스 = 지도 영역(위) + 미니 뷰 칸(아래). 지도가 닫혀 있으면 미니 뷰 칸만, 미니 뷰가 하나도 없으면 지도 영역만.
   * 미니 뷰 칸(2240×1120 기기 px)이 늘 붙어 있으면 폰에서 지도만 열어도 캔버스가 2.4배(약 28MB)로 커진다 — C2 측정 6절
   */
  private canvasSize() {
    const { w: sw, h: sh } = this.slotPx
    const hasSlots = this.views.size > 0
    const rows = hasSlots ? Math.ceil(SLOTS / COLS) : 0
    const mapW = Math.round(this.mapSize.w * this.dpr)
    const mapH = Math.round(this.mapSize.h * this.dpr)
    return { w: Math.max(1, mapW, hasSlots ? COLS * sw : 0), h: Math.max(1, mapH + rows * sh), mapW, mapH }
  }

  private layout() {
    const game = this.game
    if (!game) return
    const { w, h, mapW, mapH } = this.canvasSize()
    if (game.scale.width !== w || game.scale.height !== h) game.scale.resize(w, h)
    // CSS 크기는 기기 픽셀 ÷ 배율 — 지도 밖(미니 뷰 칸)은 지도 상자에서 잘려 보이지 않는다
    game.canvas.style.width = `${w / this.dpr}px`
    game.canvas.style.height = `${h / this.dpr}px`
    game.canvas.style.display = 'block'
    game.scale.refresh()
    this.mainScene()?.setMapViewport(mapW, mapH, Boolean(this.mapHost))
    for (const v of this.views) this.placeCamera(v)
    this.updateLoop()
  }

  /** 절전: 배터리로 돌면 미니 뷰를 더 느리게 그린다 (배터리 정보를 못 읽으면 그대로) */
  private watchBattery() {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; addEventListener(type: 'chargingchange', fn: () => void): void }> }
    void nav
      .getBattery?.()
      .then((battery) => {
        const update = () => {
          this.isOnBattery = !battery.charging
          this.updateLoop()
        }
        battery.addEventListener('chargingchange', update)
        update()
      })
      .catch(() => {})
  }

  /** 할 일이 없으면 루프를 재우고, 지도가 닫혀 있으면 미니 뷰 빈도로 낮춘다 */
  private updateLoop() {
    const game = this.game
    if (!game) return
    const isIdle = !this.isWindowShown || this.isCovered || (!this.mapHost && this.views.size === 0)
    if (isIdle) {
      if (game.loop.running) game.loop.sleep()
      return
    }
    // 지도가 열려 있으면 지도 빠르기 그대로, 아니면 미니 뷰 중 가장 빠른 것에 맞춘다 (창이 최소화·숨김이면 위에서 이미 재웠다)
    const limit = this.mapHost ? 0 : Math.max(...[...this.views].map((v) => this.fpsOf(v)))
    if (game.loop.fpsLimit !== limit) game.loop.setFPSLimit(limit)
    if (!game.loop.running) game.loop.wake()
  }

  // ── 지도 ─────────────────────────────────────────────

  /** 사무실 지도 화면이 열릴 때: 캔버스를 지도 상자로 옮긴다 */
  attachMap(host: HTMLElement, onReady?: () => void) {
    this.mapHost = host
    const fit = () => {
      this.mapSize = { w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) }
      this.layout()
    }
    this.mapSize = { w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) }
    void this.ensureGame().then(() => {
      if (this.mapHost !== host || !this.game) return
      host.append(this.game.canvas)
      this.setAwake(this.mainScene(), true)
      fit()
      // 예전처럼 지도를 열 때마다 전체 보기로 시작한다
      this.mainScene()?.fitView()
      // 장면이 만들어지고 첫 그리기까지 마친 뒤 알린다 — 그 전에 안으로 들어가면 아직 안 그려진 어두운 캔버스가 보인다
      afterNextRender(this.game, Phaser.Core.Events.POST_RENDER, () => {
        if (this.mapHost === host) onReady?.()
      })
    })
    this.mapObserver?.disconnect()
    this.mapObserver = new ResizeObserver(fit)
    this.mapObserver.observe(host)
  }

  detachMap(host: HTMLElement) {
    if (this.mapHost !== host) return
    this.mapHost = null
    this.mapObserver?.disconnect()
    this.mapObserver = null
    this.mapSize = { w: 0, h: 0 }
    if (this.game && this.parking) this.parking.append(this.game.canvas)
    this.layout()
    this.assign()
  }

  // ── 미니 뷰 ───────────────────────────────────────────

  /**
   * 직원을 따라가는 미니 뷰를 등록한다 (창이 화면에 보이는 동안만 부른다).
   * 칸이 모자라면 onActive(false) — 창은 정지 그림을 보여 준다
   */
  addView(staffId: string, canvas: HTMLCanvasElement, onActive: (isActive: boolean) => void, opts: { isCompact?: boolean; aspect?: number } = {}): MiniHandle {
    const used = new Set([...this.views].map((v) => v.slot))
    const slot = Array.from({ length: SLOTS }, (_, i) => i).find((i) => !used.has(i)) ?? -1
    const view: View = { staffId, canvas, ctx: canvas.getContext('2d')!, slot, onActive, cam: null, sceneKey: null, target: null, isMeetingView: false, isCompact: Boolean(opts.isCompact), aspect: clampMiniAspect(opts.aspect ?? 0), lastCopy: 0, isDue: false }
    if (slot < 0) {
      onActive(false)
      return { setStaff: () => {}, setAspect: () => {}, dispose: () => {} }
    }
    this.sizeCanvas(view)
    this.views.add(view)
    void this.ensureGame().then(() => {
      if (!this.views.has(view)) return
      this.fitSlots()
      this.updateLoop()
      this.assign()
      if (!this.assignTimer) this.assignTimer = window.setInterval(() => this.assign(), ASSIGN_MS)
    })
    return {
      setStaff: (id) => {
        if (view.staffId === id) return
        view.staffId = id
        this.assign()
      },
      setAspect: (aspect) => {
        const next = clampMiniAspect(aspect)
        if (Math.abs(next - view.aspect) < 0.01) return
        view.aspect = next
        this.sizeCanvas(view)
        this.placeCamera(view)
        view.lastCopy = 0
      },
      dispose: () => this.removeView(view),
    }
  }

  /** 창 캔버스를 그리는 크기에 맞춘다 (크기를 바꾸면 캔버스가 지워진다 — 다음 프레임에 다시 그린다) */
  private sizeCanvas(v: View) {
    const w = this.viewW(v)
    const { h } = this.slotPx
    if (v.canvas.width !== w || v.canvas.height !== h) Object.assign(v.canvas, { width: w, height: h })
    v.ctx.imageSmoothingEnabled = false
  }

  private removeView(view: View) {
    if (!this.views.delete(view)) return
    this.dropCamera(view)
    if (this.views.size === 0 && this.assignTimer) {
      clearInterval(this.assignTimer)
      this.assignTimer = 0
    }
    this.fitSlots()
    this.assign()
    this.updateLoop()
  }

  /** 미니 뷰가 처음 생기거나 모두 없어지면 캔버스 아래 칸을 붙이거나 뗀다 (크기가 그대로면 아무것도 안 함) */
  private fitSlots() {
    const game = this.game
    if (!game) return
    const { w, h } = this.canvasSize()
    if (game.scale.width !== w || game.scale.height !== h) this.layout()
  }

  /** 미니 뷰마다 그 직원이 있는 장면을 고르고 카메라를 단다 */
  private assign() {
    const game = this.game
    if (!game) return
    const st = useOffice.getState()
    const level = viewLevelOf(st)
    const floors = officeOf(level).floors
    const main = this.mainScene()
    // 지도 장면이 자는 동안에는 층 변경을 아직 안 맞췄다 — 깨어나면 맞출 층(store)을 기준으로
    const mainFloor = main && !main.sys.isSleeping() ? main.currentFloor : st.viewFloor
    const now = performance.now()
    const needFloors = new Set<number>()
    // 다른 층 회의에 간 직원 → 회의가 열린 층 (자기 층 회의는 그 층 장면에 캐릭터가 회의실로 간다)
    const floorData = buildFloors(level, st.staff, st.teams, st.meetings.filter(isMeetingLive))
    const meetingFloorOf = new Map(
      floorData.flatMap((f) =>
        f.meetingRoom.meetings.flatMap((m) => m.participantIds.filter((id) => !f.staff.some((x) => x.id === id)).map((id) => [id, f.floor] as const)),
      ),
    )
    const sceneOfFloor = (f: number) => (f === mainFloor && main ? main : this.floorScene(f))
    for (const v of this.views) {
      const meetingFloor = meetingFloorOf.get(v.staffId)
      if (meetingFloor !== undefined) {
        const scene = sceneOfFloor(meetingFloor)
        if (scene && scene.fixedFloor !== null) needFloors.add(scene.fixedFloor)
        this.attachCamera(v, scene ?? null, true)
        continue
      }
      // 1) 지도 장면에 있으면 그대로 (지도와 같은 동작)
      let scene: IsoOfficeScene | undefined = main?.actorTarget(v.staffId) ? main : undefined
      if (!scene) {
        // 2) 이미 깨어 있는 다른 층 장면에 있으면 거기서 (회의로 다른 층에 가 있는 경우 포함)
        for (let f = 1; f <= floors; f++) {
          if (f === mainFloor) continue
          const sc = game.scene.getScene(floorKey(f)) as IsoOfficeScene | null
          if (sc && sc.sys.isActive() && sc.actorTarget(v.staffId)) scene = sc
        }
      }
      if (!scene) {
        // 3) 그 직원이 있는 층(다른 층에 놀러 갔으면 그 층, 아니면 자리 층) 장면을 깨운다 (지도가 그 층을 보면 지도 장면)
        const s = st.staff.find((x) => x.id === v.staffId)
        const f = useFloorVisits.getState().visits[v.staffId]?.floor ?? (s ? staffFloor(s, st.teams, level, undefined, st.staff) : mainFloor)
        scene = sceneOfFloor(f)
      }
      if (scene && scene.fixedFloor !== null) needFloors.add(scene.fixedFloor)
      this.attachCamera(v, scene ?? null)
    }
    // 지도 장면은 지도가 열려 있거나 미니 뷰가 쓰는 동안만 움직인다
    if (main) {
      const isMainNeeded = Boolean(this.mapHost) || [...this.views].some((v) => v.sceneKey === MAIN)
      this.setAwake(main, isMainNeeded)
    }
    // 쓰지 않는 층 장면은 잠깐 뒤 재운다. 지도가 보는 층과 같은 층 장면은 바로 재운다 (두 번 움직이지 않게)
    for (let f = 1; f <= Math.max(floors, ...this.floorUsedAt.keys()); f++) {
      const sc = game.scene.getScene(floorKey(f)) as IsoOfficeScene | null
      if (!sc) continue
      if (needFloors.has(f)) {
        this.floorUsedAt.set(f, now)
        continue
      }
      const isStale = now - (this.floorUsedAt.get(f) ?? 0) > FLOOR_SLEEP_MS
      if (f === mainFloor || f > floors || isStale) this.setAwake(sc, false)
    }
  }

  /**
   * 장면 재우기·깨우기를 바로 적용한다. scene.sleep()은 다음 프레임으로 미뤄져서 한 프레임에 두 번 부르면
   * "Cannot sleep non-running Scene" 경고가 나고, 루프가 자는 동안에는 적용도 안 된다
   */
  private setAwake(sc: IsoOfficeScene | undefined, isAwake: boolean) {
    if (!sc || !this.game) return
    const key = sc.scene.key
    if (isAwake && sc.sys.isSleeping()) this.game.scene.wake(key)
    if (!isAwake && sc.sys.isActive()) this.game.scene.sleep(key)
  }

  /** 고정 층 장면 (없으면 만들고, 자고 있으면 깨운다) */
  private floorScene(floor: number): IsoOfficeScene | undefined {
    const game = this.game
    if (!game) return undefined
    const key = floorKey(floor)
    let sc = game.scene.getScene(key) as IsoOfficeScene | null
    if (!sc) {
      sc = new IsoOfficeScene({ key, floor })
      game.scene.add(key, sc, true)
      this.floorUsedAt.set(floor, performance.now())
      return sc
    }
    this.setAwake(sc, true)
    this.floorUsedAt.set(floor, performance.now())
    return sc
  }

  private attachCamera(v: View, scene: IsoOfficeScene | null, isMeetingView = false) {
    // 장면이 막 만들어져 아직 create 전이면 다음 배정 때 단다
    if (!scene || !scene.cameras?.main) return this.dropCamera(v)
    const target = isMeetingView ? null : scene.actorTarget(v.staffId)
    if (v.sceneKey === scene.scene.key && v.cam && v.target === target && v.isMeetingView === isMeetingView) {
      if (isMeetingView) {
        const f = scene.meetingFocus
        v.cam.centerOn(f.x, f.y)
      }
      v.onActive(isLive(v))
      return
    }
    this.dropCamera(v)
    const cam = scene.cameras.add(0, 0, 1, 1, false, `mini-${v.slot}`)
    cam.setRoundPixels(true)
    cam.setBackgroundColor('#1b1e25')
    cam.ignore(scene.miniIgnore)
    // 회의는 여러 사람이 보이게 조금 멀리서
    cam.setZoom(MINI_ZOOM * (isMeetingView ? 0.75 : 1) * (v.isCompact ? COMPACT_ZOOM : 1) * this.slotPx.r)
    // 몸통 기준점은 발밑이라 화면 가운데가 상반신쯤 오게 위로 올린다 (followOffset은 빼는 값)
    if (target) cam.startFollow(target, true, 1, 1, 0, v.isCompact ? COMPACT_FOLLOW_UP : FOLLOW_UP)
    else if (isMeetingView) cam.centerOn(scene.meetingFocus.x, scene.meetingFocus.y)
    v.cam = cam
    v.sceneKey = scene.scene.key
    v.target = target
    v.isMeetingView = isMeetingView
    this.placeCamera(v)
    v.onActive(isLive(v))
  }

  private dropCamera(v: View) {
    if (v.cam) v.cam.scene?.cameras.remove(v.cam)
    v.cam = null
    v.sceneKey = null
    v.target = null
    v.isMeetingView = false
  }

  /** 카메라를 캔버스 아래 미니 뷰 칸에 둔다 */
  private placeCamera(v: View) {
    if (!v.cam) return
    const { w, h } = this.slotPx
    const { mapH } = this.canvasSize()
    v.cam.setViewport((v.slot % COLS) * w, mapH + Math.floor(v.slot / COLS) * h, this.viewW(v), h)
  }

  // ── 그리기 ────────────────────────────────────────────

  /** 미니 뷰는 창마다 정한 빈도로만 그린다 (지도가 60fps여도 미니 뷰 카메라는 그 사이 프레임에서 쉰다) */
  private beforeRender() {
    // 배율 질의 이벤트가 오지 않는 경우도 있다(개발자 도구 기기 흉내 등) — 그리기 전에 한 번 더 본다
    if (this.dpr !== this.appliedDpr) queueMicrotask(this.onDprChange)
    const now = performance.now()
    let isStale = false
    for (const v of this.views) {
      // 층을 바꾸면 지도 장면이 캐릭터를 지운다 — 지워진 캐릭터를 계속 따라가지 않게 바로 놓고 다시 배정한다
      if (v.target && !v.target.active) {
        v.cam?.stopFollow()
        v.target = null
        isStale = true
      }
      v.isDue = isLive(v) && now - v.lastCopy >= 1000 / this.fpsOf(v) - 2
      v.cam?.setVisible(v.isDue)
    }
    if (isStale) queueMicrotask(() => this.assign())
  }

  /** 방금 그린 미니 뷰 칸을 각 창으로 복사한다 (WebGL 화면이 지워지기 전, 같은 프레임 안에서) */
  private afterRender() {
    const due = [...this.views].filter((v) => v.isDue)
    if (due.length === 0 || !this.game) return
    const now = performance.now()
    const { w, h } = this.slotPx
    const { mapH } = this.canvasSize()
    // WebGL 화면에서 읽어 오기는 비싸다 — 미니 뷰 칸 전체를 한 번만 읽어 와 2D 캔버스에 두고, 창마다 거기서 복사한다
    const rows = Math.ceil(SLOTS / COLS)
    const staging = (this.staging ??= document.createElement('canvas'))
    if (staging.width !== COLS * w || staging.height !== rows * h) Object.assign(staging, { width: COLS * w, height: rows * h })
    const sctx = (this.stagingCtx ??= staging.getContext('2d'))
    if (!sctx) return
    sctx.clearRect(0, 0, staging.width, staging.height)
    sctx.drawImage(this.game.canvas, 0, mapH, staging.width, staging.height, 0, 0, staging.width, staging.height)
    for (const v of due) {
      const vw = this.viewW(v)
      v.ctx.drawImage(staging, (v.slot % COLS) * w, Math.floor(v.slot / COLS) * h, vw, h, 0, 0, vw, h)
      v.lastCopy = now
      v.isDue = false
    }
  }

  private staging: HTMLCanvasElement | null = null
  private stagingCtx: CanvasRenderingContext2D | null = null

  destroy() {
    if (this.assignTimer) clearInterval(this.assignTimer)
    this.mapObserver?.disconnect()
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = null
    this.game?.destroy(true)
    this.parking?.remove()
    this.game = null
    this.ready = null
    this.views.clear()
  }
}

export const officeStage = new OfficeStage()
const offWindowShown = window.officeWindow?.onShown((isShown) => officeStage.setWindowShown(isShown))
// 새로고침하면 지난 window:shown을 모르고 '보임'으로 시작한다 — 가려진 채 다시 불러와도 절전이 맞게 지금 값을 묻는다
void window.officeWindow
  ?.isShown?.()
  .then((isShown) => officeStage.setWindowShown(isShown))
  .catch(() => {})

// 개발 중 모듈을 바꿔 끼우면 이전 게임을 치운다
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    offWindowShown?.()
    officeStage.destroy()
  })
