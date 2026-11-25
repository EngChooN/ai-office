# 작성 중인 글 유지 — 최가독 설계안 (가독성·단순함·재활용)

## 한 줄 요약
`useState`를 그대로 바꿔 끼우는 공용 훅 `useDraft(key, 초기값)` 하나를 만든다. 값은 모듈 안 작은 zustand 스토어에 두고(기존 관례), 입력칸 쪽 수정은 "`useState('')` → `useDraft('키', '')`" 한 줄씩이다. 첨부는 `useDraftAttachments('키')`에 키만 주면 같은 스토어를 쓴다.

## 1. 공용 모양
새 파일 1개: `app/src/renderer/lib/drafts.ts` (features/secretary/draft.ts와 같은 작은 스토어 모양). 앱 껐다 켜면 지워져도 되므로 저장소(localStorage)는 쓰지 않는다 — 메모리만.

```ts
import { useEffect, useId, useCallback } from 'react'
import { create } from 'zustand'

// 작성 중인 값을 키별로 들고 있는다 (페이지 이동·패널 전환으로 입력칸이 사라져도 남는다). 메모리만 — 앱을 끄면 사라진다
const useDrafts = create<Record<string, unknown>>(() => ({}))

type Setter<T> = T | ((prev: T) => T)

/** useState 대신: 같은 키로 다시 그려지면 쓰던 값이 돌아온다. key를 안 주면 일반 useState처럼 그 입력칸 안에서만 산다 */
export function useDraft<T>(key: string | undefined, initial: T): [T, (v: Setter<T>) => void, () => void] {
  const own = useId() // key가 없을 때의 임시 칸
  const k = key ?? own
  const value = useDrafts((s) => (k in s ? (s[k] as T) : initial))
  const set = useCallback((v: Setter<T>) => useDrafts.setState((s) => ({ [k]: typeof v === 'function' ? (v as (p: T) => T)(k in s ? (s[k] as T) : initial) : v })), [k]) // eslint-disable-line
  const clear = useCallback(() => clearDraft(k), [k])
  useEffect(() => (key ? undefined : () => clearDraft(own)), [key, own])
  return [value, set, clear]
}

/** 보내기·저장이 성공했을 때: 접두사로 시작하는 칸을 모두 비운다 (예: 'staff:abc' → 글·첨부 함께) */
export function clearDraft(prefix: string) {
  useDrafts.setState((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(prefix))), true)
}
```

- 글(string)·폼 객체(예약 폼)·선택값(팀 id, boolean)·File[] 모두 같은 훅 하나. 직렬화를 안 하니 File도 그대로 담긴다.
- 키 규칙은 `화면:대상:칸` 한 가지: `staff:<id>:draft`, `chat:<roomId>:draft`. 비울 때는 `clearDraft('staff:<id>')` 한 번으로 글·첨부가 같이 비워진다.
- 쓰던 칸을 "보낸 뒤" 비우는 기존 `setDraft('')` 코드는 그대로 둬도 된다(빈 값으로 덮어씀). 정리하려면 `clear()`를 쓴다.

## 2. 적용 범위와 키
| 입력칸 | 키 | 비고 |
|---|---|---|
| 직원 지시창 + 첨부 + pickedManual | `staff:<id>:draft` / `:files` / `:manual` | 패널 닫기·다른 직원·뒤로 가기에도 유지 |
| 외부 직원 분신 지시 + 첨부 | `staff:<id>:order` / `:orderFiles` | |
| 대화방 입력 + 첨부 | `chat:<방id>:draft` / `:files` | 방마다 따로(지금은 방이 바뀌어도 섞일 수 있음) |
| 업무 보드 새 카드 | `board:new:title` `:detail` `:files` `:team` `:lab` `:auto` | 팀 선택 등도 같은 훅 |
| 비서 입력 | `secretary:draft` | 비서 페이지만. ⌘K 창·펫 창은 별도 윈도우라 모듈 메모리가 따로 → 대상 아님 |
| 예약 업무 폼 | `schedule:form:<editingId 또는 new>` | |
| 업무 지침 편집·직원 이름/직무·커밋 메시지·참고 문서 경로 | `staff:<id>:guide` `:profile` `:commit` / `refdocs:<target>` | 2차(아래) |
| 결재 직접 답·수정 의견·피드백 | `card:<id>:custom` 등 | 2차 |

