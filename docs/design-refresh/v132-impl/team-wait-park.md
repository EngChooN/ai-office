# v1.3.2 리더 '팀원 일 기다리는 중' 표시 — 박패턴 설계안 (유지보수성·변경 영향 최소화·검증 가능성)

> 설계만 한다. 코드는 고치지 않았다. 최가독 안은 받지 않아 비교하지 않는다.
> 확인한 코드: hired.ts:574 status 계산, office.ts `liveStaff`(709~716)·`progressOf`·`patch`(5192, `scheduleEmit`)·`checkStall`(1980~2000)·`describe`(2759), shared/staffCard.ts `nowLine`·`cardAction`·`summaryParts`, shared/dashboard.ts `countByStatus`, shared/types.ts `Staff`.

## 1. 방식 선택: **Staff에 보조 필드 `awaiting` 추가 (status는 그대로 idle)**

| 방식 | 판정 |
|---|---|
| 새 status 값 `delegating` | 탈락. `Record<StaffStatus,…>` 5곳 이상(status.ts STATUS_META, chatRoomHooks STATUS_ORDER, mention STATUS_ORDER, progressView…), 원격·안드로이드 프로토콜, 대시보드 필터까지 번진다. 영향 범위가 가장 크다. |
| working 유지(hired.ts:574 수정) | 탈락. `status==='idle'`을 '쉬는 사람 우선' 라우팅(office.ts 3287)·멘션 정렬이 쓴다. 리더가 일 안 하는데 working이면 새 지시가 리더 큐에 쌓이고, 리더 턴이 끝났다는 사실(`rt.queued`·`isRunning`)과도 어긋난다. 또 hired.ts는 맡긴 일을 알 수 없어 office 지식이 hired로 새어 들어간다. |
| **보조 필드 `awaiting`** | 채택. 실제 상태(idle)는 라우팅·큐가 그대로 쓰고, **표시만** `awaiting`을 본다. 이미 `progress`·`isAutonomous`처럼 main이 `liveStaff`에서 덧붙이는 화면용 필드 선례가 있다. 옛 화면·휴대폰은 모르는 필드를 무시하므로 프로토콜은 깨지지 않는다. |

추가 복잡도: 화면 4곳이 `status`와 `awaiting`을 함께 봐야 한다 → 아래 §2의 **표시 상태 한 함수**로 흡수해 각 화면이 조건을 따로 쓰지 않게 한다.

## 2. 판정 함수

**(a) 순수 함수 — `shared/delegation.ts` 새 파일** (main에서 입력만 모아 넘긴다. 이유: 시험 가능, main/renderer 모두 import 가능)

```ts
export interface DelegationInput {
  leadId: string
  peerJobStates: string[]            // leadId가 맡긴 다른 PC job의 state들
  members: { id: string; origins: { kind: string; leadId?: string }[]; queuedCount: number }[]  // delegatesOf(leadId)
  tasks: { assigneeId: string | null; status: string; plan?: { status: string } | null }[]
}
export function hasOpenDelegation(i: DelegationInput): boolean   // 팀원 일이 남았나 (checkStall의 기존 식 그대로)
export function hasWaitingPlan(i: Pick<DelegationInput,'leadId'|'tasks'>): boolean  // 내 기획안 승인 대기
export function isAwaitingMembers(status: StaffStatus, i: DelegationInput): boolean
//   = status === 'idle' && hasOpenDelegation(i)   (기획안 승인 대기는 '대표에게 결재 대기'이므로 팀원 기다림이 아니다 → 포함 안 함)
```

**(b) main 어댑터 — `office.ts` private `delegationInputOf(staffId)`**: `checkStall`이 쓰던 재료(`this.peer?.jobs()`, `delegatesOf`, `origins`, `taskQueue`, `tasks`)를 모아 `DelegationInput`으로 만든다. `checkStall`은 이 어댑터+순수 함수를 쓰도록 바꿔 **판정 규칙이 한 곳**이 된다(지금 식을 복사하면 두 곳이 어긋난다). `hasOpenDelegation` 상태 목록(`queued|sending|accepted|running`)은 순수 함수 안 상수로.

**(c) 표시 상태 — `shared/staffCard.ts` 또는 `shared/delegation.ts`의 `displayStatus(staff): StaffStatus | 'awaiting'`**: `staff.awaiting && staff.status==='idle' ? 'awaiting' : staff.status`. 책상·카드·패널·집계는 이것만 본다.

### 언제 다시 계산하나 (patch 지점)
- `liveStaff`가 스냅샷마다 `awaiting: isAwaitingMembers(...)`를 채운다(`progress`와 같은 자리). 리더가 아닌 직원은 `delegatesOf`가 비어 즉시 false → 비용 미미(직원 수 × tasks 선형).
- 스냅샷은 `scheduleEmit`이 돌 때 만들어지므로 **팀원 쪽 변화가 emit을 일으키는지**가 관건. 팀원 status 변경(`patch`)·카드 이동·origins 변경은 대부분 이미 emit한다. **구현 때 확인할 곳**: origins만 바뀌고 emit이 없는 경로(예: 792·802 보관 해제, 1173, 1500·2093 질문/결재 닫기). 정리드가 지적한 이 지점들은 '판정 위치'가 아니라 **"여기서 `scheduleEmit()`이 빠졌는지 점검"** 용도로만 본다. 빠졌으면 그 줄에 `scheduleEmit()`만 추가(판정 코드는 넣지 않는다).
- 다른 PC job 상태 변화(`peer.jobs()`)도 emit 경로를 확인한다(추정: 이미 원격 직원 뷰 갱신이 emit을 일으키지만 코드로는 못 확인).

