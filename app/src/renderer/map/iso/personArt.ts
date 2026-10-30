// 직원 인물 그림 — 3/4 아이소 인물 (머리 9행 · 서기 약 13×32칸, 3.5등신). 시안: docs/design-refresh/v4/habbo.mjs
// 방식: 머리·몸통·팔·다리·신발을 "부위"로 나눠 뒤→앞 순서로 겹쳐 그린다. 부위마다 1px 진한 외곽선을 먼저 두르므로
//   앞 부위(앞팔·머리)가 뒤 부위 위에 선을 긋는다 = 팔/몸 구분선. 음영은 왼쪽 위 빛 기준 3단(밝음·기본·그늘).
// 방향: 'f' = ↙(대각선 앞) · 'b' = ↖(대각선 뒤). ↘·↗는 좌우 반전으로 만든다.
// 얼굴은 코 없이 세로 2칸 눈 · 볼터치 · 작은 입. isoArt.ts와 서로 부르지 않도록 색 계산은 여기서 따로 한다.

/** 그리는 칸 크기 (외곽선 포함) */
export const FIG_W = 16
const FIG_H = 37
/** 머리 위 여유(삐죽 머리·비니 방울·베레모) — 모든 부위를 이만큼 내려 그린다 */
const OY = 2
const OUT = '#2e2a40' // isoArt S.out
const SH = '#4a4f80' // isoArt S.sh

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number) => {
  const x = hex(a)
  const y = hex(b)
  return toHex(x.map((v, i) => v + (y[i] - v) * t))
}
const lite = (c: string, t: number) => mix(c, '#ffffff', t)
const shade = (c: string, t: number) => mix(c, SH, t)

export interface FigureLook {
  /** 머리색 · 피부 · 윗옷 · 바지 · 신발 */
  h: string
  s: string
  c: string
  p: string
  b?: string
  /** shared/look.ts 순서: HAIR_STYLES · TOPS · FACE_ITEMS · HEAD_ITEMS */
  hair?: number
  top?: number
  face?: number
  head?: number
}
/** type = 책상 앞에 앉아 키보드를 치는 자세 (다리는 앉기와 같고 손만 키보드 위로) */
export type FigurePose = 'stand' | 'walk1' | 'walk2' | 'sit' | 'type'
export type FigureDir = 'SW' | 'SE' | 'NW' | 'NE'

type Dir = 'f' | 'b'
type Px = [number, number, string]

class Part {
  m = new Map<string, Px>()
  px(x: number, y: number, c: string | undefined) {
    if (c) this.m.set(`${x},${y}`, [x, y, c])
  }
  has(x: number, y: number) {
    return this.m.has(`${x},${y}`)
  }
  /** 글자 그림: 키 → 색 */
  tpl(rows: string[], x0: number, y0: number, col: Record<string, string>) {
    rows.forEach((r, y) => [...r].forEach((k, x) => k !== '.' && col[k] && this.px(x0 + x, y0 + y, col[k])))
  }
  /** 세로로 긴 팔다리: (x0,y0)→(x1,y1), 굵기 w. 왼쪽 열 밝게, 오른쪽 열 그늘 */
  limbV(x0: number, y0: number, x1: number, y1: number, w: number, [lt, base, sh]: string[], colAt?: (r: number, i: number) => string | null) {
    for (let y = y0; y <= y1; y++) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0)
      const x = Math.round(x0 + (x1 - x0) * t)
      for (let i = 0; i < w; i++) this.px(x + i, y, (colAt && colAt(y - y0, i)) || (i === 0 ? lt : i === w - 1 ? sh : base))
    }
  }
}
/** 외곽선 없이 덧칠하는 부위 (테 자체가 선인 안경 등) */
type Flat = { flat: Part }

