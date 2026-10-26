// 소품 연출 파일럿 시트 생성기 (연출④-2 · docs/specs/furniture-motion-guide.md).
// 사용(app 폴더에서): node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/motion-pilot.mts ../docs/specs/office-iso-art/motion
//   → 오브젝트마다 시트 한 장({id}.png: 가로 = 프레임, 세로 = 방향 행) + manifest.json + preview.png
// 앱이 쓰는 사본은 src/renderer/map/iso/motion/ (같은 명령을 그 폴더로 돌린 뒤 preview.png만 지운다 — 연출④-3)
// 바탕 그림은 isoArt.ts의 artItem 그대로(분수·커피머신), TV는 상품이 없어 여기서 같은 규칙(아트 32×16 칸, 외곽선, PIXEL 2배)으로 그린다.
// 나머지 상품은 묶음 파일(scripts/motion/bundle*.mts · 연출④-5)에서 만들고, 묶음마다 미리보기 preview-{묶음}.png를 따로 쓴다
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { artItem, Cv } from '../src/renderer/map/iso/isoArt.ts'
import { HH, HW, PIXEL } from '../src/shared/iso/grid.ts'
import type { Rot } from '../src/shared/iso/furniture.ts'
import { BUNDLE1 } from './motion/bundle1.mts'
import { BUNDLE2 } from './motion/bundle2.mts'
import { BUNDLE3 } from './motion/bundle3.mts'
import { BUNDLE4 } from './motion/bundle4.mts'

type RGBA = [number, number, number, number]
type Pt = [number, number]
const hex = (c: string): RGBA => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]
const mix = (a: RGBA, b: RGBA, t: number): RGBA => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)).concat(a[3]) as RGBA
const OUT = hex('#2e2a40')
const K = {
  sky: hex('#a8dcf2'),
  skyL: hex('#e6f7ff'),
  white: hex('#f6f8fb'),
  paper: hex('#ffffff'),
  dark: hex('#3a3f55'),
  navy: hex('#3a4a6a'),
  metal: hex('#5d6380'),
  walnut: hex('#8a5a3c'),
  walnutT: hex('#a06a46'),
  screen: hex('#9fe3ff'),
  orange: hex('#f0834e'),
  green: hex('#3fc168'),
  yellow: hex('#edb417'),
  pink: hex('#f2a7b8'),
  mint: hex('#8fd6c2'),
  coffee: hex('#6b4128'),
  steam: [246, 248, 251, 200] as RGBA,
  steamL: [246, 248, 251, 120] as RGBA,
}
const ROTS: Rot[] = [0, 1, 2, 3]
const P = (o: Pt, gx: number, gy: number, z: number): Pt => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
function rotPt(x: number, y: number, r: Rot, W: number, D: number): [number, number] {
  let d = D
  let w = W
  for (let i = 0; i < r; i++) {
    ;[x, y] = [d - y, x]
    ;[w, d] = [d, w]
  }
  return [x, y]
}
const same = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const clone = (cv: Cv) => {
  const c = new Cv(cv.w, cv.h)
  c.px.set(cv.px)
  return c
}
const get = (cv: Cv, x: number, y: number): RGBA | null => (x < 0 || y < 0 || x >= cv.w || y >= cv.h ? null : cv.read(y * cv.w + x))

/** 덧그린 층(layer)에만 외곽선 1px — 바탕이 빈 칸일 때만 (isoArt outline과 같은 72%) */
function stamp(base: Cv, layer: Cv) {
  for (let y = 0; y < base.h; y++)
    for (let x = 0; x < base.w; x++) {
      const i = y * base.w + x
      if (layer.has(i) || base.has(i)) continue
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const n = get(layer, x + dx, y + dy)
        if (n && n[3] === 255) {
          base.write(i, mix(n, OUT, 0.72))
          break
        }
      }
    }
  base.blit(layer, 0, 0)
}

