// 앱 아이콘 생성기: 32×32 픽셀아트를 macOS 아이콘 규격(1024, 둥근 사각형)으로 키워 PNG로 저장한다.
// 시안 하나를 고르면 윈도우용 icon.ico(256·48·32·16)도 함께 만든다.
// 사용: node scripts/icon.mjs <시안이름|all> <출력폴더>
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const GRID = 32
const SIZE = 1024
const CELL = 26 // 32 × 26 = 832 (애플 가이드의 아이콘 본체 크기에 맞춤)
const BODY = GRID * CELL
const OFFSET = (SIZE - BODY) / 2
const RADIUS = 186

// ── PNG 인코더 ──────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ── 32×32 픽셀 캔버스 ───────────────────────────────────
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
function grid() {
  const px = Array.from({ length: GRID * GRID }, () => null)
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < GRID && y < GRID && c) px[y * GRID + x] = c
  }
  return {
    px,
    set,
    rect: (x, y, w, h, c) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c)
    },
    /** 문자열 행 + 팔레트로 그린다 ('.'는 투명) */
    paint: (x0, y0, rows, pal) => rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && set(x0 + i, y0 + j, pal[ch]))),
    vgrad: (top, bottom) => {
      const [a, b] = [hex(top), hex(bottom)]
      for (let y = 0; y < GRID; y++) {
        const t = y / (GRID - 1)
        const c = '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')
        for (let x = 0; x < GRID; x++) set(x, y, c)
      }
    },
  }
}

/** 픽셀을 키우고 둥근 사각형으로 잘라 1024 RGBA 버퍼를 만든다 */
function renderRgba(g) {
  const out = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const bx = x - OFFSET
      const by = y - OFFSET
      if (bx < 0 || by < 0 || bx >= BODY || by >= BODY) continue
      // 둥근 모서리: 모서리 원 바깥은 투명, 경계 1px은 반투명으로 부드럽게
      const cx = Math.min(Math.max(bx, RADIUS), BODY - RADIUS)
      const cy = Math.min(Math.max(by, RADIUS), BODY - RADIUS)
      const d = Math.hypot(bx - cx, by - cy)
      if (d > RADIUS + 0.5) continue
      const alpha = d > RADIUS - 0.5 ? RADIUS + 0.5 - d : 1
      const c = g.px[Math.floor(by / CELL) * GRID + Math.floor(bx / CELL)]
      if (!c) continue
      const [r, gg, b] = hex(c)
      const i = (y * SIZE + x) * 4
      out[i] = r
      out[i + 1] = gg
      out[i + 2] = b
      out[i + 3] = Math.round(alpha * 255)
    }
  return out
}

/** 1024 RGBA를 작은 크기로 줄인다 (칸 평균, 투명한 곳 색이 번지지 않게 알파로 가중) */
function downsample(src, to) {
  const k = SIZE / to
  const out = Buffer.alloc(to * to * 4)
  for (let y = 0; y < to; y++)
    for (let x = 0; x < to; x++) {
      const sum = [0, 0, 0, 0]
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const si = ((y * k + j) * SIZE + (x * k + i)) * 4
          const a = src[si + 3]
          for (let c = 0; c < 3; c++) sum[c] += src[si + c] * a
          sum[3] += a
        }
      const o = (y * to + x) * 4
      if (sum[3] > 0) for (let c = 0; c < 3; c++) out[o + c] = Math.round(sum[c] / sum[3])
      out[o + 3] = Math.round(sum[3] / (k * k))
    }
  return out
}

