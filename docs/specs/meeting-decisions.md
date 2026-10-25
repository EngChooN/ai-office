# 회의 결정 — 저장 구조 정리안

> 작성: 강백엔(백엔드) · 2026-10-24 · 기준 0.10.1
> 상위: 회의·협업 흐름 개선 스프린트 — 준비 단계 1/4 (저장 구조)
> 이 문서는 **정리안**이다. 코드는 아직 고치지 않았다. 구현은 승인 후 별도 기획안으로.

## 0. 요약 (핵심 결정)

1. 질문이 잘리는 곳은 **저장·화면이 아니라 파싱(`splitDecision`)**이다. 표식 앞 글자를 통째로 버리고, 그 줄은 발언에서도 지운다. 표식은 **줄 맨 앞일 때만** 인정하고 원문 줄을 `raw`로 함께 저장한다.
2. `MeetingDecision`에 **선택 필드만 더한다**: `kind`·`decidedById`·`decidedByName`·`choice`·`reason`·`decidedAt`·`raw`·`endedByMeeting`. `answer`(`null`=대기, `''`=위임)의 뜻은 그대로 둔다.
3. **DB 마이그레이션은 필요 없다**(회의는 JSON 한 칸에 저장). 옛 데이터는 읽을 때 공용 함수 하나로 보정하고, 모르는 값은 지어내지 않고 "기록 없음"으로 둔다.
4. 위임하면 **회의 진행자(리드)가 바로 한 번 정해** 최종 선택값과 결정자를 남긴다. 회의 끝내기로 풀린 질문은 위임이 아니라 `endedByMeeting`으로 따로 표시한다.
5. 폰: v1에는 회의 결정이 없어서 영향 없음. v2는 APK 안의 화면이 PC `snapshot`을 그대로 읽으므로 **선택 필드 추가만으로 양방향 호환**이다(인자·프로토콜 버전 그대로). 요약과 화면은 `shared/meetingDecisions.ts`의 **같은 함수**로 읽는다.

---

## 1. 지금 흐름 (코드 추적)

### 1-1. 타입 — `app/src/shared/types.ts:318`
```ts
export interface MeetingDecision {
  id: string
  askedBy: string        // 물은 직원 id
  askedByName: string
  question: string
  options: string[]
  /** null이면 아직 답하지 않음, '' 이면 "알아서 정해" */
  answer: string | null
  ts: number             // 물은 시각
}
// Meeting.decisions?: MeetingDecision[]
```

### 1-2. 생성 — `app/src/main/office.ts`
| 단계 | 위치 | 하는 일 |
|---|---|---|
| 발언 요청 | `runMeeting` (`office.ts:1897`~) | 결정이 3건(`MEETING_DECISIONS_MAX`) 미만이면 시스템 프롬프트에 "`[결정 요청] 질문 \| 선택지1 \| …` 한 줄" 형식을 알려 줌 |
| 파싱 | `splitDecision` (`office.ts:2266`) | 발언에서 `[결정 요청]`이 든 **첫 줄**을 찾아 `question`·`options`로 나누고, 그 줄을 발언에서 지움 |
| 저장 | `askDecision` (`office.ts:1970`) | `answer: null`로 추가, 회의 `status='waiting'`, `db.saveMeeting`, 단체방·알림, 답이 올 때까지 `pendingDecisions`에 Promise로 대기 |
| DB | `db.saveMeeting` (`db.ts:349`) | `meeting(id, data, created_at)` — **회의 전체를 JSON 한 칸**(`data`)에 저장 |
| 앱 재시작 | `office.ts:264` | 진행·대기 중이던 회의는 `failed`로. 대기 결정은 `answer: null`인 채 남음 |

