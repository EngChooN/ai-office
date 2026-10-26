// 1묶음 — 우선순위 '상' (파일럿 3종 제외) · 연출④-5. 분류표 docs/specs/furniture-motion-catalog.md, 규칙 furniture-motion-guide.md
// 원칙: B의 꺼짐 장·C의 대기 장·D의 꺼짐 장·A의 0번 장은 기존 그림과 같다 (붙여도 평소 모습이 바뀌지 않는다)
import type { Rot } from '../../src/shared/iso/furniture.ts'
import { C, flat, frac, frame, glowOf, halo, inRect, K, mix, noise, note, oneRow, patch, perRot, sparkle, visibleSides, type Draw, type MotionSheetDef, type Part, type Q } from './kit.mts'

const cx = (c: string | number[]) => (typeof c === 'string' ? c : `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`)
const hexOf = (a: string, b: string, t: number) => cx(mix(a, b, t))

// ── 스탠드 조명 (B + G) · prop-lamp 같은 그림 ─────────────────
// 꺼짐 = 기존, 켜는 순간 = 반쯤 밝음, 켜짐 = 갓이 환하고 둘레·바닥에 빛. 가만히 있는 빛이라 켜짐은 1장. 밤(G) = 켜짐 장
function lampFrames(r: Rot) {
  const lit = (t: number) => (parts: Part[]) => patch(parts, 2, { c: hexOf('#fbe9c8', '#ffe6a0', t), top: hexOf('#fff6e4', '#fffbe6', t) })
  const glow = (a: number) => (d: Draw) => {
    flat(d, d.cv, 0, 1, 0, 1, 0, (x, y) => {
      const dist = Math.hypot(x - 0.5, y - 0.5)
      return dist < 0.5 ? glowOf('#ffe7a8', Math.round(a * 0.8 * (1 - dist / 0.5))) : null
    }, true)
    halo(d, 0.5, 0.5, 34, 10, '#ffd77a', a, 'empty')
  }
  return [frame('floor-lamp', r), frame('floor-lamp', r, { parts: lit(0.5), draw: glow(40) }), frame('floor-lamp', r, { parts: lit(1), draw: glow(90) })]
}

// ── 주크박스 (B + C) ──────────────────────────────────
// 켜짐: 옆 네온관 줄무늬가 위로 흐르고, 레코드 창이 돌고, 스피커가 박자에 맞춰 밝아지고, 음표 두 개가 떠오른다 (네 방향 모두 보임)
const JUKE_HEAD = 16
function jukeS(f: number, on: boolean, boot = false) {
  return (q: Q) => {
    if (q.u < 0.12 || q.u > 0.88) {
      if (q.v <= 0.2) return K.walnut
      const s = frac(q.v * 6 - (on ? f * 0.25 : 0)) < 0.5
      return on || boot ? (s ? '#ffa970' : '#ffe68a') : s ? K.orange : K.yellow
    }
    if (inRect(q, 0.12, 0.88, 0.55, 0.85)) return boot ? K.skyL : frac(q.u * 8 + (on ? f * 0.25 : 0)) < 0.5 ? K.skyL : K.sky
    if (inRect(q, 0.2, 0.8, 0.1, 0.4)) return frac(q.v * 10) < 0.4 ? K.walnut : on && f % 2 === 0 ? '#f6d888' : K.gold
    return K.walnutT
  }
}
function jukeFrames(r: Rot) {
  const body = (f: number, on: boolean, boot = false) => (parts: Part[]) => patch(parts, 0, { S: jukeS(f, on, boot) })
  const out = [frame('jukebox', r, { head: JUKE_HEAD }), frame('jukebox', r, { head: JUKE_HEAD, parts: body(0, false, true) })]
  for (let f = 0; f < 4; f++)
    out.push(
      frame('jukebox', r, {
        head: JUKE_HEAD,
        parts: body(f, true),
        draw: (d) => {
          // 음표: 뚜껑 위에서 한 칸씩 오르며 옆으로 흔들린다 (반복이 이어지게 4장 주기)
          ;[
            { x: 0.3, k: 0, c: K.pink },
            { x: 0.7, k: 2, c: K.mint },
          ].forEach(({ x, k, c }) => {
            const t = (f + k) % 4
            const [px, py] = d.at(x, 0.5, 35 + Math.round(t * 2.5))
            note(d.layer, px + (t % 2 ? 1 : 0), py, c, k > 0)
          })
          if (d.front) halo(d, 0.5, 0.78, 14, 8, '#ffcf8a', 26, 'empty')
        },
      }),
    )
  return out
}

