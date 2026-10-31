// 바탕화면 비서(맥 1차): 캐릭터 창·펼침 창이 함께 쓰는 순수 규칙 — 위치 보정, 끌기/클릭 구분, 결재 처리 가능 여부, 말풍선 우선순위
// 디자인: docs/design/desktop-secretary/README.md · 테스트: scripts/deskPet.test.mts

import type { Approval, AutoHandled, Staff } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 캐릭터 키(px) 설정 범위. 그림(renderer/deskPet/sprites, 여백 없이 60×94)을 이 높이로 늘려 그린다 */
export const PET_SIZE_RANGE = { min: 80, max: 160, step: 8, default: 112 } as const
/** 캐릭터 투명도(%) 설정 범위 */
export const PET_OPACITY_RANGE = { min: 40, max: 100, step: 10, default: 100 } as const
/** 112px일 때 캐릭터 폭 (원본 그림 60×94) */
const DEFAULT_CHAR_WIDTH = 72
/** 말풍선 최대 폭 */
export const BUBBLE_MAX = 240
/** 캐릭터 위 말풍선·배지 자리 */
const BUBBLE_SPACE = 128
/** 창 아래쪽과 캐릭터 사이 */
const CHAR_BOTTOM = 4
/** 펼침 창 크기 (높이는 화면이 모자라면 줄인다) */
export const PANEL_SIZE = { width: 340, maxHeight: 520, minHeight: 240 } as const
/** 화면 가장자리·캐릭터와 띄우는 거리 */
export const SCREEN_MARGIN = 12
/** 놓은 곳이 화면 가장자리에서 이만큼(px) 안이면 가장자리에 붙인다 */
export const SNAP_DISTANCE = 40
/** 이만큼(px) 넘게 움직이면 클릭이 아니라 끌기 */
export const DRAG_THRESHOLD = 5

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

/** 설정값을 범위·단계에 맞춘다 (예전 설정·잘못된 값은 기본값) */
export const petSize = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v / PET_SIZE_RANGE.step) * PET_SIZE_RANGE.step, PET_SIZE_RANGE.min, PET_SIZE_RANGE.max) : PET_SIZE_RANGE.default)
export const petOpacity = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), PET_OPACITY_RANGE.min, PET_OPACITY_RANGE.max) : PET_OPACITY_RANGE.default)

/** 캐릭터가 창의 어느 쪽에 서는지 — 화면 가장자리에 붙어도 말풍선이 창 안(=화면 안)에 남도록 가까운 가장자리 쪽에 선다 */
export type PetAlign = 'left' | 'right'

export interface PetLayout {
  /** 112px 기준 배율 (배지·반짝임·작업 점·생각 중 아이콘 크기와 위치) */
  scale: number
  /** 캐릭터 그림 크기 */
  char: { width: number; height: number }
  /** 캐릭터 창 크기 */
  window: { width: number; height: number }
  /** 캐릭터 옆 장식(배지·반짝임·작업 점)이 삐져나오는 폭 — 캐릭터와 창 옆 가장자리 사이 */
  pad: number
}

/** 캐릭터 키 하나로 그림·창·장식 크기를 정한다 */
export function petLayout(size: number): PetLayout {
  const height = petSize(size)
  const scale = height / PET_SIZE_RANGE.default
  // 112px일 때 72px(지금까지 쓰던 폭)이 되게 112 기준 비율로 — 원본 비율(60/94)과 0.5% 차이
  const char = { width: Math.round((height * DEFAULT_CHAR_WIDTH) / PET_SIZE_RANGE.default), height }
  const pad = Math.ceil(16 * scale)
  return { scale, char, pad, window: { width: Math.max(BUBBLE_MAX + 20, char.width + pad * 2), height: height + BUBBLE_SPACE } }
}

/** 창 안 캐릭터 그림의 화면 좌표 (펼침 창은 창이 아니라 캐릭터 옆에 붙인다) */
export function petCharRect(win: Rect, size: number, align: PetAlign): Rect {
  const { char, pad } = petLayout(size)
  return { ...char, x: align === 'left' ? win.x + pad : win.x + win.width - pad - char.width, y: win.y + win.height - CHAR_BOTTOM - char.height }
}

/** 창이 화면 왼쪽·오른쪽 중 어느 쪽에 가까운지 */
export const petAlignFor = (win: Rect, area: Rect): PetAlign => (win.x + win.width / 2 < area.x + area.width / 2 ? 'left' : 'right')