### 1-3. 답변
| 경로 | 위치 |
|---|---|
| PC 화면 | `DecisionBox` (`renderer/features/MeetingPage.tsx:241`) — 선택지 버튼 / 직접 입력 / "알아서 정해"(`''`) → `window.office.answerMeetingDecision(meetingId, decisionId, text)` |
| 결재함 | `InboxPage.tsx:24` — 진행 중 회의의 `answer === null` 결정을 같은 `DecisionBox`로 |
| 뱃지 | `renderer/features/nav.ts:35` — `answer === null` 개수 |
| IPC | `officeHandlers.ts:62` → `office.answerMeetingDecision` (`office.ts:1991`) — `answer.trim()`으로 Promise를 풂 → `decision.answer` 기록, `status='running'`, 저장 |
| 회의 끝내기 | `endMeeting` (`office.ts:1999`) — 대기 결정을 **`''`로 풂** (사용자의 "알아서 정해"와 구분 불가) |
| 비서 | `secretaryTools.ts:68` 변경 도구(결재 필요), 설명은 `secretaryDescribe.ts:158` |
| 폰 v2 | `remote/v2.ts:107` `answerMeetingDecision: R('s s s')` — PC와 같은 처리 함수 |
| 폰 v1 | `remote/protocol.ts:197` `decisionsBody` — 결재·질문·기획만. **회의 결정은 없음** |
| 푸시 | `remote/notifier.ts` — `noopNotifier`(보내지 않음) |

### 1-4. 답변 이후 쓰임
- 다음 발언·회의록: `runMeeting`의 `decided()`가 `- 질문 → 답 | (대표: 알아서 정하라고 함)`으로 `transcript()`에 붙임.
- 회의록(LLM)이 `결정 사항:`을 **자유 문장으로** 다시 씀 → `meetingResultCard`(`shared/planTasks.ts:37`)가 회의록 글을 그대로 결과 카드 `detail`에 넣음. 결정 데이터 자체는 카드로 가지 않는다.
- **위임 후 누가 무엇으로 정했는지는 어디에도 저장되지 않는다.** 다음 발언자들이 "(알아서 정하라고 함)"만 보고 각자 해석한다.

## 2. 질문 원문이 잘리는 곳 (코드 근거)

### 2-1. 원인: `splitDecision` (`office.ts:2266`)
```ts
const idx = lines.findIndex((l) => /\[결정 요청\]/.test(l))   // 줄 어디든 표식이 있으면
const [question, ...options] = lines[idx]
  .replace(/^.*\[결정 요청\]\s*/, '')   // ① 표식 앞 글자를 전부 버림
  .replaceAll('`', '')                  // ④ 백틱 제거
  .split('|')                           // ② 질문 안의 | 도 선택지 구분으로
  ...
lines.splice(idx, 1)                    // ③ 그 줄 전체를 발언에서도 지움
```
- **① + ③ 앞부분 소실:** 표식이 줄 중간에 있으면 앞 문장이 질문에서도, 발언에서도 사라진다.
- **오탐:** 표식을 **말로 언급만 해도**(예: "`[결정 요청]`과 `[대표가 내린 결정]`이 구분되지 않아…") 결정 요청으로 잡힌다.
- **② `|`:** 질문 안의 `|`가 선택지 구분으로 쓰여 질문이 끊긴다.
- **한 줄만:** 질문이 두 줄 이상이면 둘째 줄부터는 질문이 아니라 발언에 남는다.

**실제 사례 (이번 회의 "클로드 오피스 개선점 논의", DB를 읽기 전용으로 확인):**
- 저장된 `question`: `'과 [대표가 내린 결정]이 일반 발언과 시각적으로 구분되지 않아 놓치기 쉽습니다. …'`, `options: []`
- 그 직원의 발언: `'(발언 없음)'` — 한 줄짜리 발언 전체가 ③으로 지워짐
- 즉 디자이너가 표식을 **언급**한 문장이 오탐으로 결정 요청이 됐고, 앞부분 "`[결정 요청]`"까지가 ①로 잘렸다. 회의록에서 질문 앞부분이 잘린 것으로 보인 원인이 이것이다.

### 2-2. 잘리지 않는 곳 (참고)
| 위치 | 자르는 정도 | 판단 |
|---|---|---|
| `Meeting.decisions[].question` 저장 | 자르지 않음 | — |
| `DecisionBox` 화면 | 자르지 않음(전문) | 기본 2줄 + 펼침은 디자인 몫 |
| 단체방 `🙋 … 결정 부탁드려요` | 자르지 않음 | — |
| 직원 활동 줄 `결정 요청: …` | 80자 (`office.ts:1975`) | 상태 표시용, 그대로 |
| OS 알림 본문 | 120자 (`office.ts:1977`) | 알림용, 그대로 |
| 회의록 프롬프트 | 자르지 않음 | — |

### 2-3. 고칠 방향 (구현 단계)
- 표식은 **줄 맨 앞**(`^\s*[-*]?\s*\[결정 요청\]`)일 때만 인정하고, 여러 개면 **마지막** 것.
  - (T2 구현 때 보강) 실제 사례는 줄 맨 앞 백틱 안에서 시작했다(`` `[결정 요청]`과 … ``). 그래서 **표시 뒤 띄어쓰기**와 **선택지가 있거나 물음표로 끝남**도 함께 요구한다. 목록 기호·인용·여는 굵게/백틱은 앞에 와도 된다.
- 선택지 구분은 `|`. 띄어 쓴 ` | `가 있으면 그것만 구분자로 봐서 질문 안의 `A|B`를 살린다. 원문 줄은 `raw`에 그대로 저장해 질문이 잘못 나뉘어도 원문은 남게 한다.
- 표식 줄만 발언에서 뺀다(지금과 같음). 언급만 한 줄은 발언에 남는다.
- 저장 길이 상한은 두지 않는다(발언 자체가 2~4문장). 화면만 2줄로 접는다.

## 3. 새 필드안

```ts
/** 회의 중 참석자가 대표(사용자)에게 묻는 결정 */
export interface MeetingDecision {
  id: string
  askedBy: string
  askedByName: string
  /** 파싱한 질문 전문 (자르지 않는다) */
  question: string
  options: string[]
  /** null = 대기 · '' = 위임("알아서 정해") 또는 회의 끝내기로 풀림 · 그 밖 = 대표의 답. 뜻을 바꾸지 않는다 (옛 화면·폰 호환) */
  answer: string | null
  /** 물은 시각 */
  ts: number

