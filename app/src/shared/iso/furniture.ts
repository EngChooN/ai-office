// 칸 가구 규격·돌리기 (docs/specs/office-iso-tech.md 2-1·2-2절). 크기는 김기획 문서(office-iso-levels.md) 2-3절 제안값
import { ITEM_ACTIONS } from './actions.ts'
import type { Cell } from './grid.ts'

/** 돌리기 = 사람이 보는 방향. r0 ↙(+gy) · r1 ↖(−gx) · r2 ↗(−gy) · r3 ↘(+gx) (이디자 문서 5번) */
export type Rot = 0 | 1 | 2 | 3
/** flat: 러그처럼 밟고 지나가는 것 (object와 겹쳐 놓을 수 있다) */
export type Layer = 'object' | 'flat'
/** seat: 앉을 수 있지만 근무 자리는 아님(소파) */
export type FurnitureKind = 'desk' | 'chair' | 'seat' | 'deco'

export interface FurnitureSpot {
  /** r0 기준 상대 칸. 차지 칸 안이면 앉는 자리, 밖이면 '쓰는 자리'(그 앞에 선다) */
  at: [number, number]
  face: Rot
  use: 'sit' | 'use'
  /** ITEM_ACTIONS 키 */
  action?: string
}

export interface FurnitureSpec {
  /** r0 기준 [w(gx), d(gy)] */
  size: [number, number]
  layer: Layer
  kind: FurnitureKind
  spots?: FurnitureSpot[]
  /** 서 있는 직원을 다 가리는 높은 구조물(가벽) — 뒤에 직원이 가려지면 장면이 안쪽 벽처럼 반투명(depth.ts hidesMover · WALL_FADE)으로 그린다 */
  isTallWall?: boolean
}

/** 저장 형식 (shop.grid의 한 줄). floor는 1부터 */
export interface GridItem {
  uid: string
  itemId: string
  floor: number
  gx: number
  gy: number
  rot: Rot
  /** 눌러서 켜고 끄는 소품(연출 B)을 켜 둠 — 옮기기·치우기 되돌리기에도 따라간다. 없으면 꺼짐 */
  isOn?: boolean
}

/** 책상 세트 옮기기의 한 부분 (책상 또는 의자). uid가 저장 가구면 그 가구를 옮기고, 기본 자리(auto:)면 toUid로 새로 저장한다 */
export interface SeatSetPart {
  uid: string
  toUid?: string
  itemId: string
  gx: number
  gy: number
  rot: Rot
}

/** 놓기 검사·차지 칸 계산에 필요한 만큼 */
export type GridPose = Pick<GridItem, 'itemId' | 'gx' | 'gy' | 'rot'>

// ── 규격 표 ──────────────────────────────────────────

const spec = (w: number, d: number, kind: FurnitureKind = 'deco', spots?: FurnitureSpot[], layer: Layer = 'object'): FurnitureSpec => ({ size: [w, d], layer, kind, ...(spots ? { spots } : {}) })
/** 앉는 자리: 차지 칸 칸마다, 앞(+gy)을 본다 */
const sits = (w: number, action?: string): FurnitureSpot[] => Array.from({ length: w }, (_, i) => ({ at: [i, 0], face: 0, use: 'sit', ...(action ? { action } : {}) }))
const chair = (): FurnitureSpec => spec(1, 1, 'chair', sits(1))
const desk = (w: number, d = 1) => spec(w, d, 'desk')
const seat = (w: number, d = 1, action?: string) => spec(w, d, 'seat', sits(w, action))
const rug = (w: number, d: number) => spec(w, d, 'deco', undefined, 'flat')
/** 양옆에 서서 쓰는 가구 (테이블 축구·당구대·탁구대) */
const sides = (w: number, d: number, action: string) =>
  spec(w, d, 'deco', [
    { at: [-1, 0], face: 3, use: 'use', action },
    { at: [w, 0], face: 1, use: 'use', action },
  ])
/** 파티션·가벽 (docs/specs/partition-items.md): 일자형 L칸, 쓰는 자리 없음. 길은 다른 object 가구처럼 막는다(path.ts) */
const divider = (L: number, isTall: boolean): FurnitureSpec => ({ ...spec(L, 1), ...(isTall ? { isTallWall: true } : {}) })
/** 앞(+gy)에 서서 쓰는 가구 */
const front = (w: number, d: number, action?: string) => spec(w, d, 'deco', [{ at: [0, d], face: 2, use: 'use', ...(action ? { action } : {}) }])

