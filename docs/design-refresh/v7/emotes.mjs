// v7 확인용 — 감정 도트 말풍선 9종을 앉은 직원 머리 위에 띄운 표. 실행: node emotes.mjs 출력.png
import fs from 'node:fs'
import * as iso from '../../../app/src/renderer/map/iso/isoArt.ts'
import * as em from '../../../app/src/renderer/map/iso/emoteArt.ts'
import { Canvas } from './scene.mjs'
const kinds = em.EMOTE_KINDS
const cv = new Canvas(kinds.length * 24 + 8, 70, [232, 226, 214])
kinds.forEach((k, i) => {
  const p = iso.artPerson('stand', 'front', iso.lookOf(i))
  const x = 8 + i * 24
  cv.blit(p.px, p.w, p.h, x + 2, 66 - p.h)
  const e = em.artEmote(k)
  cv.blit(e.px, e.w, e.h, x + 2 + Math.floor(p.w / 2) - 6, 66 - p.h - e.h - 2)
})
fs.writeFileSync(process.argv[2] ?? 'emotes.png', cv.scaled(5))
console.log(kinds.join(' '))
