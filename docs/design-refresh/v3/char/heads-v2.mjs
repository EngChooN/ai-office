// 얼굴 확대 비교: 조합 5종 × (↙·↖·↘) 머리만 ×12. node heads-v2.mjs out.png
import fs from 'node:fs'
import * as look from '../../../../app/src/shared/look.ts'
import * as hb from './habbo.mjs'
import { png, COMBOS } from './preview-v2.mjs'
const S = 12, ids = [0, 1, 2, 3, 4], dirs = ['SW', 'NW', 'SE'], cw = hb.W + 1, ch = 16
const w = cw * ids.length * S, h = ch * dirs.length * S, a = new Uint8ClampedArray(w * h * 4)
for (let i = 0; i < w * h; i++) a.set([0xd9, 0xcf, 0xbd, 255], i * 4)
ids.forEach((id, col) => dirs.forEach((d, r) => {
  const g = hb.drawDir(hb.lookFrom(COMBOS[id].L, look), 'stand', d), px = hb.toRGBA(g)
  for (let y = 0; y < ch; y++) for (let x = 0; x < g.w; x++) { const j = (y * g.w + x) * 4; if (!px[j + 3]) continue
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) a.set(px.subarray(j, j + 4), ((r * ch + y) * S + yy) * w * 4 + ((col * cw + x) * S + xx) * 4) }
}))
fs.writeFileSync(process.argv[2], png(w, h, a))
