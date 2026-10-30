// v6 확인용 — 가구·소품 전부(r0)와 바닥·벽 재질 표를 PNG로. 실행: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON gallery.mjs 접두어
import fs from 'node:fs'
import * as iso from '../../../app/src/renderer/map/iso/isoArt.ts'
import { png } from '../v4/preview-v2.mjs'
const tag = process.argv[2] ?? 'now'
function sheet(arts, cell, per, k, bg = [236, 232, 224]) {
  const rows = Math.ceil(arts.length / per)
  const W = per * cell[0], H = rows * cell[1]
  const px = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) px.set([...bg, 255], i * 4)
  arts.forEach((cv, n) => {
    const ox = (n % per) * cell[0] + Math.round((cell[0] - cv.w) / 2), oy = Math.floor(n / per) * cell[1] + Math.max(0, cell[1] - cv.h - 2)
    for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
      const s = (y * cv.w + x) * 4, a = cv.px[s + 3] / 255; if (!a) continue
      const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue
      const d = (Y * W + X) * 4; for (let c = 0; c < 3; c++) px[d + c] = px[d + c] * (1 - a) + cv.px[s + c] * a
    }
  })
  const o = new Uint8ClampedArray(W * k * H * k * 4)
  for (let y = 0; y < H * k; y++) for (let x = 0; x < W * k; x++) o.set(px.subarray(((y / k | 0) * W + (x / k | 0)) * 4, ((y / k | 0) * W + (x / k | 0)) * 4 + 4), (y * W * k + x) * 4)
  return png(W * k, H * k, o)
}
const ids = iso.ART_ITEM_IDS.filter((id) => !id.startsWith('fixed-'))
const arts = ids.map((id) => iso.artItem(id, 0).cv)
const half = Math.ceil(arts.length / 2)
fs.writeFileSync(`${tag}-items-a.png`, sheet(arts.slice(0, half), [100, 110], 9, 2))
fs.writeFileSync(`${tag}-items-b.png`, sheet(arts.slice(half), [100, 110], 9, 2))
const s = iso.SURFACE_ART_IDS
const surf = [...s.floor, ...s.wallpaper].map((id) => iso.artSurfaceThumb(id))
const lv = [2, 4, 6, 8, 10, 12, 14, 18, 20].map((l) => iso.artRoom(3, 3, iso.finishOf(l)).cv)
fs.writeFileSync(`${tag}-surfaces.png`, sheet([...lv, ...surf], [112, 100], 8, 2))
console.log(ids.length, 'items')
