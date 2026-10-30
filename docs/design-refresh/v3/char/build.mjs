// 시안 빌드: 현재(sprites.ts drawCharacter·isoArt artPerson)를 실제 코드로 뽑고, 시안(newfig.mjs)과 나란히 놓은 HTML을 만든다
// 실행: node --experimental-transform-types build.mjs  → /tmp/v3c/sheet.html, 이후 Chrome headless로 PNG 캡처
import zlib from 'node:zlib'
import fs from 'node:fs'
const ROOT = '/Users/pc-2311001/flitto/poc/claude-office'
globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext() { const self = c; if (!self.buf) self.buf = new Uint8Array(self.width * self.height * 4); let fs_ = [0,0,0]; return { set fillStyle(v) { fs_ = [1,3,5].map(i => parseInt(v.slice(i, i+2), 16)) }, fillRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const k = (j * self.width + i) * 4; self.buf.set([...fs_, 255], k) } }, clearRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) self.buf.set([0,0,0,0], (j * self.width + i) * 4) } } } }; return c } }
const look = await import(ROOT + '/app/src/shared/look.ts')
const { drawCharacter } = await import('/tmp/v3c/sprites.ts')
const iso = await import(ROOT + '/app/src/renderer/map/iso/isoArt.ts')
const nf = await import('./newfig.mjs')

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1) }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const uri = (w, h, rgba) => 'data:image/png;base64,' + png(w, h, rgba).toString('base64')
const fromCanvas = (c) => uri(c.width, c.height, new Uint8ClampedArray(c.buf))
const fromCv = (cv) => uri(cv.w, cv.h, cv.px)
const fromG = (g) => { const a = new Uint8ClampedArray(g.w * g.h * 4); g.p.forEach((c, i) => { if (c) { a.set([1,3,5].map(k => parseInt(c.slice(k, k+2), 16)), i * 4); a[i*4+3] = 255 } }); return uri(g.w, g.h, a) }
// 픽셀 1칸 = 화면 SC칸. 현재는 PIXEL=2짜리 캔버스라 가로세로를 반으로 읽는다
const SC = 6
const img = (src, w, h, k = SC) => '<img src="' + src + '" style="width:' + w * k + 'px;height:' + h * k + 'px;image-rendering:pixelated">'
const cur = (avatar, pose) => { const c = drawCharacter(avatar, pose); return img(fromCanvas(c), c.width / 2, c.height / 2) }
const isoP = (pose, dir, lk) => { const cv = iso.artPerson(pose, dir, lk); return img(fromCv(cv), cv.w, cv.h) }
const nw = (L, pose, facing, k = SC) => { const g = nf.drawNew(nf.lookFrom(L, look), pose, facing); return img(fromG(g), g.w, g.h, k) }

const BASE = { hairStyle: 0, hairColor: 0, skin: 0, top: 0, topColor: 0, pants: 0, face: 0, head: 0 }
const combos = [
  { name: '개발자', L: { hairStyle: 0, hairColor: 1, skin: 1, top: 2, topColor: 1, pants: 1, face: 1, head: 0 } },
  { name: '디자이너', L: { hairStyle: 3, hairColor: 6, skin: 2, top: 1, topColor: 5, pants: 3, face: 0, head: 1 } },
  { name: '마케터', L: { hairStyle: 4, hairColor: 3, skin: 3, top: 0, topColor: 2, pants: 0, face: 2, head: 0 } },
  { name: '매니저', L: { hairStyle: 1, hairColor: 5, skin: 0, top: 4, topColor: 11, pants: 2, face: 0, head: 3 } },
]
const A = look.encodeLook({ ...BASE, hairColor: 0, topColor: 0, skin: 0 })
const BL = nf.lookFrom({ ...BASE }, look)
const isoL = { h: BL.hair, s: BL.skin, c: BL.c, p: BL.pants }
const cell = (label, html) => '<div class="cell">' + html + '<span>' + label + '</span></div>'
const row = (title, a, b, note) => '<div class="row"><h3>' + title + (note ? '<em>' + note + '</em>' : '') + '</h3><div class="pair"><div class="side cur">' + a + '</div><div class="side nw">' + b + '</div></div></div>'