// ── 네온사인 (A + B + G) ──────────────────────────────
// 꺼짐 = 기존(분홍 관). 켜짐 = 관이 흰빛 분홍으로 밝아지고 판에 번짐, 가끔 막대가 한 번 깜빡. 뒷면 방향은 꺼짐 1장
function neonS(level: number, f: number) {
  return (q: Q) => {
    const ring = Math.abs(Math.hypot(q.u - 0.5, (q.v - 0.5) * 0.8) - 0.3)
    const bar = Math.abs(q.u - 0.5) < 0.04 && q.v > 0.3 && q.v < 0.7
    const barDim = f === 2
    const tube = ring < 0.04 || bar
    if (tube) {
      if (level === 0 || (bar && barDim)) return K.pink
      return level === 1 ? hexOf(K.pink, '#ffffff', 0.25) : hexOf(K.pink, '#ffffff', 0.55)
    }
    if (level === 2) {
      const near = Math.min(ring, bar ? 0 : Math.hypot(Math.max(0, Math.abs(q.u - 0.5) - 0.04), Math.max(0, Math.abs(q.v - 0.5) - 0.2)) * (barDim ? 9 : 1))
      if (near < (f === 1 ? 0.08 : 0.1)) return hexOf(K.dark, K.pink, 0.4)
    }
    return K.dark
  }
}
function neonFrames(r: Rot) {
  const fr = (level: number, f: number) =>
    frame('neon-sign', r, {
      parts: (p) => patch(p, 2, { S: neonS(level, f) }),
      draw: level === 2 && visibleSides(r).py ? (d) => halo(d, 0.5, 0.54, 17, 13, '#ff8fc0', f === 1 ? 30 : 42, 'empty') : undefined,
    })
  if (!visibleSides(r).py) return [frame('neon-sign', r)]
  return [frame('neon-sign', r), fr(1, 0), ...[0, 1, 2, 3].map((f) => fr(2, f))]
}

// ── 러닝머신 (C) ────────────────────────────────────
// 쓰는 동안 벨트 줄이 뒤로(+y) 흐르고, 계기판에 초록 점이 오간다
function treadFrames(r: Rot) {
  const out = [frame('treadmill', r)]
  for (let f = 0; f < 4; f++)
    out.push(
      frame('treadmill', r, {
        parts: (p) =>
          patch(patch(p, 0, { top: (q: Q) => (q.u < 0.14 || q.u > 0.86 || q.v > 0.96 ? K.steel : frac(q.v * 10 - f * 0.25) < 0.12 ? K.metal : K.dark) }), 3, {
            top: (q: Q) => (inRect(q, 0.25, 0.75, 0.2, 0.8) ? (Math.abs(q.u - (0.34 + [0, 1, 2, 1][f] * 0.16)) < 0.07 && Math.abs(q.v - 0.5) < 0.18 ? K.green : K.screen) : K.metal),
          }),
      }),
    )
  return out
}