// ── 분수 (A 늘 움직임): 6장 · 3초 반복 ─────────────────────
// 바탕의 고정 물줄기(after)를 지우고, 물줄기 높이·물방울·수면 물결을 프레임마다 바꾼다. 모양이 대칭이라 네 방향이 같아 행 1개
function fountainFrames() {
  const a = artItem('lv-fountain', 0)
  const [cx, cy] = P(a.o, 1, 1, 30).map(Math.round) as Pt
  const base = clone(a.cv)
  const skyO = mix(K.sky, OUT, 0.72)
  const skyLO = mix(K.skyL, OUT, 0.72)
  const rimY = a.o[1] + 0.4 * HH - 6 - 1 // 수반 뒤쪽 테두리보다 위 = 허공
  for (let y = 0; y < Math.min(base.h, rimY); y++)
    for (let x = 0; x < base.w; x++) {
      const i = y * base.w + x
      if (!base.has(i)) continue
      const c = base.read(i)
      if (same(c, K.sky) || same(c, K.skyL) || same(c, skyO) || same(c, skyLO)) base.write(i, [0, 0, 0, 0])
    }
  const PEAK = [5, 6, 6.5, 6, 5, 4.5]
  return PEAK.map((peak, f) => {
    const cv = clone(base)
    const layer = new Cv(cv.w, cv.h)
    for (const s of [-1, 1])
      for (let t = 0; t < 12; t++) {
        const y = cy + Math.round(((t - 4) * (t - 4)) / 3 - peak)
        // 반짝이는 마디가 물줄기를 따라 흘러간다
        layer.set(cx + s * t, y, (t + f * 2) % 6 < 2 ? K.skyL : K.sky)
      }
    // 떨어지는 물방울 (프레임마다 한 칸씩 아래로)
    for (const s of [-1, 1]) {
      const t = 10 + (f % 3)
      layer.set(cx + s * (t + 1), cy + Math.round(((t - 4) * (t - 4)) / 3 - peak) + 2, K.skyL)
    }
    stamp(cv, layer)
    // 수면 물결: 반지름이 커졌다 사라진다 (물 위 칸에만)
    const rr = 0.28 + (f % 3) * 0.1
    for (let k = 0; k < 48; k++) {
      const th = (k / 48) * Math.PI * 2
      const [x, y] = P(a.o, 1 + Math.cos(th) * rr, 1 + Math.sin(th) * rr, 6).map(Math.round)
      const c = get(cv, x, y)
      if (c && same(c, K.sky)) cv.set(x, y, K.skyL)
    }
    return cv
  })
}

// ── 커피머신 (C 직원이 쓸 때): 대기 1장 + 쓰는 중 4장 · 1.2초 반복 ──
// 김은 위로 피어오르고(네 방향 모두), 커피 줄기·컵 채움은 앞면이 보이는 방향(r0·r3)만
function coffeeFrames(r: Rot) {
  const a = artItem('coffee-machine', r)
  const front = r === 0 || r === 3
  const at = (x: number, y: number, z: number) => P(a.o, ...rotPt(x, y, r, 1, 1), z).map(Math.round) as Pt
  const frames = [clone(a.cv)]
  for (let f = 0; f < 4; f++) {
    const cv = clone(a.cv)
    // 김: 두 가닥이 좌우로 흔들리며 올라간다 (반투명이라 외곽선 없음)
    const [sx, sy] = at(0.47, 0.41, 28)
    for (const [k, off] of [[0, -2], [1, 2]] as const)
      for (let t = 0; t < 7; t++) {
        const yy = sy - 1 - t - ((f + k * 2) % 4)
        const xx = sx + off + Math.round(Math.sin((t + f + k * 2) * 1.1) * 1.2)
        if (yy < 0) continue
        cv.set(xx, yy, t < 4 ? K.steam : K.steamL)
      }
    if (front) {
      // 커피 줄기 (깜빡이며 떨어짐) + 컵 위 수면
      const [nx, ny] = at(0.41, 0.66, 24)
      for (let t = 0; t < 4; t++) if ((t + f) % 4 !== 3) cv.set(nx, ny + t, K.coffee)
      const [px, py] = at(0.41, 0.67, 19)
      cv.set(px, py, K.coffee)
      cv.set(px + (f % 2 ? 1 : -1), py, K.coffee)
      // 사용 중 표시등: 주황 → 초록
      const [lx, ly] = at(0.47, 0.62, 17)
      cv.set(lx, ly, f % 2 ? K.green : mix(K.green, K.white, 0.4))
    }
    frames.push(cv)
  }
  return frames
}