/** 그린 결과: 칸마다 색(없으면 null). hip = 앉은 자세에서 엉덩이 바로 아래 줄 */
export class Grid {
  w: number
  h: number
  p: (string | null)[]
  hip = -1
  oy = 0
  constructor(w = FIG_W, h = FIG_H) {
    this.w = w
    this.h = h
    this.p = new Array(w * h).fill(null)
  }
  set(x: number, y: number, c: string) {
    y += this.oy
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c
  }
  /** 부위 하나: 둘레 1px 외곽선을 먼저 두르고(뒤 부위 위에도) 안을 칠한다 */
  draw(part: Part) {
    for (const [x, y] of part.m.values()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!part.has(x + dx, y + dy)) this.set(x + dx, y + dy, OUT)
    for (const [x, y, c] of part.m.values()) this.set(x, y, c)
  }
  mirror() {
    const g = new Grid(this.w, this.h)
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.p[y * this.w + x] = this.p[y * this.w + (this.w - 1 - x)]
    g.hip = this.hip
    return g
  }
}

const SKIN_PINK = '#c2706a'
function colors(k: FigureLook) {
  const isShaved = k.hair === 7
  // 짧게 민 머리: 머리 칸을 피부에 가까운 옅은 머리색으로
  const hair = isShaved ? mix(k.h, k.s, 0.45) : k.h
  const hairLt = lite(hair, 0.3)
  const topSh = shade(k.c, 0.3)
  const shoe = k.b ?? '#3a3040'
  return {
    h: hair, H: hairLt, d: shade(hair, 0.38), D: shade(hair, 0.6),
    s: k.s, k: shade(k.s, 0.26), e: '#2a2230', m: mix(mix(k.s, SKIN_PINK, 0.7), OUT, 0.3), r: mix(k.s, '#f4a0a0', 0.55),
    a: lite(k.s, 0.4), z: shade(k.s, 0.45), o: mix(shade(k.s, 0.5), SKIN_PINK, 0.3), // 얼굴 입체: 밝은 면·턱 그늘·귓구멍
    L: lite(k.c, 0.28), c: k.c, C: topSh, F: shade(topSh, 0.35),
    q: lite(k.p, 0.16), p: k.p, P: shade(k.p, 0.38),
    b: shoe, B: lite(shoe, 0.22),
    w: '#ffffff', x: '#d8dbe6', n: '#c03a48', N: shade('#c03a48', 0.35), // 흰 깃·넥타이
    g: mix('#8a90aa', OUT, 0.45), K: '#22232c', l: '#bfe4ff', // 안경테·선글라스·렌즈
    j: '#d8dbe6', J: shade('#d8dbe6', 0.4), y: '#f06a8a', // 헤드셋·포인트
    v: '#f0a040', V: shade('#f0a040', 0.3), u: lite('#f0a040', 0.3), // 비니
    t: '#3a5ac8', T: shade('#3a5ac8', 0.35), // 베레모
    i: '#d24a4a', I: shade('#d24a4a', 0.35), // 모자
    ...(isShaved ? { d: shade(hair, 0.2), D: shade(hair, 0.35) } : {}),
  }
}
type Col = ReturnType<typeof colors>

// ── 머리 (10×9, 머리 왼쪽 위 = (hx,hy)) ──
// ↙: 얼굴이 왼쪽 아래를 본다. 앞면(밝음 a) · 세로 2칸 눈(e) · 볼터치(r) · 작은 입(m) · 옆면 그늘(k)과 귀(o)
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
// ↖: 뒤통수. 왼쪽에 볼·턱 윤곽과 귀, 아래 목덜미
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

