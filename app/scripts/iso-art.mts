// 아이소메트릭 그림 시트 생성기 — 그림 코드는 앱과 같은 src/renderer/map/iso/isoArt.ts 하나를 쓴다 (앱에 넣지 않는 문서용).
// 사용(app 폴더에서): node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/iso-art.mts ../docs/specs/office-iso-art
//   → 재질 단계·레벨별 방, 품목마다 4방향(items/), 직원, 고정 칸, 외관 PNG + 설명 붙은 시트 HTML(sheet-*.html) + 남은 임시 그림 목록
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  ART_ITEM_IDS,
  artItem,
  artMeetingRoom,
  artName,
  artPerson,
  PERSON_DIRS,
  artPersonShadow,
  artRoom,
  artSize,
  Cv,
  finishKey,
  finishLabel,
  finishOf,
  hasArt,
  lookOf,
  PERSON_POSES,
  PROP_KEYS,
  STAGE_FINISH,
  surfaceName,
  SURFACE_ART_IDS,
  withSurfaces,
  type Finish,
} from '../src/renderer/map/iso/isoArt.ts'
import { artExteriorPreview, EXTERIOR_STAGE_LEVELS } from '../src/renderer/map/iso/exteriorArt.ts'
import { FURNITURE, specOf, type Rot } from '../src/shared/iso/furniture.ts'
import { HH, HW, PIXEL } from '../src/shared/iso/grid.ts'
import { SHOP_ITEMS } from '../src/shared/economy.ts'

const BG = '#15181e'

