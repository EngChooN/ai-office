// 직원 캐릭터 시안 렌더러 (하보 수준의 표현: 2.5등신, 점 눈·볼, 머리 2단 음영, 옷 음영, 진한 외곽선)
// 색은 shared/look.ts 팔레트를 그대로 쓴다. 코드 적용 전 시안 확인용이며 앱 코드는 건드리지 않는다.
export const W = 20
export const H = 30
const OUT = '#2a2230'
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
const dark = (c, t) => mix(c, '#1c1626', t)
const lite = (c, t) => mix(c, '#ffffff', t)

class G {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null) }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.p[y * this.w + x] }
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c) }
  ell(cx, cy, rx, ry, fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) { const c = fn(x, y, dx, dy); if (c) this.set(x, y, c) }
    }
  }
  outline() {
    const src = this.p.slice()
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue
      let n = null
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && src[yy * this.w + xx]) n = src[yy * this.w + xx] }
      if (n) this.set(x, y, mix(n, OUT, 0.8))
    }
  }
}

/** 머리. facing: 'front' | 'back' | 'side'. 모든 머리 모양·소품을 여기서 그린다 */
function head(g, look, facing, oy = 0) {
  const { hair, hairLt, skin, hairStyle, face, headItem, top } = look
  const cx = facing === 'side' ? 9 : 10, cy = 7 + oy, rx = facing === 'side' ? 7 : 7.6, ry = 5.9
  const skinSh = dark(skin, 0.1), skinSh2 = dark(skin, 0.2)
  const hairSh = dark(hair, 0.28)
  const big = hairStyle === 5
  // 머리카락 뒤쪽(긴 머리·포니테일·풍성)은 먼저 깐다
  if (hairStyle === 1) g.rect(cx - 8, 6 + oy, cx + 7, 17 + oy, (x, y) => (facing === 'side' ? (x < cx + 1 ? (x > cx - 3 ? hair : hairSh) : null) : (x < cx - 4 || x > cx + 3 || facing === 'back' ? (x > cx + 3 ? hairSh : hair) : null)))
  if (hairStyle === 3) { const tx = facing === 'side' ? 1 : cx + 7; g.rect(tx, 3 + oy, tx + 2, 10 + oy, (x, y) => (y > 8 + oy ? hairSh : hair)); g.set(tx + (facing === 'side' ? 0 : 1), 3 + oy, look.hairband || '#ec6a8a') }
  g.ell(cx, cy, big ? rx + 1.6 : rx, big ? ry + 0.9 : ry, (x, y, dx, dy) => {
    const lineY = cy - ry + 3.5 + 1.9 * Math.abs(dx) * Math.abs(dx) * 1.6 + (hairStyle === 6 && dx < 0.1 ? 0.6 : 0)
    const sideHair = Math.abs(dx) > 0.86 && y < cy + 0.9
    const isHair = facing === 'back' || y < lineY || sideHair || (facing === 'side' && dx < 0.15 && y < cy + 2.2)
    if (hairStyle === 7 && facing !== 'back') { if (y < lineY - 1.6 && !sideHair) return hair }
    if (isHair) {
      if (y < cy - ry + 2.1 && dx < -0.05 && dx > -0.72 && facing !== 'back' && y >= cy - ry + 0.9) return hairLt // 하이라이트 띠
      if (facing === 'back' && y < cy - 1.2 && y > cy - ry + 1 && Math.abs(dx + 0.3) < 0.42) return hairLt
      if ((facing !== 'back' && y > lineY - 1.4) || dx > 0.55 || (facing === 'back' && y > cy + 2.2)) return hairSh // 그림자 띠
      return hair
    }
    if (y < lineY + 1) return skinSh // 앞머리 그림자
    if (y > cy + 4.7 || dx > 0.9) return skinSh // 턱 끝·볼 가장자리 그늘
    return skin
  })
  if (hairStyle === 4) for (const sx of [-4, -1, 2, 5]) { g.set(cx + sx, 0 + oy, hair); g.set(cx + sx + 1, 0 + oy, hairLt); g.set(cx + sx, 1 + oy, hair) }
  // 얼굴
  if (facing === 'front') {
    const ex = [cx - 4, cx + 3]
    for (const x of ex) { g.set(x, 7 + oy, '#2a2230'); g.set(x, 8 + oy, '#2a2230'); g.set(x + 1, 7 + oy, '#2a2230'); g.set(x + 1, 8 + oy, '#2a2230'); g.set(x, 7 + oy, '#5a4a66') }
    for (const x of [cx - 6, cx + 4]) { g.set(x, 9 + oy, mix(skin, '#f08a8a', 0.6)); g.set(x + 1, 9 + oy, mix(skin, '#f08a8a', 0.6)); g.set(x + 1, 9 + oy, mix(skin, '#f08a8a', 0.6)) }
    g.set(cx - 1, 10 + oy, '#a8504c'); g.set(cx, 10 + oy, '#a8504c')
    if (face === 1) { // 안경
      for (const x0 of [cx - 6, cx + 2]) { g.rect(x0, 6 + oy, x0 + 3, 6 + oy, '#4a4a66'); g.rect(x0, 9 + oy, x0 + 3, 9 + oy, '#4a4a66'); g.rect(x0, 7 + oy, x0, 8 + oy, '#4a4a66'); g.rect(x0 + 3, 7 + oy, x0 + 3, 8 + oy, '#4a4a66') }
      g.set(cx - 1, 7 + oy, '#4a4a66'); g.set(cx, 7 + oy, '#4a4a66')
    }
    if (face === 2) { g.rect(cx - 6, 6 + oy, cx + 5, 8 + oy, '#22232c'); g.set(cx - 5, 6 + oy, '#6a6a80'); g.set(cx + 3, 6 + oy, '#6a6a80') }
    if (face === 3) { g.rect(cx - 4, 10 + oy, cx + 3, 11 + oy, hairSh); g.set(cx - 1, 10 + oy, '#a8504c'); g.set(cx, 10 + oy, '#a8504c') }
  } else if (facing === 'side') {
    const ex = cx + 3
    g.set(ex, 7 + oy, '#5a4a66'); g.set(ex, 8 + oy, '#2a2230'); g.set(ex + 1, 7 + oy, '#2a2230'); g.set(ex + 1, 8 + oy, '#2a2230')
    g.set(ex - 1, 9 + oy, mix(skin, '#f08a8a', 0.6)); g.set(ex, 9 + oy, mix(skin, '#f08a8a', 0.6))
    g.set(ex + 4, 8 + oy, skin); g.set(ex + 3, 10 + oy, '#a8504c')
    if (face === 1) { g.rect(ex - 1, 6 + oy, ex + 2, 6 + oy, '#4a4a66'); g.rect(ex - 1, 9 + oy, ex + 2, 9 + oy, '#4a4a66'); g.rect(ex - 1, 7 + oy, ex - 1, 8 + oy, '#4a4a66'); g.rect(ex + 2, 7 + oy, ex + 2, 8 + oy, '#4a4a66'); g.rect(cx - 3, 7 + oy, ex - 2, 7 + oy, '#4a4a66') }
    if (face === 2) g.rect(ex - 2, 6 + oy, ex + 2, 8 + oy, '#22232c')
  }
  // 머리 소품
  if (headItem === 1) { // 헤드셋
    for (let x = cx - 6; x <= cx + 5; x++) { const yy = Math.round(cy - ry + 0.6 + 4.4 * Math.pow((x + 0.5 - cx) / 6.6, 2)); if (facing !== 'side') g.set(x, yy, '#3a3a4c') }
    if (facing !== 'side') { g.rect(cx - 9 + 1, 6 + oy, cx - 7 + 1, 9 + oy, '#3a3a4c'); g.rect(cx + 6, 6 + oy, cx + 8, 9 + oy, '#3a3a4c'); g.set(cx - 7, 7 + oy, '#8ad8ff'); g.set(cx + 6, 7 + oy, '#8ad8ff'); if (facing === 'front') { g.set(cx - 7, 10 + oy, '#3a3a4c'); g.set(cx - 6, 11 + oy, '#3a3a4c'); g.set(cx - 5, 11 + oy, '#3a3a4c') } }
    else { g.rect(cx - 2, 6 + oy, cx, 9 + oy, '#3a3a4c'); g.set(cx - 1, 7 + oy, '#8ad8ff'); for (let x = cx - 5; x <= cx + 4; x++) g.set(x, Math.round(cy - ry + 0.6 + 4.4 * Math.pow((x + 0.5 - cx) / 6, 2)), '#3a3a4c') }
  }
  if (headItem === 2 || headItem === 3) { // 모자 / 비니: 윗옷 색을 따라간다
    const c = top, cs = dark(top, 0.25)
    if (headItem === 3) g.ell(cx, cy - 1.6 + 0, rx + 0.6, 4.6, (x, y, dx, dy) => (y > cy - 1 - 0.3 + 0 ? null : dy < -0.55 ? lite(c, 0.2) : dx > 0.3 || dy > 0.5 ? cs : c))
    else { g.ell(cx, cy - 2.4, rx + 0.2, 3.4, (x, y, dx, dy) => (y > cy - 2.2 ? null : dy < -0.5 ? lite(c, 0.2) : dx > 0.4 ? cs : c)); g.rect(cx - 7, Math.round(cy - 2.2), cx + 7, Math.round(cy - 1.2), cs) }
    if (headItem === 3) g.rect(cx - 7, Math.round(cy - 1.4), cx + 7, Math.round(cy - 0.4), lite(c, 0.1))
    // 이마 라인 정리
    for (let x = cx - 6; x <= cx + 6; x++) if (facing === 'front') g.set(x, Math.round(cy - 0.4), g.get(x, Math.round(cy - 0.4)) || skin)
  }
}