function headPart(c: Col, k: FigureLook, dir: Dir, hx: number, hy: number) {
  const P = new Part()
  const isF = dir === 'f'
  P.tpl(isF ? HEAD_F : HEAD_B, hx, hy, c)
  const at = (list: [number, number, keyof Col][]) => list.forEach(([x, y, cc]) => P.px(hx + x, hy + y, c[cc]))
  // 1 긴 머리: 얼굴 옆으로 흘러내리는 앞 가닥
  if (k.hair === 1 && isF) {
    for (let y = 2; y <= 8; y++) P.px(hx, hy + y, c[y > 6 ? 'd' : 'h'])
    P.px(hx + 1, hy + 3, c.h)
  }
  // 2 단발 앞머리: 이마를 덮는 일자 앞머리 + 턱선까지 내려오는 옆머리
  if (k.hair === 2) {
    if (isF) {
      at([[1, 3, 'h'], [2, 3, 'h'], [3, 3, 'h'], [4, 3, 'h'], [5, 3, 'h'], [0, 3, 'H'], [0, 4, 'h'], [0, 5, 'h'], [0, 6, 'd'], [6, 4, 'h'], [6, 5, 'h'], [6, 6, 'h'], [6, 7, 'd'], [7, 7, 'd']])
    } else at([[1, 7, 'h'], [0, 6, 'h'], [1, 6, 'h'], [2, 8, 'h'], [3, 8, 'h'], [4, 8, 'h'], [5, 8, 'd'], [6, 8, 'd'], [7, 8, 'd']])
  }
  // 4 삐죽 머리: 정수리 위로 뾰족뾰족
  if (k.hair === 4) at([[1, -1, 'h'], [2, -2, 'H'], [2, -1, 'h'], [4, -1, 'H'], [5, -2, 'h'], [5, -1, 'h'], [7, -1, 'd'], [8, -2, 'd'], [8, -1, 'd'], [0, 0, 'h'], [1, 0, 'h'], [8, 0, 'd'], [9, 1, 'd']])
  // 5 풍성한 머리: 위·양옆으로 한 칸씩 부푼다
  if (k.hair === 5) {
    for (let x = 1; x <= 7; x++) P.px(hx + x, hy - 1, c[x < 4 ? 'H' : x > 5 ? 'd' : 'h'])
    at([[0, 0, 'h'], [1, 0, 'H'], [0, 1, 'h'], [9, 1, 'd']])
    for (let y = 1; y <= 7; y++) P.px(hx + 10, hy + y, c.D)
    for (let y = 1; y <= (isF ? 4 : 6); y++) P.px(hx - 1, hy + y, c.h)
    if (isF) at([[8, 0, 'd'], [9, 0, 'd']])
  }
  // 6 옆 가르마: 얼굴 쪽으로 쓸어 넘긴 앞머리
  if (k.hair === 6) {
    if (isF) at([[0, 3, 'H'], [1, 3, 'H'], [2, 3, 'h'], [3, 3, 'h'], [0, 4, 'h'], [4, 2, 'd'], [5, 1, 'd']])
    else at([[6, 1, 'd'], [6, 2, 'd'], [5, 0, 'H']])
  }
  return P
}

/** 머리 뒤에 깔리는 것 (↙ 긴 머리 뒷부분·포니테일) — 몸통보다 먼저 */
function hairBack(c: Col, k: FigureLook, dir: Dir, hx: number, hy: number) {
  const P = new Part()
  if (k.hair === 1 && dir === 'f')
    for (let y = 2; y <= 13; y++)
      for (let x = 6; x <= 9; x++) {
        if (y > 11 && (x === 6 || x === 9)) continue
        P.px(hx + x, hy + y, c[x >= 8 || y > 11 ? 'd' : 'h'])
      }
  if (k.hair === 3 && dir === 'f') {
    for (let y = 2; y <= 10; y++) {
      const x = 9 + (y > 4 ? 1 : 0) - (y > 8 ? 1 : 0)
      P.px(hx + x, hy + y, c[y < 4 ? 'h' : 'd'])
      P.px(hx + x + 1, hy + y, c.D)
    }
    P.px(hx + 9, hy + 2, c.y)
    P.px(hx + 10, hy + 2, c.y)
  }
  return P
}
/** 머리 다음에 덮이는 것 (↖ 긴 머리·포니테일이 등 위로) */
function hairOver(c: Col, k: FigureLook, dir: Dir, hx: number, hy: number) {
  const P = new Part()
  if (k.hair === 1 && dir === 'b')
    for (let y = 5; y <= 13; y++)
      for (let x = 0; x <= 8; x++) {
        if (y > 10 && (x < y - 10 || x > 8 - (y - 10))) continue
        P.px(hx + x, hy + y, c[x < 2 ? 'H' : x > 6 ? 'd' : 'h'])
      }
  if (k.hair === 3 && dir === 'b') {
    for (let y = 5; y <= 12; y++) {
      P.px(hx + 4, hy + y, c[y < 7 ? 'H' : 'h'])
      P.px(hx + 5, hy + y, c[y > 10 ? 'D' : 'd'])
    }
    P.px(hx + 4, hy + 5, c.y)
    P.px(hx + 5, hy + 5, c.y)
  }
  return P
}

