# v1.3.2 구현 코드 검토 (한리뷰, 2026-11-13)

범위: `design-final.md` · `brief.md` · `team-wait-final.md` 대비 작업본(미커밋). 코드는 고치지 않았고, 타입검사·`pnpm test`(1454개)는 통과 상태라는 전달을 믿고 다시 돌리지 않았다.
확인 방법: 코드 읽기 + 사전(DICT) 전수 스크립트(4개 언어 빈 값·자리표시자 불일치·한글 섞임). **화면(1400/1100/900폭·라이트/다크)·폰 실기기는 못 봤다.**

## 판정: 막을 것 없음 — "꼭 고칠 것" 1건(문구 일관성), 나머지는 "고치면 좋음"

## 꼭 고칠 것

1. **'고용→추가'가 한국어만 바뀌고 en/ja/zh에는 그대로 남은 키 10개** (설계: "화면 문구 4개 언어")
   - `featuresA.ts:93` chat.allHired · `:388` meeting.noStaff · `:557` onboarding.welcome.introBold
   - `game.ts:66~` mission.staff5/10/20/30 (ko는 "직원 5명 추가", en은 "Hire 5 staff", ja "採用", zh "聘用")
   - `featuresB.ts:1153` secretary.resumeWarn · `logs.ts:47` engineChange.error.notHired
   - `secretary.ts:59` secretary.tool.recruitExternal (ko만 '다른 창 직원 영입', en/ja/zh는 External/外部 그대로)
   - 같은 화면에서 버튼은 "Add staff"인데 미션·안내는 "Hire"로 갈린다. 4개 언어를 같은 뜻으로 맞춘다.
   - 확인 방법: 이번 작업본에서 ko 값이 바뀐 84개 키 중 en/ja/zh에 hire·雇用·聘用이 남은 것을 뽑음(스크립트).

## 고치면 좋음

2. **한국어 '채용' 표현이 '추가'와 섞여 남음** — `featuresA.ts:448` coachTour.hire.body · `:566` onboarding.card.hire.body(제목은 "직원 추가"인데 본문은 "채용해요"), `pack.ts` pack.hire.hint / pack.market.hint / pack.market.hire / pack.done.* / pack.err.hire, `logs.ts` log.externalHired, staffPanel.external.recruit(+Confirm).
   - 설계는 '고용'만 말했다. 같은 흐름에서 말이 두 가지이니 '추가'로 통일할지 정해야 한다(정식 채용(외부 직원 영입)은 뜻이 달라 남겨도 됨).
3. **'외부 직원' 이름 변경이 일부 빠짐** — `shared/secretaryTools.ts:112-113` 비서 도구 라벨 '외부 직원 영입'·'외부 직원 대화 이어받기'가 그대로(사전은 '다른 창 직원 …'으로 바뀜). 어느 쪽이 화면에 보이는지 확인 후 맞춘다.
   - 비서 모델에게 가는 글(`main/secretary.ts:58,81`, `secretaryCompact.ts:40`)에 '고용'이 남은 것은 화면 글이 아니라 영향 낮음("main이 만드는 안내 문구까지" 범위에 들어가는지만 확인).
4. **안드로이드 한국어 문구** — `android/app/src/main/res/values/strings.xml:54-55` "아직 고용한 직원이 없어요"·"직원 고용은 PC에서…". 앱 전체 범위라면 같이 바꿀 곳(다른 갈래 변경이 섞인 파일이라 이번 검토 범위 밖으로 두었다).
5. **'다른 창 · 보기만' 배지가 사실과 다름** — `dict/staffCard.ts` staffCard.external. 다른 창 직원도 패널에서 지시·결재·분신 맡기기가 된다(staffPanel.external.placeholder/approveAll/fork). 시안 표는 "(보기만)"이었지만 Codex 쪽만 맞는 말이다. '다른 창 직원'만 두거나 Codex일 때만 '보기만'.
6. **직원 카드의 예시 칩이 쓰던 지시 글을 덮어씀** — `StaffPanel.tsx:340` `if (staffDraft.text) setDraft(...)`. 그 직원 패널에 이미 적던 글이 있으면 사라진다. 비어 있을 때만 채우거나 뒤에 붙이기를 권장. (확인하기·일 시키기 같은 빈 글은 안전)
7. **폰에서 카드 버튼·칩이 작음** — `StaffCard.tsx` 강조 버튼 `h-7`, 예시 칩 `py-0.5 text-[11px]`. 같은 앱의 폰 규칙(`phone:min-h-9`)을 따르지 않았다. 폰에서 카드 보기가 기본이라 `phone:` 크기 보강 권장. (폰 실기기 확인 못 함)
8. **직원 목록 행(StaffRow)이 '팀원 기다리는 중'을 반만 반영** — `StaffRow.tsx` ROW_TONE은 실제 status 기준이고 문장 색도 working/waiting만 진하게라, 카드(작업 중 띠·진한 글)와 달리 쉬는 줄처럼 보인다(상태 글자·점은 맞음).
   - 같은 이유로 `StatusDot`·`ChatPage` 점의 깜빡임(animate-pulse)은 실제 status 기준이라 카드와 다르다. 의도라면 그대로.
