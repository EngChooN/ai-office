# v1.3.2 추가 — 리더가 팀원 일을 기다리는 동안 '대기'로 보이는 문제 (설계 의뢰)

## 대표 제보
리더(팀장·랩 리드)가 팀원에게 일을 맡기고 결과를 기다리는 동안 직원 표시가 '대기(idle)'로 보인다. 실제로는 일이 진행 중이라 버그처럼 보인다.

## 확인한 원인 (정리드)
- 리더의 턴이 끝나면 `app/src/main/hired.ts:574` 에서 `status: isError ? 'error' : this.rt.queued ? 'working' : 'idle'` 로 바뀐다. delegate 뒤 턴이 끝나면 맡긴 일이 남아도 idle.
- 지시서에 적힌 `office.ts` 792·802(인터넷 보관 해제)·1500·2093(질문/결재 닫기)·1173은 부수 지점. 주 원인은 hired.ts:574.
- '맡긴 일이 남았는지' 판정은 이미 `office.ts` `checkStall()`(1988~1995 부근 `hasOpenDelegation`, `hasWaitingPlan`)에 있다: 다른 PC 위임 job 진행 중 / 팀원 origins에 이 리더의 delegate / 팀원 taskQueue / 팀원 담당 카드 todo·doing / 내 기획안 waiting.

## 요구
- 리더가 idle인데 맡긴 일이 남아 있으면 '팀원 일 기다리는 중'(문구는 제안) 같은 별도 표시 또는 working 유지.
- **책상 그림(map/IsoOfficeScene.ts·OfficeMap.tsx), 직원 카드(shared/staffCard.ts nowLine·summaryParts, StaffCard.tsx, StaffPanel), team 도구 출력(office.ts 2769 `describe`)** 이 같은 기준을 써야 한다. 대시보드 집계(shared/dashboard.ts countByStatus)도 고려.
- 맡긴 일이 끝나 결과가 돌아오면 표시가 정상으로 돌아와야 한다(팀원이 끝나 origins·카드가 바뀔 때 다시 계산).

## 주의
- `status === 'idle'` 은 지시 라우팅(office.ts 3287 '쉬는 사람 우선' 등), 멘션 정렬(shared/mention.ts STATUS_ORDER), 큐 처리 등에 쓰인다. working으로 바꾸면 이 동작이 같이 바뀐다.
- StaffStatus에 새 값을 넣으면 `Record<StaffStatus,…>` 전부, 원격(remote)·안드로이드 앱 프로토콜까지 번진다.
- 4개 언어(ko/en/ja/zh) 문구.

## 받고 싶은 것 (각자 따로, 서로 합의하지 말 것)
1. 방식 선택(새 status 값 / Staff에 보조 필드 / working 유지 / 그 밖)과 이유
2. 판정 함수 위치·이름·입력, 언제 다시 계산하는지(patch 지점)
3. 화면별 바뀌는 곳 목록(파일·함수)과 원격·안드로이드 영향
4. 시험 방법(단위 시험 이름·내용)
5. 위험과 하지 않을 것
결과는 `docs/design-refresh/v132-impl/team-wait-<이름 영문>.md`(choi / park)로 저장하고 요약을 보고.