// ── TV (B 눌러서 켜고 끄기): 꺼짐 1장 + 켜는 순간 1장(반응) + 켜짐 4장 · 2초 반복 ──
// 상품이 없어 시험 그림: 2×1칸 낮은 장 위 평면 TV. 화면(원래 +y 면)은 r0(왼쪽 아래 면)·r3(오른쪽 아래 면)에서 보인다
type Face = 'top' | 'S' | 'E' | 'N' | 'W'
type Paint = (u: number, v: number, f: number) => RGBA
interface Box {
  x: number
  y: number
  w: number
  d: number
  z: number
  h: number
  c: RGBA
  faces?: Partial<Record<Face, Paint>>
}
const TV_W = 2
const TV_D = 1
const screenPaint = (state: 'off' | 'boot' | 'on'): Paint => (u, v, f) => {
  // u: 왼→오, v: 아래→위 (화면 안쪽 0~1)
  if (u < 0.04 || u > 0.96 || v < 0.06 || v > 0.94) return K.dark
  if (state === 'off') return u + (1 - v) * 0.6 > 0.55 && u + (1 - v) * 0.6 < 0.68 ? mix(K.navy, K.white, 0.18) : mix(K.navy, K.dark, 0.5)
  if (state === 'boot') return Math.abs(v - 0.5) < 0.08 ? K.paper : Math.abs(v - 0.5) < 0.2 ? K.screen : mix(K.navy, K.dark, 0.5)
  // 켜짐: 하늘(위) · 언덕(아래) 화면에 해가 천천히 움직이고 주사선 한 줄이 내려간다. 2장마다 채널 색이 바뀐다
  const ch = f < 2 ? 0 : 1
  const sunX = 0.3 + f * 0.1
  const scan = Math.abs(v - (0.9 - f * 0.22)) < 0.04
  let c: RGBA
  if (Math.hypot((u - sunX) * 1.5, v - 0.7) < 0.16) c = ch ? K.pink : K.yellow
  else if (v < 0.3 + Math.sin(u * 7 + ch) * 0.08) c = ch ? K.mint : K.green
  else c = ch ? mix(K.screen, K.pink, 0.35) : K.screen
  return scan ? mix(c, K.paper, 0.35) : c
}
function tvBoxes(state: 'off' | 'boot' | 'on'): Box[] {
  return [
    { x: 0.05, y: 0.2, w: 1.9, d: 0.6, z: 0, h: 9, c: K.walnutT, faces: { S: (u, v) => (Math.abs(u - 0.5) < 0.008 || v < 0.12 ? K.walnut : K.walnutT) } },
    { x: 0.04, y: 0.18, w: 1.92, d: 0.64, z: 9, h: 1, c: K.walnut },
    { x: 0.9, y: 0.4, w: 0.2, d: 0.12, z: 10, h: 3, c: K.metal },
    { x: 0.12, y: 0.42, w: 1.76, d: 0.08, z: 13, h: 22, c: K.dark, faces: { S: screenPaint(state), N: (u, v) => (v > 0.4 && v < 0.6 && Math.abs(u - 0.5) < 0.1 ? K.metal : K.dark) } },
  ]
}
/** 원래 칸에서 본 바깥 방향 → 면 이름 */
const faceOfDir = (dx: number, dy: number): Face => (dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N')
/** r번 돌린 뒤 화면에 보이는 면(+y, +x)이 원래 어느 면인지: 방향을 거꾸로 r번 돌린다 */
function origFace(dx: number, dy: number, r: Rot): Face {
  for (let i = 0; i < r; i++) [dx, dy] = [dy, -dx]
  return faceOfDir(dx, dy)
}
function unrotPt(X: number, Y: number, r: Rot): [number, number] {
  // rotPt의 거꾸로: 한 번 돌릴 때 (x,y)→(d−y, x), 돌린 뒤 칸 수는 (d, w)
  const dims: [number, number][] = [[TV_W, TV_D]]
  for (let i = 0; i < r; i++) dims.push([dims[i][1], dims[i][0]])
  for (let i = r; i > 0; i--) {
    const dPrev = dims[i - 1][1]
    ;[X, Y] = [Y, dPrev - X]
  }
  return [X, Y]
}
function fillPoly(cv: Cv, pts: Pt[], colorAt: (x: number, y: number) => RGBA | null) {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
      const px = x + 0.5
      const py = y + 0.5
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]
        const [xj, yj] = pts[j]
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      }
      if (inside) cv.set(x, y, colorAt(px, py))
    }
}
function artTv(r: Rot, state: 'off' | 'boot' | 'on', f: number) {
  const [w, d] = r % 2 ? [TV_D, TV_W] : [TV_W, TV_D]
  const H = 35
  const pad = 3
  const cv = new Cv((w + d) * HW + pad * 2, (w + d) * HH + H + pad * 2)
  const o: Pt = [d * HW + pad, H + pad]
  const g = 0.08
  fillPoly(cv, [P(o, -g, -g, 0), P(o, w + g, -g, 0), P(o, w + g, d + g, 0), P(o, -g, d + g, 0)], () => [42, 46, 80, 46])
  const shade = (c: RGBA, t: number) => mix(c, hex('#4a4f80'), t)
  const boxes = tvBoxes(state)
    .map((b) => {
      // 돌린 상자: 네 꼭짓점을 돌려 최소·최대
      const cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]].map(([x, y]) => rotPt(x, y, r, TV_W, TV_D))
      const x = Math.min(...cs.map((c) => c[0]))
      const y = Math.min(...cs.map((c) => c[1]))
      return { b, x, y, w: Math.max(...cs.map((c) => c[0])) - x, d: Math.max(...cs.map((c) => c[1])) - y }
    })
    .sort((p, q) => p.b.z - q.b.z || p.x + p.y - (q.x + q.y))
  for (const { b, x, y, w: bw, d: bd } of boxes) {
    // 면 안의 점 → 원래 면 좌표 (u: 면 가로, v: 아래→위)
    const uv = (face: Face, gx: number, gy: number, z: number): [number, number] => {
      const [ox, oy] = unrotPt(gx, gy, r)
      const v = (z - b.z) / b.h
      if (face === 'S') return [(ox - b.x) / b.w, v]
      if (face === 'N') return [1 - (ox - b.x) / b.w, v]
      if (face === 'E') return [1 - (oy - b.y) / b.d, v]
      return [(oy - b.y) / b.d, v]
    }
    const paintOf = (face: Face, gx: number, gy: number, z: number) => {
      const p = b.faces?.[face]
      if (!p) return b.c
      const [u, v] = uv(face, gx, gy, z)
      return p(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)), f)
    }
    const z1 = b.z + b.h
    // 윗면
    fillPoly(cv, [P(o, x, y, z1), P(o, x + bw, y, z1), P(o, x + bw, y + bd, z1), P(o, x, y + bd, z1)], () => mix(b.c, hex('#ffffff'), 0.2))
    // 왼쪽 아래 면 (+y)
    const fS = origFace(0, 1, r)
    fillPoly(cv, [P(o, x, y + bd, b.z), P(o, x + bw, y + bd, b.z), P(o, x + bw, y + bd, z1), P(o, x, y + bd, z1)], (px, py) => {
      const gx = (px - o[0]) / HW + (y + bd)
      const z = o[1] + (gx + y + bd) * HH - py
      return shade(paintOf(fS, gx, y + bd, z), 0.12)
    })
    // 오른쪽 아래 면 (+x)
    const fE = origFace(1, 0, r)
    fillPoly(cv, [P(o, x + bw, y, b.z), P(o, x + bw, y + bd, b.z), P(o, x + bw, y + bd, z1), P(o, x + bw, y, z1)], (px, py) => {
      const gy = x + bw - (px - o[0]) / HW
      const z = o[1] + (x + bw + gy) * HH - py
      return shade(paintOf(fE, x + bw, gy, z), 0.26)
    })
  }
  // 외곽선 (isoArt outline과 같은 규칙)
  const src = cv.px.slice()
  for (let yy = 0; yy < cv.h; yy++)
    for (let xx = 0; xx < cv.w; xx++) {
      const i = yy * cv.w + xx
      if (src[i * 4 + 3] > 0) continue
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = xx + dx
        const ny = yy + dy
        const n = ny * cv.w + nx
        if (nx >= 0 && ny >= 0 && nx < cv.w && ny < cv.h && src[n * 4 + 3] === 255) {
          cv.write(i, mix([src[n * 4], src[n * 4 + 1], src[n * 4 + 2], 255], OUT, 0.72))
          break
        }
      }
    }
  return { cv, o }
}
function tvFrames(r: Rot) {
  return [artTv(r, 'off', 0).cv, artTv(r, 'boot', 0).cv, ...[0, 1, 2, 3].map((f) => artTv(r, 'on', f).cv)]
}

