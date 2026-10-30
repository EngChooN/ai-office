// 아이콘 1단계(추출, 한 번만): 후보 그림에서 도트 사무실만 떼어 칸당 1px 작은 PNG(art-grid.png)로 만든다.
// 결과는 사람이 눈으로 확인한 뒤 커밋하고, 2단계(node scripts/icon.mjs final)는 이 파일만 원본으로 쓴다.
// 사용: node scripts/icon-extract.mjs <후보 PNG> <출력 art-grid.png>
import fs from 'node:fs'
import { decodePng, encodePng } from './icon-png.mjs'

const [, , srcFile, outFile] = process.argv
if (!srcFile || !outFile) throw new Error('사용: node scripts/icon-extract.mjs <후보 PNG> <출력 art-grid.png>')
const { w, h, rgba } = decodePng(fs.readFileSync(srcFile))
const at = (x, y) => (y * w + x) * 4
const lum = (i) => rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11

// ── 1. 타일 범위: 보라 타일(파랑이 빨강보다 뚜렷이 큰 불투명 픽셀)의 경계 상자 ──
let tx0 = w, ty0 = h, tx1 = 0, ty1 = 0
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const i = at(x, y)
    if (rgba[i + 3] > 200 && rgba[i + 2] - rgba[i] > 30 && rgba[i + 2] > 150) {
      tx0 = Math.min(tx0, x); ty0 = Math.min(ty0, y); tx1 = Math.max(tx1, x); ty1 = Math.max(ty1, y)
    }
  }
// 흐린 타일 테두리를 피해 안쪽으로 들어간 사각형 안에서만 본다
const INSET = 20
const bx0 = tx0 + INSET, by0 = ty0 + INSET, bx1 = tx1 - INSET, by1 = ty1 - INSET

// ── 2. 외곽선 바깥 채우기: 어두운 외곽선(1px 팽창)을 벽으로 두고 사각형 가장자리에서 채운 곳이 "바깥" ──
const DARK = 90
const line = new Uint8Array(w * h)
for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (lum(at(x, y)) < DARK) line[y * w + x] = 1
const wall = new Uint8Array(w * h)
for (let y = by0; y <= by1; y++)
  for (let x = bx0; x <= bx1; x++) {
    if (!line[y * w + x]) continue
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) wall[(y + j) * w + x + i] = 1
  }
const outside = new Uint8Array(w * h)
const stack = []
const push = (x, y) => {
  if (x < bx0 || y < by0 || x > bx1 || y > by1) return
  const k = y * w + x
  if (outside[k] || wall[k]) return
  outside[k] = 1
  stack.push(k)
}
for (let x = bx0; x <= bx1; x++) { push(x, by0); push(x, by1) }
for (let y = by0; y <= by1; y++) { push(bx0, y); push(bx1, y) }
while (stack.length) {
  const k = stack.pop()
  const x = k % w, y = (k - x) / w
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
}
const isArt = (x, y) => x >= bx0 && y >= by0 && x <= bx1 && y <= by1 && !outside[y * w + x]

// ── 3. 격자: AI 그림이라 칸 간격이 조금씩 다르다. 칸 경계를 한 줄씩 찾는다 ──
// 경계 = 이웃 픽셀 색 차이가 큰 세로·가로 줄. 간격이 [MIN_CELL, MAX_CELL] 안인 경계 열을
// "경계 세기 − 평균"의 합이 가장 크도록 동적 계획법으로 고른다.
const MIN_CELL = 13, MAX_CELL = 18
const ex = new Float64Array(w), ey = new Float64Array(h)
const diff = (a, b) => Math.abs(rgba[a] - rgba[b]) + Math.abs(rgba[a + 1] - rgba[b + 1]) + Math.abs(rgba[a + 2] - rgba[b + 2])
for (let y = by0 + 1; y <= by1; y++)
  for (let x = bx0 + 1; x <= bx1; x++) {
    ex[x] += diff(at(x, y), at(x - 1, y))
    ey[y] += diff(at(x, y), at(x, y - 1))
  }
function cuts(e, lo, hi) {
  let mean = 0
  for (let v = lo; v <= hi; v++) mean += e[v]
  mean /= hi - lo + 1
  const best = new Float64Array(hi + 1).fill(-Infinity), from = new Int32Array(hi + 1).fill(-1)
  for (let v = lo; v < lo + MAX_CELL; v++) best[v] = e[v] - mean
  for (let v = lo; v <= hi; v++)
    for (let s = MIN_CELL; s <= MAX_CELL && v - s >= lo; s++)
      if (best[v - s] + e[v] - mean > best[v]) { best[v] = best[v - s] + e[v] - mean; from[v] = v - s }
  let end = hi
  for (let v = hi - MAX_CELL; v <= hi; v++) if (best[v] > best[end]) end = v
  const list = []
  for (let v = end; v >= 0; v = from[v]) list.unshift(v)
  return list
}
const xs = cuts(ex, bx0, bx1), ys = cuts(ey, by0, by1)
const avg = (l) => ((l.at(-1) - l[0]) / (l.length - 1)).toFixed(2)
console.log(`칸 ${xs.length - 1}×${ys.length - 1}, 평균 크기 ${avg(xs)}×${avg(ys)}px`)