// ── 수족관 (A + B) · prop-aquarium 같은 그림 ────────────────
// 꺼짐(늘 움직임): 기존 물빛에서 물고기가 좌우로 오가고 위아래로 살짝. 켜짐: 물이 밝아지고 물결 빛이 흐르고 기포가 오른다
const FISH = [0, 1, 2, 1]
function tankS(f: number, on: boolean) {
  return (q: Q) => {
    if (q.u < 0.02 || q.u > 0.98) return K.navy
    if (q.v < 0.12) return frac(q.u * 20) < 0.5 ? '#e8d6a8' : '#d8c08a'
    if (q.v < 0.35 && frac(q.u * 3) < 0.08) return K.leaf[1]
    for (let k = 0; k < 7; k++) {
      if (noise(k, 9) <= 0.4) continue
      const dir = k % 2 ? 1 : -1
      const u = q.u - dir * FISH[f] * 0.03
      const v0 = 0.4 + noise(k, 5) * 0.45 + dir * [0, 0.03, 0, -0.03][f]
      if (u >= k / 7 && u < (k + 0.4) / 7 && Math.abs(q.v - v0) < 0.06) return [K.orange, K.yellow, K.pink][k % 3]
    }
    if (on) {
      for (const [uc, ph] of [[0.17, 0], [0.56, 0.5], [0.89, 0.25]])
        for (const off of [0, 0.5]) {
          const vb = 0.18 + frac(f * 0.25 + ph + off) * 0.74
          if (Math.abs(q.u - uc - Math.sin(vb * 12) * 0.006) < 0.011 && Math.abs(q.v - vb) < 0.035) return K.skyL
        }
      return frac((q.u + q.v) * 4 - f * 0.25) < 0.08 ? K.skyL : '#acdff5'
    }
    return frac((q.u + q.v) * 4) < 0.06 ? K.skyL : '#8fd0ee'
  }
}
function aquaFrames(r: Rot) {
  const fr = (f: number, on: boolean) => frame('aquarium', r, { parts: (p) => patch(p, 1, { S: tankS(f, on), ...(on ? { top: '#d8f2fb', E: '#acdff5', c: '#b8e6f7' } : {}) }) })
  // 0~3 꺼짐 반복, 4 켜는 순간(밝은 물, 물고기 그대로), 5~8 켜짐 반복
  return [...[0, 1, 2, 3].map((f) => fr(f, false)), frame('aquarium', r, { parts: (p) => patch(p, 1, { S: tankS(0, true), top: K.skyL, E: '#c4ebf9', c: '#c4ebf9' }) }), ...[0, 1, 2, 3].map((f) => fr(f, true))]
}

// ── 우주선 모형 (A + F) ───────────────────────────────
// 늘: 받침 위 분사구에 작은 불꽃이 일렁. 행사(F): 몸체가 살짝 떠오르며 큰 불꽃과 연기
const ROCKET_HEAD = 6
function flame(d: Draw, z: number, hs: number[]) {
  const s = visibleSides(d.r)
  const spots: [number, number][] = []
  for (const t of [0.42, 0.5, 0.58]) {
    if (s.py) spots.push([t, 0.64])
    if (s.px) spots.push([0.64, t])
  }
  spots.forEach(([x, y], i) => {
    const h = hs[i % hs.length]
    const [px, py] = d.at(x, y, z)
    for (let k = 0; k < h; k++) d.layer.set(px, py - k, C(k === 0 ? '#fff2b0' : k < h - 1 ? K.yellow : K.orange))
  })
}
function rocketFrames(r: Rot) {
  const HS = [
    [1, 2, 1],
    [2, 1, 2],
    [1, 1, 2],
    [2, 2, 1],
  ]
  const loop = HS.map((hs, f) => frame('rocket', r, { head: ROCKET_HEAD, draw: f === 0 ? undefined : (d) => flame(d, 3, hs) }))
  const lift = (dz: number) => (parts: Part[]) => parts.map((p, i) => (i === 0 ? p : { ...p, z: p.z + dz }))
  const party = [2, 5, 3].map((dz, k) =>
    frame('rocket', r, {
      // 몸체를 올린 만큼 위 여백을 줄여 칸 높이·기준점을 다른 장과 맞춘다
      head: ROCKET_HEAD - dz,
      parts: lift(dz),
      draw: (d) => {
        // 몸체 아래 큰 불꽃 + 받침 둘레 연기
        const [px, py] = d.at(0.5, 0.5, 3)
        for (let i = -1; i <= 1; i++) for (let z = 0; z < dz + 1; z++) d.layer.set(px + i, py - z, C(z < 1 ? '#fff2b0' : i === 0 ? K.yellow : K.orange))
        for (const [x, y] of [[0.16, 0.5], [0.5, 0.84], [0.84, 0.5], [0.5, 0.16]] as const) {
          const [sx, sy] = d.at(x, y, 4 + k)
          for (const [ox, oy] of [[0, 0], [1, 0], [0, -1], [k > 0 ? -1 : 1, 0]]) d.layer.set(sx + ox, sy + oy, C(k === 1 ? '#f6f8fb' : '#dfe3ea'))
        }
      },
    }),
  )
  // 0번 = 기존 그림 (불꽃 없음): 0~3 반복, 4~6 행사
  return [loop[0], ...loop.slice(1), ...party]
}

