# 회의실 개편 — 최종 설계 결정 (정리드, 2026-11-25)

두 안(plan-choi.md, plan-park.md)은 큰 방향이 같다: 바퀴·차례는 계산, 종료 상태는 Meeting 필드 하나, 결과물은 "표시 없음 = 예전", 따라가기는 `useStickToBottom` 재활용, 자동 카드 제거는 `runMeeting` 4642~4662만.
**뼈대는 박패턴 안**, 화면 파일 나누기·`parseActionItems` 재활용·IPC 모양은 두 안 공통.

## 결정
1. **바퀴·차례 = 계산** `shared/meetingProgress.ts`의 `meetingProgress(m)`·`groupByRound` (박패턴).
   - 저장 필드는 `Meeting.phase?: 'minutes'` 하나만 (박패턴). 끝내기 신호가 main 메모리에만 있어 화면이 "회의록 쓰는 중"을 알 수 없다 — 최가독 안은 이 경우 마지막 사람이 "말하는 중"으로 남는다.
   - 참석자 변동 보정(최가독)은 채택 안 함: `runMeeting`의 `people`은 시작할 때 한 번 만들고 해고돼도 계속 말한다(코드 확인 office.ts:4585). 대신 화면에서 직원을 못 찾으면 발언의 `name`으로 그린다(박패턴).
   - 연습·데모·k=0 → null, 기존 화면. 결정 대기 → 계산 그대로, "대표 결정 기다리는 중" 표시.
2. **종료 상태 = `Meeting.outcome?: { state: 'pending'|'working'|'plan'|'artifact'|'skipped'; at; ref? }`** (박패턴). `working`으로 연타·두 창 중복 실행을 막고, `ref`로 "결과 보기"를 잇는다. 없으면 옛 회의 = 처리됨.
   - IPC 하나 `resolveMeetingOutcome(meetingId, choice)`. 원격 허용 목록(`shared/workspace.ts`·`officeApiShape.ts`)에 'write'로 등록.
   - 창 자동 열기는 "이 화면이 running→done+pending을 직접 본 순간"만 (`shouldOpenOutcome`, 두 안 공통).
3. **결재 올리기 = 앱이 직접 기획안 생성** (AI 호출 없음). 순수 함수 `buildMeetingPlan`(박패턴) + 저장·결재 카드 게시는 `propose_plan` 처리부에서 함수로 뽑아 같이 쓴다(최가독). 담당이 없으면 진행자.
4. **결과물 표시 = 앱이 붙인다** `Meta.origin?: 'owner'|'meeting'` (박패턴). 회의 결과물 지시 중이면 'meeting', 그 밖의 새 결과물은 'owner'.
   - 최가독의 "AI가 requested 인자로 스스로 표시"는 채택 안 함: AI 판단에 맡기면 표시가 들쭉날쭉하고, 새 결과물이 "예전" 칸에 섞이는 문제(최가독이 짚은 쟁점)가 생긴다.
   - 그래서 "예전 결과물" = 이번 버전 전에 올라온 것(표시 없음)과 같다. 직원이 지침을 어기고 올린 새 결과물에도 표시가 붙는 한계는 지침 문구로 줄인다. → 추천안(대표 미확인), 보고 때 알린다.
   - 숨김은 마이그레이션 없이 `isLegacyArtifact` 판정 (두 안 공통).
5. **자동 카드 제거는 종료 선택 창과 같은 단계에서** (박패턴). `meetingResultCard`·`meetingCardItems`는 옛 카드 때문에 남긴다.
   - 튜토리얼 b3 "할 일로 올리기"는 `main/tutorial.ts`의 `createTodos`가 연습 카드를 따로 만든다 → 자동 카드와 무관(정리드 확인).

## 구현 순서
1. 순수 함수+테스트 → 2. 결과물 origin·지침 문구·예전 칸 → 3. main outcome·phase·IPC·자동 카드 제거 → 4. 회의 중 화면 → 5. 종료 선택 창. (3·5 함께 검증)