const motion = [
  row('서기', cell('앞', isoP('stand', 'front', isoL)) + cell('뒤', isoP('stand', 'back', isoL)) + cell('옆', isoP('stand', 'frontRight', isoL)),
    cell('앞', nw(BASE, 'stand', 'front')) + cell('뒤', nw(BASE, 'stand', 'back')) + cell('옆', nw(BASE, 'stand', 'side')), '현재 = 사무실 실사용(isoArt)'),
  row('걷기', cell('1', isoP('walk1', 'front', isoL)) + cell('2', isoP('walk2', 'front', isoL)) + cell('옆1', isoP('walk1', 'frontRight', isoL)),
    cell('1', nw(BASE, 'walk1', 'front')) + cell('2', nw(BASE, 'walk2', 'front')) + cell('옆1', nw(BASE, 'walk1', 'side')) + cell('옆2', nw(BASE, 'walk2', 'side'))),
  row('앉아 타이핑', cell('1', cur(A, 'type1')) + cell('2', cur(A, 'type2')) + cell('뒤', cur(A, 'back')), cell('1', nw(BASE, 'type1')) + cell('2', nw(BASE, 'type2')) + cell('뒤', nw(BASE, 'sitback', 'back')), '현재 = drawFigure'),
  row('낮잠', cell('엎드림', cur(A, 'nap')), cell('엎드림', nw(BASE, 'nap'))),
].join('')

const comboHtml = combos.map((c) => { const av = look.encodeLook({ ...BASE, ...c.L }); return '<div class="combo"><h4>' + c.name + '</h4><div class="cp"><div class="side cur">' + cell('현재', cur(av, 'idle')) + cell('썸네일', '<img src="' + fromCanvas(drawCharacter(av, 'idle')) + '" style="width:48px;height:60px;image-rendering:pixelated">') + '</div><div class="side nw">' + cell('서기', nw(c.L, 'stand', 'front')) + cell('타이핑', nw(c.L, 'type1')) + cell('뒤', nw(c.L, 'stand', 'back')) + cell('옆', nw(c.L, 'walk1', 'side')) + cell('썸네일', nw(c.L, 'stand', 'front', 2)) + '</div></div></div>' }).join('')

const zoomG = nf.drawNew(nf.lookFrom(combos[0].L, look), 'stand', 'front')
const zoom = img(fromG(zoomG), zoomG.w, zoomG.h, 16)
const pal = (arr) => arr.map((h) => '<i style="background:' + h + '"></i>').join('')
const css = fs.readFileSync(new URL('./sheet.css', import.meta.url), 'utf8')
const html = '<!doctype html><meta charset=utf-8><style>' + css + '</style><body><div class="page"><h1>직원 캐릭터 정교화 시안 <small>v3 · 사무실 테마·색 팔레트 유지 / 하보는 표현 수준만 참고</small></h1>' +
  '<div class="cols"><div class="main"><div class="hd"><b>현재</b><b>시안</b></div>' + motion + '<h2>꾸미기 조합 4종 <small>머리·옷·소품 조합 (같은 조합을 현재 / 시안으로)</small></h2>' + comboHtml + '</div>' +
  '<aside><h2>시안 해부도</h2>' + zoom + '<ul><li><b>2.5등신</b> 머리 12행 : 전체 28행</li><li><b>점 눈·볼</b> 2×2 점 눈 + 분홍 볼 + 작은 입</li><li><b>머리 2단</b> 하이라이트 띠 + 앞머리·옆 그림자</li><li><b>옷 음영</b> 왼쪽 밝은 면 / 오른쪽 어두운 면, 소매·팔 분리선</li><li><b>외곽선</b> 닿은 색을 진하게 (#2A2230 계열)</li></ul>' +
  '<h2>색 팔레트 (그대로)</h2><div class="pal">' + pal(look.HAIR_COLORS.map((x) => x[0])) + '</div><div class="pal">' + pal(look.SKINS) + '</div><div class="pal">' + pal(look.TOP_COLORS.map((x) => x[0])) + '</div><div class="pal">' + pal(look.PANTS) + '</div><p class="n">shared/look.ts 팔레트 값 그대로. 새 색 없음.</p>' +
  '<p class="n">크기: 현재 14~16×20칸 → 시안 20×28칸(서기). 앉은 모습은 20×22칸. 코드 적용 시 크기·앵커 확인 필요.</p></aside></div></div>'
fs.writeFileSync('/tmp/v3c/sheet.html', html)
console.log('ok', html.length)
