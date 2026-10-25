// 층 평면(칸 표)과 경계 분류 — docs/specs/office-iso-spaces.md 1-1·1-3·3-1절. 순수 함수, 저장하지 않는다(레벨·층에서 계산)
// 장면·메인 검사(shopGrid)·옮기기·외관이 같은 planOf를 읽어야 화면과 메인의 판정이 같다
import { LEVEL_TABLE, levelRowOf } from '../officeLevel.ts'
import type { Cell, Room, ZoneRect } from './grid.ts'
import { zoneRectsOf } from './zoneLayouts.ts'

export type { ZoneRect }

/** 칸 종류 (Room.cells 한 바이트) — enum은 쓰지 않는다(시험이 타입만 지워 돌린다) */
export const CellKind = { None: 0, Indoor: 1, Outdoor: 2 } as const
export type CellKind = (typeof CellKind)[keyof typeof CellKind]

/** 현관 돌출이 생기는 레벨(1줄, 3칸 폭) · 리셉션 로비로 넓어지는 레벨(2줄, 6칸 폭) · 4층 깎인 자리가 옥상 정원(야외)이 되는 레벨 */
export const ENTRY_LEVEL = 2
export const LOBBY_LEVEL = 8
export const GARDEN_LEVEL = 17

/** 1층 오른쪽 테라스: 상자 오른쪽 바깥 3열, 위에서 5줄째(회의실 아래 한 줄 띄움)부터 상자 끝까지 */
const TERRACE_COLS = 3
const TERRACE_TOP = 5

interface Rect {
  x0: number
  y0: number
  /** 끝(포함하지 않음) */
  x1: number
  y1: number
}

/**
 * 깎기 규칙 (위쪽 두 변은 깎지 않는다 — 깎기는 앞쪽 두 변에서만):
 * - 앞변(y)은 늘 상자 앞(N)에서 센다. 한 레벨 올라 N이 늘면 깎은 자리가 앞변을 따라 함께 내려간다
 * - 오른쪽에 붙은 것은 오른쪽 끝(N)에서 센다 · 왼쪽에 붙은 것은 0에서 센다 · ㄷ자 안뜰만 층이 생길 때 정한 열에 선다
 *   → 어느 레벨에서든 다음 레벨의 바닥은 이번 바닥을 모두 품는다(isoPlan.test.mts)
 */
function cutsOf(floor: number, n: number, level: number): { rect: Rect; kind: CellKind }[] {
  const front = (depth: number) => ({ y0: n - depth, y1: n })
  switch (floor) {
    case 2: // ㄱ자 — 앞-오른쪽 4×4
      return [{ rect: { x0: n - 4, x1: n, ...front(4) }, kind: CellKind.None }]
    case 3: {
      // ㄷ자 — 앞 가운데 6×4 안뜰. 열은 3층이 생긴 레벨의 칸 크기로 가운데에 정해 둔다
      const born = LEVEL_TABLE.find((r) => r.floors >= 3)?.grid ?? n
      const x0 = Math.floor((born - 6) / 2)
      return [{ rect: { x0, x1: x0 + 6, ...front(4) }, kind: CellKind.None }]
    }
    case 4: {
      // T자 — 앞 왼쪽 4×3, 앞 오른쪽 6×3. 옥상 정원 레벨부터 깎인 자리가 야외 바닥
      const kind = level >= GARDEN_LEVEL ? CellKind.Outdoor : CellKind.None
      return [
        { rect: { x0: 0, x1: 4, ...front(3) }, kind },
        { rect: { x0: n - 6, x1: n, ...front(3) }, kind },
      ]
    }
    default: // 탑 — 앞 양쪽 5×5 (1-3절 격자는 빈 칸 `·`)
      return [
        { rect: { x0: 0, x1: 5, ...front(5) }, kind: CellKind.None },
        { rect: { x0: n - 5, x1: n, ...front(5) }, kind: CellKind.None },
      ]
  }
}

