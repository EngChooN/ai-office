// 시안 v2 빌드 — 하보식 3/4 인물(habbo.mjs)을 시트 1장 + 사무실 합성 1장으로.
// 사무실 합성의 바닥·벽·책상·의자는 앱의 isoArt.ts를 그대로 돌려 뽑는다 (앱 코드는 읽기만).
// 실행(이 폴더에서): node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON build-v2.mjs <참고사진.png>
//   → /tmp/v3d/sheet-v2.html · office-v2.html, 이후 Chrome headless로 ../character-refine-v2(-office).png
import fs from 'node:fs'
import * as look from '../../../../app/src/shared/look.ts'
import * as iso from '../../../../app/src/renderer/map/iso/isoArt.ts'
import { HH, HW } from '../../../../app/src/shared/iso/grid.ts'
import * as hb from './habbo.mjs'
import { png, COMBOS } from './preview-v2.mjs'

const REF = process.argv[2]
const OUTDIR = '/tmp/v3d'
const uri = (w, h, rgba) => 'data:image/png;base64,' + png(w, h, rgba).toString('base64')
const img = (g, k, extra = '') => '<img src="' + uri(g.w, g.h, hb.toRGBA(g)) + '" style="width:' + g.w * k + 'px;height:' + g.h * k + 'px;image-rendering:pixelated' + extra + '">'
const K = (L) => hb.lookFrom(L, look)
/** 참고 사진 일부를 확대해서 (CSS로 잘라 붙인다) */
const refCrop = (x, y, w, h, k) => '<div style="width:' + w * k + 'px;height:' + h * k + 'px;background:url(file://' + REF + ') -' + x * k + 'px -' + y * k + 'px/' + 1024 * k + 'px ' + 726 * k + 'px;image-rendering:pixelated"></div>'

// ── 합성용 RGBA 캔버스 ──
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