// ── 크리스마스 트리 (A + G + F) ─────────────────────────
// 낮(A): 장식 구슬 색이 번갈아 반짝. 밤(G): 네 면에 전구 줄이 켜지고 별이 빛남. 행사(F): 전구가 한꺼번에 하얗게 번쩍
const LIGHTS = [K.yellow, K.red, K.skyL, K.pink]
function treeTier(i: number, c: string, f: number, mode: 'day' | 'night' | 'party') {
  return (q: Q) => {
    if (mode !== 'day' && frac(q.u * 5 + i * 0.3) < 0.22 && Math.abs(q.v - 0.45) < 0.14) return mode === 'party' ? (f % 2 ? '#ffffff' : '#fff2b0') : LIGHTS[(Math.floor(q.u * 5 + i * 0.3) + f + i) % 4]
    if (noise(Math.floor(q.u * 6), i) > 0.7 && q.v > 0.4 && q.v < 0.6) {
      const u6 = Math.floor(q.u * 6)
      if (mode === 'day' && (u6 + i + f) % 4 === 0 && f > 0) return '#ffffff'
      return [K.red, K.yellow, K.skyL][(i + f * (1 + (u6 % 2))) % 3]
    }
    return c
  }
}
function treeFrames(r: Rot) {
  const fr = (f: number, mode: 'day' | 'night' | 'party') =>
    frame('xmas-tree', r, {
      parts:
        mode === 'day' && f === 0
          ? undefined
          : (parts) =>
              parts.map((p, k) => {
                if (k === 0) return p
                const i = k - 1
                const paint = treeTier(i, p.c as string, f, mode)
                return mode === 'day' ? { ...p, S: paint } : { ...p, S: paint, E: paint, N: paint, W: paint }
              }),
      draw:
        mode === 'day'
          ? f % 2
            ? (d) => sparkle(d.cv, ...d.at(0.5, 0.5, 40), K.yellow)
            : undefined
          : (d) => {
              halo(d, 0.5, 0.5, 20, mode === 'party' ? 16 : 13, '#ffe7a8', mode === 'party' ? 60 : 28 + (f % 2) * 8, 'empty')
              sparkle(d.cv, ...d.at(0.5, 0.5, 40), K.yellow, mode === 'party' || f % 2 === 0)
            },
    })
  return [...[0, 1, 2, 3].map((f) => fr(f, 'day')), ...[0, 1, 2, 3].map((f) => fr(f, 'night')), ...[0, 1, 0].map((f) => fr(f, 'party'))]
}

