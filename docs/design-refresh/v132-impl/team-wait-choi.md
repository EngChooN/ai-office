# 리더 '팀원 일 기다리는 중' 표시 — 최가독 설계안 (가독성·단순함·재활용)

코드는 고치지 않았습니다. 박패턴 안은 보지 않고 따로 썼습니다.

## 1. 방식: Staff에 보조 숫자 하나 (`waitingOn?: number`), status는 그대로 idle
- 값 = 지금 이 리더가 맡겨 두고 결과를 기다리는 일의 수. 0이거나 없으면 평소와 같습니다.
- 새 status 값은 안 만듭니다. `Record<StaffStatus,…>` 전부와 원격·안드로이드가 번지는데, 얻는 것은 문구 하나뿐입니다.
- working 유지도 안 합니다. 쉬는 사람 우선 지시 배정(office.ts 3287)과 멘션 정렬·큐 처리가 바뀌어 리더에게 새 지시가 안 가거나 '일하는 중' 인터럽트 경로를 탑니다. 사실이 아니기도 합니다(리더 자신은 쉬는 중).
- 이유: 이미 `todayDone`·`progress`처럼 `liveStaff()`가 덧붙이는 선택 필드 방식이 있어 같은 모양입니다. 라우팅은 idle로 남고 '표시'만 바뀝니다.

## 2. 판정 함수
- 새 파일 `shared/delegation.ts`에 순수 함수 하나:
  `countOpenDelegations(a: { leadId, peerJobs, members: {id, delegateOriginsFromLead, queued}[], tasks }): number`
  - 입력은 checkStall 1988~1995행과 같은 재료: 다른 PC 위임 job 중 진행 상태(queued/sending/accepted/running) 수, 팀원별(origins 중 kind==='delegate'이고 leadId가 이 리더인 것 수 + taskQueue 길이), 팀원 담당 카드 중 todo·doing 수.
  - 같은 일을 이중으로 세어도 되는 '개수'가 아니라 **있다/없다**가 핵심이라, 단순히 합산합니다(화면은 "n건"을 쓰지 않고 있음/없음만 써도 됨).
- **checkStall도 이 함수를 쓰게 바꿔** `hasOpenDelegation = count > 0` 한 줄로 줄입니다. 판정 기준이 두 군데로 갈라지지 않습니다(재활용 핵심).
- office.ts에 얇은 래퍼 `openDelegationsOf(staffId)`(this.delegatesOf·peer·origins·taskQueue·tasks 모아 위 함수 호출).
- 내 기획안 waiting(hasWaitingPlan)은 '팀원 일'이 아니라 '결재 대기'이므로 넣지 않습니다. 이미 대표 결재 표시가 있습니다.
- 언제 계산: `liveStaff()` 안에서 `waitingOn: s.status==='idle' ? this.openDelegationsOf(s.id) : 0`. liveStaff는 모든 emit·스냅샷 때 불리므로 **patch 지점을 따로 안 만듭니다.** 팀원이 끝나 origins·카드가 바뀌면 `scheduleEmit`으로 다시 계산됩니다. (팀원 origins 정리·카드 상태 변경 뒤 emit이 반드시 나가는지는 구현 때 확인 필요 — "확인 못 함". 안 나가는 곳이 있으면 그 지점에만 `scheduleEmit()` 추가.)
- 비용: 리더(팀원이 있는 직원)만 계산하고 idle일 때만 돌려 비용 걱정은 작습니다. tasks 전체 순회가 직원 수만큼이라 규모가 크면 한 번 만든 Map으로 줄이는 것은 나중에.

