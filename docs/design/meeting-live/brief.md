# 회의실 개편 — 설계 요청서 (정리드, 2026-11-25)

대표 확정 사항(ai-office 지시). 시안: `docs/design/meeting-live/meeting-live-v1.html`의 **A안(회의 전용 화면)** + 종료 선택 창(shot-1-live-A.png, shot-2-end-choice.png). 배포 없음.

## 요구사항
1. **회의 중 화면 (A안)** — 위 칸 나누기: 진행 중 · 지난 회의 N · 새 회의(회의가 없으면 "진행 중" 칸 없음).
   - 참석자 줄: 말하는 사람 강조(테두리+"말하는 중"), 이번 바퀴 발언 마친 사람 ✓·흐리게, 다음 사람 "다음".
   - 몇 바퀴째 막대(칸 하나 = 한 바퀴, 지금 바퀴는 말한 사람 수만큼 채움). 바퀴가 바뀌면 대화 사이에 "2바퀴째" 줄.
   - 새 발언 따라가기: 맨 아래에서 80px 안이면 자동으로 따라감, 위로 읽는 중이면 "새 발언 N개 ↓" 단추(누르면 맨 아래로).
   - 끝내기 단추는 화면 아래 고정: "여기까지 정리하고 끝내기" / "정리 없이 끝내기"(기존 '그냥 끝내기' 유지).
   - 움직임 줄이기 설정 대응(점 세 개 깜빡임·막대 애니메이션 끔). 라이트·다크, 휴대폰 폭.
   - **먼저 확인**: 바퀴·다음 차례를 발언 수로 계산할 수 있는지(아래 '현재 구조').
2. **종료 선택 창** — 회의록이 만들어진 뒤 창을 띄움: 회의록 요약(할 일 N개, 전체 보기) + 선택
   - 결재 올리기: 회의록·결정·할 일을 담은 기획안 1건을 결재함에. 리더(진행자)가 없으면 진행자 이름으로. 승인 전엔 아무 일도 시작 안 함.
   - 결과물 내기: 처음 형식은 정리 문서(.md), HTML(화면·대시보드)도 선택. 진행자가 회의록 바탕으로 작성해 결과물로 올림 + '대표 요청' 표시.
   - 건너뛰기: 회의록만 남기고 카드·결재 안 만듦.
   - 창을 그냥 닫으면 → 지난 회의 카드에 "결과 고르기" 단추로 다시 열기.
   - **지금의 자동 카드 생성(회의 끝나면 결과 카드/할 일 카드 자동 생성) 제거.** "정리 없이 끝내기"는 창 없이 바로 끝(지금처럼).
3. **결과물 정리**
   - 직원 기본 지침 `staff.captureGuide`의 "HTML·.md 만들었으면 report_artifact로 올려라"를 "대표가 요청했거나 회의 결과물 내기일 때만"으로(4개 언어).
   - 올린 결과물에 '대표 요청' 표시(저장 필드).
   - 표시 없는 기존 결과물(약 308개)은 삭제하지 않고 갤러리/결과물 목록에서 "예전 결과물" 칸으로 숨김(다시 볼 수 있게).
- 완료 기준: 4개 언어 문구, 라이트·다크, 휴대폰 폭, 타입체크·테스트 통과. 작업 트리에 남의 미완료 변경(StaffPanel 탭 줄 등)이 있으니 섞지 않기.

## 현재 구조 (정리드 조사)
- 화면: `app/src/renderer/features/MeetingPage.tsx`(421줄).
- main: `app/src/main/office.ts` `startMeeting`(4550)·`runMeeting`(4584)·`stopMeeting`(~4745, `meetingStops` = 'summarize' 류 / 'discard')·`parseActionItems`(5324). 자동 카드: `runMeeting` 4642~4662(`meetingResultCard` in `shared/planTasks.ts`, 리더면 결과 카드 1장, 아니면 할 일 낱장).
- 발언 순서: `people = participantIds → hired` 고정 순서로 `for round { for p of people }`. 대표 결정 대기(`askDecision`, status 'waiting')로 중간에 멈출 수 있음. 회의록은 진행자(chair = 팀장·랩 리드인 참석자, 없으면 첫 참석자)가 씀.
  - 발언 수 n, 사람 수 k → 바퀴 = ⌊n/k⌋+1, 지금 차례 = people[n % k] 로 계산은 가능해 보임. 단 renderer의 participantIds와 main의 people이 다를 수 있는 경우(회의 중 해고 등)·연습 회의(`isPractice`, 튜토리얼 대본)·데모데이(`kind: 'demo'`) 주의. 명시 필드(`turn`, `round`)를 저장할지 판단해 주세요.
- `Meeting` 타입: `shared/types.ts:627` (status: running|waiting|done|failed|stopped).
- 결과물: `main/artifactStore.ts`(saveArtifact·listArtifacts), `ArtifactInfo`(`shared/types.ts:683`), 갤러리 `shared/gallery.ts`·`main/gallery*`. 지침 주입: `main/hired.ts:367`, 문구 `shared/i18n/dict/staff.ts:228`.
- 기획안(결재) 흐름: propose_plan → PlanCard(결재함). 회의 결과를 기획안으로 올리는 기존 경로가 있는지 확인 필요.
- 김기획 조사 보고에 코드 위치가 더 있음(office.ts·planTasks.ts·artifactStore.ts·hired.ts·gallery.ts).

## 설계안에 담을 것
1. 바퀴·차례 계산 방식(계산 vs 저장 필드)과 근거, 예외(결정 대기·연습·데모·참석자 변동).
2. 화면 구성: 컴포넌트 나누기, 새 발언 따라가기(기존 `components/stick-to-bottom` 재활용 여부), 지난 회의 칸, 휴대폰.
3. 종료 흐름: main 상태(회의록 완료 → '결과 고르기 대기' 상태 저장?), 선택 3개 각각의 IPC·데이터 흐름, 창 닫기 후 다시 열기, 자동 카드 제거 범위, 기존 저장된 회의와 호환.
4. 결과물: '대표 요청' 표시 저장 위치·판단 시점(누가 언제 표시를 붙이나), 기존 308개 숨김 방식(마이그레이션 vs 표시 없음 = 예전), 지침 문구.
5. 검증: 자동 테스트(순수 함수로 뺄 것), 화면 확인 목록.
6. 나눠서 구현할 순서와 위험.
코드는 고치지 말고 `docs/design/meeting-live/plan-<이름>.md`에 써 주세요.
