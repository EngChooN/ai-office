// 소품 연출 공통 규칙 (연출④ · docs/specs/furniture-motion-guide.md). 순수 함수 — 장면(iso/motionPlayer)·메인(켜짐 저장 검사)·테스트가 같이 쓴다.
// 상품마다 if문을 늘리지 않는다: 상품 → (시트, 종류) 표 PROP_MOTION에 한 줄 더하면 붙는다.
// 시트 규격(칸·기준점·방향 행·클립)은 renderer/map/iso/motion/manifest.json (생성기 scripts/motion-pilot.mts)
import { cellsOf, FACE_STEP, type GridPose } from './furniture.ts'
import type { Cell } from './grid.ts'
import type { Seat } from './seats.ts'

/** 연출 종류 — A 늘 움직임 · B 눌러서 켜고 끄기 · C 직원이 쓸 때 · D 업무 상태 · E 지나가면 · F 행사 때 · G 시간대 */
export type MotionKind = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export interface MotionClip {
  /** 행 안의 프레임 번호 (가로 칸) */
  frames: number[]
  /** 장당 ms. 없으면 한 장짜리 상태 그림 */
  ms?: number
}

/** 시트 한 장의 규격 (manifest.json 한 항목) */
export interface MotionSheet {
  id: string
  file: string
  /** 프레임 칸 크기 (아트 px) */
  cell: [number, number]
  cols: number
  /** 가구 방향(r0~r3) → 시트 행 */
  rowOfRot: number[]
  /** 행마다 기준점 (아트 px, 칸 안) */
  anchors: [number, number][]
  /** 행마다 실제 장수 — 짧은 행에 없는 칸은 0번으로 */
  rowFrames: number[]
  /** 상태 이름 → 클립 (상태 이름 규칙은 STATE_RULES) */
  clips: Record<string, MotionClip>
  /** 움직임 줄이기 때 보일 한 장: 숫자면 모든 상태, 표면 상태별 */
  still: number | Record<string, number>
}

export interface PropMotion {
  sheet: string
  kinds: MotionKind[]
}

/**
 * 상품 → 연출. 같은 그림을 쓰는 상품은 시트를 함께 쓴다 (가이드 3절).
 * 파일럿 3종(연출④-3). 커피 코너·에스프레소 바는 크기가 달라 커피머신 시트를 쓸 수 없다 — 따로 그린 뒤 붙인다
 */
