// 아이콘 2단계(생성): art-grid.png(칸당 1px 도트 사무실)와 16·32px 전용 그림으로 모든 배포 아이콘을 만든다.
// 같은 입력이면 같은 결과가 나온다. 산출물은 임시 폴더에 먼저 쓰고, 모든 검사를 통과해야 실제 경로로 옮긴다.
// 사용: node scripts/icon.mjs final   (app 폴더에서)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng, resizeBox } from './icon-png.mjs'
import { PALETTE, SMALL16, SMALL32 } from './icon-art/small.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const ART_FILE = path.join(HERE, 'icon-art', 'art-grid.png')

// ── 규격 (기존 icon.mjs와 같은 1024 캔버스·832 본체·반경 186) ──
const SIZE = 1024
const BODY = 832
const OFFSET = (SIZE - BODY) / 2
const RADIUS = 186
const ART_CELL = 12 // 큰 그림 한 칸 = 1024 캔버스에서 12px (정수배라 보간 없음)
// 타일 배경: 확정 시안 v3(pixel-office-light-gradient.png)에서 잰 왼쪽 위 → 오른쪽 아래 대각 그라데이션
const GRAD_FROM = [197, 184, 222]
const GRAD_TO = [98, 104, 139]
// 16·32px은 타일을 캔버스에 꽉 채우고 반경은 크기의 22%
const SMALL_RADIUS = 0.22
// 안드로이드 adaptive: 108dp 캔버스, 그림은 가운데 지름 66dp 원 안
const ADAPTIVE_DP = 108
const SAFE_RADIUS_DP = 33
const XXXHDPI = 4 // px/dp

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const COLORS = Object.fromEntries(Object.entries(PALETTE).map(([ch, [c]]) => [ch, hex(c)]))
const keyOf = (r, g, b) => `${r},${g},${b}`
const CHAR_OF = Object.fromEntries(Object.entries(COLORS).map(([ch, c]) => [keyOf(...c), ch]))

// ── 원본 읽기: art-grid.png → 글자 격자 ('.'는 투명) ──
function loadArt() {
  const { w, h, rgba } = decodePng(fs.readFileSync(ART_FILE))
  const rows = []
  for (let y = 0; y < h; y++) {
    let s = ''
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (rgba[i + 3] === 0) { s += '.'; continue }
      const ch = CHAR_OF[keyOf(rgba[i], rgba[i + 1], rgba[i + 2])]
      if (!ch || rgba[i + 3] !== 255) throw new Error(`art-grid.png (${x},${y})의 색이 팔레트에 없습니다: ${keyOf(rgba[i], rgba[i + 1], rgba[i + 2])}`)
      s += ch
    }
    rows.push(s)
  }
  return rows
}

/** 원본 격자 검사: 그림이 통째로 사라지는 사고(빈 타일)를 여기서 막는다 */
function checkArt(rows, name) {
  const errs = []
  const cells = rows.join('')
  const filled = [...cells].filter((c) => c !== '.').length
  if (filled / cells.length < 0.4) errs.push(`${name}: 그림 칸 비율 ${(filled / cells.length * 100).toFixed(0)}% < 40%`)
  if (![...cells].includes('o')) errs.push(`${name}: 외곽선 칸이 없습니다`)
  if (new Set(rows.map((r) => r.length)).size !== 1) errs.push(`${name}: 행 길이가 다릅니다`)
  for (const c of new Set(cells)) if (c !== '.' && !PALETTE[c]) errs.push(`${name}: 팔레트에 없는 글자 '${c}'`)
  // 그림이 한 덩어리인지
  const w = rows[0].length, h = rows.length
  const seen = new Set()
  let groups = 0
  for (let s = 0; s < w * h; s++) {
    if (cells[s] === '.' || seen.has(s)) continue
    groups++
    const q = [s]
    seen.add(s)
    while (q.length) {
      const k = q.pop()
      const x = k % w, y = (k - x) / w
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const nk = ny * w + nx
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && cells[nk] !== '.' && !seen.has(nk)) { seen.add(nk); q.push(nk) }
      }
    }
  }
  if (groups !== 1) errs.push(`${name}: 그림이 ${groups}덩어리로 나뉘어 있습니다`)
  return errs
}

