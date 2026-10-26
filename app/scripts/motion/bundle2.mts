// 2묶음 — 우선순위 '중' 상점 가구 (연출④-5). 분류표 docs/specs/furniture-motion-catalog.md, 규칙 furniture-motion-guide.md
// 원칙(1묶음과 같음): 대기·꺼짐·0번 장 = 기존 그림. 고양이·강아지(펫)는 장면이 따로 그리는 캐릭터라 여기서 빼고 따로 보고한다
import type { Rot } from '../../src/shared/iso/furniture.ts'
import { ball, C, cube, frac, frame, glowOf, halo, inRect, K, line, mix, noise, note, oneRow, patch, perRot, sparkle, visibleSides, type After, type Draw, type MotionSheetDef, type Part, type Q } from './kit.mts'

const hexOf = (a: string, b: string, t: number) => `#${mix(a, b, t).slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`
const LOOP = 500
const F4 = [0, 1, 2, 3]
/** 앞면 그림만 바뀌는 소품: 뒷면 방향(r1·r2)은 0번 한 장 */
const frontOnly = (r: Rot, make: () => { cv: import('../../src/renderer/map/iso/isoArt.ts').Cv; o: [number, number] }[], id: string) => (visibleSides(r).py ? make() : [frame(id, r)])

/** 행사(F) 반짝임 3장: 꼭대기 둘레에 별이 돌아가며 뜨고 금빛이 번진다 */
function partyDraw(top: number, spots: [number, number][], k: number, glow = '#ffe7a8') {
  return (d: Draw) => {
    halo(d, 0.5, 0.5, top * 0.6, 10 + k * 2, glow, 34, 'empty')
    spots.forEach(([x, y], i) => {
      if ((i + k) % 3 === 2) return
      const [px, py] = d.at(x, y, top + ((i + k) % 2) * 3)
      sparkle(d.cv, px, py, K.yellow, (i + k) % 3 === 0)
    })
  }
}

// ── 어항 (A + C): 금붕어가 어항 안을 오가고 기포가 오른다. 밥 줄 때(C) 물 위에 먹이가 떠 있고 금붕어가 위로 몰린다 ──
function fishbowlFrames(r: Rot) {
  const bowl = (fx: number, fy: number, bub: number, food: boolean) => (a: After) =>
    ball(a, 0.5, 0.5, 18, 6, K.sky, (dx, dy) => {
      if (dy < -0.55) return food && Math.abs(dy + 0.6) < 0.12 && frac(dx * 3 + 0.2) < 0.4 ? '#c98a4a' : null
      if (Math.abs(dx - fx) < 0.25 && Math.abs(dy - fy) < 0.15) return K.orange
      if (Math.abs(dx - fx + Math.sign(fx || 1) * 0.32) < 0.08 && Math.abs(dy - fy) < 0.1) return '#f6a070'
      if (bub >= 0 && Math.abs(dx + 0.3) < 0.1 && Math.abs(dy - bub) < 0.1) return K.skyL
      return dy > 0.6 ? '#e8d6a8' : null
    })
  const idle = [frame('fishbowl', r), ...[[0.25, 0.05, 0.2], [0.1, 0.15, -0.1], [-0.15, 0.1, -0.4]].map(([fx, fy, bb]) => frame('fishbowl', r, { after: bowl(fx, fy, bb, false) }))]
  const use = [[0.1, -0.3], [0.2, -0.4], [0, -0.35], [-0.1, -0.4]].map(([fx, fy]) => frame('fishbowl', r, { after: bowl(fx, fy, -1, true) }))
  return [...idle, ...use]
}

// ── 라바 램프 (A + B): 덩어리가 오르내린다(늘). 켜면 색이 밝아지고 둘레가 은은하게 빛난다 ──
function lavaFrames(r: Rot) {
  const body = (f: number, on: boolean) => (p: Part[]) =>
    patch(p, 1, {
      c: on ? '#b59cf0' : K.purple,
      S: (q: Q) => (Math.hypot(q.u - 0.5, frac(q.v * 2 - f * 0.25) - 0.5) < 0.3 ? (on ? '#ffa26a' : K.orange) : on ? '#b59cf0' : K.purple),
      E: (q: Q) => (Math.hypot(q.u - 0.3, frac(q.v * 2 + 0.4 + f * 0.25) - 0.5) < 0.3 ? (on ? '#ffa26a' : K.orange) : on ? '#b59cf0' : K.purple),
    })
  const glow = (d: Draw) => halo(d, 0.5, 0.5, 10, 9, '#c9a8ff', 40, 'empty')
  return [...F4.map((f) => (f === 0 ? frame('lava-lamp', r) : frame('lava-lamp', r, { parts: body(f, false) }))), frame('lava-lamp', r, { parts: body(0, true), draw: (d) => halo(d, 0.5, 0.5, 10, 7, '#c9a8ff', 24, 'empty') }), ...F4.map((f) => frame('lava-lamp', r, { parts: body(f, true), draw: glow }))]
}