/** 머리 소품·얼굴 소품 (머리 그린 뒤). {flat}은 외곽선 없이 덧칠 */
function headWear(c: Col, k: FigureLook, dir: Dir, hx: number, hy: number): (Part | Flat)[] {
  const parts: (Part | Flat)[] = []
  const isF = dir === 'f'
  const part = (list: [number, number, string][]) => {
    const P = new Part()
    for (const [x, y, cc] of list) P.px(hx + x, hy + y, cc)
    return P
  }
  if (k.head === 1) {
    // 헤드셋: 머리띠 + 귀덮개 (+ 앞에서는 짧은 마이크)
    const P = new Part()
    for (let x = 2; x <= 7; x++) P.px(hx + x, hy - 1 + (x === 2 || x === 7 ? 1 : 0), c.j)
    if (isF) {
      P.px(hx + 7, hy + 1, c.j)
      for (const [x, y] of [[7, 2], [8, 2], [7, 3], [8, 3], [7, 4], [8, 4]]) P.px(hx + x, hy + y, x === 8 ? c.J : c.y)
      parts.push(P, { flat: part([[7, 5, c.J], [6, 6, c.J]]) })
    } else {
      P.px(hx + 1, hy + 1, c.j)
      P.px(hx + 8, hy + 1, c.j)
      for (const [x, y] of [[0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4], [8, 2], [9, 2], [8, 3], [9, 3], [8, 4], [9, 4]]) P.px(hx + x, hy + y, x < 5 ? c.y : c.J)
      parts.push(P)
    }
  }
  if (k.head === 2) {
    // 모자(캡): 둥근 정수리 + 얼굴 쪽으로 나온 챙 (뒤에서는 조절 끈 구멍)
    const P = new Part()
    P.tpl(['..iiiii...', '.iIiiiiiI.', 'iiiiiiiIII'], hx, hy - 1, { i: c.i, I: c.I })
    if (isF) for (let x = -1; x <= 4; x++) P.px(hx + x, hy + 2, x < 1 ? c.I : c.i)
    else for (let x = 0; x <= 9; x++) P.px(hx + x, hy + 2, x === 4 || x === 5 ? c.h : c.I)
    parts.push(P)
  }
  if (k.head === 3) {
    // 비니: 둥근 니트 + 세로 골 + 이마를 덮는 접단 + 방울
    const P = new Part()
    P.tpl(['...uu.....', '..uvvvv...', '.uvVvvVvV.', 'vvVvvVvvVV', 'VVVVVVVVVV'], hx, hy - 2, { u: c.u, v: c.v, V: c.V })
    parts.push(P)
  }
  if (k.head === 4) parts.push(part(isF ? [[6, 2, c.y], [7, 2, c.y]] : [[2, 3, c.y], [3, 3, c.y]])) // 머리핀
  if (k.head === 5) {
    // 베레모: 납작하고 머리보다 넓게, 뒤로 살짝 기운다
    const P = new Part()
    P.tpl(['....t.....', '.tttttttt..', 'ttttttTTTTT', '.TTTTTTTTT.'], hx - 1, hy - 2, { t: c.t, T: c.T })
    parts.push(P)
  }
  if (isF && k.face === 1)
    // 안경: 위 테 + 알 사이·가장자리 테
    parts.push({ flat: part([[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [0, 5], [2, 5], [3, 5], [5, 5], [0, 6], [2, 6], [5, 6], [6, 5]].map(([x, y]) => [x, y, c.g] as [number, number, string])) })
  if (isF && k.face === 2) {
    // 선글라스
    const list: [number, number, string][] = []
    for (let x = 0; x <= 6; x++) list.push([x, 5, x === 1 || x === 4 ? c.l : c.K])
    for (const x of [0, 1, 3, 4, 5]) list.push([x, 6, c.K])
    parts.push({ flat: part(list) })
  }
  if (isF && k.face === 3) parts.push({ flat: part([[0, 7, c.d], [1, 7, c.h], [2, 7, c.h], [4, 7, c.h], [5, 7, c.d], [1, 8, c.h], [2, 8, c.h], [3, 8, c.h], [4, 8, c.d], [0, 6, c.d]]) }) // 수염: 입 둘레·턱
  if (isF && k.face === 4) parts.push({ flat: part([[1, 7, c.d], [2, 7, c.h], [4, 7, c.h]]) }) // 콧수염
  return parts
}

// ── 몸통 ── 기준 좌표: 머리 (3,0)~(12,8), 목 9~10, 몸통 11~17, 엉덩이 18~19, 다리 20~27, 신발 ~29
const TX0 = 5
const TX1 = 11
function torsoPart(c: Col, k: FigureLook, dir: Dir, y0 = 11, y1 = 17, dx = 0) {
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
  const t = k.top ?? 0
  const X = (n: number) => TX0 + n + dx
  const at = (list: [number, number, keyof Col][]) => list.forEach(([n, y, cc]) => P.px(X(n), y0 + y, c[cc]))
  const hem = (cc: (n: number) => string) => {
    for (let n = 0; n <= 6; n++) P.px(X(n), y1 + 1, cc(n))
  }
  if (dir === 'f') {
    if (t === 0) at([[3, 0, 'C'], [4, 0, 'C']]) // 티셔츠 목둘레
    if (t === 1) {
      // 후드티: 끈 + 앞주머니 선
      at([[2, 1, 'w'], [2, 2, 'w'], [4, 1, 'w'], [4, 2, 'w']])
      for (let n = 1; n <= 4; n++) P.px(X(n), y1 - 1, c.F)
    }
    if (t === 2) {
      // 셔츠·넥타이: 흰 깃 + 넥타이
      at([[2, 0, 'w'], [3, 0, 'w'], [4, 0, 'w'], [5, 0, 'x'], [2, 1, 'w']])
      for (let y = 1; y <= 5; y++) P.px(X(3), y0 + y, y === 5 ? c.N : c.n)
    }
    if (t === 3) {
      // 카디건: 앞이 트여 흰 속옷이 보이고 단추, 엉덩이까지
      for (let y = 0; y <= y1 - y0; y++) P.px(X(3), y0 + y, y === 0 ? c.x : c.w)
      at([[2, 2, 'F'], [2, 4, 'F'], [2, 6, 'F']])
      hem((n) => (n === 3 ? c.x : n >= 5 ? c.F : c.C))
    }
    if (t === 4) {
      // 정장: 흰 V + 넥타이 + 깃 그늘 + 단추, 재킷 자락이 엉덩이를 덮는다
      at([[2, 0, 'w'], [3, 0, 'w'], [4, 0, 'x'], [2, 1, 'C'], [3, 1, 'n'], [4, 1, 'C'], [3, 2, 'N'], [2, 2, 'F'], [4, 2, 'F'], [3, 4, 'F'], [3, 6, 'F']])
      hem((n) => (n >= 5 ? c.F : c.C))
    }
  } else {
    if (t === 2 || t === 4) at([[2, 0, 'w'], [3, 0, 'w'], [4, 0, 'w']])
    if (t === 3 || t === 4) hem(() => c.C)
    if (t === 4) for (let y = y0 + 2; y <= y1; y++) P.px(X(3), y, c.F)
  }
  return P
}
/** 후드 모자(목 뒤 뭉치) — ↙에서는 머리보다 먼저, ↖에서는 머리 다음(등 위) */
function hoodPart(c: Col, dir: Dir, hx: number, hy: number) {
  const P = new Part()
  if (dir === 'f') for (const [x, y] of [[5, 8], [6, 8], [7, 8], [8, 8], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9]]) P.px(hx + x, hy + y, x >= 8 ? c.C : c.c)
  else for (let y = 8; y <= 11; y++) for (let x = 1 + (y > 9 ? y - 9 : 0); x <= 8 - (y > 9 ? y - 9 : 0); x++) P.px(hx + x, hy + y, y === 8 ? c.L : x > 5 ? c.C : c.c)
  return P
}
/** 목: 몸통 다음에 외곽선 없이 덧칠. 턱이 짧아 목이 한 칸 드러나고 턱 그림자(z)가 떨어진다 */
function neckPart(c: Col, y = 10, dx = 0): Flat {
  const P = new Part()
  P.px(7 + dx, y - 1, c.z)
  P.px(8 + dx, y - 1, c.z)
  P.px(9 + dx, y - 1, OUT)
  P.px(7 + dx, y, c.z)
  P.px(8 + dx, y, c.k)
  return { flat: P }
}
/** 엉덩이(바지 윗부분) */
function hipPart(c: Col, y0 = 18, y1 = 19, dx = 0) {
  const P = new Part()
  for (let y = y0; y <= y1; y++) for (let x = TX0; x <= TX1 - 1; x++) P.px(x + dx, y, x <= TX0 ? c.q : x >= TX1 - 1 ? c.P : c.p)
  return P
}
/** 티셔츠만 반소매 */
const sleeveLen = (k: FigureLook) => ((k.top ?? 0) === 0 ? 2 : 99)
/** 팔: 소매 → 피부 → 손(마지막 2행). 세로로 내린 팔 */
function armPart(c: Col, k: FigureLook, x0: number, y0: number, x1: number, y1: number, side: 'lit' | 'sh') {
  const P = new Part()
  const sl = sleeveLen(k)
  const n = y1 - y0
  P.limbV(x0, y0, x1, y1, 2, [c.L, c.c, c.C], (r, i) => {
    if (r >= n - 1) return i === 0 ? c.s : c.k // 손
    if (r < sl) return i === 0 ? (side === 'lit' ? c.L : c.c) : c.C
    return i === 0 ? c.s : c.k
  })
  // 긴 소매: 손목 위 한 줄을 소맷부리 그늘로
  if (sl === 99) {
    const yy = y1 - 2
    const xx = Math.round(x0 + (x1 - x0) * (n ? (yy - y0) / n : 0))
    P.px(xx, yy, c.C)
    P.px(xx + 1, yy, c.F)
  }
  return P
}
/** 굽힌 팔(앉아서 무릎·책상 위로): 윗팔 세로 + 팔뚝을 앞(왼쪽 아래)으로 */
function armBentPart(c: Col, k: FigureLook, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number) {
  const P = new Part()
  const sl = sleeveLen(k)
  P.limbV(sx, sy, ex, ey, 2, [c.L, c.c, c.C], (r, i) => (r < sl ? (i === 0 ? c.c : c.C) : i === 0 ? c.s : c.k))
  const n = Math.abs(hx - ex)
  for (let j = 0; j <= n; j++) {
    const x = ex + Math.sign(hx - ex) * j
    const y = Math.round(ey + (hy - ey) * (n ? j / n : 0))
    const isHand = j >= n - 1
    P.px(x, y, isHand ? c.s : sl === 99 ? c.c : c.s)
    P.px(x, y + 1, isHand ? c.k : sl === 99 ? c.C : c.k)
  }
  return P
}
/** 다리 3px */
function legPart(c: Col, x0: number, y0: number, x1: number, y1: number) {
  const P = new Part()
  P.limbV(x0, y0, x1, y1, 3, [c.q, c.p, c.P])
  return P
}
/** 신발: 앞 방향은 발끝이 왼쪽 아래로, 뒤 방향은 뒤꿈치. lift = 든 발(작게) */
function shoePart(c: Col, x: number, y: number, dir: Dir, lift = 0) {
  const P = new Part()
  const rows = dir === 'f' ? (lift ? ['.Bbb', 'bbbb'] : ['.Bbbb', 'Bbbbb']) : lift ? ['bbb', 'Bbb'] : ['Bbbb', 'bbbb']
  P.tpl(rows, x - (dir === 'f' && !lift ? 1 : 0), y, { b: c.b, B: c.B })
  return P
}
/** 앉은 다리 ↙: 허벅지가 좌석 위로 앞(왼쪽 아래)까지 나오고, 무릎에서 정강이가 바닥까지 내려와 발이 좌석 앞 바닥에 닿는다.
 *  엉덩이(19행) → 무릎(21행, 4px 앞 = 0.25칸) → 발바닥(32행): 좌석 높이 8~9 + 엉덩이 3에서 발이 바닥에 닿는 길이 */