## 3. 화면별 바뀌는 곳
| 곳 | 변경 |
|---|---|
| shared/types.ts `Staff` | `awaiting?: boolean` 한 줄 + 주석 |
| main/office.ts `liveStaff` | `awaiting` 채움. `checkStall`은 어댑터 사용으로 정리 |
| main/office.ts `describe`(2769, team 도구) | `${m.status}` → `awaiting`이면 새 문구(`staff.tool.team.awaiting`)로. 이 줄은 `StoredStaff`(awaiting 없음)를 받으므로 `isAwaitingMembers(m.status, this.delegationInputOf(m.id))`를 직접 호출 |
| shared/staffCard.ts `nowLine` | `status==='idle' && awaiting`이면 `staffCard.now.awaiting` ("팀원 일을 기다리는 중이에요") — idle 분기 앞. `CardStaff`에 `awaiting` 추가 |
| `cardAction` | `awaiting`이면 `assign` 대신 `none`이 아니라 **그대로 assign**(맡기는 건 가능; 리더는 실제 idle) — 바꾸지 않는다 |
| `summaryParts`·`countByStatus`(dashboard.ts) | **working에 합산하지 않는다**(대표 눈에 '일하는 중' 숫자가 맞아지긴 하나 필터 `matchesStaffFilter`와 어긋난다). 선택안: ① 합산 안 함(권장: idle 그대로, 카드 한 줄로 충분), ② working 합산 시 `countByStatus`·`matchesStaffFilter` 둘 다 `displayStatus` 사용. 정리드 결정. |
| renderer 상태 점·라벨(`features/status.ts` STATUS_META) | 키 추가 없이 카드·패널 머리에서 `awaiting`이면 working 색 점 + 문구만 덮어씀(STATUS_META는 안 건드림) |
| map/IsoOfficeScene.ts·OfficeMap.tsx | 책상 그림이 `status`로 자세·말풍선을 정하는 곳에서 `displayStatus`로 교체(작업 자세 대신 '기다리는' 말풍선이 자연스러우나 새 그림은 만들지 않고 **working 자세 재사용** 권장). 구체 줄은 구현 때 grep(`status ===`). |
| i18n | `staffCard.now.awaiting`, `staff.tool.team.awaiting`(+선택: 책상 말풍선) 4개 언어 ko/en/ja/zh |

원격·안드로이드: `awaiting`은 선택 필드라 JSON에 있어도 옛 앱은 무시 → 프로토콜 변경 없음. 원격 직원 뷰(`remoteStaffBase`)는 `awaiting`을 채우지 않는다(다른 PC 리더의 맡긴 일은 그 PC가 안다). 휴대폰은 이번에 표시하지 않음(후속). 단 휴대폰이 idle로 보이는 불일치는 남는다 — 위험에 기록.

## 4. 시험 (`shared/delegation.test.mts`, 기존 시험 위치·러너 규칙을 따른다)
1. `hasOpenDelegation`: 다른 PC job이 running/queued → true, done/failed만 → false
2. 팀원 origins에 이 리더의 delegate → true / 다른 리더의 delegate → false
3. 팀원 taskQueue>0 → true
4. 팀원 담당 카드 todo·doing → true, done·팀 밖 직원 카드 → false
5. 전부 없음 → false
6. `isAwaitingMembers`: status working/error/offline이면 false(idle일 때만), idle+open → true, 내 기획안 waiting만 있으면 false
7. 일이 끝나 origins·카드가 사라지면 같은 입력에서 true→false (되돌아옴)
8. `displayStatus`·`nowLine`: idle+awaiting → awaiting 문구, awaiting이어도 error/waiting이면 기존 문구 유지
9. `countByStatus`: 선택안에 따라 idle 유지(또는 working 합산) 고정
10. 4개 언어 키 존재 시험(기존 i18n 키 일치 시험이 있으면 그대로 통과)
- `checkStall` 회귀: 어댑터 교체 전후 같은 입력에서 `shouldNudgeLead` 결과 동일(기존 시험이 있으면 그대로 통과 확인).
- 수동: 리더에게 위임 → 리더 턴 끝난 직후 카드·책상·team 도구·대시보드 확인 → 팀원 완료 후 idle 복귀 확인.

## 5. 위험과 하지 않을 것
- **emit 누락**: 팀원 쪽 변화가 스냅샷을 안 일으키면 표시가 늦게 풀린다(§2 점검 항목). 가장 큰 위험.
- **판정 두 곳 어긋남**: `checkStall`을 어댑터로 바꾸지 않고 식을 복사하면 달라진다 → 반드시 한 곳으로.
- 리더가 아닌데 `delegatesOf`가 있는 직원(팀 리더 아님)도 true가 될 수 있다 — 기존 `checkStall`과 같은 기준이므로 그대로 따른다.
- 휴대폰·원격은 이번에 idle로 남아 불일치(알려진 한계).
- **하지 않을 것**: status 값 추가, hired.ts:574 수정, `status==='idle'` 라우팅·정렬 변경, 큐 처리 변경, 책상 새 그림, 안드로이드 프로토콜 변경, 기획안 승인 대기를 '팀원 기다림'에 포함.

## 6. 정리드 선택 쟁점
1. 대시보드 집계에 working 합산 여부 (권장: 합산 안 함)
2. 책상 그림: working 자세 재사용 (권장) vs 별도 말풍선
