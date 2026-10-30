// 미리보기 PNG 일부를 확대해 자른다. 실행: node crop.mjs 입력.png 출력.png x y w h 배율
import fs from 'node:fs'
import { png } from '../v4/preview-v2.mjs'
import zlib from 'node:zlib'
const [inp, out, X, Y, W, H, K] = process.argv.slice(2)
const buf = fs.readFileSync(inp)
let w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), idat = [], p = 8
while (p < buf.length) { const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8); if (t === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len }
const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, px = new Uint8ClampedArray(w * h * 4)
for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)]; for (let x = 0; x < stride; x++) { const r = raw[y * (stride + 1) + 1 + x], a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0; let v = r; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c } px[y * stride + x] = v & 255 } }
const x0 = +X, y0 = +Y, cw = +W, ch = +H, k = +K, o = new Uint8ClampedArray(cw * k * ch * k * 4)
for (let y = 0; y < ch * k; y++) for (let x = 0; x < cw * k; x++) { const s = ((y0 + (y / k | 0)) * w + x0 + (x / k | 0)) * 4; o.set(px.subarray(s, s + 4), (y * cw * k + x) * 4) }
fs.writeFileSync(out, png(cw * k, ch * k, o))
