// 자리 배정 (기술 설계 6-2절). 결과는 저장하지 않고 배치·인원이 바뀔 때마다 다시 계산한다
// 자리 = 의자(kind 'chair'의 앉는 자리). 의자가 보는 칸에 책상이 붙어 있으면 책상 자리
// 직전 배정(SeatMemory, 장면 메모리에만)을 받으면 그 의자가 남아 있는 직원은 그대로 두고, 새로 온·쫓겨난 직원만 앉힌다 (박패턴 A2 리뷰 1번)
import type { Staff, Team } from '../types'
import type { Cell } from './grid.ts'
import { cellsOf, FACE_STEP, specOf, spotsOf, type GridItem, type Rot } from './furniture.ts'
import { roomOf } from './levels.ts'
import { isIndoor } from './plan.ts'
import { canPlace, type FloorState } from './place.ts'

export interface Seat extends Cell {
  /** 의자 GridItem uid */
  uid: string
  /** 한 의자에 앉는 자리가 여럿일 때 몇 번째인지 */
  slot: number
  face: Rot
  /** 보는 칸에 책상이 있다 (모니터를 그린다) */
  hasDesk: boolean
}

export type SeatStaff = Pick<Staff, 'id' | 'teamId' | 'hiredAt'>
export type SeatTeam = Pick<Team, 'id' | 'kind' | 'leadId'>

/** 섬: 맨해튼 거리 2 이내 의자 묶음 */
const ISLAND_GAP = 2

const bySpot = (a: Seat, b: Seat) => a.gy - b.gy || a.gx - b.gx || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)

/** 의자를 옮겨도 같은 자리로 보는 열쇠 (위치는 넣지 않는다) */
export const seatKey = (s: Pick<Seat, 'uid' | 'slot'>) => `${s.uid}#${s.slot}`

/** 한 층의 근무 자리 — (gy, gx, uid) 순 */
export function seatsOf(items: readonly GridItem[]): Seat[] {
  const deskCells = new Set<string>()
  for (const it of items) if (specOf(it.itemId).kind === 'desk') for (const c of cellsOf(it)) deskCells.add(`${c.gx},${c.gy}`)
  const out: Seat[] = []
  for (const it of items) {
    if (specOf(it.itemId).kind !== 'chair') continue
    let slot = 0
    for (const s of spotsOf(it)) {
      if (s.use !== 'sit') continue
      const [dx, dy] = FACE_STEP[s.face]
      out.push({ uid: it.uid, slot: slot++, gx: s.gx, gy: s.gy, face: s.face, hasDesk: deskCells.has(`${s.gx + dx},${s.gy + dy}`) })
    }
  }
  return out.sort(bySpot)
}

/** 섬 묶기 (BFS). 섬 순서와 섬 안 순서는 (gy, gx, uid) */
export function islandsOf(seats: readonly Seat[]): Seat[][] {
  const sorted = [...seats].sort(bySpot)
  const seen = new Set<number>()
  const out: Seat[][] = []
  sorted.forEach((_, i) => {
    if (seen.has(i)) return
    seen.add(i)
    const island: Seat[] = []
    for (const queue = [i]; queue.length; ) {
      const cur = sorted[queue.shift()!]
      island.push(cur)
      sorted.forEach((o, j) => {
        if (!seen.has(j) && Math.abs(o.gx - cur.gx) + Math.abs(o.gy - cur.gy) <= ISLAND_GAP) {
          seen.add(j)
          queue.push(j)
        }
      })
    }
    out.push(island.sort(bySpot))
  })
  return out
}

const NO_TEAM = '__none__'
/** 자리 배정에서 쓰는 팀 열쇠 (팀이 없거나 없어진 팀이면 '팀 없음') */
const teamKeyOf = (s: SeatStaff, teams: readonly SeatTeam[]) => (s.teamId && teams.some((t) => t.id === s.teamId) ? s.teamId : NO_TEAM)

