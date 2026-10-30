// v8 최종 디자인 표 — 직원(생김새·자세·방향)·가구 소품·바닥 벽 재질. 실행(이 폴더에서): node sheets.mjs
import fs from 'node:fs'
import * as iso from '../../../../app/src/renderer/map/iso/isoArt.ts'
import { Canvas } from '../../v7/scene.mjs'

// 그림 여러 장을 칸에 맞춰 바닥 정렬로 늘어놓는다
function grid(arts, cell, per, bg) {
  const rows = Math.ceil(arts.length / per)
  const cv = new Canvas(per * cell[0], rows * cell[1], bg)
  arts.forEach((a, n) => cv.blit(a.px, a.w, a.h, (n % per) * cell[0] + Math.round((cell[0] - a.w) / 2), Math.floor(n / per) * cell[1] + Math.max(0, cell[1] - a.h - 3)))
  return cv
}

// ── 직원: 생김새 부품을 하나씩 바꿔 가며 서기·걷기·앉기·타이핑 × 방향 ──
const base = { h: '#4a3426', s: '#f6d2b0', c: '#5a8ae8', p: '#3d4a6a' }
const looks = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((hair) => ({ ...base, hair, h: ['#4a3426', '#1e1e26', '#8a4b2a', '#e0b050', '#6a6a78', '#3a2040', '#b04030', '#4a3426'][hair] })),
  ...[1, 2, 3, 4].map((top) => ({ ...base, top, c: ['', '#5ab47e', '#f4f4f8', '#a57ad8', '#3a3f4a'][top] })),
  ...[1, 2, 3, 4].map((face) => ({ ...base, face })),
  ...[1, 2, 3, 4, 5].map((head) => ({ ...base, head, s: ['#f6d2b0', '#e8b890', '#c98e64', '#8a5a3c', '#f6d2b0', '#d9a77e'][head] })),
]
const frames = [['stand', 'front'], ['stand', 'frontRight'], ['stand', 'back'], ['stand', 'backRight'], ['walk1', 'front'], ['walk2', 'front'], ['sit', 'front'], ['sit', 'backRight'], ['type', 'back']]
const people = []
for (const L of looks) for (const [pose, dir] of frames) people.push(iso.artPerson(pose, dir, L))
fs.writeFileSync('1-people.png', grid(people, [22, 42], frames.length * 3, [244, 238, 228]).scaled(3))

// ── 가구·소품 (반으로 나눠 두 장) ──
const ids = iso.ART_ITEM_IDS.filter((id) => !id.startsWith('fixed-'))
const items = ids.map((id) => iso.artItem(id, 0).cv)
const half = Math.ceil(items.length / 2)
fs.writeFileSync('4-items-a.png', grid(items.slice(0, half), [100, 110], 9, [244, 238, 228]).scaled(2))
fs.writeFileSync('4-items-b.png', grid(items.slice(half), [100, 110], 9, [244, 238, 228]).scaled(2))

// ── 바닥·벽: 레벨별 방 마감 + 재질 견본 ──
const s = iso.SURFACE_ART_IDS
const lv = [2, 4, 6, 8, 10, 12, 14, 18, 20].map((l) => iso.artRoom(3, 3, iso.finishOf(l)).cv)
const surf = [...s.floor, ...s.wallpaper].map((id) => iso.artSurfaceThumb(id))
fs.writeFileSync('5-surfaces.png', grid([...lv, ...surf], [112, 100], 8, [244, 238, 228]).scaled(2))
console.log('people', people.length, 'items', ids.length, 'surfaces', lv.length + surf.length)
