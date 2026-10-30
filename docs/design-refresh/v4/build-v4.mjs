// 시안 v4 빌드 — 따뜻한 로비 화풍(isoArtWarm.ts) 가구 비교표 + 사무실 합성.
// 실행(이 폴더에서): node make-warm.mjs && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON build-v4.mjs
//   → /tmp/v4/furniture.html · office.html, 이후 Chrome headless로 furniture-v4.png · office-v4.png
import fs from 'node:fs'
import * as look from '../../../app/src/shared/look.ts'
import * as cur from '../../../app/src/renderer/map/iso/isoArt.ts'
import * as warm from './isoArtWarm.ts'
import { HH, HW } from '../../../app/src/shared/iso/grid.ts'
import * as hb from './habbo.mjs'
import { png, COMBOS } from './preview-v2.mjs'

const OUTDIR = '/tmp/v4'
fs.mkdirSync(OUTDIR, { recursive: true })
const uri = (w, h, rgba) => 'data:image/png;base64,' + png(w, h, rgba).toString('base64')
const pic = (w, h, px, k) => '<img src="' + uri(w, h, px) + '" style="width:' + w * k + 'px;height:' + h * k + 'px;image-rendering:pixelated">'
const K = (L) => hb.lookFrom(L, look)

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4) }
  blit(src, sw, sh, dx, dy) {
    dx = Math.round(dx); dy = Math.round(dy)
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const s = (y * sw + x) * 4, a = src[s + 3] / 255
      if (!a) continue
      const X = x + dx, Y = y + dy
      if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue
      const d = (Y * this.w + X) * 4
      for (let i = 0; i < 3; i++) this.px[d + i] = this.px[d + i] * (1 - a) + src[s + i] * a
      this.px[d + 3] = Math.max(this.px[d + 3], src[s + 3])
    }
  }
}
const lastRow = (g) => { for (let y = g.h - 1; y >= 0; y--) for (let x = 0; x < g.w; x++) if (g.p[y * g.w + x]) return y; return g.h - 1 }
const CX = (hb.W - 1) / 2

// ── 사무실 합성: 같은 배치를 지금 앱(cur)과 v4(warm)로 ──
function scene(iso, v4) {
  const COLS = 9, ROWS = 7
  const room = iso.artRoom(COLS, ROWS, iso.STAGE_FINISH[2])
  const cv = new Canvas(room.cv.w, room.cv.h)
  cv.blit(room.cv.px, room.cv.w, room.cv.h, 0, 0)
  const o = room.o
  const P = (gx, gy, z = 0) => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
  const item = (id, r, gx, gy, role) => { const a = iso.artItem(id, r, role); const [x, y] = P(gx, gy); cv.blit(a.cv.px, a.cv.w, a.cv.h, x - a.o[0], y - a.o[1]) }
  const shadow = (gx, gy) => { const s = iso.artPersonShadow(); const [x, y] = P(gx, gy); cv.blit(s.px, s.w, s.h, x - 7, y - 3) }
  const L = (n) => iso.lookOf(n)
  const stand = (n, d, pose, gx, gy) => {
    shadow(gx, gy); const [x, y] = P(gx, gy)
    if (v4) { const g = hb.drawDir(K(COMBOS[n].L), pose, d); cv.blit(hb.toRGBA(g), g.w, g.h, x - CX, y - lastRow(g)) }
    else { const a = iso.artPerson(pose, { SW: 'front', SE: 'frontRight', NW: 'back', NE: 'backRight' }[d], L(n)); cv.blit(a.px, a.w, a.h, x - a.w / 2, y - a.h) }
  }
  const sit = (n, d, pose, gx, gy, z) => {
    const [x, y] = P(gx, gy, z)
    if (v4) { const g = hb.drawDir(K(COMBOS[n].L), pose, d); cv.blit(hb.toRGBA(g), g.w, g.h, x - CX, y - g.hip) }
    else { const a = iso.artPerson('sit', { SW: 'front', NE: 'backRight' }[d], L(n)); cv.blit(a.px, a.w, a.h, x - a.w / 2, y - a.h) }
  }
  const SEAT = (iso.seatHeight('chair') ?? 9) + (v4 ? 3 : 0)
  // 뒤쪽 벽 따라: 책장 · 화분 · 정수기 · 프린터 · 화이트보드
  item('bookshelf', 0, 0, 0); item('plant', 0, 2, 0); item('whiteboard', 0, 3, 0); item('prop-cooler', 0, 6, 0); item('prop-printer', 0, 7, 0)
  item('floor-lamp', 1, 0, 2); item('fern', 1, 0, 6)
  // 업무 자리 두 개 (마주보기)
  item('chair', 0, 2, 2, 'back'); item('chair', 0, 2, 2, 'seat'); sit(1, 'SW', 'type1', 2.5, 2.5, SEAT); item('desk', 0, 1, 3)
  item('chair', 0, 4, 2, 'back'); item('chair', 0, 4, 2, 'seat'); sit(2, 'SW', 'type2', 4.5, 2.5, SEAT); item('desk', 0, 3, 3)
  // 라운지: 러그 · 소파 · 안락의자 · 낮은 테이블
  item('rug-persian', 0, 5, 4); item('lv-waiting-sofa', 3, 8, 4); item('lv-reading-chair', 0, 6, 3); item('zone-low-table', 0, 6, 5)
  item('coffee-machine', 0, 8, 2)
  stand(0, 'NE', 'stand', 6.5, 6.4); stand(3, 'SW', 'stand', 1.6, 5.6); stand(4, 'SE', 'walk1', 3.6, 5.8)
  return cv
}