function sitLegsF(D: (p: Part | Flat) => void, c: Col) {
  // 무릎(허벅지 윗면 = 빛 받는 밝은 면) — 두 무릎 사이 1칸 홈
  const T = new Part()
  T.tpl(
    [
      '....qqqqqqqq',
      '...qqqqqqqqp',
      '..qqqLqqqqp.',
      '.qqqLqqqpp..',
      '.ppPpppP....',
    ],
    0, 18, { q: c.q, L: c.p, p: c.p, P: c.P },
  )
  D(legPart(c, 1, 22, 1, 29))
  D(shoePart(c, 1, 30, 'f'))
  D(legPart(c, 5, 22, 5, 30))
  D(shoePart(c, 5, 31, 'f'))
  D(T)
}

/** 한 장 그리기 (↙ 또는 ↖) */
function figure(k: FigureLook, pose: FigurePose, dir: Dir) {
  const c = colors(k)
  const g = new Grid()
  g.oy = OY
  const hx = 3
  const hy = 0
  const isF = dir === 'f'
  const D = (p: Part | Flat) => {
    if ('flat' in p) for (const [x, y, cc] of p.flat.m.values()) g.set(x, y, cc)
    else g.draw(p)
  }
  const isLong = k.hair === 1 || k.hair === 3
  const isHood = k.top === 1
  if (pose !== 'sit' && pose !== 'type') {
    // 다리 [x0,y0,x1,y1, 든 발]. L = 화면 왼쪽, R = 화면 오른쪽. 가까운 발이 1칸 아래
    // 걷기: 내딛는 발은 진행 방향으로, 뒷발은 뒤꿈치를 든다
    const legs: Record<'stand' | 'walk1' | 'walk2', [number[], number[]]> = {
      stand: [[5, 20, 5, isF ? 26 : 27, 0], [8, 20, 8, isF ? 27 : 26, 0]],
      walk1: isF ? [[5, 20, 3, 27, 0], [8, 20, 9, 25, 1]] : [[5, 20, 4, 25, 0], [8, 20, 9, 27, 1]],
      walk2: isF ? [[5, 20, 7, 25, 1], [8, 20, 5, 27, 0]] : [[5, 20, 5, 27, 1], [8, 20, 7, 25, 0]],
    }
    const [L, R] = legs[pose]
    // 앞으로 나오는(아래쪽) 다리를 나중에 그린다
    const order = L[3] > R[3] || (L[3] === R[3] && !isF) ? [R, L] : [L, R]
    for (const l of order) {
      D(legPart(c, l[0], l[1], l[2], l[3]))
      D(shoePart(c, l[2], l[3] + 1, dir, l[4]))
    }
    D(hipPart(c))
    // 팔: 걷기에서는 다리와 반대로 흔든다
    const sw = pose === 'walk1' ? 1 : pose === 'walk2' ? -1 : 0
    const far = isF ? [3, 12, 3 - (sw < 0 ? 1 : 0), 18 - (sw < 0 ? 1 : 0)] : [12, 12, 12 + (sw > 0 ? 1 : 0), 18 - (sw > 0 ? 1 : 0)]
    const near = isF ? [11, 12, 11 + (sw > 0 ? 1 : 0), 18] : [4, 12, 4 - (sw < 0 ? 1 : 0), 18]
    if (isLong) D(hairBack(c, k, dir, hx, hy))
    D(armPart(c, k, far[0], far[1], far[2], far[3], isF ? 'lit' : 'sh'))
    if (isHood && isF) D(hoodPart(c, dir, hx, hy))
    D(torsoPart(c, k, dir))
    D(neckPart(c))
    D(armPart(c, k, near[0], near[1], near[2], near[3], isF ? 'sh' : 'lit'))
    D(headPart(c, k, dir, hx, hy))
    D(hairOver(c, k, dir, hx, hy))
    if (isHood && !isF) D(hoodPart(c, dir, hx, hy))
    for (const p of headWear(c, k, dir, hx, hy)) D(p)
    return g
  }
  // ── 앉은 자세: 엉덩이 아래 = 19행 → 의자 좌석 윗면에 맞춘다 ──
  g.hip = 19 + OY
  const isType = pose === 'type'
  if (isF) {
    // 타자도 다리를 그린다 — 책상 무릎 자리가 뚫려 있어 정강이·신발이 책상 아래로 보인다
    sitLegsF(D, c)
    if (isLong) D(hairBack(c, k, dir, hx, hy))
    // 타자: 팔뚝을 앞(왼쪽 아래)으로 더 뻗어 손이 키보드 위에
    D(isType ? armBentPart(c, k, 3, 12, 3, 14, 0, 17) : armBentPart(c, k, 3, 12, 3, 15, 1, 16))
    if (isHood) D(hoodPart(c, dir, hx, hy))
    D(torsoPart(c, k, dir))
    D(neckPart(c))
    D(hipPart(c, 18, 18))
    D(isType ? armBentPart(c, k, 11, 12, 11, 14, 5, 17) : armBentPart(c, k, 11, 12, 11, 15, 4, 16))
    D(headPart(c, k, dir, hx, hy))
  } else {
    // 뒤에서도 다리를 그린다 — 허벅지는 몸에 가리고, 좌석 아래로 정강이·뒤꿈치가 보인다.
    // 발은 몸 앞(↖, 화면 왼쪽 위)에 놓여 서기보다 짧고 왼쪽으로 치우친다
    D(legPart(c, 3, 19, 3, 26))
    D(shoePart(c, 3, 27, dir))
    D(legPart(c, 7, 19, 7, 27))
    D(shoePart(c, 7, 28, dir))
    D(hipPart(c, 18, 19))
    D(armPart(c, k, 12, 12, 12, 16, 'sh'))
    D(torsoPart(c, k, dir))
    D(neckPart(c))
    D(armPart(c, k, 4, 12, 4, 15, 'lit'))
    D(headPart(c, k, dir, hx, hy))
    D(hairOver(c, k, dir, hx, hy))
    if (isHood) D(hoodPart(c, dir, hx, hy))
  }
  for (const p of headWear(c, k, dir, hx, hy)) D(p)
  return g
}

/** 4방향: ↙ = f, ↘ = f 반전, ↖ = b, ↗ = b 반전 */
export function drawFigure(k: FigureLook, pose: FigurePose, d4: FigureDir) {
  const g = figure(k, pose, d4 === 'SW' || d4 === 'SE' ? 'f' : 'b')
  return d4 === 'SE' || d4 === 'NE' ? g.mirror() : g
}
export const figureHex = hex
