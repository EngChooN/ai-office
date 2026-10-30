// 시안 v4 — 앱 isoArt.ts를 복사해 "따뜻한 호텔 로비" 화풍으로 바꾼 사본(isoArtWarm.ts)을 만든다. 앱 코드는 읽기만.
// 참고 사진에서 가져온 건 표현 방식(진한 갈색 외곽선 · 면별 3단 음영 · 원목·가죽 위주의 따뜻한 팔레트 · 웨인스코팅 벽 · 타일 바닥)뿐이고,
// 개별 가구 모양·무늬·인물 얼굴은 우리 것을 그대로 쓰거나 새로 그린다 (원본 그림을 따거나 베끼지 않는다).
// 바꾼 곳은 아래 R 표가 전부 — 코드에 넣을 때 이 표가 그대로 적용 목록이 된다.
// 실행(이 폴더에서): node make-warm.mjs
import fs from 'node:fs'

const SRC = '../../../app/src/renderer/map/iso/isoArt.ts'
let s = fs.readFileSync(SRC, 'utf8')
s = s.replaceAll("'../../../shared/", "'../../../app/src/shared/")

const R = [
  // ── 빛·그림자·외곽선: 남색 → 진한 밤색, 옆면 음영을 더 깊게(3단이 또렷하게) ──
  ["out: '#2e2a40'", "out: '#3a1f16'"],
  ["sh: '#4a4f80'", "sh: '#5a2e22'"],
  ['shadeS: 0.12', 'shadeS: 0.16'],
  ['shadeE: 0.26', 'shadeE: 0.36'],
  ['floorShadow: [42, 46, 80, 46]', 'floorShadow: [70, 34, 20, 58]'],
  // 실루엣 외곽선을 더 진하게 (닿은 색 72% → 86%)
  ['mix([src[n * 4], src[n * 4 + 1], src[n * 4 + 2], 255], S.out, 0.72)', 'mix([src[n * 4], src[n * 4 + 1], src[n * 4 + 2], 255], S.out, 0.86)'],
  // 품목마다 박아 둔 파스텔 색까지 한 번에: 외곽선 두르기 직전에 전체 색 보정(grade) 한 번
  ['function outline(cv: Cv) {\n  const src = cv.px.slice()', 'function outline(cv: Cv) {\n  grade(cv)\n  const src = cv.px.slice()'],
  // ── 팔레트: 파스텔 → 원목·가죽·황동 ──
  ["white: '#f6f8fb'", "white: '#f7efe2'"],
  ["paper: '#ffffff'", "paper: '#fffaf0'"],
  ["metal: '#5d6380'", "metal: '#6a5a52'"],
  ["metalL: '#b8bdcb'", "metalL: '#bcaea2'"],
  ["steel: '#cfd6de'", "steel: '#dcd0c2'"],
  ["dark: '#3a3f55'", "dark: '#3e2e2a'"],
  ["wood: '#d6ae7a'", "wood: '#c47a3c'"],
  ["woodL: '#e8c79a'", "woodL: '#dc9a58'"],
  ["woodD: '#a77d52'", "woodD: '#8a4a22'"],
  ["walnut: '#8a5a3c'", "walnut: '#6e3418'"],
  ["walnutT: '#a06a46'", "walnutT: '#924a24'"],
  ["deskTop: '#f4dfbd'", "deskTop: '#c88a54'"],
  ["deskSide: '#e2c69e'", "deskSide: '#a85c2a'"],
  ["screen: '#9fe3ff'", "screen: '#8ccfd8'"],
  ["keyboard: '#eef0f6'", "keyboard: '#ece2d2'"],
  ["orange: '#f0834e'", "orange: '#d8662e'"],
  ["mint: '#8fd6c2'", "mint: '#6fb08e'"],
  ["mintL: '#a8e2d2'", "mintL: '#8cc6a4'"],
  ["red: '#e85a4a'", "red: '#b83a2a'"],
  ["blue: '#5aa8d8'", "blue: '#4a7fb0'"],
  ["sky: '#a8dcf2'", "sky: '#9ccbe0'"],
  ["skyL: '#e6f7ff'", "skyL: '#e4f2f6'"],
  ["purple: '#9b86d8'", "purple: '#86629e'"],
  ["pink: '#f2a7b8'", "pink: '#d88a8e'"],
  ["gold: '#d8b45a'", "gold: '#d4a03a'"],
  ["pot: '#ec9a72'", "pot: '#b0552e'"],
  ["stone: '#e4ded4'", "stone: '#e6d8c0'"],
  ["stoneD: '#c9c0b2'", "stoneD: '#bfa888'"],
  ["leaf: ['#3f9a58', '#62bd6c', '#9ad87e']", "leaf: ['#2a6e34', '#468f3e', '#86bc56']"],
  ["fabric: '#9fb3c8'", "fabric: '#b8683a'"],
  // ── 기본 자리: 책상 다리판에 서랍 패널, 의자는 붉은 가죽 ──
  ['b(0.08, 0.12, 0.14, 0.76, 0, 12, K.deskSide),\n      b(1.78, 0.12, 0.14, 0.76, 0, 12, K.deskSide),',
    'b(0.08, 0.12, 0.14, 0.76, 0, 12, K.deskSide, { S: panelFace(K.deskSide), E: panelFace(K.deskSide) }),\n      b(1.78, 0.12, 0.14, 0.76, 0, 12, K.deskSide, { S: panelFace(K.deskSide), E: panelFace(K.deskSide) }),'],
  ['b(0.22, 0.76, 1.56, 0.08, 4, 8, K.deskSide),\n      b(0.04, 0.08, 1.92, 0.84, 12, 2, K.deskTop),',
    'b(0.22, 0.76, 1.56, 0.08, 4, 8, K.deskSide, { S: panelFace(K.deskSide) }),\n      b(0.04, 0.08, 1.92, 0.84, 12, 2, K.deskTop, { top: grainTop(K.deskTop), S: K.woodD, E: K.woodD }),'],
  ["b(0.22, 0.24, 0.56, 0.56, 9, 3, K.orange, { role: 'seat' }),\n      b(0.22, 0.14, 0.56, 0.1, 12, 13, K.orange, { role: 'back' }),",
    "b(0.22, 0.24, 0.56, 0.56, 9, 3, K.red, { role: 'seat', top: cushionTop(K.red) }),\n      b(0.22, 0.14, 0.56, 0.1, 12, 13, K.red, { role: 'back', S: tuftFace(K.red) }),"],
  // ── 바닥·벽 ──
  // 타일: 칸마다 한 장, 왼쪽 위 가장자리 밝은 베벨 + 줄눈, 두 톤 체크
  ["tile: { name: '타일', paint: (q) => (frac(q.gx) < 0.04 || frac(q.gy) < 0.04 ? '#ddc8a4' : (Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? '#efe0c4' : '#f6ecd6') },",
    "tile: { name: '타일', paint: (q) => (frac(q.gx) < 0.04 || frac(q.gy) < 0.04 ? '#a87a4e' : frac(q.gx) < 0.1 || frac(q.gy) < 0.1 ? '#dcc09a' : (Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? '#c9a47c' : '#d2ae86') },"],
  // 흰 페인트 → 크림 벽 + 아래 원목 웨인스코팅(패널 몰딩) + 위 띠
  ["paint: { name: '흰 페인트', base: '#c9c2b4', cap: '#ffffff', face: () => '#f4f1ea' },",
    "paint: { name: '흰 페인트', base: '#8a4e2a', cap: '#fff2d8', face: (a, z) => (z < 15 ? (z > 13 ? '#e2a468' : frac(a * 2) < 0.06 || z < 7 || z > 12 ? '#a8602e' : '#bf743a') : z < 17 ? '#8a4e2a' : z > 45 ? '#e8cc98' : '#f4e2b8') },"],
]
for (const [a, b] of R) {
  if (!s.includes(a)) throw new Error('찾지 못함: ' + a.slice(0, 80))
  s = s.replace(a, b)
}
// 새 면 무늬 도우미 (책상 패널·나뭇결·가죽 방석·버튼 터프팅) — ITEMS 바로 앞에 넣는다
const helpers = `/** [v4] 서랍·문 패널: 가장자리 한 줄 띄우고 안쪽에 밝은 위·왼쪽 / 어두운 아래·오른쪽 몰딩 */
const panelFace = (base: string) => (q: Q) => {
  if (q.u < 0.1 || q.u > 0.9 || q.v < 0.1 || q.v > 0.9) return base
  if (q.u < 0.18 || q.v > 0.82) return mix(base, WHITE, 0.18)
  if (q.u > 0.82 || q.v < 0.18) return mix(base, S.sh, 0.3)
  return mix(base, S.sh, 0.08)
}
/** [v4] 원목 상판: 긴 결 + 앞모서리 쪽 밝게 */
const grainTop = (base: string) => (q: Q) => {
  const g = frac(q.v * 7 + Math.sin(q.u * 9) * 0.15)
  if (g < 0.08) return mix(base, S.sh, 0.18)
  return q.v > 0.85 ? mix(base, WHITE, 0.12) : base
}
/** [v4] 가죽 방석: 가운데 볼록(밝음) · 가장자리 눌림 */
const cushionTop = (base: string) => (q: Q) => {
  const d = Math.max(Math.abs(q.u - 0.5), Math.abs(q.v - 0.5))
  return d > 0.4 ? mix(base, S.sh, 0.2) : d < 0.18 ? mix(base, WHITE, 0.16) : base
}
/** [v4] 가죽 등받이: 버튼 터프팅 점 + 위 가장자리 하이라이트 */
const tuftFace = (base: string) => (q: Q) => {
  if (q.v > 0.9) return mix(base, WHITE, 0.2)
  const bu = frac(q.u * 3)
  const bv = frac(q.v * 2.5)
  if (Math.abs(bu - 0.5) < 0.12 && Math.abs(bv - 0.5) < 0.12) return mix(base, S.sh, 0.4)
  return base
}

`
s = s.replace('// ── 품목 그림 ──', helpers + '// ── 품목 그림 ──')
// [v4] 색 보정: 따뜻한 화이트밸런스(파랑 줄임) · 채도 +12% · 대비 +12% · 전체 4% 어둡게. 파스텔이 원목·가죽 톤으로 내려온다
const grade = `/** [v4] 전체 색 보정 — 외곽선 직전 한 번 */
function grade(cv: Cv) {
  const p = cv.px
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue
    let r = p[i] / 255
    let g = (p[i + 1] / 255) * 0.97
    let b = (p[i + 2] / 255) * 0.92
    const l = 0.3 * r + 0.59 * g + 0.11 * b
    r = l + (r - l) * 1.12
    g = l + (g - l) * 1.12
    b = l + (b - l) * 1.12
    const c = (v: number) => Math.round(Math.max(0, Math.min(1, (0.5 + (v - 0.5) * 1.12) * 0.96)) * 255)
    p[i] = c(r)
    p[i + 1] = c(g)
    p[i + 2] = c(b)
  }
}
`
s = s.replace('/** 실루엣 외곽선 1px', grade + '/** 실루엣 외곽선 1px')
fs.writeFileSync('isoArtWarm.ts', '// 자동 생성 — make-warm.mjs (앱 isoArt.ts 사본 + v4 화풍 치환). 직접 고치지 말 것\n' + s)
console.log('ok', R.length, '곳 치환')