// ── 가구 비교표: 같은 품목을 지금(왼쪽)·v4(오른쪽) ──
const SHOW = ['desk', 'chair', 'desk-walnut', 'chair-leather', 'desk-executive', 'sofa-green', 'lv-waiting-sofa', 'lv-reading-chair', 'bookshelf', 'lv-tall-bookshelf', 'prop-cabinets', 'floor-lamp', 'prop-lamp', 'plant', 'monstera', 'fern', 'whiteboard', 'prop-printer', 'prop-cooler', 'coffee-machine', 'lv-reception', 'zone-low-table', 'rug-persian', 'aquarium', 'tv', 'fireplace', 'piano', 'pool-table']
const thumb = (iso, id) => { const a = iso.artItem(id, 0); return pic(a.cv.w, a.cv.h, a.cv.px, 2) }
const cells = SHOW.map((id) => '<div class="cell"><div class="pair"><div class="b old">' + thumb(cur, id) + '</div><div class="b new">' + thumb(warm, id) + '</div></div><span>' + warm.artName(id) + ' <code>' + id + '</code></span></div>').join('')

const css = `*{box-sizing:border-box}body{margin:0;background:#1f1a18;color:#f1e6da;font-family:-apple-system,"Apple SD Gothic Neo",sans-serif}
.page{padding:28px 32px;width:max-content}h1{margin:0 0 6px;font-size:24px}h1 small{font-size:14px;color:#bba996;font-weight:400;margin-left:10px}
h2{font-size:16px;margin:22px 0 10px;color:#f0b866}h2 small{color:#bba996;font-weight:400;font-size:12px;margin-left:8px}
.grid{display:grid;grid-template-columns:repeat(5,auto);gap:14px 18px}.cell{display:flex;flex-direction:column;gap:4px;align-items:center}
.pair{display:flex;gap:4px}.b{border-radius:6px;padding:6px;display:flex;align-items:flex-end;justify-content:center;min-width:90px;min-height:110px}
.old{background:#2e2c38}.new{background:#3a2a22}.cell span{font-size:11px;color:#d8c8b6}code{color:#9d8a78;font-size:10px}
.row{display:flex;gap:22px;align-items:flex-start}.box{background:#2a2220;border-radius:8px;padding:12px}.cap{font-size:12px;color:#bba996;margin-top:6px;max-width:900px;line-height:1.5}
.sw i{display:inline-block;width:18px;height:18px;border-radius:3px;margin-right:3px;vertical-align:middle;border:1px solid #0006}`
const sw = (arr) => '<div class="sw">' + arr.map((h) => '<i style="background:' + h + '"></i>').join('') + '</div>'

fs.writeFileSync(OUTDIR + '/furniture.html', '<!doctype html><meta charset=utf-8><style>' + css + '</style><body><div class="page"><h1>가구·소품 v4 — 따뜻한 로비 화풍 <small>각 칸 왼쪽 = 지금 앱 · 오른쪽 = v4 (×2)</small></h1>' +
  '<div class="cap">모양·배치는 우리 isoArt 그대로, <b>표현 방식만</b> 바꿨다: 외곽선 남색→진한 밤색(더 진하게) · 옆면 그늘 12/26%→16/36% · 팔레트 파스텔→원목·가죽·황동 · 기본 책상 서랍 패널+나뭇결, 기본 의자 붉은 가죽+버튼. 참고 사진의 그림을 따거나 개별 가구 모양을 베끼지 않았다.</div>' +
  '<h2>팔레트 <small>외곽선 · 그늘색 · 원목 · 가죽 · 금속 · 잎</small></h2>' + sw(['#3a1f16', '#5a2e22', '#dc9a58', '#c47a3c', '#a85c2a', '#8a4a22', '#6e3418', '#b83a2a', '#d8662e', '#d4a03a', '#6a5a52', '#bcaea2', '#2a6e34', '#468f3e', '#86bc56', '#f4e2b8', '#d6ad7e']) +
  '<h2>품목 ' + SHOW.length + '종</h2><div class="grid">' + cells + '</div></div>')

const now = scene(cur, false), v4 = scene(warm, true)
fs.writeFileSync(OUTDIR + '/office.html', '<!doctype html><meta charset=utf-8><style>' + css + '</style><body><div class="page"><h1>사무실 합성 v4 <small>같은 방·같은 배치 · 실제 크기 ×2</small></h1>' +
  '<div class="row"><div><h2>v4 — 따뜻한 로비 화풍 + 새 인물</h2><div class="box">' + pic(v4.w, v4.h, v4.px, 3) + '</div>' +
  '<div class="cap">바닥 = 원목 베벨 타일 · 벽 = 크림 + 아래 원목 웨인스코팅 · 인물 = 하보식 비례(3.5등신·부위별 외곽선)에 우리 얼굴(코 없음·세로 2칸 눈·볼터치)</div></div>' +
  '<div><h2>지금 앱</h2><div class="box">' + pic(now.w, now.h, now.px, 2) + '</div></div></div></div>')
console.log('ok')
