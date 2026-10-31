// 바탕화면 비서(맥 1차): 캐릭터 창·펼침 창이 함께 쓰는 순수 규칙 — 위치 보정, 끌기/클릭 구분, 결재·질문 처리 가능 여부, 말풍선 우선순위
// 디자인: docs/design/desktop-secretary/README.md · 테스트: scripts/deskPet.test.mts

import type {
  Approval,
  AutoHandled,
  ChatMessage,
  Lab,
  LogEntry,
  Staff,
  StaffQuestion,
  Team,
} from "./types";
import { isCompleteAnswer } from "./questionAnswer.ts";
import {
  labRoomId,
  labRoomMembers,
  roomLabs,
  roomMembers,
  roomTeams,
} from "./chatRooms.ts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 캐릭터 키(px) 설정 범위. 그림(renderer/deskPet/sprites, 여백 없이 60×94)을 이 높이로 늘려 그린다 */
export const PET_SIZE_RANGE = {
  min: 80,
  max: 160,
  step: 8,
  default: 112,
} as const;
/** 캐릭터 투명도(%) 설정 범위 */
export const PET_OPACITY_RANGE = {
  min: 40,
  max: 100,
  step: 10,
  default: 100,
} as const;
/** 112px일 때 캐릭터 폭 (원본 그림 60×94) */
const DEFAULT_CHAR_WIDTH = 72;
/** 말풍선 최대 폭 */
export const BUBBLE_MAX = 240;
/** 캐릭터 위 말풍선·배지 자리 */
const BUBBLE_SPACE = 128;
/** 창 아래쪽과 캐릭터 사이 */
const CHAR_BOTTOM = 4;
/** 펼침 창 크기 (높이는 화면이 모자라면 줄인다) */
export const PANEL_SIZE = {
  width: 400,
  maxHeight: 520,
  minHeight: 240,
} as const;
/** 화면 가장자리·캐릭터와 띄우는 거리 */
export const SCREEN_MARGIN = 12;
/** 놓은 곳이 화면 가장자리에서 이만큼(px) 안이면 가장자리에 붙인다 */
export const SNAP_DISTANCE = 40;
/** 이만큼(px) 넘게 움직이면 클릭이 아니라 끌기 */
export const DRAG_THRESHOLD = 5;

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

/** 설정값을 범위·단계에 맞춘다 (예전 설정·잘못된 값은 기본값) */
export const petSize = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? clamp(
        Math.round(v / PET_SIZE_RANGE.step) * PET_SIZE_RANGE.step,
        PET_SIZE_RANGE.min,
        PET_SIZE_RANGE.max,
      )
    : PET_SIZE_RANGE.default;
export const petOpacity = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? clamp(Math.round(v), PET_OPACITY_RANGE.min, PET_OPACITY_RANGE.max)
    : PET_OPACITY_RANGE.default;

/** 캐릭터가 창의 어느 쪽에 서는지 — 화면 가장자리에 붙어도 말풍선이 창 안(=화면 안)에 남도록 가까운 가장자리 쪽에 선다 */
export type PetAlign = "left" | "right";

export interface PetLayout {
  /** 112px 기준 배율 (머리 위 도트 말풍선·반짝임·작업 점 크기와 위치) */
  scale: number;
  /** 캐릭터 그림 크기 */
  char: { width: number; height: number };
  /** 캐릭터 창 크기 */
  window: { width: number; height: number };
  /** 캐릭터 옆 장식(배지·반짝임·작업 점)이 삐져나오는 폭 — 캐릭터와 창 옆 가장자리 사이 */
  pad: number;
}

/** 캐릭터 키 하나로 그림·창·장식 크기를 정한다 */
export function petLayout(size: number): PetLayout {
  const height = petSize(size);
  const scale = height / PET_SIZE_RANGE.default;
  // 112px일 때 72px(지금까지 쓰던 폭)이 되게 112 기준 비율로 — 원본 비율(60/94)과 0.5% 차이
  const char = {
    width: Math.round((height * DEFAULT_CHAR_WIDTH) / PET_SIZE_RANGE.default),
    height,
  };
  const pad = Math.ceil(16 * scale);
  return {
    scale,
    char,
    pad,
    window: {
      width: Math.max(BUBBLE_MAX + 20, char.width + pad * 2),
      height: height + BUBBLE_SPACE,
    },
  };
}

/** 창 안 캐릭터 그림의 화면 좌표 (펼침 창은 창이 아니라 캐릭터 옆에 붙인다) */
export function petCharRect(win: Rect, size: number, align: PetAlign): Rect {
  const { char, pad } = petLayout(size);
  return {
    ...char,
    x: align === "left" ? win.x + pad : win.x + win.width - pad - char.width,
    y: win.y + win.height - CHAR_BOTTOM - char.height,
  };
}

/** 창이 화면 왼쪽·오른쪽 중 어느 쪽에 가까운지 — 서는 쪽을 모를 때(서는 쪽 없이 저장된 예전 위치)만 쓴다 */
export const petAlignFor = (win: Rect, area: Rect): PetAlign =>
  win.x + win.width / 2 < area.x + area.width / 2 ? "left" : "right";