9. **소개 탭 '업무 지침' 안내문이 실제와 다를 수 있음(추정)** — `dict` staffPanel.instructions.restartNote "대화를 새로 시작해요". `hired.ts`의 `closeSession`은 세션 id를 지우지 않고 다음 지시 때 새 지침으로 다시 연다(이름·모델 변경과 같은 길)라, 대화 기록이 이어질 가능성이 높다. 실제로 이어지는지 확인하고 문구를 맞춘다(설계 "박 사실 3"과도 대조).
   - 일하는 중 저장 막기 자체는 UI에서 working·waiting만 본다(`StaffPanel.tsx:925`). main은 일하는 동안엔 재시작을 미룬다(`hired.ts:312`)라 데이터가 깨지진 않고, 휴대폰(원격 `updateStaff`)에서는 이 막기가 없다. 낮음.
   - `save()`는 실패를 잡지 않는다(`StaffPanel.tsx:926`) — 예외면 편집 칸이 닫히지 않고 조용히 남음.
10. **'오늘 완료' 칸이 사라진 뒤 업무 보드로 가는 길이 직원 화면에 없음** — 설계 4번은 "요약 문장에 넣지 않음 · 보드로 바로 갈 수 있음"인데 `Dashboard.tsx`에는 보드로 가는 링크가 없다(사이드바로만 간다). 의도면 문서 문구만 고친다.
11. **사소** — `app/scripts/_dump.mts`(사전 덤프용 임시 스크립트)가 작업본에 남아 있음(`pnpm test` 패턴엔 안 걸림, 커밋 전 정리). 안 쓰게 된 사전 키가 남았을 수 있음(dashboardPanels.todayDone·todayTokens·monthBudget·noLimit·secretaryShare·idleTitle, staffCard.tokens 등 — 사용처 없는 것을 확인했으나 지울지는 선택). `HireDialog.tsx` 3단계 블록 들여쓰기가 어긋나 있음(동작 무관).

## 설계와 같게 된 것 (확인함)
- **직원 추가 3단계**(`HireDialog.tsx`, `shared/staffCard.ts` `hireStepValid`): 앞 단계 조건 포함, Enter는 다음 단계, 다시 열면 0단계로 초기화, '자세히 설정'은 3단계에 접힘, 폰(IS_REMOTE_SCREEN)은 폴더·결재 방식 안내. 직접 입력 직무는 비면 못 넘어감, 템플릿으로 채울 수 있음. 막힌 곳 없음.
- **명함 카드/요약/필터**: `nowLine` 우선순위(확인 기다림 → 인터넷·오류 → 일하는 중(진행 문장→도구 쉬운 말→활동)→팀원 기다림→맡은 일→없음), `cardAction`(외부·다른 PC·퇴근은 버튼 없음), `summaryParts`·`countByStatus`·`matchesStaffFilter`가 같은 함수를 써 요약·필터·카드 말이 일치. 퇴근은 세지 않고 누를 수 없음. 필터가 0건이 된 오류 칸은 필터 줄에 남아 해제 가능.
- **상황판 접기**: 기본 접힘, `office:dashboardBoardOpen`을 기기에 저장, 제목에 확인 필요 건수. 상황판은 이름 검색·상태 필터 영향을 받지 않음.
- **패널**: 머리에서 모델 이름·터미널 버튼 제거, '일하는 곳: 폴더 이름'(누르면 경로), 터미널 이어 하기는 ⋯ 안(세션 있는 직원은 모든 크기에서 ⋯ 보임), 탭 이름 대화·바뀐 파일·도구·소개. 소개는 hired일 때만 지침 카드 표시. 
- **대화 탭 줄/방 목록**: `showsTabRow('talk','desktop')`만 App이 부르고 PhoneShell은 안 건드림(폰 탭 줄은 그대로, 폰 영향 0 확인). 회의실 화면에서 방 목록 줄이 '선택됨'이 아니고 방을 누르면 단체방으로 이동. 회의실 결정 대기 수(노랑)는 목록·띠가 `usePendingMeetingDecisions` 한 출처. ↑↓는 `data-room-item`(회의실 포함), 겹쳐 펼친 목록은 띠와 형제라 키 이벤트가 두 번 처리되지 않음. 투어 대상 `nav-meeting`은 목록·띠에 있고 없을 때는 `nav-talk`로 대체됨.
- **delegation.ts**: 맡긴 일 기준이 리더의 하위 업무로 좁혀졌고 `checkStall`과 화면이 같은 함수. 시험이 `isAwaitingTeam`의 idle 한정을 확인.
- **사전**: 새 사전(staffCard·roleInfo·connect) 포함 전체 3,847키에서 ko/en/ja/zh 빈 값 0, 자리표시자 불일치 0, 다른 언어에 한글이 섞인 값 0. 직무 11개 설명·예시 3개, 쉬운 말 표(직원 목록·팀 구성·직원 추가·일하는 중·대표님 확인 기다림·쉬는 중·인터넷 기다리는 중·문제 생김·AI 등급·일하는 곳·도구 쉬운 말·바뀐 파일·도구·소개)가 시안 표와 일치.

## 못 본 것
- 실제 화면(라이트/다크, 1400·1100·900폭), 폰·원격 미리보기에서의 카드 모양, 회의실 `Page`가 새 `flex` 틀 안에서 스크롤 높이를 제대로 받는지(`MeetingPage.tsx` 틀 변경 — 화면 확인 필요).