// ── 이동식 화이트보드 (D + F): 일하는 중 초록 글씨 한 줄이 써지고 마커가 따라간다. 끝남·행사: 노란 메모가 붙으며 반짝 ──
function boardS(f: number, note?: number) {
  return (q: Q) => {
    if (q.u < 0.03 || q.u > 0.97 || q.v < 0.06 || q.v > 0.94) return K.metalL
    if (note !== undefined && inRect(q, 0.72, 0.9, 0.5 + note * 0.03, 0.78 + note * 0.03)) return q.v > 0.72 + note * 0.03 ? '#f6d86a' : '#ffe98a'
    if (f >= 0 && frac(q.v * 7) < 0.3 && Math.floor(q.v * 7) === 0 && q.u > 0.1 && q.u < 0.12 + f * 0.13) return K.green
    if (f >= 0 && Math.floor(q.v * 7) === 0 && Math.abs(q.u - (0.14 + f * 0.13)) < 0.025 && frac(q.v * 7) < 0.6) return K.dark
    const row = Math.floor(q.v * 7)
    if (frac(q.v * 7) < 0.3 && q.u > 0.1 && q.u < 0.25 + noise(row, 3) * 0.6) return row % 3 ? K.blue : K.red
    return K.paper
  }
}
function boardFrames(r: Rot) {
  return frontOnly(
    r,
    () => [
      frame('whiteboard', r),
      ...F4.map((f) => frame('whiteboard', r, { parts: (p) => patch(p, 4, { S: boardS(f) }) })),
      ...[0, 1, 2].map((k) => frame('whiteboard', r, { parts: (p) => patch(p, 4, { S: boardS(-1, k === 1 ? 1 : 0) }), draw: (d) => sparkle(d.cv, ...d.at(1.6, 0.5, 30 + k), K.yellow, k === 1) })),
    ],
    'whiteboard',
  )
}

// ── 다트판 (C): 던질 때마다 다트가 하나씩 꽂히고 마지막 다트가 흔들린다 ──
function dartFrames(r: Rot) {
  const darts = (n: number, wob: number) => (a: After, orig: ((a: After) => void) | undefined) => {
    orig?.(a)
    const [cx, cy] = a.at(0.5, 0.5, 28)
    const spots: [number, number][] = [[1, -1], [-2, 1], [2, 2]]
    spots.slice(0, n).forEach(([x, y], i) => {
      const w = i === n - 1 ? wob : 0
      a.cv.set(cx + x, cy + y, C(K.metal))
      a.cv.set(cx + x + 1 + w, cy + y - 1, C(K.metalL))
      a.cv.set(cx + x + 2 + w, cy + y - 2, C(i % 2 ? K.blue : K.yellow))
    })
  }
  return [frame('dartboard', r), ...[[1, 0], [1, 1], [2, 0], [3, -1]].map(([n, w]) => frame('dartboard', r, { after: darts(n, w) }))]
}

// ── 지구본 (A): 대륙이 한 칸씩 돌아간다 (8장 · 3초) ──
function globeFrames(r: Rot) {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((f) =>
    f === 0
      ? frame('globe', r)
      : frame('globe', r, { after: (a) => ball(a, 0.5, 0.5, 18, 6, K.blue, (dx, dy) => (noise(((Math.round(dx * 4 + 7) - 3 + f) % 8) + 3, Math.round(dy * 4 + 9)) > 0.55 ? K.leaf[1] : null)) }),
  )
}

// ── 아크 조명 (B + G): 켜면 갓 아래 전구가 빛나고 바닥에 빛 웅덩이 ──
function arcFrames(r: Rot) {
  const lit = (a: number) => (d: Draw) => {
    const [bx, by] = d.at(0.73, 0.73, 25)
    d.layer.set(bx, by, C('#fff6d8'))
    d.layer.set(bx + 1, by, C('#ffe7a8'))
    halo(d, 0.73, 0.73, 22, 8, '#ffd77a', a, 'empty')
    for (let y = -0.3; y <= 0.3; y += 1 / 48)
      for (let x = -0.3; x <= 0.3; x += 1 / 48) {
        const dist = Math.hypot(x, y)
        if (dist > 0.3) continue
        const [px, py] = d.at(0.73 + x, 0.73 + y, 0)
        if (px < 0 || py < 0 || px >= d.cv.w || py >= d.cv.h || d.cv.read(py * d.cv.w + px)[3] === 255) continue
        d.cv.set(px, py, glowOf('#ffe7a8', Math.round(a * (1 - dist / 0.3))))
      }
  }
  return [frame('arc-lamp', r), frame('arc-lamp', r, { draw: lit(30) }), frame('arc-lamp', r, { draw: lit(70) })]
}

