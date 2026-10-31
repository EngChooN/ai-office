// 아이소메트릭 칸 사무실 장면 (docs/specs/office-iso-tech.md 1절·6절, 작업 B2).
// 사무실의 유일한 장면이다(예전 OfficeScene은 지웠다). 미니 뷰 계약 7종은 officeStage가 쓴다.
// 칸 계산은 shared/iso(순수 함수), 그림은 iso/isoArt(이디자 A3에서 합치는 중). 그림이 없는 품목은 임시 상자로 그린다.
// 가구는 shop.grid(B1, GridItem)에서 읽고, 의자가 모자라면 저장하지 않는 기본 자리(autoSeats)를 깐다.
import * as Phaser from 'phaser'
import { useOffice, viewLevelOf } from '@/store'
import { buildFloors, levelRowOf, officeOf } from '@shared/officeLevel'
import type { ShopState } from '@shared/economy'
import { isMeetingLive, type Meeting, type Settings, type Staff, type Team } from '@shared/types'
import { PIXEL, TILE_H, TILE_W, cellKey, isInside, miniFocus, toGrid, toWorld, type Cell, type Room } from '@shared/iso/grid'
import { cellsOf, FACE_STEP, facingOf, specOf, spotsOf, type GridItem, type Rot } from '@shared/iso/furniture'
import { fixedTiles, nextSeatCap, seatCapOf, type FixedTile, type FloorState } from '@shared/iso/place'
import { roomOf } from '@shared/iso/levels'
import { buildWalkMap, entranceOf, findPath, reachable, waitCellFor, type WalkMap } from '@shared/iso/path'
import { assignSeats, autoSeats, isAutoSeat, seatsOf, type Seat, type SeatMemory } from '@shared/iso/seats'
import { depthOrder, edgeBox, hidesMover, placeMovers, type IsoBox } from '@shared/iso/depth'
import { meetingLayoutOf, meetingSeatFor, type MeetingLayout } from '@shared/iso/meeting'
import { setAutoOff, useSeatStatus } from './iso/seatStatus'
import { ITEM_ACTIONS } from '@shared/iso/actions'
import { DESK_FLIP, deskCellOf, partitionJoins, HALL_SIT_Z, MEETING_CHAIR, artMeetingChair, isSplitChair, PODIUM_KEY, WALL_FADE_ALPHA, ZONE_FLOOR_KINDS, artHallRow, artMeetingRoom, artMeetingTable, artPodium, artPlanEdges, artZoneFloor, drawItem, drawPerson, isoLook, personSitDrop, drawPet, PET_HOMES, type PetKind, type PetPose, drawPersonShadow, drawPlanRoom, PERSON_DIRS, personDirOf, finishKey, finishLabel, finishOf, hallRowKey, meetingTableKey, planRoomTextureKey, withSurfaces, zoneFloorKey, type Finish, type MeetingTableKind, type ZoneFloor, seatHeight, toCanvas, type ArtBox, type ItemArt, type PersonDir, type PersonPose } from './iso/isoArt'
import { drawEmote, emoteKindOf, type EmoteKind } from './iso/emoteArt'
import { playLevelUpFx } from './iso/levelUpFx'
import { pinchStep } from './gestures'
import { isNightTime } from '@shared/dayNight'
import { DecorController, useDecor } from './iso/decor'
import { MotionPlayer } from './iso/motionPlayer'
import { workersOf } from '@shared/iso/propMotion'
import { endVisit, headcountOf, startVisit, takeCameBack, useFloorVisits, type Visit } from './iso/floorVisits'
import { roleLabel } from '@shared/roleLabel'
import { behindCell, besideCell, cancel as cancelIx, chatLine, CUP_SHARE_RATE, detectEvents, dropHelpFor, emptyDirector, fallbackOf, finish as finishIx, meetPair, offer, PARTNER_KINDS, pickHelper, startNext, stepsOf, type DelegateMemo, type Director, type Interaction, type InteractionKind, type IxAnim, type IxPlace, type IxSnap, type IxStep } from '@shared/iso/interactions'
import { FIGURE_ANIMS } from './iso/personArt'

/** 세계 여백 (화면 px). 위쪽은 뒷벽 위로 이름표·말풍선 자리 */
const MARGIN = 40
const TOP_SPACE = 60
/** 걷는 빠르기 (칸/초) — 예전 120px/s ≈ 3.5칸 */
const WALK_CELLS_PER_S = 3.5
const WALK_FRAME_S = 0.16
/** 반려동물: 직원보다 느리게 걷고, 쉬는 그림(숨쉬기·꼬리)은 이 간격으로 바꾼다 */
const PET_CELLS_PER_S = 1.5
const PET_FRAME_S = 0.22
const PET_REST_FRAME_S = 0.7
const PET_LIFT_PX_PER_S = 90
const PET_HOME_MS: [number, number] = [6000, 14000]
const PET_STAY_MS: [number, number] = [2500, 5000]
const PET_VISIT_MS: [number, number] = [6000, 10000]
const PET_VISIT_RATE = 0.4
/** 앉은 직원을 띄우는 기본 높이 (아트 px) — 품목에 sitZ가 없을 때 */
const SIT_Z = 9
/** 좌석 높이 위로 엉덩이가 놓이는 높이 (아트 px) — 앉은 그림은 엉덩이를 여기에 맞추고 다리는 그 아래로 내려온다 */
const SIT_HIP = 3
const SIT_DROP = Object.fromEntries(PERSON_DIRS.map((d) => [d, personSitDrop(d)])) as Record<PersonDir, number>
const TYPE_DROP = Object.fromEntries(PERSON_DIRS.map((d) => [d, personSitDrop(d, 'type')])) as Record<PersonDir, number>
const TICK_MS = 150
const CHAT_SHOW_MS = 2600
const STAY_MIN_MS = 9000
const STAY_MAX_MS = 22000
const EMOTE_MS = 1600
const BUBBLE_TEXT_MAX = 28
const NAME_MAX = 7
/** 머리와 이름표 사이 (px) */
const NAME_GAP = 2
const MAX_ZOOM = 1.25
const ZOOM_MIN_OF_FIT = 0.6
const ZOOM_MAX = 4
const WHEEL_ZOOM_SPEED = 0.01
/** 처음 열 때: 전체 보기 배율이 이보다 작으면(큰 방) 이 배율로 직원이 많은 구역을 가운데에 */
const FIRST_VIEW_ZOOM = 0.9
/** 지도 영역을 받은 뒤 이 시간 안의 fitView는 "지도를 여는 중" */
const OPENING_MS = 500
const TEXT_RESOLUTION = 3
const FONT = '-apple-system, "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", sans-serif'
const OUTLINE = 0x2a2230
/** 고정 깊이 (기술 설계 1-2절) */
/** 직원 그림자는 직원 깊이에서 이만큼 아래 */
const SHADOW_BELOW = 0.01
const DEPTH = { floor: -10_000, night: 50_000, levelUp: 55_000, label: 60_000, tooltip: 61_000 } as const
const STATUS_LABEL: Record<Staff['status'], string> = { working: '작업 중', waiting: '확인 필요', idle: '대기', offline: '퇴근', error: '오류' }
const EMOTES: Partial<Record<string, string>> = { 'working>idle': '✅', 'idle>working': '💡', '*>waiting': '🙋', '*>error': '💦' }
/** 쉬는 직원이 고르는 행동 비율 (칸 사무실에 맞게 줄인 값) */
const PLAN_WEIGHTS: ['desk' | 'fun' | 'rest' | 'office' | 'wander' | 'visit', number][] = [
  ['desk', 34],
  ['fun', 22],
  ['rest', 18],
  ['office', 10],
  ['wander', 16],
  ['visit', 6],
]
/** 상호작용 연출: 걸어가다 이만큼 지나도 못 닿으면 포기 · 쉬다 도착한 직원이 업무 수다를 꺼낼 비율 · 커피 심부름에 들르는 가구 */
const IX_WALK_GIVE_UP_MS = 15_000
const IX_CHAT_RATE = 0.5
const COFFEE_ITEMS = new Set(['lv-vending', 'prop-cooler', 'lv-kettle-shelf', 'lv-fridge'])
/** 연출 자세 한 프레임 (초) — 한 번만 하는 자세(건네기·하이파이브·컵 놓기)는 마지막 프레임에서 멈춘다 */
const ACT_FRAME_S: Partial<Record<IxAnim, number>> = { handOver: 0.4, highFive: 0.35, cupPut: 0.45, clap: 0.2, wave: 0.25 }
const ACT_LOOPS = new Set<IxAnim>(['clap', 'wave'])
/** 하이파이브: 가로로 붙은 두 칸에서 서로 이만큼(칸) 다가선다 — 발 사이 13 아트 px (한 칸 16) */
const HIGH_FIVE_NUDGE = 3 / 32
/** 다른 층에 놀러 가 머무는 시간 */
const VISIT_MIN_MS = 60_000
const VISIT_MAX_MS = 150_000
/** 놀러 간 층이 화면에 없으면 이만큼 더 지나서 돌려보낸다 (그 층 장면이 계단으로 걸어 나가게 할 몫) */
const VISIT_GRACE_MS = 30_000

/** 구역 가중치 (같은 종류 안에서 구역 안 자리를 이만큼 더 고른다) · 구역별 말풍선 (구역 id 앞부분 = 바닥 종류) */
const ZONE_WEIGHT = 2
const ZONE_SAY: Partial<Record<string, string[]>> = {
  kitchen: ['커피 한 잔 할까요?', '간식 챙겼어요', '물 한 잔…'],
  lounge: ['잠깐 쉬어요', '소파가 편해요'],
  game: ['한 판만 더!', '이번엔 제가 이겨요'],
  sleep: ['💤', '잠깐만 눈 좀…'],
  library: ['이 책 괜찮네요', '조용히 읽는 중'],
  fitness: ['스트레칭!', '운동 한 세트'],
  cafe: ['라떼 한 잔', '오늘의 커피는?'],
  cafeteria: ['점심 뭐 먹지?', '맛있다!'],
  sky: ['전망이 좋아요', '바람 쐬는 중'],
  ceo: ['대표님 자리 구경…'],
}

/** leave: 다른 층으로 가려고(또는 놀러 왔다 돌아가려고) 계단으로 걷는 중 */
type Mode = 'desk' | 'away' | 'meeting' | 'home' | 'wait' | 'leave'
type Category = 'fun' | 'rest' | 'office'

/** 쉬는 직원이 찾아가는 자리 (기술 설계 6-3절) — x·y 대신 칸, face는 rot */
interface Spot extends Cell {
  /** 이 자리가 딸린 가구 (소품 연출 C — 쓰는 동안 움직인다) */
  uid: string
  category: Category
  face: Rot
  isSitting: boolean
  /** 앉는 높이 (아트 px) */
  sitZ: number
  takenBy: string | null
  /** 이 자리가 든 구역 id (room.zones) — 구역 말풍선·가중치. 구역 밖이면 없음 */
  zone?: string
  emote?: string
  say?: string[]
}

/** 걸어가서 도착하면 할 일 */
interface Goal extends Cell {
  mode: Mode
  isSitting: boolean
  face: Rot | null
  /** 앉는 높이 (아트 px) — 앉을 때만 */
  sitZ?: number
  onArrive?: () => void
}

/** 가구(캣타워·방석)에 사는 동물. 위치는 화면에서만 계산한다 (저장 없음) */
interface Pet {
  uid: string
  kind: PetKind
  home: Cell
  homeZ: number
  img: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Image
  x: number
  y: number
  /** 발 높이 (아트 px) — 집 위에서만 집 높이 */
  z: number
  path: Cell[]
  /** rest: 집에서 쉼 · out: 나가서 걷는 중/머무는 중 · back: 돌아오는 중 */
  mode: 'rest' | 'out' | 'back'
  /** rest: 나갈 때(scene time) · out: 도착 뒤 머물 남은 ms */
  until: number
  flip: boolean
  t: number
}

interface Actor {
  staff: Staff
  /** 몸통. 위치 = 발밑 세계 px */
  container: Phaser.GameObjects.Container
  /** 미니 뷰가 따라가는 빈 점 — 방 안으로 당긴 발밑, 퇴근했으면 자기 자리 */
  focus: Phaser.GameObjects.Container
  body: Phaser.GameObjects.Image
  ring: Phaser.GameObjects.Ellipse
  mark: Phaser.GameObjects.Text
  shadow: Phaser.GameObjects.Image
  /** 이름표·말풍선·이모트 — 가구에 가리지 않게 맨 위 층 */
  label: Phaser.GameObjects.Container
  name: Phaser.GameObjects.Text
  bubble: Phaser.GameObjects.Container
  bubbleText: Phaser.GameObjects.Text
  bubbleBg: Phaser.GameObjects.Graphics
  emote: Phaser.GameObjects.Image
  /** 칸 좌표 (실수, 칸 중심 = gx + 0.5) */
  x: number
  y: number
  path: Cell[]
  goal: Goal | null
  facing: Rot
  walkT: number
  mode: Mode
  isSitting: boolean
  sitZ: number
  seat: Seat | null
  spot: Spot | null
  nextPlanAt: number
  chatUntil: number
  chatText: string
  prevStatus: Staff['status']
  /** 상호작용 연출 자세 (없으면 평소 자세). carry = 들고 걷는 것 */
  act: { anim: IxAnim; t: number; carry?: 'paper' | 'cup' } | null
}

/** 상호작용 연출 한 편의 진행 (shared/iso/interactions의 단계를 차례로) */
interface IxRun {
  ix: Interaction
  steps: IxStep[]
  /** 지금 단계 */
  i: number
  /** 자세 단계가 끝나는 때 · 걷기를 포기하는 때 (scene time) */
  until: number
  /** 하이파이브 상대 (함께 걸어와 자세를 잡는다) */
  partner?: Actor
  /** 상대가 다른 층이라 말풍선만 띄우는 연출 */
  isBubble?: boolean
}

/** 상호작용 이벤트를 뽑을 스냅샷 부분 */
const ixSnapOf = (st: ReturnType<typeof useOffice.getState>): IxSnap => ({ staff: st.staff, teams: st.teams, tasks: st.tasks, logs: st.liveLogs, companyLevel: st.company.level, selectedId: st.selectedId })

interface FurnPart {
  img: Phaser.GameObjects.Image
  box: ArtBox
  item: GridItem
  /** 직원 상점 책상·의자(gear)로 바꿔 그린 품목 id (없으면 item 그대로) */
  skin?: string
  /** 그릴 때의 바닥 (원점이 바뀌면 다시 그린다) */
  floorKey: string
  /** 뒤에 직원이 가려지면 반투명으로 하는 안쪽 벽 조각 (G3 A) */
  fade?: { edge: IsoBox }
}

/** 깊이 정렬 상자 (가구 부품·직원) */
type DepthBox = IsoBox & { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Container; isTallWall?: boolean }

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]
/** 구역 안 자리에 가중치를 주어 고른다 — 구역 밖 아무 의자보다 휴게실을 고르게 */
const pickZoned = (spots: Spot[]) => {
  let roll = Math.random() * spots.reduce((n, s) => n + (s.zone ? ZONE_WEIGHT : 1), 0)
  for (const s of spots) {
    roll -= s.zone ? ZONE_WEIGHT : 1
    if (roll <= 0) return s
  }
  return spots[spots.length - 1]
}
/** 그림 캔버스를 텍스처로. addCanvas(CanvasTexture)는 만들 때 getImageData로 픽셀을 다시 읽어 폰에서 느리다 — 그림은 고치지 않으니 보통 텍스처로 */
export { isoLook }
const addArt = (textures: Phaser.Textures.TextureManager, key: string, canvas: HTMLCanvasElement) => textures.addImage(key, canvas as unknown as HTMLImageElement)
type ArtMeta = ArtBox & { ax: number; ay: number }
const PERSON_FRAMES: [PersonPose, PersonDir][] = (['stand', 'sit', 'type', 'walk1', 'walk2'] as const).flatMap((p) => PERSON_DIRS.map((d) => [p, d] as [PersonPose, PersonDir]))
/** 한 프레임에 미리 그려 둘 직원 그림 수 (쓰는 자세는 바로, 나머지는 프레임 사이에) */
const WARM_PER_FRAME = 2
/** 안 쓰게 된 방 그림을 지우기 전 기다리는 시간 — 레벨업 연출(2.8초)이 예전 방 그림을 덮어 쓰는 동안은 둔다 */
const ROOM_TEX_KEEP_MS = 4000

