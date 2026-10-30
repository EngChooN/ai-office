// v6 확대 확인용 — 책상·의자·소파와 앉은 직원을 크게 뽑는다. 실행: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON closeup.mjs [이름]
import fs from 'node:fs'
import * as iso from '../../../app/src/renderer/map/iso/isoArt.ts'
import { HH, HW } from '../../../app/src/shared/iso/grid.ts'
import { png } from '../v4/preview-v2.mjs'
class Canvas {
  constructor(w, h, bg) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); if (bg) for (let i = 0; i < w * h; i++) this.px.set([...bg, 255], i * 4) }
  blit(src, sw, sh, dx, dy) { dx = Math.round(dx); dy = Math.round(dy); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const s = (y * sw + x) * 4, a = src[s + 3] / 255; if (!a) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue; const d = (Y * this.w + X) * 4; for (let i = 0; i < 3; i++) this.px[d + i] = this.px[d + i] * (1 - a) + src[s + i] * a; this.px[d + 3] = 255 } }
  scaled(k) { const o = new Uint8ClampedArray(this.w * k * this.h * k * 4); for (let y = 0; y < this.h * k; y++) for (let x = 0; x < this.w * k; x++) o.set(this.px.subarray(((y / k | 0) * this.w + (x / k | 0)) * 4, ((y / k | 0) * this.w + (x / k | 0)) * 4 + 4), (y * this.w * k + x) * 4); return png(this.w * k, this.h * k, o) }
}
const SIT_HIP = 3
const W = 260, H = 150
const cv = new Canvas(W, H, [232, 226, 214])
const o = [130, 40]
const P = (gx, gy, z = 0) => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
const item = (id, r, gx, gy, role) => { const a = iso.artItem(id, r, role); const [x, y] = P(gx, gy); cv.blit(a.cv.px, a.cv.w, a.cv.h, x - a.o[0], y - a.o[1]) }
const sit = (n, dir, gx, gy, z) => { const a = iso.artPerson('sit', dir, iso.lookOf(n)); const [x, y] = P(gx, gy, z + SIT_HIP - iso.personSitDrop(dir)); cv.blit(a.px, a.w, a.h, x - a.w / 2, y - a.h) }
const SEAT = iso.seatHeight('chair') ?? 9
// 왼쪽: 책상 자리 둘(앞 보고 / 뒤 보고)
item('chair', 0, 0, 0, 'back'); item('chair', 0, 0, 0, 'seat'); sit(1, 'front', 0.5, 0.5, SEAT); item('desk', 0, -1, 1)
item('desk', 2, -1, 3); item('chair', 2, 0, 4, 'back'); sit(2, 'back', 0.5, 4.5, SEAT); item('chair', 2, 0, 4, 'seat')
// 오른쪽: 소파 둘
item('sofa-green', 0, 3, 0, 'back'); item('sofa-green', 0, 3, 0, 'seat'); sit(5, 'front', 3.5, 0.5, iso.seatHeight('sofa-green') ?? 9); sit(6, 'front', 4.5, 0.5, iso.seatHeight('sofa-green') ?? 9)
item('lv-waiting-sofa', 2, 3, 3, 'seat'); sit(3, 'back', 3.5, 3.5, iso.seatHeight('lv-waiting-sofa') ?? 9); sit(4, 'back', 4.5, 3.5, iso.seatHeight('lv-waiting-sofa') ?? 9); item('lv-waiting-sofa', 2, 3, 3, 'back')
fs.writeFileSync(process.argv[2] ?? 'closeup.png', cv.scaled(5))
console.log('ok')
