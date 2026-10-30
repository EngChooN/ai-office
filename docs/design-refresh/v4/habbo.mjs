// 직원 캐릭터 시안 v4 — v2에서 외곽선·그늘을 밤색으로, 얼굴을 우리식(코 없음·세로 2칸 눈·볼터치·작은 입)으로 바꿈.
// 직원 캐릭터 시안 v2 — 하보식 3/4 아이소 인물 (대표 반려 후 다시 그림)
// 방식: 머리·몸통·팔·다리·신발을 "부위"로 나눠 뒤→앞 순서로 겹쳐 그린다. 부위마다 1px 진한 외곽선을 먼저 두르므로
//   앞 부위(앞팔·머리)가 뒤 부위 위에 선을 긋는다 = 하보의 팔/몸 구분선. 음영은 왼쪽 위 빛 기준 3단(밝음·기본·그늘).
// 방향: 'f' = ↙(대각선 앞) · 'b' = ↖(대각선 뒤). ↘·↗는 좌우 반전(mirror)으로 만든다.
// 크기: 서기 약 13×32칸(외곽선 포함), 머리 9행 → 3.5등신 (얼굴 입체를 넣으려고 머리를 1행 키움). 책상 높이 12·좌석 12(isoArt)에 맞춘 키.
// 색: shared/look.ts 팔레트 + isoArt.ts에 이미 있는 색(S.out·S.sh·소품색)만 섞어 쓴다. 앱 코드는 건드리지 않는다.
export const W = 16
export const H = 35
/** 머리 위 여유(삐죽 머리·비니 방울) — 모든 부위를 이만큼 내려 그린다 */
const OY = 2
const OUT = '#3a1f16' // v4 S.out (진한 밤색)
const SH = '#5a2e22' // v4 S.sh (그늘 섞는 밤색)
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
const lite = (c, t) => mix(c, '#ffffff', t)
const shade = (c, t) => mix(c, SH, t)

class Part {
  constructor() { this.m = new Map() }
  px(x, y, c) { if (c) this.m.set(x + ',' + y, [x, y, c]) }
  has(x, y) { return this.m.has(x + ',' + y) }
  /** 글자 그림: 키 → 색 */
  tpl(rows, x0, y0, col) { rows.forEach((r, y) => [...r].forEach((k, x) => k !== '.' && col[k] && this.px(x0 + x, y0 + y, col[k]))) }
  /** 세로로 긴 팔다리: (x0,y0)→(x1,y1), 굵기 w. 왼쪽 열 밝게, 오른쪽 열 그늘 */
  limbV(x0, y0, x1, y1, w, [lt, base, sh], colAt) {
    for (let y = y0; y <= y1; y++) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0)
      const x = Math.round(x0 + (x1 - x0) * t)
      for (let i = 0; i < w; i++) { const c = colAt ? colAt(y - y0, i) : null; this.px(x + i, y, c || (i === 0 ? lt : i === w - 1 ? sh : base)) }
    }
  }
}

class G {
  constructor(w = W, h = H) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null) }
  set(x, y, c) { y += this.oy ?? 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c }
  /** 부위 하나: 둘레 1px 외곽선을 먼저 두르고(뒤 부위 위에도) 안을 칠한다 */
  draw(part) {
    for (const [x, y] of part.m.values()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!part.has(x + dx, y + dy)) this.set(x + dx, y + dy, OUT)
    for (const [x, y, c] of part.m.values()) this.set(x, y, c)
  }
  mirror() { const g = new G(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.p[y * this.w + x] = this.p[y * this.w + (this.w - 1 - x)]; g.hip = this.hip; return g }
}

/** look.ts 번호 → 색 묶음 */
export function lookFrom(L, look) {
  const [hair, hairLt] = look.HAIR_COLORS[L.hairColor]
  const [top, topSh] = look.TOP_COLORS[L.topColor]
  return { hair, hairLt, skin: look.SKINS[L.skin], top, topSh, pants: look.PANTS[L.pants], hairStyle: L.hairStyle, topKind: L.top, face: L.face, head: L.head }
}