// ── 프로젝터 (B + F) ─────────────────────────────────
// 켜짐: 렌즈가 하얗게 빛나고 앞(+y)으로 반투명 빛줄기, 빛 속 먼지가 흘러간다. 앞이 안 보이는 방향은 빛줄기를 가구 뒤에 그린다
function lensS(level: number) {
  return (q: Q) => {
    const d = Math.hypot((q.u - 0.3) * 2.2, q.v - 0.5)
    if (d >= 0.32) return K.white
    if (level === 0) return K.navy
    return d < 0.18 ? '#ffffff' : level === 2 ? K.skyL : K.sky
  }
}
function beam(d: Draw, alpha: number, f: number, len = 0.72) {
  const lx = 0.28 + 0.3 * 0.44
  const ly = 0.7
  const lz = 14.5
  const pts = new Map<string, number>()
  for (let t = 0; t <= len; t += 0.012)
    for (let s = -1; s <= 1; s += 0.04)
      for (let h = -1; h <= 1; h += 0.08) {
        const w = 0.03 + t * 0.26
        const hh = 1 + t * 9
        const [px, py] = d.at(lx + s * w, ly + t, lz + h * hh)
        const k = `${px},${py}`
        // 가장자리(옆·위아래 끝)는 따로 표시해 조금 더 밝게 — 밝은 바닥에서도 빛줄기 윤곽이 보이게
        const edge = Math.abs(s) > 0.94 || Math.abs(h) > 0.9 ? -1 : 1
        pts.set(k, Math.min(pts.get(k) ?? 9, (edge * t) / len))
      }
  for (const [k, v] of pts) {
    const [px, py] = k.split(',').map(Number)
    const t = Math.abs(v)
    d.cv.set(px, py, glowOf(v < 0 ? '#ffffff' : '#c8eeff', Math.round(alpha * (v < 0 ? 1.5 : 1) * (1 - t) ** 1.5)))
  }
  if (f >= 0)
    for (const [ox, oz] of [[-0.06, 2], [0.07, -3], [0.0, 5]] as const) {
      const t = frac(f * 0.25 + (ox + 0.1) * 3) * len
      const [px, py] = d.at(lx + ox * (1 + t * 4), ly + t, lz + oz * t * 1.5)
      d.cv.set(px, py, glowOf('#ffffff', 190))
    }
}
function projFrames(r: Rot) {
  const front = visibleSides(r).py
  const fr = (level: number, alpha: number, f: number) =>
    frame('lv-projector', r, {
      parts: (p) => patch(p, 5, { S: lensS(level) }),
      ...(alpha > 0 ? { [front ? 'draw' : 'under']: (d: Draw) => {
        beam(d, alpha, f, level === 1 ? 0.3 : 0.72)
        if (front) halo(d, 0.412, 0.72, 14.5, 3, '#ffffff', 140)
      } } : {}),
    })
  return [frame('lv-projector', r), fr(1, 50, -1), ...[0, 1, 2, 3].map((f) => fr(2, [110, 120, 104, 116][f], f))]
}

// ── 복합기 (D) ─────────────────────────────────────
// 일하는 중: 앞 출력구에서 종이가 조금씩 밀려 나오고 위 패널 불이 초록·파랑으로 깜빡. 끝남: 종이가 다 나오며 반짝 (250ms)
function paper(d: Draw, ext: number, lift = 0) {
  if (!d.front || ext <= 0) return
  flat(d, d.layer, 0.3, 0.7, 0.82, 0.82 + ext, (_x, y) => 15 - (y - 0.82) * 10 + lift, (x, y) => (Math.abs(y - 0.82 - ext * 0.5) < 0.02 && x > 0.38 && x < 0.62 ? C('#c9d2de') : C(K.paper)))
}
function printerFrames(r: Rot) {
  const panel = (c: string) => (p: Part[]) => patch(p, 3, { c })
  const work = [0.08, 0.14, 0.2, 0.26].map((ext, f) => frame('prop-printer', r, { parts: panel(f % 2 ? K.green : K.blue), draw: (d) => paper(d, ext) }))
  const done = [0, 1, 2].map((k) =>
    frame('prop-printer', r, {
      parts: panel(K.green),
      draw: (d) => {
        paper(d, 0.3, k === 1 ? 1 : 0)
        const [px, py] = d.at(0.5, 0.5, 23 + k)
        sparkle(d.cv, px + (k === 2 ? 3 : 0), py, K.yellow, k === 1)
      },
    }),
  )
  return [frame('prop-printer', r), ...work, ...done]
}

