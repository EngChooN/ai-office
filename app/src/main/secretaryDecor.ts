// 비서의 사무실 꾸미기 (docs/specs/secretary.md 3-2-4절) — electron 없이 돌아서 scripts/secretaryDecor.test.mts가 그대로 쓴다
// - 알아서 배치: autoArrange 안 → 확인 카드 단계(그 층 치우기 → 놓기 묶음) + 전↔후 평면도 그림(PNG data URL, 카드 비교 보기)
// - 전부 치우기 뒤 되돌리기: 치운 가구 목록 → 되돌리기 카드 단계
// 그림은 위에서 내려다본 평면도다: 위·왼쪽이 뒤 벽(사무실 화면의 ↗·↖ 벽), 칸 하나가 정사각형

import { deflateSync } from 'node:zlib'
import { drawerCount, isGridFurniture, shopItem, type ShopState } from '../shared/economy.ts'
import { t } from '../shared/i18n/index.ts'
import { itemName } from '../shared/i18n/names.ts'
import { BATCH_ITEMS_MAX, BATCH_METHOD, CARD_STEPS_MAX } from '../shared/secretaryTools.ts'
import type { OfficeMethod } from '../shared/officeApiShape.ts'
import type { SecretaryCompare } from '../shared/types.ts'
import type { ArrangePlan } from '../shared/iso/autoArrange.ts'
import { groupOf } from '../shared/iso/autoArrange.ts'
import { cellsOf, FACE_STEP, specOf, spotsOf, type GridItem, type GridPose } from '../shared/iso/furniture.ts'
import { isInside, type Room } from '../shared/iso/grid.ts'
import { isoLevelOf, roomOf } from '../shared/iso/levels.ts'
import { fixedTiles, type FixedTile } from '../shared/iso/place.ts'
import { isIndoor } from '../shared/iso/plan.ts'
import { stowTargets } from '../shared/iso/stowTargets.ts'

type Step = { method: string; args?: unknown[]; label?: string; items?: { method: string; args: unknown[] }[] }

/** 알아서 배치 카드 단계: 그 층을 비우고(책상·의자 포함) 안 순서대로 놓는다. 단계 상한을 넘는 놓기는 omitted로 */
export function arrangeSteps(plan: ArrangePlan): { steps: Step[]; omitted: number } {
  const steps: Step[] = [{ method: 'stowAllGrid', args: [plan.floor, false], label: `${plan.floor}층 가구 서랍에 넣기` }]
  const chunks = Math.min(CARD_STEPS_MAX - 1, Math.ceil(plan.place.length / BATCH_ITEMS_MAX))
  for (let i = 0; i < chunks; i++) {
    const part = plan.place.slice(i * BATCH_ITEMS_MAX, (i + 1) * BATCH_ITEMS_MAX)
    steps.push({ method: BATCH_METHOD, label: chunks > 1 ? `${plan.floor}층 새 배치 ${i + 1}/${chunks}` : `${plan.floor}층 새 배치`, items: part.map((p) => ({ method: 'placeGridItem', args: [p.itemId, plan.floor, p.gx, p.gy, p.rot] })) })
  }
  return { steps, omitted: Math.max(0, plan.place.length - chunks * BATCH_ITEMS_MAX) }
}

/**
 * 치운 가구를 되돌리는 카드 단계. 치운 뒤 새로 놓은 층(알아서 배치)이 있으면 그 층을 먼저 비운다 —
 * 새 가구가 원래 자리를 막고 있으면 되돌리기가 건너뛰기 때문 (shopGrid.restoreGrid)
 */
export function undoSteps(stowed: readonly GridItem[], refillFloors: readonly number[]): Step[] {
  const floors = [...new Set(refillFloors)].sort((a, b) => a - b)
  return [...floors.map((f) => ({ method: 'stowAllGrid', args: [f, false], label: `${f}층 새 배치 치우기` })), { method: 'restoreGridItems', args: [stowed.map((g) => ({ ...g }))], label: `치운 가구 ${stowed.length}개 원래 자리로` }]
}