/** 누른 곳에서 움직인 거리가 끌기인지 */
export const isDragMove = (dx: number, dy: number) =>
  Math.hypot(dx, dy) > DRAG_THRESHOLD;

/** 창이 화면 사용 가능 영역 밖으로 나가지 않게 위치를 보정한다 (모니터를 뺐거나 해상도가 바뀐 경우 포함) */
export function clampToArea(bounds: Rect, area: Rect): Rect {
  return {
    ...bounds,
    x: Math.round(clamp(bounds.x, area.x, area.x + area.width - bounds.width)),
    y: Math.round(
      clamp(bounds.y, area.y, area.y + area.height - bounds.height),
    ),
  };
}

/** 처음 띄울 캐릭터 위치(=다시 불러오기 위치): 화면 오른쪽 아래 */
export function defaultPetBounds(area: Rect, size: number): Rect {
  const { window } = petLayout(size);
  return {
    ...window,
    x: area.x + area.width - window.width - SCREEN_MARGIN,
    y: area.y + area.height - window.height - SCREEN_MARGIN,
  };
}

/** 크기를 바꾸면 캐릭터가 선 쪽 가장자리와 아래쪽을 그대로 두고 창을 다시 잰다 (화면 밖으로 나가지 않게) */
export function resizePet(
  win: Rect,
  area: Rect,
  size: number,
  align: PetAlign,
): Rect {
  const { window } = petLayout(size);
  const x = align === "left" ? win.x : win.x + win.width - window.width;
  return clampToArea(
    { ...window, x, y: win.y + win.height - window.height },
    area,
  );
}

/**
 * 놓은 뒤 위치: 서는 쪽이 바뀌면 캐릭터가 제자리에 있게 창을 옮기고, 화면 안으로 넣은 뒤, 가장자리에 가까우면 붙인다.
 * 서는 쪽은 창이 아니라 캐릭터(지금 보이는 자리)의 가운데로 정한다 — 창 가운데로 정하면 창을 옮긴 뒤 다시 잴 때
 * 서는 쪽이 되돌아가 캐릭터가 튄다. 그래서 돌려준 align을 창 위치에서 다시 계산하지 말고 그대로 써야 한다
 */
export function settlePet(
  win: Rect,
  area: Rect,
  size: number,
  prevAlign: PetAlign,
): { bounds: Rect; align: PetAlign } {
  const char = petCharRect(win, size, prevAlign);
  const align: PetAlign =
    char.x + char.width / 2 < area.x + area.width / 2 ? "left" : "right";
  const shift =
    petCharRect(win, size, prevAlign).x - petCharRect(win, size, align).x;
  const b = clampToArea({ ...win, x: win.x + shift }, area);
  const right = area.x + area.width - b.width;
  const bottom = area.y + area.height - b.height;
  const x =
    b.x - area.x <= SNAP_DISTANCE
      ? area.x
      : right - b.x <= SNAP_DISTANCE
        ? right
        : b.x;
  const y =
    b.y - area.y <= SNAP_DISTANCE
      ? area.y
      : bottom - b.y <= SNAP_DISTANCE
        ? bottom
        : b.y;
  return { bounds: { ...b, x, y }, align };
}

/** 펼침 창 위치: 캐릭터 옆(왼쪽 우선, 모자라면 오른쪽), 캐릭터 아래쪽에 맞춘다. 높이가 모자라면 줄이고 안에서 스크롤한다 */
export function placePanel(pet: Rect, area: Rect): Rect {
  const height = Math.max(
    Math.min(PANEL_SIZE.maxHeight, area.height - SCREEN_MARGIN * 2),
    Math.min(PANEL_SIZE.minHeight, area.height),
  );
  const width = PANEL_SIZE.width;
  const leftX = pet.x - width - SCREEN_MARGIN;
  const rightX = pet.x + pet.width + SCREEN_MARGIN;
  const fitsLeft = leftX >= area.x + SCREEN_MARGIN;
  const fitsRight = rightX + width <= area.x + area.width - SCREEN_MARGIN;
  // 양쪽 다 모자라면(좁은 화면) 넓은 쪽에 두고 화면 안으로 민다
  const x = fitsLeft
    ? leftX
    : fitsRight
      ? rightX
      : pet.x - area.x > area.x + area.width - (pet.x + pet.width)
        ? leftX
        : rightX;
  const y = pet.y + pet.height - height;
  const inner = {
    x: area.x + SCREEN_MARGIN,
    y: area.y + SCREEN_MARGIN,
    width: area.width - SCREEN_MARGIN * 2,
    height: area.height - SCREEN_MARGIN * 2,
  };
  return clampToArea({ x, y, width, height }, inner);
}