// ── 그리기 ──
const gradAt = (t) => GRAD_FROM.map((v, i) => Math.round(v + (GRAD_TO[i] - v) * t))

/** 둥근 사각 타일 + 가운데 그림. tile=[x0, 크기], cell=그림 한 칸 px(정수) */
function renderTile(n, tile0, tileSize, radius, rows, cell, opaque = false) {
  const out = Buffer.alloc(n * n * 4)
  const aw = rows[0].length * cell, ah = rows.length * cell
  const ax = Math.round((n - aw) / 2), ay = Math.round((n - ah) / 2)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const bx = x + 0.5 - tile0, by = y + 0.5 - tile0
      let alpha = 1
      if (!opaque) {
        if (bx < 0 || by < 0 || bx > tileSize || by > tileSize) continue
        const cx = Math.min(Math.max(bx, radius), tileSize - radius)
        const cy = Math.min(Math.max(by, radius), tileSize - radius)
        const d = Math.hypot(bx - cx, by - cy)
        if (d > radius + 0.5) continue
        alpha = d > radius - 0.5 ? radius + 0.5 - d : 1
      }
      const ch = rows[Math.floor((y - ay) / cell)]?.[Math.floor((x - ax) / cell)]
      const c = ch && ch !== '.' ? COLORS[ch] : gradAt(Math.min(1, Math.max(0, (bx + by) / (2 * tileSize))))
      const i = (y * n + x) * 4
      out[i] = c[0]
      out[i + 1] = c[1]
      out[i + 2] = c[2]
      out[i + 3] = Math.round(alpha * 255)
    }
  return out
}

/** 그림만 투명 캔버스에 (안드로이드 전경) */
function renderArt(n, rows, cell) {
  const out = Buffer.alloc(n * n * 4)
  const aw = rows[0].length * cell, ah = rows.length * cell
  const ax = Math.round((n - aw) / 2), ay = Math.round((n - ah) / 2)
  rows.forEach((r, j) =>
    [...r].forEach((ch, i) => {
      if (ch === '.') return
      for (let y = ay + j * cell; y < ay + (j + 1) * cell; y++)
        for (let x = ax + i * cell; x < ax + (i + 1) * cell; x++) out.set([...COLORS[ch], 255], (y * n + x) * 4)
    }),
  )
  return out
}

/** 원 안전 영역에 맞는 칸 크기: 그림 칸 꼭짓점 중 중심에서 가장 먼 거리(칸 단위) */
function maxRadiusCells(rows) {
  const w = rows[0].length, h = rows.length
  let m = 0
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.') return
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) m = Math.max(m, Math.hypot(i + dx - w / 2, j + dy - h / 2))
  }))
  return m
}

const crop = (src, n, x0, size) => {
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) src.copy(out, y * size * 4, ((y + x0) * n + x0) * 4, ((y + x0) * n + x0 + size) * 4)
  return out
}
const over = (bg, fg) => {
  const out = Buffer.from(bg)
  for (let i = 0; i < out.length; i += 4) {
    const a = fg[i + 3] / 255
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(fg[i + c] * a + out[i + c] * (1 - a))
    out[i + 3] = Math.max(out[i + 3], fg[i + 3])
  }
  return out
}
/** 마스크(원·둥근 사각)로 자르기, 가장자리 1px은 반투명 */
function mask(src, n, shape) {
  const out = Buffer.from(src)
  const r = n / 2
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const px = x + 0.5, py = y + 0.5
      let d
      if (shape === 'circle') d = Math.hypot(px - r, py - r) - r
      else {
        const rr = n * shape
        const cx = Math.min(Math.max(px, rr), n - rr), cy = Math.min(Math.max(py, rr), n - rr)
        d = Math.hypot(px - cx, py - cy) - rr
      }
      const a = d > 0.5 ? 0 : d > -0.5 ? 0.5 - d : 1
      out[(y * n + x) * 4 + 3] = Math.round(out[(y * n + x) * 4 + 3] * a)
    }
  return out
}