function officeScene(withPeople = true) {
  const COLS = 7, ROWS = 6
  const room = iso.artRoom(COLS, ROWS, iso.STAGE_FINISH[2])
  const cv = new Canvas(room.cv.w, room.cv.h)
  cv.blit(room.cv.px, room.cv.w, room.cv.h, 0, 0)
  const o = room.o
  const P = (gx, gy, z = 0) => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
  const item = (id, r, gx, gy, role) => { const a = iso.artItem(id, r, role); const [x, y] = P(gx, gy); cv.blit(a.cv.px, a.cv.w, a.cv.h, x - a.o[0], y - a.o[1]) }
  const shadow = (gx, gy) => { const s = iso.artPersonShadow(); const [x, y] = P(gx, gy); cv.blit(s.px, s.w, s.h, x - 7, y - 3) }
  const stand = (g, gx, gy) => { if (!withPeople) return; shadow(gx, gy); const [x, y] = P(gx, gy); cv.blit(hb.toRGBA(g), g.w, g.h, x - CX, y - lastRow(g)) }
  const sit = (g, gx, gy, z) => { if (!withPeople) return; const [x, y] = P(gx, gy, z); cv.blit(hb.toRGBA(g), g.w, g.h, x - CX, y - g.hip) }
  const SEAT = (iso.seatHeight('chair') ?? 9) + 3 // 좌석 윗면 = sitZ + 방석 두께
  // 뒤쪽 자리(↙ 얼굴이 보임): 의자 등받이 → 좌석 → 직원 → 책상
  item('chair', 0, 2, 1, 'back'); item('chair', 0, 2, 1, 'seat')
  sit(hb.drawDir(K(COMBOS[1].L), 'type1', 'SW'), 2.5, 1.5, SEAT)
  item('desk', 0, 1, 2)
  // 앞쪽 자리(↖ 등이 보임): 책상 → 좌석 → 직원 → 등받이
  item('desk', 0, 4, 3)
  item('chair', 2, 5, 4, 'seat')
  sit(hb.drawDir(K(COMBOS[2].L), 'type2', 'NE'), 5.5, 4.5, SEAT)
  item('chair', 2, 5, 4, 'back')
  // 서 있는 / 걷는 직원
  stand(hb.drawDir(K(COMBOS[0].L), 'stand', 'NE'), 5.5, 1.5)
  stand(hb.drawDir(K(COMBOS[3].L), 'stand', 'SW'), 1.5, 4.3)
  stand(hb.drawDir(K(COMBOS[4].L), 'walk1', 'SE'), 3.2, 4.6)
  return cv
}
/** 현재 앱 직원(isoArt artPerson)을 같은 자리에 세운 비교용 */
function officeCurrent() {
  const COLS = 7, ROWS = 6
  const room = iso.artRoom(COLS, ROWS, iso.STAGE_FINISH[2])
  const cv = new Canvas(room.cv.w, room.cv.h)
  cv.blit(room.cv.px, room.cv.w, room.cv.h, 0, 0)
  const o = room.o
  const P = (gx, gy, z = 0) => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
  const item = (id, r, gx, gy, role) => { const a = iso.artItem(id, r, role); const [x, y] = P(gx, gy); cv.blit(a.cv.px, a.cv.w, a.cv.h, x - a.o[0], y - a.o[1]) }
  const L = (n) => iso.lookOf(n)
  const put = (pose, dir, n, gx, gy, z = 0) => { const a = iso.artPerson(pose, dir, L(n)); const [x, y] = P(gx, gy, z); if (!z) { const s = iso.artPersonShadow(); cv.blit(s.px, s.w, s.h, x - 7, y - 3) } cv.blit(a.px, a.w, a.h, x - a.w / 2, y - a.h) }
  const SZ = iso.seatHeight('chair') ?? 9
  item('chair', 0, 2, 1, 'back'); item('chair', 0, 2, 1, 'seat'); put('sit', 'front', 1, 2.5, 1.5, SZ); item('desk', 0, 1, 2)
  item('desk', 0, 4, 3); item('chair', 2, 5, 4, 'seat'); put('sit', 'backRight', 2, 5.5, 4.5, SZ); item('chair', 2, 5, 4, 'back')
  put('stand', 'backRight', 0, 5.5, 1.5); put('stand', 'front', 3, 1.5, 4.3); put('walk1', 'frontRight', 4, 3.2, 4.6)
  return cv
}
const cvImg = (cv, k) => '<img src="' + uri(cv.w, cv.h, cv.px) + '" style="width:' + cv.w * k + 'px;height:' + cv.h * k + 'px;image-rendering:pixelated">'

const css = `*{box-sizing:border-box}body{margin:0;background:#1d1f27;color:#e9e6f0;font-family:-apple-system,"Apple SD Gothic Neo",sans-serif}
.page{padding:28px 32px;width:max-content}h1{margin:0 0 6px;font-size:24px}h1 small{font-size:14px;color:#a9a4bd;font-weight:400;margin-left:10px}
h2{font-size:16px;margin:22px 0 10px;color:#f0c86a}h2 small{color:#a9a4bd;font-weight:400;font-size:12px;margin-left:8px}
.row{display:flex;gap:18px;align-items:flex-end}.box{background:#d9cfbd;border-radius:8px;padding:12px;display:flex;gap:14px;align-items:flex-end}
.box.dark{background:#2a2c38}.cell{display:flex;flex-direction:column;align-items:center;gap:4px}.cell span{font-size:12px;color:#3a3446}.dark .cell span{color:#c9c4d8}
.cap{font-size:12px;color:#a9a4bd;margin-top:6px}table{border-collapse:separate;border-spacing:10px 6px}td{background:#d9cfbd;border-radius:6px;padding:6px 8px;text-align:center;vertical-align:bottom}
th{font-size:12px;color:#c9c4d8;font-weight:500;text-align:left;padding-right:6px}thead th{text-align:center}
.cols{display:flex;gap:28px}aside{width:330px;font-size:13px;line-height:1.55}aside li{margin-bottom:6px}aside b{color:#f0c86a}.sw i{display:inline-block;width:16px;height:16px;border-radius:3px;margin-right:2px;vertical-align:middle;border:1px solid #0004}`