function colors(k) {
  return {
    h: k.hair, H: k.hairLt, d: shade(k.hair, 0.38), D: shade(k.hair, 0.6),
    s: k.skin, k: shade(k.skin, 0.26), e: '#2a2230', m: mix(mix(k.skin, '#c2706a', 0.7), OUT, 0.3), r: mix(k.skin, '#f4a0a0', 0.55),
    a: lite(k.skin, 0.4), z: shade(k.skin, 0.45), o: mix(shade(k.skin, 0.5), '#c2706a', 0.3), // 얼굴 입체: 밝은 면·깊은 그늘·귓구멍
    L: lite(k.top, 0.28), c: k.top, C: k.topSh, F: shade(k.topSh, 0.35),
    q: lite(k.pants, 0.16), p: k.pants, P: shade(k.pants, 0.38),
    b: '#3a3040', B: lite('#3a3040', 0.22), // isoArt 기본 신발색
    w: '#ffffff', x: '#d8dbe6', n: '#c03a48', N: shade('#c03a48', 0.35), // 흰 깃·넥타이 (isoArt 소품색)
    g: mix('#8a90aa', OUT, 0.45), K: '#22232c', l: '#bfe4ff', // 안경테·선글라스·렌즈
    j: '#d8dbe6', J: shade('#d8dbe6', 0.4), y: '#f06a8a', // 헤드셋·포인트
    v: '#f0a040', V: shade('#f0a040', 0.3), u: lite('#f0a040', 0.3), // 비니
  }
}

// ── 머리 (10×8, 머리 왼쪽 위 = (hx,hy)) ─────────────────
// ↙: 얼굴이 왼쪽 아래를 본다 (머리 10×9). 하보처럼 얼굴을 "면"으로 칠한다 —
//   앞면(이마·광대·턱끝 a 밝음) · 눈 위 눈썹뼈 그늘 · 코 밑 그림자 점(z) · 입선(m) · 옆면 그늘(k)과 귀(o) · 둥글게 깎은 턱.
//   코끝은 윤곽 밖으로 1칸 → 고개가 ↙로 돈다.
const HEAD_F = [
  '..hhhhh...',
  '.hHHHhhhh.',
  'hHHhhhhhdd',
  'hhhhshhhdd',
  'sssssskkdd',
  'seasesokdd',
  'seasesskdd',
  'rssmrskkd.',
  '.sssk.....',
]
// ↖: 뒤통수. 왼쪽에 볼·턱 윤곽과 귀, 아래 목덜미는 머리카락 그늘
const HEAD_B = [
  '..hhhhh...',
  '.hhHHHhhh.',
  'hhHHhhhhdd',
  'hHHhhhhhdd',
  'hHhhhhhhdd',
  'ahhhhhhhdd',
  'kohhhhhddd',
  '.zhhhhhdd.',
  '..zkkkz...',
]
// 엎드린 머리: 정수리가 앞으로 (얼굴은 팔에 묻힘)
const HEAD_NAP = [
  '.hhhhhh...',
  'hHHHhhhhd.',
  'hHhhhhhhdd',
  'hhhhhhhddd',
  '.hhhhhddd.',
  '..skhdd...',
]

function headPart(c, k, dir, hx, hy, nap) {
  const P = new Part()
  P.tpl(nap ? HEAD_NAP : dir === 'f' ? HEAD_F : HEAD_B, hx, hy, c)
  // 4 삐죽 머리: 정수리 위로 뾰족뾰족
  if (k.hairStyle === 4) for (const [x, y, cc] of [[1, -1, 'h'], [2, -2, 'H'], [2, -1, 'h'], [4, -1, 'H'], [5, -2, 'h'], [5, -1, 'h'], [7, -1, 'd'], [8, -2, 'd'], [8, -1, 'd'], [0, 0, 'h'], [1, 0, 'h'], [8, 0, 'd'], [9, 1, 'd']]) P.px(hx + x, hy + y, c[cc])
  // 1 긴 머리: 얼굴 옆으로 흘러내리는 앞 가닥
  if (k.hairStyle === 1 && dir === 'f' && !nap) { for (let y = 2; y <= 8; y++) P.px(hx, hy + y, c[y > 6 ? 'd' : 'h']); P.px(hx + 1, hy + 3, c.h) }
  return P
}