// ── 컨테이너 형식 ──
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
function encodeIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map(([n, png]) => {
    const e = Buffer.alloc(16)
    e[0] = n % 256 // 256은 0으로 적는다
    e[1] = n % 256
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([header, ...entries, ...pngs.map(([, p]) => p)])
}
// icns: 조각(형식 4글자 + 길이 + PNG)을 이어 붙인다. iconutil 없이 맥·윈도우 어디서나 만들 수 있다
const ICNS_TYPES = [['icp4', 16], ['icp5', 32], ['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic08', 256], ['ic13', 256], ['ic09', 512], ['ic14', 512], ['ic10', 1024]]
function encodeIcns(pngOf) {
  const parts = ICNS_TYPES.map(([type, n]) => {
    const png = pngOf(n)
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(8 + parts.reduce((s, p) => s + p.length, 0), 4)
  return Buffer.concat([head, ...parts])
}
const parseIco = (buf) => Array.from({ length: buf.readUInt16LE(4) }, (_, i) => {
  const e = 6 + i * 16
  return { n: buf[e] || 256, png: buf.subarray(buf.readUInt32LE(e + 12), buf.readUInt32LE(e + 12) + buf.readUInt32LE(e + 8)) }
})
const parseIcns = (buf) => {
  const list = []
  for (let p = 8; p < buf.length; p += buf.readUInt32BE(p + 4)) list.push({ type: buf.toString('ascii', p, p + 4), png: buf.subarray(p + 8, p + buf.readUInt32BE(p + 4)) })
  return list
}

// ── 안드로이드 벡터 ──
/** 칸 행을 가로 줄 사각형으로 묶은 pathData (뷰포트 1단위 = 1칸) */
function runs(rows, pick) {
  let d = ''
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; ) {
      if (!pick(r[x])) { x++; continue }
      let x2 = x
      while (x2 < r.length && pick(r[x2])) x2++
      d += `M${x},${y}h${x2 - x}v1h-${x2 - x}z`
      x = x2
    }
  })
  return d
}
function monochromeXml(rows, cellDp) {
  const w = rows[0].length, h = rows.length
  const levels = [...new Set(Object.values(PALETTE).map(([, , a]) => a))].sort((a, b) => b - a)
  const paths = levels
    .map((a) => {
      const d = runs(rows, (ch) => ch !== '.' && PALETTE[ch][2] === a)
      const hexA = Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase()
      return d && `        <path\n            android:fillColor="#${hexA}000000"\n            android:pathData="${d}" />`
    })
    .filter(Boolean)
  const tx = ((ADAPTIVE_DP - w * cellDp) / 2).toFixed(3), ty = ((ADAPTIVE_DP - h * cellDp) / 2).toFixed(3)
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- 테마 아이콘(Android 13+)용 단색 레이어: 도트 사무실을 역할별 진하기(외곽선·머리·모니터 100%, 책상·옷·화분 70%, 벽·바닥 35%)로.
     1칸 = ${cellDp.toFixed(3)}dp, 가운데 66dp 원 안. app/scripts/icon.mjs final로 생성 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="${cellDp.toFixed(4)}"
        android:scaleY="${cellDp.toFixed(4)}"
        android:translateX="${tx}"
        android:translateY="${ty}">
${paths.join('\n')}
    </group>
</vector>
`
}
const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
const backgroundXml = () => `<?xml version="1.0" encoding="utf-8"?>
<!-- 런처 아이콘 배경: PC 앱 아이콘과 같은 라벤더 → 회보라 대각 그라데이션. app/scripts/icon.mjs final로 생성 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="0"
                android:startY="0"
                android:endX="108"
                android:endY="108"
                android:startColor="${toHex(GRAD_FROM)}"
                android:endColor="${toHex(GRAD_TO)}" />
        </aapt:attr>
    </path>
</vector>
`

// ── 산출물 목록 (경로는 저장소 루트 기준) ──
const ANDROID_RES = 'android/app/src/main/res'
const DENSITIES = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]

export function build() {
  const art = loadArt()
  const errs = [...checkArt(art, 'art-grid.png'), ...checkArt(SMALL32, 'SMALL32'), ...checkArt(SMALL16, 'SMALL16')]
  if (errs.length) throw new Error('원본 검사 실패 — 아무 파일도 쓰지 않았습니다\n' + errs.join('\n'))
  if (art[0].length * ART_CELL > BODY * 0.86 || art.length * ART_CELL > BODY * 0.86) throw new Error('그림이 타일보다 큽니다')

  const files = {} // 저장소 상대 경로 → Buffer
  const png = (n, rgba) => encodePng(n, n, rgba)

  // 큰 마스터와 크기별 이미지
  const master = renderTile(SIZE, OFFSET, BODY, RADIUS, art, ART_CELL)
  const small = { 16: renderTile(16, 0, 16, 16 * SMALL_RADIUS, SMALL16, 1), 32: renderTile(32, 0, 32, 32 * SMALL_RADIUS, SMALL32, 1) }
  const sized = (n) => (small[n] ? small[n] : n === 24 ? resizeBox(small[32], 32, 24) : n === SIZE ? master : resizeBox(master, SIZE, n))
  const pngCache = {}
  const pngOf = (n) => (pngCache[n] ??= png(n, sized(n)))

  files['app/build/icon.png'] = pngOf(1024)
  files['app/build/icon.ico'] = encodeIco(ICO_SIZES.map((n) => [n, pngOf(n)]))
  files['app/build/icon.icns'] = encodeIcns(pngOf)
  // 윈도우 알림 영역(tray.ts): 큰 아이콘을 16으로 줄이면 뭉개져서 16·32 전용 그림을 쓴다 (@2x는 배율 높은 화면용)
  files['app/build/trayWin.png'] = pngOf(16)
  files['app/build/trayWin@2x.png'] = pngOf(32)
  files['site/assets/icon.png'] = pngOf(512)
  files['site/assets/favicon-32.png'] = pngOf(32)
  // apple-touch: iOS가 모서리를 직접 깎고 투명은 검게 칠하므로 타일을 꽉 채운 불투명
  files['site/assets/apple-touch-icon.png'] = png(180, resizeBox(renderTile(SIZE, 0, SIZE, 0, art, Math.round((ART_CELL * SIZE) / BODY), true), SIZE, 180))

  // 안드로이드: xxxhdpi(4px/dp)에서 한 번 그리고 줄인다
  const fgN = ADAPTIVE_DP * XXXHDPI
  const fgCell = Math.floor((SAFE_RADIUS_DP * XXXHDPI) / maxRadiusCells(art))
  const fg = renderArt(fgN, art, fgCell)
  const bg = renderTile(fgN, 0, fgN, 0, [['.']], 1, true)
  const legacyN = 72 * XXXHDPI // 108dp 중 가운데 72dp가 보이는 영역
  const visible = crop(over(bg, fg), fgN, (fgN - legacyN) / 2, legacyN)
  const legacySq = mask(visible, legacyN, 0.22)
  const legacyRound = mask(visible, legacyN, 'circle')
  for (const [dpi, k] of DENSITIES) {
    const dir = `${ANDROID_RES}/mipmap-${dpi}`
    files[`${dir}/ic_launcher_foreground.png`] = png(108 * k, k === 4 ? fg : resizeBox(fg, fgN, 108 * k))
    files[`${dir}/ic_launcher.png`] = png(48 * k, resizeBox(legacySq, legacyN, 48 * k))
    files[`${dir}/ic_launcher_round.png`] = png(48 * k, resizeBox(legacyRound, legacyN, 48 * k))
  }
  files[`${ANDROID_RES}/drawable/ic_launcher_background.xml`] = Buffer.from(backgroundXml())
  files[`${ANDROID_RES}/drawable/ic_launcher_monochrome.xml`] = Buffer.from(monochromeXml(art, fgCell / XXXHDPI))
  for (const name of ['ic_launcher', 'ic_launcher_round'])
    files[`${ANDROID_RES}/mipmap-anydpi-v26/${name}.xml`] = Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<!-- PC 앱 아이콘(app/build/icon.png)과 같은 도트 사무실. 배경은 라벤더 그라데이션, 전경은 108dp 가운데 66dp 원 안. app/scripts/icon.mjs final로 생성 -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`)
  return { files, fgCell, art }
}