**1차(이번):** 앞의 5개(지시창·분신·대화방·보드·비서)와 예약 폼. 대표가 가장 자주 겪는 긴 글이고, 같은 컴포넌트를 쓰는 휴대폰까지 같이 고쳐진다.
**2차로 미룸:** 짧은 한 줄 칸(이름·경로·커밋 메시지)과 카드 의견칸은 효과 대비 수정 지점이 많다. 훅이 같아서 나중에 한 줄씩 붙이면 된다. **제외:** 대화상자(닫으면 비우는 게 의도)·검색칸·회의실(개편 중).

## 3. 비우는 시점과 기존 신호
- **성공했을 때만** `clearDraft('<키 접두사>')`. 보내다 실패하면 남아 있어야 하므로, 지금처럼 보내기 직전에 `setDraft('')` 하는 곳은 "성공 뒤 비우기"로 순서를 바꾼다(실패하면 되돌리기도 쉬워진다). 이 부분이 구현에서 가장 조심할 곳.
- `staffDraft`·`chatDraft`·`requestSecretaryDraft`는 **그대로 둔다.** 이들은 "다른 곳에서 글을 넣어 주는 일회성 신호"이고, 받는 쪽이 `setDraft(...)`를 부르면 그 값이 자동으로 임시 저장 칸에 들어간다. 두 개념이 만나는 곳은 `setDraft` 한 군데뿐이라 합칠 필요가 없다.
- 언어 변경·회전으로 전체가 다시 그려져도 값이 남는다(덤).

## 4. 첨부(File)
- `useDraftAttachments(key?)`: 안의 `useState<File[]>([])`를 `useDraft(key && key + ':files', [])`로 바꾼다. 나머지(add/remove/upload/bind)는 그대로. key를 안 주는 기존 호출은 동작이 변하지 않는다.
- File 객체는 메모리에 그대로 있어 `arrayBuffer()`로 올리는 보내기 코드는 무변경. 앱을 끄면 사라지는 것도 요구와 맞다. 20MB 상한이 있어 메모리 부담은 작다.
- 미리보기 URL: `DraftAttachments`가 `files`가 바뀔 때 `createObjectURL`을 만들고 언마운트 때 `revoke`하는 구조라, 돌아오면 새로 만들어진다. **수정 불필요.** URL 자체는 저장하지 않는다.

## 5. 검증
- **자동:** `lib/drafts.test.ts`(기존 스토어 테스트 방식) — 같은 키로 다시 읽으면 값 유지 / 함수형 갱신 / 접두사 `clearDraft`가 글·첨부 함께 비움 / key 없을 때 언마운트 후 정리 / File 객체 동일성 유지. 타입체크.
- **화면(칸마다):** 쓰다가 다른 페이지(직원 패널은 다른 직원·닫기) 갔다 오기 → 남아 있음 → 보내기 → 비워짐. 보내기 실패 시 남아 있음. 휴대폰 화면(PhoneShell)에서 지시창·대화방·보드 확인.

## 6. 회의실 개편 뒤
`MeetingPage`의 `topic/picked/rounds`의 `useState`를 `useDraft('meeting:topic', '')` 등으로 바꾸고, 시작 성공 시 `clearDraft('meeting:')` 한 줄.

## 장단점·한계
- 장점: 파일 1개·훅 1개, 읽는 쪽은 `useState`와 똑같이 읽힌다. 새 개념이 "키 이름"뿐이다. 기존 신호는 안 건드린다.
- 한계: 키를 사람이 정하므로 오타·충돌 가능(→ 키 만드는 작은 함수 `staffKey(id)`로 감쌀 수 있으나 지금은 문자열로 시작). 변경마다 스토어 전체 구독이 아니라 키별 선택자라 다시 그리는 범위는 해당 칸뿐이다. 실제 `PanelBody`처럼 여러 `useState`가 한 컴포넌트에 있으면 그만큼 키가 늘어난다(대안: 한 객체로 묶기 — 지금은 글·첨부만 우선).
- 대안(채택 안 함): 페이지를 숨겨 두는 keep-alive는 코드는 짧지만 모든 페이지가 계속 살아 있어 메모리·갱신 비용이 크고 직원 패널·언어 전환 문제는 못 푼다.
