// v5 확인용 — 앱에 적용한 그림(isoArt.ts · personArt.ts)을 그대로 불러 사무실 합성과 인물 표를 PNG로 뽑는다. 앱 코드는 읽기만.
// 실행(이 폴더에서): node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON preview-app.mjs → office-v5.png · people-v5.png
import fs from 'node:fs'
import * as iso from '../../../app/src/renderer/map/iso/isoArt.ts'
import { HH, HW } from '../../../app/src/shared/iso/grid.ts'
import { png } from '../v4/preview-v2.mjs'

class Canvas {
  constructor(w, h, bg) {
    this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4)
    if (bg) for (let i = 0; i < w * h; i++) this.px.set([...bg, 255], i * 4)
  }
  blit(src, sw, sh, dx, dy) {
    dx = Math.round(dx); dy = Math.round(dy)
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const s = (y * sw + x) * 4, a = src[s + 3] / 255
      if (!a) continue
      const X = x + dx, Y = y + dy
      if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue
      const d = (Y * this.w + X) * 4
      for (let i = 0; i < 3; i++) this.px[d + i] = this.px[d + i] * (1 - a) + src[s + i] * a
      this.px[d + 3] = 255
    }
  }
  scaled(k) {
    const o = new Uint8ClampedArray(this.w * k * this.h * k * 4)
    for (let y = 0; y < this.h * k; y++) for (let x = 0; x < this.w * k; x++) o.set(this.px.subarray(((y / k | 0) * this.w + (x / k | 0)) * 4, ((y / k | 0) * this.w + (x / k | 0)) * 4 + 4), (y * this.w * k + x) * 4)
    return png(this.w * k, this.h * k, o)
  }
}
const SIT_HIP = 3 // IsoOfficeScene과 같은 값

// ── 사무실 합성: 장면과 같은 규칙(엉덩이 = 좌석 + 3, 다리는 그 아래)으로 앉힌다 ──
function office() {
  const room = iso.artRoom(9, 7, iso.STAGE_FINISH[2])
  const cv = new Canvas(room.cv.w, room.cv.h)
  cv.blit(room.cv.px, room.cv.w, room.cv.h, 0, 0)
  const o = room.o
  const P = (gx, gy, z = 0) => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
  const item = (id, r, gx, gy, role) => { const a = iso.artItem(id, r, role); const [x, y] = P(gx, gy); cv.blit(a.cv.px, a.cv.w, a.cv.h, x - a.o[0], y - a.o[1]) }
  const stand = (n, dir, pose, gx, gy) => {
    const s = iso.artPersonShadow(); const [x, y] = P(gx, gy); cv.blit(s.px, s.w, s.h, x - 7, y - 3)
    const a = iso.artPerson(pose, dir, iso.lookOf(n)); cv.blit(a.px, a.w, a.h, x - a.w / 2, y - a.h)
  }
  const sit = (n, dir, gx, gy, z) => {
    const a = iso.artPerson('sit', dir, iso.lookOf(n)); const [x, y] = P(gx, gy, z + SIT_HIP - iso.personSitDrop(dir))
    cv.blit(a.px, a.w, a.h, x - a.w / 2, y - a.h)
  }
  const SEAT = iso.seatHeight('chair') ?? 9
  item('bookshelf', 0, 0, 0); item('plant', 0, 2, 0); item('whiteboard', 0, 3, 0); item('prop-cooler', 0, 6, 0); item('prop-printer', 0, 7, 0)
  item('floor-lamp', 1, 0, 2); item('fern', 1, 0, 6)
  // 업무 자리: 앞(↙)을 보고 앉은 둘 + 뒤(↖)를 보고 앉은 하나
  item('chair', 0, 2, 2, 'back'); item('chair', 0, 2, 2, 'seat'); sit(1, 'front', 2.5, 2.5, SEAT); item('desk', 0, 1, 3)
  item('chair', 0, 4, 2, 'back'); item('chair', 0, 4, 2, 'seat'); sit(2, 'front', 4.5, 2.5, SEAT); item('desk', 0, 3, 3)
  // 라운지: 소파에 앉은 사람(다리가 보이는 자리)
  item('rug-persian', 0, 5, 4); item('lv-waiting-sofa', 3, 8, 4); item('sofa-green', 0, 5, 3); sit(5, 'front', 5.5, 3.5, 9); sit(6, 'frontRight', 6.5, 3.5, 9)
  item('zone-low-table', 0, 6, 5); item('coffee-machine', 0, 8, 2)
  stand(0, 'backRight', 'stand', 6.5, 6.4); stand(3, 'front', 'stand', 1.6, 5.6); stand(4, 'frontRight', 'walk1', 3.6, 5.8)
  return cv
}

// ── 인물 표: 생김새 부품을 하나씩 바꿔 가며 서기·걷기·앉기 × 4방향 ──
function people() {
  const base = { h: '#4a3426', s: '#f6d2b0', c: '#5a8ae8', p: '#3d4a6a' }
  const rows = [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((hair) => ({ ...base, hair, h: ['#4a3426', '#1e1e26', '#8a4b2a', '#e0b050', '#6a6a78', '#3a2040', '#b04030', '#4a3426'][hair] })),
    ...[1, 2, 3, 4].map((top) => ({ ...base, top, c: ['', '#5ab47e', '#f4f4f8', '#a57ad8', '#3a3f4a'][top] })),
    ...[1, 2, 3, 4].map((face) => ({ ...base, face })),
    ...[1, 2, 3, 4, 5].map((head) => ({ ...base, head })),
  ]
  const frames = [['stand', 'front'], ['stand', 'frontRight'], ['stand', 'back'], ['stand', 'backRight'], ['walk1', 'front'], ['walk2', 'front'], ['sit', 'front'], ['sit', 'frontRight'], ['sit', 'back'], ['sit', 'backRight']]
  const CW = 20, CH = 40, PER = 3 // 한 줄에 생김새 3개
  const lines = Math.ceil(rows.length / PER)
  const cv = new Canvas(frames.length * CW * PER + (PER - 1) * 8 + 8, lines * CH + 8, [46, 44, 56])
  rows.forEach((L, i) => frames.forEach(([pose, dir], j) => {
    const a = iso.artPerson(pose, dir, L)
    const x = 4 + (i % PER) * (frames.length * CW + 8) + j * CW + (CW - a.w) / 2
    const y = 4 + Math.floor(i / PER) * CH + (CH - 4 - a.h)
    cv.blit(a.px, a.w, a.h, x, y)
  }))
  return cv
}

fs.writeFileSync('office-v5.png', office().scaled(3))
fs.writeFileSync('people-v5.png', people().scaled(3))
console.log('ok')
