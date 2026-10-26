// 4묶음 — 우선순위 '하' (연출④-5). 분류표 docs/specs/furniture-motion-catalog.md, 규칙 furniture-motion-guide.md
// 앉는 가구(소파·빈백)는 앉은 직원이 대부분을 가려서, 쓰는 중은 '쿠션이 눌린 한 장'으로 둔다 (반복 없음 — 메모리 절약)
import type { Rot } from '../../src/shared/iso/furniture.ts'
import { C, frac, frame, glowOf, halo, inRect, K, line, mix, oneRow, patch, perRot, sparkle, visibleSides, type After, type Draw, type MotionSheetDef, type Part, type Q } from './kit.mts'

const LOOP = 500
const F4 = [0, 1, 2, 3]
const hexOf = (a: string, b: string, t: number) => `#${mix(a, b, t).slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`

function steam(d: Draw, x: number, y: number, z: number, f: number, len = 6, c = '#f6f8fb', off = 0) {
  const [sx, sy] = d.at(x, y, z)
  for (let t = 0; t < len; t++) {
    const yy = sy - 1 - t - ((f + off) % 4)
    const xx = sx + Math.round(Math.sin((t + f + off) * 1.1) * 1.2)
    if (yy >= 0) d.cv.set(xx, yy, glowOf(c, t < len / 2 ? 200 : 110))
  }
}

// ── 꽃 화분 (F): 행사 때 꽃 위로 반짝 ──
function flowerFrames(r: Rot) {
  return [frame('flower-pot', r), ...[0, 1, 2].map((k) => frame('flower-pot', r, { draw: (d) => [[0.3, 0.5, 22], [0.7, 0.5, 24], [0.5, 0.3, 26]].forEach(([x, y, z], i) => (i + k) % 3 !== 2 && sparkle(d.cv, ...d.at(x, y, z + k), K.yellow, (i + k) % 3 === 0)) }))]
}

// ── 앉는 가구 (C): 쿠션이 1px 눌린 한 장 ──
const squash = (from: number, to: number) => (p: Part[]) => p.map((q, i) => (i >= from && i <= to ? { ...q, z: q.z - 1 } : q))
const seatFrames = (id: string, from: number, to: number) => (r: Rot) => [frame(id, r), frame(id, r, { parts: squash(from, to) })]

// ── LP 선반 (C): 턴테이블 위 레코드가 돈다 (빛 한 줄이 한 바퀴) ──
function recordFrames(r: Rot) {
  return [
    frame('record-shelf', r),
    ...F4.map((f) =>
      frame('record-shelf', r, {
        parts: (p) =>
          patch(p, 1, {
            top: (q: Q) => {
              const d = Math.hypot(q.u - 0.45, q.v - 0.5)
              if (d >= 0.34) return K.dark
              if (d < 0.08) return K.orange
              const a = (Math.atan2(q.v - 0.5, q.u - 0.45) / (Math.PI * 2) + 1 + f * 0.25) % 1
              return a < 0.07 || (a > 0.5 && a < 0.57) ? '#4a5070' : '#1e2130'
            },
          }),
      }),
    ),
  ]
}

// ── 아이스크림 냉장고 (C): 뚜껑 유리에 김이 서리고 찬 김이 위로 ──
function iceFrames(r: Rot) {
  return [frame('icecream', r), ...F4.map((f) => frame('icecream', r, { parts: (p) => patch(p, 0, { top: (q: Q) => (inRect(q, 0.08, 0.92, 0.1, 0.9) ? hexOf([K.pink, '#f6e0b0', K.mintL, '#c9a07a'][Math.floor(q.u * 4)], '#ffffff', 0.35) : K.white) }), draw: (d) => (steam(d, 0.35, 0.5, 14, f, 5, '#e6f7ff'), steam(d, 0.7, 0.5, 14, f, 4, '#e6f7ff', 2)) }))]
}