// ── 이젤 그림 (C): 그리는 동안 분홍 꽃이 한 송이씩 생기고 붓끝이 움직인다 ──
function easelS(n: number) {
  const flowers: [number, number][] = [[0.2, 0.3], [0.38, 0.22], [0.55, 0.3], [0.8, 0.2]]
  return (q: Q) => {
    if (!(q.v > 0.06 && q.v < 0.94 && q.u > 0.05 && q.u < 0.95)) return K.paper
    for (let i = 0; i < n; i++) if (Math.hypot(q.u - flowers[i][0], (q.v - flowers[i][1]) * 1.3) < 0.06) return i % 2 ? K.pink : '#f6d0e0'
    return q.v < 0.4 ? K.leaf[1] : Math.hypot(q.u - 0.7, q.v - 0.72) < 0.14 ? K.yellow : K.sky
  }
}
function easelFrames(r: Rot) {
  return frontOnly(
    r,
    () => [
      frame('easel', r),
      ...[1, 2, 3, 4].map((n) =>
        frame('easel', r, {
          parts: (p) => patch(p, 4, { S: easelS(n) }),
          draw: (d) => {
            const fl = [[0.2, 0.3], [0.38, 0.22], [0.55, 0.3], [0.8, 0.2]][n - 1]
            const [px, py] = d.at(0.18 + fl[0] * 0.64, 0.62, 10 + fl[1] * 18)
            d.layer.set(px + 1, py - 1, C(K.woodD))
            d.layer.set(px + 2, py - 2, C(K.woodD))
            d.layer.set(px, py, C(K.pink))
          },
        }),
      ),
    ],
    'easel',
  )
}

// ── 샌드백 (C + E): 칠 때 좌우로 크게 흔들림(4장 · 1.2초), 지나가면 살짝 한 번(2장) ──
function bagFrames(r: Rot) {
  const sway = (dx: number, dy: number) => (p: Part[]) => patch(p, 3, { x: 0.38 + dx, y: 0.38 + dy })
  return [frame('punching-bag', r), ...[[0.06, 0], [0.1, 0.02], [0.04, 0], [-0.04, -0.02]].map(([dx, dy]) => frame('punching-bag', r, { parts: sway(dx, dy) })), ...[[0.03, 0], [-0.02, 0]].map(([dx, dy]) => frame('punching-bag', r, { parts: sway(dx, dy) }))]
}

// ── 팝콘 기계 (C): 유리 안에서 팝콘이 튀어 오른다 ──
function popcornFrames(r: Rot) {
  const pop = (f: number) => (base: (q: Q) => string) => (q: Q) => {
    if (q.v >= 0.45 && q.v < 0.92 && noise(Math.floor(q.u * 9) + f * 13, Math.floor(q.v * 7) + f * 5) > 0.86) return q.v > 0.7 ? '#fff6d8' : '#fbe9b0'
    return base(q)
  }
  return [
    frame('popcorn', r),
    ...F4.map((f) =>
      frame('popcorn', r, {
        parts: (p) => {
          const g = p[1]
          const S = g.S as (q: Q) => string
          const E = g.E as (q: Q) => string
          return patch(p, 1, { S: pop(f)(S), E: pop(f + 2)(E) })
        },
      }),
    ),
  ]
}

// ── 오락기 (B + C) · prop-arcade 같은 그림: 켜면 화면에 게임(점 먹는 동그라미)이 돌고 위 간판이 깜빡 ──
function arcadeS(mode: 'boot' | 'on', f: number) {
  return (q: Q) => {
    if (q.v > 0.88) return mode === 'on' && f % 2 ? '#ffb07a' : K.orange
    if (inRect(q, 0.12, 0.88, 0.52, 0.82)) {
      if (mode === 'boot') return K.skyL
      const px = 0.2 + f * 0.15
      if (Math.hypot(q.u - px, (q.v - 0.64) * 1.4) < 0.07 && !(q.u > px && Math.abs(q.v - 0.64) < 0.02)) return K.yellow
      if (Math.abs(q.v - 0.64) < 0.02 && q.u > px + 0.08 && frac(q.u * 10) < 0.3) return K.paper
      if (Math.hypot(q.u - 0.75, q.v - 0.74) < 0.05) return f % 2 ? K.pink : K.red
      return K.navy
    }
    if (inRect(q, 0.08, 0.92, 0.36, 0.46)) return Math.abs(q.u - 0.3) < 0.06 ? K.red : Math.abs(q.u - 0.65) < 0.05 || Math.abs(q.u - 0.78) < 0.05 ? K.yellow : K.dark
    return K.purple
  }
}
function arcadeFrames(r: Rot) {
  return frontOnly(
    r,
    () => [frame('arcade', r), frame('arcade', r, { parts: (p) => patch(p, 0, { S: arcadeS('boot', 0) }) }), ...F4.map((f) => frame('arcade', r, { parts: (p) => patch(p, 0, { S: arcadeS('on', f) }), draw: (d) => halo(d, 0.5, 0.85, 24, 7, K.skyL, 22, 'empty') }))],
    'arcade',
  )
}