## 3. 화면별 바뀌는 곳 (모두 `waitingOn > 0 && status==='idle'`를 한 함수로 물음)
공용 보조 `isWaitingOnTeam(s)`를 `shared/staffCard.ts`에 두고 아래가 모두 부릅니다.
| 곳 | 바뀜 |
|---|---|
| `shared/types.ts` Staff | `waitingOn?: number` 한 줄 |
| `shared/staffCard.ts` `nowLine` | idle 분기 앞에 "팀원 일을 기다리는 중" 문구 (task 문장보다 앞) |
| 같은 파일 `summaryParts`·`shared/dashboard.ts countByStatus` | 대기 중 리더는 '일하는 중'으로 셈(netWait 전례). 입력 타입 `Pick<Staff,'status'>`에 `waitingOn` 추가 |
| `StaffCard.tsx`·`StaffPanel` | 상태 점/글자는 `STATUS_META`(renderer/features/status.ts)에서 working 모양 재사용 — `statusMetaOf(staff)` 한 함수로 idle 대신 working을 돌려 줌. 새 색 없음 |
| `map/IsoOfficeScene.ts` | `STATUS_LABEL`(78행) 표시는 "대기" 대신 새 라벨. 책상에서 돌아다니는 로직(1065·1206·1213·1223행 `status==='idle'`)에는 대기 중 리더를 **제외**해 자리에 앉아 있게 함. 일 중 모션(isAtWork)은 건드리지 않음(실제 일은 안 하므로) |
| `office.ts` 2769 `describe` (team 도구) | `${m.status}` 뒤에 대기 중이면 "idle (팀원 일 n건 기다리는 중)" 덧붙임 — 라우팅이 보는 값은 그대로 idle이라 리더가 쉬는 사람으로 보이는 것도 정직하게 나옴 |
| `main/peer/remoteStaffView.ts` | 원격 직원 표시용 변환에 `waitingOn` 한 줄 전달(원격 쪽 PC가 계산해 보냄) |
| 문구 | `dict/staffCard.ts`(nowLine·라벨) 4개 언어 키 2~3개 |
| 원격·안드로이드 | status 값을 안 늘려 **프로토콜 호환이 깨지지 않음.** 필드가 선택이라 옛 클라이언트는 무시하고 '대기'로 보일 뿐입니다. 안드로이드가 알 수 없는 필드를 무시하는지는 확인 못 함(추정: 통과) |

문구 제안: "팀원 일 기다리는 중" / en "Waiting on the team" / ja "チームの作業待ち" / zh "等待团队完成"(ja·zh는 검수 표시).

## 4. 시험 (`scripts/delegationWait.test.mts`, 기존 test 형식)
- `countOpenDelegations`: 아무것도 없으면 0 / 다른 PC job 진행 중이면 >0 / 끝난(done·failed) job만이면 0 / 팀원 origins에 이 리더 delegate가 있으면 >0, **다른 리더의** delegate면 0 / 팀원 taskQueue만 있어도 >0 / 팀원 카드 todo·doing >0, done·review 0 / 팀원이 아닌 사람의 카드 무시.
- `nowLine`: idle+waitingOn>0 → 기다리는 문구, working이면 평소 문장, `waitingOn` 없음이면 기존과 동일(기존 시험 회귀).
- `countByStatus`·`summaryParts`: 대기 중 리더가 일하는 중으로 세어지고 idle에서 빠짐.
- `checkStall` 기존 동작 회귀: 리팩터 전후 `hasOpenDelegation`이 같은 입력에서 같은 값(기존 시험이 있으면 그대로 통과, 없으면 위 함수 시험이 대신).
- 화면 확인(구현 후): 리더에게 delegate → 책상·카드·패널·상황판이 같은 말, 팀원 완료 후 '대기'로 복귀.

## 5. 위험과 하지 않을 것
- 위험 1: emit 누락으로 완료 후에도 표시가 남는 경우(2번의 확인 항목). 팀원 한 명이 오류로 죽어 origins가 안 지워지면 리더가 계속 '기다림' → origins 정리 경로(failHelpRequests 등) 확인 필요.
- 위험 2: 팀원이 멈췄는데 카드 todo가 남아 영구 대기로 보임 — 기준이 checkStall과 같으니 같은 한계. 이 표시가 오히려 멈춤을 드러내는 쪽.
- 위험 3: 라우팅이 리더를 계속 '쉬는 사람'으로 봐 새 일을 받음 — **의도적으로 유지**(리더는 실제로 쉬고 있어 새 지시를 받을 수 있음).
- 하지 않을 것: 새 StaffStatus 값, hired.ts:574 status 변경, 원격·안드로이드 프로토콜 필드 의무화, 기다리는 건수·팀원 이름 목록 표시(문구는 있음/없음 위주), 기획안 waiting을 같은 표시에 섞기, 대시보드에 새 집계 칸.
- 대안(한 줄): 정리드가 건수보다 단순함을 원하면 필드를 `boolean`으로.
