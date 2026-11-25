# 회의실 개편 설계안 (박패턴: 유지보수성·변경 영향 최소화·검증 가능성)

코드는 고치지 않았습니다. 최가독 안은 받지 않아 비교하지 않았습니다. 시안 HTML(`meeting-live-v1.html`)은 열어 보지 않았고 요청서 설명만 따랐습니다.

## 0. 읽은 것 / 못 읽은 것
- **직접 읽음**: `office.ts`의 `startMeeting`·`startPracticeMeeting`·`runMeeting`·`askDecision`·`endMeeting`·`runDemoDay` 앞부분·`report_artifact`·`propose_plan`·회의 복원(566), `shared/types.ts`의 `Meeting`·`ArtifactInfo`, `shared/planTasks.ts`, `shared/gallery.ts`의 `settleStaleMeeting`, `artifactStore.ts` 앞부분·`listArtifacts`, `stick-to-bottom.tsx` 앞부분, `staff.captureGuide` 문구, `db.saveMeeting`(회의는 JSON 한 덩어리로 저장).
- **못 읽음(구현 때 확인 필요)**: `MeetingPage.tsx` 본문 대부분(목록만 훑음), `parseActionItems`, `reviewPlan`과 PlanCard 화면, `origins` 타입(누가 시킨 일인지), `tutorial.ts`의 연습 회의 대본 상세, 갤러리 화면·`gallery*` 저장 구조, 데모데이 화면, 휴대폰 회의실 화면, 안드로이드 쪽 회의 표시.

## 1. 바퀴·다음 차례 — 계산으로 충분합니다 (저장 필드 추가 안 함)
근거(읽은 코드): 한 번 발언할 때마다 `m.messages`에 **정확히 1개**가 쌓입니다(발언이 비어도 "(발언 없음)"으로 추가, 4609). 결정 요청과 위임 결정은 `messages`가 아니라 `decisions`에 쌓입니다. 순서는 `m.participantIds`와 같고(`startMeeting`이 걸러서 저장, `runMeeting`의 `people`은 바로 그 목록에서 만듦) 그 뒤로 바뀌지 않습니다.
- `shared/meetingProgress.ts` 순수 함수 `meetingProgress(m)`: `n = messages.length`, `k = participantIds.length`
  - 바퀴 = `min(⌊n/k⌋+1, rounds)`, 이번 바퀴에서 마친 사람 = `people[0 .. n%k-1]`, 다음 사람 = `people[n%k]`
  - **발언 중** = `status==='running'` 이고 `n < k·rounds` 이고 끝내기 신호 전.
- 예외 처리
  - **결정 대기(`waiting`)**: 발언은 이미 쌓였으므로 계산은 그대로. 다만 "말하는 중"은 끄고 "대표 결정 대기"로 표시(`phase:'decision'`).
  - **회의록 쓰는 중**: `n ≥ k·rounds`이거나 끝내기 신호 뒤에도 `status`는 `running`입니다. 끝내기 신호(`meetingStops`)는 main 메모리에만 있어 화면이 못 봅니다. → **이것만 저장 필드 `Meeting.phase?: 'minutes'`로 둡니다**(바퀴·차례는 계산, 이 한 가지만 저장). 이유: 계산으로 추측하면 "정리하고 끝내기"를 눌렀을 때 마지막 사람이 계속 "말하는 중"으로 남습니다.
  - **참석자 변동**: 참석자는 시작 때 확정이라 회의 중 바뀌지 않습니다. 해고된 직원도 `runMeeting`이 들고 있는 정보로 계속 말합니다. 화면은 `participantIds`를 `staff`로 찾되 없으면 `messages`의 `name`으로 대신 그립니다(참석자 줄이 사라지지 않게).
  - **연습 회의·데모데이**: `null`을 돌려주고 기존 표시를 씁니다. 연습은 대본 전체를 한 번에 저장(`tutorial.ts` 271)하고 데모는 `messages`가 비어 계산이 안 맞기 때문입니다.
  - `k===0`이면 `null`. 오래된 저장 회의도 같은 계산이 됩니다(필드 추가 없음 = 호환 문제 없음).