export const PROP_MOTION: Record<string, PropMotion> = {
  'lv-fountain': { sheet: 'lv-fountain', kinds: ['A'] },
  'prop-fountain': { sheet: 'lv-fountain', kinds: ['A'] },
  // F는 시트에 party 클립이 없어 그림 없이 효과로 (가이드 2절 F)
  tv: { sheet: 'tv', kinds: ['B', 'F'] },
  'coffee-machine': { sheet: 'coffee-machine', kinds: ['C'] },
  // 1묶음 — 우선순위 '상' (연출④-5 · scripts/motion/bundle1.mts). 상태 종류가 여럿이면 STATE_RULES가 바탕을 정한다 (켜 둔 B > C > D > G > 꺼 둔 B > A)
  'floor-lamp': { sheet: 'floor-lamp', kinds: ['B', 'G'] },
  'prop-lamp': { sheet: 'floor-lamp', kinds: ['B', 'G'] },
  jukebox: { sheet: 'jukebox', kinds: ['B', 'C'] },
  'neon-sign': { sheet: 'neon-sign', kinds: ['A', 'B', 'G'] },
  treadmill: { sheet: 'treadmill', kinds: ['C'] },
  aquarium: { sheet: 'aquarium', kinds: ['A', 'B'] },
  'prop-aquarium': { sheet: 'aquarium', kinds: ['A', 'B'] },
  rocket: { sheet: 'rocket', kinds: ['A', 'F'] },
  'xmas-tree': { sheet: 'xmas-tree', kinds: ['A', 'G', 'F'] },
  'lv-projector': { sheet: 'lv-projector', kinds: ['B', 'F'] },
  'prop-printer': { sheet: 'prop-printer', kinds: ['D'] },
  // 2묶음 — '중' 상점 가구 (scripts/motion/bundle2.mts). 고양이·강아지는 장면이 펫을 따로 그려 시트를 붙이지 않는다
  fishbowl: { sheet: 'fishbowl', kinds: ['A', 'C'] },
  'lava-lamp': { sheet: 'lava-lamp', kinds: ['A', 'B'] },
  whiteboard: { sheet: 'whiteboard', kinds: ['D', 'F'] },
  dartboard: { sheet: 'dartboard', kinds: ['C'] },
  globe: { sheet: 'globe', kinds: ['A'] },
  'arc-lamp': { sheet: 'arc-lamp', kinds: ['B', 'G'] },
  easel: { sheet: 'easel', kinds: ['C'] },
  'punching-bag': { sheet: 'punching-bag', kinds: ['C', 'E'] },
  popcorn: { sheet: 'popcorn', kinds: ['C'] },
  arcade: { sheet: 'arcade', kinds: ['B', 'C'] },
  'prop-arcade': { sheet: 'arcade', kinds: ['B', 'C'] },
  gacha: { sheet: 'gacha', kinds: ['C'] },
  'clock-tower': { sheet: 'clock-tower', kinds: ['A', 'G'] },
  parrot: { sheet: 'parrot', kinds: ['E', 'C'] },
  foosball: { sheet: 'foosball', kinds: ['C'] },
  'pool-table': { sheet: 'pool-table', kinds: ['C'] },
  claw: { sheet: 'claw', kinds: ['C', 'A'] },
  piano: { sheet: 'piano', kinds: ['C', 'B'] },
  trophy: { sheet: 'trophy', kinds: ['F'] },
  statue: { sheet: 'statue', kinds: ['F', 'A'] },
  robot: { sheet: 'robot', kinds: ['A', 'E'] },
  'gold-bar': { sheet: 'gold-bar', kinds: ['F', 'A'] },
  pumpkin: { sheet: 'pumpkin', kinds: ['A', 'G'] },
  ghost: { sheet: 'ghost', kinds: ['A'] },
  'cherry-tree': { sheet: 'cherry-tree', kinds: ['A'] },
  bookshelf: { sheet: 'bookshelf', kinds: ['C'] },
  // 3묶음 — '중' 레벨 전용·소품 (scripts/motion/bundle3.mts)
  'lv-meeting-table': { sheet: 'lv-meeting-table', kinds: ['F'] },
  'lv-glass-table': { sheet: 'lv-glass-table', kinds: ['F'] },
  'lv-mailbox': { sheet: 'lv-mailbox', kinds: ['D'] },
  'lv-fridge': { sheet: 'lv-fridge', kinds: ['C'] },
  'lv-vending': { sheet: 'lv-vending', kinds: ['B', 'C'] },
  'lv-pingpong': { sheet: 'lv-pingpong', kinds: ['C'] },
  'prop-pingpong': { sheet: 'lv-pingpong', kinds: ['C'] },
  'lv-floor-sign': { sheet: 'lv-floor-sign', kinds: ['D', 'G'] },
  'lv-sleep-pod': { sheet: 'lv-sleep-pod', kinds: ['C'] },
  'prop-napPod': { sheet: 'lv-sleep-pod', kinds: ['C'] },
  'lv-espresso-bar': { sheet: 'lv-espresso-bar', kinds: ['C'] },
  'prop-coffeeCorner': { sheet: 'prop-coffeeCorner', kinds: ['C'] },
  'lv-stage': { sheet: 'lv-stage', kinds: ['F'] },
  'lv-bbq': { sheet: 'lv-bbq', kinds: ['C', 'A'] },
  'prop-bbq': { sheet: 'lv-bbq', kinds: ['C', 'A'] },
  'lv-trophy-case': { sheet: 'lv-trophy-case', kinds: ['F'] },
  'prop-trophies': { sheet: 'lv-trophy-case', kinds: ['F'] },
  'prop-lobbyTrophies': { sheet: 'lv-trophy-case', kinds: ['F'] },
  'lv-hall-of-fame': { sheet: 'lv-hall-of-fame', kinds: ['F'] },
  'lv-tall-bookshelf': { sheet: 'lv-tall-bookshelf', kinds: ['C'] },
  // 4묶음 — '하' (scripts/motion/bundle4.mts). 책상·의자 장비(gear)는 지도에 칸 가구로 그려지지 않아 붙일 그림이 없다
  'flower-pot': { sheet: 'flower-pot', kinds: ['F'] },
  'beanbag-blue': { sheet: 'beanbag-blue', kinds: ['C'] },
  'sofa-green': { sheet: 'sofa-green', kinds: ['C'] },
  'sofa-pink': { sheet: 'sofa-pink', kinds: ['C'] },
  'lv-studio-sofa': { sheet: 'lv-studio-sofa', kinds: ['C'] },
  'record-shelf': { sheet: 'record-shelf', kinds: ['C'] },
  icecream: { sheet: 'icecream', kinds: ['C'] },
  'vr-booth': { sheet: 'vr-booth', kinds: ['C'] },
  dino: { sheet: 'dino', kinds: ['E'] },
  snowman: { sheet: 'snowman', kinds: ['A'] },
  'lunar-lantern': { sheet: 'lunar-lantern', kinds: ['A', 'G'] },
  'lv-kettle-shelf': { sheet: 'lv-kettle-shelf', kinds: ['C'] },
  'lv-hanger': { sheet: 'lv-hanger', kinds: ['E'] },
  'lv-shower': { sheet: 'lv-shower', kinds: ['C'] },
  'lv-dumbbell': { sheet: 'lv-dumbbell', kinds: ['C'] },
  'lv-salad-bar': { sheet: 'lv-salad-bar', kinds: ['C'] },
  'lv-hammock': { sheet: 'lv-hammock', kinds: ['A', 'C'] },
  'lv-telescope': { sheet: 'lv-telescope', kinds: ['C'] },
  'prop-kitchen': { sheet: 'prop-kitchen', kinds: ['C'] },
  'prop-cooler': { sheet: 'prop-cooler', kinds: ['C'] },
  // 움직이지 않음 — 표에 넣지 않는다 (분류표 '없음'). 파티션·가벽 4종(partition-*)은 구조물이라 움직일 장면이 없다
}