// ── 시트 ──
const base = K(COMBOS[0].L)
const DIRS = [['SW', '↙ 대각선 앞'], ['SE', '↘ (↙ 반전)'], ['NW', '↖ 대각선 뒤'], ['NE', '↗ (↖ 반전)']]
const POSES = [['stand', '서기'], ['walk1', '걷기 1'], ['walk2', '걷기 2'], ['type1', '앉아 타이핑 1'], ['type2', '앉아 타이핑 2'], ['nap', '낮잠(엎드림)']]
const motion = '<table><thead><tr><th></th>' + DIRS.map((d) => '<th>' + d[1] + '</th>').join('') + '</tr></thead>' +
  POSES.map(([p, n]) => '<tr><th>' + n + '</th>' + DIRS.map(([d]) => '<td>' + img(hb.drawDir(base, p, d), 5) + '</td>').join('') + '</tr>').join('') + '</table>'
const COMBO_SHOW = [['stand', 'SW', '서기 ↙'], ['walk1', 'SE', '걷기 ↘'], ['stand', 'NW', '서기 ↖'], ['type1', 'SW', '타이핑 ↙'], ['type2', 'NE', '타이핑 ↗'], ['nap', 'SW', '낮잠 ↙']]
const combos = COMBOS.slice(1).map((c) => '<h2 style="margin:14px 0 6px;font-size:14px;color:#e9e6f0">' + c.name + '</h2><div class="box">' + COMBO_SHOW.map(([p, d, n]) => '<div class="cell">' + img(hb.drawDir(K(c.L), p, d), 4) + '<span>' + n + '</span></div>').join('') + '</div>').join('')

// 참고 vs 시안: 같은 화면 배율(사진 1px = 시안 화면 1px = 아트 0.5px)로 맞춘다. 둘 다 ×4
const curPerson = (pose, dir, n) => { const a = iso.artPerson(pose, dir, iso.lookOf(n)); return '<img src="' + uri(a.w, a.h, a.px) + '" style="width:' + a.w * 8 + 'px;height:' + a.h * 8 + 'px;image-rendering:pixelated">' }
const compare = '<div class="row"><div><div class="box dark">' + refCrop(762, 286, 165, 92, 4) + '</div><div class="cap">참고: 하보 호텔 로비 인물 (원본 ×4)</div></div>' +
  '<div><div class="box">' + [1, 2, 3, 4].map((i) => img(hb.drawDir(K(COMBOS[i].L), 'stand', i % 2 ? 'SW' : 'SE'), 8)).join('') + '</div><div class="cap">시안 v2 — 같은 배율 (아트 1칸 = 화면 2px, ×4)</div></div>' +
  '<div><div class="box">' + curPerson('stand', 'front', 1) + curPerson('stand', 'frontRight', 2) + '</div><div class="cap">현재 앱 (isoArt) — 같은 배율</div></div></div>'

// 확대 해부도
const zoom = img(hb.drawDir(K(COMBOS[1].L), 'stand', 'SW'), 10)
const pal = (arr) => arr.map((h) => '<i style="background:' + h + '"></i>').join('')