// ── 4. 칸마다 가운데 픽셀의 대표색(중앙값)을 뽑는다. 그림이 절반 넘게 차지한 칸만 그림 ──
const cols = xs.length - 1, rows = ys.length - 1
const cells = []
for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++) {
    const vals = [[], [], []]
    let art = 0, all = 0
    const [x0, x1, y0, y1] = [xs[c], xs[c + 1], ys[r], ys[r + 1]]
    for (let y = Math.round(y0 + (y1 - y0) * 0.25); y < Math.round(y0 + (y1 - y0) * 0.75); y++)
      for (let x = Math.round(x0 + (x1 - x0) * 0.25); x < Math.round(x0 + (x1 - x0) * 0.75); x++) {
        all++
        if (!isArt(x, y)) continue
        art++
        const i = at(x, y)
        for (let k = 0; k < 3; k++) vals[k].push(rgba[i + k])
      }
    if (art * 2 <= all) { cells.push(null); continue }
    cells.push(vals.map((v) => v.sort((a, b) => a - b)[v.length >> 1]))
  }

// ── 5. 색 줄이기: k-평균(밝기 차를 더 무겁게)으로 PALETTE_N색 ──
const PALETTE_N = 18
const dist = (a, b) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2
const pts = cells.filter(Boolean)
let cent = []
// 시작점: 서로 가장 먼 색부터 차례로 고른다 (결정적)
cent.push(pts.reduce((m, p) => (p[0] + p[1] + p[2] < m[0] + m[1] + m[2] ? p : m)))
while (cent.length < PALETTE_N) cent.push(pts.reduce((m, p) => (Math.min(...cent.map((c) => dist(c, p))) > Math.min(...cent.map((c) => dist(c, m))) ? p : m)))
const nearest = (p) => cent.reduce((bi, c, i) => (dist(c, p) < dist(cent[bi], p) ? i : bi), 0)
for (let it = 0; it < 30; it++) {
  const sum = cent.map(() => [0, 0, 0, 0])
  for (const p of pts) {
    const s = sum[nearest(p)]
    s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++
  }
  cent = cent.map((c, i) => (sum[i][3] ? sum[i].slice(0, 3).map((v) => Math.round(v / sum[i][3])) : c))
}
let idx = cells.map((p) => (p ? nearest(p) : -1))

// ── 6. 정리: 사방이 같은 색인 외톨이 칸은 주변 색으로(어두운 칸=눈·외곽선은 그대로), 가장 큰 덩어리만 남긴다 ──
const darkest = cent.reduce((bi, c, i) => (c[0] + c[1] + c[2] < cent[bi][0] + cent[bi][1] + cent[bi][2] ? i : bi), 0)
const get = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? -1 : idx[r * cols + c])
idx = idx.map((v, k) => {
  const c = k % cols, r = (k - c) / cols
  const n = [get(c + 1, r), get(c - 1, r), get(c, r + 1), get(c, r - 1)]
  return v >= 0 && v !== darkest && n.every((x) => x === n[0]) && n[0] >= 0 && n[0] !== v ? n[0] : v
})
// 타일 색이 섞여 들어온 칸: 빈 칸과 맞닿아 있고 외곽선에만 붙은(그림 안쪽 색과 이어지지 않은) 칸은 지운다
idx = idx.map((v, k) => {
  const c = k % cols, r = (k - c) / cols
  const n = [get(c + 1, r), get(c - 1, r), get(c, r + 1), get(c, r - 1)]
  return v >= 0 && v !== darkest && n.includes(-1) && n.every((x) => x === -1 || x === darkest) ? -1 : v
})
const comp = new Int32Array(idx.length).fill(-1)
let biggest = -1, biggestSize = 0
for (let s = 0; s < idx.length; s++) {
  if (idx[s] < 0 || comp[s] >= 0) continue
  const q = [s]
  comp[s] = s
  let size = 0
  while (q.length) {
    const k = q.pop()
    size++
    const c = k % cols, r = (k - c) / cols
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const nk = nr * cols + nc
      if (idx[nk] >= 0 && comp[nk] < 0) { comp[nk] = s; q.push(nk) }
    }
  }
  if (size > biggestSize) { biggestSize = size; biggest = s }
}
idx = idx.map((v, k) => (comp[k] === biggest ? v : -1))

// ── 7. 손질: 자동 규칙으로 못 잡은 칸 (잘라 낸 뒤 좌표, 열·행). 후보 그림이 바뀌면 다시 본다 ──
const PATCH = [
  [7, 12, 'outline'], // 왼쪽 벽 위 외곽선에 끼어든 남색
  [49, 13, 'outline'], // 오른쪽 벽 위 외곽선에 끼어든 바닥색
]

// ── 8. 빈 테두리를 잘라 저장 ──
let c0 = cols, r0 = rows, c1 = 0, r1 = 0
idx.forEach((v, k) => {
  if (v < 0) return
  const c = k % cols, r = (k - c) / cols
  c0 = Math.min(c0, c); r0 = Math.min(r0, r); c1 = Math.max(c1, c); r1 = Math.max(r1, r)
})
const gw = c1 - c0 + 1, gh = r1 - r0 + 1
const out = Buffer.alloc(gw * gh * 4)
for (let r = 0; r < gh; r++)
  for (let c = 0; c < gw; c++) {
    const v = idx[(r + r0) * cols + c + c0]
    if (v < 0) continue
    const o = (r * gw + c) * 4
    out[o] = cent[v][0]; out[o + 1] = cent[v][1]; out[o + 2] = cent[v][2]; out[o + 3] = 255
  }
for (const [c, r, role] of PATCH) {
  const o = (r * gw + c) * 4
  const col = { outline: cent[darkest] }[role]
  out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255
}
fs.writeFileSync(outFile, encodePng(gw, gh, out))
const used = new Set(idx.filter((v) => v >= 0))
console.log(`저장 ${outFile}: ${gw}×${gh}칸, 그림 칸 ${biggestSize}개, ${used.size}색`)
console.log('팔레트', [...used].map((v) => '#' + cent[v].map((x) => x.toString(16).padStart(2, '0')).join('')).join(' '))
