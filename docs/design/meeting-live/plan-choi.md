# 회의실 개편 — 최가독 설계안 (가독성·단순함·재활용)

## 읽은 코드 / 못 읽은 코드
- **직접 읽음:** `main/office.ts` 시작·`runMeeting`·`askDecision`·`endMeeting`(4550~4760), `report_artifact`·`propose_plan` 도구(2870~3000), `shared/types.ts` Meeting·Artifact 타입, `main/artifactStore.ts` 전체 흐름, `shared/gallery.ts`의 `settleStaleMeeting`, `renderer/components/stick-to-bottom.tsx` 앞부분, `MeetingPage.tsx` 1~120줄, `staff.captureGuide` 문구와 주입 위치(`hired.ts:367`).
- **못 읽음(추정 표시):** 시안 HTML(45KB, 요청서 설명만 믿음), `MeetingPage.tsx` 121~421줄(회의 카드·발언 목록 그리는 부분), 결과물 목록을 그리는 renderer 화면(`artifactList`를 부르는 renderer 코드는 못 찾음 → GalleryPage 또는 다른 곳, 확인 필요), `main/db.ts`의 meeting 저장 방식, `planTasks.ts`, IPC 등록 파일(`officeHandlers.ts`)의 회의 부분, 연습 회의 `tutorial.ts` 대본.

---
## ① 바퀴·다음 차례: **계산으로 충분, 저장 필드는 만들지 않는다**
근거: `runMeeting`이 `for round { for p of people }`로 **고정 순서**로 돌고, 발언이 `m.messages`에 한 줄씩 순서대로 쌓인다(4605~4609). 그래서 `n = messages.length`, 참석자 수 `k`면 바퀴 = ⌊n/k⌋+1, 말하는 사람 = `people[n % k]`.

순수 함수 1개(`shared/meetingTurn.ts`, 화면·테스트 공용):
```ts
export interface TurnView { round: number; rounds: number; doneIds: string[]; speakingId: string | null; nextId: string | null }
export function turnOf(m: Pick<Meeting,'participantIds'|'rounds'|'messages'|'status'|'kind'|'isPractice'>): TurnView | null
```
- `people`은 화면에서 `participantIds`를 쓴다. main은 해고된 사람을 `filter`로 뺀다(4586) → 어긋날 수 있다. **해결: `messages`의 `staffId`로 보정** — 최근 발언자가 `people[(n-1)%k]`와 다르면(해고 등) 계산 대신 "발언자 기준"으로 다음 사람을 `messages` 마지막 발언자의 다음으로 잡는다. (즉 `last = messages.at(-1).staffId`가 있으면 다음 = participantIds에서 last 다음, 없으면 첫 사람.) 이렇게 하면 `n % k`에 의존하지 않아 참석자 변동에도 안 깨진다. 바퀴는 "이번 바퀴에 말한 사람 집합" 대신 `⌊n/k⌋+1`을 쓰되, 어긋남이 생기면 막대가 한 칸 틀려도 치명적이지 않다(표시만).
- 예외 처리(모두 `turnOf`가 `null`을 돌려주고 화면은 바퀴 UI를 안 그림):
  - `kind === 'demo'`(발언 없음, 발표 연출 별도) → null. 데모 화면은 그대로.
  - `isPractice`(튜토리얼 대본이 `messages`를 직접 넣음 — 순서 보장 없음, **tutorial.ts 못 읽음**) → null, 기존 화면 유지.
  - `status === 'waiting'`(결정 대기): 새 발언이 없으므로 같은 n → "말하는 중" 대신 **"대표 결정 기다리는 중"**을 말한 사람 줄에 표시. 계산값 자체는 그대로 유효(결정 뒤 같은 사람의 다음 차례가 이어짐 — 코드상 `askDecision`은 발언 후에 호출되므로 다음 사람이 이어 말함).
  - 끝난 회의(`done/stopped/failed`) → 바퀴 UI 대신 요약만.
- **저장 필드(`turn`, `round`)는 비추천:** 발언마다 `db.saveMeeting`을 이미 부르는 구조라 필드를 늘리면 저장 형식·옛 회의 호환·휴대폰 옛 화면 3곳이 늘고, 계산으로 같은 값이 나온다. 한계: "말하는 중"은 *발언이 막 끝난 직후부터 다음 AI 응답이 올 때까지*를 뜻하는 추정이다(실제 AI 호출 시작 시점을 모른다). 정확한 "지금 누가 생각 중"이 필요하면 직원 `activity`(`meetingPrep` 문구로 이미 세팅, 4600)를 쓰면 된다 — **재활용 후보**.