/** 칸 크기·자리를 따로 정한 품목. 나머지는 specOf()에서 기본값(1×1 object, 행동이 있으면 앞자리 하나) */
export const FURNITURE: Record<string, FurnitureSpec> = {
  // 기본 자리 (서랍·autoSeats의 기본 모양)
  desk: desk(2),
  chair: chair(),

  // 상점 가구 (economy.ts SHOP_ITEMS) — 2-3절 비슷한 품목의 크기를 따름
  'sofa-green': seat(2, 1, 'sofa-green'),
  'sofa-pink': seat(2, 1, 'sofa-pink'),
  'beanbag-blue': seat(1),
  bookshelf: front(2, 1, 'bookshelf'),
  whiteboard: front(2, 1),
  /** 연출 B 파일럿 (눌러서 켜고 끄기) — 직원이 쓰는 자리는 없다 */
  tv: spec(2, 1),
  'rug-round': rug(2, 2),
  'rug-persian': rug(3, 2),
  foosball: sides(2, 1, 'foosball'),
  'pool-table': sides(3, 2, 'pool-table'),
  treadmill: front(1, 2, 'treadmill'),
  piano: front(2, 2, 'piano'),
  aquarium: front(2, 1, 'aquarium'),
  trophy: front(2, 1),
  // Lv.11~20 상점 가구 (0.14.0) — 1×1은 기본값이라 뺐다
  'massage-chair': seat(1),
  fireplace: spec(2, 1),
  'yoga-mat': rug(1, 2),
  'climbing-wall': spec(2, 1),
  'sushi-belt': front(3, 1),
  greenhouse: spec(2, 2),
  planetarium: spec(2, 2),
  'red-carpet': rug(1, 3),
  helipad: rug(2, 2),
  'partition-low-fabric': divider(2, false),
  'partition-low-glass': divider(3, false),
  'partition-wall-white': divider(1, true),
  'partition-wall-wood': divider(3, true),
  'partition-low-fabric-1': divider(1, false),
  'partition-low-wood': divider(2, false),
  'partition-wall-wood-1': divider(1, true),
  'partition-wall-brick': divider(2, true),
  'partition-wall-green': divider(2, true),
  'partition-wall-glass': divider(2, true),

  // 레벨 전용 가구 (2-3절). 상점에 아직 없는 품목 — id는 임시이고 상점 품목을 만들 때(B1·김기획) 같이 확정한다
  'lv-folding-desk': desk(2),
  'lv-folding-chair': chair(),
  'lv-kettle-shelf': front(1, 1),
  'lv-tool-shelf': front(2, 1),
  'lv-studio-sofa': seat(2),
  'lv-hanger': spec(1, 1),
  'lv-meeting-table': desk(2, 2),
  'lv-cubicle-desk': desk(2),
  'lv-glass-table': desk(3, 2),
  'lv-projector': spec(1, 1),
  'lv-stair-plants': spec(1, 1),
  'lv-mailbox': spec(1, 1),
  'lv-fridge': front(1, 1),
  'lv-vending': front(1, 1),
  'lv-reception': desk(3),
  'lv-waiting-sofa': seat(2),
  'lv-pingpong': sides(3, 2, 'prop-pingpong'),
  'lv-hall-bench': seat(2),
  'lv-floor-sign': spec(1, 1),
  'lv-sleep-pod': spec(1, 2),
  'lv-shower': front(1, 1),
  'lv-tall-bookshelf': front(2, 1, 'bookshelf'),
  'lv-reading-chair': seat(1),
  'lv-dumbbell': front(2, 1),
  'lv-espresso-bar': front(3, 1, 'coffee-machine'),
  'lv-bar-stool': seat(1),
  'lv-long-table': desk(4, 2),
  'lv-salad-bar': front(2, 1),
  'lv-stage': spec(4, 2),
  'lv-hall-seats': seat(4),
  'lv-bbq': front(2, 1),
  'lv-hammock': seat(2),
  'lv-grass-pot': spec(1, 1),
  'lv-lounge-sofa': seat(3, 2),
  'lv-telescope': front(1, 1),
  'lv-trophy-case': front(2, 1),
  'lv-hall-of-fame': spec(3, 1),
  'lv-ceo-desk': desk(3, 2),
  'lv-fountain': spec(2, 2),

  // prop-* 소품 — 예전 settings.layout 고정 소품을 서랍 가구로 (3절 3번). 가격 0·판매 안 함
  'prop-printer': front(1, 1),
  'prop-cabinets': spec(2, 1),
  'prop-trash': spec(1, 1),
  'prop-lamp': spec(1, 1),
  'prop-plant': spec(1, 1),
  'prop-aquarium': front(2, 1, 'prop-aquarium'),
  'prop-trophies': front(2, 1),
  'prop-coffeeCorner': front(2, 1, 'coffee-machine'),
  'prop-kitchen': front(3, 1),
  'prop-cooler': front(1, 1),
  'prop-sofa': seat(2),
  'prop-pingpong': sides(3, 2, 'prop-pingpong'),
  'prop-arcade': front(1, 1, 'prop-arcade'),
  'prop-napPod': spec(1, 2),
  'prop-reception': desk(3),
  'prop-lobbyTrophies': front(2, 1),
  'prop-bbq': front(2, 1),
  'prop-fountain': spec(2, 2),

  // zone-* 휴게 구역 기본 가구 (office-iso-spaces.md 2-4절) — ZONE_LAYOUTS로 지급·배치. 가격 0·판매 안 함
  'zone-low-table': spec(2, 1),
  'zone-bistro': spec(1, 1),
  'zone-high-table': spec(1, 1),
  'zone-menu-board': spec(1, 1),
}

