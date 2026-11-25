# 작성 중인 글 유지 — 설계안 (박패턴: 유지보수성·변경 영향 최소화·검증 가능성)

코드는 고치지 않았습니다. `attachments.tsx`, `features/secretary/draft.ts`, `StaffPanel.tsx`(309·398 주변), `store.ts`의 `staffDraft`·`chatDraft` 사용처를 읽고 썼습니다.

## 0. 핵심 방침
- 입력칸 쪽 코드는 `useState`를 `useKept`로 **한 줄만 바꾸는** 수준으로 둡니다. 보내기 로직, 키보드 처리, 화면 구조는 건드리지 않습니다.
- 저장소는 메모리의 모듈 변수 하나입니다(앱을 끄면 지워짐 = 요구사항과 일치). 파일 하나, zustand/미들웨어 없음.
- 이유: 화면 이동, 직원 전환, 언어 변경(`key={lang}`), 모바일 회전은 모두 "컴포넌트 재마운트"입니다. 컴포넌트 밖에 값을 두면 한 번에 모두 해결됩니다. 이동 지점마다 따로 막는 방식(keep-alive 등)은 변경이 번져서 채택하지 않습니다.

## 1. 공용 모듈 `renderer/lib/keptState.ts`
```ts
import { useCallback, useSyncExternalStore } from 'react'

const store = new Map<string, unknown>()
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** 키 기준으로 값을 컴포넌트 밖에 보관하는 useState. 처음 값과 같아지면 항목을 지운다 (쌓이지 않게) */
export function useKept<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => (store.has(key) ? (store.get(key) as T) : initial),
  )
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = (store.has(key) ? store.get(key) : initial) as T
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      // 객체는 JSON 비교로 "비었는지" 판단 (원시값은 ===)
      if (Object.is(v, initial) || JSON.stringify(v) === JSON.stringify(initial)) store.delete(key)
      else store.set(key, v)
      emit()
    },
    [key, initial],
  )
  return [value, set]
}

export const clearKept = (prefix: string) => {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k)
  emit()
}
/** 테스트용 */
export const keptSize = () => store.size
```
- 키 규칙: `<화면>:<대상>:<칸>` (예 `staff:${id}:draft`, `chat:${roomId}:draft`, `board:new:title`). 키를 만드는 함수는 같은 파일 아래 `keptKey.staff(id, 'draft')`처럼 모아 오타를 막습니다.
- **주의(구현 시)**: `initial`이 객체 리터럴이면 렌더마다 새로 만들어져 `set` 참조가 바뀝니다. 상수로 빼거나 `useRef`로 고정합니다. 이 점을 `keptState.test`로 막습니다.
- 글: `useKept(key, '')`. 팀·프로젝트 선택·자율 여부 같은 값: 각각 `useKept` 또는 폼 객체 하나로 묶어 `useKept(key, EMPTY_FORM)`.
- 일반화는 이 한 훅까지만 합니다. "폼 전체 자동 저장" 같은 추상화는 쓰는 곳이 3곳 이상 생길 때 검토합니다.

## 2. 적용 범위와 키
| 이번에 함 | 키 | 비고 |
|---|---|---|
| 직원 지시창 + 첨부 + 고른 매뉴얼 | `staff:{id}:draft`, `:files`, `:manual` | 다른 직원 선택, 패널 닫기, 안드로이드 뒤로 가기에서도 유지 |
| 외부 직원 분신 지시 | `staff:{id}:order` + 첨부 | |
| 대화방 입력 + 첨부 | `chat:{roomId}:draft` | 지금은 방별이 아님 → 방별로 분리하면 방 전환 때 글이 섞이지 않음 (동작 변경, 정리드 확인) |
| 업무 보드 새 카드 | `board:new` 폼 객체 (제목·상세·팀·프로젝트·자율) + 첨부 | |
| 비서 입력 | `secretary:draft` | 3곳(SecretaryPage·⌘K 창·펫 창) 중 **페이지만** 공유. ⌘K·펫은 별도 창이라 저장소가 달라 자연히 분리되며, 합치려면 IPC가 필요해 이번엔 제외 |
| 예약 업무 폼 | `schedule:form:{editingId ?? 'new'}` | |
| 업무 지침 편집, 이름·직무, 커밋 메시지·PR 제목 | `staff:{id}:…` | 편집 중(`isEditing`)도 같이 보관해야 돌아왔을 때 편집창이 열려 있음 |
| 참고 문서 경로 | `refdoc:{target}` | |
| 결재 질문 직접 답·기획 수정 의견·진행 피드백 | `card:{cardId}:custom` | 카드가 사라지면(결재 완료) 비움 |