// ── 시트 조립 ───────────────────────────────────────────
function encodePng(cv: Cv, scale: number) {
  const CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff
    for (const x of buf) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const { w, h, data } = cv.scaled(scale)
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
/** rows[행][프레임] → 같은 칸 크기 격자 (빈 칸은 투명) */
function sheet(rows: Cv[][]) {
  const cw = Math.max(...rows.flat().map((c) => c.w))
  const ch = Math.max(...rows.flat().map((c) => c.h))
  const cols = Math.max(...rows.map((r) => r.length))
  const out = new Cv(cw * cols, ch * rows.length)
  rows.forEach((r, ri) => r.forEach((c, fi) => out.blit(c, fi * cw, ri * ch)))
  return { cv: out, cw, ch, cols }
}

const outDir = process.argv[2]
if (!outDir) {
  console.error('사용: node scripts/motion-pilot.mts <출력폴더>')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })
const tvAnchor = ROTS.map((r) => artTv(r, 'off', 0).o)
const coffeeAnchor = ROTS.map((r) => artItem('coffee-machine', r).o)
const SHEETS = [
  {
    id: 'lv-fountain',
    kind: 'A',
    rows: [fountainFrames()],
    rowOfRot: [0, 0, 0, 0],
    anchors: [artItem('lv-fountain', 0).o],
    clips: { loop: { frames: [0, 1, 2, 3, 4, 5], ms: 500 } },
    still: 0,
  },
  {
    id: 'tv',
    kind: 'B',
    rows: ROTS.map((r) => (r === 0 || r === 3 ? tvFrames(r) : [artTv(r, 'off', 0).cv])),
    rowOfRot: [0, 1, 2, 3],
    anchors: tvAnchor,
    clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2, 3, 4, 5], ms: 500 } },
    still: { off: 0, on: 2 },
    note: '뒷면 방향(r1·r2)은 화면이 안 보여 0번 한 장만 둔다',
  },
  {
    id: 'coffee-machine',
    kind: 'C',
    rows: ROTS.map((r) => coffeeFrames(r)),
    rowOfRot: [0, 1, 2, 3],
    anchors: coffeeAnchor,
    clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } },
    still: { idle: 0, use: 1 },
    shares: ['prop-coffeeCorner', 'lv-espresso-bar'],
  },
]
const manifest: Record<string, unknown> = { scale: PIXEL, note: '칸 크기·기준점은 아트 px(×scale = 화면 px). 기준점 = 가구 로컬 (0,0) 칸 꼭짓점, 같은 행의 모든 프레임이 같다' }
const BUNDLES: [string, { id: string; rows: Cv[][] }[]][] = [
  ['', SHEETS],
  ['b1', BUNDLE1],
  ['b2', BUNDLE2],
  ['b3', BUNDLE3],
  ['b4', BUNDLE4],
]
for (const [bundle, list] of BUNDLES) {
  const previews: Cv[] = []
  for (const s of list) {
    const { cv, cw, ch, cols } = sheet(s.rows)
    const file = `${s.id}.png`
    const png = encodePng(cv, PIXEL)
    fs.writeFileSync(path.join(outDir, file), png)
    const { rows, ...meta } = s
    // rowFrames: 행마다 실제 장수 — 짧은 행(TV 뒷면)은 엔진이 없는 칸 대신 0번을 쓴다
    manifest[s.id] = { ...meta, file, cell: [cw, ch], cols, rowCount: rows.length, rowFrames: rows.map((r) => r.length), frameCount: rows.flat().length, px: [cv.w * PIXEL, cv.h * PIXEL] }
    previews.push(cv)
    console.log([bundle || 'pilot', file, `${cv.w * PIXEL}x${cv.h * PIXEL}`, `${(png.length / 1024).toFixed(1)}KB`, `${rows.flat().length}장`, `${Math.round((cv.w * PIXEL * cv.h * PIXEL * 4) / 1024)}KB(RGBA)`].join('\t'))
  }
  // 미리보기: 시트들을 어두운 바탕에 세로로 (시트는 투명이라 보기용)
  const gap = 8
  const pv = new Cv(Math.max(...previews.map((c) => c.w)) + gap * 2, previews.reduce((a, c) => a + c.h + gap, gap))
  pv.fill('#15181e')
  let y = gap
  for (const c of previews) {
    pv.blit(c, gap, y)
    y += c.h + gap
  }
  fs.writeFileSync(path.join(outDir, bundle ? `preview-${bundle}.png` : 'preview.png'), encodePng(pv, PIXEL))
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
// 확인용 확대 (MOTION_ZOOM=폴더): 시트마다 r0·r1 행의 프레임을 4배로 (배경 어둡게)
if (process.env.MOTION_ZOOM)
  for (const [, list] of BUNDLES)
    for (const s of list) {
      const rows = s.rows.slice(0, 2)
      const cw = Math.max(...rows.flat().map((c) => c.w))
      const ch = Math.max(...rows.flat().map((c) => c.h))
      const z = new Cv(cw * Math.max(...rows.map((r) => r.length)), ch * rows.length)
      z.fill('#15181e')
      rows.forEach((r, ri) => r.forEach((c, fi) => z.blit(c, fi * cw, ri * ch)))
      fs.writeFileSync(path.join(process.env.MOTION_ZOOM!, `zoom-${s.id}.png`), encodePng(z, 4))
    }