/** 몸통·팔·다리. pose: stand | walk1 | walk2 | type1 | type2 */
function bodyFront(g, look, pose, crop) {
  const { c, C, skin, pants, shoe, topKind } = look
  const cl = lite(c, 0.2), cs = C
  const walkL = pose === 'walk1', walkR = pose === 'walk2'
  const typing = pose === 'type1' || pose === 'type2'
  // 다리 (앉은 모습은 그리지 않음)
  if (!crop) {
    const ps = dark(pants, 0.2), pl = lite(pants, 0.12)
    g.rect(6, 21, 13, 22, (x) => (x < 8 ? pl : x > 11 ? ps : pants))
    const lL = walkL ? 26 : 27, lR = walkR ? 26 : 27
    g.rect(6, 23, 8, lL, (x, y) => (x === 6 ? pl : pants)); g.rect(11, 23, 13, lR, (x) => (x === 13 ? ps : pants))
    g.set(9, 23, ps); g.set(10, 23, ps)
    g.rect(5, lL + 1, 8, lL + 2, (x, y) => (y === lL + 1 ? lite(shoe, 0.18) : shoe)); g.rect(11, lR + 1, 14, lR + 2, (x, y) => (y === lR + 1 ? lite(shoe, 0.18) : dark(shoe, 0.1)))
  }
  // 몸통
  g.rect(6, 13, 13, 20, (x, y) => (x <= 7 ? cl : x >= 12 ? cs : y > 18 ? dark(c, 0.08) : c))
  g.rect(6, 20, 13, 20, (x) => dark(pants, x > 11 ? 0.3 : 0.1)) // 허리띠
  // 팔 (소매 + 손)
  const aL = walkL ? -1 : walkR ? 1 : 0
  const armL = (dy) => { g.rect(3, 14 + dy, 4, 17 + dy, (x) => (x === 3 ? cl : c)); g.rect(3, 18 + dy, 4, 19 + dy, skin); g.set(4, 19 + dy, dark(skin, 0.15)); g.set(5, 15 + dy, dark(c, 0.45)); g.set(5, 16 + dy, dark(c, 0.45)); g.set(5, 17 + dy, dark(c, 0.45)) }
  const armR = (dy) => { g.rect(15, 14 + dy, 16, 17 + dy, (x) => (x === 16 ? cs : dark(c, 0.06))); g.rect(15, 18 + dy, 16, 19 + dy, dark(skin, 0.1)); g.set(14, 15 + dy, dark(c, 0.45)); g.set(14, 16 + dy, dark(c, 0.45)); g.set(14, 17 + dy, dark(c, 0.45)) }
  if (typing) {
    // 앉아 타이핑: 팔꿈치를 옆구리에 두고 손은 가슴 앞 키보드 쪽으로
    const up1 = pose === 'type1' ? 0 : 1, up2 = pose === 'type1' ? 1 : 0
    g.rect(3, 14, 4, 18, (x) => (x === 3 ? cl : c)); g.rect(5, 17, 7, 18, dark(c, 0.06)); g.rect(5, 15, 5, 16, dark(c, 0.45))
    g.rect(6, 19 - up1, 8, 20 - up1, skin); g.set(8, 20 - up1, dark(skin, 0.12))
    g.rect(15, 14, 16, 18, (x) => (x === 16 ? cs : dark(c, 0.06))); g.rect(12, 17, 14, 18, dark(c, 0.1)); g.rect(14, 15, 14, 16, dark(c, 0.45))
    g.rect(11, 19 - up2, 13, 20 - up2, dark(skin, 0.08)); g.set(11, 20 - up2, dark(skin, 0.2))
  } else { armL(aL); armR(-aL) }
  // 옷 종류별 디테일
  if (topKind === 0) { g.rect(9, 13, 10, 13, dark(c, 0.25)); g.set(8, 13, dark(c, 0.15)); g.set(11, 13, dark(c, 0.15)) }
  if (topKind === 1) { g.rect(7, 13, 12, 13, dark(c, 0.22)); g.rect(8, 14, 11, 14, dark(c, 0.12)); g.set(9, 15, '#f4f4f8'); g.set(10, 15, '#f4f4f8'); g.rect(8, 18, 11, 18, dark(c, 0.22)) }
  if (topKind === 2) { g.rect(8, 13, 11, 13, '#f4f4f8'); g.set(7, 13, '#cfd0da'); g.set(12, 13, '#cfd0da'); g.rect(9, 14, 10, 14, '#b8323a'); g.rect(9, 15, 10, 18, (x, y) => (x === 10 ? '#8a2630' : '#b8323a')); g.rect(8, 14, 8, 14, '#cfd0da'); g.rect(11, 14, 11, 14, '#cfd0da') }
  if (topKind === 4) { g.rect(8, 13, 11, 19, '#f4f4f8'); g.rect(9, 14, 10, 17, '#cfd0da'); for (let y = 13; y <= 19; y++) { g.set(7, y, dark(c, 0.3)); g.set(12, y, dark(c, 0.3)) } g.rect(9, 14, 9, 17, '#b8323a') }
  if (topKind === 3) { g.rect(9, 13, 10, 19, '#f4f4f8'); g.rect(9, 13, 9, 19, '#e2e3ea'); g.set(8, 15, dark(c, 0.4)); g.set(11, 17, dark(c, 0.4)) }
}
function bodyBack(g, look, walkPose, crop) {
  const { c, C, pants, shoe, skin } = look
  const cl = lite(c, 0.15)
  if (!crop) {
    g.rect(6, 21, 13, 22, (x) => (x > 11 ? dark(pants, 0.2) : pants))
    const lL = walkPose === 'walk1' ? 26 : 27, lR = walkPose === 'walk2' ? 26 : 27
    g.rect(6, 23, 8, lL, pants); g.rect(11, 23, 13, lR, dark(pants, 0.2)); g.set(9, 23, dark(pants, 0.3)); g.set(10, 23, dark(pants, 0.3))
    g.rect(5, lL + 1, 8, lL + 2, shoe); g.rect(11, lR + 1, 14, lR + 2, dark(shoe, 0.1))
  }
  g.rect(6, 13, 13, 20, (x) => (x <= 7 ? cl : x >= 12 ? C : c)); g.rect(6, 20, 13, 20, dark(pants, 0.2))
  const a = walkPose === 'walk1' ? -1 : walkPose === 'walk2' ? 1 : 0
  g.rect(3, 14 + a, 4, 17 + a, (x) => (x === 3 ? cl : c)); g.rect(3, 18 + a, 4, 19 + a, skin); g.rect(5, 15 + a, 5, 17 + a, dark(c, 0.45))
  g.rect(15, 14 - a, 16, 17 - a, (x) => (x === 16 ? C : dark(c, 0.06))); g.rect(15, 18 - a, 16, 19 - a, dark(skin, 0.1)); g.rect(14, 15 - a, 14, 17 - a, dark(c, 0.45))
  g.rect(8, 13, 11, 13, dark(c, 0.2))
}
function bodySide(g, look, pose) {
  const { c, C, skin, pants, shoe } = look
  const cl = lite(c, 0.18)
  const sw = pose === 'walk1' ? 2 : pose === 'walk2' ? -2 : 0
  const ps = dark(pants, 0.22)
  // 뒤쪽 다리·팔 먼저
  g.rect(7 - sw, 23, 9 - sw, 27, ps); g.rect(6 - sw, 28, 10 - sw, 29, dark(shoe, 0.12))
  g.rect(7 + sw * 0, 21, 12, 22, pants)
  g.rect(8 + sw, 23, 10 + sw, 27, pants); g.rect(8 + sw, 28, 13 + sw, 29, shoe); g.rect(8 + sw, 28, 13 + sw, 28, lite(shoe, 0.18))
  g.rect(7, 13, 12, 20, (x) => (x <= 8 ? cl : x >= 11 ? C : c)); g.rect(7, 20, 12, 20, dark(pants, 0.15))
  // 앞팔 (몸 앞에서 스윙)
  const ax = 8 + (pose === 'walk1' ? 1 : pose === 'walk2' ? -1 : 0)
  g.rect(ax, 14, ax + 2, 17, c); g.rect(ax, 14, ax, 17, cl); g.rect(ax + 2, 14, ax + 2, 17, C); g.rect(ax, 18, ax + 2, 19, skin); g.set(ax + 2, 19, dark(skin, 0.15))
}