// ── 산출물 검사 (디스크에 쓴 파일을 다시 읽어 확인) ──
function verify(dir) {
  const errs = []
  const read = (rel) => fs.readFileSync(path.join(dir, rel))
  /** 타일 아이콘: 크기, 모서리 투명, 그림(타일 색이 아닌 픽셀) 비율 */
  const checkTile = (name, buf, n, { corner = true, minArt = 0.15 } = {}) => {
    const img = decodePng(buf)
    if (img.w !== n || img.h !== n) return errs.push(`${name}: 크기 ${img.w}×${img.h} ≠ ${n}`)
    if (corner) for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) if (img.rgba[(y * n + x) * 4 + 3] !== 0) errs.push(`${name}: 모서리 (${x},${y})가 투명하지 않습니다`)
    let artPx = 0, solid = 0
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4
        if (img.rgba[i + 3] < 250) continue
        solid++
        const t = (x + y + 1) / (2 * n)
        const g = gradAt(t)
        if (Math.abs(img.rgba[i] - g[0]) + Math.abs(img.rgba[i + 1] - g[1]) + Math.abs(img.rgba[i + 2] - g[2]) > 60) artPx++
      }
    if (!solid || artPx / solid < minArt) errs.push(`${name}: 그림 비율 ${((artPx / (solid || 1)) * 100).toFixed(0)}% < ${minArt * 100}% (빈 타일?)`)
  }
  checkTile('icon.png', read('app/build/icon.png'), 1024)
  const ico = parseIco(read('app/build/icon.ico'))
  if (ico.map((e) => e.n).join() !== ICO_SIZES.join()) errs.push(`icon.ico 크기 목록 ${ico.map((e) => e.n)}`)
  for (const e of ico) checkTile(`icon.ico ${e.n}`, e.png, e.n)
  const icns = parseIcns(read('app/build/icon.icns'))
  if (icns.map((e) => e.type).join() !== ICNS_TYPES.map(([t]) => t).join()) errs.push(`icon.icns 조각 ${icns.map((e) => e.type)}`)
  icns.forEach((e, i) => checkTile(`icon.icns ${e.type}`, e.png, ICNS_TYPES[i][1]))
  checkTile('trayWin.png', read('app/build/trayWin.png'), 16)
  checkTile('trayWin@2x.png', read('app/build/trayWin@2x.png'), 32)
  checkTile('site icon.png', read('site/assets/icon.png'), 512)
  checkTile('favicon-32.png', read('site/assets/favicon-32.png'), 32)
  checkTile('apple-touch-icon.png', read('site/assets/apple-touch-icon.png'), 180, { corner: false })
  for (const [dpi, k] of DENSITIES) {
    const dir = `${ANDROID_RES}/mipmap-${dpi}`
    checkTile(`${dpi} ic_launcher`, read(`${dir}/ic_launcher.png`), 48 * k)
    checkTile(`${dpi} ic_launcher_round`, read(`${dir}/ic_launcher_round.png`), 48 * k)
    // 전경: 불투명 픽셀이 모두 가운데 66dp 원 안
    const n = 108 * k
    const fg = decodePng(read(`${dir}/ic_launcher_foreground.png`))
    if (fg.w !== n || fg.h !== n) {
      errs.push(`${dpi} foreground 크기 ${fg.w}×${fg.h} ≠ ${n}×${n}`)
      continue
    }
    let far = 0, count = 0
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (fg.rgba[(y * n + x) * 4 + 3] > 8) { count++; far = Math.max(far, Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / k) }
    if (count < n * n * 0.15) errs.push(`${dpi} foreground 그림이 너무 적습니다 (${count}px)`)
    if (far > SAFE_RADIUS_DP + 0.5) errs.push(`${dpi} foreground가 안전 영역을 벗어납니다 (${far.toFixed(1)}dp > ${SAFE_RADIUS_DP}dp)`)
  }
  const mono = read(`${ANDROID_RES}/drawable/ic_launcher_monochrome.xml`).toString()
  if ((mono.match(/<path/g) || []).length < 3) errs.push('monochrome: 진하기 단계 path가 3개 미만')
  return errs
}