export const motionOf = (itemId: string): PropMotion | undefined => PROP_MOTION[itemId]
/** 눌러서 켜고 끄는 상품인가 (B) — 메인이 켜짐 저장 전에 다시 본다 */
export const isToggleable = (itemId: string) => PROP_MOTION[itemId]?.kinds.includes('B') ?? false

/** 장면이 소품마다 알려 주는 신호 */
export interface MotionSignals {
  /** B: 켜 둠 */
  isOn?: boolean
  /** C: 직원이 지금 쓰는 중 */
  isUsed?: boolean
  /** D: 주인이 일하는 중 */
  isWorking?: boolean
  /** G: 밤 */
  isNight?: boolean
}

/**
 * 바탕 상태를 정하는 종류와 그 상태 이름(= 클립 이름). 앞에서부터 보고, null이면 다음 줄로 넘긴다.
 * B는 켜 두었을 때만 이기고, 꺼 두면 C·D·G가 정한다 (밤이면 조명이 켜지고, 직원이 쓰면 주크박스가 켜진다).
 * 그래서 자동으로 켜진 상태는 isOn이 아니다 — isOn은 손으로 켰을 때만 저장된다. 상태 종류가 A보다 먼저 (가이드 2절)
 */
const STATE_RULES: [MotionKind, (s: MotionSignals) => string | null][] = [
  ['B', (s) => (s.isOn ? 'on' : null)],
  ['C', (s) => (s.isUsed ? 'use' : 'idle')],
  ['D', (s) => (s.isWorking ? 'work' : 'off')],
  ['G', (s) => (s.isNight ? 'night' : 'day')],
  // 꺼 둔 B에 넘겨받을 C·D·G가 없으면 꺼짐
  ['B', () => 'off'],
  ['A', () => 'loop'],
]

/** 상태가 바뀔 때 한 번 재생하는 클립 (있는 시트만). 끄기는 바로 꺼짐 장 (가이드 2절 B). 꺼 둔 B의 쉬는 상태(낮·안 씀)에서 켤 때도 켜는 순간 장 */
const ENTER_CLIPS: Record<string, string> = { 'off>on': 'turnOn', 'day>on': 'turnOn', 'idle>on': 'turnOn', 'work>off': 'done' }

/**
 * 순간 종류(E·F) — 바탕 상태 위에 겹쳐 한 번(F는 간격을 두고 몇 번) 재생한다 (가이드 2절).
 * 시트에 clip이 없으면 그림 없이 효과(살짝 들썩임, fxMs)로 대신한다
 */
export const TRIGGERS = {
  /** 직원이 바로 옆 칸에 들어오면 한 번. 같은 소품은 cooldownMs 안에 다시 반응하지 않는다 */
  E: { clip: 'react', times: 1, gapMs: 0, fxMs: 200, cooldownMs: 3000 },
  /** 레벨업·회의 시작 때 다 함께. 1초 간격으로 3번 */
  F: { clip: 'party', times: 3, gapMs: 1000, fxMs: 250, cooldownMs: 0 },
} as const
export type TriggerKind = keyof typeof TRIGGERS

/** 순간 종류가 시작된 지 elapsed ms일 때 보일 프레임. 재생 사이·끝난 뒤면 null (바탕 상태 그림) */
export function triggerFrame(clip: MotionClip, kind: TriggerKind, elapsedMs: number): number | null {
  const { times, gapMs } = TRIGGERS[kind]
  if (!isAnimated(clip) || elapsedMs < 0) return null
  const round = gapMs > 0 ? Math.floor(elapsedMs / gapMs) : 0
  const t = elapsedMs - round * gapMs
  if (round >= times || t >= clipLength(clip)) return null
  return clip.frames[Math.floor(t / clip.ms!)]
}