/** 낮잠: 엎드려 팔 위에 머리를 올린 모습 */
function nap(g, look) {
  const { c, C, skin, hair, hairLt } = look
  const cl = lite(c, 0.18)
  g.rect(4, 12, 15, 19, (x) => (x < 6 ? cl : x > 13 ? C : c))
  look = { ...look, face: 0, headItem: look.headItem === 1 ? 1 : look.headItem }
  head(g, { ...look, hairStyle: look.hairStyle === 1 || look.hairStyle === 3 ? 0 : look.hairStyle }, 'back', 3)
  // 팔 (소매) + 손
  g.rect(1, 15, 18, 20, (x, y) => (y >= 19 ? C : y === 15 ? cl : c))
  g.rect(0, 16, 1, 19, skin); g.rect(18, 16, 19, 19, dark(skin, 0.1)); g.set(1, 19, dark(skin, 0.15)); g.set(18, 19, dark(skin, 0.2))
  for (let x = 4; x <= 15; x += 4) g.set(x, 17, dark(c, 0.2)) // 팔짱 주름
}

export function drawNew(look, pose, facing = 'front') {
  const crop = pose === 'type1' || pose === 'type2' || pose === 'nap' || pose === 'sitback'
  const g = new G(W, crop ? 22 : H)
  if (pose === 'nap') { nap(g, look); g.outline(); return g }
  if (pose === 'sitback') pose = 'stand'
  if (facing === 'back') { bodyBack(g, look, pose, crop); head(g, look, 'back') }
  else if (facing === 'side') { bodySide(g, look, pose); head(g, look, 'side') }
  else {
    const bob = pose === 'walk1' || pose === 'walk2' ? 0 : 0
    bodyFront(g, look, pose, crop); head(g, look, 'front', bob)
  }
  if (!crop) { // 다리를 짧게 (2.4등신): 24·25행을 걷어 낸다
    for (const r of [25, 24]) { g.p.splice(r * g.w, g.w) }
    g.h -= 2
  }
  g.outline()
  return g
}
export function lookFrom(L, pal) {
  const { HAIR_COLORS, SKINS, TOP_COLORS, PANTS } = pal
  return { hair: HAIR_COLORS[L.hairColor][0], hairLt: HAIR_COLORS[L.hairColor][1], skin: SKINS[L.skin], c: TOP_COLORS[L.topColor][0], C: TOP_COLORS[L.topColor][1], top: TOP_COLORS[L.topColor][0], pants: PANTS[L.pants], shoe: '#3a3040', hairStyle: L.hairStyle, topKind: L.top, face: L.face, headItem: L.head }
}