**안 하는 곳**: 회의실(개편 중), 대화상자(닫으면 비우는 게 의도), 검색칸. 기존 취급과 같습니다.
**휴대폰**: 같은 컴포넌트를 쓰므로 자동 포함됩니다. 단 셸이 교체되는 회전도 재마운트라서, 저장소가 모듈 변수여야 유지됩니다(이 설계가 맞음).

## 3. 비우는 시점과 기존 신호
- **성공 후에만 비웁니다.** 지금 `handleSend`는 `setDraft('')`를 보내기 직전에 합니다. 실패하면 글을 잃으므로, 성공 응답 뒤로 옮기거나 실패 시 복원합니다. 칸마다 흐름이 다르니 구현 때 하나씩 확인해 주세요. (확인 못 한 것: 각 칸의 보내기가 성공·실패를 돌려주는지)
- 대화·직원 삭제, 해고 시 `clearKept('staff:{id}:')`를 한 줄 호출합니다.
- `staffDraft`·`chatDraft`·비서 prefill은 **그대로 둡니다**. 이들은 "다른 곳에서 글 넣어 주기" 신호이고, 받는 쪽에서 `setDraft(prev => …)`로 받으므로 `useKept`의 setter와 그대로 맞습니다(함수형 갱신 지원). 신호를 임시 저장으로 합치면 두 역할이 섞여 변경 범위가 커집니다.

## 4. 첨부(File) 유지
- `useDraftAttachments(key?: string)`로 인자 하나만 추가합니다. 키가 있으면 내부 `useState<File[]>` 대신 `useKept<File[]>(key, EMPTY)`를 씁니다. 키가 없으면 지금과 같이 동작합니다(회의실 등 영향 없음).
- File 객체는 직렬화하지 않고 참조만 보관하므로 `arrayBuffer()`로 올리는 기존 방식이 그대로 됩니다. 메모리에 올라가므로 칸당 20MB 상한을 유지합니다.
- 미리보기 URL: `DraftAttachments`가 마운트 때 `useMemo`로 `createObjectURL`을 만드는 구조라, 돌아오면 새로 만들어져 문제없습니다. 단 언마운트 때 `revokeObjectURL`이 없으면 누수이므로 `useEffect` 정리 함수를 확인합니다(확인 못 함).
- JSON 비교는 File을 `{}`로 보므로 파일 배열은 `initial`과의 비교 대신 `length===0`로 지웁니다. 훅에 `isEmpty` 옵션을 하나 둘지는 구현 때 정합니다.

## 5. 검증
- **자동**: `scripts/keptState.test.mts` — ① 쓰기 후 재마운트 뒤 값 복원 ② 처음 값과 같으면 항목 삭제 ③ 키가 다르면 분리 ④ 함수형 갱신 ⑤ `clearKept` 접두 삭제 ⑥ 첨부는 키 있음/없음 두 모드 ⑦ `initial` 객체 리터럴에서 setter 참조 안정. 기존 `tsc`와 관련 테스트(`secretary`, 대화 입력) 재실행.
- **화면(사람)**: 칸마다 "쓰기 → 다른 페이지 → 복귀 → 그대로 → 보내기 → 이동 후 복귀 시 빈 칸". 추가로 직원 전환, 패널 닫기, 언어 변경, 휴대폰 뒤로 가기, 모바일 회전, 보내기 실패(네트워크 끊김) 때 글 유지.
- 휴대폰 확인은 미리보기 도구(`mobile/preview`)로 하고, 실제 기기는 한 번만 봅니다.

## 6. 회의실 개편 뒤
`MeetingPage`의 `useState('')` 세 개(topic, picked, rounds)를 `useKept('meeting:topic', '')` 등으로 바꾸고 보내기 성공 때 비우면 끝입니다.

## 위험과 대안
- **저장소 누적**: 처음 값이 되면 삭제하고 삭제 이벤트에 `clearKept`를 걸어 막습니다. 남는 건 사용자가 쓴 글뿐입니다.
- **다른 창 공유 불가**: 창마다 렌더러가 따로라 ⌘K·펫 창과 못 합칩니다. 합치려면 main/IPC 저장이 필요해 이번엔 제외했습니다.
- **대안 — 페이지 keep-alive**(숨겨서 계속 마운트): 변경은 가장 작지만 메모리와 이벤트·타이머가 계속 돌고, 직원 전환·언어 변경·회전은 못 막아 채택하지 않았습니다.
- **대안 — zustand 스토어**: 기존 관례에 맞지만 키 기반 임시 값에는 보일러플레이트가 큽니다. `useSyncExternalStore` 20줄이 더 단순합니다.