/** E: 칸 at이 가구 바로 옆(여덟 방향 한 칸)인가 — 가구 칸 위는 아니다 */
export function isBeside(item: GridPose, at: Cell): boolean {
  const cells = cellsOf(item)
  if (cells.some((c) => c.gx === at.gx && c.gy === at.gy)) return false
  return cells.some((c) => Math.abs(c.gx - at.gx) <= 1 && Math.abs(c.gy - at.gy) <= 1)
}

/**
 * D: 이 가구의 일을 보는 직원 — 자리가 이 가구 칸을 바라보면(책상) 그 사람들,
 * 아무도 안 바라보면(프린터·우편함 등 공용) 이 층 전체
 */
export function workersOf<T extends { seat: Pick<Seat, 'gx' | 'gy' | 'face'> | null }>(item: GridPose, staff: readonly T[]): readonly T[] {
  const cells = new Set(cellsOf(item).map((c) => `${c.gx},${c.gy}`))
  const owners = staff.filter((s) => {
    if (!s.seat) return false
    const [dx, dy] = FACE_STEP[s.seat.face]
    return cells.has(`${s.seat.gx + dx},${s.seat.gy + dy}`)
  })
  return owners.length ? owners : staff
}

/** 지금 바탕 상태. 연출이 없거나 순간 종류만 있으면 null (멈춘 기본 그림) */
export function stateOf(kinds: readonly MotionKind[], signals: MotionSignals): string | null {
  for (const [k, rule] of STATE_RULES) {
    const state = kinds.includes(k) ? rule(signals) : null
    if (state !== null) return state
  }
  return null
}

/** from → to로 바뀔 때 먼저 한 번 재생할 클립 이름 (시트에 없으면 null) */
export function enterClipOf(sheet: MotionSheet, from: string | null, to: string): string | null {
  const name = from === null ? undefined : ENTER_CLIPS[`${from}>${to}`]
  return name && sheet.clips[name] ? name : null
}

export const isAnimated = (clip: MotionClip | undefined) => Boolean(clip && clip.ms && clip.frames.length > 1)

/** 한 번 재생하는 클립의 길이 (ms) */
export const clipLength = (clip: MotionClip) => (clip.ms ?? 0) * clip.frames.length

/** 반복 클립의 elapsed ms 시점 프레임 번호 */
export function loopFrame(clip: MotionClip, elapsedMs: number): number {
  if (!isAnimated(clip)) return clip.frames[0] ?? 0
  const i = Math.floor(Math.max(0, elapsedMs) / clip.ms!) % clip.frames.length
  return clip.frames[i]
}

/** 움직임 줄이기 때 그 상태의 한 장 */
export function stillFrameOf(sheet: MotionSheet, state: string | null): number {
  if (typeof sheet.still === 'number') return sheet.still
  return (state !== null ? sheet.still[state] : undefined) ?? (state !== null ? sheet.clips[state]?.frames[0] : undefined) ?? 0
}

/** 방향 r의 시트 칸 번호 (Phaser 스프라이트시트 프레임). 그 행에 없는 프레임이면 0번 (TV 뒷면) */
export function sheetFrameOf(sheet: MotionSheet, rot: number, frame: number): number {
  const row = sheet.rowOfRot[rot] ?? 0
  const col = frame < (sheet.rowFrames[row] ?? 1) ? frame : 0
  return row * sheet.cols + col
}

/** 방향 r의 기준점 비율 (setOrigin) */
export function originOf(sheet: MotionSheet, rot: number): { x: number; y: number } {
  const [ax, ay] = sheet.anchors[sheet.rowOfRot[rot] ?? 0] ?? sheet.anchors[0]
  return { x: ax / sheet.cell[0], y: ay / sheet.cell[1] }
}

/** 소품마다 반복 시작점을 흩어 놓는다 (같은 상품 여럿이 똑같이 움직이지 않게) */
export function phaseOf(uid: string, periodMs: number): number {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  return periodMs > 0 ? h % periodMs : 0
}

/** 동시 동작 상한 — 넘치면 화면 가운데에서 가까운 것부터 */
export const MOTION_CAP = 12

/** 움직일 후보 중 가운데에서 가까운 cap개 */
export function pickNearest<T extends { x: number; y: number }>(cands: readonly T[], center: { x: number; y: number }, cap = MOTION_CAP): T[] {
  if (cands.length <= cap) return [...cands]
  const d = (c: T) => (c.x - center.x) ** 2 + (c.y - center.y) ** 2
  return [...cands].sort((a, b) => d(a) - d(b)).slice(0, cap)
}

/** 이 층에 놓인 상품들이 쓰는 시트 id (지금 보는 레벨·층 것만 올린다) */
export function sheetsFor(itemIds: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const id of itemIds) {
    const m = PROP_MOTION[id]
    if (m) out.add(m.sheet)
  }
  return out
}