// ── VR 부스 (C): 바닥 원에 빛이 돌고 헤드셋 불빛이 깜빡 ──
function vrFrames(r: Rot) {
  return [
    frame('vr-booth', r),
    ...F4.map((f) =>
      frame('vr-booth', r, {
        parts: (p) =>
          patch(patch(p, 0, {
            top: (q: Q) => {
              if (Math.abs(Math.hypot(q.u - 0.5, q.v - 0.5) - 0.36) >= 0.04) return K.dark
              const a = (Math.atan2(q.v - 0.5, q.u - 0.5) / (Math.PI * 2) + 1 + f * 0.25) % 1
              return a < 0.2 ? '#ffffff' : K.screen
            },
          }), 4, { c: f % 2 ? '#c9a8ff' : K.purple }),
        draw: (d) => halo(d, 0.5, 0.5, 2, 10, K.screen, 22, 'empty'),
      }),
    ),
  ]
}

// ── 공룡 화석 (E): 지나가면 눈이 빨갛게 반짝이고 고개를 살짝 든다 ──
function dinoFrames(r: Rot) {
  const head = (dz: number, eye: string) => (p: Part[]) => patch(p, 5, { z: 28 + dz, S: (q: Q) => (Math.abs(q.u - 0.3) < 0.1 && q.v > 0.5 ? eye : '#f2ead8') })
  return [frame('dino', r), frame('dino', r, { parts: head(1, K.red) }), frame('dino', r, { parts: head(0, K.yellow) })]
}

// ── 눈사람 (A): 눈송이가 천천히 내린다 ──
function snowFrames(r: Rot) {
  const FLAKES: [number, number, number][] = [[0.15, 0.4, 34], [0.8, 0.3, 30], [0.2, 0.85, 26], [0.75, 0.75, 38]]
  return F4.map((f) =>
    f === 0
      ? frame('snowman', r)
      : frame('snowman', r, {
          draw: (d) =>
            FLAKES.forEach(([x, y, z], i) => {
              const zz = z - ((f + i) % 4) * 7
              if (zz > 1) d.cv.set(...d.at(x, y, zz), glowOf('#ffffff', 230))
            }),
        }),
  )
}

// ── 청사초롱 (A + G): 낮에도 불빛이 은은히 일렁, 밤에는 환하게 ──
function lanternFrames(r: Rot) {
  const body = (c: string) => (p: Part[]) => patch(p, 2, { c, S: (q: Q) => (q.v > 0.7 ? K.blue : c), E: (q: Q) => (q.v > 0.7 ? K.blue : c) })
  const DAY = [K.red, '#ec6a5a', '#f07a68', '#ec6a5a']
  const NIGHT = ['#ff8a70', '#ff9c80', '#ffb090', '#ff9c80']
  return [...DAY.map((c, f) => (f === 0 ? frame('lunar-lantern', r) : frame('lunar-lantern', r, { parts: body(c) }))), ...NIGHT.map((c, f) => frame('lunar-lantern', r, { parts: body(c), draw: (d) => halo(d, 0.5, 0.5, 23, 10, '#ffb070', 30 + (f % 2) * 10, 'empty') }))]
}

// ── 커피포트 선반 (C): 포트에서 김이 오른다 ──
function kettleFrames(r: Rot) {
  return [frame('lv-kettle-shelf', r), ...F4.map((f) => frame('lv-kettle-shelf', r, { draw: (d) => (steam(d, 0.36, 0.4, 23, f, 6), d.layer.set(...d.at(0.36, 0.52, 18), C(f % 2 ? K.red : K.orange))) }))]
}

// ── 행거 (E): 지나가면 옷이 살짝 흔들린다 ──
function hangerFrames(r: Rot) {
  const sway = (a: number, b: number) => (p: Part[]) => patch(patch(p, 3, { x: 0.24 + a }), 4, { x: 0.56 + b })
  return [frame('lv-hanger', r), frame('lv-hanger', r, { parts: sway(0.04, -0.03) }), frame('lv-hanger', r, { parts: sway(-0.02, 0.03) })]
}

// ── 샤워 부스 (C): 유리 안에 물줄기가 쏟아지고 위에 김이 찬다 ──
function showerFrames(r: Rot) {
  return [
    frame('lv-shower', r),
    ...F4.map((f) =>
      frame('lv-shower', r, {
        draw: (d) => {
          for (const [x, y] of [[0.4, 0.5], [0.5, 0.45], [0.6, 0.55], [0.5, 0.6]] as const) {
            for (let z = 6; z < 34; z += 1) if ((z + f * 2 + Math.round(x * 10)) % 5 < 3) d.cv.set(...d.at(x, y, z), glowOf('#ffffff', 235))
          }
          halo(d, 0.5, 0.5, 34, 6, '#ffffff', 40 + (f % 2) * 20)
        },
      }),
    ),
  ]
}