// ── 비교 시트: 실제로 쓴 파일을 다시 읽어 그린다 ──
function sheet(dir, art, fgCell) {
  const W = 1500, H = 1520
  const out = Buffer.alloc(W * H * 4)
  const fill = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.set([...c, 255], (y * W + x) * 4) }
  const blit = (img, x0, y0, scale = 1) => {
    for (let y = 0; y < img.h * scale; y++)
      for (let x = 0; x < img.w * scale; x++) {
        const s = (Math.floor(y / scale) * img.w + Math.floor(x / scale)) * 4
        const a = img.rgba[s + 3] / 255
        const o = ((y0 + y) * W + x0 + x) * 4
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(img.rgba[s + c] * a + out[o + c] * (1 - a))
      }
  }
  const read = (rel) => decodePng(fs.readFileSync(path.join(dir, rel)))
  const ico = Object.fromEntries(parseIco(fs.readFileSync(path.join(dir, 'app/build/icon.ico'))).map((e) => [e.n, decodePng(e.png)]))
  const icns512 = decodePng(parseIcns(fs.readFileSync(path.join(dir, 'app/build/icon.icns'))).find((e) => e.type === 'ic09').png)
  const src = decodePng(fs.readFileSync(path.join(ROOT, 'docs/icon-drafts/v3/pixel-office-light-gradient.png')))
  const srcSmall = { w: 256, h: 256, rgba: resizeBox(src.rgba, src.w, 256) }
  // 윈도우 트레이: 위 = 실제 trayWin.png, 아래 = 예전처럼 1024를 16으로 줄인 것 (비교용)
  const tray = read('app/build/trayWin.png')
  const trayOld = { w: 16, h: 16, rgba: resizeBox(read('app/build/icon.png').rgba, 1024, 16) }
  // 1·2줄: 밝은 배경 / 어두운 배경 — 원본(v3), 16(1×·4×), 32(1×·4×), 128, 512, 트레이 16
  for (const [row, bgc] of [[0, [255, 255, 255]], [1, [28, 27, 38]]]) {
    const y0 = row * 600
    fill(0, y0, W, 600, bgc)
    blit(srcSmall, 20, y0 + 20)
    blit(ico[16], 300, y0 + 20); blit(ico[16], 300, y0 + 50, 4)
    blit(ico[32], 380, y0 + 20); blit(ico[32], 380, y0 + 70, 4)
    blit(ico[128], 520, y0 + 20)
    blit(icns512, 670, y0 + 20)
    blit(tray, 1220, y0 + 20); blit(tray, 1220, y0 + 50, 4)
    blit(trayOld, 1320, y0 + 20); blit(trayOld, 1320, y0 + 50, 4)
  }
  // 아래: 안드로이드 원·둥근 사각 마스크, 레거시, 단색 미리보기(진하기 단계를 회색으로)
  const fg = read(`${ANDROID_RES}/mipmap-xxxhdpi/ic_launcher_foreground.png`)
  const fgBg = over(renderTile(432, 0, 432, 0, [['.']], 1, true), fg.rgba)
  const y1 = 1260
  fill(0, 1200, W, 320, [240, 240, 244])
  const half = { w: 216, h: 216, rgba: resizeBox(mask(fgBg, 432, 'circle'), 432, 216) }
  blit(half, 20, y1)
  blit({ w: 216, h: 216, rgba: resizeBox(mask(fgBg, 432, 0.3), 432, 216) }, 260, y1)
  blit(read(`${ANDROID_RES}/mipmap-xxxhdpi/ic_launcher.png`), 500, y1)
  blit(read(`${ANDROID_RES}/mipmap-xxxhdpi/ic_launcher_round.png`), 720, y1)
  const mono = Buffer.alloc(432 * 432 * 4)
  const aw = art[0].length * fgCell, ah = art.length * fgCell
  const ax = Math.round((432 - aw) / 2), ay = Math.round((432 - ah) / 2)
  for (let y = 0; y < 432; y++)
    for (let x = 0; x < 432; x++) {
      const ch = art[Math.floor((y - ay) / fgCell)]?.[Math.floor((x - ax) / fgCell)]
      const a = ch && ch !== '.' ? PALETTE[ch][2] : 0
      mono.set([230, 228, 255, Math.round(a * 255)], (y * 432 + x) * 4)
    }
  const monoBg = mask(over(Buffer.alloc(432 * 432 * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 60)), mono), 432, 'circle')
  blit({ w: 216, h: 216, rgba: resizeBox(monoBg, 432, 216) }, 960, y1)
  return encodePng(W, H, out)
}