const isBusy = (s: Staff) => s.status === 'working' || s.status === 'waiting' || s.status === 'error'
/** 소품 연출 D의 '일하는 중' — 결재를 기다리는 동안도 일하는 중으로 본다 (끝나면 끝남 효과) */
const isAtWork = (s: Staff) => s.status === 'working' || s.status === 'waiting'

export class IsoOfficeScene extends Phaser.Scene {
  /** 층을 고정한 장면 (미니 뷰 전용, officeStage가 만든다). null이면 지도 장면 — 보고 있는 층 */
  readonly fixedFloor: number | null
  private level = 1
  private companyLevel = 1
  private floor = 1
  private room: Room = { cols: 8, rows: 8 }
  private fixed: FixedTile[] = []
  /** (0,0) 칸 위 꼭짓점의 세계 px */
  private o = { x: 0, y: 0 }
  private world = { w: 1, h: 1 }
  private floorRt?: Phaser.GameObjects.RenderTexture
  private floorKey = ''
  /** 지금 구운 방 마감 (레벨 기본 + 상점 벽지·바닥재) */
  private finish: Finish = finishOf(1)
  /** 지금 구운 방 그림 텍스처 키 — 안 쓰게 된 방 그림을 지울 때 다른 장면이 쓰는지 본다 */
  roomTexKey = ''
  private overlay!: Phaser.GameObjects.Rectangle
  private tooltip!: Phaser.GameObjects.Container
  private tooltipText!: Phaser.GameObjects.Text
  private tooltipBg!: Phaser.GameObjects.Graphics
  private hoverId: string | null = null
  /** 이 층에 놓인 가구 (shop.grid + 기본 자리) */
  private items: GridItem[] = []
  private itemsKey = ''
  private parts = new Map<string, FurnPart[]>()
  /** 회의실 칸막이·계단 (바닥과 함께 다시 그린다) */
  private fixedParts: FurnPart[] = []
  private artMeta = new Map<string, ArtMeta>()
  /** 아직 그리지 않은 직원 자세 (프레임 사이에 조금씩) */
  private warmQueue: [number, PersonPose, PersonDir][] = []
  private walk!: WalkMap
  private seatOf = new Map<string, Seat>()
  /** 가구 uid → 앉은 직원이 쓰는 상점 책상·의자(gear) 품목 id */
  private skinOf = new Map<string, string>()
  /** 직전 자리 배정 (직원 id → 자리) — 의자를 옮기거나 더해도 다른 직원이 자리를 바꾸지 않게 */
  private seatMemory: SeatMemory = new Map()
  /** 층마다 직전 기본 자리 — 가구를 놓아도 남은 기본 자리는 그 자리에 */
  private autoByFloor = new Map<number, GridItem[]>()
  /** 자리 배정 입력(배치·인원·팀) — 그대로면 다시 계산하지 않는다 (직원 상태만 바뀐 경우) */
  private seatInputKey = ''
  private spots: Spot[] = []
  private hereMeetings: Meeting[] = []
  private awayMeeting = new Map<string, number>()
  /** 다른 층에서 놀러 와 이 층에 있는 직원 id */
  private guests = new Set<string>()
  /** 층마다 자리가 있는 직원 id (놀러 갈 층 고르기) */
  private homeIdsByFloor: string[][] = []
  private actors = new Map<string, Actor>()
  private pets = new Map<string, Pet>()
  private isFirstSync = true
  private isSyncPending = false
  private isUserCamera = false
  /** 장면 내보내기 중 (setExportMode) */
  private isRedacting = false
  private isCameraLocked = false
  private hasFirstView = false
  private panFrom: { x: number; y: number } | null = null
  private pinchFrom: [{ x: number; y: number }, { x: number; y: number }] | null = null
  private mapViewport: { w: number; h: number; isVisible: boolean } | null = null
  /** 마지막으로 지도 영역을 받은 때 (performance.now) — 지도를 여는 중인지 가린다 */
  private viewportAt = -Infinity
  private unsubscribe: (() => void) | null = null
  private frame = 0
  /** 꾸미기 컨트롤러 (지도 장면에만) */
  private decor: DecorController | null = null
  /** 소품 연출 (지도 장면에만 — 미니 뷰는 멈춘 그림) */
  private motion: MotionPlayer | null = null
  /** 꾸미기로 들고 있는 놓인 가구 — 그림을 숨긴다 */
  private hiddenUids: ReadonlySet<string> = new Set()
  /** 상호작용 연출 (지도 장면에만): 쿨다운·직원별 큐 · 도구 위임 기억 · 진행 중인 연출 */
  private director: Director = emptyDirector()
  private ixMemo: DelegateMemo = new Map()
  private ixRuns = new Map<string, IxRun>()

  constructor(opts: { key?: string; floor?: number } = {}) {
    super(opts.key ?? 'office')
    this.fixedFloor = opts.floor ?? null
  }