/** 머리 뒤에 깔리는 것 (↙ 긴 머리 뒷부분·포니테일) — 몸통보다 먼저 */
function hairBack(c, k, dir, hx, hy) {
  const P = new Part()
  if (k.hairStyle === 1 && dir === 'f') for (let y = 2; y <= 13; y++) for (let x = 6; x <= 9; x++) { if (y > 11 && (x === 6 || x === 9)) continue; P.px(hx + x, hy + y, c[x >= 8 || y > 11 ? 'd' : 'h']) }
  if (k.hairStyle === 3 && dir === 'f') { for (let y = 2; y <= 10; y++) { const x = 9 + (y > 4 ? 1 : 0) - (y > 8 ? 1 : 0); P.px(hx + x, hy + y, c[y < 4 ? 'h' : 'd']); P.px(hx + x + 1, hy + y, c.D) } P.px(hx + 9, hy + 2, c.y); P.px(hx + 10, hy + 2, c.y) }
  return P
}
/** 머리 다음에 덮이는 것 (↖ 긴 머리·포니테일이 등 위로) */
function hairOver(c, k, dir, hx, hy) {
  const P = new Part()
  if (k.hairStyle === 1 && dir === 'b') for (let y = 5; y <= 13; y++) for (let x = 0; x <= 8; x++) { if (y > 10 && (x < y - 10 || x > 8 - (y - 10))) continue; P.px(hx + x, hy + y, c[x < 2 ? 'H' : x > 6 ? 'd' : 'h']) }
  if (k.hairStyle === 3 && dir === 'b') { for (let y = 5; y <= 12; y++) { P.px(hx + 4, hy + y, c[y < 7 ? 'H' : 'h']); P.px(hx + 5, hy + y, c[y > 10 ? 'D' : 'd']) } P.px(hx + 4, hy + 5, c.y); P.px(hx + 5, hy + 5, c.y) }
  return P
}

/** 머리 소품·얼굴 소품 (머리 그린 뒤). {flat}은 외곽선 없이 덧칠 (테 자체가 선) */
function headWear(c, k, dir, hx, hy, nap) {
  const parts = []
  if (k.head === 3) { // 비니: 둥근 니트 + 세로 골 + 이마를 덮는 접단 + 방울
    const P = new Part()
    P.tpl(['...uu.....', '..uvvvv...', '.uvVvvVvV.', 'vvVvvVvvVV', 'VVVVVVVVVV'], hx, hy - 2, { u: c.u, v: c.v, V: c.V })
    parts.push(P)
  }
  if (k.head === 1 && !nap) { // 헤드셋: 머리띠 + 귀덮개 (+ 앞에서는 짧은 마이크)
    const P = new Part()
    for (let x = 2; x <= 7; x++) P.px(hx + x, hy - 1 + (x === 2 || x === 7 ? 1 : 0), c.j)
    if (dir === 'f') { P.px(hx + 7, hy + 1, c.j); for (const [x, y] of [[7, 2], [8, 2], [7, 3], [8, 3], [7, 4], [8, 4]]) P.px(hx + x, hy + y, x === 8 ? c.J : c.y); parts.push(P); const M = new Part(); for (const [x, y] of [[7, 5], [6, 6]]) M.px(hx + x, hy + y, c.J); parts.push({ flat: M }) }
    else { P.px(hx + 1, hy + 1, c.j); P.px(hx + 8, hy + 1, c.j); for (const [x, y] of [[0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4], [8, 2], [9, 2], [8, 3], [9, 3], [8, 4], [9, 4]]) P.px(hx + x, hy + y, x < 5 ? c.y : c.J); parts.push(P) }
  }
  if (dir === 'f' && !nap && k.face === 1) { // 안경: 위 테 + 알 사이·가장자리 테
    const P = new Part()
    for (const [x, y] of [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [0, 5], [2, 5], [3, 5], [5, 5], [0, 6], [2, 6], [5, 6], [6, 5]]) P.px(hx + x, hy + y, c.g)
    parts.push({ flat: P })
  }
  if (dir === 'f' && !nap && k.face === 2) { // 선글라스
    const P = new Part()
    for (let x = 0; x <= 6; x++) P.px(hx + x, hy + 5, c.K)
    for (const x of [0, 1, 3, 4, 5]) P.px(hx + x, hy + 6, c.K)
    P.px(hx + 1, hy + 5, c.l); P.px(hx + 4, hy + 5, c.l)
    parts.push({ flat: P })
  }
  return parts
}