/** 품목 규격. 표에 없으면 1×1 object — ITEM_ACTIONS에 있으면 앞에 서는 자리 하나 */
export function specOf(itemId: string): FurnitureSpec {
  return FURNITURE[itemId] ?? (ITEM_ACTIONS[itemId] ? front(1, 1, itemId) : spec(1, 1))
}

/** 꾸미기 서랍 분류 탭 (office-iso-levels.md 6-2절). 기본 지급 접이식 책상·의자(lv-*)는 '책상·의자'와 '레벨 전용' 둘 다에 보인다 */
export type FurnitureGroup = 'all' | 'seat' | 'furniture' | 'prop' | 'level'
export const FURNITURE_GROUPS: { value: FurnitureGroup; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'seat', label: '책상·의자' },
  { value: 'furniture', label: '가구' },
  { value: 'prop', label: '소품' },
  { value: 'level', label: '레벨 전용' },
]
export function isInGroup(itemId: string, group: FurnitureGroup) {
  const kind = specOf(itemId).kind
  const isSeat = kind === 'desk' || kind === 'chair'
  if (group === 'seat') return isSeat
  if (group === 'level') return itemId.startsWith('lv-')
  const isProp = itemId.startsWith('prop-') || itemId.startsWith('zone-')
  if (group === 'prop') return isProp
  if (group === 'furniture') return !isSeat && !itemId.startsWith('lv-') && !isProp
  return true
}

// ── 돌리기 ───────────────────────────────────────────

/** 한 번(90°) 돌릴 때 r0 기준 칸 (x, y) → 새 칸. 크기 [w, d]는 [d, w]가 된다 */
const turn = ([x, y]: [number, number], d: number): [number, number] => [d - 1 - y, x]

export interface RotatedSpec extends FurnitureSpec {
  rot: Rot
}

/** 차지 칸(홀수 rot이면 w↔d)·자리 좌표·방향을 함께 돌린다. 텍스처 키는 `item-{itemId}-r{rot}` */
export function rotate(s: FurnitureSpec, rot: number): RotatedSpec {
  const r = (((rot % 4) + 4) % 4) as Rot
  let [w, d] = s.size
  let spots = s.spots?.map((p) => ({ ...p, at: [...p.at] as [number, number] }))
  for (let i = 0; i < r; i++) {
    spots = spots?.map((p) => ({ ...p, at: turn(p.at, d), face: ((p.face + 1) % 4) as Rot }))
    ;[w, d] = [d, w]
  }
  return { ...s, size: [w, d], rot: r, ...(spots ? { spots } : {}) }
}

/** 돌린 뒤 차지하는 칸 수 */
export function sizeOf(itemId: string, rot: Rot) {
  const [w, d] = rotate(specOf(itemId), rot).size
  return { w, d }
}

/** 놓인 자리에서 차지하는 칸 (gy, gx 순) */
export function cellsOf(p: GridPose): Cell[] {
  const { w, d } = sizeOf(p.itemId, p.rot)
  const out: Cell[] = []
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) out.push({ gx: p.gx + x, gy: p.gy + y })
  return out
}

export interface PlacedSpot extends Cell {
  face: Rot
  use: 'sit' | 'use'
  action?: string
  /** 차지 칸 안의 자리(의자·소파) — 그 칸은 걸어 지나갈 수 없고 앉으러만 들어간다 */
  isInside: boolean
}

/** 놓인 가구의 자리 (돌리기 반영, 바닥 칸 좌표) */
export function spotsOf(p: GridPose): PlacedSpot[] {
  const r = rotate(specOf(p.itemId), p.rot)
  const [w, d] = r.size
  return (r.spots ?? []).map(({ at: [x, y], ...rest }) => ({ ...rest, gx: p.gx + x, gy: p.gy + y, isInside: x >= 0 && y >= 0 && x < w && y < d }))
}

/** 보는 방향으로 한 칸 (r0 ↙ +gy · r1 ↖ −gx · r2 ↗ −gy · r3 ↘ +gx) */
export const FACE_STEP: Record<Rot, [number, number]> = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] }

/** 칸 차이(걷는 방향) → 사람이 보는 방향 */
export function facingOf(dx: number, dy: number): Rot {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 1
  return dy < 0 ? 2 : 0
}
