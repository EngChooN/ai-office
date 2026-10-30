// 작업용 미리보기: 동작×방향 격자를 PNG 한 장으로 (글자 없이). node preview-v2.mjs out.png [조합번호]
import zlib from 'node:zlib'
import fs from 'node:fs'
import * as look from '../../../app/src/shared/look.ts'
import * as hb from './habbo.mjs'

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
export function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
export const COMBOS = [
  { name: '기본', L: { hairStyle: 0, hairColor: 0, skin: 0, top: 0, topColor: 0, pants: 0, face: 0, head: 0 } },
  { name: '안경+셔츠·넥타이', L: { hairStyle: 0, hairColor: 1, skin: 1, top: 2, topColor: 1, pants: 1, face: 1, head: 0 } },
  { name: '포니테일+후드+헤드셋', L: { hairStyle: 3, hairColor: 6, skin: 2, top: 1, topColor: 5, pants: 3, face: 0, head: 1 } },
  { name: '삐죽머리+선글라스', L: { hairStyle: 4, hairColor: 3, skin: 3, top: 0, topColor: 2, pants: 0, face: 2, head: 0 } },
  { name: '긴머리+정장+비니', L: { hairStyle: 1, hairColor: 5, skin: 0, top: 4, topColor: 11, pants: 2, face: 0, head: 3 } },
]
if (import.meta.url === 'file://' + process.argv[1]) {
  const k = hb.lookFrom(COMBOS[+(process.argv[3] ?? 0)].L, look)
  const poses = ['stand', 'walk1', 'walk2', 'type1', 'type2', 'nap'], dirs = ['SW', 'SE', 'NW', 'NE']
  const S = 6, cw = hb.W + 2, chh = hb.H + 2
  const w = cw * dirs.length * S, h = chh * poses.length * S
  const a = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) a.set([0xd9, 0xcf, 0xbd, 255], i * 4)
  poses.forEach((p, r) => dirs.forEach((d, col) => {
    const g = hb.drawDir(k, p, d), px = hb.toRGBA(g)
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const j = (y * g.w + x) * 4; if (!px[j + 3]) continue; for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) a.set(px.subarray(j, j + 4), (((r * chh + y + 1) * S + yy) * w + (col * cw + x + 1) * S + xx) * 4) }
  }))
  fs.writeFileSync(process.argv[2], png(w, h, a))
}