// ── 평면도 그림 ─────────────────────────────────────────

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** 평면도 색 (그림 안에서만 쓴다 — 화면 테마와 상관없이 밝은 종이 위 도면). 무엇이 어느 색인지는 비교 보기 이름표에 적는다 */
export const PLAN_COLORS = {
  void: hex('#2b303b'),
  indoor: hex('#efe9df'),
  outdoor: hex('#d5e6c8'),
  gridLine: hex('#e0d8cb'),
  wall: hex('#5b6170'),
  meeting: hex('#cbd7ea'),
  meetingSolid: hex('#93a8c9'),
  stairs: hex('#b8b0a3'),
  entrance: hex('#f0b83c'),
  desk: hex('#4a7fd6'),
  chair: hex('#1f3a73'),
  sofa: hex('#e08a4c'),
  rug: hex('#dcc3ea'),
  wallItem: hex('#3e9a73'),
  game: hex('#8b62c8'),
  small: hex('#7cbf5a'),
  other: hex('#a2775a'),
  outline: hex('#2b303b'),
} satisfies Record<string, RGB>

function colorOf(itemId: string): RGB {
  const kind = specOf(itemId).kind
  if (kind === 'desk') return PLAN_COLORS.desk
  if (kind === 'chair') return PLAN_COLORS.chair
  const g = groupOf(itemId)
  return g === 'rug' ? PLAN_COLORS.rug : g === 'sofa' ? PLAN_COLORS.sofa : g === 'wall' ? PLAN_COLORS.wallItem : g === 'game' ? PLAN_COLORS.game : g === 'small' ? PLAN_COLORS.small : PLAN_COLORS.other
}

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Uint8Array) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
/** RGB 픽셀 → PNG (색 형식 2, 필터 없음) */
export function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())])
}

/** 그림 한 변 목표 픽셀 — 카드 폭(PC 나란히·휴대폰 위아래)에서 칸이 또렷하게 */
const TARGET_PX = 280
const PAD = 6