## 화면 구성 (②)
- 새 파일 3개로 분리, `MeetingPage`는 칸 조립만: `MeetingLive.tsx`(진행 중 칸: 참석자 줄+바퀴 막대+발언 목록+끝내기 줄), `MeetingEndChoice.tsx`(종료 선택 창), `shared/meetingTurn.ts`(위 함수). 지난 회의 칸·새 회의 폼은 기존 코드 이동 최소화.
- **새 발언 따라가기 = 기존 `useStickToBottom` 그대로 재활용**(NEAR_PX 80, 새 줄 N개 단추 로직이 이미 있음). `items = m.messages`, `keyOf = ts`, `resetKey = m.id`. 새로 만들지 않는다.
- 바퀴 구분 줄 "2바퀴째": 발언 목록 렌더에서 `i % k === 0 && i > 0`일 때 끼워 넣기(turnOf와 같은 k).
- 움직임 줄이기: 기존 Tailwind `motion-reduce:` 변형으로(막대 transition·점 깜빡임). 휴대폰: 기존 `phone:` 변형 + `RoomListColumn` 숨김 규칙 그대로.

## ② 종료 선택 창: main 상태와 흐름 (**최소 상태 1개**)
- **상태:** `Meeting`에 선택 필드 `resultChoice?: 'pending' | 'proposed' | 'artifact' | 'skipped'`(옛 회의엔 없음 = 이미 처리된 것으로 본다 → **호환: 없으면 창·"결과 고르기" 단추 안 보임**). 회의가 `done`이 되는 자리(4673 `m.status = 'done'`)에서 `chair`가 있고 정리 종료일 때만 `'pending'`을 넣는다.
- **자동 카드 제거 범위:** `runMeeting` 4642~4662의 `items` 블록(`meetingResultCard`·낱장 카드 생성) 삭제. `parseActionItems(r.text)`는 **남겨서** 창의 "할 일 N개" 요약에 쓴다(`shared`에 이미 있는 순수 함수 재활용). 회의록 요약(`m.summary`)·채팅 게시(`postChat minutes`)는 유지. `meetingResultCard` 호출이 없어지면 `planTasks.ts`의 해당 함수·`task.meetingId`·`propose_plan`의 `meetingCardItems/decisionSections` 분기는 **옛 카드가 남아 있어 당장 지우지 않는다**(이번엔 새 생성만 끊고 정리는 후속).
- **IPC(기존 `answerMeetingDecision`처럼 office API 메서드 1개 추가):** `chooseMeetingResult(meetingId, choice: { kind: 'plan' } | { kind: 'artifact'; format: 'md' | 'html' } | { kind: 'skip' })`.
  - `skip`: `resultChoice='skipped'` 저장만.
  - `plan`(결재 올리기): **기존 경로가 없다**(propose_plan은 AI가 도구로 부르는 것뿐, 확인함). 새로 `propose_plan` 핸들러의 `plan` 조립부(2970 근처)를 **함수로 뽑아 재활용**: 카드 1장 생성(`createTask`) + `plan = { spec: 회의록+결정+할 일, subtasks: 할 일 목록, status:'waiting', … }` + `postChat(... { plan:{taskId, proposedAt} })` → 결재함 PlanCard에 그대로 뜬다. 담당은 chair(리드 없으면 chair 이름, 요구사항 "진행자 이름으로"). 승인 전엔 아무것도 시작 안 함(기존 plan.status 'waiting' 의미 그대로). `resultChoice='proposed'`.
  - `artifact`: chair에게 지시를 보낸다 — 기존 `instruct`(직원 지시 경로)로 "회의록 바탕으로 {md|html}을 만들어 report_artifact로 올려라 + 이건 회의 결과물 내기" 프롬프트 한 건. 표시는 ③의 방식. `resultChoice='artifact'`.
  - 창 닫기 = 상태 변경 없음(`pending` 유지) → 지난 회의 카드에서 `resultChoice==='pending'`이면 "결과 고르기" 단추가 같은 창을 다시 연다. 별도 저장 불필요.
- 창 열기 신호: main→renderer는 기존 스냅샷 방식이므로 **화면이 `meeting.status==='done' && resultChoice==='pending'`을 보고 스스로 연다**(새 이벤트 채널 없음). 이미 보던 회의가 끝나는 순간에만 자동으로 열고(이전 상태가 running이었을 때), 앱을 다시 켠 뒤엔 자동으로 열지 않는다(단추만). 휴대폰·원격 화면은 같은 스냅샷이라 지원은 공짜, 단 `OfficeApi` 메서드 추가 시 원격 허용 목록(`shared/workspace.ts` 등)에 넣어야 함(**미확인 → 구현 때 확인**).
- 앱이 꺼진 사이: `settleStaleMeeting`은 running/waiting만 'failed'로 바꾼다. `pending` 상태의 done 회의는 그대로 남아 "결과 고르기"가 계속 보인다(의도).
- "정리 없이 끝내기": 기존 `'discard'` → 창 없음, `resultChoice` 안 넣음(그대로).

