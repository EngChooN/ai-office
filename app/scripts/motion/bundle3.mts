// 3묶음 — 우선순위 '중' 레벨 전용(lv-*)·소품(prop-*) (연출④-5). 분류표 docs/specs/furniture-motion-catalog.md, 규칙 furniture-motion-guide.md
// 원칙(1·2묶음과 같음): 대기·꺼짐·0번 장 = 기존 그림. 같은 그림을 쓰는 prop-*는 shares로 시트를 함께 쓴다
import type { Rot } from '../../src/shared/iso/furniture.ts'
import { C, cube, frac, frame, glowOf, halo, inRect, K, mix, noise, perRot, patch, sparkle, visibleSides, type Draw, type MotionSheetDef, type Part, type Q } from './kit.mts'
import { bookFrames } from './bundle2.mts'

const LOOP = 500
const F4 = [0, 1, 2, 3]
const hexOf = (a: string, b: string, t: number) => `#${mix(a, b, t).slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** 김·연기 한 가닥: (x, y, z)에서 위로 len px, 프레임 f마다 한 칸씩 올라가며 좌우로 흔들림 (반투명이라 외곽선 없음) */
function steam(d: Draw, x: number, y: number, z: number, f: number, len = 7, c = '#f6f8fb', off = 0) {
  const [sx, sy] = d.at(x, y, z)
  for (let t = 0; t < len; t++) {
    const yy = sy - 1 - t - ((f + off) % 4)
    const xx = sx + Math.round(Math.sin((t + f + off) * 1.1) * 1.2)
    if (yy >= 0) d.cv.set(xx, yy, glowOf(c, t < len / 2 ? 200 : 110))
  }
}
/** 행사 반짝임: 점들 위로 별이 번갈아 */
function stars(d: Draw, spots: [number, number, number][], k: number, big = false) {
  spots.forEach(([x, y, z], i) => {
    if ((i + k) % 3 === 2) return
    sparkle(d.cv, ...d.at(x, y, z + ((i + k) % 2) * 2), K.yellow, big && (i + k) % 3 === 0)
  })
}

// ── 회의 테이블 (F): 회의 때 노트북 화면이 켜지고 서류가 들썩, 위로 반짝 ──
function meetFrames(r: Rot) {
  return [
    frame('lv-meeting-table', r),
    ...[0, 1, 2].map((k) =>
      frame('lv-meeting-table', r, {
        parts: (p) => patch(patch(patch(p, 7, { c: K.screen, top: k === 1 ? K.skyL : K.screen }), 5, { z: 14 + (k === 1 ? 1 : 0) }), 6, { z: 14 + (k === 2 ? 1 : 0) }),
        draw: (d) => stars(d, [[1.5, 0.5, 20], [0.5, 0.45, 18], [1.45, 1.35, 18]], k),
      }),
    ),
  ]
}

// ── 유리 회의 테이블 (F): 회의 때 상판 위로 빛줄기가 흐르고 노트북 화면이 켜진다 ──
function glassFrames(r: Rot) {
  return [
    frame('lv-glass-table', r),
    ...[0, 1, 2].map((k) =>
      frame('lv-glass-table', r, {
        parts: (p) =>
          patch(patch(p, 4, { top: (q: Q) => (Math.abs(frac((q.u * 3 - q.v * 2) * 0.4) - k * 0.33) < 0.06 ? '#ffffff' : frac((q.u * 3 - q.v * 2) * 1.2) < 0.08 ? K.skyL : '#c4e8f6') }), 6, { S: K.screen, c: K.screen }),
        draw: (d) => stars(d, [[0.75, 0.4, 24], [2.15, 1.3, 18], [1.55, 0.95, 18]], k),
      }),
    ),
  ]
}

// ── 우편함 (D): 일하는 중 옆 빨간 깃발이 올라갔다 내려갔다. 끝나면 편지가 투입구로 쏙 들어가며 반짝 ──
function mailFrames(r: Rot) {
  const flag = (up: number) => (d: Draw) => {
    const [bx, by] = d.at(0.74, 0.5, 18)
    for (let z = 0; z < 6 + up; z++) d.layer.set(bx, by - z, C(K.metal))
    d.layer.set(bx + 1, by - 5 - up, C(K.red))
    d.layer.set(bx + 2, by - 5 - up, C(K.red))
    d.layer.set(bx + 1, by - 4 - up, C(K.red))
  }
  const letter = (k: number) => (d: Draw) => {
    if (visibleSides(r).py) cube(d, d.layer, 0.36, 0.7 + [0.12, 0.05, 0][k], 0.28, 0.02, 20 + k, 3 - k, K.paper)
    sparkle(d.cv, ...d.at(0.5, 0.5, 30 + k), K.yellow, k === 1)
  }
  return [frame('lv-mailbox', r), ...[0, 1, 2, 1].map((u) => frame('lv-mailbox', r, { draw: flag(u) })), ...[0, 1, 2].map((k) => frame('lv-mailbox', r, { draw: letter(k) }))]
}

// ── 냉장고 (C): 쓰는 동안 문틈 불빛이 켜지고 찬 김이 앞으로 흘러나온다 ──
function fridgeFrames(r: Rot) {
  const S = (q: Q) => (Math.abs(q.v - 0.62) < 0.02 ? K.metalL : q.u > 0.8 && q.u < 0.88 && (Math.abs(q.v - 0.5) < 0.08 || Math.abs(q.v - 0.75) < 0.08) ? K.metal : q.u > 0.9 ? '#fff6d8' : '#eef2f6')
  return [
    frame('lv-fridge', r),
    ...F4.map((f) =>
      frame('lv-fridge', r, {
        parts: (p) => patch(p, 0, { S }),
        draw: (d) => {
          if (!visibleSides(r).py) return steam(d, 0.5, 0.5, 34, f, 5, '#e6f7ff')
          for (let i = 0; i < 3; i++) {
            const [px, py] = d.at(0.86, 0.86 + ((f + i) % 4) * 0.06, 6 + i * 7 - ((f + i) % 4))
            d.cv.set(px, py, glowOf('#e6f7ff', 180))
            d.cv.set(px - 1, py, glowOf('#e6f7ff', 110))
          }
        },
      }),
    ),
  ]
}

// ── 자판기 (B + C): 켜면 진열 칸 불빛이 밝아지고 버튼이 깜빡이며, 출구에 음료가 떨어진다 ──
function vendS(mode: 'boot' | 'on', f: number) {
  return (q: Q) => {
    if (inRect(q, 0.08, 0.66, 0.34, 0.92)) {
      if (frac((q.v - 0.34) * 9) < 0.25) return mode === 'boot' ? K.paper : '#e8f2ff'
      return frac(q.u * 9) < 0.5 ? hexOf([K.red, K.yellow, K.green, K.orange][Math.floor((q.v - 0.34) * 9) % 4], '#ffffff', 0.2) : '#f2fbff'
    }
    if (inRect(q, 0.74, 0.9, 0.55, 0.85)) return frac(q.v * 12 + f * 0.25) < 0.5 ? (mode === 'on' && f % 2 ? K.green : K.yellow) : K.white
    if (inRect(q, 0.15, 0.6, 0.08, 0.2)) return mode === 'on' && f >= 2 && Math.abs(q.u - 0.3 - (f - 2) * 0.12) < 0.06 ? K.red : K.dark
    return K.blue
  }
}
function vendFrames(r: Rot) {
  if (!visibleSides(r).py) return [frame('lv-vending', r)]
  return [frame('lv-vending', r), frame('lv-vending', r, { parts: (p) => patch(p, 0, { S: vendS('boot', 0) }) }), ...F4.map((f) => frame('lv-vending', r, { parts: (p) => patch(p, 0, { S: vendS('on', f) }), draw: (d) => halo(d, 0.5, 0.86, 20, 8, K.skyL, 24, 'empty') }))]
}

// ── 탁구대 (C) · prop-pingpong: 공이 네트를 넘어 오가고 라켓이 들린다 ──
function pongFrames(r: Rot) {
  const BALL: [number, number, number][] = [[0.7, 0.75, 16], [1.5, 1.0, 21], [2.3, 1.25, 16], [1.5, 1.0, 21]]
  return [
    frame('lv-pingpong', r),
    ...BALL.map(([x, y, z], f) =>
      frame('lv-pingpong', r, {
        parts: (p) => patch(patch(p, 6, { z: f === 0 ? 15 : 13 }), 7, { z: f === 2 ? 15 : 13 }),
        draw: (d) => {
          const [px, py] = d.at(x, y, z)
          d.layer.set(px, py, C('#ffffff'))
          d.cv.set(...d.at(x, y, 13), glowOf('#2e3246', 60))
        },
      }),
    ),
  ]
}

// ── 층 안내판 (D + G): 일하는 중 주황 표시등이 줄마다 차례로 켜지고, 끝나면 반짝 ──
function signS(lit: number) {
  return (q: Q) => {
    if (q.u < 0.05 || q.u > 0.95 || q.v < 0.05 || q.v > 0.95) return K.metalL
    if (frac(q.v * 5) < 0.45) {
      const row = Math.floor(q.v * 5)
      if (q.u < 0.22) return lit >= 0 && (row + lit) % 4 === 0 ? '#ffd2a8' : K.orange
      if (q.u > 0.3 && q.u < 0.3 + noise(row, 1) * 0.55) return lit >= 0 && (row + lit) % 4 === 0 ? '#ffffff' : K.skyL
    }
    return K.navy
  }
}
function signFrames(r: Rot) {
  if (!visibleSides(r).py) return [frame('lv-floor-sign', r)]
  return [frame('lv-floor-sign', r), ...F4.map((f) => frame('lv-floor-sign', r, { parts: (p) => patch(p, 2, { S: signS(f) }), draw: (d) => halo(d, 0.5, 0.52, 22, 9, K.skyL, 18, 'empty') })), ...[0, 1, 2].map((k) => frame('lv-floor-sign', r, { draw: (d) => sparkle(d.cv, ...d.at(0.5, 0.5, 34 + k), K.yellow, k === 1) }))]
}

// ── 수면 캡슐 (C) · prop-napPod: 쓰는 동안 창에 블라인드가 내려오고 Zzz가 떠오른다 ──
const POD_HEAD = 10
function podFrames(r: Rot) {
  const shut = (p: Part[]) => patch(p, 1, { E: (q: Q) => (inRect(q, 0.12, 0.88, 0.18, 0.82) ? (frac(q.v * 8) < 0.2 ? K.navy : '#7f8fb8') : K.white), W: (q: Q) => (inRect(q, 0.12, 0.88, 0.18, 0.82) ? (frac(q.v * 8) < 0.2 ? K.navy : '#7f8fb8') : K.white) })
  const zzz = (f: number) => (d: Draw) => {
    ;[0, 2].forEach((k) => {
      const t = (f + k) % 4
      const [px, py] = d.at(0.5, 1.0, 23 + t * 2)
      const x0 = px + t - 2
      const col = C(k ? '#c9d2f0' : '#ffffff')
      const s = k ? 3 : 4
      for (let i = 0; i < s; i++) {
        d.layer.set(x0 + i, py - s + 1, col)
        d.layer.set(x0 + i, py, col)
        d.layer.set(x0 + s - 1 - i, py - s + 1 + i, col)
      }
    })
  }
  return [frame('lv-sleep-pod', r, { head: POD_HEAD }), ...F4.map((f) => frame('lv-sleep-pod', r, { head: POD_HEAD, parts: shut, draw: zzz(f) }))]
}

// ── 에스프레소 바 · 커피 코너 (C): 커피머신과 같은 연출을 이 그림의 머신 자리에 — 김이 오르고 줄기가 떨어지고 표시등이 깜빡 ──
function espressoFrames(id: string, m: { x: number; y: number; w: number; d: number; z: number; h: number; lamp?: [number, number] }) {
  return (r: Rot) => [
    frame(id, r),
    ...F4.map((f) =>
      frame(id, r, {
        draw: (d) => {
          steam(d, m.x + m.w * 0.35, m.y + m.d * 0.5, m.z + m.h, f, 7)
          steam(d, m.x + m.w * 0.65, m.y + m.d * 0.5, m.z + m.h, f, 6, '#f6f8fb', 2)
          if (!visibleSides(r).py) return
          const fy = m.y + m.d + 0.02
          const [nx, ny] = d.at(m.x + m.w * 0.5, fy, m.z + m.h * 0.28)
          for (let t = 0; t < 3; t++) if ((t + f) % 4 !== 3) d.layer.set(nx, ny + t, C('#6b4128'))
          if (m.lamp) d.layer.set(...d.at(m.x + m.w * m.lamp[0], fy, m.z + m.h * m.lamp[1]), C(f % 2 ? K.green : hexOf(K.green, K.white, 0.4)))
        },
      }),
    ),
  ]
}

// ── 강당 단상 (F): 행사 때 단상 위로 조명이 내려오고 금 장식이 번쩍 ──
function stageFrames(r: Rot) {
  return [
    frame('lv-stage', r),
    ...[0, 1, 2].map((k) =>
      frame('lv-stage', r, {
        parts: (p) => patch(p, 1, { S: (q: Q) => (Math.abs(q.u - 0.5) < 0.18 && q.v > 0.55 && q.v < 0.8 ? (k === 1 ? '#fbe9a0' : K.gold) : K.walnutT) }),
        draw: (d) => {
          for (const [x, y] of [[1.2, 0.8], [2.0, 1.0], [2.8, 0.8]] as const) halo(d, x, y, 8, 10 + k * 2, '#fff2c8', 36 + (k === 1 ? 14 : 0))
          stars(d, [[0.6, 1.0, 14], [2.0, 0.6, 34], [3.4, 1.0, 14], [1.4, 1.6, 12]], k, true)
        },
      }),
    ),
  ]
}

// ── 옥상 바비큐 (C + A) · prop-bbq: 늘 숯불이 일렁이고 연기가 은은히, 굽는 동안(C) 불꽃이 커지고 연기가 진해진다 ──
const BBQ_HEAD = 8
function bbqFrames(r: Rot) {
  const coals = (f: number, hot: boolean) => (p: Part[]) => patch(p, 4, { top: (q: Q) => (frac(q.u * 8) < 0.3 ? K.metal : frac(q.u * 8 + q.v + f * 0.25) < (hot ? 0.75 : 0.6) ? (hot && (Math.floor(q.u * 8) + f) % 3 === 0 ? K.yellow : K.orange) : K.red) })
  const smoke = (f: number, hot: boolean) => (d: Draw) => {
    steam(d, 0.5, 0.5, 17, f, hot ? 8 : 5, '#d8dce6')
    if (hot) {
      steam(d, 1.0, 0.5, 17, f, 7, '#d8dce6', 2)
      for (const x of [0.4, 0.75, 1.1]) {
        const [px, py] = d.at(x, 0.5, 17)
        for (let z = 0; z < 1 + ((f + Math.round(x * 4)) % 3); z++) d.layer.set(px, py - z, C(z ? K.orange : K.yellow))
      }
    }
  }
  return [frame('lv-bbq', r, { head: BBQ_HEAD }), ...[1, 2, 3].map((f) => frame('lv-bbq', r, { head: BBQ_HEAD, parts: coals(f, false), draw: smoke(f, false) })), ...F4.map((f) => frame('lv-bbq', r, { head: BBQ_HEAD, parts: coals(f, true), draw: smoke(f, true) }))]
}

// ── 트로피 진열장 (F) · prop-trophies·prop-lobbyTrophies: 행사 때 별이 돌아가며 반짝 ──
function trophyCaseFrames(r: Rot) {
  return [frame('lv-trophy-case', r), ...[0, 1, 2].map((k) => frame('lv-trophy-case', r, { draw: (d) => (halo(d, 1, 0.5, 20, 14, '#ffe7a8', 30, 'empty'), stars(d, [[0.4, 0.5, 40], [1.0, 0.5, 42], [1.6, 0.5, 40]], k, true)) }))]
}

// ── 명예의 전당 벽 (F): 행사 때 액자들이 차례로 빛난다 ──
function fameS(k: number) {
  return (q: Q) => {
    const f = frac(q.u * 5)
    const g = frac(q.v * 2)
    if (f > 0.15 && f < 0.85 && g > 0.15 && g < 0.85) {
      if (f < 0.22 || f > 0.78 || g < 0.24 || g > 0.76) return (Math.floor(q.u * 5) + Math.floor(q.v * 2)) % 3 === k ? '#fbe9a0' : K.gold
      return (Math.floor(q.u * 5) + Math.floor(q.v * 2)) % 3 === k ? '#ffffff' : [K.skyL, '#fbe9df', '#e6f5ec'][Math.floor(q.u * 5 + q.v * 2) % 3]
    }
    return K.navy
  }
}
function fameFrames(r: Rot) {
  const front = visibleSides(r).py
  return [frame('lv-hall-of-fame', r), ...[0, 1, 2].map((k) => frame('lv-hall-of-fame', r, { parts: front ? (p) => patch(p, 1, { S: fameS(k) }) : undefined, draw: (d) => stars(d, [[0.5, 0.5, 46], [1.5, 0.5, 47], [2.5, 0.5, 46]], k) }))]
}

export const BUNDLE3: MotionSheetDef[] = [
  { id: 'lv-meeting-table', kind: 'F', ...perRot(meetFrames), clips: { party: { frames: [1, 2, 3], ms: 80 } }, still: 0 },
  { id: 'lv-glass-table', kind: 'F', ...perRot(glassFrames), clips: { party: { frames: [1, 2, 3], ms: 80 } }, still: 0 },
  { id: 'lv-mailbox', kind: 'D', ...perRot(mailFrames), clips: { off: { frames: [0] }, work: { frames: [1, 2, 3, 4], ms: LOOP }, done: { frames: [5, 6, 7], ms: 83 } }, still: { off: 0, work: 1 }, note: '편지는 앞면이 보이는 방향에서만, 반짝임은 네 방향 모두' },
  { id: 'lv-fridge', kind: 'C', ...perRot(fridgeFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 }, note: '문을 여는 그림 대신 문틈 불빛과 찬 김으로 (칸 크기를 넘지 않게)' },
  { id: 'lv-vending', kind: 'B+C', ...perRot(vendFrames), clips: { off: { frames: [0] }, turnOn: { frames: [1], ms: 200 }, on: { frames: [2, 3, 4, 5], ms: LOOP }, idle: { frames: [0] }, use: { frames: [2, 3, 4, 5], ms: LOOP } }, still: { off: 0, on: 2, idle: 0, use: 2 }, note: '뒷면 방향은 0번 한 장' },
  { id: 'lv-pingpong', kind: 'C', ...perRot(pongFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 }, shares: ['prop-pingpong'] },
  { id: 'lv-floor-sign', kind: 'D+G', ...perRot(signFrames), clips: { off: { frames: [0] }, work: { frames: [1, 2, 3, 4], ms: LOOP }, done: { frames: [5, 6, 7], ms: 83 }, day: { frames: [0] }, night: { frames: [1, 2, 3, 4], ms: LOOP } }, still: { off: 0, work: 1, day: 0, night: 1 }, note: '뒷면 방향은 0번 한 장. 일하는 직원 수만큼 켜기는 신호가 없어 줄마다 차례로 켜지는 반복으로 대신' },
  { id: 'lv-sleep-pod', kind: 'C', ...perRot(podFrames), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 }, shares: ['prop-napPod'], note: 'Zzz가 위로 올라가 칸 위쪽을 10 아트 px 더 비웠다' },
  { id: 'lv-espresso-bar', kind: 'C', ...perRot(espressoFrames('lv-espresso-bar', { x: 0.3, y: 0.14, w: 0.7, d: 0.42, z: 18, h: 11, lamp: [0.5, 0.85] })), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 }, note: '커피머신 시트와 크기가 달라 이 그림의 머신 자리에 같은 연출을 따로 그렸다' },
  { id: 'prop-coffeeCorner', kind: 'C', ...perRot(espressoFrames('prop-coffeeCorner', { x: 0.2, y: 0.2, w: 0.5, d: 0.4, z: 15, h: 11 })), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 1 }, note: '커피머신 시트와 크기가 달라 따로 그렸다' },
  { id: 'lv-stage', kind: 'F', ...perRot(stageFrames), clips: { party: { frames: [1, 2, 3], ms: 80 } }, still: 0 },
  { id: 'lv-bbq', kind: 'C+A', ...perRot(bbqFrames), clips: { idle: { frames: [0, 1, 2, 3], ms: LOOP }, loop: { frames: [0, 1, 2, 3], ms: LOOP }, use: { frames: [4, 5, 6, 7], ms: 300 } }, still: { idle: 0, loop: 0, use: 4 }, shares: ['prop-bbq'], note: '연기가 올라가 칸 위쪽을 8 아트 px 더 비웠다' },
  { id: 'lv-trophy-case', kind: 'F', ...perRot(trophyCaseFrames), clips: { party: { frames: [1, 2, 3], ms: 80 } }, still: 0, shares: ['prop-trophies', 'prop-lobbyTrophies'] },
  { id: 'lv-hall-of-fame', kind: 'F', ...perRot(fameFrames), clips: { party: { frames: [1, 2, 3], ms: 80 } }, still: 0, note: '액자 불빛은 앞면 방향만, 위 반짝임은 네 방향 모두' },
  { id: 'lv-tall-bookshelf', kind: 'C', ...perRot(bookFrames('lv-tall-bookshelf', 2, 42)), clips: { idle: { frames: [0] }, use: { frames: [1, 2, 3, 4], ms: 300 } }, still: { idle: 0, use: 2 }, note: '책장(bookshelf)과 같은 연출 (우선순위 하지만 생성기를 함께 써서 여기서 같이 만든다)' },
]