  create() {
    if (!this.textures.exists('iso-person-shadow')) addArt(this.textures, 'iso-person-shadow', drawPersonShadow())
    this.overlay = this.add.rectangle(0, 0, 10, 10, 0x0a1030, 0).setOrigin(0, 0).setDepth(DEPTH.night)
    this.tooltipBg = this.add.graphics()
    this.tooltipText = this.crisp(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#e8ecf4', lineSpacing: 3 }))
    this.tooltip = this.add.container(0, 0, [this.tooltipBg, this.tooltipText]).setDepth(DEPTH.tooltip).setVisible(false)
    this.time.addEvent({ delay: TICK_MS, loop: true, callback: () => this.tick() })
    this.scale.on('resize', () => {
      this.applyMapViewport()
      this.fitCamera()
    })
    if (this.fixedFloor === null) {
      // 꾸미기가 포인터를 먼저 받는다 (들고 있으면 화면을 옮기지 않게)
      this.decor = new DecorController(this)
      this.setupCameraControls()
      this.motion = new MotionPlayer(this, {
        parts: () => this.parts,
        isUsed: (uid) => this.isItemUsed(uid),
        isWorking: (item) => workersOf(item, [...this.actors.values()]).some((a) => isAtWork(a.staff)),
      })
    } else {
      this.input.enabled = false
      this.cameras.main.setVisible(false)
    }

    this.sync()
    const syncNow = () => {
      this.isSyncPending = false
      this.sync()
    }
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      if (this.isSyncPending) syncNow()
    })
    this.unsubscribe = useOffice.subscribe((st, prev) => {
      const isChanged =
        st.staff !== prev.staff ||
        st.teams !== prev.teams ||
        st.company !== prev.company ||
        st.meetings !== prev.meetings ||
        st.settings !== prev.settings ||
        st.shop !== prev.shop ||
        st.selectedId !== prev.selectedId ||
        st.previewLevel !== prev.previewLevel ||
        st.viewFloor !== prev.viewFloor
      if (!isChanged) return
      if (this.sys.isSleeping()) this.isSyncPending = true
      else syncNow()
    })
    const unsubscribeOffice = this.unsubscribe
    const unsubscribeVisits = useFloorVisits.subscribe(() => {
      if (this.sys.isSleeping()) this.isSyncPending = true
      else syncNow()
    })
    // 상호작용 연출: 위 sync(직원 상태 반영) 뒤에 스냅샷 변화를 비교한다. 지도를 안 보는 동안의 변화는 연출하지 않는다
    const unsubscribeIx =
      this.fixedFloor === null
        ? useOffice.subscribe((st, prev) => {
            if (st.tasks === prev.tasks && st.liveLogs === prev.liveLogs && st.staff === prev.staff && st.company === prev.company && st.selectedId === prev.selectedId) return
            if (this.sys.isSleeping() || st.settings.isWorkMode || !prev.staff.length) return
            this.feedEvents(ixSnapOf(prev), ixSnapOf(st))
          })
        : () => {}
    this.unsubscribe = () => {
      unsubscribeOffice()
      unsubscribeVisits()
      unsubscribeIx()
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.unsubscribe?.())
    // 캡처·시험 스크립트용: 주소 쿼리로 켰을 때만 지도 장면을 창에 걸어 둔다
    if (this.fixedFloor === null && new URLSearchParams(window.location.search).has('iso')) Object.assign(window, { __isoOffice: this, __officeStore: useOffice, __decorStore: useDecor })
  }

  // ── 상태 맞추기 ───────────────────────────────────────

  private sync() {
    const state = useOffice.getState()
    const { staff: allStaff, teams, company, meetings, settings } = state
    const isLevelUp = !this.isFirstSync && company.level > this.companyLevel
    this.companyLevel = company.level
    const prev = { level: this.level, room: this.room, finish: this.finish }
    this.level = viewLevelOf(state)
    // 층·직원 층 나누기(buildFloors·teamFloors)도 칸 크기와 같은 LEVEL_TABLE을 따른다
    const floors = buildFloors(this.level, allStaff, teams, meetings.filter(isMeetingLive))
    const here = floors[(this.fixedFloor ?? state.viewFloor) - 1] ?? floors[0]
    const isFloorChanged = here.floor !== this.floor
    this.floor = here.floor
    const prevMeetingIds = new Set(this.hereMeetings.map((m) => m.id))
    // 소품 연출 F: 같은 층에서 회의가 새로 시작됐다
    const isMeetingStarted = !this.isFirstSync && !isFloorChanged && here.meetingRoom.meetings.some((m) => !prevMeetingIds.has(m.id))
    this.hereMeetings = here.meetingRoom.meetings
    this.awayMeeting = new Map(floors.flatMap((f) => (f.floor === this.floor ? [] : f.meetingRoom.meetings.flatMap((m) => m.participantIds.map((id) => [id, f.floor] as const)))))
    this.room = roomOf(this.level, this.floor)
    this.fixed = fixedTiles(this.level, this.floor)
    // 같은 레벨·층에서 벽지·바닥재만 바꿨으면 다시 굽기만 하고 레벨업 연출·카메라 맞추기는 하지 않는다
    const isRoomChanged = this.bakeFloor(state.shop.surfaces) && !(this.level === prev.level && !isFloorChanged && !this.isFirstSync)

    // 자리는 이 층 직원 몫으로 정하고, 그리는 건 놀러 나간 사람을 빼고 놀러 온 사람을 더한다
    const { visits } = useFloorVisits.getState()
    this.homeIdsByFloor = floors.map((f) => f.staff.map((s) => s.id))
    this.guests = new Set(allStaff.filter((s) => visits[s.id]?.floor === this.floor).map((s) => s.id))
    const staff = here.staff
    this.layoutFurniture(state.shop, staff, teams, allStaff)
    this.overlay.setSize(this.world.w, this.world.h).setFillStyle(0x0a1030, isNightTime(settings) ? 0.2 : 0)

    const shown = [...staff.filter((s) => !visits[s.id]), ...allStaff.filter((s) => this.guests.has(s.id))]
    const seen = new Set<string>()
    for (const s of shown) {
      seen.add(s.id)
      const actor = this.actors.get(s.id) ?? this.createActor(s)
      const prev = actor.staff
      actor.staff = s
      // 자리 배정이 바뀌었으면(의자를 옮겼거나 팀이 바뀜) 앉아 있던 직원은 새 자리로 간다
      const seat = this.seatOf.get(s.id) ?? null
      const isSeatMoved = seat?.uid !== actor.seat?.uid || seat?.gx !== actor.seat?.gx || seat?.gy !== actor.seat?.gy
      actor.seat = seat
      if (isSeatMoved && (actor.mode === 'desk' || actor.mode === 'wait' || actor.goal?.mode === 'desk')) this.goDesk(actor, true)
      if (s.activity.startsWith('Skill') && prev.activity !== s.activity && !this.isFirstSync) this.showEmote(actor, '📘')
      if (actor.prevStatus !== s.status) {
        const icon = EMOTES[`${actor.prevStatus}>${s.status}`] ?? EMOTES[`*>${s.status}`]
        if (icon && !this.isFirstSync) this.showEmote(actor, icon)
        actor.prevStatus = s.status
      }
      const shortName = s.name.length > NAME_MAX ? `${s.name.slice(0, NAME_MAX)}…` : s.name
      actor.name.setText(teams.some((t) => t.leadId === s.id) ? `★ ${shortName}` : shortName)
      actor.name.setBackgroundColor(s.kind === 'hired' ? '#2a2230d0' : '#3a4a70d0')
      this.react(actor, prev)
    }
    for (const [id, a] of this.actors) {
      if (seen.has(id)) continue
      this.cancelRun(a)
      if (a.spot) a.spot.takenBy = null
      this.tweens.killTweensOf(a.emote)
      for (const o of [a.container, a.focus, a.shadow, a.label]) o.destroy()
      this.actors.delete(id)
    }
    // 보는 레벨이 올라 방이 바뀌면 레벨업 연출(칸 넓어짐·재질 바뀜), 아니면 화면만 한 번 환하게
    const isGrown = !this.isFirstSync && this.level > prev.level && !isFloorChanged && isRoomChanged
    if (!settings.isWorkMode && this.fixedFloor === null) {
      if (isGrown) this.playLevelUp(prev.level, prev.room, prev.finish)
      else if (isLevelUp) this.cameras.main.flash(600, 255, 240, 200)
    }
    // 보는 레벨이 바뀌면(레벨업·개발용 미리보기) 방 전체가 보이게 다시 맞춘다
    const isLevelChanged = !this.isFirstSync && this.level !== prev.level && isRoomChanged
    if (isLevelChanged && this.fixedFloor === null) {
      this.isUserCamera = false
      this.hasFirstView = true
    }
    // 층·방 크기가 바뀌면 다시 맞춘다 (사용자가 옮긴 카메라는 사무실 안으로만 당긴다)
    if (isFloorChanged || isRoomChanged || this.isFirstSync) this.fitCamera()
    this.isFirstSync = false
    this.motion?.sync(this.items)
    // 소품 연출 F: 레벨업(위 레벨업 연출과 같은 조건)·회의 시작 때 다 함께
    if ((!settings.isWorkMode && (isGrown || isLevelUp)) || isMeetingStarted) this.motion?.celebrate()
    this.decor?.refresh()
  }

  /** 레벨업 연출 (iso/levelUpFx). 재질이 바뀌었으면 예전 방 그림을 덮어 두고 빛 띠가 걷어 낸다 */
  private playLevelUp(fromLevel: number, from: Room, was: Finish) {
    const now = this.finish
    const oldKey = `iso-${planRoomTextureKey(from, was)}`
    const isFinishChanged = finishKey(was) !== finishKey(now) && this.textures.exists(oldKey)
    const lines: string[] = []
    if (from.cols !== this.room.cols || from.rows !== this.room.rows) lines.push(`사무실이 넓어졌어요 · ${from.cols}×${from.rows} → ${this.room.cols}×${this.room.rows}칸`)
    const floors = officeOf(this.level).floors
    if (floors > officeOf(fromLevel).floors) lines.push(`${floors}층이 생겼어요`)
    if (isFinishChanged && (was.floor !== now.floor || was.wall !== now.wall)) lines.push(`새 바닥·벽 — ${finishLabel(now).split(' · ').slice(1).join(' · ')}`)
    playLevelUpFx(this, {
      level: this.level,
      o: this.o,
      from,
      to: this.room,
      oldFloor: isFinishChanged ? { texKey: oldKey, anchor: (this.textures.get(oldKey).customData as { anchor: { x: number; y: number } }).anchor } : undefined,
      depth: DEPTH.levelUp,
      floorDepth: DEPTH.floor,
      lines,
    })
  }

  /** 바닥·벽·고정 칸을 한 장에 굽는다 — 레벨(칸 크기·재질 단계)·층·상점 벽지·바닥재가 바뀔 때만 (기술 설계 1-3절). 새로 구웠으면 true */
  private bakeFloor(surfaces: ShopState['surfaces'] | undefined) {
    const layout = meetingLayoutOf(this.level)
    const meeting = this.fixed.filter((t) => t.kind === 'meeting' || t.kind === 'meetingDoor')
    // 벽 있는 회의실만 뒤쪽 벽에 회의실 벽지 구간이 생긴다
    const meetingX0 = meeting.length && layout.isWalled ? Math.min(...meeting.map((t) => t.gx)) : null
    // 산 벽지·바닥재를 골랐으면 레벨 기본 재질 위에 덮는다 (고르지 않았으면 finishOf 그대로 — 처음 열 때 비용이 같다)
    const { finish, meetingFloor } = withSurfaces(finishOf(this.level), surfaces, meetingX0)
    const texKey = `iso-${planRoomTextureKey(this.room, finish)}`
    const key = `${texKey}:${meetingFloor ?? ''}:f${this.floor}:${this.fixed.length}`
    if (key === this.floorKey && this.floorRt) return false
    this.floorKey = key
    this.finish = finish
    const oldTexKey = this.roomTexKey
    this.roomTexKey = texKey
    if (oldTexKey && oldTexKey !== texKey) this.dropRoomTexture(oldTexKey)
    if (!this.textures.exists(texKey)) {
      const art = drawPlanRoom(this.room, finish)
      addArt(this.textures, texKey, art.canvas)
      this.textures.get(texKey).customData = { anchor: art.anchor }
    }
    const tex = this.textures.get(texKey)
    const anchor = (tex.customData as { anchor: { x: number; y: number } }).anchor
    const src = tex.getSourceImage() as HTMLCanvasElement
    this.world = { w: src.width + MARGIN * 2, h: src.height + MARGIN * 2 + TOP_SPACE }
    this.o = { x: MARGIN + anchor.x, y: MARGIN + TOP_SPACE + anchor.y }

    this.floorRt?.destroy()
    const rt = this.add.renderTexture(MARGIN, MARGIN + TOP_SPACE, src.width, src.height).setOrigin(0, 0).setDepth(DEPTH.floor)
    rt.stamp(texKey, undefined, 0, 0, { originX: 0, originY: 0 })
    // 고정 칸: 바닥에 붙는 것(구역 바닥·회의실 바닥·출입구)은 함께 굽고, 서 있는 것(유리 칸막이·계단·테이블·경계 벽)은 가구처럼 깊이 정렬한다
    const bake = (artKey: string, gx: number, gy: number) => {
      const m = this.artMeta.get(artKey)!
      const img = this.textures.get(artKey).getSourceImage() as HTMLCanvasElement
      const p = this.wpt(gx, gy)
      rt.stamp(artKey, undefined, p.x - MARGIN - m.ax * img.width, p.y - MARGIN - TOP_SPACE - m.ay * img.height, { originX: 0, originY: 0 })
    }
    for (const p of this.fixedParts) p.img.destroy()
    this.fixedParts = []
    this.isStaticDepthDirty = true
    const fixedItem = (itemId: string, gx: number, gy: number, rot: Rot = 0): GridItem => ({ uid: `fixed:${itemId}:${gx},${gy}`, itemId, floor: this.floor, gx, gy, rot })
    const pixels = (key: string, pc: { cv: Parameters<typeof toCanvas>[0]; o: [number, number]; box: ArtBox }) => this.artTexture(key, () => ({ canvas: toCanvas(pc.cv), anchor: { x: pc.o[0] * PIXEL, y: pc.o[1] * PIXEL }, box: pc.box }))
    // 구역 바닥 (벽 없는 구역 — 놓기 판정에는 쓰지 않는다)
    for (const z of this.room.zones ?? []) {
      const kind = z.id.split(':')[0] as ZoneFloor
      if (!ZONE_FLOOR_KINDS.includes(kind)) continue
      bake(pixels(zoneFloorKey(kind, z.w, z.d), artZoneFloor(kind, z.w, z.d)), z.gx, z.gy)
    }
    if (meeting.length) this.bakeMeeting(layout, meetingFloor, bake, fixedItem, pixels)
    const stairs = this.fixed.filter((t) => t.kind === 'stairs')
    if (stairs.length) {
      const top = officeOf(this.level).floors
      const id = levelRowOf(this.level).elevator ? 'fixed-elevator' : this.floor <= 1 ? 'fixed-stairs-up' : this.floor >= top ? 'fixed-stairs-down' : 'fixed-stairs-both'
      const it = fixedItem(id, Math.min(...stairs.map((t) => t.gx)), Math.min(...stairs.map((t) => t.gy)))
      this.fixedParts.push(this.placeArt(this.itemTexture(id, 0), it))
    }
    for (const t of this.fixed) if (t.kind === 'entrance') bake(this.itemTexture('fixed-entrance', 0), t.gx, t.gy)
    // 깎인 평면의 안쪽 벽·유리벽·문턱·난간 — 칸마다 따로 깊이 정렬한다 (안쪽 벽은 뒤에 직원이 가려지면 반투명)
    if (this.room.cells)
      for (const pc of artPlanEdges(this.room, finish)) {
        const part = this.placeArt(pixels(pc.key, pc), fixedItem(`plan-${pc.kind}`, pc.gx, pc.gy))
        if (pc.canFade) part.fade = { edge: edgeBox({ gx: pc.gx, gy: pc.gy, side: pc.side, kind: pc.kind }) }
        this.fixedParts.push(part)
      }
    rt.render()
    this.floorRt = rt
    return true
  }

  /** 회의실: 바닥(+유리 칸막이) · 테이블 · 의자 (강당은 단상·좌석 줄). 배치표 meeting.ts의 로컬 칸을 상자의 오른쪽 뒤로 옮겨 그린다 */
  private bakeMeeting(
    l: MeetingLayout,
    meetingFloor: Parameters<typeof artMeetingRoom>[3],
    bake: (artKey: string, gx: number, gy: number) => void,
    fixedItem: (itemId: string, gx: number, gy: number, rot?: Rot) => GridItem,
    pixels: (key: string, pc: { cv: Parameters<typeof toCanvas>[0]; o: [number, number]; box: ArtBox }) => string,
  ) {
    const x0 = Math.min(...this.fixed.filter((t) => t.kind === 'meeting' || t.kind === 'meetingDoor').map((t) => t.gx))
    const doorX = l.door ? l.door.gx : 0
    // 조각마다 따로 깊이 정렬 — 직원이 문으로 드나든다. 트인 자리(접이식·원목)는 바닥 카펫만
    artMeetingRoom(l.w, l.d, doorX, meetingFloor).forEach((pc, i) => {
      if (pc.kind !== 'floor' && !l.isWalled) return
      const k = pixels(`iso-meeting-${l.w}x${l.d}-${doorX}${pc.kind === 'floor' && meetingFloor ? `-${meetingFloor}` : ''}-${i}`, pc)
      if (pc.kind === 'floor') bake(k, x0, 0)
      else this.fixedParts.push(this.placeArt(k, fixedItem('meeting', x0, 0)))
    })
    const kind: MeetingTableKind = l.tier === 'wood' ? 'pine' : (l.tier as MeetingTableKind)
    if (l.table) {
      const t = this.placeArt(pixels(meetingTableKey(kind, l.table.w), artMeetingTable(kind, l.table.w)), fixedItem('meeting-table', x0 + l.table.gx, l.table.gy))
      this.fixedParts.push(t)
    }
    if (l.podium) this.fixedParts.push(this.placeArt(pixels(PODIUM_KEY, artPodium()), fixedItem('meeting-podium', x0 + l.podium.gx, l.podium.gy)))
    if (l.tier === 'hall') {
      // 좌석 줄 한 줄이 좌석·등받이 두 장 — 앉은 청중을 그 사이에 끼운다
      for (const r of l.rows)
        for (const role of ['seat', 'back'] as const) this.fixedParts.push(this.placeArt(pixels(hallRowKey(role, r.n), artHallRow(role, r.n)), fixedItem(`hall-row-${role}`, x0 + r.gx, r.gy)))
    } else {
      const chair = MEETING_CHAIR[kind]
      // 등받이가 카메라 쪽인 의자는 등받이를 낮춘 그림 — 등지고 앉은 직원의 머리·어깨가 보이게
      for (const s of l.seats)
        for (const role of ['seat', 'back'] as const)
          this.fixedParts.push(this.placeArt(pixels(`iso-meet-chair-${chair}-r${s.face}-${role}`, artMeetingChair(chair, s.face, role)), fixedItem(chair, x0 + s.gx, s.gy, s.face)))
    }
  }

  /** 안 쓰게 된 방 그림을 지운다 (벽지·바닥재를 바꿀 때마다 큰 텍스처가 쌓이지 않게). 다른 층 장면(미니 뷰)이 쓰고 있으면 둔다 */
  private dropRoomTexture(key: string) {
    this.time.delayedCall(ROOM_TEX_KEEP_MS, () => {
      const isInUse = this.game.scene.getScenes(false).some((sc) => sc instanceof IsoOfficeScene && sc.roomTexKey === key)
      if (!isInUse && this.textures.exists(key)) this.textures.remove(key)
    })
  }

  /** 이 층 가구를 맞추고 자리를 배정한다. 배치가 그대로면 그림은 두고 배정만 다시 */
  private layoutFurniture(shop: ShopState, staff: Staff[], teams: Team[], allStaff: Staff[]) {
    // 옮기기(B1) 전 예전 저장값에는 grid가 없을 수 있다
    const grid = shop.grid ?? []
    const floors = officeOf(this.level).floors
    // 층 수·바닥 칸을 넘는 가구는 그리지 않는다 (데이터는 그대로, 기술 설계 2-2절 — 개발용 낮은 레벨 미리보기)
    const placed = grid.filter((it) => it.floor === this.floor && it.floor <= floors && cellsOf(it).every((c) => isInside(this.room, c.gx, c.gy)))
    // 내보낸·지운 직원의 자리 기억은 뺀다 (다른 층 직원이어도)
    const alive = new Set(allStaff.map((s) => s.id))
    if ([...this.seatMemory.keys()].some((id) => !alive.has(id))) this.seatMemory = new Map([...this.seatMemory].filter(([id]) => alive.has(id)))
    // 직원 상태(작업 중·대기 등)만 바뀌었으면 배정을 다시 하지 않는다 (C2 측정: 폰에서 4~12ms)
    // 전부 치우기로 비운 사무실은 기본 자리를 깔지 않는다. 건물 어디든 책상·의자가 다시 놓이면 평소대로
    if (useSeatStatus.getState().isAutoOff && grid.some((it) => ['desk', 'chair'].includes(specOf(it.itemId).kind))) setAutoOff(false)
    const isAutoOff = useSeatStatus.getState().isAutoOff
    const seatInput = JSON.stringify([this.floorKey, this.floor, isAutoOff, placed, staff.map((s) => [s.id, s.teamId, s.hiredAt]), teams.map((t) => [t.id, t.kind, t.leadId]), shop.gear ?? {}])
    if (seatInput === this.seatInputKey) return
    this.seatInputKey = seatInput
    const state: FloorState = { level: this.level, floor: this.floor, items: placed, room: this.room, fixed: this.fixed }
    let plan = assignSeats(seatsOf(placed), staff, teams, this.seatMemory)
    let items = placed
    let auto: GridItem[] = []
    if (plan.standing.length && !isAutoOff) {
      // 의자가 모자라면 저장하지 않는 기본 자리를 깐다 (직전 기본 자리 먼저, 그다음 뒤쪽 줄부터)
      auto = autoSeats(state, plan.standing.length, this.autoByFloor.get(this.floor))
      items = [...placed, ...auto]
      plan = assignSeats(seatsOf(items), staff, teams, this.seatMemory)
    }
    this.autoByFloor.set(this.floor, auto)
    // 다른 층 직원의 기억은 남겨 둔다 (층을 오가도 자리 그대로)
    this.seatMemory = new Map([...this.seatMemory, ...plan.memory])
    this.seatOf = plan.seats
    this.skinOf = this.gearSkins(items, staff, shop.gear ?? {})
    if (this.fixedFloor === null) {
      const cap = seatCapOf(this.level, this.floor)
      useSeatStatus.setState({ short: staff.filter((s) => !plan.seats.has(s.id)).length, cap, next: nextSeatCap(this.level, this.floor) })
    }
    const key = JSON.stringify([this.floorKey, items, [...this.skinOf]])
    if (key === this.itemsKey) return
    this.itemsKey = key
    this.items = items
    // 그대로인 가구 그림은 둔다. 바닥을 새로 구웠으면(원점이 바뀜) 모두 다시 그린다
    const keep = new Set(items.map((it) => `${this.floorKey}|${it.uid}|${it.itemId}|${it.gx}|${it.gy}|${it.rot}|${this.skinOf.get(it.uid) ?? ''}`))
    for (const [id, parts] of this.parts) {
      const it = parts[0]?.item
      if (it && keep.has(`${parts[0].floorKey}|${id}|${it.itemId}|${it.gx}|${it.gy}|${it.rot}|${parts[0].skin ?? ''}`)) continue
      for (const p of parts) p.img.destroy()
      this.parts.delete(id)
    }
    for (const it of items) if (!this.parts.has(it.uid)) this.parts.set(it.uid, this.drawFurniture(it, this.skinOf.get(it.uid)))
    this.isStaticDepthDirty = true
    this.setItemHidden([...this.hiddenUids])
    this.walk = buildWalkMap(this.room, items, this.fixed)
    this.buildSpots()
    this.syncPets()
    // 배치가 바뀌면 걷던 길을 다시 찾는다 (막혔거나 목적지가 옮겨졌을 수 있다)
    for (const a of this.actors.values()) {
      a.seat = this.seatOf.get(a.staff.id) ?? null
      if (a.spot && !this.spots.includes(a.spot)) {
        const { gx, gy } = a.spot
        a.spot = this.spots.find((s) => s.gx === gx && s.gy === gy && s.takenBy === a.staff.id) ?? null
      }
      if (a.goal) this.walkTo(a, a.goal)
      else if (a.mode === 'desk') this.goDesk(a, !this.isFirstSync)
    }
  }

  // ── 반려동물 ──────────────────────────────────────────

  private petTexture(kind: PetKind, pose: PetPose) {
    const key = `iso-pet-${kind}-${pose}`
    if (!this.textures.exists(key)) addArt(this.textures, key, drawPet(kind, pose).canvas)
    return key
  }

  /** 이 층에 놓인 집(캣타워·방석)마다 동물 하나. 집이 없어지면(서랍·판매) 동물도 없앤다. 배치가 바뀌면 집으로 되돌린다 */
  private syncPets() {
    const homes = new Map(this.items.filter((it) => PET_HOMES[it.itemId]).map((it) => [it.uid, it]))
    for (const [uid, p] of this.pets) {
      if (homes.has(uid)) continue
      p.img.destroy()
      p.shadow.destroy()
      this.pets.delete(uid)
    }
    for (const [uid, it] of homes) {
      const { kind, z } = PET_HOMES[it.itemId]
      let p = this.pets.get(uid)
      if (!p) {
        const img = this.add.image(0, 0, this.petTexture(kind, 'rest0')).setOrigin(0.5, 13 / 16)
        const shadow = this.add.image(0, 0, 'iso-person-shadow').setScale(0.55)
        p = { uid, kind, home: { gx: it.gx, gy: it.gy }, homeZ: z, img, shadow, x: 0, y: 0, z, path: [], mode: 'rest', until: 0, flip: false, t: 0 }
        this.pets.set(uid, p)
      }
      p.home = { gx: it.gx, gy: it.gy }
      this.petRest(p)
    }
  }

  /** 집으로 데려가 쉬게 한다 */
  private petRest(p: Pet) {
    p.x = p.home.gx + 0.5
    p.y = p.home.gy + 0.5
    p.z = p.homeZ
    p.path = []
    p.mode = 'rest'
    p.until = this.time.now + rand(...PET_HOME_MS)
  }

  /** 집에서 나갈 때만 길을 찾는다 (프레임마다 찾지 않는다). 갈 데가 없으면 더 쉰다 */
  private petPlan(p: Pet) {
    const walkable = (c: Cell) => isInside(this.room, c.gx, c.gy) && !this.walk.blocked[cellKey(this.room, c.gx, c.gy)]
    let path: Cell[] | null = null
    let stay = 0
    if (Math.random() < PET_VISIT_RATE) {
      // 자리에서 일하는 직원 곁: 그 자리 둘레의 지나갈 수 있는 칸
      const workers = [...this.actors.values()].filter((a) => a.mode === 'desk' && a.seat && !a.goal && !a.path.length && a.container.visible)
      const s = workers.length ? pick(workers).seat : null
      if (s) {
        const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => ({ gx: s.gx + dx, gy: s.gy + dy })).filter(walkable)
        for (const c of around.sort(() => Math.random() - 0.5)) {
          const found = findPath(this.walk, p.home, c)
          if (found?.length) {
            path = found
            stay = rand(...PET_VISIT_MS)
            break
          }
        }
      }
    }
    if (!path) {
      const c = this.randomFreeCell()
      const found = c ? findPath(this.walk, p.home, c) : null
      if (found?.length) {
        path = found
        stay = rand(...PET_STAY_MS)
      }
    }
    if (!path) {
      p.until = this.time.now + rand(...PET_HOME_MS)
      return
    }
    p.mode = 'out'
    p.path = path
    p.until = stay
  }

  private petStep(p: Pet, dt: number) {
    if (p.mode === 'rest') {
      p.t += dt
      if (this.time.now >= p.until && this.walk) this.petPlan(p)
      return
    }
    const next = p.path[0]
    if (!next) {
      if (p.mode === 'back') return this.petRest(p)
      // 도착: 잠깐 머문 뒤 집으로
      p.t += dt
      p.until -= dt * 1000
      if (p.until <= 0) {
        p.path = findPath(this.walk, { gx: Math.floor(p.x), gy: Math.floor(p.y) }, p.home) ?? []
        p.mode = 'back'
        if (!p.path.length) this.petRest(p)
      }
      return
    }
    const dx = next.gx + 0.5 - p.x
    const dy = next.gy + 0.5 - p.y
    const dist = Math.hypot(dx, dy)
    const move = PET_CELLS_PER_S * dt
    if (Math.abs(dx - dy) > 1e-3) p.flip = dx - dy > 0
    p.t += dt
    if (dist <= move) {
      p.x = next.gx + 0.5
      p.y = next.gy + 0.5
      p.path.shift()
    } else {
      p.x += (dx / dist) * move
      p.y += (dy / dist) * move
    }
    // 집 칸에 있을 때만 집 높이 (캣타워에서 내려오고 올라간다)
    const onHome = Math.floor(p.x) === p.home.gx && Math.floor(p.y) === p.home.gy
    const targetZ = onHome ? p.homeZ : 0
    p.z += Math.sign(targetZ - p.z) * Math.min(Math.abs(targetZ - p.z), PET_LIFT_PX_PER_S * dt)
  }

  private updatePets(dt: number) {
    if (!this.pets.size) return
    // 꾸미기 모드에서는 집에서 멈춘다 (가구를 옮기는 데 방해되지 않게)
    const isDecorating = useOffice.getState().isDecorating
    for (const p of this.pets.values()) {
      if (isDecorating) {
        if (p.mode !== 'rest' || p.path.length || p.z !== p.homeZ) this.petRest(p)
        p.until = this.time.now + rand(...PET_HOME_MS)
      } else this.petStep(p, dt)
      const walking = p.path.length > 0
      const frame = Math.floor(p.t / (walking ? PET_FRAME_S : PET_REST_FRAME_S)) % 2
      const pose = `${walking ? 'walk' : 'rest'}${frame}` as PetPose
      const foot = this.wpt(p.x, p.y, p.z)
      const visible = !this.hiddenUids.has(p.uid)
      p.img.setTexture(this.petTexture(p.kind, pose)).setFlipX(p.flip).setPosition(foot.x, foot.y).setVisible(visible)
      const ground = this.wpt(p.x, p.y)
      p.shadow.setPosition(ground.x, ground.y).setVisible(visible && p.z < 1)
    }
  }

  /** 쉬는 자리: 놓인 가구의 spots (의자는 근무 자리라 뺀다) */
  private buildSpots() {
    const taken = new Map(this.spots.filter((s) => s.takenBy).map((s) => [`${s.gx},${s.gy}`, s.takenBy]))
    this.spots = []
    for (const it of this.items) {
      const spec = specOf(it.itemId)
      if (spec.kind === 'chair') continue
      for (const s of spotsOf(it)) {
        const act = s.action ? ITEM_ACTIONS[s.action] : undefined
        const category: Category = s.action ? 'fun' : spec.kind === 'seat' ? 'rest' : 'office'
        const zone = (this.room.zones ?? []).find((z) => s.gx >= z.gx && s.gx < z.gx + z.w && s.gy >= z.gy && s.gy < z.gy + z.d)?.id
        this.spots.push({ uid: it.uid, gx: s.gx, gy: s.gy, face: s.face, category, zone, isSitting: s.use === 'sit', sitZ: seatHeight(it.itemId) ?? SIT_Z, takenBy: taken.get(`${s.gx},${s.gy}`) ?? null, emote: act?.emote, say: act?.say })
      }
    }
  }

  // ── 그리기 ────────────────────────────────────────────

  /** 칸 좌표 → 세계 px (z는 아트 px) */
  private wpt(gx: number, gy: number, z = 0) {
    return toWorld(this.o, gx, gy, z * PIXEL)
  }

  /** 그림 텍스처를 한 번만 만든다. 상자 정보는 텍스처에 붙여 두어, 다른 층 장면(미니 뷰)은 그림을 다시 그리지 않고 읽기만 한다 */
  private artTexture(key: string, make: () => Pick<ItemArt, 'canvas' | 'anchor' | 'box'>) {
    if (this.artMeta.has(key)) return key
    let meta = this.textures.exists(key) ? (this.textures.get(key).customData as { art?: ArtMeta }).art : undefined
    if (!meta) {
      const art = make()
      if (!this.textures.exists(key)) addArt(this.textures, key, art.canvas)
      meta = { ...art.box, ax: art.anchor.x / art.canvas.width, ay: art.anchor.y / art.canvas.height }
      this.textures.get(key).customData = { ...this.textures.get(key).customData, art: meta }
    }
    this.artMeta.set(key, meta)
    return key
  }

  /** 품목 그림 (그림이 없는 품목은 isoArt가 임시 상자로 그린다) */
  private itemTexture(itemId: string, r: Rot, role?: 'seat' | 'back') {
    return this.artTexture(`iso-item-${itemId}-r${r}${role ? `-${role}` : ''}`, () => drawItem(itemId, r, role, false))
  }

  private placeArt(key: string, item: GridItem): FurnPart {
    const m = this.artMeta.get(key)!
    const p = this.wpt(item.gx, item.gy)
    const img = this.add.image(p.x, p.y, key).setOrigin(m.ax, m.ay)
    return { img, box: { x: m.x, y: m.y, w: m.w, d: m.d, z: m.z, h: m.h }, item, floorKey: this.floorKey }
  }

  /** 앉은 직원이 상점에서 산 책상·의자를 배정받았으면 그 의자·마주 보는 책상을 그 그림으로 바꾼다 (한 가구에 여럿이면 먼저 배정된 직원) */
  private gearSkins(items: GridItem[], staff: Staff[], gear: ShopState['gear']) {
    const skins = new Map<string, string>()
    for (const s of staff) {
      const g = gear[s.id]
      const seat = this.seatOf.get(s.id)
      if (!g || !seat) continue
      if (g.chair && !skins.has(seat.uid) && items.some((i) => i.uid === seat.uid)) skins.set(seat.uid, g.chair)
      if (g.desk) {
        const [dx, dy] = FACE_STEP[seat.face]
        const desk = items.find((i) => specOf(i.itemId).kind === 'desk' && cellsOf(i).some((c) => c.gx === seat.gx + dx && c.gy === seat.gy + dy))
        if (desk && !skins.has(desk.uid)) skins.set(desk.uid, g.desk)
      }
    }
    // 의자가 책상 오른쪽(로컬 x 1) 칸에만 붙어 있으면 책상을 뒤집어 그린다 — 모니터·키보드가 늘 앉은 직원 앞에 온다
    const sides = new Map<string, Set<number>>()
    for (const seat of seatsOf(items)) {
      if (!seat.hasDesk) continue
      const [dx, dy] = FACE_STEP[seat.face]
      const desk = items.find((i) => specOf(i.itemId).kind === 'desk' && cellsOf(i).some((c) => c.gx === seat.gx + dx && c.gy === seat.gy + dy))
      if (!desk) continue
      const set = sides.get(desk.uid) ?? new Set<number>()
      set.add(deskCellOf(desk.itemId, desk.rot, desk.gx, desk.gy, seat.gx + dx, seat.gy + dy))
      sides.set(desk.uid, set)
    }
    for (const it of items) {
      const set = sides.get(it.uid)
      if (set && !set.has(0) && set.has(1)) skins.set(it.uid, `${skins.get(it.uid) ?? it.itemId}${DESK_FLIP}`)
    }
    // 붙어 있는 파티션·가벽은 한 판으로 이어 그린다 (일자 → 이어 붙임, 직각 → ㄱ·ㅜ 모서리)
    for (const [uid, join] of partitionJoins(items)) skins.set(uid, `${items.find((i) => i.uid === uid)!.itemId}${join}`)
    return skins
  }

  private drawFurniture(item: GridItem, skin?: string): FurnPart[] {
    // 의자는 좌석·등받이 두 장 — 앉은 직원을 그 사이에 끼운다 (등받이 없는 의자는 한 장)
    const roles: ('seat' | 'back' | undefined)[] = isSplitChair(item.itemId) ? ['seat', 'back'] : [undefined]
    return roles.flatMap((role) => {
      const key = this.itemTexture(skin ?? item.itemId, item.rot, role)
      return role === 'back' && !this.artMeta.get(key)!.h ? [] : [{ ...this.placeArt(key, item), skin }]
    })
  }

  private crisp<T extends Phaser.GameObjects.Text>(t: T): T {
    t.setResolution(TEXT_RESOLUTION)
    t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
    return t
  }

  // ── 직원 ──────────────────────────────────────────────

  /** 직원 그림 한 장 — 쓰는 자세만 바로 그리고, 처음 본 직원의 나머지 자세는 프레임 사이에 그린다 (폰 첫 화면 멈춤) */
  private personTexture(avatar: number, pose: PersonPose, dir: PersonDir) {
    const key = `iso-${pose}-${avatar}-${dir}`
    if (this.textures.exists(key)) return key
    if (!this.textures.exists(`iso-stand-${avatar}-front`) && !this.warmQueue.some((w) => w[0] === avatar)) this.warmQueue.push(...PERSON_FRAMES.map(([p, d]) => [avatar, p, d] as [number, PersonPose, PersonDir]))
    addArt(this.textures, key, drawPerson(pose, dir, isoLook(avatar)))
    return key
  }

  private warmPeople() {
    for (let n = 0; n < WARM_PER_FRAME && this.warmQueue.length; ) {
      const [avatar, pose, dir] = this.warmQueue.shift()!
      if (this.textures.exists(`iso-${pose}-${avatar}-${dir}`)) continue
      this.personTexture(avatar, pose, dir)
      n++
    }
  }

  private createActor(s: Staff): Actor {
    const body = this.add.image(0, 0, this.personTexture(s.avatar, 'stand', 'front')).setOrigin(0.5, 1)
    const ring = this.add.ellipse(0, 0, 40, 18).setStrokeStyle(2, 0xe8925a).setFillStyle(0xe8925a, 0.2)
    const mark = this.crisp(this.add.text(-20, -56, '!', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#2a2230', backgroundColor: '#f0c541', padding: { x: 4, y: 0 } }).setOrigin(0.5, 1))
    const container = this.add.container(0, 0, [ring, body, mark])
    const shadow = this.add.image(0, 0, 'iso-person-shadow')
    const name = this.crisp(this.add.text(0, -56, s.name, { fontFamily: FONT, fontSize: '10px', color: '#ffffff', backgroundColor: '#2a2230d0', padding: { x: 4, y: 1 } }).setOrigin(0.5, 1))
    const bubbleText = this.crisp(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '10px', color: '#2a2230', wordWrap: { width: 140 } }).setOrigin(0.5, 1))
    const bubbleBg = this.add.graphics()
    const bubble = this.add.container(0, -60, [bubbleBg, bubbleText])
    const emote = this.add.image(0, -58, this.emoteTexture('happy')).setOrigin(0.5, 1).setAlpha(0)
    const label = this.add.container(0, 0, [name, bubble, emote]).setDepth(DEPTH.label)
    container.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(-16, -54, 32, 58), hitAreaCallback: Phaser.Geom.Rectangle.Contains })
    container.on('pointerdown', () => {
      // 꾸미기 중엔 가구 선택이 우선 — 직원 패널이 열리면 선택창이 밀려 엉뚱한 버튼을 누르게 된다
      const st = useOffice.getState()
      if (!st.isDecorating) st.select(s.id)
    })
    container.on('pointerover', () => (this.hoverId = s.id))
    container.on('pointerout', () => {
      if (this.hoverId === s.id) this.hoverId = null
    })
    const a: Actor = {
      staff: s,
      container,
      focus: this.add.container(0, 0),
      body,
      ring,
      mark,
      shadow,
      label,
      name,
      bubble,
      bubbleText,
      bubbleBg,
      emote,
      x: 0,
      y: 0,
      path: [],
      goal: null,
      facing: 0,
      walkT: 0,
      // 아직 아무 데도 없음 — 아래에서 자리·쉬는 곳·회의실에 둔다
      mode: 'away',
      isSitting: false,
      sitZ: SIT_Z,
      seat: this.seatOf.get(s.id) ?? null,
      spot: null,
      nextPlanAt: 0,
      chatUntil: 0,
      chatText: '',
      prevStatus: s.status,
      act: null,
    }
    this.actors.set(s.id, a)
    const isGuest = this.guests.has(s.id)
    if (isGuest || takeCameBack(s.id)) {
      // 다른 층에서 왔다(놀러 왔거나 돌아왔다) — 계단에서 나타난다
      const at = this.stairsCell(this.entrance()) ?? this.entrance()
      this.setCell(a, at.gx, at.gy)
      if (isGuest) this.plan(a, true)
      else this.goDesk(a, true)
    } else if (this.isFirstSync || s.kind === 'external') {
      // 처음 그릴 때는 걷지 않고 하던 일 자리에 바로 둔다
      if (s.meetingId && this.meetingOf(s.id)) this.goMeeting(a, false)
      else if (isBusy(s) || !this.plan(a, false)) this.goDesk(a, false)
    } else {
      // 새로 고용된 직원은 출입구로 들어와 자리로 간다
      const door = this.entrance()
      this.setCell(a, door.gx, door.gy)
      this.goDesk(a, true)
    }
    this.draw(a)
    return a
  }

  private entrance(): Cell {
    return entranceOf(this.room, this.fixed)
  }

  private setCell(a: Actor, gx: number, gy: number) {
    a.x = gx + 0.5
    a.y = gy + 0.5
    a.path = []
  }

  private meetingOf(staffId: string) {
    return this.hereMeetings.find((m) => m.participantIds.includes(staffId))
  }

  /** 상태 변화: 일이 오면 자리로, 회의는 회의실로, 일이 끝나면 잠시 뒤 쉬러 간다 */
  private react(a: Actor, prev: Staff) {
    const s = a.staff
    // 상호작용 연출 중 새 일·회의가 오면 바로 끊고 아래 규칙대로 자리로 간다. 그 밖에는 연출을 마칠 때까지 둔다
    const isNewWork = (prev.status !== 'working' && s.status === 'working') || (Boolean(s.meetingId) && !prev.meetingId)
    // 막힘(결재 대기·오류)에서 풀렸으면 이 사람을 도우러 가려던 대기 연출을 바로 버린다
    const isStuckStatus = (st: Staff['status']) => st === 'waiting' || st === 'error'
    if (isStuckStatus(prev.status) && !isStuckStatus(s.status)) this.director = dropHelpFor(this.director, s.id)
    // 연출로 걷던 중이면 남은 경로를 버리고 자리(회의실)로 다시 보낸다 — 책상에서 막 출발해 mode가 아직 'desk'여도
    if (isNewWork && this.cancelRun(a) && (a.goal || a.mode !== 'desk') && !this.guests.has(s.id)) this.goBack(a)
    // 놀러 온 직원은 일·회의가 생기면 계단으로 나가 자기 층으로 돌아간다
    if (this.guests.has(s.id)) {
      if (s.status !== 'idle' || s.meetingId) this.leaveFloor(a)
      return
    }
    if (this.isInvolved(s.id)) return
    if (s.meetingId && this.meetingOf(s.id)) {
      if (a.mode !== 'meeting' && a.goal?.mode !== 'meeting') this.goMeeting(a, true)
      return
    }
    if (a.mode === 'meeting' || a.goal?.mode === 'meeting') {
      a.nextPlanAt = 0
      if (isBusy(s)) this.goDesk(a, true)
      else this.plan(a, true)
      return
    }
    if (isBusy(s) && a.mode === 'home') return this.comeBack(a)
    if (isBusy(s)) {
      if (a.mode !== 'desk' && a.goal?.mode !== 'desk') this.goDesk(a, true)
      return
    }
    if (isBusy(prev) && a.mode === 'desk') a.nextPlanAt = this.time.now + 2600 + 1500
  }

  /** 의자 품목마다 앉는 높이가 다르다 (바 의자 등) */
  private sitZOf(uid: string) {
    const it = this.items.find((x) => x.uid === uid)
    return (it && seatHeight(this.skinOf.get(uid) ?? it.itemId)) ?? SIT_Z
  }

  /** 자기 자리(배정된 의자)로. 자리가 없으면 출입구 옆에서 기다린다 */
  private goDesk(a: Actor, isWalking: boolean) {
    this.release(a)
    const seat = a.seat
    if (!seat) {
      // 자리가 없으면 쉬는 자리(소파 등)에 앉아 노트북으로 일한다 — 쉬러 올 몫 1~2자리만 남기고 (3-5절 C안). 없으면 출입구 옆에서 기다린다
      const spot = this.tempSpot()
      if (spot) {
        spot.takenBy = a.staff.id
        a.spot = spot
        return this.moveTo(a, { gx: spot.gx, gy: spot.gy, mode: 'desk', isSitting: spot.isSitting, sitZ: spot.sitZ, face: spot.face }, isWalking)
      }
      const near = this.waitCell(a) ?? this.entrance()
      return this.moveTo(a, { ...near, mode: 'wait', isSitting: false, face: 2 }, isWalking)
    }
    this.moveTo(a, { gx: seat.gx, gy: seat.gy, mode: 'desk', isSitting: true, sitZ: this.sitZOf(seat.uid), face: seat.face }, isWalking)
  }

  /** 자리 없는 직원이 임시로 앉을 쉬는 자리. 쉬러 올 직원 몫으로 1~2자리(쉬는 자리가 6개 이상이면 2자리)만 남기고 모두 쓴다. 다 찼으면 null */
  private tempSpot(): Spot | null {
    const rest = this.spots.filter((s) => s.category === 'rest')
    const used = [...this.actors.values()].filter((x) => !x.seat && x.spot && (x.mode === 'desk' || x.goal?.mode === 'desk')).length
    if (used >= rest.length - (rest.length >= 6 ? 2 : 1)) return null
    const free = rest.filter((s) => !s.takenBy)
    return free.length ? pick(free) : null
  }

  /** 회의실 의자에 참석 순서대로 앉는다 (participantIds[i] → 배치표 seats[i] — 순서로 정하니 회의 중에 자리가 바뀌지 않는다). 의자가 모자라면 회의실 빈 칸에 선다 */
  private goMeeting(a: Actor, isWalking: boolean) {
    this.release(a)
    const l = meetingLayoutOf(this.level)
    const cells = this.fixed.filter((t) => t.kind === 'meeting' || t.kind === 'meetingDoor')
    const x0 = Math.min(...cells.map((t) => t.gx))
    const order = this.meetingOf(a.staff.id)?.participantIds.indexOf(a.staff.id) ?? -1
    const isFree = (gx: number, gy: number) => !this.walk?.blocked[cellKey(this.room, gx, gy)]
    const seat = meetingSeatFor(l, x0, order, isFree)
    if (seat) {
      const chair = l.tier === 'hall' ? null : MEETING_CHAIR[l.tier === 'wood' ? 'pine' : (l.tier as MeetingTableKind)]
      const sitZ = chair ? (seatHeight(chair) ?? SIT_Z) : HALL_SIT_Z
      return this.moveTo(a, { gx: seat.gx, gy: seat.gy, mode: 'meeting', isSitting: true, sitZ, face: seat.face }, isWalking)
    }
    const taken = new Set([...this.actors.values()].filter((x) => x !== a && (x.mode === 'meeting' || x.goal?.mode === 'meeting')).map((x) => (x.goal ? `${x.goal.gx},${x.goal.gy}` : `${Math.floor(x.x)},${Math.floor(x.y)}`)))
    const solid = new Set(l.solid.map((c) => `${x0 + c.gx},${c.gy}`))
    const seats = new Set(l.seats.map((c) => `${x0 + c.gx},${c.gy}`))
    const cell = cells.find((c) => c.kind === 'meeting' && isFree(c.gx, c.gy) && !solid.has(`${c.gx},${c.gy}`) && !seats.has(`${c.gx},${c.gy}`) && !taken.has(`${c.gx},${c.gy}`))
    if (!cell) return
    const mid = this.meetingCenter()
    this.moveTo(a, { gx: cell.gx, gy: cell.gy, mode: 'meeting', isSitting: false, face: facingOf(mid.gx - (cell.gx + 0.5), mid.gy - (cell.gy + 0.5)) }, isWalking)
  }

  /** 회의실 가운데 (강당은 단상 쪽으로 반 칸 당긴다 — 배치표 focus) */
  private meetingCenter() {
    const cells = this.fixed.filter((t) => t.kind === 'meeting' || t.kind === 'meetingDoor')
    if (!cells.length) return { gx: this.room.cols / 2, gy: this.room.rows / 2 }
    const f = meetingLayoutOf(this.level).focus
    return { gx: Math.min(...cells.map((c) => c.gx)) + f.x, gy: f.y }
  }

  /** 쉬는 직원의 다음 행동. 갈 데가 없으면 false */
  private plan(a: Actor, isWalking: boolean) {
    a.nextPlanAt = this.time.now + rand(STAY_MIN_MS, STAY_MAX_MS)
    const total = PLAN_WEIGHTS.reduce((n, [, w]) => n + w, 0)
    let roll = Math.random() * total
    let choice = PLAN_WEIGHTS[0][0]
    for (const [c, w] of PLAN_WEIGHTS) {
      roll -= w
      if (roll <= 0) {
        choice = c
        break
      }
    }
    const isGuest = this.guests.has(a.staff.id)
    if (choice === 'visit') {
      if (!isGuest && isWalking && this.goVisit(a)) return true
      choice = 'wander'
    }
    // 놀러 온 층에는 자기 자리가 없다
    if (choice === 'desk' && isGuest) choice = 'wander'
    if (choice !== 'desk' && choice !== 'wander') {
      const free = this.spots.filter((s) => s.category === choice && !s.takenBy)
      const spot = free.length ? pickZoned(free) : undefined
      if (spot) {
        this.release(a)
        spot.takenBy = a.staff.id
        a.spot = spot
        this.moveTo(a, { gx: spot.gx, gy: spot.gy, mode: 'away', isSitting: spot.isSitting, sitZ: spot.sitZ, face: spot.face, onArrive: () => this.arriveAt(a, spot) }, isWalking)
        return true
      }
      // 그런 가구가 없으면 (빈 사무실) 바닥을 거닌다
      choice = 'wander'
    }
    if (choice === 'wander') {
      const cell = this.randomFreeCell()
      if (cell) {
        this.release(a)
        this.moveTo(a, { ...cell, mode: 'away', isSitting: false, face: null }, isWalking)
        return true
      }
    }
    if (isGuest) return true
    if (a.mode !== 'desk' || a.goal) this.goDesk(a, isWalking)
    return Boolean(a.seat)
  }

  /** 계단·엘리베이터 앞 칸 (from에서 닿는 칸 중 가장 가까운). 층이 하나뿐이면 null */
  private stairsCell(from: Cell): Cell | null {
    const stairs = this.fixed.filter((t) => t.kind === 'stairs')
    if (!stairs.length || !this.walk) return null
    return this.nearestReachable(from, { gx: Math.max(...stairs.map((t) => t.gx)), gy: Math.max(...stairs.map((t) => t.gy)) })
  }

  /** 다른 층에 놀러 간다: 계단까지 걸어가 사라진다. 사람이 가장 적은 층으로 (같으면 아무 데나) */
  private goVisit(a: Actor) {
    if (a.staff.status !== 'idle' || a.staff.meetingId) return false
    const { visits } = useFloorVisits.getState()
    const others = this.homeIdsByFloor.map((ids, i) => ({ floor: i + 1, n: headcountOf(i + 1, ids, visits) })).filter((f) => f.floor !== this.floor)
    if (!others.length) return false
    const least = Math.min(...others.map((f) => f.n))
    const to = pick(others.filter((f) => f.n === least)).floor
    return this.leaveFloor(a, () => {
      if (a.staff.status === 'idle' && !a.staff.meetingId) startVisit(a.staff.id, to, Date.now() + rand(VISIT_MIN_MS, VISIT_MAX_MS))
      else this.goDesk(a, true)
    })
  }

  /** 화면에 없는 층에 놀러 간 직원 정리 (지도 장면만): 일·회의가 생겼거나 시간이 지났거나 그 층이 없어졌으면 바로 돌려보낸다 */
  private settleVisits(allStaff: Staff[], visits: Record<string, Visit>) {
    for (const [id, v] of Object.entries(visits)) {
      if (v.floor === this.floor) continue
      const s = allStaff.find((x) => x.id === id)
      if (!s || s.status !== 'idle' || s.meetingId || Date.now() >= v.until + VISIT_GRACE_MS || v.floor > this.homeIdsByFloor.length) endVisit(id)
    }
  }

  /** 계단으로 걸어가 도착하면 onGone (기본: 놀러 온 직원이 자기 층으로 돌아간다). 이미 가는 중이거나 계단이 없으면 false */
  private leaveFloor(a: Actor, onGone = () => endVisit(a.staff.id)) {
    if (a.goal?.mode === 'leave' || (a.mode === 'leave' && !a.goal)) return true
    const cell = this.stairsCell({ gx: Math.floor(a.x), gy: Math.floor(a.y) })
    if (!cell) {
      if (this.guests.has(a.staff.id)) onGone()
      return false
    }
    this.release(a)
    // 도착한 프레임에 이 직원을 지우면 같은 프레임의 draw가 지운 그림을 만진다 — 다음 프레임으로 미룬다
    this.walkTo(a, { ...cell, mode: 'leave', isSitting: false, face: 1, onArrive: () => this.time.delayedCall(0, onGone) })
    return true
  }

  private arriveAt(a: Actor, spot: Spot) {
    if (spot.emote) this.showEmote(a, spot.emote)
    // 업무 내용 수다: 쉬는 자리에 앉으면 가끔 최근 업무 제목을 한 줄 (구역 말풍선 대신)
    if (this.fixedFloor === null && spot.category !== 'office' && Math.random() < IX_CHAT_RATE) {
      const text = chatLine(a.staff.id, useOffice.getState().tasks)
      const d = text ? offer(this.director, { kind: 'chat', actor: a.staff.id, text, at: this.time.now }, this.time.now) : this.director
      if (d !== this.director) {
        this.director = d
        return
      }
    }
    // 구역 안이면 그 구역 말풍선, 아니면 가구 동작의 말풍선
    const say = (spot.zone && ZONE_SAY[spot.zone.split(':')[0]]) || spot.say
    if (say?.length) {
      a.chatText = pick(say)
      a.chatUntil = this.time.now + CHAT_SHOW_MS
    }
  }

  /** 직원이 이 가구 자리에 도착해 머무는 중 (소품 연출 C) */
  private isItemUsed(uid: string) {
    for (const a of this.actors.values()) if (a.spot?.uid === uid && a.spot.takenBy === a.staff.id && !a.goal && a.mode === 'away') return true
    return false
  }

  private release(a: Actor) {
    if (a.spot && a.spot.takenBy === a.staff.id) a.spot.takenBy = null
    a.spot = null
  }

  /** 걸어가거나(isWalking) 바로 그 자리에 둔다 */
  private moveTo(a: Actor, goal: Goal, isWalking: boolean) {
    if (!isWalking) {
      this.setCell(a, goal.gx, goal.gy)
      a.goal = goal
      return this.arrive(a)
    }
    this.walkTo(a, goal)
  }

  /** 칸 길찾기(4방향 A*). 못 가면 가장 가까운 닿는 칸까지 걷고 할 일은 취소한다 (순간이동 없음) */
  private walkTo(a: Actor, goal: Goal) {
    if (!this.walk) return
    const from = { gx: Math.floor(a.x), gy: Math.floor(a.y) }
    let path = findPath(this.walk, from, goal)
    a.goal = goal
    if (!path) {
      const near = this.nearestReachable(from, goal)
      path = near ? findPath(this.walk, from, near) : null
      a.goal = { ...(near ?? from), mode: 'away', isSitting: false, face: null }
      this.release(a)
    }
    a.path = path ?? []
    a.isSitting = false
  }

  /** 도착: 앉거나 서서 방향을 맞춘다 */
  private arrive(a: Actor) {
    const g = a.goal
    a.goal = null
    a.path = []
    if (!g) return
    a.mode = g.mode
    a.isSitting = g.isSitting
    a.sitZ = g.sitZ ?? SIT_Z
    if (g.face !== null) a.facing = g.face
    if (g.mode === 'home') a.container.setVisible(false)
    g.onArrive?.()
  }

  private nearestReachable(from: Cell, goal: Cell): Cell | null {
    const seen = reachable(this.walk, from)
    let best: Cell | null = null
    let bestD = Infinity
    for (let gy = 0; gy < this.room.rows; gy++)
      for (let gx = 0; gx < this.room.cols; gx++) {
        const k = cellKey(this.room, gx, gy)
        if (!seen[k] || this.walk.blocked[k]) continue
        const d = Math.abs(gx - goal.gx) + Math.abs(gy - goal.gy)
        if (d < bestD) {
          bestD = d
          best = { gx, gy }
        }
      }
    return best
  }

  /** 자리가 없는 직원이 기다릴 칸: 출입구에서 가까운 빈 칸 중 다른 직원이 서 있거나 가려는 칸은 뺀다 (예전에는 모두 한 칸에 겹쳤다) */
  private waitCell(me: Actor): Cell | null {
    const occupied = new Set<number>()
    for (const x of this.actors.values()) {
      if (x === me) continue
      const at = x.goal ?? { gx: Math.floor(x.x), gy: Math.floor(x.y) }
      if (isInside(this.room, at.gx, at.gy)) occupied.add(cellKey(this.room, at.gx, at.gy))
    }
    return waitCellFor(this.walk, this.fixed, occupied)
  }

  private randomFreeCell(): Cell | null {
    const seen = reachable(this.walk, this.entrance())
    for (let i = 0; i < 30; i++) {
      const gx = Math.floor(Math.random() * this.room.cols)
      const gy = Math.floor(Math.random() * this.room.rows)
      const k = cellKey(this.room, gx, gy)
      if (seen[k] && !this.walk.blocked[k] && !this.walk.region[k]) return { gx, gy }
    }
    return null
  }

  private goHome(a: Actor) {
    this.release(a)
    this.walkTo(a, { ...this.entrance(), mode: 'home', isSitting: false, face: 0 })
  }

  private comeBack(a: Actor) {
    a.container.setVisible(true)
    const door = this.entrance()
    this.setCell(a, door.gx, door.gy)
    a.mode = 'away'
    a.nextPlanAt = 0
    if (isBusy(a.staff)) this.goDesk(a, true)
  }

  private isOffHours(settings: Settings) {
    const wh = settings.workHours
    if (!wh?.isEnabled) return false
    const d = new Date()
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return wh.start <= wh.end ? hhmm < wh.start || hhmm >= wh.end : hhmm < wh.start && hhmm >= wh.end
  }

  /** 행동 정하기 (예전 장면 tick과 같은 박자) */
  private tick() {
    this.frame++
    const now = this.time.now
    const state = useOffice.getState()
    const isOffHours = this.isOffHours(state.settings)
    const { visits } = useFloorVisits.getState()
    if (this.fixedFloor === null) this.settleVisits(state.staff, visits)
    for (const a of this.actors.values()) {
      const s = a.staff
      // 상호작용 연출 중이면 연출이 끝날 때까지 행동을 정하지 않는다
      if (this.isInvolved(s.id)) {
        this.applyLook(a, s.id === state.selectedId)
        continue
      }
      const isResting = !isBusy(s) && !s.meetingId && a.mode !== 'meeting'
      const isWalking = a.path.length > 0
      const visit = this.guests.has(s.id) ? visits[s.id] : undefined
      if (visit && (isOffHours || Date.now() >= visit.until)) this.leaveFloor(a)
      else if (isResting && isOffHours && a.mode !== 'home' && a.goal?.mode !== 'home') this.goHome(a)
      else if (a.mode === 'home' && !isOffHours) this.comeBack(a)
      else if (isResting && a.mode !== 'home' && a.mode !== 'leave' && !isWalking && !a.goal && now >= a.nextPlanAt && a.chatUntil < now) this.plan(a, true)
      this.applyLook(a, s.id === state.selectedId)
    }
    this.updateTooltip()
  }

  private applyLook(a: Actor, isSelected: boolean) {
    const s = a.staff
    a.mark.setVisible(s.status === 'waiting' || s.status === 'error')
    a.mark.setBackgroundColor(s.status === 'error' ? '#e0533c' : '#f0c541')
    a.ring.setVisible(isSelected)
    const atDesk = a.mode === 'desk' && !a.goal
    a.name.setVisible(atDesk || isSelected || s.id === this.hoverId)
    let text = ''
    if (a.chatUntil > this.time.now) text = a.chatText
    else if (a.mode === 'meeting') {
      // 그 직원의 마지막 발언 — 뒤에서부터 찾는다 (매 프레임 배열을 복사·뒤집지 않게)
      const messages = this.meetingOf(s.id)?.messages ?? []
      let last: (typeof messages)[number] | undefined
      for (let i = messages.length - 1; i >= 0 && !last; i--) if (messages[i].staffId === s.id) last = messages[i]
      if (last && Date.now() - last.ts < 7000) text = last.text
    } else if (this.awayMeeting.has(s.id)) text = `${this.awayMeeting.get(s.id)}층 회의 중`
    else if (atDesk && s.activity && (isSelected || s.status === 'waiting')) text = s.activity
    this.setBubble(a, text)
  }

  /**
   * 장면 내보내기 중: 말풍선 글을 ···로 가리고(모양·이름표는 남김) 마우스 정보창을 끄고, 카메라 이동·확대를 막는다.
   * 녹화는 이 캔버스를 그대로 찍으므로 그동안 사용자 화면에도 같이 적용된다 (gif-export-tech.md 1-3)
   */
  setExportMode(mode: { isRedacting: boolean; isCameraLocked: boolean }) {
    this.isRedacting = mode.isRedacting
    this.isCameraLocked = mode.isCameraLocked
    // 다음 박자를 기다리지 않고 바로 — 첫 프레임부터 가려져 있어야 한다
    const { selectedId } = useOffice.getState()
    for (const a of this.actors.values()) this.applyLook(a, a.staff.id === selectedId)
    this.updateTooltip()
  }
  private setBubble(a: Actor, text: string) {
    a.bubble.setVisible(Boolean(text))
    if (!text) return
    const label = this.isRedacting ? '···' : text.length > BUBBLE_TEXT_MAX ? `${text.slice(0, BUBBLE_TEXT_MAX)}…` : text
    if (a.bubbleText.text === label) return
    a.bubbleText.setText(label)
    const b = a.bubbleText.getBounds()
    const pad = 5
    a.bubbleBg.clear()
    a.bubbleBg.fillStyle(OUTLINE).fillRoundedRect(-b.width / 2 - pad - 1, -b.height - pad - 1, b.width + pad * 2 + 2, b.height + pad * 1.6 + 2, 5)
    a.bubbleBg.fillStyle(0xffffff).fillRoundedRect(-b.width / 2 - pad, -b.height - pad, b.width + pad * 2, b.height + pad * 1.6, 4)
    a.bubbleBg.fillStyle(0xffffff).fillTriangle(-4, pad * 0.6, 4, pad * 0.6, 0, pad * 0.6 + 5)
  }

  /** 감정 도트 말풍선 그림 (처음 쓸 때 한 번 그린다) */
  private emoteTexture(kind: EmoteKind) {
    const key = `iso-emote-${kind}`
    if (!this.textures.exists(key)) addArt(this.textures, key, drawEmote(kind))
    return key
  }

  /** icon = 이모지 (가구 행동·상태 변화) → 감정 도트 말풍선으로 띄운다 */
  private showEmote(a: Actor, icon: string) {
    this.tweens.killTweensOf(a.emote)
    const y = this.labelTop(a) - 2
    a.emote.setTexture(this.emoteTexture(emoteKindOf(icon))).setAlpha(1).setY(y)
    this.tweens.add({ targets: a.emote, y: y - 14, alpha: 0, delay: EMOTE_MS * 0.5, duration: EMOTE_MS * 0.5 })
  }

  private updateTooltip() {
    const a = this.hoverId && !this.isRedacting ? this.actors.get(this.hoverId) : undefined
    this.tooltip.setVisible(Boolean(a))
    if (!a) return
    const s = a.staff
    const activity = s.activity.length > 42 ? `${s.activity.slice(0, 42)}…` : s.activity
    const lines = [`${s.name} · ${roleLabel(s.role)}`, `상태  ${STATUS_LABEL[s.status]}`, `활동  ${activity || '—'}`]
    if (s.kind === 'hired') lines.push(`Lv.${s.stats.level}  ·  완료 ${s.stats.tasksDone}`)
    this.tooltipText.setText(lines.join('\n'))
    const b = this.tooltipText.getBounds()
    const pad = 8
    this.tooltipBg.clear()
    this.tooltipBg.fillStyle(0x1a1d28, 0.94).fillRoundedRect(-pad, -pad, b.width + pad * 2, b.height + pad * 2, 6)
    this.tooltipBg.lineStyle(1, 0x5a6aa4).strokeRoundedRect(-pad, -pad, b.width + pad * 2, b.height + pad * 2, 6)
    this.tooltip.setPosition(Math.min(a.container.x + 26, this.world.w - b.width - pad * 2), a.container.y - 70)
  }

  /** 걷기 한 프레임 (칸 단위, 가는 방향으로 r0~r3) */
  private step(a: Actor, dt: number) {
    const next = a.path[0]
    if (!next) {
      if (a.goal && Math.floor(a.x) === a.goal.gx && Math.floor(a.y) === a.goal.gy) this.arrive(a)
      return
    }
    const tx = next.gx + 0.5
    const ty = next.gy + 0.5
    const dx = tx - a.x
    const dy = ty - a.y
    const dist = Math.hypot(dx, dy)
    const move = WALK_CELLS_PER_S * dt
    if (dist > 1e-3) a.facing = facingOf(dx, dy)
    a.walkT += dt
    if (dist <= move) {
      a.x = tx
      a.y = ty
      a.path.shift()
      // 소품 연출 E: 새 칸에 들어왔다 — 바로 옆 소품이 반응
      this.motion?.passBy(next)
      if (!a.path.length) this.arrive(a)
    } else {
      a.x += (dx / dist) * move
      a.y += (dy / dist) * move
    }
  }

  private draw(a: Actor) {
    const isWalking = a.path.length > 0
    // 보는 방향: r0 ↙ · r1 ↖ · r2 ↗ · r3 ↘ — 방향마다 따로 그린 그림 (반전 없음)
    // 클릭 반응: 앉은 채 앞(↙)으로 돌아본다
    const isTurned = a.act?.anim === 'turn' && a.isSitting
    const dir = isTurned ? 'front' : personDirOf(a.facing)
    // 책상 자리에 앉았으면 키보드 치는 자세 (무릎이 책상 위로 비어져 나오지 않는다)
    const isTyping = !isTurned && a.isSitting && !!a.seat?.hasDesk && Math.floor(a.x) === a.seat.gx && Math.floor(a.y) === a.seat.gy
    const walkFrame = Math.floor(a.walkT / WALK_FRAME_S) % 2
    const actPose = !a.isSitting && a.act ? this.actPose(a.act, isWalking, walkFrame) : null
    const pose = actPose ?? (isTyping ? 'type' : a.isSitting ? 'sit' : isWalking ? (walkFrame ? 'walk2' : 'walk1') : 'stand')
    a.body.setTexture(this.personTexture(a.staff.avatar, pose, dir))
    const foot = this.wpt(a.x, a.y)
    const lift = a.isSitting ? a.sitZ * PIXEL : 0
    a.container.setPosition(foot.x, foot.y)
    a.body.setY(a.isSitting ? PIXEL - (a.sitZ + SIT_HIP - (isTyping ? TYPE_DROP : SIT_DROP)[dir]) * PIXEL : PIXEL)
    a.ring.setY(-lift)
    // 이름표는 머리 위에 — 발밑에 두면 앉았을 때 앞줄 책상 위에 떠서 옆 사람 이름처럼 읽힌다. 말풍선·이모티콘은 그 위
    const head = a.body.y - a.body.height
    a.mark.setY(head + 14)
    a.name.setY(head - NAME_GAP)
    a.shadow.setPosition(foot.x, foot.y).setVisible(!a.isSitting && a.container.visible)
    a.label.setPosition(foot.x, foot.y).setVisible(a.container.visible)
    a.bubble.setY(this.labelTop(a) - 8)
    // 퇴근하면 몸통이 입구에 숨어 있다 — 미니 뷰는 빈 자리를 비춘다
    const at = !a.container.visible && a.seat ? { x: a.seat.gx + 0.5, y: a.seat.gy + 0.5 } : a
    // 앞 변으로 당긴 점이 깎인 자리(ㄷ자 안뜰 등)에 떨어지면 당기지 않고 그 칸 그대로 — 미니 뷰가 빈 칸을 비추지 않게
    const pulled = miniFocus(this.room, at.x, at.y)
    const f = isInside(this.room, Math.floor(pulled.x), Math.floor(pulled.y)) ? pulled : at
    const fp = this.wpt(f.x, f.y)
    a.focus.setPosition(fp.x, fp.y)
  }

  /** 머리 위 이름표의 윗변 (이름이 숨어 있으면 머리) — 말풍선·이모티콘을 이 위에 띄운다 */
  private labelTop(a: Actor) {
    const head = a.body.y - a.body.height
    return a.name.visible ? head - NAME_GAP - a.name.height : head
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 100) / 1000
    this.runInteractions()
    for (const a of this.actors.values()) {
      if (a.act) a.act.t += dt
      this.step(a, dt)
      this.draw(a)
    }
    this.updatePets(dt)
    this.motion?.update(deltaMs)
    this.sortDepth()
    this.warmPeople()
  }

  /**
   * 가구 부품·직원을 뒤 → 앞으로 깊이를 매긴다 (기술 설계 1-2절).
   * 가구 순서는 배치가 바뀔 때만 정렬하고(깊이 10·20·30…), 매 프레임은 직원만 그 사이(+1~+9)에 끼운다.
   * 끼울 자리가 없는 드문 프레임만 전체를 정렬한다. 측정: docs/specs/office-iso-prototype.md 6절
   */
  /** 정렬해 둔 가구 순서 (배치가 바뀌면 다시) */
  private staticDepth: { list: DepthBox[]; ordered: DepthBox[]; isApplied: boolean } | null = null
  /** 가구 부품(parts·fixedParts)이 바뀌었음 — 다음 프레임에 가구 깊이 목록을 다시 만든다. 부품을 바꾸는 곳은 모두 이 값을 세운다 */
  private isStaticDepthDirty = true

  private sortDepth() {
    if (this.isStaticDepthDirty || !this.staticDepth) {
      this.isStaticDepthDirty = false
      const list: DepthBox[] = []
      for (const parts of [...this.parts.values(), this.fixedParts])
        for (const { img, box, item } of parts) list.push({ x: item.gx + box.x, y: item.gy + box.y, w: box.w, d: box.d, z: box.z, h: box.h, obj: img, isTallWall: specOf(item.itemId).isTallWall })
      this.staticDepth = { list, ordered: depthOrder(list), isApplied: false }
    }
    const cache = this.staticDepth
    const statics = cache.list
    const movers: DepthBox[] = []
    for (const a of this.actors.values()) if (a.container.visible) movers.push({ x: a.x - 0.18, y: a.y - 0.18, w: 0.36, d: 0.36, z: a.isSitting ? a.sitZ + SIT_HIP : 0, h: 30, obj: a.container })
    for (const p of this.pets.values()) if (p.img.visible) movers.push({ x: p.x - 0.18, y: p.y - 0.18, w: 0.36, d: 0.36, z: p.z, h: 8, obj: p.img })
    if (!cache.isApplied) {
      cache.ordered.forEach((it, i) => it.obj.setDepth(10 + i * 10))
      cache.isApplied = true
    }
    // 안쪽 벽: 뒤에 직원이 가려지면 그 칸 조각만 반투명 (G3 A)
    for (const parts of [this.fixedParts]) for (const p of parts) if (p.fade) p.img.setAlpha(hidesMover({ ...p.fade.edge, z: p.fade.edge.z, h: p.fade.edge.h }, movers) ? WALL_FADE_ALPHA : 1)
    // 높은 가벽(isTallWall)도 같은 규칙 — 가구 한 장이라 통째로. 깜빡이는 중(flashItem)이면 건드리지 않는다
    for (const s of statics) if (s.isTallWall && !this.tweens.isTweening(s.obj)) s.obj.setAlpha(hidesMover(s, movers) ? WALL_FADE_ALPHA : 1)
    const slots = placeMovers(cache.ordered, movers)
    if (slots) {
      for (const s of slots) s.item.obj.setDepth(10 + s.after * 10 + 1 + (8 * s.rank) / Math.max(1, movers.length))
    } else {
      // 끼울 자리가 없음: 이 프레임만 전체 정렬. 가구 깊이가 바뀌었으니 다음 프레임에 정렬해 둔 가구 순서를 다시 매긴다
      depthOrder([...statics, ...movers]).forEach((it, i) => it.obj.setDepth(10 + i * 10))
      cache.isApplied = false
    }
    // 그림자는 그 직원 바로 밑 — 고정 깊이(바닥 위)면 러그(flat)에 가려진다. 직원은 뒤 가구보다 1 이상 위라 0.01을 빼도 가구 아래로 내려가지 않는다
    for (const a of this.actors.values()) a.shadow.setDepth(a.container.depth - SHADOW_BELOW)
    for (const p of this.pets.values()) p.shadow.setDepth(p.img.depth - SHADOW_BELOW)
  }

  // ── 상호작용 연출 (shared/iso/interactions) ───────────────────

  /** 스냅샷 변화 → 연출을 직원별 큐에 넣는다. 막힌 직원은 가장 가까운 쉬는 동료가 도우러 간다 */
  private feedEvents(prev: IxSnap, next: IxSnap) {
    const { events, memo } = detectEvents(prev, next, this.ixMemo, Date.now())
    this.ixMemo = memo
    const now = this.time.now
    for (const e of events) {
      if (e.kind === 'stuck') this.offerHelp(e.target)
      else this.offerIx({ ...e, at: now })
    }
  }

  /** 연출을 받는다. 상대가 다른 층이면 걸어가지 않고 이 층에 있는 쪽에 말풍선만 띄운다 */
  private offerIx(ix: Interaction) {
    const now = this.time.now
    const actor = this.actors.get(ix.actor)
    const target = ix.target ? this.actors.get(ix.target) : undefined
    if (actor && (!ix.target || target)) {
      this.director = offer(this.director, ix, now)
      return
    }
    // 이 층에 있는 쪽의 큐에 넣는다 (같은 쿨다운·큐 규칙). 꺼낼 때 startRun이 말풍선만 띄운다
    const here = actor ?? target
    if (here) this.director = offer(this.director, ix, now, here.staff.id)
  }

  /** 말풍선만 띄우는 연출 — 띄워 둔 동안은 다음 연출을 꺼내지 않아 말풍선이 겹치지 않는다 */
  private bubbleRun(a: Actor, ix: Interaction, b: { emote?: string; say?: string }) {
    if (!b.emote && !b.say) {
      this.director = finishIx(this.director, a.staff.id)
      return
    }
    const run: IxRun = { ix, steps: [{ do: 'act', anim: 'keep', ms: CHAT_SHOW_MS, ...b }], i: -1, until: 0, isBubble: true }
    this.ixRuns.set(a.staff.id, run)
    this.nextStep(a, run)
  }

  /** 도움 받을 직원이 아직 막혀 있다 (결재 대기·오류) */
  private isStuck(id?: string) {
    const s = (id && this.actors.get(id)?.staff) || useOffice.getState().staff.find((x) => x.id === id)
    return s?.status === 'waiting' || s?.status === 'error'
  }

  private bubbleOnly(a: Actor, b: { emote?: string; say?: string }) {
    if (!b.emote && !b.say) return
    if (b.emote) this.showEmote(a, b.emote)
    if (b.say) {
      a.chatText = b.say
      a.chatUntil = this.time.now + CHAT_SHOW_MS
    }
  }

  /** 막힌 직원(결재 대기·오류)에게 이 층의 가장 가까운 쉬는 동료를 보낸다 */
  private offerHelp(targetId: string) {
    const t = this.actors.get(targetId)
    if (!t || !t.container.visible) return
    const free = [...this.actors.values()].filter((x) => x !== t && this.isIdleHere(x) && !this.director.queue[x.staff.id])
    const helper = pickHelper(this.cellOf(t), free.map((x) => ({ id: x.staff.id, ...this.cellOf(x) })))
    if (helper) this.offerIx({ kind: 'help', actor: helper, target: targetId, at: this.time.now })
  }

  /** 쉬고 있고 연출·회의·퇴근·층 이동 중이 아닌 직원 */
  private isIdleHere(a: Actor) {
    const s = a.staff
    const leaving = (m?: Mode) => m === 'meeting' || m === 'home' || m === 'leave'
    return s.status === 'idle' && !s.meetingId && a.container.visible && !leaving(a.mode) && !leaving(a.goal?.mode) && !this.isInvolved(s.id)
  }

  private cellOf(a: Actor): Cell {
    return { gx: Math.floor(a.x), gy: Math.floor(a.y) }
  }

  /** 연출 중이다 (주인공이거나 하이파이브 상대) */
  private isInvolved(id: string) {
    if (this.ixRuns.has(id)) return true
    for (const r of this.ixRuns.values()) if (r.partner?.staff.id === id) return true
    return false
  }

  /** 연출을 시작할 수 있는 상태 (회의·퇴근·층 이동·꾸미기 중이 아님) */
  private canStartIx(a: Actor) {
    const busyMode = (m?: Mode) => m === 'meeting' || m === 'home' || m === 'leave'
    return a.container.visible && !busyMode(a.mode) && !busyMode(a.goal?.mode) && !a.staff.meetingId && !this.isInvolved(a.staff.id) && !useOffice.getState().isDecorating
  }

  /** 매 프레임: 진행 중인 연출의 단계를 넘기고, 쉬는 직원의 큐에서 다음 연출을 꺼낸다 */
  private runInteractions() {
    if (this.fixedFloor !== null) return
    const now = this.time.now
    for (const [id, run] of [...this.ixRuns]) {
      const a = this.actors.get(id)
      if (!a) {
        this.ixRuns.delete(id)
        this.director = finishIx(this.director, id)
        continue
      }
      const step = run.steps[run.i]
      // 도우러 가는 중에 막힌 직원이 일로 돌아갔으면 접고 돌아간다 (이미 돌아가는 길이면 그대로)
      if (run.ix.kind === 'help' && !run.isBubble && !run.ix.isPreview && !this.isStuck(run.ix.target) && !(step?.do === 'walk' && step.to === 'home')) {
        this.endRun(a)
        this.goBack(a)
        continue
      }
      const isStill = (x: Actor) => !x.goal && !x.path.length
      if (now >= run.until || (step?.do === 'walk' && isStill(a) && (!run.partner || isStill(run.partner)))) this.nextStep(a, run)
    }
    for (const id of Object.keys(this.director.queue)) {
      const a = this.actors.get(id)
      if (!a) {
        this.director = cancelIx(this.director, id)
        continue
      }
      if (!this.canStartIx(a)) continue
      const { d, ix } = startNext(this.director, id, now)
      this.director = d
      if (ix) this.startRun(a, ix)
    }
  }

  private startRun(a: Actor, given: Interaction) {
    let ix = given
    // 그새 막힌 직원이 일로 돌아갔으면 도우러 가지 않는다
    if (ix.kind === 'help' && !ix.isPreview && !this.isStuck(ix.target)) {
      this.director = finishIx(this.director, a.staff.id)
      return
    }
    // 이 층의 상대 쪽이 받은 연출(주인공이 다른 층): 말풍선만
    if (a.staff.id !== ix.actor) {
      const name = useOffice.getState().staff.find((s) => s.id === ix.actor)?.name ?? ''
      return this.bubbleRun(a, ix, fallbackOf(ix, 'target', name))
    }
    // 커피 심부름: 가끔 일하는 동료 자리에 컵을 놓아 준다
    if (ix.kind === 'coffee' && !ix.target && Math.random() < CUP_SHARE_RATE) {
      const mates = [...this.actors.values()].filter((x) => x !== a && x.mode === 'desk' && !x.goal && x.seat && x.container.visible)
      if (mates.length) ix = { ...ix, target: pick(mates).staff.id }
    }
    const target = ix.target ? this.actors.get(ix.target) : undefined
    const isPartnerFree = (x?: Actor) => x && this.canStartIx(x) && !isBusy(x.staff)
    if ((ix.target && !target) || (PARTNER_KINDS.has(ix.kind) && !isPartnerFree(target))) {
      // 상대가 없어졌거나(층 이동) 바쁘면 걸어가지 않고 말풍선만
      const name = target?.staff.name ?? useOffice.getState().staff.find((s) => s.id === ix.target)?.name ?? ''
      const fb = fallbackOf(ix, 'actor', name)
      if (target) this.bubbleOnly(target, fb)
      return this.bubbleRun(a, ix, fb)
    }
    const run: IxRun = { ix, steps: stepsOf(ix, { isSitting: a.isSitting }), i: -1, until: 0, partner: PARTNER_KINDS.has(ix.kind) ? target : undefined }
    this.ixRuns.set(a.staff.id, run)
    this.nextStep(a, run)
  }

  /** 다음 단계로. 단계가 끝나면 연출을 마친다 */
  private nextStep(a: Actor, run: IxRun): void {
    const now = this.time.now
    if (run.partner && run.steps[run.i]?.do === 'act') run.partner.act = null
    run.i++
    const step = run.steps[run.i]
    if (!step) return this.endRun(a)
    const target = run.ix.target ? this.actors.get(run.ix.target) : undefined
    if (step.do === 'act') {
      // 앉은 채 하는 연출(수다·박수 대신 🎉·돌아보기)은 방향을 바꾸지 않는다
      if (target && target !== a && !a.isSitting) a.facing = facingOf(target.x - a.x, target.y - a.y)
      a.act = step.anim === 'keep' ? null : { anim: step.anim, t: 0 }
      if (step.emote) this.showEmote(a, step.emote)
      if (step.say) {
        a.chatText = step.say
        a.chatUntil = now + step.ms
      }
      if (target && step.partnerEmote) this.showEmote(target, step.partnerEmote)
      const p = run.partner
      if (p && step.partnerAnim) {
        p.facing = facingOf(a.x - p.x, a.y - p.y)
        p.act = { anim: step.partnerAnim, t: 0 }
        // 하이파이브: 가로로 붙은 두 칸에서 서로 조금 다가서야 손이 맞닿는다
        if (step.anim === 'highFive' && Math.abs(p.y - a.y) < 0.01 && Math.abs(Math.abs(p.x - a.x) - 1) < 0.01) {
          const s = Math.sign(p.x - a.x) * HIGH_FIVE_NUDGE
          a.x += s
          p.x -= s
        }
      }
      run.until = now + step.ms
      return
    }
    a.act = step.carry ? { anim: step.carry === 'paper' ? 'carry' : 'cup', t: 0, carry: step.carry } : null
    run.until = now + IX_WALK_GIVE_UP_MS
    if (step.to === 'home') {
      // 일하는 중이면 자리로, 쉬는 중이면 다시 쉬러. 하이파이브 상대도 함께 돌아간다
      if (run.partner) {
        this.goBack(run.partner)
        run.partner = undefined
      }
      return this.goBack(a)
    }
    const goal = this.ixGoal(a, run, step.to, target)
    if (!goal) {
      // 커피 머신이 없으면 그 자리에서 마신다. 상대 옆에 갈 칸이 없으면 연출을 접고 돌아간다
      if (step.to === 'coffee') return this.nextStep(a, run)
      run.i = run.steps.length - 2
      return this.nextStep(a, run)
    }
    this.release(a)
    this.walkTo(a, { ...goal, mode: 'away', isSitting: false, face: goal.face })
  }

  /** 연출에서 걸어갈 칸 (상대 옆·의자 뒤·하이파이브 칸·커피 머신). 하이파이브는 상대도 옆 칸으로 보낸다 */
  private ixGoal(a: Actor, run: IxRun, to: Exclude<IxPlace, 'home'>, target?: Actor): (Cell & { face: Rot | null }) | null {
    if (!this.walk) return null
    const occupied = new Set<string>()
    for (const x of this.actors.values()) {
      if (x === a || x === run.partner) continue
      const at = x.goal ?? this.cellOf(x)
      occupied.add(`${at.gx},${at.gy}`)
    }
    const isFree = (c: Cell) => isInside(this.room, c.gx, c.gy) && !this.walk.blocked[cellKey(this.room, c.gx, c.gy)] && !occupied.has(`${c.gx},${c.gy}`)
    const from = this.cellOf(a)
    if (to === 'coffee') {
      const itemOf = (uid: string) => this.items.find((it) => it.uid === uid)?.itemId ?? ''
      const machines = this.spots.filter((s) => (s.emote === '☕' || COFFEE_ITEMS.has(itemOf(s.uid))) && (!s.takenBy || s.takenBy === a.staff.id) && !s.isSitting)
      machines.sort((p, q) => Math.abs(p.gx - from.gx) + Math.abs(p.gy - from.gy) - (Math.abs(q.gx - from.gx) + Math.abs(q.gy - from.gy)))
      const m = machines[0]
      return m ? { gx: m.gx, gy: m.gy, face: m.face } : null
    }
    if (!target) return null
    const tc = this.cellOf(target)
    if (to === 'meet') {
      const mid = { gx: Math.round((from.gx + tc.gx) / 2), gy: Math.round((from.gy + tc.gy) / 2) }
      const pair = meetPair(mid, isFree)
      if (!pair || !run.partner) return null
      const p = run.partner
      this.release(p)
      p.act = null
      this.walkTo(p, { ...pair[1], mode: 'away', isSitting: false, face: 1 })
      return { ...pair[0], face: 3 }
    }
    const atDesk = target.seat && target.mode === 'desk' && !target.goal && tc.gx === target.seat.gx && tc.gy === target.seat.gy
    const cell = to === 'behind' && atDesk && target.seat ? behindCell(target.seat, from, isFree) : besideCell(tc, from, isFree)
    return cell ? { ...cell, face: null } : null
  }

  /** 연출이 끝난 사람: 일하는 중이면 자리로, 쉬는 중이면 다음 쉬는 행동 */
  private goBack(a: Actor) {
    a.act = null
    if (isBusy(a.staff) || a.staff.meetingId) {
      if (a.staff.meetingId && this.meetingOf(a.staff.id)) this.goMeeting(a, true)
      else this.goDesk(a, true)
    } else this.plan(a, true)
  }

  private endRun(a: Actor) {
    const run = this.ixRuns.get(a.staff.id)
    this.ixRuns.delete(a.staff.id)
    this.director = finishIx(this.director, a.staff.id)
    a.act = null
    if (run?.partner) this.goBack(run.partner)
  }

  /** 새 일이 왔다(또는 사라졌다): 하던 연출·기다리던 연출을 버린다. 하이파이브 상대였으면 그 연출도 접는다. 연출 중이었으면 true */
  private cancelRun(a: Actor): boolean {
    const wasInvolved = this.isInvolved(a.staff.id)
    this.director = cancelIx(this.director, a.staff.id)
    const run = this.ixRuns.get(a.staff.id)
    this.ixRuns.delete(a.staff.id)
    a.act = null
    if (run?.partner) this.goBack(run.partner)
    for (const [id, r] of [...this.ixRuns]) {
      if (r.partner !== a) continue
      const owner = this.actors.get(id)
      r.partner = undefined
      if (owner) {
        this.endRun(owner)
        this.goBack(owner)
      }
    }
    return wasInvolved
  }

  /** 연출 자세 → 그림 자세 (iso/personArt FIGURE_ANIMS). 들고 걸으면 들기 걷기, 한 번만 하는 자세는 마지막 프레임에서 멈춘다 */
  private actPose(act: NonNullable<Actor['act']>, isWalking: boolean, walkFrame: number): PersonPose | null {
    if (isWalking) {
      if (!act.carry) return null
      return (act.carry === 'paper' ? FIGURE_ANIMS.carryWalk : FIGURE_ANIMS.cupWalk)[walkFrame]
    }
    switch (act.anim) {
      case 'keep':
      case 'turn':
        return null
      case 'stand':
      case 'carry':
      case 'cup':
      case 'peek':
        return act.anim
      default: {
        const frames: readonly PersonPose[] = FIGURE_ANIMS[act.anim]
        const n = Math.floor(act.t / (ACT_FRAME_S[act.anim] ?? 0.3))
        return frames[ACT_LOOPS.has(act.anim) ? n % frames.length : Math.min(n, frames.length - 1)]
      }
    }
  }

  /**
   * 개발용 미리보기: 상호작용 7종을 이 층 직원으로 바로 실행한다 (쿨다운 무시).
   * 팀장이 있으면 팀장이 주인공, 다른 한 명이 상대. 직원이 없으면 false
   */
  previewInteraction(kind: 'handoff' | 'review' | 'help' | 'celebrate' | 'chat' | 'coffee' | 'wave') {
    const list = [...this.actors.values()].filter((a) => a.container.visible && a.mode !== 'meeting' && a.goal?.mode !== 'meeting')
    if (!list.length) return false
    const { teams, tasks } = useOffice.getState()
    const lead = list.find((a) => teams.some((t) => t.leadId === a.staff.id)) ?? list[0]
    const other = list.find((a) => a !== lead)
    for (const a of list) this.cancelRun(a)
    this.director = { ...this.director, last: {} }
    const add = (k: InteractionKind, actor: Actor, target?: Actor, text?: string) => {
      const now = this.time.now
      this.director = offer(this.director, { kind: k, actor: actor.staff.id, ...(target ? { target: target.staff.id } : {}), ...(text ? { text } : {}), at: now, isPreview: true }, now)
    }
    if (kind === 'wave') add('wave', lead)
    else if (kind === 'chat') add('chat', other ?? lead, undefined, chatLine((other ?? lead).staff.id, tasks) ?? '오늘 할 일 정리 중')
    else if (kind === 'coffee') add('coffee', other ?? lead, other ? lead : undefined)
    else if (!other) return false
    else if (kind === 'handoff') {
      // 넘겨주기를 마친 뒤 보고 (실제로도 맡긴 일이 끝나야 보고한다)
      add('handoff', lead, other)
      this.time.delayedCall(9000, () => this.actors.has(other.staff.id) && this.actors.has(lead.staff.id) && add('report', other, lead))
    } else if (kind === 'review') {
      add('review', lead, other)
      add('approve', lead, other)
    } else if (kind === 'help') add('help', other, lead)
    else {
      add('highFive', lead, other)
      for (const a of list) add('clap', a)
    }
    return true
  }

  // ── 카메라 ────────────────────────────────────────────

  private fitZoom() {
    const cam = this.cameras.main
    return Math.min(cam.width / this.world.w, cam.height / this.world.h, MAX_ZOOM * window.devicePixelRatio)
  }

  /**
   * 사용자가 움직이기 전에는 전체 보기. 방이 커서 전체 보기가 너무 작으면 처음 한 번은
   * 조금 당겨서 직원이 가장 많은 구역(앉은 자리들의 가운데값)을 가운데에 둔다 (기술 설계 1-4절)
   */
  private fitCamera() {
    if (this.isUserCamera) return this.clampCamera()
    const cam = this.cameras.main
    const fit = this.fitZoom()
    const comfy = FIRST_VIEW_ZOOM * window.devicePixelRatio
    const focus = this.staffFocus()
    if (!this.hasFirstView && fit < comfy && focus) {
      cam.setZoom(comfy)
      cam.centerOn(focus.x, focus.y)
      this.clampCamera()
      return
    }
    cam.setZoom(fit)
    cam.centerOn(this.world.w / 2, this.world.h / 2)
  }

  /** 직원이 몰린 곳 (발밑 칸의 가운데값) */
  private staffFocus() {
    const cells = [...this.actors.values()].filter((a) => a.container.visible).map((a) => (a.goal ? { x: a.goal.gx + 0.5, y: a.goal.gy + 0.5 } : { x: a.x, y: a.y }))
    if (!cells.length) return null
    const mid = (xs: number[]) => xs.sort((p, q) => p - q)[Math.floor(xs.length / 2)]
    const p = this.wpt(mid(cells.map((c) => c.x)), mid(cells.map((c) => c.y)))
    return { x: p.x, y: p.y - TILE_H }
  }

  /**
   * 전체 보기로 돌아가기. 지도를 열 때 officeStage가 setMapViewport 바로 뒤에 부르고, 지도의 "전체 보기" 버튼도 부른다.
   * 여는 순간의 호출은 처음 보기(직원 구역)를 두고, 그 뒤 버튼은 늘 방 전체를 보인다
   */
  fitView() {
    if (this.isCameraLocked) return
    const isOpening = performance.now() - this.viewportAt < OPENING_MS
    if (!isOpening) this.hasFirstView = true
    this.isUserCamera = false
    this.fitCamera()
  }

  zoomBy(factor: number, at?: { x: number; y: number }) {
    if (this.isCameraLocked) return
    const cam = this.cameras.main
    const next = Phaser.Math.Clamp(cam.zoom * factor, this.fitZoom() * ZOOM_MIN_OF_FIT, ZOOM_MAX * window.devicePixelRatio)
    const anchor = at ?? { x: cam.width / 2, y: cam.height / 2 }
    const before = cam.getWorldPoint(anchor.x, anchor.y)
    cam.setZoom(next)
    const after = cam.getWorldPoint(anchor.x, anchor.y)
    cam.scrollX += before.x - after.x
    cam.scrollY += before.y - after.y
    this.isUserCamera = true
    this.hasFirstView = true
    this.clampCamera()
  }

  private panBy(dx: number, dy: number) {
    if (this.isCameraLocked) return
    const cam = this.cameras.main
    cam.scrollX += dx / cam.zoom
    cam.scrollY += dy / cam.zoom
    this.isUserCamera = true
    this.hasFirstView = true
    this.clampCamera()
  }

  /** 화면 가운데를 사무실 안에 둔다 */
  private clampCamera() {
    const cam = this.cameras.main
    const c = cam.getWorldPoint(cam.width / 2, cam.height / 2)
    const cx = Phaser.Math.Clamp(c.x, 0, this.world.w)
    const cy = Phaser.Math.Clamp(c.y, 0, this.world.h)
    if (cx !== c.x || cy !== c.y) cam.centerOn(cx, cy)
  }

  /** 트랙패드 핀치·⌘/Ctrl+휠 = 확대, 두 손가락 스크롤 = 이동, 빈 곳 드래그 = 이동. 터치는 두 손가락 벌리기 = 확대 */
  private setupCameraControls() {
    this.input.addPointer(1)
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objs: unknown, dx: number, dy: number) => {
      const ev = pointer.event as WheelEvent
      if (ev.ctrlKey || ev.metaKey) this.zoomBy(Math.exp(-dy * WHEEL_ZOOM_SPEED), { x: pointer.x, y: pointer.y })
      else this.panBy(dx * window.devicePixelRatio, dy * window.devicePixelRatio)
    })
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, objs: unknown[]) => {
      this.panFrom = objs.length === 0 && !this.decor?.isCapturing ? { x: pointer.x, y: pointer.y } : null
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const [p1, p2] = [this.input.pointer1, this.input.pointer2]
      if (p1?.isDown && p2?.isDown) {
        const now: [{ x: number; y: number }, { x: number; y: number }] = [
          { x: p1.x, y: p1.y },
          { x: p2.x, y: p2.y },
        ]
        if (this.pinchFrom) {
          const { factor, center } = pinchStep(this.pinchFrom, now)
          this.zoomBy(factor, center)
          // 두 손가락으로 끌면 이동 (꾸미기 중 한 손가락은 가구를 끈다)
          const mid = (p: typeof now) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })
          const [a, b] = [mid(this.pinchFrom), mid(now)]
          this.panBy(a.x - b.x, a.y - b.y)
        }
        this.pinchFrom = now
        this.panFrom = null
        return
      }
      this.pinchFrom = null
      if (!this.panFrom || !pointer.isDown || this.decor?.isCapturing) return
      this.panBy(this.panFrom.x - pointer.x, this.panFrom.y - pointer.y)
      this.panFrom = { x: pointer.x, y: pointer.y }
    })
    this.input.on('pointerup', () => {
      this.panFrom = null
      this.pinchFrom = null
    })
  }

  // ── 미니 뷰 계약 (officeStage) — 예전 OfficeScene과 같은 이름·뜻 ──

  /** 지금 이 장면에 그려지는 층 */
  get currentFloor() {
    return this.floor
  }

  /** 다른 층 회의에 간 직원의 미니 뷰가 비출 곳: 회의실에 있는 사람들 가운데 (없으면 회의실 칸 가운데) */
  get meetingFocus() {
    const inRoom = [...this.actors.values()].filter((a) => a.mode === 'meeting')
    if (inRoom.length === 0) {
      // 빈 회의실: 바닥 가운데보다 반 칸 위 (칸막이·탁자가 보이게)
      const c = this.meetingCenter()
      const p = this.wpt(c.gx, c.gy)
      return { x: p.x, y: p.y - TILE_H / 2 }
    }
    // 선 사람 키가 52px — 가슴께(발밑 위 26px)를 가운데로 (미니 뷰 회의 화면은 일반보다 0.75배 멀리서 본다)
    const avg = (f: (a: Actor) => number) => inRoom.reduce((n, a) => n + f(a), 0) / inRoom.length
    return { x: avg((a) => a.container.x), y: avg((a) => a.container.y) - 26 }
  }

  /** 이 장면에 있는 직원의 미니 뷰 기준점 (발밑 — 방 안으로 당김, 퇴근이면 자기 자리). 없으면 null */
  actorTarget(staffId: string): Phaser.GameObjects.Container | null {
    return this.actors.get(staffId)?.focus ?? null
  }

  /** 미니 뷰에 그리지 않을 것 (마우스 정보창) */
  get miniIgnore(): Phaser.GameObjects.GameObject[] {
    return [this.tooltip]
  }

  /** 지도 영역: 캔버스 아래쪽에 미니 뷰 칸이 붙어 있어 메인 카메라는 지도 영역만 그린다 */
  setMapViewport(width: number, height: number, isVisible: boolean) {
    this.mapViewport = { w: Math.max(1, width), h: Math.max(1, height), isVisible }
    this.viewportAt = performance.now()
    this.applyMapViewport()
    this.fitCamera()
  }

  private applyMapViewport() {
    const v = this.mapViewport
    if (!v) return
    const cam = this.cameras.main
    cam.setViewport(0, 0, v.w, v.h)
    cam.setVisible(v.isVisible && this.fixedFloor === null)
  }

  // ── 꾸미기 컨트롤러(iso/decor)가 쓰는 것 ──────────────────

  /** 세계 좌표의 칸 */
  cellAt(wx: number, wy: number) {
    return toGrid(this.o, wx, wy)
  }

  /** 칸 꼭짓점의 세계 좌표 */
  worldOf(gx: number, gy: number) {
    return this.wpt(gx, gy)
  }

  /** 품목 그림 텍스처와 기준점 (들고 있는 가구 그림) */
  itemArt(itemId: string, rot: Rot) {
    const key = this.itemTexture(itemId, rot)
    const m = this.artMeta.get(key)!
    return { key, ax: m.ax, ay: m.ay }
  }

  /** 들어 옮기는 가구는 제자리 그림을 숨긴다 (세트면 여럿, null이면 모두 보임) */
  setItemHidden(uids: string | string[] | null) {
    this.hiddenUids = new Set(uids === null ? [] : Array.isArray(uids) ? uids : [uids])
    for (const [id, parts] of this.parts) for (const p of parts) p.img.setVisible(!this.hiddenUids.has(id))
  }

  /** 이 층에 보이는 가구 (기본 자리 포함) */
  get floorItemsShown() {
    return this.items
  }

  /** 세계 좌표 아래 가구 그림 — 그림의 투명하지 않은 점을 눌렀을 때. 겹치면 앞(깊이가 큰) 것 */
  itemAtPoint(wx: number, wy: number): GridItem | null {
    let best: { item: GridItem; depth: number } | null = null
    for (const [id, parts] of this.parts) {
      if (this.hiddenUids.has(id)) continue
      for (const { img, item } of parts) {
        if (!img.visible || item.floor !== this.floor) continue
        const x = Math.floor(wx - (img.x - img.originX * img.width))
        const y = Math.floor(wy - (img.y - img.originY * img.height))
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
        if (this.textures.getPixelAlpha(x, y, img.texture.key) < 24) continue
        if (!best || img.depth > best.depth) best = { item, depth: img.depth }
      }
    }
    return best?.item ?? null
  }

  /** 자리 기억의 의자를 새 의자로 옮긴다 (기본 자리를 저장 가구로 바꿀 때 직원이 그 자리에 그대로 앉도록) */
  moveSeatMemory(fromUid: string, toUid: string) {
    this.seatMemory = new Map([...this.seatMemory].map(([id, m]) => [id, m.seat.startsWith(`${fromUid}#`) ? { ...m, seat: `${toUid}${m.seat.slice(fromUid.length)}` } : m]))
  }

  /** 놓인 가구를 몇 번 깜빡인다 (서랍의 "모두 놓음" 카드) */
  flashItem(uid: string) {
    const imgs = (this.parts.get(uid) ?? []).map((p) => p.img)
    if (!imgs.length) return
    this.tweens.killTweensOf(imgs)
    this.tweens.add({ targets: imgs, alpha: 0.25, duration: 180, yoyo: true, repeat: 2, onComplete: () => imgs.forEach((i) => i.setAlpha(1)) })
  }

  /** 의자가 모자라 깐 기본 자리 수 (의자 수 — 기본 자리는 책상·의자 한 벌) */
  get autoSeatCount() {
    return this.items.filter((it) => it.uid.startsWith('auto:') && specOf(it.itemId).kind === 'chair').length
  }

  /** 이 층 직원 수 (자리 모자람 확인) */
  get staffHere() {
    return this.actors.size
  }

  // ── 개발·캡처용 ───────────────────────────────────────

  /** 시험·캡처용 요약 */
  debugState() {
    const actors = [...this.actors.values()]
    return {
      level: this.level,
      floor: this.floor,
      room: this.room,
      items: this.items.length,
      autoSeats: this.items.filter((it) => isAutoSeat(it.uid)).length,
      staff: actors.length,
      seated: actors.filter((a) => a.isSitting).length,
      walking: actors.filter((a) => a.path.length > 0).length,
      zoom: this.cameras.main.zoom,
    }
  }
}