## 2. 화면 구성 (renderer)
`MeetingPage.tsx`(421줄)를 이렇게 나눕니다. 새 파일은 `features/meeting/` 아래.
| 조각 | 역할 | 비고 |
|---|---|---|
| `MeetingPage` | 칸 배치만(진행 중 / 지난 회의 N / 새 회의) | 진행 중이 없으면 칸 숨김 |
| `MeetingLive` | 참석자 줄·바퀴 막대·대화·끝내기 단추 | 입력은 `meetingProgress` 결과뿐 |
| `RoundBar`, `Attendees` | 막대와 참석자 줄 | 애니메이션은 `prefers-reduced-motion` CSS로 끔 |
| `PastMeetingCard` | 지난 회의 + "결과 고르기" | 기존 `MeetingCard` 재사용 |
| `MeetingOutcomeDialog` | 종료 선택 창 | 3절 |
- 새 발언 따라가기: **`components/stick-to-bottom.tsx`의 `useStickToBottom`을 그대로 재활용**합니다(80px 기준, 안 읽은 개수, 맨 아래 단추가 이미 구현). 새로 만들지 않는 것이 이번 가장 큰 절약입니다. 키 함수는 `` `${staffId}:${ts}` ``.
- 바퀴 구분 줄은 `groupByRound(messages, k)` 순수 함수로 뺍니다(`n`번째 발언 → 바퀴 번호).
- 끝내기 단추는 기존 `EndMeetingButtons`(export 되어 다른 곳에서도 씀)를 화면 아래 고정 칸에 넣습니다. 문구만 새로, 동작은 그대로.
- 휴대폰: 같은 컴포넌트, 참석자 줄은 가로 스크롤. (휴대폰 화면 코드는 못 읽음)

## 3. 종료 선택 흐름
**데이터**: `Meeting`에 선택 필드 하나 — `outcome?: { state: 'pending' | 'working' | 'plan' | 'artifact' | 'skipped'; at: number; ref?: string }`.
- 새 회의가 회의록을 마치면 `status:'done'` + `outcome:{state:'pending'}`. **`outcome`이 없는 기존 회의는 "예전 방식으로 이미 처리됨"**으로 보고 "결과 고르기"를 보여 주지 않습니다. 필드가 없어도 읽히므로 마이그레이션이 필요 없습니다(JSON 한 덩어리 저장).
- **자동 카드 제거 범위**: `runMeeting` 4642~4662(리드면 `meetingResultCard`, 아니면 낱장 카드)만 제거. `meetingResultCard`·`meetingCardItems`는 `propose_plan`의 "회의 결과 카드" 처리가 옛 카드를 계속 읽으므로 **삭제하지 않습니다**. "정리 없이 끝내기(`discard`)"는 지금처럼 창도 outcome도 없습니다.

**IPC 하나**: `resolveMeetingOutcome(meetingId, choice)`; `choice = {kind:'plan'} | {kind:'artifact', format:'md'|'html'} | {kind:'skip'}`
- 시작할 때 `pending`이 아니면 무시하고 곧바로 `working`으로 바꿔 저장 → **연타·창 두 개에서 눌러도 한 번만** 실행.
- **plan**: 앱이 직접 기획안을 만듭니다(AI 호출 없음). 순수 함수 `buildMeetingPlan(m, people, chair)`가 회의록 할 일을 `TaskPlan{status:'waiting'}`로 바꾸고, 기존 `propose_plan`과 같은 방식(`saveTask` + 결재 카드 채팅 글)으로 올립니다. 담당은 참석자 이름으로 맞추고 못 맞추면 진행자. 승인 전엔 아무것도 시작하지 않으므로 지금 코드와 안전 조건이 같습니다. 이유: `propose_plan`은 리드 직원의 AI 턴이 있어야 하고 리더 없는 회의는 못 올립니다(요구사항 "진행자 이름으로").
- **artifact**: 진행자에게 내부 지시("회의록으로 `{형식}` 작성 후 `report_artifact`")를 하나 보내고, 올라온 결과물에 표시를 붙입니다(4절). 실패하면 `pending`으로 되돌리고 알림.
- **skip**: `outcome.state='skipped'`만 저장.
- 완료 시 `outcome.state`와 `ref`(카드·결과물 id) 저장 → 회의 카드에 "결과 보기"로 연결.

**창 열기·닫기**: 창은 "진행 중이던 회의가 `done+pending`으로 바뀌는 것을 이 화면이 직접 본 순간"에만 자동으로 엽니다(`shouldOpenOutcome(prev,next)` 순수 함수). 닫으면 상태는 `pending`이라 지난 회의 카드의 "결과 고르기"로 다시 열 수 있고, 앱을 껐다 켜도 `pending`이 저장돼 있어 같은 단추가 보입니다(자동으로는 다시 안 뜸). 이유: 앱을 켤 때마다 창이 뜨면 방해입니다.
- 요약 칸의 "할 일 N개"는 `parseActionItems(m.summary)` 결과 개수(함수 본문은 못 읽음 — 회의록 전체 `summary`에도 같은 형식이 들어 있는지 확인 필요).