// ── 뽑기 기계 (C): 손잡이를 돌리면 캡슐이 섞이고, 아래 출구에 캡슐이 굴러 나온다 ──
function gachaFrames(r: Rot) {
  const caps = (f: number) => (p: Part[]) =>
    patch(patch(p, 1, {
      S: (q: Q) => (noise(Math.floor(q.u * 5) + f, Math.floor(q.v * 4)) > 0.4 ? [K.yellow, K.blue, K.pink, K.mint][Math.floor(q.u * 5 + q.v * 4 + f) % 4] : K.skyL),
      E: (q: Q) => (noise(Math.floor(q.u * 5) + 9 + f, Math.floor(q.v * 4)) > 0.4 ? [K.orange, K.purple, K.yellow][(Math.floor(q.u * 5) + f) % 3] : K.skyL),
    }), 0, {
      S: (q: Q) => (Math.hypot(q.u - 0.5, q.v - 0.6) < 0.18 ? (Math.abs(q.u - 0.5 - [0, 0.1, 0, -0.1][f]) < 0.04 ? K.dark : K.paper) : inRect(q, 0.35, 0.65, 0.1, 0.25) ? (f >= 2 && Math.abs(q.u - 0.5) < 0.1 ? [K.blue, K.pink][f - 2] : K.dark) : K.red),
    })
  return [frame('gacha', r), ...F4.map((f) => frame('gacha', r, { parts: caps(f) }))]
}

// ── 괘종시계 (A + G): 추가 좌우로 흔들림(낮), 밤에는 시계판에 불이 들어온다 ──
function clockS(sw: number, night: boolean) {
  return (q: Q) => {
    const d = Math.hypot((q.u - 0.5) * 1.2, (q.v - 0.82) * 4)
    if (d < 0.3) return Math.abs(q.u - 0.5) < 0.04 && q.v > 0.8 ? K.dark : night ? '#fff2b0' : K.paper
    if (inRect(q, 0.25, 0.75, 0.2, 0.62)) {
      const bx = 0.5 + sw
      const t = Math.max(0, Math.min(1, (0.62 - q.v) / 0.32))
      const rx = 0.5 + sw * t
      if (Math.abs(q.u - rx) < 0.05 && q.v > 0.3) return K.gold
      if (Math.hypot(q.u - bx, (q.v - 0.3) * 2) < 0.1) return K.gold
      return '#5a3a28'
    }
    return K.walnut
  }
}
function clockFrames(r: Rot) {
  const SW = [0, 0.1, 0, -0.1]
  return frontOnly(
    r,
    () => [
      ...SW.map((sw, f) => (f === 0 ? frame('clock-tower', r) : frame('clock-tower', r, { parts: (p) => patch(p, 0, { S: clockS(sw, false) }) }))),
      ...SW.map((sw) => frame('clock-tower', r, { parts: (p) => patch(p, 0, { S: clockS(sw, true) }), draw: (d) => halo(d, 0.5, 0.7, 34, 6, '#ffe7a8', 40, 'empty') })),
    ],
    'clock-tower',
  )
}

// ── 앵무새 (E + C): 쓰는 동안(C) 날개를 퍼덕이고, 지나가면(E) 고개를 갸웃하며 깃털이 하나 날린다 ──
function parrotFrames(r: Rot) {
  const wings = (up: number) => (d: Draw) => {
    for (const s of [-1, 1]) {
      const [px, py] = d.at(0.5 + s * 0.12, 0.5, 27 + up)
      d.layer.set(px, py, C(K.leaf[1]))
      d.layer.set(px + s, py - up, C(K.blue))
    }
  }
  const tilt = (dx: number, dz: number) => (p: Part[]) => patch(p, 4, { x: 0.43 + dx, z: 31 + dz })
  return [
    frame('parrot', r),
    ...[1, 2, 1, 0].map((u) => frame('parrot', r, { draw: wings(u) })),
    frame('parrot', r, { parts: tilt(0.05, 1) }),
    frame('parrot', r, { parts: tilt(-0.04, 0), draw: (d) => d.layer.set(...d.at(0.7, 0.5, 30), C(K.leaf[2])) }),
  ]
}