// ── 덤벨 랙 (C): 덤벨 하나를 들어 올렸다 내린다 ──
function dumbFrames(r: Rot) {
  return [frame('lv-dumbbell', r), ...[[0.15, 2], [0.3, 6], [0.3, 9], [0.15, 4]].map(([dy, dz]) => frame('lv-dumbbell', r, { parts: (p) => patch(p, 5, { y: 0.4 + dy, z: 7 + dz }) }))]
}

// ── 샐러드 바 (C): 집는 동안 그릇 하나씩 들썩이고 집게가 오간다 ──
function saladFrames(r: Rot) {
  return [
    frame('lv-salad-bar', r),
    ...F4.map((f) =>
      frame('lv-salad-bar', r, {
        parts: (p) => patch(p, 2 + f, { z: 15 }),
        draw: (d) => {
          const [px, py] = d.at(0.34 + f * 0.44, 0.75, 19)
          d.layer.set(px, py, C(K.metalL))
          d.layer.set(px + 1, py - 1, C(K.metalL))
        },
      }),
    ),
  ]
}

// ── 해먹 (A + C): 비어 있어도 살짝 흔들, 앉으면(C) 크게 흔들 ──
function hammockFrames(r: Rot) {
  const swing = (dy: number) => ({
    parts: (p: Part[]) => patch(p, 2, { y: 0.24 + dy }),
    after: (a: After) => {
      for (const [x0, x1] of [[0.1, 0.36], [1.9, 1.64]]) {
        line(a.cv, a.at(x0, 0.5, 24), a.at(x1, 0.3 + dy, 10), '#c49a6a')
        line(a.cv, a.at(x0, 0.5, 24), a.at(x1, 0.7 + dy, 10), '#c49a6a')
      }
    },
  })
  return [frame('lv-hammock', r), ...[0.03, 0, -0.03].map((dy) => frame('lv-hammock', r, swing(dy))), ...[0.07, 0, -0.07, 0].map((dy) => frame('lv-hammock', r, swing(dy)))]
}

// ── 망원경 (C): 보는 동안 경통이 천천히 좌우로 움직인다 ──
function scopeFrames(r: Rot) {
  const aim = (dx: number) => (a: After) => {
    for (const [x, y] of [[0.15, 0.3], [0.85, 0.35], [0.5, 0.85]]) line(a.cv, a.at(0.5, 0.5, 18), a.at(x, y, 0), K.metal)
    line(a.cv, a.at(0.25 - dx, 0.7 - dx, 20), a.at(0.75 + dx, 0.25 + dx, 34), K.white, 3)
    line(a.cv, a.at(0.72 + dx, 0.28 + dx, 33), a.at(0.78 + dx, 0.22 + dx, 35), K.gold, 3)
  }
  return [frame('lv-telescope', r), ...[0.04, 0.08, 0.04, 0].map((dx) => frame('lv-telescope', r, { after: aim(dx) }))]
}

// ── 주방 (C): 화구에 불이 켜지고 김이 오르며 전자레인지 창에 불이 들어온다 ──
function kitchenFrames(r: Rot) {
  return [
    frame('prop-kitchen', r),
    ...F4.map((f) =>
      frame('prop-kitchen', r, {
        parts: (p) =>
          patch(patch(p, 1, { top: (q: Q) => (inRect(q, 0.08, 0.32, 0.25, 0.75) ? ((Math.floor(q.u * 20) + f) % 3 === 0 ? K.orange : K.red) : K.steel) }), 3, { S: (q: Q) => (inRect(q, 0.08, 0.7, 0.15, 0.85) ? (f % 2 ? '#f6d878' : '#f0c860') : K.dark) }),
        draw: (d) => steam(d, 0.6, 0.5, 15, f, 6),
      }),
    ),
  ]
}

