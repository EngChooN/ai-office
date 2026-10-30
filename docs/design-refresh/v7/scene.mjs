// v7 확인용 — 장면과 같은 규칙(깊이 상자 정렬 depthOrder · 엉덩이 = 좌석 + 3 · 그림 아래 +1px)으로 책상 자리·소파를 4방향 모두 앉혀 본다.
// 실행: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scene.mjs 출력.png [책상id] [의자id] [소파id]
import fs from 'node:fs'
import * as iso from '../../../app/src/renderer/map/iso/isoArt.ts'
import { HH, HW } from '../../../app/src/shared/iso/grid.ts'
import { depthOrder } from '../../../app/src/shared/iso/depth.ts'
import { cellsOf, spotsOf, FACE_STEP } from '../../../app/src/shared/iso/furniture.ts'
import { png } from '../v4/preview-v2.mjs'

export class Canvas {
  constructor(w, h, bg) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); if (bg) for (let i = 0; i < w * h; i++) this.px.set([...bg, 255], i * 4) }
  blit(src, sw, sh, dx, dy) { dx = Math.round(dx); dy = Math.round(dy); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const s = (y * sw + x) * 4, a = src[s + 3] / 255; if (!a) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue; const d = (Y * this.w + X) * 4; for (let i = 0; i < 3; i++) this.px[d + i] = this.px[d + i] * (1 - a) + src[s + i] * a; this.px[d + 3] = 255 } }
  scaled(k) { const o = new Uint8ClampedArray(this.w * k * this.h * k * 4); for (let y = 0; y < this.h * k; y++) for (let x = 0; x < this.w * k; x++) o.set(this.px.subarray(((y / k | 0) * this.w + (x / k | 0)) * 4, ((y / k | 0) * this.w + (x / k | 0)) * 4 + 4), (y * this.w * k + x) * 4); return png(this.w * k, this.h * k, o) }
}
const SIT_HIP = 3
/** 장면 한 판: put(item) · sit(item, slot, look) 를 모아 깊이 정렬해 그린다 */
export function stage(cv, o) {
  const P = (gx, gy, z = 0) => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
  const list = []
  const put = (it) => {
    const roles = iso.isSplitChair(it.itemId) ? ['seat', 'back'] : [undefined]
    for (const role of roles) {
      const a = iso.artItem(it.itemId, it.rot, role)
      if (role === 'back' && !a.cv.px.some((v, i) => i % 4 === 3 && v)) continue
      const [x, y] = P(it.gx, it.gy)
      list.push({ x: it.gx + a.box.x, y: it.gy + a.box.y, w: a.box.w, d: a.box.d, z: a.box.z, h: a.box.h, draw: () => cv.blit(a.cv.px, a.cv.w, a.cv.h, x - a.o[0], y - a.o[1]) })
    }
  }
  const sit = (it, slot, n, pose = 'sit') => {
    const s = spotsOf(it).filter((q) => q.use === 'sit')[slot]
    const dir = iso.personDirOf(s.face)
    const z = iso.seatHeight(it.itemId) ?? 9
    const ax = s.gx + 0.5, ay = s.gy + 0.5
    const a = iso.artPerson(pose, dir, iso.lookOf(n))
    const [x, y] = P(ax, ay)
    const by = y + 1 - (z + SIT_HIP - iso.personSitDrop(dir, pose))
    list.push({ x: ax - 0.18, y: ay - 0.18, w: 0.36, d: 0.36, z: z + SIT_HIP, h: 30, draw: () => cv.blit(a.px, a.w, a.h, x - Math.floor(a.w / 2), by - a.h) })
  }
  const flush = () => { for (const b of depthOrder(list)) b.draw() }
  return { P, put, sit, flush }
}
/** 장면(gearSkins)과 같은 규칙: 의자가 책상 로컬 x 1 칸 앞이면 뒤집은 그림 */
const withFlip = (d, tx, ty) => (iso.deskCellOf(d.itemId, d.rot, d.gx, d.gy, tx, ty) === 1 ? { ...d, itemId: d.itemId + iso.DESK_FLIP } : d)
/** 의자 rot r 앞에 책상을 붙인다 — 기본 자리(autoSeats)처럼 의자가 책상의 왼쪽(로컬 x=0) 칸 앞 */
export function deskPair(desk, chair, r, gx, gy) {
  const c = { uid: 'c', itemId: chair, gx, gy, rot: r }
  const s = spotsOf(c)[0]
  const [dx, dy] = FACE_STEP[s.face]
  const tx = s.gx + dx, ty = s.gy + dy
  // rot0 기본: 의자(gx,gy) → 책상(gx, gy+1). 다른 방향은 책상 칸에 목표 칸이 들어가는 원점 중 로컬 x=0 칸이 목표인 것
  for (let ox = -3; ox <= 3; ox++) for (let oy = -3; oy <= 3; oy++) {
    const d = { uid: 'd', itemId: desk, gx: tx + ox, gy: ty + oy, rot: r }
    const cells = cellsOf(d)
    if (cells[0] && cells[0].gx === tx && cells[0].gy === ty) return [c, withFlip(d, tx, ty)]
  }
  return [c, { uid: 'd', itemId: desk, gx: tx, gy: ty, rot: r }]
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [out = 'scene.png', desk = 'desk', chair = 'chair', sofa = 'sofa-green'] = process.argv.slice(2)
  const cv = new Canvas(300, 250, [232, 226, 214])
  const st = stage(cv, [110, 30])
  const spots = [[2, 0], [6, 0], [2, 4], [6, 4]]
  ;[0, 1, 2, 3].forEach((r, i) => { const [c, d] = deskPair(desk, chair, r, spots[i][0], spots[i][1]); st.put(c); st.put(d); st.sit(c, 0, i + 1, 'type') })
  ;[0, 1, 2, 3].forEach((r, i) => { const it = { uid: 's' + i, itemId: sofa, gx: 9 + (i % 2) * 4, gy: 7 + Math.floor(i / 2) * 4, rot: r }; st.put(it); st.sit(it, 0, i + 5); st.sit(it, 1, i + 9) })
  st.flush()
  fs.writeFileSync(out, cv.scaled(3))
  console.log('ok')
}