// ── 테이블 축구 (C): 막대가 번갈아 앞뒤로 밀리고 공이 오간다 ──
function foosFrames(r: Rot) {
  return [
    frame('foosball', r),
    ...F4.map((f) =>
      frame('foosball', r, {
        parts: (p) => p.map((q, i) => (i >= 5 ? { ...q, y: 0.04 + ((i + f) % 2 ? 0.04 : -0.03) } : q)),
        draw: (d) => {
          const [px, py] = d.at(0.3 + [0.1, 0.5, 0.9, 0.5][f] * 1.4, 0.5, 16)
          d.layer.set(px, py, C(K.paper))
        },
      }),
    ),
  ]
}

// ── 당구대 (C): 공 세 개가 굴러가고 큐 공이 다른 공을 친다 ──
function poolFrames(r: Rot) {
  // 기존 공 자리: 흰 공 (0.7, 0.9) · 빨강 (2.0, 0.7) · 노랑 (2.1, 1.1)
  const P3: [number, number][][] = [
    [[1.1, 0.9], [2.0, 0.7], [2.1, 1.1]],
    [[1.55, 0.85], [2.0, 0.7], [2.1, 1.1]],
    [[1.85, 0.8], [2.25, 0.6], [2.1, 1.1]],
    [[1.75, 0.82], [2.5, 0.5], [2.25, 1.25]],
  ]
  return [frame('pool-table', r), ...P3.map((pos) => frame('pool-table', r, { parts: (p) => p.map((q, i) => (i >= 5 ? { ...q, x: pos[i - 5][0], y: pos[i - 5][1] } : q)) }))]
}

// ── 인형뽑기 (C + A): 늘 집게가 좌우로 천천히 오가고, 쓰는 동안 내려가 인형을 집어 올린다 ──
function clawFrames(r: Rot) {
  const claw = (x: number, z: number, toy: boolean) => (d: Draw) => {
    const [tx, ty] = d.at(x, 0.5, 29)
    const [cx, cy] = d.at(x, 0.5, z)
    line(d.cv, [tx, ty], [cx, cy], K.metal)
    d.cv.set(cx - 1, cy + 1, C(K.metalL))
    d.cv.set(cx + 1, cy + 1, C(K.metalL))
    if (toy) {
      d.cv.set(cx, cy + 2, C(K.yellow))
      d.cv.set(cx - 1, cy + 2, C(K.yellow))
      d.cv.set(cx, cy + 3, C('#d89a1a'))
    }
  }
  return [frame('claw', r), ...[[0.35, 28], [0.65, 28]].map(([x, z]) => frame('claw', r, { draw: claw(x, z, false) })), ...[[0.45, 24, 0], [0.45, 19, 0], [0.45, 21, 1], [0.45, 27, 1]].map(([x, z, t]) => frame('claw', r, { draw: claw(x, z, t === 1) }))]
}

// ── 그랜드 피아노 (C + B): 켜면(연주) 건반이 차례로 눌리고 음표가 떠오른다 ──
const PIANO_HEAD = 12
function pianoFrames(r: Rot) {
  const keys = (f: number) => (p: Part[]) => patch(p, 5, { top: (q: Q) => (q.v < 0.25 ? K.dark : frac(q.u * 22) < 0.12 ? K.metal : frac(q.u * 22) < 0.45 && q.v < 0.55 ? '#1e2130' : Math.floor(q.u * 22) % 5 === f || Math.floor(q.u * 22) % 7 === f + 2 ? '#c9d2de' : K.paper) })
  return [
    frame('piano', r, { head: PIANO_HEAD }),
    frame('piano', r, { head: PIANO_HEAD, parts: keys(0) }),
    ...F4.map((f) =>
      frame('piano', r, {
        head: PIANO_HEAD,
        parts: keys(f),
        draw: (d) => {
          for (const [x, k, c] of [[0.6, 0, K.pink], [1.3, 2, K.skyL]] as const) {
            const t = (f + k) % 4
            const [px, py] = d.at(x, 1.0, 26 + t * 2)
            note(d.layer, px + (t % 2), py, c, k > 0)
          }
        },
      }),
    ),
  ]
}

// ── 트로피 장식장 (F): 행사 때 트로피 위로 별이 반짝 ──
function trophyFrames(id: string, top: number) {
  return (r: Rot) => [frame(id, r), ...[0, 1, 2].map((k) => frame(id, r, { draw: partyDraw(top, [[0.4, 0.5], [1.0, 0.5], [1.6, 0.5]], k) }))]
}