/** 한 레벨·층의 평면 (같은 입력이면 같은 객체 — 바꾸지 말 것) */
const cache = new Map<number, Room>()

/**
 * 레벨·층의 평면. 층이 그 레벨에 없어도 그 층 모양대로 돌려준다(검사하는 쪽이 층 수를 따로 본다).
 * - 1층: 상자 N×N + 현관·로비 돌출(앞쪽, 야외) + 오른쪽 테라스(야외). 돌출·테라스가 없는 레벨은 cells 없는 정사각형
 * - 2층 ㄱ · 3층 ㄷ · 4층 T · 5층 탑: 상자 N×N에서 앞쪽을 깎는다
 */
export function planOf(level: number, floor: number): Room {
  const row = levelRowOf(level)
  const lv = LEVEL_TABLE.indexOf(row) + 1
  const f = Math.min(5, Math.max(1, Math.floor(floor) || 1))
  const key = lv * 10 + f
  const hit = cache.get(key)
  if (hit) return hit
  const n = row.grid
  const room = f === 1 ? groundPlan(lv, n, row.floors) : cutPlan(lv, n, f)
  const zones = zoneRectsOf(lv, f)
  if (zones.length) room.zones = zones
  cache.set(key, room)
  return room
}

function groundPlan(level: number, n: number, floors: number): Room {
  const depth = level >= LOBBY_LEVEL ? 2 : level >= ENTRY_LEVEL ? 1 : 0
  const hasTerrace = floors >= 2
  const entrance = { gx: Math.floor(n / 2), gy: n + depth - 1 }
  if (!depth && !hasTerrace) return { cols: n, rows: n, entrance }
  const cols = n + (hasTerrace ? TERRACE_COLS : 0)
  const rows = n + depth
  const cells = new Uint8Array(cols * rows)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells[y * cols + x] = CellKind.Indoor
  if (hasTerrace) for (let y = TERRACE_TOP; y < n; y++) for (let x = n; x < n + TERRACE_COLS; x++) cells[y * cols + x] = CellKind.Outdoor
  if (depth) {
    // 로비 돌출의 열은 로비가 생긴 레벨의 가운데에 정해 둔다(칸이 늘어도 앞줄 바닥이 줄지 않게). 현관 돌출은 어차피 다음 레벨에 상자 안이 된다
    const isLobby = level >= LOBBY_LEVEL
    const ex = isLobby ? Math.floor((LEVEL_TABLE[LOBBY_LEVEL - 1].grid) / 2) : entrance.gx
    const [x0, x1] = isLobby ? [ex - 3, ex + 3] : [ex - 1, ex + 2]
    for (let y = n; y < n + depth; y++) for (let x = x0; x < x1; x++) cells[y * cols + x] = CellKind.Outdoor
    entrance.gx = ex
  }
  return { cols, rows, cells, box: { cols: n, rows: n }, entrance }
}

function cutPlan(level: number, n: number, floor: number): Room {
  const cells = new Uint8Array(n * n).fill(CellKind.Indoor)
  for (const { rect, kind } of cutsOf(floor, n, level))
    for (let y = Math.max(0, rect.y0); y < Math.min(n, rect.y1); y++) for (let x = Math.max(0, rect.x0); x < Math.min(n, rect.x1); x++) cells[y * n + x] = kind
  const room: Room = { cols: n, rows: n, cells }
  room.entrance = frontCenterFloor(room)
  return room
}

/** 앞 가운데에서 가장 가까운 바닥 칸 — 안뜰이 앞 가운데에 있는 층(ㄷ자)도 출입구가 바닥 위에 서게 */
function frontCenterFloor(room: Room): Cell {
  const want = { gx: Math.floor(room.cols / 2), gy: room.rows - 1 }
  let best = want
  let bestD = Infinity
  for (let gy = room.rows - 1; gy >= 0; gy--)
    for (let gx = 0; gx < room.cols; gx++) {
      if (kindAt(room, gx, gy) === CellKind.None) continue
      const d = Math.abs(gx - want.gx) + Math.abs(gy - want.gy)
      if (d < bestD) [best, bestD] = [{ gx, gy }, d]
    }
  return best
}

