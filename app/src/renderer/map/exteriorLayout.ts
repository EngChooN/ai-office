import { HH, HW } from '../../shared/iso/grid.ts'
import { artExteriorBoard, artNeighbors, type ExteriorBoard, type Pt } from './iso/exteriorArt.ts'

// 새 사무실 외관 화면의 배치와 누르기 판정 — DOM 없이 돌아가는 부분만 (scripts/exteriorHit.test.mts가 node로 바로 읽는다).
// 좌표는 논리 px(아트 px). 화면 px → 논리 px 변환도 여기서 한다

/** 부지 둘레에 최소로 남기는 여백 (논리 px) */
const MARGIN = 24

type Rect = { x: number; y: number; w: number; h: number }

export interface DioramaLayout {
  board: ExteriorBoard
  /** 논리 크기 (캔버스 W×H) */
  W: number
  H: number
  /** 부지 그림의 왼쪽 위 (논리 px) */
  ox: number
  oy: number
  /** 건물 그림을 감싸는 사각형 (키보드 초점 표시용) · 출입문 */
  body: Rect
  door: Rect
  /** 내 사무실 핀이 가리키는 곳 (건물 가운데 세로줄의 맨 위 픽셀 = 지붕 꼭대기) */
  pin: { x: number; y: number }
  /** 내 사무실인가 (건물 그림 또는 부지 땅, 이웃 건물·가로등이 덮은 곳은 빼고) — 누르면 들어간다 */
  hit: (x: number, y: number) => boolean
}

/** 거리 전체의 논리 크기 — 화면 크기와 상관없이 레벨마다 같다 (부지 폭의 3×2배: 가로로 긴 창·세로로 긴 폰도 덮는다) */
export function dioramaWorld(level: number) {
  const { cv } = artExteriorBoard(level, false)
  const bw = cv.w + MARGIN * 2
  return { W: bw * 3, H: bw * 2 }
}

/** 처음 배율과 거리 크기. 배율은 땅 판이 다 보이는 가장 큰 값 (실수 — 정수로 내리면 창 비율에 따라 건물이 크게·작게 튄다) */
export function dioramaFit(level: number, hostW: number, hostH: number) {
  const { cv } = artExteriorBoard(level, false)
  const scale = Math.min(hostW / (cv.w + MARGIN * 2), hostH / (cv.h + MARGIN * 2))
  return { scale, ...dioramaWorld(level) }
}

/** 화면 가운데가 보는 논리 px와 배율 */
export interface DioramaCamera {
  x: number
  y: number
  zoom: number
}

/** 확대·축소 범위(처음 배율의 0.6~4배, 건물 안과 같다)를 지키고, 거리 밖(빈 곳)이 보이지 않게 맞춘다 */
export function clampCamera(cam: DioramaCamera, fit: number, W: number, H: number, hostW: number, hostH: number): DioramaCamera {
  const cover = Math.max(hostW / W, hostH / H)
  const zoom = Math.min(Math.max(cover, fit * 4), Math.max(cover, fit * 0.6, cam.zoom))
  const halfW = hostW / 2 / zoom
  const halfH = hostH / 2 / zoom
  const x = W <= halfW * 2 ? W / 2 : Math.min(W - halfW, Math.max(halfW, cam.x))
  const y = H <= halfH * 2 ? H / 2 : Math.min(H - halfH, Math.max(halfH, cam.y))
  return { x, y, zoom }
}

/** 화면 점(sx, sy — 화면 왼쪽 위 기준)을 그 자리에 둔 채 배율만 바꾼다 */
export function zoomCameraAt(cam: DioramaCamera, zoom: number, sx: number, sy: number, hostW: number, hostH: number): DioramaCamera {
  const dx = sx - hostW / 2
  const dy = sy - hostH / 2
  return { zoom, x: cam.x + dx / cam.zoom - dx / zoom, y: cam.y + dy / cam.zoom - dy / zoom }
}

export function dioramaLayout(level: number, isNight: boolean, W: number, H: number): DioramaLayout {
  const board = artExteriorBoard(level, isNight)
  const ox = Math.round((W - board.cv.w) / 2)
  // 위아래 남는 곳은 위쪽을 조금 더 (부지가 화면 가운데보다 살짝 아래 — 위에 핀 자리)
  const oy = Math.round((H - board.cv.h) * 0.55)
  const b = board.building
  const xs = board.door.map((p) => p[0])
  const ys = board.door.map((p) => p[1])
  const O: Pt = [ox + board.o[0], oy + board.o[1]]
  // 부지 위에 얹히는 이웃 건물·가로등(side·front) — 그 픽셀은 눌러도 반응 없다
  const cover = [artNeighbors(W, H, isNight, O, board, 'side'), artNeighbors(W, H, isNight, O, board, 'front')]
  const cx = Math.floor(b.cv.w / 2)
  let top = 0
  while (top < b.cv.h - 1 && !b.cv.has(top * b.cv.w + cx)) top++
  return {
    board,
    W,
    H,
    ox,
    oy,
    pin: { x: ox + b.x + cx, y: oy + b.y + top },
    body: { x: ox + b.x, y: oy + b.y, w: b.cv.w, h: b.cv.h },
    door: { x: ox + Math.min(...xs), y: oy + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
    hit: (x, y) => {
      const bx = Math.floor(x - ox - b.x)
      const by = Math.floor(y - oy - b.y)
      if (bx >= 0 && by >= 0 && bx < b.cv.w && by < b.cv.h && b.cv.has(by * b.cv.w + bx)) return true
      const px = Math.floor(x)
      const py = Math.floor(y)
      if (px < 0 || py < 0 || px >= W || py >= H || cover.some((cv) => cv.has(py * W + px))) return false
      // 부지 땅 (큰길 앞 인도·차도는 빼고)
      const a = (x - O[0]) / HW
      const s = (y - O[1]) / HH
      const gx = (a + s) / 2
      const gy = (s - a) / 2
      return gx >= 0 && gx < board.GX && gy >= 0 && gy < board.GY - 3
    },
  }
}

/** 화면 px(clientX·Y) → 논리 px. 캔버스가 실제로 그려진 사각형(getBoundingClientRect) 기준이라
 * 배율·CSS 변형·화면보다 커서 잘린 부분이 있어도 맞는다 */
export function toLogical(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number, W: number, H: number): Pt {
  return [((clientX - rect.left) * W) / rect.width, ((clientY - rect.top) * H) / rect.height]
}

/** 화면 px의 점이 내 사무실 위인가 (마우스 올림·누르기 공통) */
export const isOnOffice = (layout: DioramaLayout, rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number) =>
  rect.width > 0 && rect.height > 0 && layout.hit(...toLogical(rect, clientX, clientY, layout.W, layout.H))