## 구현 중 바꾼 점 (정리드)
- 결재 올리기: propose_plan 처리부를 함수로 뽑지 않았다. 필요한 것은 카드 저장·결재 카드 게시·알림 세 줄뿐이라 `proposeMeetingPlan`에 따로 적는 쪽이 diff가 작고 propose_plan을 건드리지 않는다.
- 결과물 내기: 진행자에게 내부 지시 대신 **업무 카드(meetingId 붙임)를 맡긴다**. 그 카드로 올린 결과물은 앱이 'meeting' 표시를 붙이고, 끝나면 갤러리에도 'meeting'으로 남는다. outcome.ref = 카드 id.
- 갤러리(화면의 결과물 목록)도 `GalleryEntry.origin`을 같은 규칙으로 저장하고, 표시 없는 항목을 "예전 결과물 N개" 접힌 칸에 둔다.
- `parseActionItems`는 shared/meetingOutcome으로 옮기며 "(담당 제안: 이름)"이 "제안: 이름"으로 뽑히던 결함을 고쳤다.
- ~~한계: 리드 아닌 진행자는 돌려받은 기획안을 다시 올리지 못한다~~ → 리뷰 Round 1에서 고침(아래).

## 리뷰 Round 1 반영 (한리뷰 필수 4건, 정리드)
1. 잘못된 선택값: `isOutcomeChoice`(shared/meetingOutcome)로 plan·skip·artifact(md|html)만 통과. `resolveMeetingOutcome` 맨 앞에서 검사해 원격·비서·화면 모든 경로가 상태 변경 없이 false.
2. 리드 아닌 진행자의 '다시 기획': propose_plan에서 **본인이 맡은, revise 상태의 회의 기획안 카드**가 있으면 담당 후보에 그 회의 참석자(회의 기록이 지워졌으면 처음 기획안의 담당자)를 더한다. 리더가 아니면 그 카드에만 올릴 수 있다(다른 카드·새 카드는 기존처럼 거절). propose_plan 자체를 함수로 뽑지 않고 후보 계산 한 곳만 넓혀 변경 영향을 줄였다.
3. 마지막 발언의 결정 요청: `meetingProgress`에서 결정 대기(waiting, 끝내기 신호 전)를 회의록보다 먼저 판정. 마지막 바퀴를 다 채웠으면 다음 차례 없음. 중간 결정 대기의 표시는 그대로.
4. '결과 보기': 지난 회의 카드에 버튼. `outcomeTaskId`로 기획안·결과물 업무 카드를 찾아, 확인 기다리는 기획안이면 결재함(`openPlanInInbox`), 아니면 보드의 카드 상세 창(`TaskDetail`을 export해 재사용). 카드가 지워졌으면 숨김.
- 검증: `scripts/meetingLive.test.mts`(단위 3개 추가), `scripts/meetingOutcomeFlow.test.mts`(실제 Office로 잘못된 값 거절·다시 기획 재제출 통합 시험 2개).
- 권장안(목록에 '대표 요청·회의 결과물' 표시)은 이번에 넣지 않음 — 필수 범위만.

## QA 반영 (오큐에이 화면 확인, 2026-11-25)

- ① 회의록 쓰는 중 위 배지: '회의 중' → '회의록 정리 중'(4개 언어 `meeting.live.badgeMinutes`). 고침.
- ② 회의록 '할 일:' 줄이 앞 항목에 붙음: 회의록 형식(목록 바로 다음 줄에 제목)이 마크다운에서 앞 항목에 이어 붙는 문제라 실제 AI 회의록에도 생긴다. 그릴 때만 빈 줄을 넣는 `minutesMarkdown`으로 고침(저장된 글·할 일 뽑기는 그대로).
- ③ 결재 올리기 카드의 체크 아이콘이 선택 표시처럼 보임: 결재함과 같은 클립보드 체크 아이콘으로 바꿈.
- ④ 라이트 모드 스크롤 막대 바탕이 까맣게 보임: 이번 변경은 스크롤 막대·색 모드를 건드리지 않아 원인 아님(추정). 이번 범위에서 고치지 않음.