/** 누른 곳에서 움직인 거리가 끌기인지 */
export const isDragMove = (dx: number, dy: number) => Math.hypot(dx, dy) > DRAG_THRESHOLD

/** 창이 화면 사용 가능 영역 밖으로 나가지 않게 위치를 보정한다 (모니터를 뺐거나 해상도가 바뀐 경우 포함) */
export function clampToArea(bounds: Rect, area: Rect): Rect {
  return {
    ...bounds,
    x: Math.round(clamp(bounds.x, area.x, area.x + area.width - bounds.width)),
    y: Math.round(clamp(bounds.y, area.y, area.y + area.height - bounds.height)),
  }
}

/** 처음 띄울 캐릭터 위치(=다시 불러오기 위치): 화면 오른쪽 아래 */
export function defaultPetBounds(area: Rect, size: number): Rect {
  const { window } = petLayout(size)
  return { ...window, x: area.x + area.width - window.width - SCREEN_MARGIN, y: area.y + area.height - window.height - SCREEN_MARGIN }
}

/** 크기를 바꾸면 캐릭터가 선 쪽 가장자리와 아래쪽을 그대로 두고 창을 다시 잰다 (화면 밖으로 나가지 않게) */
export function resizePet(win: Rect, area: Rect, size: number): Rect {
  const { window } = petLayout(size)
  const x = petAlignFor(win, area) === 'left' ? win.x : win.x + win.width - window.width
  return clampToArea({ ...window, x, y: win.y + win.height - window.height }, area)
}

/** 놓은 뒤 위치: 서는 쪽이 바뀌면 캐릭터가 제자리에 있게 창을 옮기고, 화면 안으로 넣은 뒤, 가장자리에 가까우면 붙인다 */
export function settlePet(win: Rect, area: Rect, size: number, prevAlign: PetAlign): { bounds: Rect; align: PetAlign } {
  const align = petAlignFor(win, area)
  const shift = petCharRect(win, size, prevAlign).x - petCharRect(win, size, align).x
  const b = clampToArea({ ...win, x: win.x + shift }, area)
  const right = area.x + area.width - b.width
  const bottom = area.y + area.height - b.height
  const x = b.x - area.x <= SNAP_DISTANCE ? area.x : right - b.x <= SNAP_DISTANCE ? right : b.x
  const y = b.y - area.y <= SNAP_DISTANCE ? area.y : bottom - b.y <= SNAP_DISTANCE ? bottom : b.y
  return { bounds: { ...b, x, y }, align: petAlignFor({ ...b, x, y }, area) }
}

/** 펼침 창 위치: 캐릭터 옆(왼쪽 우선, 모자라면 오른쪽), 캐릭터 아래쪽에 맞춘다. 높이가 모자라면 줄이고 안에서 스크롤한다 */
export function placePanel(pet: Rect, area: Rect): Rect {
  const height = Math.max(Math.min(PANEL_SIZE.maxHeight, area.height - SCREEN_MARGIN * 2), Math.min(PANEL_SIZE.minHeight, area.height))
  const width = PANEL_SIZE.width
  const leftX = pet.x - width - SCREEN_MARGIN
  const rightX = pet.x + pet.width + SCREEN_MARGIN
  const fitsLeft = leftX >= area.x + SCREEN_MARGIN
  const fitsRight = rightX + width <= area.x + area.width - SCREEN_MARGIN
  // 양쪽 다 모자라면(좁은 화면) 넓은 쪽에 두고 화면 안으로 민다
  const x = fitsLeft ? leftX : fitsRight ? rightX : pet.x - area.x > area.x + area.width - (pet.x + pet.width) ? leftX : rightX
  const y = pet.y + pet.height - height
  const inner = { x: area.x + SCREEN_MARGIN, y: area.y + SCREEN_MARGIN, width: area.width - SCREEN_MARGIN * 2, height: area.height - SCREEN_MARGIN * 2 }
  return clampToArea({ x, y, width, height }, inner)
}

