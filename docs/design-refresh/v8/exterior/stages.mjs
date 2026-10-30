// v8 외관 확인용 — 단계별(E1~E7) 외관(땅·부지·이웃)을 낮/밤으로 그려 한 장에 나란히. 실행: node stages.mjs [출력.png] [margin] [night]
import fs from 'node:fs'
import { artExteriorPreview, EXTERIOR_STAGE_LEVELS } from '../../../../app/src/renderer/map/iso/exteriorArt.ts'
import { Canvas } from '../../v7/scene.mjs'
const [out = 'stages.png', m = '70', mode = 'day', only] = process.argv.slice(2)
const stages = EXTERIOR_STAGE_LEVELS.filter((s) => !only || String(s.stage) === only)
const pics = stages.map((s) => artExteriorPreview(s.level, mode === 'night', +m))
const cols = Math.min(4, pics.length)
const cw = Math.max(...pics.map((p) => p.w)), ch = Math.max(...pics.map((p) => p.h))
const rows = Math.ceil(pics.length / cols)
const cv = new Canvas(cw * cols + 8 * (cols - 1), ch * rows + 8 * (rows - 1), [250, 246, 238])
pics.forEach((p, i) => cv.blit(p.px, p.w, p.h, (i % cols) * (cw + 8) + (cw - p.w) / 2, Math.floor(i / cols) * (ch + 8) + (ch - p.h) / 2))
fs.writeFileSync(out, cv.scaled(only ? 3 : 1))
console.log('ok', stages.map((s) => s.stage + ':' + s.name + ':Lv' + s.level).join(' '), cv.w, cv.h)