const SHEET = 'docs/icon-drafts/final/comparison-16-32-128-512.png'

export function run() {
  const t0 = Date.now()
  const { files, fgCell, art } = build()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-final-'))
  for (const [rel, buf] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true })
    fs.writeFileSync(path.join(tmp, rel), buf)
  }
  const fail = (msg) => {
    console.error(`${msg} — 실제 경로는 실행 전 그대로입니다 (임시 폴더: ${tmp})`)
    process.exit(1)
  }
  const errs = verify(tmp)
  if (errs.length) fail('산출물 검사 실패\n' + errs.join('\n'))
  // 비교 시트까지 임시 폴더에서 완성해야 교체를 시작한다
  try {
    files[SHEET] = sheet(tmp, art, fgCell)
    fs.mkdirSync(path.dirname(path.join(tmp, SHEET)), { recursive: true })
    fs.writeFileSync(path.join(tmp, SHEET), files[SHEET])
  } catch (e) {
    fail(`비교 시트 생성 실패: ${e.message}`)
  }
  // 교체: 기존 파일을 임시 폴더에 백업해 두고, 도중에 실패하면 되돌린다
  const backup = path.join(tmp, '.backup')
  // 복사가 실패하면서 대상을 망가뜨릴 수 있으니, 복사를 시도한 파일은 모두 되돌릴 대상에 넣는다
  const touched = []
  try {
    for (const rel of Object.keys(files)) {
      const dst = path.join(ROOT, rel)
      const had = fs.existsSync(dst)
      if (had) {
        fs.mkdirSync(path.dirname(path.join(backup, rel)), { recursive: true })
        fs.copyFileSync(dst, path.join(backup, rel))
      }
      touched.push([rel, had])
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(path.join(tmp, rel), dst)
    }
  } catch (e) {
    // 되돌리기를 시도한 뒤, 성공 여부는 실제 내용이 백업과 같은지로 판정한다
    const stuck = []
    for (const [rel, had] of touched.reverse()) {
      const dst = path.join(ROOT, rel)
      try {
        if (had) fs.copyFileSync(path.join(backup, rel), dst)
        else fs.rmSync(dst, { force: true })
      } catch {}
      let ok = false
      try {
        ok = had ? fs.readFileSync(dst).equals(fs.readFileSync(path.join(backup, rel))) : !fs.existsSync(dst)
      } catch {}
      if (!ok) stuck.push(rel)
    }
    if (stuck.length) {
      console.error(`교체 중 실패: ${e.message}\n되돌리지 못한 파일 (백업: ${backup}):\n${stuck.join('\n')}`)
      process.exit(1)
    }
    fail(`교체 중 실패, 손댄 ${touched.length}개 파일을 되돌렸습니다: ${e.message}`)
  }
  fs.rmSync(tmp, { recursive: true })
  console.log(`아이콘 ${Object.keys(files).length - 1}개 파일 검사 통과·교체 (그림 ${art[0].length}×${art.length}칸, 안드로이드 1칸 ${fgCell / XXXHDPI}dp, ${Date.now() - t0}ms)`)
  console.log('비교 시트: docs/icon-drafts/final/comparison-16-32-128-512.png')
}