// ── 몸통 ────────────────────────────────────────────────
// 기준 좌표: 머리 (4,1)~(13,8), 목 9~10, 몸통 11~17, 엉덩이 18~19, 다리 20~27, 신발 ~30
const TX0 = 5, TX1 = 11
function torsoPart(c, k, dir, y0 = 11, y1 = 17, dx = 0) {
  const P = new Part()
  for (let y = y0; y <= y1; y++) {
    const a = y === y0 ? 1 : 0
    for (let x = TX0 + a; x <= TX1 - a; x++) {
      const rel = x - TX0
      // 3단 면 음영: 앞면 밝음(왼쪽 2칸) · 기본 · 옆면 그늘(오른쪽 2칸) + 앞팔 아래 그림자 + 밑단
      let col = rel <= 1 ? c.L : rel >= 5 ? c.C : c.c
      if (y === y1) col = rel <= 1 ? c.c : c.C
      if (dir === 'f' && rel === 4 && y > y0 + 1) col = c.F
      if (dir === 'b' && rel === 2 && y > y0 + 1) col = mix(c.c, c.C, 0.5)
      P.px(x + dx, y, col)
    }
  }
  const t = k.topKind
  const X = (n) => TX0 + n + dx // 몸통 왼쪽 끝 기준
  if (dir === 'f') {
    if (t === 2) { // 셔츠·넥타이: 흰 깃 + 넥타이
      for (const n of [2, 3, 4, 5]) P.px(X(n), y0, n === 5 ? c.x : c.w)
      P.px(X(2), y0 + 1, c.w)
      for (let y = y0 + 1; y <= y0 + 5; y++) P.px(X(3), y, y === y0 + 5 ? c.N : c.n)
    }
    if (t === 4) { // 정장: 흰 V + 넥타이 + 깃 그늘 + 단추, 재킷 자락이 엉덩이를 덮는다
      for (const [n, y, cc] of [[2, 0, 'w'], [3, 0, 'w'], [4, 0, 'x'], [2, 1, 'C'], [3, 1, 'n'], [4, 1, 'C'], [3, 2, 'N'], [2, 2, 'F'], [4, 2, 'F']]) P.px(X(n), y0 + y, c[cc])
      P.px(X(3), y0 + 4, c.F); P.px(X(3), y0 + 6, c.F)
      for (let n = 0; n <= 6; n++) P.px(X(n), y1 + 1, n >= 5 ? c.F : c.C)
    }
    if (t === 1) { // 후드티: 끈 + 앞주머니 선
      for (const [n, y] of [[2, 1], [2, 2], [4, 1], [4, 2]]) P.px(X(n), y0 + y, c.w)
      for (let n = 1; n <= 4; n++) P.px(X(n), y1 - 1, c.F)
    }
    if (t === 0) { P.px(X(3), y0, c.C); P.px(X(4), y0, c.C) } // 티셔츠 목둘레
  } else {
    if (t === 2 || t === 4) for (const n of [2, 3, 4]) P.px(X(n), y0, c.w)
    if (t === 4) { for (let y = y0 + 2; y <= y1; y++) P.px(X(3), y, c.F); for (let n = 0; n <= 6; n++) P.px(X(n), y1 + 1, c.C) }
  }
  return P
}
/** 후드 모자(목 뒤 뭉치) — ↙에서는 머리보다 먼저, ↖에서는 머리 다음(등 위) */
function hoodPart(c, dir, hx, hy) {
  const P = new Part()
  if (dir === 'f') for (const [x, y] of [[5, 8], [6, 8], [7, 8], [8, 8], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9]]) P.px(hx + x, hy + y, x >= 8 ? c.C : c.c)
  else for (let y = 8; y <= 11; y++) for (let x = 1 + (y > 9 ? y - 9 : 0); x <= 8 - (y > 9 ? y - 9 : 0); x++) P.px(hx + x, hy + y, y === 8 ? c.L : x > 5 ? c.C : c.c)
  return P
}
// 목: 몸통 다음에 외곽선 없이 덧칠 (양옆은 몸통 윗선이 그대로 목선). 턱이 짧아 목이 한 칸 드러나고 턱 그림자(z)가 떨어진다
function neckPart(c, y = 10, dx = 0) { const P = new Part(); P.px(7 + dx, y - 1, c.z); P.px(8 + dx, y - 1, c.z); P.px(9 + dx, y - 1, OUT); P.px(7 + dx, y, c.z); P.px(8 + dx, y, c.k); return { flat: P } }
/** 엉덩이(바지 윗부분) */
function hipPart(c, y0 = 18, y1 = 19, dx = 0) {
  const P = new Part()
  for (let y = y0; y <= y1; y++) for (let x = TX0; x <= TX1 - 1; x++) P.px(x + dx, y, x <= TX0 ? c.q : x >= TX1 - 1 ? c.P : c.p)
  return P
}
const sleeveLen = (k) => (k.topKind === 0 ? 2 : 99)
/** 팔: 소매 → 피부 → 손(마지막 2행). 세로로 내린 팔 */
function armPart(c, k, x0, y0, x1, y1, side) {
  const P = new Part()
  const sl = sleeveLen(k), n = y1 - y0
  P.limbV(x0, y0, x1, y1, 2, [c.L, c.c, c.C], (r, i) => {
    if (r >= n - 1) return i === 0 ? c.s : c.k // 손
    if (r < sl) return i === 0 ? (side === 'lit' ? c.L : c.c) : c.C
    return i === 0 ? c.s : c.k
  })
  // 긴 소매: 손목 위 한 줄을 소맷부리 그늘로
  if (sl === 99) { const yy = y1 - 2, t = n ? (yy - y0) / n : 0, xx = Math.round(x0 + (x1 - x0) * t); P.px(xx, yy, c.C); P.px(xx + 1, yy, c.F) }
  return P
}
/** 굽힌 팔(타이핑): 윗팔 세로 + 팔뚝을 앞(왼쪽 아래)으로 */
function armBentPart(c, k, sx, sy, ex, ey, hx, hy) {
  const P = new Part()
  const sl = sleeveLen(k)
  P.limbV(sx, sy, ex, ey, 2, [c.L, c.c, c.C], (r, i) => (r < sl ? (i === 0 ? c.c : c.C) : i === 0 ? c.s : c.k))
  const n = Math.abs(hx - ex)
  for (let j = 0; j <= n; j++) {
    const x = ex + Math.sign(hx - ex) * j, y = Math.round(ey + (hy - ey) * (n ? j / n : 0))
    const isHand = j >= n - 1
    P.px(x, y, isHand ? c.s : sl === 99 ? c.c : c.s); P.px(x, y + 1, isHand ? c.k : sl === 99 ? c.C : c.k)
  }
  return P
}
/** 다리 3px. 신발: 앞 방향은 발끝이 왼쪽 아래로, 뒤 방향은 뒤꿈치. lift = 든 발(작게) */
function legPart(c, x0, y0, x1, y1) { const P = new Part(); P.limbV(x0, y0, x1, y1, 3, [c.q, c.p, c.P]); return P }
function shoePart(c, x, y, dir, lift = 0) {
  const P = new Part()
  const rows = dir === 'f' ? (lift ? ['.Bbb', 'bbbb'] : ['.Bbbb', 'Bbbbb']) : lift ? ['bbb', 'Bbb'] : ['Bbbb', 'bbbb']
  P.tpl(rows, x - (dir === 'f' && !lift ? 1 : 0), y, { b: c.b, B: c.B })
  return P
}
/** 앉은 다리 ↙: 허벅지가 앞(왼쪽 아래)으로, 정강이는 아래로 */
function sitLegsF(D, c) {
  const T = new Part()
  for (let y = 18; y <= 20; y++) for (let x = 4 - (y - 18); x <= 11 - (y - 18) * 2; x++) T.px(x, y, y === 18 ? c.q : y === 20 ? c.P : c.p)
  D(legPart(c, 2, 20, 2, 25)); D(shoePart(c, 2, 26, 'f'))
  D(T)
  D(legPart(c, 5, 21, 5, 26)); D(shoePart(c, 5, 27, 'f'))
}

