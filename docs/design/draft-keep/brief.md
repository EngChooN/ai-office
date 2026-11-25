# 작성 중인 글 유지 (페이지 이동해도 입력 유지) — 설계 요청서

## 요구사항 (ai-office 지시)
- 입력칸에 쓰다가 다른 페이지로 갔다 오면 글이 사라진다. 대표가 매우 불편해함.
- 페이지를 오가도 작성 중인 글 유지. 공용 방식(예: 임시 저장 훅) 우선.
- 보내기·저장 성공하면 비움. 앱을 껐다 켜면 지워져도 됨(영구 저장 불필요).
- 첨부 파일·이미지도 가능하면 유지, 어려우면 보고.
- 회의실 화면(MeetingPage)은 개편 중(김기획·이디자) — 이번엔 손대지 않고 메모만. 개편 뒤 같은 방식을 붙일 수 있게 공용으로.
- 완료 기준: 타입체크·관련 테스트 통과, 바뀐 입력칸마다 "쓰다 이동 후 복귀" 확인, 휴대폰 화면 포함 여부.

## 현재 구조 (조사 결과)
- 페이지 전환: `store.ts` `useOffice.view`, `layout/pages.ts` `renderPage(view)`를 `<LoadErrorBoundary key={view}>`로 그림(App.tsx:175, PhoneShell.tsx:56) → 이동 시 이전 페이지 언마운트. keep-alive 없음.
- 직원 패널(StaffPanel)은 페이지와 형제라 페이지 이동엔 살아남음. 하지만 `<PanelBody key={staff.id}>` — 다른 직원 선택·패널 닫기·안드로이드 뒤로 가기(select(null))에서 지시 글이 사라짐.
- 언어 변경 시 `<AppBody key={lang}>` 전체 재마운트, 모바일 회전 시 셸 교체도 전부 재마운트.
- 휴대폰은 같은 컴포넌트(StaffPanel·ChatPage·BoardPage·SecretaryPage)를 씀.
- 첨부: `components/attachments.tsx` `useDraftAttachments` = `useState<File[]>`, 보낼 때 arrayBuffer로 올림. File 객체를 모듈 스토어로 옮겨도 동작(직렬화만 안 하면 됨).
- 기존 일회성 채우기 신호: `staffDraft`(store.ts:37), `chatDraft`(store.ts:99), `useSecretaryDraft`(features/secretary/draft.ts) — 임시 저장이 아니라 "다른 곳에서 글 넣어 주기".
- zustand 관례: `useXxx = create(...)`, 미들웨어 없음, 작은 기능 스토어는 기능 옆 파일(features/secretary/draft.ts 같은 모양).

## 사라지는 입력칸 (우선순위)
| 화면 | 위치 | 상태 | 키 |
|---|---|---|---|
| 직원 지시창 | StaffPanel.tsx:309 (+draftFiles :397, pickedManual :398) | draft | staff.id |
| 외부 직원 분신 지시 | StaffPanel.tsx:1132 (+orderFiles) | order | staff.id |
| 대화방 입력 | ChatPage.tsx:706 (+draftFiles :756) | draft | 지금은 방별 아님 → 방 id 권장 |
| 업무 보드 새 카드 | BoardPage.tsx:66-67 (+draftFiles :76, teamId/labId/isAutonomous) | title, detail | 하나 |
| 비서 입력 | secretary/SecretaryChat.tsx:410 (SecretaryPage·⌘K 창·펫 창 3곳) | draft | 하나(창마다 공유 여부 결정 필요) |
| 예약 업무 폼 | SchedulePage.tsx:41 | draft 객체 | 하나 / editingId |
| 직원 소개 탭 업무 지침 편집 | StaffPanel.tsx:860 | text, isEditing | staff.id |
| 직원 이름·직무 | StaffPanel.tsx:1024 | name, role | staff.id |
| 바뀐 파일 탭 커밋 메시지 | ReviewTab.tsx:26 | message, prTitle | staff.id |
| 참고 문서 경로 | RefDocsEditor.tsx:32 | draft | target |
| 결재 질문 직접 답·기획 수정 의견·진행 피드백 | QuestionBox·PlanCard·RunCard | custom/feedback | 각 카드 id |
| (메모만) 회의실 주제 | MeetingPage.tsx:39 | topic, picked, rounds | 하나 |
- 대화상자(OrgDialogs·ManualEditor 등)는 닫으면 비우는 게 의도 → 제외 권장. 검색칸 제외.

## 설계안에 담을 것
1. 공용 방식의 모양(파일·이름·API 예시 코드). 글·첨부·기타 값(팀 선택 등)을 어떻게 다루나.
2. 적용할 입력칸 범위와 각 키. 이번에 안 하는 곳과 이유.
3. 비우는 시점(성공 시), 기존 staffDraft·chatDraft·비서 prefill과의 관계.
4. 첨부(File) 유지 방법과 미리보기 URL 처리.
5. 검증 방법(자동 테스트·화면 확인).
6. 회의실 개편 뒤 붙이는 방법 한 줄.