/** 이벤트를 한꺼번에 걸고, 돌려준 함수로 한꺼번에 뗀다 (화면·전원 이벤트를 켤 때 걸고 끌 때 빠짐없이 떼려고) */
export interface EventSource {
  on(event: string, fn: () => void): unknown;
  off(event: string, fn: () => void): unknown;
}
export function listenAll(
  pairs: ReadonlyArray<readonly [EventSource, readonly string[]]>,
  fn: () => void,
): () => void {
  for (const [src, events] of pairs) for (const ev of events) src.on(ev, fn);
  return () => {
    for (const [src, events] of pairs) for (const ev of events) src.off(ev, fn);
  };
}
/** 캐릭터 위치를 다시 맞출 때: 모니터 연결·분리·해상도/배율 변경(screen), 잠자기·잠금에서 돌아옴(powerMonitor) */
export const REFIT_EVENTS = {
  screen: ["display-added", "display-removed", "display-metrics-changed"],
  power: ["resume", "unlock-screen"],
} as const;

export interface PetApproval extends Approval {
  staffName: string;
  staffRole: string;
}

/** 대기 중인 결재 (오래된 것부터). 고용 직원 것만 — 외부 직원 질문은 원래 창에서 답한다 */
export function petApprovals(staff: Staff[]): PetApproval[] {
  return staff
    .filter((s) => s.kind === "hired")
    .flatMap((s) =>
      s.approvals.map((a) => ({ ...a, staffName: s.name, staffRole: s.role })),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** 캐릭터 창에서 승인·반려해도 되는지.
 * - 'ok': 지금 대기 중인 평소 결재
 * - 'already': 이미 처리됐거나(다른 화면·휴대폰·자동결재) 없는 결재
 * - 'question': 직원 질문 — 승인/반려 버튼으로 넘어가지 않게 막는다 (질문은 답하기·넘기기 길 petAnswer·petSkipQuestion으로) */
export type PetDecideCheck = "ok" | "already" | "question";

export function checkPetDecide(
  staff: Staff[],
  approvalId: string,
): PetDecideCheck {
  const a = petApprovals(staff).find((x) => x.id === approvalId);
  if (!a) return "already";
  return a.questions?.length ? "question" : "ok";
}

/** 같은 결재를 동시에 두 번 처리하지 않게 막는다 (캐릭터 창 두 번 누름·앱과 동시에 누름) */
export class InFlight {
  private ids = new Set<string>();
  /** 처리를 시작해도 되면 true (이미 처리 중이면 false) */
  begin(id: string) {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    return true;
  }
  end(id: string) {
    this.ids.delete(id);
  }
}

export type PetDecideResult = "done" | "already" | "question" | "busy";

/** 캐릭터 창 결재 처리: 확인 → 중복 막기 → 앱과 같은 처리 함수(decide)로 처리 */
export async function petDecide(
  deps: {
    staff: () => Staff[];
    decide: (approvalId: string, allow: boolean) => boolean | Promise<boolean>;
    inFlight: InFlight;
  },
  approvalId: string,
  allow: boolean,
): Promise<PetDecideResult> {
  const check = checkPetDecide(deps.staff(), approvalId);
  if (check !== "ok") return check;
  if (!deps.inFlight.begin(approvalId)) return "busy";
  try {
    return (await deps.decide(approvalId, allow)) ? "done" : "already";
  } finally {
    deps.inFlight.end(approvalId);
  }
}

/** 펼침 창(폭 340px)에서 바로 답하기에 알맞은 질문인지. 하나라도 넘으면 '앱에서 열기'로 넘긴다.
 * 결재 칸은 펼침 창 높이의 45%(약 230px)라 질문 3개부터는 스크롤 안에서 길을 잃고, 글 폭(약 284px)에 한글 한 줄 약 22자라 질문은 5줄·이름 2줄·설명 4줄까지 */
export const PET_QUESTION_LIMIT = {
  maxQuestions: 2,
  minOptions: 2,
  maxOptions: 4,
  question: 120,
  label: 40,
  description: 80,
  total: 600,
} as const;
/** 한글·이모지를 글자 단위로 센다 */
const charCount = (s: string) => [...s].length;

export function fitsPetPanel(questions: StaffQuestion[]): boolean {
  const L = PET_QUESTION_LIMIT;
  if (!questions.length || questions.length > L.maxQuestions) return false;
  let total = 0;
  for (const q of questions) {
    if (
      q.options.length < L.minOptions ||
      q.options.length > L.maxOptions ||
      charCount(q.question) > L.question
    )
      return false;
    if (
      q.options.some(
        (o) =>
          charCount(o.label) > L.label ||
          charCount(o.description) > L.description,
      )
    )
      return false;
    total +=
      charCount(q.question) +
      q.options.reduce(
        (n, o) => n + charCount(o.label) + charCount(o.description),
        0,
      );
  }
  return total <= L.total;
}

/** 캐릭터 창에서 질문을 답하거나 넘겨도 되는지 (승인·반려 길인 checkPetDecide와 따로 — 평소 결재가 답하기 길로 승인되지 않게).
 * - 'ok': 펼침 창에 알맞은 대기 중인 질문
 * - 'already': 이미 처리됐거나 없는 질문 · 'notQuestion': 평소 결재 · 'tooComplex': 앱에서 답할 질문 · 'invalid': 답이 질문과 맞지 않음(답하기만) */
export type PetAnswerCheck =
  "ok" | "already" | "notQuestion" | "tooComplex" | "invalid";

/** 넘기기 자격: 펼침 창에 알맞은 대기 중인 질문인지 (답은 보지 않는다) */
export function checkPetQuestion(
  staff: Staff[],
  approvalId: string,
): Exclude<PetAnswerCheck, "invalid"> {
  const a = petApprovals(staff).find((x) => x.id === approvalId);
  if (!a) return "already";
  if (!a.questions?.length) return "notQuestion";
  return fitsPetPanel(a.questions) ? "ok" : "tooComplex";
}

/** 답하기 자격: 넘기기 자격에 더해 답이 질문마다 빈칸 없이 꼭 맞아야 한다 — 답이 없거나(undefined) 비어도 'invalid'.
 * 처리 함수(answerQuestion)가 질문 대기를 풀기 전에 여기서 거른다 */
export function checkPetAnswer(
  staff: Staff[],
  approvalId: string,
  answers: unknown,
): PetAnswerCheck {
  const check = checkPetQuestion(staff, approvalId);
  if (check !== "ok") return check;
  const questions = petApprovals(staff).find(
    (x) => x.id === approvalId,
  )!.questions!;
  return isCompleteAnswer(questions, answers) ? "ok" : "invalid";
}

export type PetAnswerResult = "done" | "busy" | Exclude<PetAnswerCheck, "ok">;

/** 확인 → 중복 막기(결재와 같은 InFlight) → 앱과 같은 처리 함수 */
async function runQuestion(
  inFlight: InFlight,
  approvalId: string,
  check: PetAnswerCheck,
  fn: () => boolean | Promise<boolean>,
): Promise<PetAnswerResult> {
  if (check !== "ok") return check;
  if (!inFlight.begin(approvalId)) return "busy";
  try {
    return (await fn()) ? "done" : "already";
  } finally {
    inFlight.end(approvalId);
  }
}

/** 캐릭터 창에서 질문에 답한다 — 앱과 같은 answerQuestion으로 */
export function petAnswer(
  deps: {
    staff: () => Staff[];
    answerQuestion: (
      approvalId: string,
      answers: Record<string, string>,
    ) => boolean | Promise<boolean>;
    inFlight: InFlight;
  },
  approvalId: string,
  answers: unknown,
): Promise<PetAnswerResult> {
  return runQuestion(
    deps.inFlight,
    approvalId,
    checkPetAnswer(deps.staff(), approvalId, answers),
    () => deps.answerQuestion(approvalId, answers as Record<string, string>),
  );
}

/** 캐릭터 창에서 질문을 넘긴다(답 없이 알아서 판단) — 앱의 "넘기기"와 같은 decide(id, false)로 */
export function petSkipQuestion(
  deps: {
    staff: () => Staff[];
    decide: (approvalId: string, allow: boolean) => boolean | Promise<boolean>;
    inFlight: InFlight;
  },
  approvalId: string,
): Promise<PetAnswerResult> {
  return runQuestion(
    deps.inFlight,
    approvalId,
    checkPetQuestion(deps.staff(), approvalId),
    () => deps.decide(approvalId, false),
  );
}

/** 펼침 창 결재 목록에서 목록을 떠난 항목을 잠시 남겨 둔다.
 * - approved·rejected·answered·skipped: 이 창에서 내가 처리 (petDecide·petAnswer·petSkipQuestion 'done')
 * - elsewhere: 다른 곳(앱·휴대폰·트레이)에서 처리됐거나 취소돼 목록에서 빠짐, 또는 눌렀더니 이미 처리됨('already')
 * 자동결재가 대신 처리한 건은 결재 목록에 오르지 않으므로(main/office.ts autoDecide) 기존 기록(autoApproveLog)에서 따로 읽는다 — recentAuto */
export type PetSettledKind =
  "approved" | "rejected" | "answered" | "skipped" | "elsewhere";
export interface PetSettled {
  approval: PetApproval;
  kind: PetSettledKind;
  /** 이 시각이 지나면 목록에서 뺀다 */
  until: number;
}
/** 처리 결과를 남겨 두는 시간 */
export const SETTLED_MS = 4000;
/** 한꺼번에 남겨 두는 최대 수 (몰려서 빠져도 목록이 끝없이 길어지지 않게) */
const SETTLED_MAX = 10;

export const pruneSettled = (list: PetSettled[], now: number) =>
  list.filter((s) => s.until > now).slice(-SETTLED_MAX);

/** 내 처리 결과를 남긴다 (같은 결재는 한 번만) */
export const addSettled = (
  list: PetSettled[],
  approval: PetApproval,
  kind: PetSettledKind,
  now: number,
) =>
  pruneSettled(
    [
      ...list.filter((s) => s.approval.id !== approval.id),
      { approval, kind, until: now + SETTLED_MS },
    ],
    now,
  );

/** 새 스냅샷에서 목록을 떠난 결재를 "다른 곳에서 처리됨"으로 남긴다.
 * 내가 처리하는 중(busy)인 결재는 결과(petDecide)가 정한다 — 스냅샷이 결과보다 먼저 와도 내 결재가 다른 곳 처리로 보이지 않게 */
export function settleVanished(
  list: PetSettled[],
  prev: PetApproval[],
  next: PetApproval[],
  busy: ReadonlySet<string>,
  now: number,
): PetSettled[] {
  const ids = new Set(next.map((a) => a.id));
  const known = new Set(list.map((s) => s.approval.id));
  const vanished = prev.filter(
    (a) => !ids.has(a.id) && !busy.has(a.id) && !known.has(a.id),
  );
  return pruneSettled(
    [
      ...list,
      ...vanished.map((approval) => ({
        approval,
        kind: "elsewhere" as const,
        until: now + SETTLED_MS,
      })),
    ],
    now,
  );
}

/** 펼침 창에 보이는 자동결재 처리 기록: 최근 것부터 몇 건만 */
export const AUTO_RECENT_MS = 10 * 60_000;
const AUTO_RECENT_MAX = 5;
export const recentAuto = (log: AutoHandled[], now: number) =>
  log
    .filter((h) => h.at > now - AUTO_RECENT_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, AUTO_RECENT_MAX);

/** 펼침 창의 "앱에서 열기"가 갈 곳: 비서 화면 · 그 결재가 있는 직원 · 앱 첫 화면 */
export type PetOpenTarget =
  { kind: "secretary" } | { kind: "staff"; staffId: string } | { kind: "app" };

/** 캐릭터 창·펼침 창 preload가 주는 통로 (window.officePet). 사무실 API는 읽기·비서에게 말하기만 window.office로 준다 */
export interface OfficePetApi {
  /** 이 창이 캐릭터('pet')인지 펼침 창('panel')인지 */
  view: "pet" | "panel";
  /** 캐릭터·말풍선 위에 마우스가 있으면 true — 나머지 투명한 곳은 클릭이 뒤 창으로 지나간다 */
  setInteractive(isOn: boolean): void;
  dragStart(): void;
  /** 누른 곳에서 움직인 화면 거리 */
  dragMove(dx: number, dy: number): void;
  dragEnd(): void;
  togglePanel(): void;
  closePanel(): void;
  openApp(target: PetOpenTarget): void;
  decide(approvalId: string, allow: boolean): Promise<PetDecideResult>;
  /** 질문에 답하기·넘기기 (펼침 창에 알맞은 질문만 — checkPetAnswer·checkPetQuestion) */
  answer(
    approvalId: string,
    answers: Record<string, string>,
  ): Promise<PetAnswerResult>;
  skip(approvalId: string): Promise<PetAnswerResult>;
  /** 캐릭터 숨기기 (설정의 "바탕화면 비서 캐릭터 보이기"를 끈다 — 트레이·설정에서 다시 불러온다) */
  hide(): void;
  /** 펼침 창이 보일 때마다 (입력창에 포커스를 준다) */
  onPanelShown(cb: () => void): () => void;
  /** 캐릭터가 창의 어느 쪽에 서는지 (옮기거나 화면이 바뀔 때마다) */
  onAlign(cb: (align: PetAlign) => void): () => void;
  /** 펼침 창에서 결재·질문을 처리한 결과 표정 (캐릭터 창이 받는다 — outcomeFace) */
  onFace(cb: (face: PetFlashFace) => void): () => void;
}

/** 캐릭터 움직임 (확정 그림 한 장에 CSS transform — renderer/index.css .pet-motion).
 * 평소엔 숨쉬기(발밑 기준 아주 작은 들썩임)를 되풀이하고, 가끔 동작(두리번 'look'·폴짝 'hop')이나 결재 알림('alert' 폴짝 두 번)이 그 자리를 잠깐 대신한다.
 * 시간 값은 디자인 README 동작 제안표를 따르되 숨쉬기는 대표 지시(2~3초)에 맞춰 2.4초 — 가끔 동작 15~30초 간격, 결재 알림은 폴짝(0.35초) 두 번.
 * 동작 시간은 여기 한 곳에서 정하고 CSS 변수로 넘긴다 (petMotionVars → index.css .pet-motion) */
export type PetAct = "look" | "hop" | "alert";
export const PET_MOTION = {
  breatheMs: 2400,
  lookMs: 900,
  hopMs: 400,
  alertHopMs: 350,
  alertHops: 2,
  idleMinMs: 15_000,
  idleMaxMs: 30_000,
} as const;
/** .pet-motion에 줄 CSS 변수 (동작 시간) */
export const petMotionVars = () => ({
  "--pet-breathe": `${PET_MOTION.breatheMs}ms`,
  "--pet-look": `${PET_MOTION.lookMs}ms`,
  "--pet-hop": `${PET_MOTION.hopMs}ms`,
  "--pet-alert-hop": `${PET_MOTION.alertHopMs}ms`,
  "--pet-alert-hops": String(PET_MOTION.alertHops),
});

/** 다음 가끔 동작까지 기다릴 시간 (r: 0 이상 1 미만 난수) */
export const nextIdleDelay = (r: number) =>
  PET_MOTION.idleMinMs + r * (PET_MOTION.idleMaxMs - PET_MOTION.idleMinMs);
/** 가끔 동작 고르기: 두리번이나 폴짝 반반 */
export const pickIdleAct = (r: number): PetAct => (r < 0.5 ? "look" : "hop");
/** 동작이 겹칠 때: 결재 알림이 이기고, 다른 동작 중에 온 가끔 동작은 버린다 (결재 두 건이 연달아 와도 알림은 한 번) */
export const mergeAct = (cur: PetAct | null, next: PetAct): PetAct =>
  next === "alert" ? "alert" : (cur ?? next);
/** 움직여도 되는지 — 움직임 줄이기·창이 안 보임·끄는 중이면 모두 멈춘다 */
export const canPetMove = (s: {
  isReduced: boolean;
  isHidden: boolean;
  isDragging: boolean;
}) => !s.isReduced && !s.isHidden && !s.isDragging;

/** 캐릭터 표정 (얼굴만 바꾼 그림 — docs/design/desktop-secretary/face-sprites.py). 움직임이 아니라서 움직임 줄이기에서도 바뀐다.
 * 잠깐 나오는 표정(놀람·기쁨·걱정)은 끝나는 시각을, 계속되는 표정(생각 중·집중·졸림)은 지금 상태를 보고 고른다 */
export type PetFace =
  | "idle"
  | "surprised"
  | "worried"
  | "happy"
  | "thinking"
  | "focused"
  | "sleepy";
/** 잠깐 나오는 표정의 시간, 조용하면 조는 데 걸리는 시간 */
export const PET_FACE = {
  surprisedMs: 1500,
  happyMs: 1500,
  worriedMs: 3000,
  sleepyMs: 10 * 60_000,
} as const;
export type PetFlashFace = "surprised" | "happy" | "worried";
export const FLASH_MS: Record<PetFlashFace, number> = {
  surprised: PET_FACE.surprisedMs,
  happy: PET_FACE.happyMs,
  worried: PET_FACE.worriedMs,
};

export interface PetFaceState {
  now: number;
  /** 잠깐 나오는 표정마다 끝나는 시각 (없으면 0) */
  until: Record<PetFlashFace, number>;
  /** 비서가 대답을 만드는 중 */
  isThinking: boolean;
  /** 직원이 일하는 중 */
  isWorking: boolean;
  hasApproval: boolean;
  /** 마지막으로 무슨 일이 있었던 시각 (결재·대답·직원 작업·사용자 조작) */
  quietSince: number;
}

/** 겹치면 놀람 → 걱정 → 기쁨 → 생각 중 → 집중 → 졸림 → 평소 순으로 하나만 */
export function pickFace(s: PetFaceState): PetFace {
  for (const face of ["surprised", "worried", "happy"] as const)
    if (s.until[face] > s.now) return face;
  if (s.isThinking) return "thinking";
  if (s.isWorking) return "focused";
  if (!s.hasApproval && s.now - s.quietSince >= PET_FACE.sleepyMs)
    return "sleepy";
  return "idle";
}

/** 표정이 저절로 바뀔 다음 시각 (잠깐 표정이 끝나거나 졸기 시작할 때). 없으면 null — 이때 한 번 다시 고른다 */
export function nextFaceChange(s: PetFaceState): number | null {
  const times = Object.values(s.until).filter((t) => t > s.now);
  if (!s.isThinking && !s.isWorking && !s.hasApproval) {
    const sleepAt = s.quietSince + PET_FACE.sleepyMs;
    if (sleepAt > s.now) times.push(sleepAt);
  }
  return times.length ? Math.min(...times) : null;
}

/** 펼침 창 처리 결과 → 캐릭터 표정: 해내면 기쁨, 못 하면 걱정. 이미 처리됨·다른 곳에서 처리 중은 실패가 아니라서 표정 없음 */
export const outcomeFace = (
  r: PetDecideResult | PetAnswerResult,
): PetFlashFace | null =>
  r === "done" ? "happy" : r === "busy" || r === "already" ? null : "worried";

/** 말풍선 하나: 대답 중 → 새 결재 → 업무 완료 → 직원 업무 순 (결재 배지는 따로 늘 보인다) */
export type PetBubble =
  | { kind: "thinking" }
  | { kind: "reply"; text: string; isError: boolean }
  | { kind: "approval"; count: number; title: string }
  | { kind: "done"; staffName: string; count: number }
  | { kind: "working"; count: number }
  | null;

export function pickBubble(s: {
  isBusy: boolean;
  /** 방금 끝난 비서 답 (보여 줄 시간이 지나면 null) */
  reply: { text: string; isError: boolean } | null;
  /** 새 결재 문구를 보여 줘야 하면 그 제목 */
  newApproval: { count: number; title: string } | null;
  /** 방금 일을 끝낸 직원 (보여 줄 시간이 지나면 null) — count는 한꺼번에 끝낸 인원 */
  done?: { staffName: string; count: number } | null;
  workingCount: number;
  /** 직원 업무 말풍선을 보여 줄 때인지 (5초 뒤 접는다) */
  isWorkShown: boolean;
}): PetBubble {
  if (s.isBusy) return { kind: "thinking" };
  if (s.reply) return { kind: "reply", ...s.reply };
  if (s.newApproval) return { kind: "approval", ...s.newApproval };
  if (s.done) return { kind: "done", ...s.done };
  if (s.workingCount > 0 && s.isWorkShown)
    return { kind: "working", count: s.workingCount };
  return null;
}

// ── 펼침 창 대화 흐름 (docs/design/desktop-secretary/README.md "대화 흐름·윈도우 배치 추가 시안") ──────────────
// 상대(비서·직원·대화방)를 고르고, 그 상대의 메시지와 결재·질문·완료 카드를 시간순으로 한 줄에 섞는다

/** 펼침 창에서 말을 거는 상대. room ''은 전체 방, 팀 id는 팀 방, 'lab:<랩 id>'는 랩 방 (shared/chatRooms.ts) */
export type PetTarget =
  | { kind: "secretary" }
  | { kind: "staff"; staffId: string }
  | { kind: "room"; room: string };
export const PET_SECRETARY: PetTarget = { kind: "secretary" };
export const petTargetKey = (t: PetTarget) =>
  t.kind === "secretary"
    ? "secretary"
    : t.kind === "staff"
      ? `staff:${t.staffId}`
      : `room:${t.room}`;

export interface PetTargetOption {
  target: PetTarget;
  /** 전체 방은 이름이 없다 — 화면이 번역한 이름을 쓴다 */
  name: string;
  /** 대화방이면 참여 직원 id (그 방 직원의 결재를 함께 보여 준다) */
  memberIds?: string[];
}

/** 고를 수 있는 상대: 비서 → 고용 직원 → 대화방(전체 방 · 팀 방 · 랩 방 — 앱 단체방 탭과 같은 순서) */
export function petTargets(s: { staff: Staff[]; teams: Team[]; labs: Lab[] }): {
  secretary: PetTargetOption;
  staff: PetTargetOption[];
  rooms: PetTargetOption[];
} {
  const hired = s.staff.filter((x) => x.kind === "hired");
  const rooms: PetTargetOption[] = [
    {
      target: { kind: "room", room: "" },
      name: "",
      memberIds: hired.map((x) => x.id),
    },
    ...roomTeams(s.teams).map((tm) => ({
      target: { kind: "room", room: tm.id } as PetTarget,
      name: tm.name,
      memberIds: roomMembers(tm, hired).map((x) => x.id),
    })),
    ...roomLabs(s.labs).map((lb) => ({
      target: { kind: "room", room: labRoomId(lb.id) } as PetTarget,
      name: lb.name,
      memberIds: labRoomMembers(lb, hired).map((x) => x.id),
    })),
  ];
  return {
    secretary: { target: PET_SECRETARY, name: "" },
    staff: hired.map((x) => ({
      target: { kind: "staff", staffId: x.id },
      name: x.name,
    })),
    rooms,
  };
}

/** 지금 상대를 목록에서 찾는다 — 그 사이 직원을 내보냈거나 방이 없어졌으면 비서로 돌아간다 */
export function findPetTarget(
  target: PetTarget,
  list: ReturnType<typeof petTargets>,
): PetTargetOption {
  const key = petTargetKey(target);
  return (
    [...list.staff, ...list.rooms].find(
      (o) => petTargetKey(o.target) === key,
    ) ?? list.secretary
  );
}

/** 지금 일하는 고용 직원 수 (머리줄 "작업 중 N명" · 캐릭터 업무 말풍선) */
export const petWorkingCount = (staff: Staff[]) =>
  staff.filter((s) => s.kind === "hired" && s.status === "working").length;

/** 대화 흐름 한 줄. at(발생 시각)으로 줄 세운다 */
export type PetFeedItem =
  | {
      kind: "message";
      key: string;
      at: number;
      isMine: boolean;
      author?: string;
      text: string;
      isMarkdown: boolean;
      isError?: boolean;
      hasCard?: boolean;
    }
  | { kind: "approval"; key: string; at: number; approval: PetApproval }
  | {
      kind: "done";
      key: string;
      at: number;
      staffId: string;
      staffName: string;
      summary: string;
    }
  | { kind: "auto"; key: string; at: number; handled: AutoHandled };

/** 시간순으로 섞는다 (같은 시각이면 넣은 순서 그대로) */
export const mergeFeed = (...lists: PetFeedItem[][]) =>
  lists
    .flat()
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.at - b.item.at || a.i - b.i)
    .map((x) => x.item);

/** 완료 카드 요약 한 줄: 보고의 첫 글 줄에서 마크다운 기호를 걷어 내고 자른다 */
export const DONE_SUMMARY_MAX = 80;
export function summaryLine(text: string): string {
  const line =
    text
      .split("\n")
      .map((l) =>
        l
          .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, "")
          .replace(/[*_`~]/g, "")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .trim(),
      )
      .find((l) => l && !/^[-=|:\s]+$/.test(l)) ?? "";
  const chars = [...line];
  return chars.length > DONE_SUMMARY_MAX
    ? `${chars.slice(0, DONE_SUMMARY_MAX).join("")}…`
    : line;
}

/** 비서 대화에 섞을 완료 카드: 직원이 올린 보고(단체방 글 — main/office.ts가 보고마다 남긴다). 최근 것만 */
export const DONE_RECENT_MS = 24 * 60 * 60_000;
const DONE_RECENT_MAX = 5;
export function doneFromChat(
  chat: ChatMessage[],
  staff: Staff[],
  now: number,
): PetFeedItem[] {
  const hired = new Map(
    staff.filter((s) => s.kind === "hired").map((s) => [s.id, s]),
  );
  return chat
    .filter(
      (m) =>
        m.from !== "me" &&
        !m.approval &&
        hired.has(m.from) &&
        m.ts > now - DONE_RECENT_MS,
    )
    .slice(-DONE_RECENT_MAX)
    .map((m) => ({
      kind: "done",
      key: `done:chat:${m.id}`,
      at: m.ts,
      staffId: m.from,
      staffName: hired.get(m.from)!.name,
      summary: summaryLine(m.text),
    }));
}

/** 직원 대화: 지시·답은 말풍선, 업무가 끝난 기록(result)은 바로 앞 답을 요약한 완료 카드 */
export function staffFeed(
  logs: LogEntry[],
  staffName: string,
  max: number,
): PetFeedItem[] {
  const out: PetFeedItem[] = [];
  let lastReply = "";
  for (const l of logs) {
    if (l.type === "instruction")
      out.push({
        kind: "message",
        key: `log:${l.id}`,
        at: l.ts,
        isMine: true,
        text: l.text,
        isMarkdown: false,
      });
    else if (l.type === "reply") {
      lastReply = l.text;
      out.push({
        kind: "message",
        key: `log:${l.id}`,
        at: l.ts,
        isMine: false,
        text: l.text,
        isMarkdown: true,
      });
    } else if (l.type === "result") {
      out.push({
        kind: "done",
        key: `done:log:${l.id}`,
        at: l.ts,
        staffId: l.staffId,
        staffName,
        summary: summaryLine(lastReply),
      });
      lastReply = "";
    }
  }
  return out.slice(-max);
}

/** 대화방 글: 내 글은 오른쪽, 직원 글은 이름과 함께. 결재 메시지는 결재 카드가 대신 보여 준다 */
export function roomFeed(
  chat: ChatMessage[],
  room: string,
  nameOf: (id: string) => string,
  max: number,
): PetFeedItem[] {
  return chat
    .filter((m) => (m.room ?? "") === room && !m.approval)
    .slice(-max)
    .map((m) => ({
      kind: "message",
      key: `chat:${m.id}`,
      at: m.ts,
      isMine: m.from === "me",
      author: m.from === "me" ? undefined : nameOf(m.from),
      text: m.text,
      isMarkdown: m.from !== "me",
    }));
}

/** 상대에 맞는 결재: 비서는 전부, 직원은 그 직원 것, 대화방은 방 참여 직원 것 */
export function targetApprovals(
  option: PetTargetOption,
  approvals: PetApproval[],
): PetApproval[] {
  const t = option.target;
  if (t.kind === "secretary") return approvals;
  if (t.kind === "staff")
    return approvals.filter((a) => a.staffId === t.staffId);
  const ids = new Set(option.memberIds ?? []);
  return approvals.filter((a) => ids.has(a.staffId));
}

/** 캐릭터 창 완료 알림: 직원의 안 읽은 보고 수(main이 보고마다 올린다)가 늘어난 직원. 처음 받은 스냅샷(prev null)은 기준만 잡는다 */
export function newReports(
  prev: ReadonlyMap<string, number> | null,
  staff: Staff[],
): {
  counts: Map<string, number>;
  done: { staffId: string; staffName: string }[];
} {
  const hired = staff.filter((s) => s.kind === "hired");
  const counts = new Map(hired.map((s) => [s.id, s.unreadReports ?? 0]));
  if (!prev) return { counts, done: [] };
  return {
    counts,
    done: hired
      .filter((s) => (s.unreadReports ?? 0) > (prev.get(s.id) ?? 0))
      .map((s) => ({ staffId: s.id, staffName: s.name })),
  };
}
