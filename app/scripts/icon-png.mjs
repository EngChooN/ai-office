// 아이콘 스크립트 공용: PNG 읽기·쓰기, 박스 축소. 외부 패키지 없이 node:zlib만 쓴다.
import zlib from 'node:zlib'

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
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

/** RGBA 버퍼 → PNG (압축 레벨 고정이라 같은 Node에서는 같은 바이트가 나온다) */
export function encodePng(w, h, rgba) {
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
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/** PNG → { w, h, rgba }. 8비트 RGB·RGBA·회색, 비월(interlace) 없는 파일만 읽는다 */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('PNG 서명이 아닙니다')
  let p = 8
  let w = 0, h = 0, type = 0, end = false
  const idat = []
  while (p < buf.length && !end) {
    if (p + 12 > buf.length) throw new Error('PNG 조각이 잘렸습니다')
    const len = buf.readUInt32BE(p)
    if (p + 12 + len > buf.length) throw new Error('PNG 조각 길이가 파일을 넘습니다')
    const t = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (crc32(buf.subarray(p + 4, p + 8 + len)) !== buf.readUInt32BE(p + 8 + len)) throw new Error(`PNG ${t} CRC 불일치`)
    if (t === 'IEND') end = true
    else if (t === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      type = data[9]
      if (data[8] !== 8 || data[12] !== 0) throw new Error('8비트·비월 없는 PNG만 읽습니다')
    } else if (t === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type]
  if (!bpp) throw new Error(`지원하지 않는 PNG 색 형식: ${type}`)
  if (!end || !w || !h) throw new Error('PNG에 IHDR·IEND가 없습니다')
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  if (raw.length !== (stride + 1) * h) throw new Error(`PNG 압축 해제 길이 ${raw.length} ≠ ${(stride + 1) * h}`)
  const px = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    if (f > 4) throw new Error(`PNG 필터 번호 ${f} (줄 ${y})`)
    const src = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const b = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0
      let v = raw[src + x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const q = a + b - c
        const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + x] = v & 255
    }
  }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp
    const [r, g, b, al] = bpp === 4 ? [px[s], px[s + 1], px[s + 2], px[s + 3]] : bpp === 3 ? [px[s], px[s + 1], px[s + 2], 255] : bpp === 2 ? [px[s], px[s], px[s], px[s + 1]] : [px[s], px[s], px[s], 255]
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = al
  }
  return { w, h, rgba }
}

/** 정사각 RGBA를 임의 크기로 줄인다 (면적 가중 박스 평균, 투명한 곳 색이 번지지 않게 알파로 가중) */
export function resizeBox(src, from, to) {
  const k = from / to
  const out = Buffer.alloc(to * to * 4)
  // 출력 칸 하나가 덮는 원본 범위와 경계 칸의 겹친 비율
  const spans = Array.from({ length: to }, (_, o) => {
    const a = o * k, b = (o + 1) * k
    const list = []
    for (let s = Math.floor(a); s < Math.ceil(b); s++) list.push([s, Math.min(b, s + 1) - Math.max(a, s)])
    return list
  })
  for (let y = 0; y < to; y++)
    for (let x = 0; x < to; x++) {
      let r = 0, g = 0, b = 0, al = 0, area = 0
      for (const [sy, wy] of spans[y])
        for (const [sx, wx] of spans[x]) {
          const wgt = wx * wy
          const si = (sy * from + sx) * 4
          const a = src[si + 3] * wgt
          r += src[si] * a
          g += src[si + 1] * a
          b += src[si + 2] * a
          al += a
          area += wgt
        }
      const o = (y * to + x) * 4
      if (al > 0) {
        out[o] = Math.round(r / al)
        out[o + 1] = Math.round(g / al)
        out[o + 2] = Math.round(b / al)
      }
      out[o + 3] = Math.round(al / area)
    }
  return out
}