  // ── 0.10.2~ 추가 (모두 선택 — 옛 데이터·옛 PC에는 없다) ──
  /** 결정 유형. 답한 뒤 채운다 */
  kind?: 'direct' | 'delegated'
  /** 결정한 사람: 'me' = 대표, 위임이면 정한 직원 id */
  decidedById?: string
  decidedByName?: string
  /** 최종 선택값. direct면 answer와 같고, delegated면 직원이 고른 값 */
  choice?: string
  /** 위임 결정의 이유 한 줄 (선택) */
  reason?: string
  /** 결정 시각 (direct = 답한 때, delegated = 직원이 정한 때) */
  decidedAt?: number
  /** "[결정 요청] …" 줄 원문 그대로 (파싱 전) */
  raw?: string
  /** 대표가 답하지 않은 채 회의를 끝내 풀린 결정 — 위임이 아니다 */
  endedByMeeting?: true
}
```

### 3-1. 채우는 규칙
| 상황 | answer | kind | decidedBy | choice | decidedAt |
|---|---|---|---|---|---|
| 대기 | `null` | — | — | — | — |
| 대표가 선택지·직접 입력 (PC·폰·비서 모두) | 답 | `direct` | `'me'` / 대표 | 답 | 답한 때 |
| 대표가 "알아서 정해" | `''` | `delegated` | 정한 직원 | 직원이 고른 값 | 직원이 정한 때 |
| 위임 후 직원 결정 실패(오류·중단) | `''` | `delegated` | — | — | — (화면: "위임 · 아직 정하지 않음") |
| 회의 끝내기로 풀림 | `''` | — | — | — | — , `endedByMeeting: true` |

- 비서가 결재를 받아 답한 경우도 대표가 승인한 것이므로 `direct`·`'me'`.
- `answerMeetingDecision`은 **인자를 늘리지 않는다**(폰 v2 인자 검사 `R('s s s')` 그대로). `''`이면 위임으로 본다.

### 3-2. 위임 시 누가 정하나
- **제안: 회의 진행자(리드)**가 위임 직후 한 번 정한다. 진행자 선정은 회의록 작성자와 같은 식(`runMeeting`의 `chair` — 팀장·랩 리드, 없으면 첫 참석자). 범위·우선순위 결정권이 리드에게 있고, 회의 결과 카드도 리드가 받으므로 일관된다.
- 방식: `askOnce` 한 번(결정 최대 3건이라 회의당 최대 3회 추가 호출). 응답 형식 `[위임 결정] 선택 | 이유`. 선택지가 있으면 그중 하나를 고르게 하고, 파싱이 안 되면 첫 줄을 `choice`로.
- 정한 결과는 단체방에 `🤝 위임 결정(정리드): 질문 → 선택`으로 남기고, 다음 발언의 `transcript()`에 **최종 선택값**으로 들어간다(지금처럼 "알아서 정하라고 함"으로 두지 않음 → 다시 묻는 문제도 줄어든다).
- 대안: 물은 사람(`askedBy`)이 정하기. 맥락은 가장 잘 알지만, 리드가 아닌 직원이 범위를 정하게 된다. **리드 취합 때 확정 필요.**

## 4. 기존 데이터 호환·마이그레이션

### 4-1. 마이그레이션: 필요 없음
- 회의는 `meeting.data` JSON 한 칸이라 컬럼 추가가 없다. 새 필드는 모두 선택이라 옛 JSON도 그대로 읽힌다.
- **일괄 보정(backfill)도 하지 않는다.** 옛 `''`는 "대표 위임"인지 "회의 끝내기"인지 데이터로 구분할 수 없어서, 써 넣으면 사실이 아닌 값을 만들게 된다.

### 4-2. 읽을 때 보정 — 공용 함수 하나
`shared/meetingDecisions.ts`(새 파일)에 둔다. 메인·화면·폰 화면(APK 번들)이 같은 함수를 쓴다.

```ts
export type DecisionState = 'pending' | 'direct' | 'delegated' | 'ended' | 'unanswered'
export interface DecisionView {
  state: DecisionState
  question: string            // 전문
  choice: string | null       // 최종 선택값 (모르면 null)
  deciderName: string | null  // '대표' | 직원 이름 | null(기록 없음)
  decidedAt: number | null
  isLegacy: boolean           // 새 필드 없이 answer로 추정했는지
}
export function decisionView(d: MeetingDecision, meeting: Meeting): DecisionView
```

| 저장된 값 | state | choice | deciderName | 화면 표시 |
|---|---|---|---|---|
| `answer === null`, 회의 진행·대기 중 | `pending` | null | null | 답 버튼 |
| `answer === null`, 회의 끝남·실패 | `unanswered` | null | null | "답하지 않고 끝남" |
| `endedByMeeting` | `ended` | null | null | "회의를 끝내 답하지 않음" |
| `kind` 있음 | `kind` 그대로 | `choice` | `decidedByName` 또는 `'대표'` | 직접 / 위임 라벨 |
| **옛 데이터** `answer` 비어 있지 않음 | `direct` | `answer` | `'대표'` (대표만 답할 수 있었음) | 직접 |
| **옛 데이터** `answer === ''` | `delegated` | null | null | "위임 · 결정자 기록 없음" |

- 옛 데이터의 `decidedAt`은 모름 → `null`(물은 시각 `ts`로 채우지 않는다).
- 화면의 대기 판정(`InboxPage.tsx:24`, `nav.ts:35`)은 `answer === null` 그대로 두거나 `state === 'pending'`으로 바꿔도 결과가 같다.

## 5. 폰 원격 프로토콜 영향

| 경로 | 지금 | 영향 |
|---|---|---|
| v1 `GET /v1/decisions` | 결재·질문·기획만 (`protocol.ts:197`) | **없음.** 회의 결정은 v1에 없다(기존 공백 — 폰 15분 조회 알림에 회의 결정이 안 뜬다. 이번 범위 밖, 따로 올릴 후보) |
| v2 `snapshot`·SSE | `Meeting`을 그대로 보냄. 화면은 **APK 안 번들**(`WebShell.kt`)이 그림 | 선택 필드 추가뿐 |
| v2 `answerMeetingDecision` | `R('s s s')` | **변경 없음** |

하위 호환 조합:
- **새 PC + 옛 APK:** 옛 화면은 새 필드를 무시하고 `answer`만 본다. 위임은 지금처럼 "알아서 정하라고 했어요"로 보인다(정보가 덜 보일 뿐 틀리지 않음). 답하기도 그대로 동작.
- **옛 PC + 새 APK:** 새 필드가 없으므로 `decisionView`의 옛 데이터 규칙으로 보인다(4-2 표).
- 네이티브 Kotlin 쪽은 회의를 파싱하지 않는다(`ignoreUnknownKeys` 이기도 함).
- `protocolVersion` 올리지 않는다. 규격 문서(`remote-protocol-v2.md`)는 고칠 곳 없음 — `OfficeSnapshot` 모양 설명이 타입을 따르므로 변경 이력 한 줄만 남긴다.

## 6. 요약(기획안 초안)과 화면 강조가 같은 데이터를 읽는 방법

원칙: **결정은 LLM이 다시 쓰지 않는다.** 저장된 `MeetingDecision`이 유일한 원본이고, 요약·카드·화면은 모두 `decisionView()`를 거쳐 만든다.

| 쓰는 곳 | 지금 | 바꾼 뒤 |
|---|---|---|
| 회의 화면·결재함 강조 (`DecisionBox`) | `answer`를 직접 해석 | `decisionView().state`로 라벨·색(이디자 토큰 매핑표의 직접/위임 키와 1:1) |
| 다음 발언 맥락 (`transcript()`) | `decided()`가 직접 문자열 생성 | `decisionLines(decisions)`(같은 파일)로 생성. 위임은 최종 선택값 포함 |
| 회의록 프롬프트 | 결정을 LLM이 "결정 사항"으로 다시 씀 | 프롬프트엔 그대로 주되, **회의록 뒤에 코드가 만든 결정 블록을 붙인다** |
| 회의 결과 카드 (`meetingResultCard`) | 회의록 글만 | `## 결정 사항(직접)` · `## 위임 결정` **두 섹션**을 `decisionLines`로 생성해 넣음 → 기획안 초안 자동 생성이 이 섹션을 그대로 옮김 |