// ── 황금 동상 (F + A): 평소 광택 한 줄이 위에서 아래로 훑고, 행사 때 번쩍 ──
function statueFrames(r: Rot) {
  const gleam = (f: number) => (p: Part[]) => p.map((q, i) => (i >= 1 ? { ...q, S: (qq: Q) => (Math.abs(qq.v - (1 - f / 3)) < 0.18 && i === [3, 2, 1, 4][f] ? '#fbe9a0' : K.gold) } : q))
  return [frame('statue', r), ...[1, 2, 3].map((f) => frame('statue', r, { parts: gleam(f) })), ...[0, 1, 2].map((k) => frame('statue', r, { parts: (p) => p.map((q, i) => (i >= 1 ? { ...q, c: k === 1 ? '#f6dc8a' : '#e8c46a' } : q)), draw: partyDraw(40, [[0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7]], k) }))]
}

// ── 로봇 비서 (A + E): 눈을 깜빡이고 안테나 불이 바뀐다. 지나가면 눈이 웃는 모양 + 안테나 반짝 ──
function robotEyes(mode: 'open' | 'blink' | 'happy') {
  return (q: Q) => {
    if (!inRect(q, 0.1, 0.9, 0.3, 0.75)) return K.white
    const eye = Math.abs(q.u - 0.3) < 0.08 || Math.abs(q.u - 0.7) < 0.08
    if (!eye) return K.navy
    if (mode === 'blink') return Math.abs(q.v - 0.5) < 0.06 ? K.screen : K.navy
    if (mode === 'happy') return q.v > 0.5 && q.v < 0.62 ? K.screen : K.navy
    return K.screen
  }
}
function robotFrames(r: Rot) {
  const fr = (mode: 'open' | 'blink' | 'happy', ant: string, spark = false) => frame('robot', r, { parts: (p) => patch(patch(p, 2, { S: robotEyes(mode) }), 4, { c: ant }), draw: spark ? (d) => sparkle(d.cv, ...d.at(0.5, 0.5, 36), K.yellow) : undefined })
  return [frame('robot', r), fr('open', K.yellow), fr('blink', K.orange), fr('open', K.yellow), fr('happy', K.yellow, true), fr('happy', K.orange)]
}

// ── 금괴 금고 (F + A): 금괴에 빛이 한 번씩 스치고, 행사 때 번쩍 ──
function goldFrames(r: Rot) {
  return [frame('gold-bar', r), ...[1, 2, 3].map((i) => frame('gold-bar', r, { parts: (p) => patch(p, i, { c: '#f6e2a0' }) })), ...[0, 1, 2].map((k) => frame('gold-bar', r, { parts: (p) => p.map((q, i) => (i >= 1 ? { ...q, c: k === 1 ? '#f6e2a0' : '#e8c46a' } : q)), draw: partyDraw(30, [[0.3, 0.4], [0.7, 0.4], [0.5, 0.7]], k) }))]
}

// ── 잭오랜턴 (A + G): 낮에도 촛불이 일렁이고, 밤에는 더 밝게 빛나며 둘레가 주황으로 물든다 ──
function pumpkinS(flame: string) {
  return (q: Q) => ((Math.abs(q.u - 0.3) < 0.08 || Math.abs(q.u - 0.7) < 0.08) && q.v > 0.55 && q.v < 0.75 ? flame : q.v > 0.2 && q.v < 0.38 && q.u > 0.25 && q.u < 0.75 && frac(q.u * 6) < 0.6 ? flame : frac(q.u * 4) < 0.1 ? '#d86a36' : K.orange)
}
function pumpkinFrames(r: Rot) {
  const DAY = [K.yellow, '#f6c840', '#ffd86a', '#f6c840']
  const NIGHT = ['#fff0a0', '#ffe27a', '#fff6c8', '#ffe27a']
  return frontOnly(
    r,
    () => [...DAY.map((c, f) => (f === 0 ? frame('pumpkin', r) : frame('pumpkin', r, { parts: (p) => patch(p, 0, { S: pumpkinS(c) }) }))), ...NIGHT.map((c, f) => frame('pumpkin', r, { parts: (p) => patch(p, 0, { S: pumpkinS(c) }), draw: (d) => halo(d, 0.5, 0.76, 5, 9, '#ffa040', 34 + (f % 2) * 10, 'empty') }))],
    'pumpkin',
  )
}

