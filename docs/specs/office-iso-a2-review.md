# A2(`shared/iso/`) 설계 리뷰 — 박패턴

> 2026-10-24, A2 첫 제출본 기준. 정리드에게 보낸 리뷰가 중간에 잘려 전문을 남긴다. 그 뒤 고친 항목이 있을 수 있다.

## B1 약속 (GridItem · canPlace)
- `GridItem`·`GridPose` 형태는 그대로 확정해도 된다.
- **꼭 고칠 것 — 잘못된 입력은 `canPlace`가 막는다.** 폰 인자는 `gx: 1.5`, `rot: 5.5`, `floor: 9`가 올 수 있다. 지금은 `isInside`가 소수를 통과시키고, `cellKey`가 소수가 되어 겹침 검사가 빠지며, `rotate`가 `as Rot`로 넘긴다. 층 수 범위는 아무 데서도 보지 않는다. `canPlace` 맨 앞에서 "gx·gy·floor 정수, rot 0~3, 1 ≤ floor ≤ 그 레벨 층 수"를 보고 어기면 `out_of_bounds`. 메인과 화면이 같은 규칙을 쓰게 한 곳에 둔다.
- 고치면 좋은 것 — 쓰는 자리가 바닥 밖이거나 다른 가구에 막힌 경우는 `blocks_path` 대신 `spot_blocked`(가칭)로 나눈다. "길을 막아요"는 맞지 않는 안내다. `BlockReason`은 B1의 422 `reason`과 화면 문구로 나가니 B1이 굳히기 전에 정한다.

## 꼭 고칠 것
1. **팀이 섬 안에서 흩어진다.** 섬 안에서 의자 uid 순으로 앉히는데 uid는 위치와 무관하다. 책상 줄이 이어진 큰 섬(흔한 경우)에서 같은 팀이 흩어진다.
   - 대안: 처음 채울 때는 `bySpot` 순(리드 앞자리, 팀이 붙음). 안정성은 `assignSeats(..., prev?: Map<staffId, chairUid>)`로 이전 배정을 받아 그 의자가 남아 있으면 그대로 둔다. 쫓겨난 직원·새 직원만 다시 앉힌다. `prev`는 장면 메모리에만 두고 저장하지 않는다.
   - "먼 곳 빈 의자 1개에 1인 팀이 옮겨 감"도 함께 풀린다(가장 작은 섬 규칙은 새로 앉힐 때만).
   - 테스트: 의자 하나 옮기면 그 자리 직원만 바뀜 / 새 빈 의자를 놓아도 아무도 안 옮김 / 긴 섬 하나에서 팀이 붙어 앉음.
2. **`autoSeats` uid가 훑은 순번이다.** `auto:{floor}:{n}`은 가구 하나 놓으면 번호가 다시 매겨져 기본 자리 직원이 섞인다. `auto:{floor}:{gx},{gy}:c|d`처럼 위치로.

## 고치면 좋은 것
3. **`autoSeats` 모양:** 빈칸 없이 붙여 훑으면 두 번째 줄부터 의자 옆이 갇혀 길 막힘에 걸려 띄엄띄엄 놓인다. "의자 줄 → 책상 줄 → 통로 줄" 3줄 주기·2칸 간격으로 찍으면 고르고 계산도 준다(지금은 칸마다 `canPlace` 2번 × BFS 2번).
4. **회의실 정원:** 문이 앞줄 가운데라 앞줄 의자가 w−1개 — 정원 8·폭 4면 7자리. 문을 옆 벽(가운데 줄 끝 칸)으로 옮기거나 4줄로.
5. **위층 출입구:** 2층 이상은 계단으로 올라오니 출입구는 1층에만, 위층 BFS는 계단에서 시작. `fixedTiles`의 `void floor`가 쓰이게 된다.
6. **모듈 경계:** `place.ts`↔`path.ts`가 서로 물려 있다. `FixedTile`·`fixedTiles`·`fixedTilesFor`를 `room.ts`로 빼고, `Rot`·`FACE_STEP`·`facingOf`는 방향 기본값이라 `grid.ts`로. `seats.ts`의 `'../types'`도 `.ts`로 맞춘다.
7. **`levels.ts`:** 행 객체 대신 `roomOf`·`floorsOf`·`meetingCapacityOf` 함수만 내보내면 A1 표가 와도 import 한 줄만 바뀐다. 위 층 범위 검사에도 `floorsOf`가 필요하다.
8. **`FURNITURE` 표 검사 테스트:** 모든 `spot.action`이 `ITEM_ACTIONS`에 있음 / `ITEM_ACTIONS` 품목은 쓰는 자리 1개 이상. 기본 `desk`·`chair`를 서랍에서 꺼낼 수 있게 할지(`owned` 개수)는 B1이 정한다.
9. **깊이 정렬:** 매 프레임 한꺼번에 n²는 B2에서 바꿀 일 — C2에서 바꿨다(`office-iso-prototype.md` 6-3절).

## 그대로 좋은 것
- 길 막힘: "원래 닿던 자리가 끊길 때만" 막기, 놓는 가구 자신의 자리는 늘 닿아야 함, 옮기는 가구를 `others`에서 빼고 비교.
- 회의실 문으로만 드나드는 경계(`canCross`), 의자 칸은 옆 칸까지만 닿으면 됨(`canEnter`), 같은 결과가 나오는 A* 힙.
- `rotate`가 차지 칸·자리·방향을 함께 돌림(앞자리 (0,d) → r1에서 (−1,0)·↘ 확인).
- 표에 없는 품목 1×1 + `ITEM_ACTIONS`면 앞자리, `lv-*`·`prop-*` 임시 id.
- `ITEM_ACTIONS`를 shared로, 예전 장면 오프셋만 `LEGACY_SPOTS`.
- `FloorState`의 `owned` 있을 때만 소유·레벨 검사, `room`·`fixed` 주입.
- 고정 칸 값은 설계서에 옮겨 적지 말고 출처를 `fixedTilesFor`와 이 시제품 문서 4-1절 하나로. 설계서 2-4절에는 링크 한 줄(4번 문 위치가 정해진 뒤).