```ts
/** 요약·카드·발언 맥락 공용. 화면과 같은 decisionView를 쓴다 */
export function decisionLines(m: Meeting): { direct: string[]; delegated: string[]; open: string[] }
// direct    : "- 질문 → 선택 (대표)"
// delegated : "- 질문 → 선택 (위임: 정리드)" / "- 질문 → (위임 · 결정자 기록 없음)"
// open      : 답 없이 끝난 결정 "- 질문 (답하지 않음)"
```

- 이렇게 하면 화면에서 "위임 · 정리드"로 보이는 건이 기획안 초안에서도 같은 문구·같은 값으로 나온다(스프린트 완료 기준 3).
- 결정 순서는 저장 순서(`ts`) 그대로.

## 7. 구현 범위 (다음 기획안용 메모)

| 파일 | 변경 |
|---|---|
| `shared/types.ts` | `MeetingDecision` 선택 필드 |
| `shared/meetingDecisions.ts` (새) | `decisionView`, `decisionLines`, 파싱(`splitDecision`을 옮겨 순수 함수로 테스트) |
| `main/office.ts` | 파싱 교체·`raw` 저장, 답할 때 `kind`·결정자·`decidedAt`, 위임 시 진행자 `askOnce`, `endMeeting`은 `endedByMeeting` |
| `shared/planTasks.ts` | `meetingResultCard`에 결정 두 섹션 |
| `renderer/features/MeetingPage.tsx` | `DecisionBox`가 `decisionView` 사용 (라벨·토큰·펼침은 디자인 결과 반영) |
| 테스트 | 파싱(줄 중간 언급·`|`·여러 줄·표식 여러 개), 옛 데이터 보정 6가지, 위임 결정 파싱 실패, 회의 끝내기 |

- 범위 밖: 회의 결과 업무가 리드에게 두 번 전달되는 별건 버그(기획서에 구현 단계로 명시됨), v1 폰 알림에 회의 결정 넣기.

## 8. 리드 취합 때 정할 것
1. 위임 결정자: **진행자(리드)** (제안) vs 물은 사람.
2. 회의 끝내기로 풀린 결정을 결과 카드의 "답하지 않음" 목록에 넣을지(제안: 넣음).
