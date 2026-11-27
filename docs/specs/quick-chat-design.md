# 빠른 대화 1차 — 최종 설계 결정 (2026-11-26, 정리드)

입력: 최가독 안(가독성·재활용), 박패턴 안(유지보수성·검증), 코드 조사 2건(결재 방식, 연습 직원 제외 지점).
요구·대표 결정은 `quick-chat-feasibility.md`, 화면은 `docs/design/quick-chat/index.html`.

## 결정
1. **표시 칸**: `Staff.isQuick` 새로 둔다(두 안 공통). `isPractice` 확장은 안 한다 — 연습 직원은 세션이 없고(`hire`가 `manager.add` 전에 끝남) 빠른 대화는 세션이 있어야 한다.
   DB는 `staff.is_quick`, `staff.quick_closed_at`(닫은 시각, 비면 진행 중) 열 추가. 별도 표 없음(대화·세션·사용량 경로 재사용).
2. **제외 판단 한 곳**: `shared/quickChat.ts`의 `countsAsStaff(s)` = 연습도 빠른 대화도 아님. 인원·책상·업적·회사 레벨·단체방·회의·위임 대상·직원 목록 화면이 이 함수를 쓴다.
   조사 결과 연습 직원도 `nextDesk`·사무실 그림·회의 정원·위임 목록·사용량 합계에서는 빠지지 않으므로, 기존 `isPractice` 필터를 따라 하는 것만으로는 부족하다 → 위험 지점 목록(조사 ②)까지 함께 적용.
3. **대화방**: room 값 `quick:<직원 id>`(최가독 안). `parseRoom`에 `kind: 'quick'` 추가 — 안 넣으면 팀 방으로 오인한다.
4. **책상**: `deskIndex = -1`, `nextDesk`는 빠른 대화 직원을 세지 않는다.
5. **결재**: 새 규칙 없음. 설정 `quickApproval`(기본 `'ask'`), 시작 창 전환 단추 초기값으로 쓰고 고용 때 `approvalMode`에 넣는다. GPT도 같은 두 방식으로 동작(`codex.ts` onRequest)함을 확인.
6. **수당**: 사용량 표는 그대로 쓰고, 합계 쿼리에서 `is_quick` 직원을 뺀다. 빠른 대화 합계는 따로 내는 함수 추가.
7. **삭제**: 일 멈춤 → 세션 파일 삭제(`findSessionFile`·`findCodexRollout`로 찾고, `~/.claude/projects`·`~/.codex/sessions` 아래일 때만 지움) → `fire` → `deleteStaffTraces` → 방 대화 삭제.
8. **닫기**: 일 멈춤 + `quick_closed_at` 기록. 그 방에 다시 글을 보내면 진행 중으로 돌아온다.
9. **모델 칩**: 같은 엔진 안에서만 바꾼다(Claude 목록 `CLAUDE_MODEL_ROWS`, GPT 목록 `providers.codex.models`). 엔진 교체는 2차.
10. **원격(휴대폰)**: (2026-11-27 변경) 휴대폰 v2 화면에서도 시작·닫기·삭제·대화 가능 — 스냅샷·이벤트에서 빼지 않는다. 시작은 S 분류라 작업 폴더·승인 방식은 PC가 정하고(기본 폴더·'ask'), 인원·책상·수당은 `countsAsStaff`로 계속 빠진다. 옛 v1 상태 응답의 직원 목록(`remoteHired`)에서는 계속 뺀다.

## 채택하지 않은 것과 이유
- 최가독: 방문자 상태를 JSON 칸에 넣기 → 정렬·조회가 잦아 열 하나가 단순.
- 박패턴: 제외 지점마다 `isPractice || isQuick`을 직접 쓰기 → 최종적으로 한 함수로 모은다는 본인 권고를 따름.
- 두 안 공통 '채용하기(정식 직원 승격)'와 엔진 중간 교체 → 기획서상 2차.
- 사무실 방문자 그림 → 시안 A·B·C 중 대표 선택 뒤 제작(그 전까지 사무실 그림에서는 빠진다).