/** 한 층의 평면도 PNG data URL */
export function renderFloorPlan(room: Room, fixed: readonly FixedTile[], items: readonly GridPose[]): string {
  const s = Math.max(6, Math.min(16, Math.floor(TARGET_PX / Math.max(room.cols, room.rows))))
  const w = room.cols * s + PAD * 2
  const h = room.rows * s + PAD * 2
  const px = new Uint8Array(w * h * 3)
  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    px.set(c, (y * w + x) * 3)
  }
  const rect = (x0: number, y0: number, rw: number, rh: number, c: RGB) => {
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) put(x, y, c)
  }
  const cx = (gx: number) => PAD + gx * s
  const cy = (gy: number) => PAD + gy * s
  rect(0, 0, w, h, PLAN_COLORS.void)

  // 바닥 · 칸 선
  for (let gy = 0; gy < room.rows; gy++)
    for (let gx = 0; gx < room.cols; gx++) {
      if (!isInside(room, gx, gy)) continue
      rect(cx(gx), cy(gy), s, s, isIndoor(room, gx, gy) ? PLAN_COLORS.indoor : PLAN_COLORS.outdoor)
      rect(cx(gx) + s - 1, cy(gy), 1, s, PLAN_COLORS.gridLine)
      rect(cx(gx), cy(gy) + s - 1, s, 1, PLAN_COLORS.gridLine)
    }
  // 고정 칸: 회의실 · 계단 · 출입구
  for (const t of fixed) {
    const c = t.kind === 'stairs' ? PLAN_COLORS.stairs : t.kind === 'entrance' ? PLAN_COLORS.entrance : t.solid ? PLAN_COLORS.meetingSolid : PLAN_COLORS.meeting
    if (t.kind === 'meetingDoor') rect(cx(t.gx) + 1, cy(t.gy) + 1, s - 2, s - 2, PLAN_COLORS.indoor)
    else rect(cx(t.gx), cy(t.gy), s, s, c)
    if (t.kind === 'stairs') for (let k = 2; k < s; k += 3) rect(cx(t.gx), cy(t.gy) + k, s, 1, PLAN_COLORS.wall)
  }
  // 뒤 벽 (위·왼쪽이 바닥 밖인 변)
  const wallT = Math.max(2, Math.round(s / 5))
  for (let gy = 0; gy < room.rows; gy++)
    for (let gx = 0; gx < room.cols; gx++) {
      if (!isInside(room, gx, gy)) continue
      if (!isInside(room, gx, gy - 1)) rect(cx(gx) - (isInside(room, gx - 1, gy) ? 0 : wallT), cy(gy) - wallT, s + (isInside(room, gx - 1, gy) ? 0 : wallT), wallT, PLAN_COLORS.wall)
      if (!isInside(room, gx - 1, gy)) rect(cx(gx) - wallT, cy(gy), wallT, s, PLAN_COLORS.wall)
    }

  // 가구: 러그 먼저(바닥에 깔림), 그 위에 나머지. 테두리 1px, 앉는·쓰는 방향은 짧은 막대로
  const sorted = [...items].sort((a, b) => Number(specOf(b.itemId).layer === 'flat') - Number(specOf(a.itemId).layer === 'flat'))
  for (const it of sorted) {
    const cells = cellsOf(it)
    const [x0, y0] = [Math.min(...cells.map((c) => c.gx)), Math.min(...cells.map((c) => c.gy))]
    const [x1, y1] = [Math.max(...cells.map((c) => c.gx)) + 1, Math.max(...cells.map((c) => c.gy)) + 1]
    const inset = specOf(it.itemId).layer === 'flat' ? 0 : 1
    const [rx, ry, rw, rh] = [cx(x0) + inset, cy(y0) + inset, (x1 - x0) * s - inset * 2 - 1, (y1 - y0) * s - inset * 2 - 1]
    if (inset) rect(rx - 1, ry - 1, rw + 2, rh + 2, PLAN_COLORS.outline)
    rect(rx, ry, rw, rh, colorOf(it.itemId))
    const spot = spotsOf(it)[0]
    if (spot && inset) {
      const [dx, dy] = FACE_STEP[spot.face]
      const bar = Math.max(2, Math.round(s / 6))
      const len = Math.max(2, Math.round(s / 2))
      const mx = cx(spot.isInside ? spot.gx : spot.gx - dx) + Math.floor(s / 2)
      const my = cy(spot.isInside ? spot.gy : spot.gy - dy) + Math.floor(s / 2)
      // 보는 쪽 가장자리에 밝은 막대
      const ex = mx + dx * (Math.floor(s / 2) - inset - bar)
      const ey = my + dy * (Math.floor(s / 2) - inset - bar)
      if (dx) rect(ex - (dx < 0 ? 0 : bar - 1), ey - Math.floor(len / 2), bar, len, PLAN_COLORS.indoor)
      else rect(ex - Math.floor(len / 2), ey - (dy < 0 ? 0 : bar - 1), len, bar, PLAN_COLORS.indoor)
    }
  }
  return `data:image/png;base64,${encodePng(w, h, px).toString('base64')}`
}

// ── 카드 미리보기 · 비서에게 줄 배치 글 ─────────────────────

/** 가구 이름 (지금 앱 언어) */
export const furnitureName = (itemId: string) => itemName(itemId, shopItem(itemId)?.name ?? itemId)

const DECOR_METHODS = new Set<string>(['placeGridItem', 'moveGridItem', 'storeItem', 'stowAllGrid', 'restoreGridItems', 'placeItem'])
export const isDecorStep = (method: string) => DECOR_METHODS.has(method)

/**
 * 꾸미기 단계를 다 실행했다고 치고 놓인 가구 (그림용 — 실제 저장은 메인 검사를 거친다).
 * 예전 placeItem은 빈자리를 메인이 고르므로 그림에 넣지 않는다
 */