// ── 정수기 (C): 물통에 기포가 오르고 꼭지에서 물방울이 떨어진다 ──
function coolerFrames(r: Rot) {
  return [
    frame('prop-cooler', r),
    ...F4.map((f) =>
      frame('prop-cooler', r, {
        draw: (d) => {
          for (const k of [0, 2]) d.cv.set(...d.at(0.5, 0.5, 19 + ((f + k) % 4) * 2), glowOf('#ffffff', 200))
          if (visibleSides(r).py) d.cv.set(...d.at(0.38, 0.78, 10 - (f % 3) * 2), glowOf(K.blue, 230))
        },
      }),
    ),
  ]
}

const useClips = (n = 4) => ({ idle: { frames: [0] }, use: n === 1 ? { frames: [1] } : { frames: [1, 2, 3, 4], ms: 300 } })
export const BUNDLE4: MotionSheetDef[] = [
  { id: 'flower-pot', kind: 'F', ...oneRow(flowerFrames), clips: { party: { frames: [1, 2, 3], ms: 80 } }, still: 0, note: '둥근 화분이라 행 1개' },
  { id: 'beanbag-blue', kind: 'C', ...perRot(seatFrames('beanbag-blue', 1, 3)), clips: useClips(1), still: { idle: 0, use: 1 }, note: '앉은 직원이 가려서 쓰는 중은 1px 눌린 한 장' },
  { id: 'sofa-green', kind: 'C', ...perRot(seatFrames('sofa-green', 5, 6)), clips: useClips(1), still: { idle: 0, use: 1 }, note: '쿠션이 1px 눌린 한 장' },
  { id: 'sofa-pink', kind: 'C', ...perRot(seatFrames('sofa-pink', 5, 6)), clips: useClips(1), still: { idle: 0, use: 1 }, note: '쿠션이 1px 눌린 한 장' },
  { id: 'lv-studio-sofa', kind: 'C', ...perRot(seatFrames('lv-studio-sofa', 5, 7)), clips: useClips(1), still: { idle: 0, use: 1 }, note: '쿠션·베개가 1px 눌린 한 장' },
  { id: 'record-shelf', kind: 'C', ...perRot(recordFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'icecream', kind: 'C', ...perRot(iceFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'vr-booth', kind: 'C', ...perRot(vrFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'dino', kind: 'E', ...perRot(dinoFrames), clips: { react: { frames: [1, 2], ms: 100 } }, still: 0, note: '말풍선(으르렁)은 그림이 아니라 장면 쪽 일이라 뺐다' },
  { id: 'snowman', kind: 'A', ...perRot(snowFrames), clips: { loop: { frames: [0, 1, 2, 3], ms: 750 } }, still: 0 },
  { id: 'lunar-lantern', kind: 'A+G', ...perRot(lanternFrames), clips: { day: { frames: [0, 1, 2, 3], ms: LOOP }, loop: { frames: [0, 1, 2, 3], ms: LOOP }, night: { frames: [4, 5, 6, 7], ms: LOOP } }, still: { day: 0, loop: 0, night: 4 } },
  { id: 'lv-kettle-shelf', kind: 'C', ...perRot(kettleFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'lv-hanger', kind: 'E', ...perRot(hangerFrames), clips: { react: { frames: [1, 2], ms: 100 } }, still: 0 },
  { id: 'lv-shower', kind: 'C', ...perRot(showerFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'lv-dumbbell', kind: 'C', ...perRot(dumbFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'lv-salad-bar', kind: 'C', ...perRot(saladFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'lv-hammock', kind: 'A+C', ...perRot(hammockFrames), clips: { idle: { frames: [0, 1, 2, 3], ms: 750 }, loop: { frames: [0, 1, 2, 3], ms: 750 }, use: { frames: [4, 5, 6, 7], ms: 300 } }, still: { idle: 0, loop: 0, use: 4 } },
  { id: 'lv-telescope', kind: 'C', ...perRot(scopeFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'prop-kitchen', kind: 'C', ...perRot(kitchenFrames), clips: useClips(), still: { idle: 0, use: 1 } },
  { id: 'prop-cooler', kind: 'C', ...perRot(coolerFrames), clips: useClips(), still: { idle: 0, use: 1 } },
]