const sheet = '<!doctype html><meta charset=utf-8><style>' + css + '</style><body><div class="page"><h1>직원 캐릭터 시안 v2 <small>하보식 3/4 아이소 인물 · 우리 팔레트(shared/look.ts) 유지</small></h1>' +
  '<h2>참고 사진과 나란히 <small>비율·각도·외곽선 비교 (같은 화면 배율)</small></h2>' + compare +
  '<div class="cols"><div><h2>동작 × 4방향 <small>기본 차림 · 오른쪽 두 열은 좌우 반전</small></h2>' + motion + '</div>' +
  '<div><h2>꾸미기 조합 4종 <small>같은 스타일로 머리·옷·소품만 바꿈</small></h2>' + combos + '</div>' +
  '<aside><h2>해부도 (안경+셔츠·넥타이)</h2>' + zoom + '<ul>' +
  '<li><b>3.5등신</b> 머리 9행 : 전체 32행(외곽선 포함, 발끝까지). 어깨 폭 ≈ 머리 폭</li><li><b>얼굴 입체</b> 앞면 밝음 · 눈썹뼈 그늘 · 코 밑 그림자 점 · 입선 · 옆면 그늘과 귀 · 둥글게 깎은 턱과 목에 떨어진 턱 그림자</li>' +
  '<li><b>3/4 대각선</b> ↙는 얼굴이 왼쪽 아래(코 1칸이 윤곽 밖), 뒤통수가 오른쪽. 앞팔(화면 오른쪽)이 몸통 옆면을 덮고 뒷팔은 1칸만 보인다. 가까운 발이 1칸 아래</li>' +
  '<li><b>부위별 1px 외곽선</b> 머리·몸통·팔·다리·신발을 따로 두르고 뒤→앞으로 겹쳐, 팔과 몸 사이에도 선이 생긴다</li>' +
  '<li><b>음영 3단</b> 왼쪽 위 빛: 앞면 밝음 · 기본 · 옆면 그늘 + 앞팔 아래 그림자, 머리 하이라이트/그늘</li>' +
  '<li><b>얇은 팔다리·작은 신발</b> 팔 2칸, 다리 3칸, 신발 4~5×2칸</li></ul>' +
  '<h2>색</h2><div class="sw">' + pal(look.HAIR_COLORS.map((x) => x[0])) + '</div><div class="sw">' + pal(look.SKINS) + '</div><div class="sw">' + pal(look.TOP_COLORS.map((x) => x[0])) + '</div><div class="sw">' + pal(look.PANTS) + '</div>' +
  '<p>팔레트 값 그대로. 밝은 면·그늘은 팔레트 색을 isoArt에 이미 있는 흰색·S.sh(#4a4f80)와 섞어 만들고, 외곽선은 S.out(#2e2a40). <b>새 고정 색 없음.</b></p>' +
  '<h2>캔버스</h2><p>한 장 16×35칸 고정(외곽선 포함, 머리 위 2칸 여유). 실제 그림: 서기 13×32 (삐죽머리·비니 13×33) · 앉아 타이핑 ↙ 14×31 · ↖ 13×22 · 낮잠 ↙ 13×21 · ↖ 13×18. 기준점: 서기 = 발끝 행 · 앉기 = 엉덩이 행(21) = 좌석 윗면(sitZ+3).</p><p>지금 isoArt 직원(16×22~26칸)보다 키가 약 1.3배. 책상 높이 12·좌석 12·벽 48은 그대로 두고 맞췄다.</p></aside></div></div>'
fs.writeFileSync(OUTDIR + '/sheet-v2.html', sheet)

// ── 사무실 합성 ──
const lobby = refCrop(330, 300, 420, 200, 2)
const office = '<!doctype html><meta charset=utf-8><style>' + css + '</style><body><div class="page"><h1>사무실 합성 — 실제 크기 <small>바닥·벽·책상·의자는 앱 isoArt 그대로 · 화면 배율 ×2 (참고 사진도 ×2)</small></h1>' +
  '<div class="row" style="align-items:flex-start"><div><h2>시안 v2</h2><div class="box dark">' + cvImg(officeScene(), 4) + '</div><div class="cap">↙ 안경+셔츠·넥타이 타이핑 · ↗ 포니테일+후드+헤드셋 타이핑 · ↗ 기본 서기 · ↙ 삐죽머리 서기 · ↘ 긴머리+정장+비니 걷기</div></div>' +
  '<div><h2>참고: 하보 호텔 로비 (×2)</h2><div class="box dark">' + lobby + '</div>' +
  '<h2>현재 앱 (같은 방·같은 자리 · 절반 크기로 표시)</h2><div class="box dark">' + cvImg(officeCurrent(), 2) + '</div><div class="cap">현재 직원(isoArt artPerson) — 키 비교용</div></div></div></div>'
fs.writeFileSync(OUTDIR + '/office-v2.html', office)
console.log('ok')
