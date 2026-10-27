// 회의실 배치표 (office-iso-spaces.md 1-5·3-4절): 단계별 문자 격자를 읽어 크기·테이블·의자·문·단상을 만든다. 순수 함수
// 기호: c 의자 · T 테이블 · P 단상 · d 문 · . 통로. 위쪽 줄(gy=0)이 뒤 벽, 문은 앞줄 가운데
import { meetingRoomOf } from '../officeLevel.ts'
import { facingOf, type Rot } from './furniture.ts'
import type { Cell } from './grid.ts'

export type MeetingTier = 'folding' | 'wood' | 'oak' | 'walnut' | 'board' | 'hall'

const GRIDS: Record<MeetingTier, readonly string[]> = {
  folding: ['.cc.', 'cTTc', 'cTTc', '.cc.'],
  wood: ['.cccc.', 'cTTTTc', '.cccc.', '......'],
  oak: ['.ccccc.', 'cTTTTTc', '.ccccc.', '...d...'],
  walnut: ['.cccccc.', 'cTTTTTTc', '.cccccc.', '...d....'],
  board: ['.ccccccc.', 'cTTTTTTTc', '.ccccccc.', '....d....'],
  hall: ['.PPPPP.', '.......', '.ccccc.', '.ccccc.', '.ccccc.', '.ccccc.', '...d...'],
}

export interface MeetingSeat extends Cell {
  face: Rot
}

export interface MeetingLayout {
  tier: MeetingTier
  /** 의자 수 = 정원 */
  capacity: number
  w: number
  d: number
  /** 벽(유리)과 문이 있는 방. 접이식·원목은 트인 자리 */
  isWalled: boolean
  /** 문 칸 (트인 자리는 없다). 로컬 칸 */
  door: Cell | null
  /** 테이블·단상 (가로 len × 세로 1 또는 2×2 원탁). 로컬 왼쪽 뒤 칸 */
  table: (Cell & { w: number; d: number }) | null
  podium: (Cell & { w: number; d: number }) | null
  /** 앉는 순서대로 (참석 순서 i → seats[i]). 로컬 칸 */
  seats: MeetingSeat[]
  /** 지나갈 수 없는 칸 (테이블·단상). 로컬 칸 */
  solid: Cell[]
  /** 강당 좌석 줄의 왼쪽 칸과 석 수 (줄 그림 한 장씩) */
  rows: (Cell & { n: number })[]
  /** 미니 뷰가 비출 로컬 칸 (실수) — 강당은 단상 쪽으로 반 칸 당긴다 */
  focus: { x: number; y: number }
}

const cache = new Map<MeetingTier, MeetingLayout>()

export function meetingLayoutOfTier(tier: MeetingTier): MeetingLayout {
  const hit = cache.get(tier)
  if (hit) return hit
  const grid = GRIDS[tier]
  const d = grid.length
  const w = grid[0].length
  const at = (ch: string) => {
    const out: Cell[] = []
    for (let gy = 0; gy < d; gy++) for (let gx = 0; gx < w; gx++) if (grid[gy][gx] === ch) out.push({ gx, gy })
    return out
  }
  const box = (cells: Cell[]) => {
    if (!cells.length) return null
    const x0 = Math.min(...cells.map((c) => c.gx))
    const y0 = Math.min(...cells.map((c) => c.gy))
    return { gx: x0, gy: y0, w: Math.max(...cells.map((c) => c.gx)) + 1 - x0, d: Math.max(...cells.map((c) => c.gy)) + 1 - y0 }
  }
  const tCells = at('T')
  const pCells = at('P')
  const table = box(tCells)
  const podium = box(pCells)
  const isHall = tier === 'hall'
  // 의자는 가장 가까운 테이블 칸을 본다 (가운데를 보면 긴 테이블 끝 쪽 의자가 옆을 보게 된다)
  const near = (c: Cell) => [...tCells].sort((p, q) => Math.abs(p.gx - c.gx) + Math.abs(p.gy - c.gy) - (Math.abs(q.gx - c.gx) + Math.abs(q.gy - c.gy)))[0]
  const seats: MeetingSeat[] = at('c').map((c) => ({ ...c, face: isHall || !tCells.length ? 2 : facingOf(near(c).gx - c.gx, near(c).gy - c.gy) }))
  // 순서: 마주 보게 앉도록 열 먼저(세로로 짝), 강당은 단상 가까운 줄부터
  seats.sort((p, q) => (isHall ? p.gy - q.gy || p.gx - q.gx : p.gx - q.gx || p.gy - q.gy))
  const door = at('d')[0] ?? null
  const rows: MeetingLayout['rows'] = isHall ? [...new Set(seats.map((s) => s.gy))].map((gy) => ({ gx: Math.min(...seats.filter((s) => s.gy === gy).map((s) => s.gx)), gy, n: seats.filter((s) => s.gy === gy).length })) : []
  const out: MeetingLayout = {
    tier,
    capacity: seats.length,
    w,
    d,
    isWalled: tier === 'oak' || tier === 'walnut' || tier === 'board' || isHall,
    door,
    table,
    podium,
    seats,
    solid: [...tCells, ...pCells],
    rows,
    focus: isHall && podium ? { x: w / 2, y: d / 2 - 0.5 } : { x: w / 2, y: d / 2 },
  }
  cache.set(tier, out)
  return out
}

/**
 * 참석 순서(order)의 의자 — 층 칸 좌표. 가구(파티션 등)가 놓여 막힌 의자는 건너뛰고 다음 의자를 쓴다.
 * x0 = 회의실 왼쪽 칸. 앉을 의자가 모자라면 null (회의실 빈 칸에 선다)
 */
export function meetingSeatFor(l: MeetingLayout, x0: number, order: number, isFree: (gx: number, gy: number) => boolean): MeetingSeat | null {
  if (order < 0) return null
  const free = l.seats.map((s) => ({ ...s, gx: x0 + s.gx })).filter((s) => isFree(s.gx, s.gy))
  return free[order] ?? null
}

/** 레벨의 회의실 배치 */
export const meetingLayoutOf = (level: number) => meetingLayoutOfTier(meetingRoomOf(level).tier as MeetingTier)

/** 정원으로 단계를 찾는다 (fixedTilesFor가 정원만 받는다). 같은 정원이 없으면 그보다 크지 않은 가장 큰 단계, 없으면 접이식 */
export function meetingLayoutOfCapacity(capacity: number): MeetingLayout {
  const tiers = Object.keys(GRIDS) as MeetingTier[]
  const all = tiers.map(meetingLayoutOfTier)
  return all.find((l) => l.capacity === capacity) ?? [...all].reverse().find((l) => l.capacity <= capacity) ?? all[0]
}