export function simulateDecor(grid: readonly GridItem[], steps: readonly { method: OfficeMethod | string; args: unknown[] }[]): GridItem[] {
  let cur = [...grid]
  steps.forEach(({ method, args }, i) => {
    const [a0, a1, a2, a3, a4] = args as [unknown, unknown, unknown, unknown, unknown]
    if (method === 'stowAllGrid') {
      const gone = new Set(stowTargets(cur, Number(a0) > 0 ? Number(a0) : null, a1 === true))
      cur = cur.filter((g) => !gone.has(g))
    } else if (method === 'placeGridItem' && typeof a0 === 'string') cur.push({ uid: `preview:${i}`, itemId: a0, floor: Number(a1), gx: Number(a2), gy: Number(a3), rot: (Number(a4) & 3) as GridItem['rot'] })
    else if (method === 'moveGridItem') cur = cur.map((g) => (g.uid === a0 ? { ...g, floor: Number(a1), gx: Number(a2), gy: Number(a3), rot: (Number(a4) & 3) as GridItem['rot'] } : g))
    else if (method === 'storeItem') cur = cur.filter((g) => g.uid !== a0)
    else if (method === 'restoreGridItems' && Array.isArray(a0)) for (const g of a0 as GridItem[]) if (g && typeof g.uid === 'string' && !cur.some((x) => x.uid === g.uid)) cur.push(g)
  })
  return cur
}

/** 한 카드에 그리는 층 수 (비교 보기 상한·휴대폰으로 가는 크기) */
const PLAN_FLOORS_MAX = 2

/** 꾸미기 단계가 든 카드의 전 ↔ 후 평면도 (층마다 한 쌍). 바뀌는 게 없으면 빈 목록 */
export function decorCompares(grid: readonly GridItem[], level: number, steps: readonly { method: OfficeMethod | string; args: unknown[] }[]): SecretaryCompare[] {
  const decor = steps.filter((s) => isDecorStep(s.method))
  if (!decor.length) return []
  const after = simulateDecor(grid, decor)
  const floors = isoLevelOf(level).floors
  const key = (g: GridItem) => `${g.itemId}@${g.gx},${g.gy},${g.rot}`
  const out: SecretaryCompare[] = []
  for (let f = 1; f <= floors && out.length < PLAN_FLOORS_MAX; f++) {
    const b = grid.filter((g) => g.floor === f)
    const a = after.filter((g) => g.floor === f)
    if (b.map(key).sort().join('|') === a.map(key).sort().join('|')) continue
    const room = roomOf(level, f)
    const fixed = fixedTiles(level, f)
    out.push({ kind: 'image', label: `${t('secretary.compareLabel.floorPlan', { floor: f })} · ${t('secretary.decor.legend')}`, before: renderFloorPlan(room, fixed, b), after: renderFloorPlan(room, fixed, a) })
  }
  return out
}

const ROT_TEXT = ['↙', '↖', '↗', '↘']

/** 비서가 읽는 배치 글: 층마다 놓인 가구(uid·이름·칸·방향)와 서랍 — 옮기기·치우기 인자를 짐작하지 않게 */
export function layoutText(shop: ShopState, level: number, floor: number | null): string {
  const floors = isoLevelOf(level).floors
  const lines = [`Lv.${level} · ${floors}개 층. 방향 rot: 0 ↙ · 1 ↖ · 2 ↗ · 3 ↘ (화면 기준). 칸 gx는 ↘, gy는 ↙ 쪽으로 커진다`]
  for (let f = 1; f <= floors; f++) {
    if (floor !== null && f !== floor) continue
    const room = roomOf(level, f)
    const here = shop.grid.filter((g) => g.floor === f)
    lines.push(`${f}층 (${room.cols}×${room.rows}칸) — 놓인 가구 ${here.length}개`)
    for (const g of here.slice(0, 80)) lines.push(`- ${g.uid} · ${furnitureName(g.itemId)}(${g.itemId}) · ${g.gx},${g.gy} · rot ${g.rot}${ROT_TEXT[g.rot]}${g.isOn ? ' · 켜짐' : ''}`)
    if (here.length > 80) lines.push(`- …그 밖 ${here.length - 80}개`)
  }
  const drawer = Object.keys(shop.owned)
    .filter(isGridFurniture)
    .map((id) => ({ id, n: drawerCount(shop, id) }))
    .filter((x) => x.n > 0)
  lines.push(`서랍: ${drawer.length ? drawer.map((x) => `${furnitureName(x.id)}(${x.id}) ×${x.n}`).join(', ') : '비어 있음'}`)
  return lines.join('\n')
}
