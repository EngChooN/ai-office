// 아이소메트릭 사무실의 칸 좌표 (docs/specs/office-iso-tech.md 1-1절 · office-iso-art.md 1절)
// Phaser 없이 순수 함수로 둔다 — 화면(사무실 장면·시제품)과 메인 프로세스(저장 전 검사)가 같이 쓴다

/** 칸 하나의 화면(세계) px — 아트 32×16 × PIXEL */
export const TILE_W = 64
export const TILE_H = 32

/** 아트 1px = 화면 2px */
export const PIXEL = 2
/** 마름모 반폭·반높이 (아트 px) — 그림 코드(isoArt)용 */
export const HW = TILE_W / PIXEL / 2
export const HH = TILE_H / PIXEL / 2
/** 벽 높이 (아트 px) = 칸 높이 16 × 3 */
export const WALL_H = 48
/** 바닥판 두께 (아트 px) */
export const SLAB = 4
/** 벽 두께 (칸) */
export const WALL_T = 0.18

/** (0,0) 칸 위 꼭짓점의 세계 좌표 */
export interface Origin {
  x: number
  y: number
}

/** 구역(휴게실·탕비실 등)의 바닥 사각형 — 값은 plan.ts가 아니라 구역 표(P6)가 정한다. 놓기 판정에는 쓰지 않는다 */
export interface ZoneRect {
  id: string
  gx: number
  gy: number
  w: number
  d: number
}

/**
 * 한 층의 칸 표 (docs/specs/office-iso-spaces.md 3-1절). cols×rows는 그 층을 감싸는 상자다.
 * cells가 없으면 상자 전체가 실내 바닥(예전 정사각형 방) — 시험·시제품은 그대로 돈다. 있으면 칸마다 CellKind(plan.ts), 0이면 바닥 없음
 */
export interface Room {
  cols: number
  rows: number
  /** gy * cols + gx 순. 0 없음 · 1 실내 · 2 야외 (plan.ts CellKind) */
  cells?: Uint8Array
  /** 칸 크기 N×N 상자 — 1층 돌출부·테라스를 뺀 크기. 없으면 cols×rows (회의실·계단 자리는 이 상자 기준) */
  box?: { cols: number; rows: number }
  /** 출입구 칸. 없으면 상자 앞 가운데 */
  entrance?: { gx: number; gy: number }
  zones?: ZoneRect[]
}

export interface Cell {
  gx: number
  gy: number
}

/** 칸 좌표 → 세계 px. 한 칸의 바닥 중심은 toWorld(o, gx + 0.5, gy + 0.5). z는 바닥에서 띄운 높이(세계 px) */
export const toWorld = (o: Origin, gx: number, gy: number, z = 0) => ({ x: o.x + ((gx - gy) * TILE_W) / 2, y: o.y + ((gx + gy) * TILE_H) / 2 - z })

/** 세계 px → 그 점이 든 칸 */
export function toGrid(o: Origin, x: number, y: number): Cell {
  const a = (x - o.x) / (TILE_W / 2)
  const b = (y - o.y) / (TILE_H / 2)
  return { gx: Math.floor((a + b) / 2), gy: Math.floor((b - a) / 2) }
}

/** 미니 뷰가 앞쪽 두 변(+gx·+gy)에서 떨어뜨릴 칸 수 — 화면 아래 절반이 방 밖 허공이 되지 않게 */
export const MINI_EDGE = 1.5

/** 미니 뷰가 비출 칸 좌표 (실수). 입구·대기 칸처럼 앞 변에 붙은 곳은 방 안쪽으로 당긴다. 뒤 두 변은 벽이 보이니 그대로 */
export const miniFocus = (room: Room, x: number, y: number) => ({
  x: Math.min(x, Math.max(room.cols / 2, room.cols - MINI_EDGE)),
  y: Math.min(y, Math.max(room.rows / 2, room.rows - MINI_EDGE)),
})

/** 바닥인가 — 상자 안이고 (칸 표가 있으면) 바닥 없음(0)이 아님. 길찾기·놓기·자리 깔기가 모두 이 한 함수로 바닥을 본다 */
export const isInside = (room: Room, gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < room.cols && gy < room.rows && (!room.cells || room.cells[gy * room.cols + gx] !== 0)
/** 칸 크기 상자 (돌출부·테라스 제외) */
export const boxOf = (room: Room) => room.box ?? room
export const cellKey = (room: Room, gx: number, gy: number) => gy * room.cols + gx
export const cellOfKey = (room: Room, k: number): Cell => ({ gx: k % room.cols, gy: Math.floor(k / room.cols) })
