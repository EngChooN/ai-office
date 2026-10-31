// 바탕화면 비서(맥 1차): 캐릭터 창·펼침 창이 함께 쓰는 순수 규칙 — 위치 보정, 끌기/클릭 구분, 결재 처리 가능 여부, 말풍선 우선순위
// 디자인: docs/design/desktop-secretary/README.md · 테스트: scripts/deskPet.test.mts

import type { Approval, Staff } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 캐릭터 그림 크기 — 높이 기준 112px (renderer/deskPet/sprites는 여백 없이 캐릭터만 60×94) */
export const PET_CHAR = { width: 72, height: 112 } as const
/** 캐릭터 창 크기 (말풍선 최대 폭 240px + 여유, 말풍선 두 줄 + 캐릭터 + 배지 여유) */
export const PET_SIZE = { width: 260, height: PET_CHAR.height + 128 } as const
/** 펼침 창 크기 (높이는 화면이 모자라면 줄인다) */
export const PANEL_SIZE = { width: 340, maxHeight: 520, minHeight: 240 } as const
/** 화면 가장자리·캐릭터와 띄우는 거리 */
export const SCREEN_MARGIN = 12
/** 이만큼(px) 넘게 움직이면 클릭이 아니라 끌기 */
export const DRAG_THRESHOLD = 5

/** 누른 곳에서 움직인 거리가 끌기인지 */
export const isDragMove = (dx: number, dy: number) => Math.hypot(dx, dy) > DRAG_THRESHOLD

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

/** 창이 화면 사용 가능 영역 밖으로 나가지 않게 위치를 보정한다 (모니터를 뺐거나 해상도가 바뀐 경우 포함) */
export function clampToArea(bounds: Rect, area: Rect): Rect {
  return {
    ...bounds,
    x: Math.round(clamp(bounds.x, area.x, area.x + area.width - bounds.width)),
    y: Math.round(clamp(bounds.y, area.y, area.y + area.height - bounds.height)),
  }
}

/** 처음 띄울 캐릭터 위치: 화면 오른쪽 아래 */
export const defaultPetBounds = (area: Rect): Rect => ({
  ...PET_SIZE,
  x: area.x + area.width - PET_SIZE.width - SCREEN_MARGIN,
  y: area.y + area.height - PET_SIZE.height - SCREEN_MARGIN,
})

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
  /** 펼침 창이 보일 때마다 (입력창에 포커스를 준다) */
  onPanelShown(cb: () => void): () => void
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