/** 한 장 그리기. pose: stand | walk1 | walk2 | type1 | type2 | nap, dir: f | b */
export function figure(k, pose, dir) {
  const c = colors(k)
  const g = new G()
  g.oy = OY
  const hx = 3, hy = 0 // 머리 9행 = y0~8 (몸통 기준점은 그대로)
  const isF = dir === 'f'
  const D = (p) => { if (!p) return; if (p.flat) { for (const [x, y, cc] of p.flat.m.values()) g.set(x, y, cc) } else g.draw(p) }
  const long = k.hairStyle === 1 || k.hairStyle === 3
  if (pose === 'stand' || pose === 'walk1' || pose === 'walk2') {
    // 다리 [x0,y0,x1,y1, 든 발]. L = 화면 왼쪽, R = 화면 오른쪽. 가까운 발이 1칸 아래
    // 걷기: 내딛는 발은 진행 방향(↙면 왼쪽 아래, ↖면 왼쪽 위)으로, 뒷발은 뒤꿈치를 든다
    let L, R
    if (pose === 'stand') { L = [5, 20, 5, isF ? 26 : 27, 0]; R = [8, 20, 8, isF ? 27 : 26, 0] }
    if (pose === 'walk1') { L = isF ? [5, 20, 3, 27, 0] : [5, 20, 4, 25, 0]; R = isF ? [8, 20, 9, 25, 1] : [8, 20, 9, 27, 1] }
    if (pose === 'walk2') { L = isF ? [5, 20, 7, 25, 1] : [5, 20, 5, 27, 1]; R = isF ? [8, 20, 5, 27, 0] : [8, 20, 7, 25, 0] }
    // 앞으로 나오는(아래쪽) 다리를 나중에 그린다
    const order = (L[3] > R[3] || (L[3] === R[3] && !isF)) ? [R, L] : [L, R]
    for (const l of order) { D(legPart(c, ...l.slice(0, 4))); D(shoePart(c, l[2], l[3] + 1, dir, l[4])) }
    D(hipPart(c))
    // 팔: 걷기에서는 다리와 반대로 흔든다
    const sw = pose === 'walk1' ? 1 : pose === 'walk2' ? -1 : 0
    const farArm = isF ? [3, 12, 3 - (sw < 0 ? 1 : 0), 18 - (sw < 0 ? 1 : 0)] : [12, 12, 12 + (sw > 0 ? 1 : 0), 18 - (sw > 0 ? 1 : 0)]
    const nearArm = isF ? [11, 12, 11 + (sw > 0 ? 1 : 0), 18] : [4, 12, 4 - (sw < 0 ? 1 : 0), 18]
    if (long) D(hairBack(c, k, dir, hx, hy))
    D(armPart(c, k, ...farArm, isF ? 'lit' : 'sh'))
    if (k.topKind === 1 && isF) D(hoodPart(c, dir, hx, hy))
    D(torsoPart(c, k, dir)); D(neckPart(c))
    D(armPart(c, k, ...nearArm, isF ? 'sh' : 'lit'))
    D(headPart(c, k, dir, hx, hy)); D(hairOver(c, k, dir, hx, hy))
    if (k.topKind === 1 && !isF) D(hoodPart(c, dir, hx, hy))
    for (const p of headWear(c, k, dir, hx, hy)) D(p)
    return g
  }
  // ── 앉은 자세: 엉덩이 아래 = 19행 → 의자 좌석 윗면에 맞춘다 ──
  g.hip = 19 + OY
  const up = pose === 'type1' ? 0 : 1 // 타이핑 2프레임: 두 손이 번갈아 한 칸 오르내린다
  if (pose !== 'nap') {
    if (isF) {
      sitLegsF(D, c)
      if (long) D(hairBack(c, k, dir, hx, hy))
      D(armBentPart(c, k, 3, 12, 3, 15, 1, 16 - up))
      if (k.topKind === 1) D(hoodPart(c, dir, hx, hy))
      D(torsoPart(c, k, dir)); D(neckPart(c)); D(hipPart(c, 18, 18))
      D(armBentPart(c, k, 11, 12, 11, 15, 4, 17 - (1 - up)))
      D(headPart(c, k, dir, hx, hy))
    } else {
      // 뒤에서는 다리가 몸 앞(안 보임), 팔꿈치만 옆구리로
      D(hipPart(c, 18, 19))
      D(armPart(c, k, 12, 12, 12, 16 - up, 'sh'))
      D(torsoPart(c, k, dir)); D(neckPart(c))
      D(armPart(c, k, 4, 12, 4, 16 - (1 - up), 'lit'))
      D(headPart(c, k, dir, hx, hy)); D(hairOver(c, k, dir, hx, hy))
      if (k.topKind === 1) D(hoodPart(c, dir, hx, hy))
    }
    for (const p of headWear(c, k, dir, hx, hy)) D(p)
    return g
  }
  // 낮잠: 몸을 앞으로 숙이고 포갠 팔 위에 머리
  if (isF) {
    sitLegsF(D, c)
    D(torsoPart(c, k, dir, 13, 18, -1))
    const A = new Part(); for (let y = 15; y <= 17; y++) for (let x = 0; x <= 9; x++) A.px(x, y, y === 15 ? c.L : y === 17 ? c.C : sleeveLen(k) === 99 || x > 7 ? c.c : c.s)
    A.px(0, 16, c.s); A.px(0, 17, c.k) // 팔 끝 손
    D(A)
    if (k.hairStyle === 3) { const T = new Part(); for (let y = 9; y <= 14; y++) { T.px(9 + (y > 11 ? 1 : 0), y, c.d); T.px(10 + (y > 11 ? 1 : 0), y, c.D) } D(T) }
    D(headPart(c, k, dir, 1, 10, true))
    if (k.hairStyle === 1) { const T = new Part(); for (let y = 13; y <= 16; y++) for (let x = 8; x <= 10; x++) T.px(x, y, c[x > 9 ? 'd' : 'h']); D(T) }
    for (const p of headWear(c, k, dir, 1, 11, true)) D(p)
  } else {
    D(hipPart(c, 18, 19))
    D(armPart(c, k, 12, 14, 12, 18, 'sh'))
    D(torsoPart(c, k, dir, 13, 18))
    D(armPart(c, k, 4, 14, 4, 18, 'lit'))
    D(headPart(c, k, dir, hx, hy + 4)); D(hairOver(c, k, dir, hx, hy + 4))
    for (const p of headWear(c, k, dir, hx, hy + 4)) D(p)
  }
  return g
}

/** 4방향: ↙ = f, ↘ = f 반전, ↖ = b, ↗ = b 반전 */
export function drawDir(k, pose, d4) {
  const g = figure(k, pose, d4 === 'SW' || d4 === 'SE' ? 'f' : 'b')
  return d4 === 'SE' || d4 === 'NE' ? g.mirror() : g
}
export const toRGBA = (g) => { const a = new Uint8ClampedArray(g.w * g.h * 4); g.p.forEach((c, i) => { if (c) { a.set(hex(c), i * 4); a[i * 4 + 3] = 255 } }); return a }