// ── 윈도우 아이콘 (.ico: 크기별 PNG를 그대로 담는다) ─────
const ICO_SIZES = [256, 48, 32, 16]
function encodeIco(rgba) {
  const pngs = ICO_SIZES.map((n) => encodePng(n, n, downsample(rgba, n)))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map((png, i) => {
    const e = Buffer.alloc(16)
    // 256은 0으로 적는다
    e[0] = ICO_SIZES[i] % 256
    e[1] = ICO_SIZES[i] % 256
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([header, ...entries, ...pngs])
}

const O = '#2a2230'
const CHAR = {
  o: O, e: O, h: '#1e1e26', H: '#3a3a48', s: '#f6d2b0', r: '#f0a8a0', m: '#c2706a', c: '#5a8ae8', C: '#3f68c0', w: '#f4f4f8',
}
const HEAD = [
  '.....oooooo.....',
  '....ohhhhhho....',
  '...ohhHHhhhho...',
  '..ohhHhhhhhhho..',
  '..ohhhhhhhhhho..',
  '..ohssssssssho..',
  '..ossessssesso..',
  '..ossessssesso..',
  '..orssssssssro..',
  '..ossssmmsssso..',
  '...ossssssso....',
  '....oossssoo....',
  '...occcwwccco...',
  '..occccwwcccCo..',
  '..occcccccccCo..',
  '.ocoocccccccoCo.',
]

const DESIGNS = {
  /** A: 오렌지 배경, 직원이 노트북 앞에 앉아 있고 모니터 빛 + 말풍선 */
  desk: () => {
    const g = grid()
    g.vgrad('#f29a6c', '#c8603a')
    // 바닥 줄무늬 그림자
    g.rect(0, 24, 32, 8, '#b5532f')
    // 말풍선
    g.rect(19, 3, 10, 7, O)
    g.rect(20, 4, 8, 5, '#ffffff')
    g.set(21, 6, O)
    g.set(23, 6, O)
    g.set(25, 6, O)
    g.rect(20, 10, 2, 1, O)
    g.set(20, 10, '#ffffff')
    g.set(19, 11, O)
    // 의자 등받이
    g.rect(6, 9, 16, 12, O)
    g.rect(7, 10, 14, 10, '#5c6474')
    g.rect(8, 11, 12, 2, '#7c8496')
    // 직원
    g.paint(6, 6, HEAD, CHAR)
    // 책상 + 노트북(뒷면, 빛나는 로고)
    g.rect(1, 21, 30, 1, O)
    g.rect(1, 22, 30, 3, '#e2c29a')
    g.rect(1, 22, 30, 1, '#f4dcb8')
    g.rect(1, 25, 30, 4, '#c9a47a')
    g.rect(1, 29, 30, 1, O)
    g.rect(0, 21, 1, 9, O)
    g.rect(31, 21, 1, 9, O)
    g.rect(8, 15, 12, 7, O)
    g.rect(9, 16, 10, 5, '#d6d8e0')
    g.rect(13, 17, 2, 3, '#e8835a')
    g.rect(12, 18, 4, 1, '#e8835a')
    g.rect(7, 14, 1, 7, '#bfeaff')
    g.rect(20, 14, 1, 7, '#bfeaff')
    // 머그
    g.rect(24, 18, 3, 4, O)
    g.rect(25, 19, 1, 2, '#ffffff')
    return g
  },
  /** B: 밤하늘 아래 불 켜진 작은 사무실 건물 */
  building: () => {
    const g = grid()
    g.vgrad('#1c2648', '#3a4a7a')
    for (const [x, y] of [[3, 3], [8, 6], [26, 4], [29, 9], [5, 12], [22, 2]]) g.set(x, y, '#fff6c0')
    // 초승달
    g.rect(23, 4, 3, 5, '#fff6c0')
    g.rect(22, 5, 1, 3, '#fff6c0')
    g.rect(24, 5, 2, 3, '#25305a')
    g.rect(0, 28, 32, 4, '#2a3352')
    // 건물
    g.rect(6, 8, 20, 22, O)
    g.rect(7, 9, 18, 20, '#eee9e0')
    g.rect(7, 9, 18, 2, '#c0603c')
    g.rect(12, 6, 8, 3, O)
    g.rect(13, 7, 6, 1, '#e8835a')
    const lit = ['#ffd27a', '#ffe9a8', '#8ad8ff']
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) {
        const x = 9 + c * 5
        const y = 12 + r * 4
        g.rect(x, y, 4, 3, O)
        g.rect(x, y, 3, 2, lit[(r + c) % 3])
        // 창문 안 작은 사람 머리
        if ((r * 3 + c) % 4 === 1) g.rect(x + 1, y + 1, 1, 1, O)
      }
    g.rect(14, 25, 4, 4, O)
    g.rect(15, 26, 2, 3, '#c9a47a')
    // 나무
    g.rect(2, 22, 4, 5, '#4fa85a')
    g.rect(3, 21, 2, 1, '#6fc878')
    g.rect(3, 27, 2, 2, '#6e4a2a')
    g.rect(27, 23, 4, 4, '#3f8a4a')
    g.rect(28, 27, 2, 2, '#6e4a2a')
    return g
  },
  /** C: 밝은 바닥 타일 위 칸막이 자리 3개, 가운데 직원이 손을 든다 (확인 요청) */
  cubicles: () => {
    const g = grid()
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) g.set(x, y, (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? '#e0e0e8' : '#ebebf0')
    // 위쪽 벽
    g.rect(0, 0, 32, 7, '#eee9e0')
    g.rect(0, 0, 32, 1, '#5a5560')
    g.rect(0, 6, 32, 1, '#a89c90')
    g.rect(4, 1, 8, 4, '#8a8494')
    g.rect(5, 2, 6, 2, '#9cd0f4')
    g.rect(21, 1, 7, 4, '#c89a68')
    g.rect(22, 2, 2, 2, '#ffe08a')
    g.rect(25, 2, 2, 2, '#f8a8c8')
    // 칸막이
    // 칸막이 (직원 머리를 가리지 않게 양옆만)
    for (const [x, w] of [[1, 9], [22, 9]]) {
      g.rect(x, 12, w, 4, O)
      g.rect(x + 1, 13, w - 2, 1, '#e8835a')
      g.rect(x + 1, 14, w - 2, 1, '#c4ccda')
    }
    // 직원 (손 든 자세)
    g.paint(8, 8, HEAD, CHAR)
    g.rect(22, 9, 2, 6, O)
    g.rect(22, 9, 1, 5, '#5a8ae8')
    g.rect(22, 7, 2, 2, '#f6d2b0')
    // 느낌표
    g.rect(26, 7, 3, 7, O)
    g.rect(27, 8, 1, 3, '#f0c541')
    g.rect(27, 12, 1, 1, '#f0c541')
    // 책상
    g.rect(1, 22, 30, 1, O)
    g.rect(1, 23, 30, 3, '#e2c29a')
    g.rect(1, 23, 30, 1, '#f4dcb8')
    g.rect(1, 26, 30, 4, '#c9a47a')
    g.rect(1, 30, 30, 1, O)
    g.rect(3, 17, 9, 6, O)
    g.rect(4, 18, 7, 4, '#4a4f5c')
    g.rect(2, 17, 1, 6, '#8ad8ff')
    g.rect(12, 17, 1, 6, '#8ad8ff')
    g.rect(15, 24, 7, 1, '#d6d8e0')
    g.rect(25, 19, 3, 4, O)
    g.rect(26, 20, 1, 2, '#ffffff')
    return g
  },
}

const [, , which = 'all', outDir = 'build'] = process.argv
fs.mkdirSync(outDir, { recursive: true })
for (const [name, design] of Object.entries(DESIGNS)) {
  if (which !== 'all' && which !== name) continue
  const file = path.join(outDir, which === 'all' ? `icon-${name}.png` : 'icon.png')
  const rgba = renderRgba(design())
  fs.writeFileSync(file, encodePng(SIZE, SIZE, rgba))
  console.log('wrote', file)
  if (which === 'all') continue
  fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(rgba))
  console.log('wrote', path.join(outDir, 'icon.ico'))
}

// ── 메뉴바 아이콘 (템플릿 이미지: 검정+투명, macOS가 다크모드에 맞게 칠한다) ─────
const TRAY = [
  '..................',
  '.......####.......',
  '......######......',
  '......#.##.#......',
  '......######......',
  '.......####.......',
  '.....########.....',
  '....##########....',
  '....##########....',
  '..##############..',
  '..#............#..',
  '..#..########..#..',
  '..#..#......#..#..',
  '..#..########..#..',
  '..#............#..',
  '..##############..',
  '..................',
  '..................',
]
function renderTray(scale) {
  const n = TRAY.length * scale
  const out = Buffer.alloc(n * n * 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (TRAY[Math.floor(y / scale)][Math.floor(x / scale)] !== '#') continue
      out[(y * n + x) * 4 + 3] = 255
    }
  return encodePng(n, n, out)
}
if (which === 'tray') {
  fs.writeFileSync(path.join(outDir, 'trayTemplate.png'), renderTray(1))
  fs.writeFileSync(path.join(outDir, 'trayTemplate@2x.png'), renderTray(2))
  console.log('wrote tray icons')
}