## ③ 결과물 '대표 요청' 표시 / 예전 결과물 숨김
- **저장 위치:** `artifactStore.ts`의 `Meta`에 `requested?: true`(+ 타입 `ArtifactInfo.requested?`). `refOf`가 아니라 **`listArtifacts`의 반환(159행)과 `Meta`만** 건드려 `ArtifactRef`(채팅 첨부로 퍼지는 타입)는 안 바꾼다.
- **누가 언제 붙이나:** `saveArtifact`에 `requested?: boolean` 입력을 추가하고(옵션, 기본 안 붙임), `report_artifact` 도구(office.ts 2872)에 선택 인자 `requested: z.boolean().optional()`를 추가. 판단은 직원(AI)이 지침(아래)에 따라 하지만, **회의 결과물 내기는 앱이 확실히 알므로** 앱이 chair의 해당 지시 중에는 `requested`를 강제로 켠다(직원 origin에 `'meetingResult'` 표식을 두고 도구가 읽음 — 기존 `origins` 맵 재활용, 모양은 구현 때 확인). 한 번 `requested`가 된 아티팩트는 새 버전에서도 유지(`meta.requested ||= input.requested`).
- **기존 308개:** **마이그레이션 없이 "표시 없음 = 예전"**. 이유: 308개 meta.json을 한꺼번에 다시 쓰는 건 실패·중단 위험이 있고 되돌리기 어렵다. 목록 쪽 순수 함수 `splitArtifacts(list) → { requested, legacy }`로 갈라 화면에서 "예전 결과물" 접힌 칸에 둔다(삭제 없음, 펼치면 다 보임). 한계: 앞으로 직원이 `requested` 없이 올린 것도 "예전 결과물"에 들어간다 → 칸 이름을 "예전·표시 없는 결과물"로 하거나, 새 결과물은 기본 표시로(=`requested`가 아니라 `legacy` 표시를 옛 파일에 줄 수는 없으니) 문구로 해결. **대표 확인 쟁점**: 직원이 스스로 올린 새 결과물도 숨길지.
- **지침 문구:** `staff.captureGuide`를 두 문장으로 분리(화면 캡처 안내는 유지, HTML/.md 문장만 "대표가 요청했거나 회의 결과물 내기일 때만 report_artifact로 올리고, 요청받지 않았으면 올리지 말고 보고 글에 요약하세요"로). 4개 언어 동시 수정(`dict/staff.ts:228`). 주입 위치(`hired.ts:367`)는 변경 없음.

## 검증
- **순수 함수 테스트(자동):** `turnOf`(정상·결정 대기·해고로 어긋남·demo/practice null·rounds 끝), `splitArtifacts`, `parseActionItems` 기존 테스트 유지, `resultChoice` 호환(없는 옛 회의 → 창 안 뜸), `saveArtifact`의 `requested` 유지(새 버전 포함).
- **통합:** `runMeeting`이 더는 카드를 만들지 않는지(회의 끝난 뒤 `tasks`에 신규 없음), `chooseMeetingResult('plan')`이 결재함에 plan 1건·승인 전 하위 업무 미시작.
- **화면 확인:** 진행 중(말하는 중/✓/다음), 결정 대기, 위로 읽을 때 새 발언 단추, 종료 창 닫기→결과 고르기 재열기, 라이트·다크·휴대폰 폭·움직임 줄이기, 4개 언어.

## 구현 순서와 위험
1. `meetingTurn.ts`+테스트 → 2. `MeetingLive`(화면만, main 무변경) → 3. 지침 문구·`requested` 저장·예전 칸 → 4. 종료 창과 `chooseMeetingResult`·자동 카드 제거(가장 위험, 마지막).
- 위험: (a) 자동 카드 제거 때 기존 튜토리얼 b3 단계("할 일로 올리기", MeetingPage 주석에 있음)가 연습 회의 할 일에 의존 → **튜토리얼 영향 확인 필수**. (b) 결재 올리기를 기존 `propose_plan` 내부와 공유하려면 큰 함수에서 조립부를 뽑아야 해 diff가 커짐 — 대안으로 "정리 문서 1건을 chair가 propose_plan으로 올리게 지시"하는 방법은 코드가 더 짧지만 AI가 안 따를 수 있어 비추천. (c) 계산 방식은 표시 오차 가능(위 한계).
- 단순 대안(채택 안 함): 종료 선택 창을 만들지 않고 기존 자동 카드를 유지 — 요구사항과 어긋남.

## 정리드가 고를 쟁점
1. 바퀴·차례: **계산(추천)** vs 저장 필드.
2. 종료 상태: `resultChoice` 필드 1개(추천) vs 별도 상태 테이블.
3. 새 결과물을 직원이 스스로 올렸을 때도 "예전"으로 숨길지(대표 확인 필요).