// ── 유령 풍선 (A): 위아래로 둥둥 (실도 같이 늘었다 줄었다) ──
const GHOST_HEAD = 2
function ghostFrames(r: Rot) {
  return [0, 1, 2, 1].map((up, f) =>
    frame('ghost', r, {
      head: GHOST_HEAD,
      after:
        f === 0
          ? undefined
          : (a) => {
              line(a.cv, a.at(0.5, 0.5, 2), a.at(0.5, 0.5, 22 + up), K.metalL)
              ball(a, 0.5, 0.5, 30 + up, 7, K.paper, (dx, dy) => ((Math.abs(dx + 0.35) < 0.15 || Math.abs(dx - 0.25) < 0.15) && Math.abs(dy + 0.15) < 0.15 ? K.dark : Math.abs(dx + 0.05) < 0.15 && Math.abs(dy - 0.35) < 0.12 ? K.dark : null))
            },
    }),
  )
}

// ── 벚꽃 나무 (A): 꽃잎 몇 장이 흔들리며 떨어진다 ──
function cherryFrames(r: Rot) {
  const PETALS: [number, number, number][] = [[0.3, 0.6, 30], [0.7, 0.4, 36], [0.55, 0.75, 22]]
  return F4.map((f) =>
    f === 0
      ? frame('cherry-tree', r)
      : frame('cherry-tree', r, {
          draw: (d) =>
            PETALS.forEach(([x, y, z], i) => {
              const zz = z - ((f + i) % 4) * 6
              if (zz < 2) return
              const [px, py] = d.at(x, y, zz)
              d.cv.set(px + ((f + i) % 2), py, C(i % 2 ? '#f6b8cc' : '#e88aa8'))
            }),
        }),
  )
}