/** 칸 종류 (상자 밖은 없음) */
export function kindAt(room: Room, gx: number, gy: number): CellKind {
  if (gx < 0 || gy < 0 || gx >= room.cols || gy >= room.rows) return CellKind.None
  return room.cells ? (room.cells[gy * room.cols + gx] as CellKind) : CellKind.Indoor
}

/** 실내 바닥인가 (야외 칸은 기본 자리·업무 자리를 깔지 않는다) */
export const isIndoor = (room: Room, gx: number, gy: number) => kindAt(room, gx, gy) === CellKind.Indoor

// ── 경계 분류 (이디자 2-5절 표와 1:1) ─────────────────────────

/**
 * 칸의 변이 어떤 경계인가
 * - outerWall: 바깥 뒤 벽 (상자 가장자리 gx=0·gy=0) · innerWall: 안쪽 벽 (깎인 자리 쪽 뒤 변)
 * - glass: 실내 칸 뒤에 야외가 있는 변(유리벽, 지나갈 수 없음) · sill: 야외 칸 뒤에 실내가 있는 변(낮은 문턱, 지나갈 수 있음)
 * - rail: 야외 칸이 바닥 없음과 닿는 모든 변(난간) · slabSide: 실내 칸 앞쪽(+x·+y)이 바닥 없음(벽 없이 바닥판 옆면만)
 */
export type EdgeKind = 'outerWall' | 'innerWall' | 'glass' | 'sill' | 'rail' | 'slabSide'
/** 변의 방향: x-·y-는 뒤쪽 두 변(이웃이 −x·−y), x+·y+는 앞쪽 두 변 */
export type EdgeSide = 'x-' | 'y-' | 'x+' | 'y+'

export interface Edge extends Cell {
  side: EdgeSide
  kind: EdgeKind
}

const SIDES: readonly { side: EdgeSide; dx: number; dy: number; isBack: boolean }[] = [
  { side: 'x-', dx: -1, dy: 0, isBack: true },
  { side: 'y-', dx: 0, dy: -1, isBack: true },
  { side: 'x+', dx: 1, dy: 0, isBack: false },
  { side: 'y+', dx: 0, dy: 1, isBack: false },
]

const edgeCache = new WeakMap<Room, readonly Edge[]>()

/**
 * 바닥 칸마다 변을 보고 그려야 할 경계를 돌려준다 ((gy, gx) 순, 변은 x-·y-·x+·y+ 순). 읽기 전용 — 방 객체마다 한 번만 계산한다.
 * 뒤쪽 변(x-·y-)은 이웃과의 경계를 한쪽(더 앞 칸)이 맡고, 앞쪽 변(x+·y+)은 이웃이 바닥 없음일 때만 센다 — 같은 경계가 두 번 나오지 않는다
 */
export function edgesOf(room: Room): readonly Edge[] {
  const hit = edgeCache.get(room)
  if (hit) return hit
  const out: Edge[] = []
  for (let gy = 0; gy < room.rows; gy++)
    for (let gx = 0; gx < room.cols; gx++) {
      const k = kindAt(room, gx, gy)
      if (k === CellKind.None) continue
      for (const { side, dx, dy, isBack } of SIDES) {
        const [nx, ny] = [gx + dx, gy + dy]
        const nk = kindAt(room, nx, ny)
        if (nk === CellKind.None) {
          if (k === CellKind.Outdoor) out.push({ gx, gy, side, kind: 'rail' })
          else if (!isBack) out.push({ gx, gy, side, kind: 'slabSide' })
          else out.push({ gx, gy, side, kind: nx < 0 || ny < 0 ? 'outerWall' : 'innerWall' })
        } else if (isBack && k !== nk) out.push({ gx, gy, side, kind: k === CellKind.Indoor ? 'glass' : 'sill' })
      }
    }
  edgeCache.set(room, out)
  return out
}
