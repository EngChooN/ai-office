// 직원 얼굴 둥근 턱 시안 — personArt.ts를 그대로 읽어 얼굴 부분만 글자 치환한 사본으로 그린다(앱 코드는 건드리지 않음).
// 실행: Node 24 (TS 타입 지우기 내장)
//   node docs/design/face-round/render.mjs   → docs/design/face-round/grids.json
//   python3 docs/design/face-round/sheet.py  → docs/design/face-round/face-round-compare.png
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '../../../app/src/renderer/map/iso/personArt.ts')
const src = readFileSync(SRC, 'utf8')

const HEAD_F_NOW = ['..hhhhh...', '.hHHHhhhh.', 'hHHhhhhhdd', 'hhhhshhhdd', 'sssssskkdd', 'seasesokdd', 'seasesskdd', 'rssmrskkd.', '.sssk.....']
const BEARD_NOW = "[[0, 7, c.d], [1, 7, c.h], [2, 7, c.h], [4, 7, c.h], [5, 7, c.d], [1, 8, c.h], [2, 8, c.h], [3, 8, c.h], [4, 8, c.d], [0, 6, c.d]]"
const NECK_NOW = `  P.px(7 + dx, y - 1, c.z)
  P.px(8 + dx, y - 1, c.z)
  P.px(9 + dx, y - 1, OUT)
  P.px(7 + dx, y, c.z)
  P.px(8 + dx, y, c.k)`

/** 시안: 앞 얼굴 아래 3줄 + 수염 + 목 그늘만 바꾼다 */
export const VARIANTS = [
  { id: 'A', name: '현재', note: '왼쪽 볼이 곧게 내려와 턱 끝에서 한 번 꺾임' },
  {
    id: 'B',
    name: '시안 B · 모서리만 깎기',
    note: '왼쪽 아래 모서리를 계단 2단으로 둥글게 · 나머지는 그대로',
    rows: { 7: '.rsmrskkd.', 8: '..sssk....' },
    beard: '[[1, 7, c.d], [2, 7, c.h], [4, 7, c.h], [5, 7, c.d], [2, 8, c.h], [3, 8, c.h], [4, 8, c.d], [0, 6, c.d], [1, 6, c.d]]',
  },
  {
    id: 'C',
    name: '시안 C · U자 턱',
    note: '볼 끝을 깎고 턱을 넓혀 아래가 U자 · 턱 그늘을 오른쪽 아래로',
    rows: { 7: '.rsmrskkd.', 8: '..ssskk...' },
    beard: '[[1, 7, c.d], [2, 7, c.h], [4, 7, c.h], [5, 7, c.d], [2, 8, c.h], [3, 8, c.h], [4, 8, c.h], [5, 8, c.d], [0, 6, c.d], [1, 6, c.d]]',
    neck: `  P.px(8 + dx, y - 1, c.z)
  P.px(9 + dx, y - 1, OUT)
  P.px(7 + dx, y, c.z)
  P.px(8 + dx, y, c.k)`,
  },
  {
    id: 'D',
    name: '시안 D · 동그란 얼굴',
    note: '볼 아래를 한 줄 더 둥글게(6줄부터) · 턱 끝을 가운데로',
    rows: { 6: 'seasesskdd', 7: '.rsmrskkd.', 8: '..sssk....' },
    left6: true,
    beard: '[[1, 7, c.d], [2, 7, c.h], [4, 7, c.h], [5, 7, c.d], [2, 8, c.h], [3, 8, c.h], [4, 8, c.d], [1, 6, c.d]]',
  },
]

function variantSource(v) {
  if (!v.rows) return src
  const rows = [...HEAD_F_NOW]
  for (const [i, r] of Object.entries(v.rows)) rows[+i] = r
  if (v.left6) rows[6] = '.' + rows[6].slice(1)
  const now = 'const HEAD_F = [\n' + HEAD_F_NOW.map((r) => `  '${r}',`).join('\n') + '\n]'
  const next = 'const HEAD_F = [\n' + rows.map((r) => `  '${r}',`).join('\n') + '\n]'
  let out = src
  const swap = (a, b) => {
    if (!out.includes(a)) throw new Error('personArt.ts가 바뀌어 치환 대상을 못 찾음: ' + a.slice(0, 40))
    out = out.replace(a, b)
  }
  swap(now, next)
  if (v.beard) swap(BEARD_NOW, v.beard)
  if (v.neck) swap(NECK_NOW, v.neck)
  return out
}

// 머리 0 짧은 · 1 긴 · 2 단발 · 5 풍성 · 7 민머리 / face 3 수염 · face 1 안경
const LOOKS = [
  { label: '짧은 머리', k: { h: '#4a3426', s: '#f6d2b0', c: '#e8835a', p: '#3d4a6a', hair: 0, top: 0 } },
  { label: '긴 머리', k: { h: '#1e1e26', s: '#f8dcc0', c: '#a57ad8', p: '#2e3240', hair: 1, top: 3 } },
  { label: '단발 앞머리', k: { h: '#8a4b2a', s: '#f0c49c', c: '#5ab47e', p: '#4a3f3a', hair: 2, top: 1 } },
  { label: '풍성한 머리', k: { h: '#e0b050', s: '#d8a880', c: '#5a8ae8', p: '#4a4a58', hair: 5, top: 2 } },
  { label: '수염(face 3)', k: { h: '#3a2040', s: '#e8b890', c: '#3a3f4a', p: '#2e3240', hair: 6, top: 4, face: 3 } },
  { label: '수염·어두운 피부', k: { h: '#1e1e26', s: '#8a5a3a', c: '#f0c84a', p: '#6a5a40', hair: 7, top: 0, face: 3 } },
]
const DIRS = [['SW', '앞 ↙'], ['SE', '반전 ↘'], ['NW', '뒤 ↖']]

const tmp = mkdtempSync(join(tmpdir(), 'face-round-'))
const out = { looks: LOOKS.map((l) => l.label), dirs: DIRS.map((d) => d[1]), variants: [] }
for (const v of VARIANTS) {
  const file = join(tmp, `personArt-${v.id}.ts`)
  writeFileSync(file, variantSource(v))
  const mod = await import(pathToFileURL(file).href)
  const cells = LOOKS.map((l) => DIRS.map(([d]) => {
    const g = mod.drawFigure(l.k, 'stand', d)
    return { w: g.w, h: g.h, p: g.p }
  }))
  const sit = DIRS.map(([d]) => { const g = mod.drawFigure(LOOKS[0].k, 'sit', d); return { w: g.w, h: g.h, p: g.p } })
  out.variants.push({ id: v.id, name: v.name, note: v.note, cells, sit })
}
writeFileSync(join(here, 'grids.json'), JSON.stringify(out))
console.log('grids.json:', out.variants.length, '시안 ×', LOOKS.length, '외모 ×', DIRS.length, '방향')