const LOOP_MS = 500
export const BUNDLE1: MotionSheetDef[] = [
  {
    id: 'floor-lamp',
    kind: 'B+G',
    ...oneRow(lampFrames),
    clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2] }, day: { frames: [0] }, night: { frames: [2] } },
    still: { off: 0, on: 2, day: 0, night: 2 },
    shares: ['prop-lamp'],
    note: '가운데 대칭이라 행 1개. 켜짐은 가만한 빛이라 1장 (가이드의 켜짐 반복 4~6장 대신)',
  },
  {
    id: 'jukebox',
    kind: 'B+C',
    ...perRot(jukeFrames),
    clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2, 3, 4, 5], ms: LOOP_MS }, idle: { frames: [0] }, use: { frames: [2, 3, 4, 5], ms: LOOP_MS } },
    still: { off: 0, on: 2, idle: 0, use: 2 },
    note: '음표가 뚜껑 위로 올라가서 칸 위쪽을 16 아트 px 더 비웠다 (가로·기준점 규칙은 같음)',
  },
  {
    id: 'neon-sign',
    kind: 'A+B+G',
    ...perRot(neonFrames),
    clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2, 3, 4, 5], ms: LOOP_MS }, loop: { frames: [2, 3, 4, 5], ms: LOOP_MS }, day: { frames: [0] }, night: { frames: [2, 3, 4, 5], ms: LOOP_MS } },
    still: { off: 0, on: 2, loop: 2, day: 0, night: 2 },
    note: '뒷면 방향(r1·r2)은 관이 안 보여 0번 한 장',
  },
  {
    id: 'treadmill',
    kind: 'C',
    ...perRot(treadFrames),
    clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } },
    still: { idle: 0, use: 1 },
  },
  {
    id: 'aquarium',
    kind: 'A+B',
    ...perRot(aquaFrames),
    clips: { off: { frames: [0, 1, 2, 3], ms: LOOP_MS }, turnOn: { frames: [4], ms: 200 }, on: { frames: [5, 6, 7, 8], ms: LOOP_MS }, loop: { frames: [0, 1, 2, 3], ms: LOOP_MS } },
    still: { off: 0, on: 5, loop: 0 },
    shares: ['prop-aquarium'],
    note: '꺼짐도 물고기가 움직인다 (A). 물고기는 앞면이 보이는 방향에서만 보인다',
  },
  {
    id: 'rocket',
    kind: 'A+F',
    ...perRot(rocketFrames),
    clips: { loop: { frames: [0, 1, 2, 3], ms: LOOP_MS }, party: { frames: [4, 5, 6], ms: 80 } },
    still: 0,
    note: '행사 때 몸체가 떠올라 칸 위쪽을 6 아트 px 더 비웠다',
  },
  {
    id: 'xmas-tree',
    kind: 'A+G+F',
    ...perRot(treeFrames),
    clips: { day: { frames: [0, 1, 2, 3], ms: LOOP_MS }, night: { frames: [4, 5, 6, 7], ms: LOOP_MS }, loop: { frames: [0, 1, 2, 3], ms: LOOP_MS }, party: { frames: [8, 9, 10], ms: 80 } },
    still: { day: 0, night: 4, loop: 0 },
  },
  {
    id: 'lv-projector',
    kind: 'B+F',
    ...perRot(projFrames),
    clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2, 3, 4, 5], ms: LOOP_MS } },
    still: { off: 0, on: 2 },
    note: '빛줄기는 앞(+y)으로. 앞이 안 보이는 방향(r1·r2)은 가구 뒤에 그린다',
  },
  {
    id: 'prop-printer',
    kind: 'D',
    ...perRot(printerFrames),
    clips: { off: { frames: [0] }, work: { frames: [1, 2, 3, 4], ms: LOOP_MS }, done: { frames: [5, 6, 7], ms: 83 } },
    still: { off: 0, work: 1 },
    note: '종이는 앞면이 보이는 방향(r0·r3)에서만 보인다',
  },
]