/** 이벤트를 한꺼번에 걸고, 돌려준 함수로 한꺼번에 뗀다 (화면·전원 이벤트를 켤 때 걸고 끌 때 빠짐없이 떼려고) */
export interface EventSource {
  on(event: string, fn: () => void): unknown
  off(event: string, fn: () => void): unknown
}
export function listenAll(pairs: ReadonlyArray<readonly [EventSource, readonly string[]]>, fn: () => void): () => void {
  for (const [src, events] of pairs) for (const ev of events) src.on(ev, fn)
  return () => {
    for (const [src, events] of pairs) for (const ev of events) src.off(ev, fn)
  }
}
/** 캐릭터 위치를 다시 맞출 때: 모니터 연결·분리·해상도/배율 변경(screen), 잠자기·잠금에서 돌아옴(powerMonitor) */
export const REFIT_EVENTS = { screen: ['display-added', 'display-removed', 'display-metrics-changed'], power: ['resume', 'unlock-screen'] } as const

export interface PetApproval extends Approval {
  staffName: string
}

/** 대기 중인 결재 (오래된 것부터). 고용 직원 것만 — 외부 직원 질문은 원래 창에서 답한다 */
export function petApprovals(staff: Staff[]): PetApproval[] {
  return staff
    .filter((s) => s.kind === 'hired')
    .flatMap((s) => s.approvals.map((a) => ({ ...a, staffName: s.name })))
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** 캐릭터 창에서 승인·반려해도 되는지.
 * - 'ok': 지금 대기 중인 평소 결재
 * - 'already': 이미 처리됐거나(다른 화면·휴대폰·자동결재) 없는 결재
 * - 'question': 직원 질문 — 답을 골라야 해서 앱에서만 처리한다 (승인/반려 버튼으로 넘기기가 되지 않게) */
export type PetDecideCheck = 'ok' | 'already' | 'question'

export function checkPetDecide(staff: Staff[], approvalId: string): PetDecideCheck {
  const a = petApprovals(staff).find((x) => x.id === approvalId)
  if (!a) return 'already'
  return a.questions?.length ? 'question' : 'ok'
}

/** 같은 결재를 동시에 두 번 처리하지 않게 막는다 (캐릭터 창 두 번 누름·앱과 동시에 누름) */
export class InFlight {
  private ids = new Set<string>()
  /** 처리를 시작해도 되면 true (이미 처리 중이면 false) */
  begin(id: string) {
    if (this.ids.has(id)) return false
    this.ids.add(id)
    return true
  }
  end(id: string) {
    this.ids.delete(id)
  }
}

export type PetDecideResult = 'done' | 'already' | 'question' | 'busy'

/** 캐릭터 창 결재 처리: 확인 → 중복 막기 → 앱과 같은 처리 함수(decide)로 처리 */
export async function petDecide(
  deps: { staff: () => Staff[]; decide: (approvalId: string, allow: boolean) => boolean | Promise<boolean>; inFlight: InFlight },
  approvalId: string,
  allow: boolean,
): Promise<PetDecideResult> {
  const check = checkPetDecide(deps.staff(), approvalId)
  if (check !== 'ok') return check
  if (!deps.inFlight.begin(approvalId)) return 'busy'
  try {
    return (await deps.decide(approvalId, allow)) ? 'done' : 'already'
  } finally {
    deps.inFlight.end(approvalId)
  }
}

/** 펼침 창 결재 목록에서 목록을 떠난 항목을 잠시 남겨 둔다.
 * - approved·rejected: 이 창에서 내가 처리 (petDecide 'done')
 * - elsewhere: 다른 곳(앱·휴대폰·트레이)에서 처리됐거나 취소돼 목록에서 빠짐, 또는 눌렀더니 이미 처리됨('already')
 * 자동결재가 대신 처리한 건은 결재 목록에 오르지 않으므로(main/office.ts autoDecide) 기존 기록(autoApproveLog)에서 따로 읽는다 — recentAuto */
export type PetSettledKind = 'approved' | 'rejected' | 'elsewhere'
export interface PetSettled {
  approval: PetApproval
  kind: PetSettledKind
  /** 이 시각이 지나면 목록에서 뺀다 */
  until: number
}
/** 처리 결과를 남겨 두는 시간 */
export const SETTLED_MS = 4000
/** 한꺼번에 남겨 두는 최대 수 (몰려서 빠져도 목록이 끝없이 길어지지 않게) */
const SETTLED_MAX = 10

export const pruneSettled = (list: PetSettled[], now: number) => list.filter((s) => s.until > now).slice(-SETTLED_MAX)

/** 내 처리 결과를 남긴다 (같은 결재는 한 번만) */
export const addSettled = (list: PetSettled[], approval: PetApproval, kind: PetSettledKind, now: number) =>
  pruneSettled([...list.filter((s) => s.approval.id !== approval.id), { approval, kind, until: now + SETTLED_MS }], now)

/** 새 스냅샷에서 목록을 떠난 결재를 "다른 곳에서 처리됨"으로 남긴다.
 * 내가 처리하는 중(busy)인 결재는 결과(petDecide)가 정한다 — 스냅샷이 결과보다 먼저 와도 내 결재가 다른 곳 처리로 보이지 않게 */
export function settleVanished(list: PetSettled[], prev: PetApproval[], next: PetApproval[], busy: ReadonlySet<string>, now: number): PetSettled[] {
  const ids = new Set(next.map((a) => a.id))
  const known = new Set(list.map((s) => s.approval.id))
  const vanished = prev.filter((a) => !ids.has(a.id) && !busy.has(a.id) && !known.has(a.id))
  return pruneSettled([...list, ...vanished.map((approval) => ({ approval, kind: 'elsewhere' as const, until: now + SETTLED_MS }))], now)
}

/** 펼침 창에 보이는 자동결재 처리 기록: 최근 것부터 몇 건만 */
export const AUTO_RECENT_MS = 10 * 60_000
const AUTO_RECENT_MAX = 5
export const recentAuto = (log: AutoHandled[], now: number) =>
  log
    .filter((h) => h.at > now - AUTO_RECENT_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, AUTO_RECENT_MAX)

/** 펼침 창의 "앱에서 열기"가 갈 곳: 비서 화면 · 그 결재가 있는 직원 · 앱 첫 화면 */
export type PetOpenTarget = { kind: 'secretary' } | { kind: 'staff'; staffId: string } | { kind: 'app' }

/** 캐릭터 창·펼침 창 preload가 주는 통로 (window.officePet). 사무실 API는 읽기·비서에게 말하기만 window.office로 준다 */
export interface OfficePetApi {
  /** 이 창이 캐릭터('pet')인지 펼침 창('panel')인지 */
  view: 'pet' | 'panel'
  /** 캐릭터·말풍선 위에 마우스가 있으면 true — 나머지 투명한 곳은 클릭이 뒤 창으로 지나간다 */
  setInteractive(isOn: boolean): void
  dragStart(): void
  /** 누른 곳에서 움직인 화면 거리 */
  dragMove(dx: number, dy: number): void
  dragEnd(): void
  togglePanel(): void
  closePanel(): void
  openApp(target: PetOpenTarget): void
  decide(approvalId: string, allow: boolean): Promise<PetDecideResult>
  /** 캐릭터 숨기기 (설정의 "바탕화면 비서 캐릭터 보이기"를 끈다 — 트레이·설정에서 다시 불러온다) */
  hide(): void
  /** 펼침 창이 보일 때마다 (입력창에 포커스를 준다) */
  onPanelShown(cb: () => void): () => void
  /** 캐릭터가 창의 어느 쪽에 서는지 (옮기거나 화면이 바뀔 때마다) */
  onAlign(cb: (align: PetAlign) => void): () => void
}

/** 말풍선 하나: 대답 중 → 새 결재 → 직원 업무 순 (결재 배지는 따로 늘 보인다) */
export type PetBubble = { kind: 'thinking' } | { kind: 'reply'; text: string; isError: boolean } | { kind: 'approval'; count: number; title: string } | { kind: 'working'; count: number } | null

export function pickBubble(s: {
  isBusy: boolean
  /** 방금 끝난 비서 답 (보여 줄 시간이 지나면 null) */
  reply: { text: string; isError: boolean } | null
  /** 새 결재 문구를 보여 줘야 하면 그 제목 */
  newApproval: { count: number; title: string } | null
  workingCount: number
  /** 직원 업무 말풍선을 보여 줄 때인지 (5초 뒤 접는다) */
  isWorkShown: boolean
}): PetBubble {
  if (s.isBusy) return { kind: 'thinking' }
  if (s.reply) return { kind: 'reply', ...s.reply }
  if (s.newApproval) return { kind: 'approval', ...s.newApproval }
  if (s.workingCount > 0 && s.isWorkShown) return { kind: 'working', count: s.workingCount }
  return null
}