// ── PNG 인코더 (icon.mjs와 같음) ───────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff
  for (const x of buf) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(cv: Cv, scale: number) {
  const { w, h, data } = cv.scaled(scale)
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ── 조립 도우미 ───────────────────────────────────────
const outDir = process.argv[2]
if (!outDir) {
  console.error('사용: node scripts/iso-art.mts <출력폴더>')
  process.exit(1)
}
fs.mkdirSync(path.join(outDir, 'items'), { recursive: true })
fs.mkdirSync(path.join(outDir, 'surfaces'), { recursive: true })
const save = (name: string, cv: Cv, scale = PIXEL) => {
  fs.writeFileSync(path.join(outDir, name), encodePng(cv, scale))
  return name
}
function framed(cv: Cv, pad = 6) {
  const out = new Cv(cv.w + pad * 2, cv.h + pad * 2)
  out.fill(BG)
  out.blit(cv, pad, pad)
  return out
}
function row(cvs: Cv[], gap = 8) {
  const out = new Cv(cvs.reduce((a, c) => a + c.w + gap, gap), Math.max(...cvs.map((c) => c.h)) + gap * 2)
  out.fill(BG)
  let x = gap
  for (const c of cvs) {
    out.blit(c, x, out.h - gap - c.h)
    x += c.w + gap
  }
  return out
}
/** 품목을 자기 칸 바닥(연한 마름모) 위에 올려 크기를 함께 보여 준다 */
function onTiles(itemId: string, r: Rot) {
  const a = artItem(itemId, r)
  const pad = 4
  const cv = new Cv(a.cv.w + pad * 2, a.cv.h + pad * 2 + 2)
  const ox = a.o[0] + pad
  const oy = a.o[1] + pad
  for (let gy = 0; gy < a.d; gy++)
    for (let gx = 0; gx < a.w; gx++)
      for (let y = 0; y < HH * 2; y++)
        for (let x = -HW; x < HW; x++) {
          const ax = Math.abs(x + 0.5) / HW + Math.abs(y + 0.5 - HH) / HH
          if (ax > 1) continue
          const edge = ax > 0.9
          cv.set(ox + (gx - gy) * HW + x, oy + (gx + gy) * HH + y, edge ? [70, 78, 96, 255] : (gx + gy) % 2 ? [46, 52, 66, 255] : [52, 58, 74, 255])
        }
  cv.blit(a.cv, pad, pad)
  return cv
}

// ── 1. 재질 단계 (M1~M5) · 레벨별 마감 ──────────────────
/** 방 하나에 기본 자리 한 벌을 놓아 크기감을 같이 보여 준다 */
function roomWithDesk(f: Finish, n = 5) {
  const room = artRoom(n, n, f)
  const cv = room.cv
  const put = (itemId: string, gx: number, gy: number, r: Rot) => {
    const a = artItem(itemId, r)
    cv.blit(a.cv, Math.round(room.o[0] + (gx - gy) * HW - a.o[0]), Math.round(room.o[1] + (gx + gy) * HH - a.o[1]))
  }
  put('chair', 1, 1, 0)
  put('desk', 1, 2, 0)
  put('plant', n - 1, 0, 0)
  return cv
}
const stages = ([1, 2, 3, 4, 5] as const).map((m) => ({ m, label: finishLabel(STAGE_FINISH[m]), file: save(`stage-m${m}.png`, framed(roomWithDesk(STAGE_FINISH[m]))) }))
// 레벨표에서 마감이 바뀌는 레벨만 (같은 마감은 한 장)
const levelFinishes: { level: number; levels: string; label: string; file: string }[] = []
for (let L = 1; L <= 20; L++) {
  const f = finishOf(L)
  const prev = levelFinishes.at(-1)
  if (prev && finishKey(finishOf(prev.level)) === finishKey(f)) {
    prev.levels = `${prev.levels.split('~')[0]}~${L}`
    continue
  }
  levelFinishes.push({ level: L, levels: `Lv.${L}`, label: finishLabel(f) + (f.wall === 'glass' ? '' : ` · 창 ${f.windows}`), file: save(`finish-lv${String(L).padStart(2, '0')}.png`, framed(artRoom(4, 4, f).cv, 4)) })
}

// ── 1-1. 상점 벽지 15 · 바닥재 14 (Lv.4 기본 마감 위에 덮은 모습 + 회의실 벽·바닥에 바른 모습) ──
const SURFACE_BASE = 4
const surfaceRows = (['wallpaper', 'floor'] as const).map((slot) => ({
  slot,
  items: SURFACE_ART_IDS[slot].map((id) => {
    const shop = SHOP_ITEMS.find((i) => i.id === id)!
    const f = withSurfaces(finishOf(SURFACE_BASE), { work: { [slot]: id } }).finish
    return { id, name: surfaceName(id), price: shop.price, minLevel: shop.minLevel, season: shop.season?.name, file: save(`surfaces/${id}.png`, framed(roomWithDesk(f, 4), 4)) }
  }),
}))
// 회의실 구역에 고른 예: 업무 구역은 레벨 기본, 회의실 벽(뒤쪽 벽 오른쪽 구간)·바닥만
function meetingSample(wallpaper: string, floor: string) {
  const n = 7
  const w = 3
  const d = 3
  const { finish, meetingFloor } = withSurfaces(finishOf(SURFACE_BASE), { meeting: { wallpaper, floor } }, n - w)
  const room = artRoom(n, n, finish)
  const blit = (c: Cv, ao: number[], gx: number, gy: number) => room.cv.blit(c, Math.round(room.o[0] + (gx - gy) * HW - ao[0]), Math.round(room.o[1] + (gx + gy) * HH - ao[1]))
  const pieces = artMeetingRoom(w, d, 1, meetingFloor)
  for (const p of pieces.filter((p) => p.kind === 'floor' || p.box.y < d - 0.5)) blit(p.cv, p.o, n - w, 0)
  const t = artItem('lv-meeting-table', 0)
  blit(t.cv, t.o, n - w + 1, 1)
  for (const p of pieces.filter((p) => p.kind === 'wall' && p.box.y >= d - 0.5)) blit(p.cv, p.o, n - w, 0)
  return framed(room.cv, 4)
}
const meetingSamples = [
  ['wall-navy', 'floor-marble'],
  ['wall-forest', 'floor-grass'],
  ['wall-gold', 'floor-gold'],
].map(([wl, fl]) => ({ label: `${surfaceName(wl)} + ${surfaceName(fl)}`, file: save(`surfaces/meeting-${wl}-${fl}.png`, meetingSample(wl, fl)) }))

// ── 2. 품목 4방향 ──────────────────────────────────────
const ROTS: Rot[] = [0, 1, 2, 3]
const itemFile = (id: string) => save(`items/${id}.png`, row(ROTS.map((r) => onTiles(id, r))))
const shopFurniture = SHOP_ITEMS.filter((i) => i.category === 'furniture').map((i) => i.id)
const shopGear = SHOP_ITEMS.filter((i) => i.category === 'desk' || i.category === 'chair').map((i) => i.id)
const levelIds = Object.keys(FURNITURE).filter((id) => id.startsWith('lv-'))
const propIds = PROP_KEYS.map((k) => `prop-${k}`)
const groups = [
  { id: 'base', title: '기본 자리 · 고정 칸', ids: ['desk', 'chair', 'plant', 'fixed-stairs', 'fixed-elevator', 'fixed-entrance'] },
  { id: 'level', title: '레벨 전용 가구 (김기획 2-3절 · 임시 id lv-*)', ids: levelIds },
  { id: 'shop', title: '상점 가구 (economy.ts furniture)', ids: shopFurniture },
  { id: 'gear', title: '상점 책상·의자 (개인 꾸밈 gear — 배정된 자리에 입힘)', ids: shopGear },
  { id: 'prop', title: '고정 소품 → 서랍 가구 prop-*', ids: propIds },
]
/** 상점 책상·의자(gear)는 칸 가구가 아니라 기본 책상·의자 자리에 입힌다 → 그 칸 크기로 비교 */
const gearBase = (id: string) => (shopGear.includes(id) ? (id.startsWith('desk-') ? 'desk' : 'chair') : id)
const itemsOut = groups.map((g) => ({ ...g, items: g.ids.map((id) => ({ id, name: artName(id), size: artSize(id), spec: specOf(gearBase(id)).size, art: hasArt(id), file: itemFile(id) })) }))

// ── 3. 직원 (서기·걷기 2프레임·앉기 × 4방향, 3배) — 줄마다 머리 모양·윗옷·얼굴·머리 소품을 돌려 모든 선택지가 한 번 이상 나온다 ──
const peopleRows = Array.from({ length: 10 }, (_, n) => {
  const look = lookOf(n)
  const cvs: Cv[] = []
  for (const pose of PERSON_POSES)
    for (const dir of PERSON_DIRS) {
      const p = artPerson(pose, dir, look)
      const sh = artPersonShadow()
      const cv = new Cv(p.w, p.h + 3)
      if (pose !== 'sit') cv.blit(sh, Math.round((p.w - sh.w) / 2), p.h - 4)
      cv.blit(p, 0, 0)
      cvs.push(cv)
    }
  return row(cvs, 6)
})
const people = new Cv(Math.max(...peopleRows.map((r) => r.w)), peopleRows.reduce((a, r) => a + r.h, 0))
people.fill(BG)
peopleRows.reduce((y, r) => (people.blit(r, 0, y), y + r.h), 0)
const peopleFile = save('people.png', people, 3)

// ── 4. 회의실 (조각을 모아 한 장) ─────────────────────────
function meetingSheet(w: number, d: number, doorX: number) {
  const pieces = artMeetingRoom(w, d, doorX)
  const pad = 8
  const H = 30
  const cv = new Cv((w + d) * HW + pad * 2, (w + d) * HH + H + pad * 2)
  const o = [d * HW + pad, H + pad]
  for (let gy = 0; gy < d; gy++)
    for (let gx = 0; gx < w; gx++)
      for (let y = 0; y < HH * 2; y++)
        for (let x = -HW; x < HW; x++) if (Math.abs(x + 0.5) / HW + Math.abs(y + 0.5 - HH) / HH <= 1) cv.set(o[0] + (gx - gy) * HW + x, o[1] + (gx + gy) * HH + y, [52, 58, 74, 255])
  // 바닥 → 뒤쪽(왼쪽) 칸막이 → 탁자 → 앞쪽 칸막이
  const blit = (c: Cv, ao: number[]) => cv.blit(c, o[0] - ao[0], o[1] - ao[1])
  const floor = pieces.find((p) => p.kind === 'floor')!
  blit(floor.cv, floor.o)
  const walls = pieces.filter((p) => p.kind === 'wall')
  for (const p of walls.filter((p) => p.box.y < d - 0.5)) blit(p.cv, p.o)
  const t = artItem('lv-meeting-table', 0)
  cv.blit(t.cv, Math.round(o[0] + (1 - 0) * HW - t.o[0]), Math.round(o[1] + (1 + 0) * HH - t.o[1]))
  for (const p of walls.filter((p) => p.box.y >= d - 0.5)) blit(p.cv, p.o)
  return cv
}
const meetingFile = save('fixed-meeting.png', framed(meetingSheet(4, 3, 1)))

// ── 5. 외관 E1~E7 (하늘 위의 땅 한 판, 단계마다 마지막 레벨) ─────────
const exterior = EXTERIOR_STAGE_LEVELS.map(({ stage, name, level }) => ({ label: `${name} (Lv.${level})`, file: save(`exterior-${stage}.png`, artExteriorPreview(level, false), 1) }))

// ── 6. 검사: 그림 칸 크기 = FURNITURE 칸 크기, 남은 임시 그림 ──
const mismatch = itemsOut.flatMap((g) => g.items).filter((it) => it.art && !it.id.startsWith('fixed-') && (it.size[0] !== it.spec[0] || it.size[1] !== it.spec[1]))
const placeholders = [...new Set([...shopFurniture, ...shopGear, ...Object.keys(FURNITURE)])].filter((id) => !hasArt(id))
const unused = ART_ITEM_IDS.filter((id) => !itemsOut.some((g) => g.ids.includes(id)))
fs.writeFileSync(path.join(outDir, 'placeholders.json'), JSON.stringify({ placeholders, sizeMismatch: mismatch.map((m) => ({ id: m.id, art: m.size, spec: m.spec })), unused }, null, 2) + '\n')

// ── 7. 시트 HTML (설명 붙은 모음 — 크롬으로 캡처해 채팅·문서에 쓴다) ──
const css = `body{background:#0d1014;color:#f2f2f2;font:13px -apple-system,'Apple SD Gothic Neo',sans-serif;margin:20px;width:1560px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px;color:#f0834e}.sub{color:#a8b0bc;font-size:12px;margin-bottom:10px}
.grid{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end}figure{margin:0;background:#15181e;border-radius:6px;padding:4px 6px 6px}
figcaption{color:#c9d0da;font-size:11px;margin-top:3px}figcaption b{color:#fff}figcaption .tmp{color:#e5534b}img{image-rendering:pixelated;display:block}`
const page = (title: string, sub: string, body: string) => `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${css}</style><h1>${title}</h1><div class="sub">${sub}</div>${body}`
const fig = (file: string, cap: string, scale = 1) => `<figure><img src="${file}" style="zoom:${scale}"><figcaption>${cap}</figcaption></figure>`
const itemFig = (it: (typeof itemsOut)[number]['items'][number]) => fig(it.file, `<b>${it.name}</b> <code>${it.id}</code> ${it.spec.join('×')}${it.art ? '' : ' <span class="tmp">임시 상자</span>'}`, 0.5)
const sheets: Record<string, string> = {
  'sheet-materials': page(
    '바닥·벽 재질 M1~M5 · 레벨별 마감',
    'A 파스텔 · 재질 단계는 층이 느는 레벨(6·10·14·18)에 바뀐다 · 같은 단계 안의 변형(Lv.8 원목 등)은 레벨표 2-2절대로',
    `<h2>재질 단계 대표 (stage-m1~5)</h2><div class="grid">${stages.map((s) => fig(s.file, `<b>M${s.m}</b> ${s.label.replace(/^M\d · /, '')}`, 0.5)).join('')}</div>
<h2>레벨별 마감 (finish-lv*)</h2><div class="grid">${levelFinishes.map((l) => fig(l.file, `<b>${l.levels}</b> ${l.label}`, 0.5)).join('')}</div>`,
  ),
  ...Object.fromEntries(
    itemsOut.map((g) => [
      `sheet-items-${g.id}`,
      page(`${g.title}`, `품목마다 r0 ↙ · r1 ↖ · r2 ↗ · r3 ↘ (사람이 보는 방향) · 바닥 마름모 = 차지 칸 · 텍스처 키 item-{itemId}-r{rot} · ${g.items.length}개`, `<div class="grid">${g.items.map(itemFig).join('')}</div>`),
    ]),
  ),
  'sheet-surfaces': page(
    '상점 벽지 15 · 바닥재 14 — 레벨 기본 재질 위에 덮기',
    `산 벽지·바닥재를 고르면 그 구역의 레벨 기본 재질(M1~M5) 대신 그린다 · 고르지 않았으면 레벨 기본 · 아래는 Lv.${SURFACE_BASE}(타일·흰 페인트·창 2) 위에 덮은 모습 · 업무 구역 = 방 바닥·뒤쪽 벽 두 면, 회의실 = 회의실 바닥·회의실이 기댄 벽`,
    surfaceRows
      .map(
        (r) =>
          `<h2>${r.slot === 'wallpaper' ? '벽지' : '바닥재'} ${r.items.length}개</h2><div class="grid">${r.items
            .map((it) => fig(it.file, `<b>${it.name}</b> <code>${it.id}</code> Lv.${it.minLevel}${it.season ? ` · ${it.season} 한정` : ''}`, 0.5))
            .join('')}</div>`,
      )
      .join('') + `<h2>회의실 구역에 고른 예 (업무 구역은 레벨 기본)</h2><div class="grid">${meetingSamples.map((m) => fig(m.file, m.label, 0.5)).join('')}</div>`,
  ),
  'sheet-people-fixed': page(
    '직원 · 고정 칸 · 외관',
    '직원은 앞(↙)·뒤(↖)만 그리고 좌우 반전으로 ↘·↗ · 걷기 2프레임 · 앉기는 의자 좌석과 등받이 사이에 끼운다',
    `<h2>직원 (3배 확대) — 서기 · 걷기1 · 걷기2 · 앉기, 각 ↙ ↘ ↖ ↗</h2><div class="grid">${fig(peopleFile, '머리·피부·옷 색은 shared/look.ts 팔레트. 위에서부터 줄 n = 머리 모양 n%8 · 윗옷 n%5 · 얼굴 n%5 · 머리 소품 n%6', 1)}</div>
<h2>회의실 (바닥 + 유리 칸막이, 앞줄 문 칸은 비움)</h2><div class="grid">${fig(meetingFile, '4×3칸 예 · 칸막이는 조각마다 깊이 정렬', 0.5)}</div>
<h2>외관 E1~E7</h2><div class="grid">${exterior.map((e) => fig(e.file, e.label, 1)).join('')}</div>`,
  ),
}
for (const [name, html] of Object.entries(sheets)) fs.writeFileSync(path.join(outDir, `${name}.html`), html)
fs.writeFileSync(path.join(outDir, 'preview.html'), page('아이소메트릭 그림 (A 파스텔) — 전체', 'isoArt.ts 하나로 그린 결과', Object.keys(sheets).map((n) => `<p><a style="color:#9fe3ff" href="${n}.html">${n}</a></p>`).join('')))

console.log(`ok ${outDir} · 품목 ${itemsOut.reduce((a, g) => a + g.items.length, 0)} · 임시 ${placeholders.length} · 크기 불일치 ${mismatch.length}`)
if (mismatch.length) console.log('크기 불일치:', mismatch.map((m) => `${m.id} 그림 ${m.size.join('×')} / 규격 ${m.spec.join('×')}`).join(', '))
if (placeholders.length) console.log('임시 그림:', placeholders.join(', '))