/** 팀별 묶음 — 순서는 예전 layoutDesks와 같음(고용 팀 → 팀 없음 → 프로젝트 팀), 팀 안은 리드 먼저·고용 순 */
export function teamGroups<S extends SeatStaff>(staff: readonly S[], teams: readonly SeatTeam[]): S[][] {
  const order = [...teams.filter((t) => t.kind === 'hired').map((t) => t.id), NO_TEAM, ...teams.filter((t) => t.kind === 'project').map((t) => t.id)]
  const groups = new Map<string, S[]>()
  for (const s of staff) {
    const key = teamKeyOf(s, teams)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return order.flatMap((key) => {
    const lead = teams.find((t) => t.id === key)?.leadId
    const members = (groups.get(key) ?? []).sort((a, b) => Number(b.id === lead) - Number(a.id === lead) || a.hiredAt - b.hiredAt || (a.id < b.id ? -1 : 1))
    return members.length ? [members] : []
  })
}

/** 직전 배정: 직원 id → 그때 앉은 자리 열쇠·팀 (저장하지 않는다) */
export type SeatMemory = ReadonlyMap<string, { seat: string; team: string }>

export interface SeatPlan {
  /** 직원 id → 자리 */
  seats: Map<string, Seat>
  /** 자리가 모자라 못 앉은 직원 (팀 순서) */
  standing: string[]
  /** 다음 배정에 넘길 기억 */
  memory: Map<string, { seat: string; team: string }>
}

/**
 * 직원을 자리에 앉힌다.
 * 1. prev가 있으면: 팀이 그대로이고 그 의자가 남아 있는 직원은 그 자리 그대로 (의자를 옮기면 따라간다)
 * 2. 나머지는 인원 많은 팀부터 — 같은 팀이 이미 앉은 섬 → 다 들어가는 섬 중 가장 작은 섬 → 남은 자리가 많은 섬 순.
 *    섬 안에서는 위치 순(gy, gx)으로 빈자리를 채워 팀이 붙어 앉는다
 */
export function assignSeats(seats: readonly Seat[], staff: readonly SeatStaff[], teams: readonly SeatTeam[], prev?: SeatMemory): SeatPlan {
  const islands = islandsOf(seats)
  const islandOf = new Map<string, number>()
  islands.forEach((isl, i) => isl.forEach((s) => islandOf.set(seatKey(s), i)))
  const taken = new Set<string>()
  const free = (i: number) => islands[i].filter((s) => !taken.has(seatKey(s))).length
  const plan: SeatPlan = { seats: new Map(), standing: [], memory: new Map() }
  const sit = (id: string, team: string, s: Seat) => {
    taken.add(seatKey(s))
    plan.seats.set(id, s)
    plan.memory.set(id, { seat: seatKey(s), team })
  }

  // 1. 직전 자리 지키기
  const groups = teamGroups(staff, teams).map((g, order) => ({ g, order, team: teamKeyOf(g[0], teams), rest: [] as SeatStaff[] }))
  const seatByKey = new Map(seats.map((s) => [seatKey(s), s]))
  for (const grp of groups)
    for (const m of grp.g) {
      const was = prev?.get(m.id)
      const s = was && was.team === grp.team ? seatByKey.get(was.seat) : undefined
      if (s && !taken.has(was!.seat)) sit(m.id, grp.team, s)
      else grp.rest.push(m)
    }

  // 2. 새로 앉히기
  const all = islands.map((_, i) => i)
  for (const { rest, team } of groups.filter((x) => x.rest.length).sort((a, b) => b.rest.length - a.rest.length || a.order - b.order)) {
    const home = new Map<number, number>()
    for (const [id, s] of plan.seats) {
      if (plan.memory.get(id)?.team !== team) continue
      const i = islandOf.get(seatKey(s))!
      home.set(i, (home.get(i) ?? 0) + 1)
    }
    const homes = [...home.keys()].sort((a, b) => home.get(b)! - home.get(a)! || a - b)
    const others = all.filter((i) => !home.has(i))
    const left = rest.length - homes.reduce((n, i) => n + free(i), 0)
    const fits = left > 0 ? others.filter((i) => free(i) >= left) : []
    const queue = [...homes, ...(fits.length ? [fits.sort((a, b) => free(a) - free(b) || a - b)[0]] : []), ...others.sort((a, b) => free(b) - free(a) || a - b)]
    let k = 0
    for (const i of queue)
      for (const s of islands[i]) {
        if (k >= rest.length) break
        if (!taken.has(seatKey(s))) sit(rest[k++].id, team, s)
      }
    for (; k < rest.length; k++) plan.standing.push(rest[k].id)
  }
  return plan
}

/** 기본 자리 uid 접두사 — 저장하지 않는 가상 가구 */
export const AUTO_SEAT_PREFIX = 'auto:'
export const isAutoSeat = (uid: string) => uid.startsWith(AUTO_SEAT_PREFIX)

/** 기본 자리 줄 간격: 통로 · 의자 · 책상이 3줄마다 되풀이된다 (뒤 벽 앞 gy=0이 통로라 의자에 뒤에서 들어간다) */
export const AISLE_ROWS = 3
/** 기본 자리 칸 간격: 책상 3개(6칸)마다 한 칸을 비워 앞뒤 통로를 잇는다 */
export const AISLE_COLS = 7
/** 통로를 남기는 기본 자리 위치인가 (의자 칸 기준) */
export const isAisleSlot = (gx: number, gy: number) => gy % AISLE_ROWS === 1 && gx % AISLE_COLS < AISLE_COLS - 1 && (gx % AISLE_COLS) % 2 === 0

/**
 * 자리가 need개 모자랄 때 기본 자리(책상 2×1 + 앞에 의자 1×1)를 놓을 곳을 뒤쪽 줄부터 찾는다.
 * 돌려주는 가구는 저장하지 않는 가상 가구 — uid는 의자 위치 `auto:{floor}:{gx},{gy}c|d`라 다른 기본 자리가 밀려도 이름이 그대로다.
 * prev(직전 기본 자리)를 주면 아직 놓을 수 있는 것부터 그 자리에 다시 둔다 (가구 하나 놓아도 기본 자리 직원이 그대로). 빈 칸이 없으면 찾은 만큼만.
 * 먼저 통로를 남기는 칸(AISLE_ROWS·AISLE_COLS)에만 놓고, 모자라면 남은 빈 칸에 채운다 (office-iso-spaces.md 3-5절 O3)
 */
export function autoSeats(state: FloorState, need: number, prev: readonly GridItem[] = []): GridItem[] {
  const out: GridItem[] = []
  if (need <= 0) return out
  const room = state.room ?? roomOf(state.level, state.floor)
  const view: FloorState = { ...state, owned: undefined, items: [...state.items] }
  const tryPut = (gx: number, gy: number) => {
    const id = `${AUTO_SEAT_PREFIX}${state.floor}:${gx},${gy}`
    const chair: GridItem = { uid: `${id}c`, itemId: 'chair', floor: state.floor, gx, gy, rot: 0 }
    const desk: GridItem = { uid: `${id}d`, itemId: 'desk', floor: state.floor, gx, gy: gy + 1, rot: 0 }
    // 야외 칸(테라스·현관 앞·옥상 정원)에는 기본 자리를 깔지 않는다
    if (![chair, desk].every((it) => cellsOf(it).every((c) => isIndoor(room, c.gx, c.gy)))) return
    if (!canPlace(view, desk).ok) return
    const withDesk: FloorState = { ...view, items: [...view.items, desk] }
    if (!canPlace(withDesk, chair).ok) return
    view.items = [...withDesk.items, chair]
    out.push(desk, chair)
  }
  for (const c of prev) if (c.itemId === 'chair' && isAutoSeat(c.uid) && out.length < need * 2) tryPut(c.gx, c.gy)
  const { cols, rows } = room
  for (let gy = 0; gy < rows - 1 && out.length < need * 2; gy++) for (let gx = 0; gx < cols - 1 && out.length < need * 2; gx++) if (isAisleSlot(gx, gy)) tryPut(gx, gy)
  for (let gy = 0; gy < rows - 1 && out.length < need * 2; gy++) for (let gx = 0; gx < cols - 1 && out.length < need * 2; gx++) tryPut(gx, gy)
  return out
}