export const BUNDLE2: MotionSheetDef[] = [
  { id: 'fishbowl', kind: 'A+C', ...oneRow(fishbowlFrames), clips: { idle: { frames: [0, 1, 2, 3], ms: LOOP }, loop: { frames: [0, 1, 2, 3], ms: LOOP }, use: { frames: [4, 5, 6, 7], ms: 300 } }, still: { idle: 0, loop: 0, use: 4 }, note: '어항은 둥근 그림이라 네 방향이 같다 (행 1개)' },
  { id: 'lava-lamp', kind: 'A+B', ...oneRow(lavaFrames), clips: { off: { frames: [0, 1, 2, 3], ms: LOOP }, loop: { frames: [0, 1, 2, 3], ms: LOOP }, turnOn: { frames: [4], ms: 200 }, on: { frames: [5, 6, 7, 8], ms: LOOP } }, still: { off: 0, loop: 0, on: 5 }, note: '가운데 대칭(행 1개). 꺼짐도 덩어리가 움직인다(A), 켜면 밝아지고 빛남' },
  { id: 'whiteboard', kind: 'D+F', ...perRot(boardFrames), clips: { off: { frames: [0] }, work: { frames: [1, 2, 3, 4], ms: LOOP }, done: { frames: [5, 6, 7], ms: 83 }, party: { frames: [5, 6, 7], ms: 80 } }, still: { off: 0, work: 1 }, note: '뒷면 방향은 0번 한 장. 끝남·행사는 같은 장(노란 메모)을 쓴다' },
  { id: 'dartboard', kind: 'C', ...perRot(dartFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 } },
  { id: 'globe', kind: 'A', ...perRot(globeFrames), clips: { loop: { frames: [0, 1, 2, 3, 4, 5, 6, 7], ms: 375 } }, still: 0, note: '8장 · 3초. 0번은 오른쪽 끝 한 줄만 기존과 다르다(돌아가는 무늬를 이으려고)' },
  { id: 'arc-lamp', kind: 'B+G', ...perRot(arcFrames), clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2] }, day: { frames: [0] }, night: { frames: [2] } }, still: { off: 0, on: 2, day: 0, night: 2 } },
  { id: 'easel', kind: 'C', ...perRot(easelFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 4 }, note: '뒷면 방향은 0번 한 장' },
  { id: 'punching-bag', kind: 'C+E', ...perRot(bagFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 }, react: { frames: [5, 6], ms: 100 } }, still: { idle: 0, use: 1 } },
  { id: 'popcorn', kind: 'C', ...perRot(popcornFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 } },
  { id: 'arcade', kind: 'B+C', ...perRot(arcadeFrames), clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2, 3, 4, 5], ms: LOOP }, idle: { frames: [0] }, use: { frames: [2, 3, 4, 5], ms: LOOP } }, still: { off: 0, on: 2, idle: 0, use: 2 }, shares: ['prop-arcade'], note: '뒷면 방향은 0번 한 장' },
  { id: 'gacha', kind: 'C', ...perRot(gachaFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 } },
  { id: 'clock-tower', kind: 'A+G', ...perRot(clockFrames), clips: { day: { frames: [0, 1, 2, 3], ms: LOOP }, loop: { frames: [0, 1, 2, 3], ms: LOOP }, night: { frames: [4, 5, 6, 7], ms: LOOP } }, still: { day: 0, loop: 0, night: 4 }, note: '정시 종소리 연출은 소리·시각 신호가 없어 뺐다. 뒷면 방향은 0번 한 장' },
  { id: 'parrot', kind: 'E+C', ...perRot(parrotFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 }, react: { frames: [5, 6], ms: 100 } }, still: { idle: 0, use: 1 } },
  { id: 'foosball', kind: 'C', ...perRot(foosFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 } },
  { id: 'pool-table', kind: 'C', ...perRot(poolFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 } },
  { id: 'claw', kind: 'C+A', ...perRot(clawFrames), clips: { idle: { frames: [0, 1, 0, 2], ms: 750 }, loop: { frames: [0, 1, 0, 2], ms: 750 }, use: { frames: [3, 4, 5, 6], ms: 300 } }, still: { idle: 0, loop: 0, use: 3 }, note: '늘 움직임은 0·1·0·2번을 돌려 쓴다 (장수 절약, 3초 반복)' },
  { id: 'piano', kind: 'B+C', ...perRot(pianoFrames), clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2, 3, 4, 5], ms: LOOP }, idle: { frames: [0] }, use: { frames: [2, 3, 4, 5], ms: LOOP } }, still: { off: 0, on: 2, idle: 0, use: 2 }, note: '음표가 위로 올라가 칸 위쪽을 12 아트 px 더 비웠다' },
  { id: 'trophy', kind: 'F', ...perRot(trophyFrames('trophy', 32)), clips: { party: { frames: [1, 2, 3], ms: 80 } }, still: 0 },
  { id: 'statue', kind: 'F+A', ...perRot(statueFrames), clips: { loop: { frames: [0, 1, 2, 3], ms: 750 }, party: { frames: [4, 5, 6], ms: 80 } }, still: 0, note: '광택은 3초에 한 번 (장당 750ms — 은은하게)' },
  { id: 'robot', kind: 'A+E', ...perRot(robotFrames), clips: { loop: { frames: [0, 1, 2, 3], ms: 750 }, react: { frames: [4, 5], ms: 100 } }, still: 0 },
  { id: 'gold-bar', kind: 'F+A', ...perRot(goldFrames), clips: { loop: { frames: [0, 1, 2, 3], ms: 750 }, party: { frames: [4, 5, 6], ms: 80 } }, still: 0 },
  { id: 'pumpkin', kind: 'A+G', ...perRot(pumpkinFrames), clips: { day: { frames: [0, 1, 2, 3], ms: LOOP }, loop: { frames: [0, 1, 2, 3], ms: LOOP }, night: { frames: [4, 5, 6, 7], ms: LOOP } }, still: { day: 0, loop: 0, night: 4 }, note: '뒷면 방향은 0번 한 장' },
  { id: 'ghost', kind: 'A', ...oneRow(ghostFrames), clips: { loop: { frames: [0, 1, 2, 3], ms: 750 } }, still: 0, note: '둥근 그림이라 행 1개. 떠오르는 만큼 칸 위쪽을 2 아트 px 더 비웠다' },
  { id: 'cherry-tree', kind: 'A', ...perRot(cherryFrames), clips: { loop: { frames: [0, 1, 2, 3], ms: 750 } }, still: 0 },
  { id: 'bookshelf', kind: 'C', ...perRot(bookFrames('bookshelf', 2, 28)), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 2 } },
]

// ── 책장 (C) · 키 큰 책장도 같은 방식: 읽는 동안 책 한 권이 앞으로 빠져나와 있고 위에서 책장이 넘어가는 반짝임 ──
export function bookFrames(id: string, W: number, h: number) {
  return (r: Rot) => {
    const bx = W * 0.62
    const z0 = Math.round(h * 0.5)
    const out = (ext: number, page: number) => (d: Draw) => {
      if (!visibleSides(r).py) {
        if (page >= 0) sparkle(d.cv, ...d.at(bx, 0.4, h + 4 + page), K.skyL)
        return
      }
      cube(d, d.layer, bx, 0.62, 0.08, ext, z0, 7, K.red)
      if (page >= 0) d.cv.set(...d.at(bx + 0.04, 0.62 + ext, z0 + 8 + page), C(K.paper))
    }
    return [frame(id, r), ...[[0.06, -1], [0.12, 0], [0.12, 1], [0.12, 0]].map(([e, p]) => frame(id, r, { draw: out(e, p) }))]
  }
}