## 4. 결과물
- **저장 위치**: `artifactStore.ts`의 `Meta`에 `origin?: 'owner' | 'meeting'`(JSON 필드 추가, 구버전 파일 그대로 읽힘). `saveArtifact` 입력에 `origin?`을 받아 새 파일이든 새 버전이든 `Object.assign(meta,{...})`에 포함 → **예전 결과물에 새 버전이 올라오면 그때부터 예전 칸을 벗어납니다**. `ArtifactInfo`에도 `origin?`을 노출.
- **누가 언제 붙이나**: 앱이 붙입니다(AI가 스스로 "대표 요청"이라고 주장하게 두지 않음). 회의 결과물 흐름은 앱이 지시를 보냈으니 `'meeting'`. 그 외는 `report_artifact` 시점에 "이 직원의 현재 일이 대표가 직접 시킨 것인가"로 판단해야 하는데, **`origins` 타입을 못 읽어서 판단 규칙은 정리드 확인이 필요**합니다. 확인이 어렵다면 차선: 새 지침 이후 올라오는 모든 결과물을 `'owner'`로 표시(지침이 "요청 받았을 때만"이므로). 단점은 AI가 지침을 어기고 올린 것도 표시가 붙는다는 점입니다.
- **308개 숨김**: 마이그레이션 없이 **"표시 없음 = 예전"**. 순수 함수 `isLegacyArtifact(a) = a.origin === undefined`(`shared/artifact.ts`)로 목록을 두 칸으로 나눕니다(보이는 목록 / 접힌 "예전 결과물 N개"). 이유: 데이터를 다시 쓰지 않아 되돌리기 쉽고, 실패해도 파일은 안전하며, 개수가 늘어나도 영향이 없습니다. 갤러리 쪽은 별도 저장(`GALLERY_MAX 300`)이라 같은 방식이 필요한지 못 읽었습니다.
- **지침**: `staff.captureGuide` 마지막 문장을 "대표가 요청했거나 회의 결과물 내기일 때만 `report_artifact`로 올리세요"로(4개 언어 한 항목 안에서 수정, 스크린샷 문장은 그대로).

## 5. 검증
**자동 (순수 함수로 빼기, `app/scripts/*.test.mts`)**
| 함수(위치) | 확인 |
|---|---|
| `meetingProgress` (`shared/meetingProgress.ts`) | n=0, 한 바퀴 직전·직후, 마지막 발언, 결정 대기, `phase:'minutes'`, 연습·데모 `null`, `k=0`, 참석자가 사라진 경우 |
| `groupByRound` (같은 파일) | 바퀴 경계 구분 줄 위치 |
| `shouldOpenOutcome` (`shared/meetingOutcome.ts`) | live→done+pending만 true, 처음부터 done이면 false, `outcome` 없음 false |
| `buildMeetingPlan` (같은 파일) | 담당 이름 맞추기·못 맞추면 진행자·할 일 0개·결정 섹션 포함 |
| `isLegacyArtifact` / 분할 (`shared/artifact.ts`) | 표시 유무, 새 버전이 오면 이동 |
| `saveArtifact` (`artifactStore`) | `origin` 저장·구버전 meta 읽기·새 버전 때 갱신 |
| `meeting` 호환 | `outcome` 없는 옛 JSON이 그대로 읽히고 "결과 고르기" 없음 |
기존 `tsc`, 회의·갤러리·결재 관련 테스트, 언어 사전 검사 재실행.
**화면(사람)**: 라이트·다크, 휴대폰 폭, 움직임 줄이기, 3명 2바퀴 회의 중 막대·차례, 결정 대기, 위로 읽다가 "새 발언 N개", 정리하고 끝내기→창→3가지 선택 각각, 창 닫고 다시 열기, 앱 재시작 후 pending, 정리 없이 끝내기, 연습 회의·데모데이 회귀.

## 6. 구현 순서와 위험
1. 순수 함수 + 테스트 (회의 진행, 바퀴 묶기, 예전 결과물 판정) — 화면 영향 없음.
2. 결과물 `origin` 저장 + 지침 문구 + 목록의 예전 칸 (독립 작업, 되돌리기 쉬움).
3. main: `outcome`·`phase`, `resolveMeetingOutcome`, **자동 카드 제거는 이 단계와 반드시 같이**(제거만 하면 카드도 선택 창도 없는 구간이 생김).
4. 회의 중 화면(A안). 5. 종료 선택 창. (3과 5는 같은 배포 단위)
- 위험: ① 자동 카드 제거는 **동작 변경**(대표가 선택하지 않으면 카드가 생기지 않음) ② 앱이 직접 만든 기획안이 `reviewPlan`·PlanCard 화면과 맞는지 못 읽음 ③ `phase:'minutes'`를 저장하는 위치가 여러 `db.saveMeeting` 호출 중 하나라 빠뜨리기 쉬움 → 테스트로 막기 ④ 작업 트리의 남의 미완료 변경은 `MeetingPage` 분리 파일만 건드려 섞이지 않게 함.
- 대안: 바퀴·차례를 `turn/round`로 저장하면 화면은 단순하지만, 연습·데모·옛 회의는 값이 없어 어차피 계산이 필요하고, `messages`와 값이 어긋날 위험이 생겨 채택하지 않았습니다.
