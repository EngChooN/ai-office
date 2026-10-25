# 사무실 개편 — 기술 설계와 작업 나누기 (아이소메트릭 · 칸 배치 · 레벨 1~20)

> 작성: 박패턴 (FE 설계) · 2026-10-24 · 상태: 초안 (대표님 확정 전)
> 저장: 박패턴 세션에 쓰기 도구가 없어 claude-office(리드)가 보고 전문을 그대로 옮겨 저장함.
> 함께 보는 문서: [office-iso-levels.md](office-iso-levels.md) (김기획, 레벨표·서랍 흐름), [office-iso-art.md](office-iso-art.md) (이디자, 그림체), [office-iso-prototype.md](office-iso-prototype.md) (정리드, 시제품)
> 코드 위치는 0.11.0 기준입니다. 경로는 `app/src/` 아래입니다.

## 0. 요약
- **계산과 그리기를 나눕니다.** 칸 좌표 변환, 차지 칸과 돌리기, 놓기 검사, 길찾기, 자리 배정은 Phaser 없이 `shared/iso/`에 순수 함수로 둡니다. 화면(미리보기·시제품)과 메인 프로세스(저장 전 최종 검사)가 같은 코드를 씁니다. 테스트는 `scripts/*.test.mts`로 합니다.
- **화면은 새 장면을 따로 만들어 교체합니다.** 지금 `OfficeScene.ts`(2,300줄)를 고쳐 나가지 않고, `IsoOfficeScene.ts`를 새로 만든 뒤 개발용 스위치로 바꿔 끼웁니다. 다 되면 예전 장면을 지웁니다.
- **데이터는 새 칸에 담습니다.** 새 배치는 `shop.grid`에 둡니다. 옮길 때 예전 `shop.placed`는 빈 배열로 비우고(서랍으로 돌려보냄) 지우지 않습니다. 예전 폰 화면은 빈 배열을 받을 뿐이라 깨지지 않습니다.
- **프로토콜 버전은 올리지 않습니다(v2 유지).** 메서드는 새로 추가하고 예전 메서드는 남겨 둡니다. 규격 문서 57번째 줄 "추가는 버전을 올리지 않는다"를 따릅니다.
- **레벨표를 한 곳으로 모읍니다.** 레벨 정보를 `shared/officeLevel.ts`의 `LEVEL_TABLE` 20행 하나에 두고, 나머지(`COMPANY_LEVELS`, `OFFICE_LEVELS`, `MEETING_ROOM_OF_LEVEL`, 칸 크기, 재질 단계)는 모두 여기서 계산합니다.

---

## 1. 화면

### 1-1. 칸 좌표 ↔ 화면 좌표
규격은 이디자 문서를 따릅니다. 칸 하나는 그림 32×16이고, 화면에서는 `PIXEL=2`를 곱해 64×32입니다.

`shared/iso/grid.ts`:
```ts
export const TILE_W = 64, TILE_H = 32          // 화면(세계) px
export interface Origin { x: number; y: number } // (0,0) 칸 위 꼭짓점의 세계 좌표
export const toWorld = (o: Origin, gx: number, gy: number) =>
  ({ x: o.x + (gx - gy) * TILE_W / 2, y: o.y + (gx + gy) * TILE_H / 2 })
export const toGrid = (o: Origin, x: number, y: number) => {
  const a = (x - o.x) / (TILE_W / 2), b = (y - o.y) / (TILE_H / 2)
  return { gx: Math.floor((a + b) / 2), gy: Math.floor((b - a) / 2) }
}
```
- **한 칸의 바닥 중심**은 `toWorld(gx + 0.5, gy + 0.5)`. 직원 발밑과 가구 기준점이 여기에 옵니다.
- **세계 크기:** 너비 `(cols + rows) * 32 + 여백`, 높이 `(cols + rows) * 16 + 벽 96 + 여백`. 24×24이면 약 1,600×900.
- **원점:** `origin.x = rows * 32 + 여백`, `origin.y = 벽 96 + 여백`.
- **클릭 판정:** 가리키는 칸은 `toGrid`로 구합니다(Phaser 사각형 판정 안 씀). 놓인 가구는 "가리킨 칸을 차지한 가구"로 찾아 투명 부분 오선택이 없습니다.

### 1-2. 깊이 정렬
**규칙:** 두 물체의 차지 칸이 한 축으로 떨어져 있으면 그 축에서 작은 쪽이 뒤. `a.gxMax <= b.gxMin || a.gyMax <= b.gyMin` → A가 뒤(이디자 문서 6번과 같음).

- **놓인 가구:** 배치가 바뀔 때만 위상 정렬로 rank를 매기고 `setDepth(rank * 10)`. 겹침은 놓기 검사에서 막으므로 순환 없음. 한 층 100개 정도라 O(n²) 충분.
- **직원(1×1):** 매 프레임, 화면에서 겹쳐 보이는 가구 중 직원이 앞에 있어야 하는 가구 rank 최댓값 `* 10 + 5`. `gx + gy` 합 정렬은 긴 가구 옆에서 틀려서 버림.
- **같은 가구 안의 층:** +0 바닥에 까는 것(러그) · +1 의자 좌판 · +5 앉은 직원 · +7 의자 등받이. r2·r3이면 등받이가 앞이라 +1과 +7이 바뀜.
- **고정 층:** −10000 바닥·벽 · 50000 밤 덮개 · 55000 레벨업 효과 · 60000 말풍선. 꾸미기 중 들고 있는 가구는 40000, 그 아래에 초록·빨강 칸 미리보기.

> 시제품(정리드)은 가구·직원을 매 프레임 함께 정렬(0.2ms)했습니다. 가구가 수백 개로 늘면 위 방식으로.

### 1-3. 바닥·벽 그리기 비용
바닥 24×24=576칸 + 뒤쪽 벽 두 면은 레벨·재질 단계·층이 바뀔 때만 **RenderTexture 한 장에 미리 굽습니다.** 지금처럼 `drawRoom()`이 통째로 다시 만들면 층 장면 최대 5개와 폰 미니 뷰가 함께 돌 때 무거움.

### 1-4. 카메라·확대
- `fitZoom`, `zoomBy`, `clampCamera`, 끌어 옮기기, 집게 확대는 그대로 옮기고 세계 크기만 1-1절 식으로.
- 24×24에 5층이면 많이 작아짐. `fitZoom` 아래 한도(`fitZoom * 0.6`)는 유지, 처음 열 때 **직원이 가장 많은 구역을 가운데**에. 정확한 기준은 시제품을 보고 정함.
- 조작(R/오른쪽 클릭 돌리기, Delete 넣기)은 장면이 아니라 꾸미기 컨트롤러(C1)가 받음.

### 1-5. 미니 뷰(`officeStage.ts`)에 주는 영향
- **계약:** `actorTarget(staffId)`, `meetingFocus`, `fixedFloor`, `miniIgnore`, `currentFloor`, `setMapViewport`, `fitView` 7종을 `IsoOfficeScene`도 같은 이름으로 제공 → `officeStage.ts` 무수정.
- **다시 맞출 값:** `MINI_ZOOM`, `FOLLOW_UP`, `COMPACT_FOLLOW_UP`(직원 크기·몸 중심 변경), `meetingFocus`(회의실 칸 중심).
- **같이 처리:** 대시보드 카드 미니 뷰 확대 문제 수정안(칸 비율 받기, `COLS` 2)을 개편 전에 먼저 반영. 층 장면은 층마다 구운 바닥 한 장. 슬롯 8개·갱신 빈도·장면 공유는 그대로.

---

## 2. 데이터

### 2-1. 가구 규격 (`shared/iso/furniture.ts`)
```ts
export type Rot = 0 | 1 | 2 | 3                  // r0 ↙, r1 ↖, r2 ↗, r3 ↘ (이디자 문서 5번)
export type Layer = 'object' | 'flat'            // flat: 러그처럼 밟고 지나가는 것
export interface FurnitureSpot {
  at: [number, number]                           // r0 기준 상대 칸 (차지 칸 밖이면 '쓰는 자리')
  face: Rot
  use: 'sit' | 'use'
  action?: string                                // ITEM_ACTIONS 키
}
export interface FurnitureSpec {
  size: [number, number]                         // r0 기준 [w(gx), d(gy)]
  layer: Layer
  kind: 'desk' | 'chair' | 'seat' | 'deco'       // seat: 앉을 수 있지만 근무 자리는 아님(소파)
  spots?: FurnitureSpot[]
}
export const FURNITURE: Record<string /* itemId */, FurnitureSpec>
```
- **돌리기:** `rotate(spec, rot)`가 차지 칸(홀수 rot이면 w↔d)·자리 좌표·방향을 함께 돌림. 텍스처 키 `item-{itemId}-r{rot}`.
- **크기:** 김기획 문서 2-3절 제안값(책상 2×1, 의자 1×1, 회의 탁자 2×2 등). 규격 없는 기존 품목은 `[1,1]`, `'object'`.
- **`ITEM_ACTIONS` 옮기기:** `OfficeScene.ts:312`의 x 오프셋 방식 → `FURNITURE[itemId].spots[].action` + `shared/iso/actions.ts`(이모지·대사). 예: foosball `[-26, 26]` → `[{at:[-1,0],face:3,use:'use',action:'foosball'},{at:[2,0],face:1,use:'use',action:'foosball'}]`. '쓰는 자리'는 차지 칸 바깥이고 비어 있고 닿을 수 있어야 함(2-3절 검사 5).

### 2-2. 저장 형식 (`ShopState`, 설정 'shop' JSON)
```ts
export interface GridItem { uid: string; itemId: string; floor: number; gx: number; gy: number; rot: Rot }
export interface ShopState {
  owned: Record<string, number>
  surfaces: ...                                  // 그대로 (바닥·벽지 품목은 재질 단계 위에 덮어씀 — 이디자와 확인)
  placed: PlacedItem[]                           // 예전 형식. 옮긴 뒤로는 늘 [] (예전 폰 화면 호환용)
  grid: GridItem[]                               // 새 배치
  gear: Record<string, { desk?: string; chair?: string }>   // 그대로 (2-5절)
  schema?: 2                                     // 옮기기 완료 표시
}
```
- **서랍 개수** = `owned[itemId] − grid의 그 itemId 개수`(저장 안 함, 지금 `available()` 방식).
- **층:** `floor`는 1부터. 지금의 1층 전용 제한(`OfficeScene.ts:1014`)을 풂.
- **층이 줄 때:** 레벨이 내려가지 않으면(Q7) 원칙적으로 없음. 그래도 층 수를 넘는 가구는 그리지 않고 서랍 개수에도 넣지 않음. 데이터는 지우지 않음.

### 2-3. 놓기 검사 (`shared/iso/place.ts`)
```ts
type BlockReason = 'out_of_bounds' | 'overlap' | 'fixed_tile' | 'blocks_path' | 'not_owned' | 'level_locked'
canPlace(state: FloorState, item: { itemId, gx, gy, rot }, ignoreUid?): { ok: true } | { ok: false; reason: BlockReason; tiles: [gx, gy][] }
```
순서대로 검사하고 처음 걸린 이유 하나를 돌려줌(`tiles`는 빨강으로 칠할 칸).
1. **바닥 밖:** `0 ≤ gx < cols`, `0 ≤ gy < rows`. 벽은 뒤쪽 두 면의 선이라 칸과 겹치지 않음. 벽걸이 품목은 범위 밖.
2. **고정 칸:** 층마다 정해진 회의실, 계단·엘리베이터, 출입구(`fixedTiles(level, floor)`).
3. **겹침:** 같은 layer끼리만 막음(flat 위 object는 허용). 옮기는 가구 자신은 `ignoreUid`.
4. **소유·레벨:** 서랍 0개 또는 `minLevel` 미달. 메인에서만 의미.
5. **길 막힘:** 놓았다고 가정하고 출입구에서 BFS. 앉는 자리·쓰는 자리·회의실 문·계단에 모두 닿아야 함. 576칸이면 1ms 미만이라 끄는 동안 칸이 바뀔 때마다 돌려도 됨.

- 같은 함수를 화면(미리보기)과 메인(저장 직전 재검사)이 씀. 지금 `moveItem`은 검사가 없음(`office.ts:1580`) — 새 메서드는 모두 메인에서 재검사.
- 빨강 안내 문구는 김기획 문서 표, 이유↔문구 매핑은 화면 쪽.

### 2-4. 층의 칸 크기와 고정 칸
- 칸 크기 `LEVEL_TABLE[level].grid = [cols, rows]`. 같은 레벨이면 모든 층이 같은 크기.
- 고정 칸: 회의실(오른쪽 뒤 구석 사각형, `MEETING_ROOMS` 단계별 크기) · 계단·엘리베이터(왼쪽 뒤 2×2) · 출입구(앞쪽 가운데 1칸, 1층은 로비 쪽). 정확한 위치는 시제품에서 맞춰 이 문서에 다시 적음.

### 2-5. 개인 책상·의자 꾸밈(gear)
- `gear[staffId].desk/chair`는 그 직원 자리의 겉모습. 앞으로는 직원이 배정된 자리(놓인 책상·의자)를 그릴 때 그 직원의 gear 모양을 입힘. 데이터 변경 없음.
- 상점 `desk`·`chair` 품목을 칸 가구로 바꿀지는 대표님 결정(9절 D4).

---

## 3. 옮기기 (한 번만 실행)
메인 프로세스 시작 시 DB 트랜잭션 하나로, `shop.schema !== 2`일 때만(여러 번 실행해도 결과 같음).
1. **보관:** 지금 'shop' JSON과 `settings.layout`을 설정 키 `shop.backup.v1`에 복사.
2. **놓인 가구 → 서랍:** `placed = []`. `owned`는 그대로라 모두 서랍 개수로 돌아감.
3. **고정 소품 → 서랍 가구:** `settings.layout`을 쓰던 소품(printer, cabinets, trash, lamp, plant{i}, aquarium, pingpong, arcade, napPod, fountain 등)을 품목 id `prop-{key}`로 `FURNITURE`·그림을 만들고 가격 0·판매 안 함. **지금 레벨에서 보이던 것만** `owned['prop-…'] += 1`. `settings.layout`은 지우지 않음(예전 폰 화면만 읽음).
4. **`grid = []`, `schema = 2` 저장.**
5. **처음 열 때 기본 자리 채우기**(6-2절) + 김기획 문서 안내 문구.

- 소품까지 서랍에 넣으면 첫 화면이 텅 빔 → 소품만 기본 위치에 다시 놓을지 대표님 결정(D3).
- 테스트 `scripts/isoMigrate.test.mts`: 두 번 실행해도 같음, 전후 `owned` 합계 같음, 백업 키 있음.

---

## 4. 폰 호환

### 4-1. 전제
- 안드로이드 앱은 사무실을 직접 그리지 않음. `WebShell.kt`가 앱에 든 `assets/web/mobile.html`(같은 Phaser 장면)을 띄움 → "예전 폰 앱" = **예전 웹 번들**.
- 원격 v2 규격(57줄): 모르는 필드는 무시, 필드·메서드·오류 코드 추가는 버전을 올리지 않음.
- 메서드 표의 실제 위치는 `main/remote/v2.ts`(`shared/remoteMethods.ts`는 없음).

### 4-2. 정한 것
| 항목 | 결정 | 이유 |
|---|---|---|
| 프로토콜 버전 | **v2 그대로** | 모두 추가로 끝남 |
| 칸 배치 | **새 메서드** `placeGridItem(itemId, floor, gx, gy, rot)` → `{ uid }` 또는 422 `{ code: 'blocked', reason }`, `moveGridItem(uid, floor, gx, gy, rot)` | `moveItem(uid, x, y)`의 뜻을 바꾸면 예전 화면이 엉뚱한 칸으로 옮김. 인자 개수가 같아 서버가 구분 못 함 |
| `storeItem(uid)` | 그대로, `grid`와 `placed` 둘 다에서 찾음 | 뜻이 같음 |
| 예전 `placeItem(itemId, x?, y?)` | 남겨 두고 서랍에서 1개를 1층 첫 빈칸(`canPlace` 통과, rot 0)에 자동 배치. 자리 없으면 422 `blocked` | 예전 상점 "놓기" 버튼이 오류 없이 동작 |
| 예전 `moveItem(uid, x, y)` | 남겨 두되 `grid`의 uid면 아무것도 안 하고 성공 | 예전 화면 오류 창 방지 |
| 메서드 표 | `OFFICE_METHODS`와 `V2_METHODS`에 두 메서드 추가(`'s n n n n'`), `secretaryTools.ts`에서는 제외 | 기존 테스트 3종(`remote-v2`, `secretary`, `mobile`)이 누락을 잡음 |
| 데이터 | `shop.grid`, `shop.schema`는 예전 화면이 무시. `placed = []`이라 가구 없는 예전 사무실이 보임 | 깨지지 않고 모습만 다름 |

### 4-3. 확인 필요: 예전 화면이 레벨 11 이상을 받는 경우
- 예전 번들의 `COMPANY_LEVELS`는 10행. `companyFromXp`는 표 길이로 잘라 안전하지만, 서버가 보낸 레벨로 `COMPANY_LEVELS[level - 1]`을 바로 읽는 곳이 있으면 `undefined`로 깨짐.
- **A4 점검 결과(임안드, 2026-10-24): 위험 확인.** 예전 웹 번들은 레벨 11 이상을 받으면 화면 전체가 하얗게 멈추고 재시작해도 복구되지 않음. → B1에서 아래 `capabilities` 방식 **필수**.
- **구현 첫 작업(A4)으로 예전 번들(1.0.x, 1.1.0)을 점검.** 위험하면 새 화면이 hello에 `capabilities: ['iso-office']`를 싣고, 서버는 이 값이 없는 클라이언트에게 회사 레벨을 `min(level, 10)`으로 보냄(필드 추가라 버전 유지).

#### A4 점검 결과 (임안드, 2026-10-24)
**확인 방법.** 폰 미리보기 번들(`vite.mobile.config.mts --mode preview`, 앱에 든 번들과 같은 소스)을 헤드리스 크롬(412×915)에 띄우고, 가짜 셸 응답을 가로채 `company.level = 15`, `shop = { placed: [], grid: [가구 1개], schema: 2 }`로 바꿔 보냄. 앱에 든 `dist-mobile` 번들에도 같은 코드(`y[e-1].title`)가 있는 것을 확인. 1.1.0 번들은 보관본이 없어 직접 띄우지 못했지만, 아래 코드는 0.4.0(레벨 10단계 개편)부터 그대로라 같다고 봄. 화면: `office-iso-tech/a4-level15.png`.

| 버전 | 결과 |
|---|---|
| 1.0.x (네이티브 Compose 화면) | **영향 없음.** 사무실을 그리지 않고 `company`·`shop`을 읽지 않음(Kotlin에 level 쓰는 곳 없음) |
| 1.1.0 ~ 0.11.0 (웹 번들) | **깨짐.** 레벨업 축하 창에서 화면 전체가 빈 화면 |

**깨지는 곳 (1곳)**
- `renderer/features/LevelUp.tsx:77` `COMPANY_LEVELS[level - 1].title` → `TypeError: Cannot read properties of undefined (reading 'title')`. 오류 경계(ErrorBoundary)가 없어 React 전체가 내려가고 `#root`가 비어 **빈 화면**.
  - 축하 창이 뜨는 조건: 본 레벨(`office:lastSeenLevel`)보다 받은 레벨이 높을 때. 처음 쓰는 기기도 `level > 1`이면 1부터 축하하므로 똑같이 깨짐.
  - 창을 닫아야 본 레벨이 저장되는데 그 전에 깨지므로 **앱을 다시 켜도 계속 빈 화면**. 업무 모드가 켜져 있을 때만 축하 창을 건너뛰어 피함.

**깨지지 않는 곳 (레벨 15에서 화면·코드로 확인)**
- `OfficeMap.tsx:138` `COMPANY_LEVELS[level - 1]?.title`: 이름만 빠짐("Lv.15 3층 건물"). `:47`·`:155` 다음 레벨 카드는 `level < 10`이 아니라서 안 보임.
- `officeOf`·`meetingRoomOf`·`clampFloor`(`shared/officeLevel.ts:34·62·93`), `OfficeScene.ts:127` `specOf`: 표 끝(Lv.10)으로 자름 → Lv.10 모습, 3층. 건물 안·층 전환·꾸미기 모드 오류 없음.
- `exteriorSprites.ts`·`OfficeScene.ts`의 `level >= n` 비교, 상점 `level >= minLevel`: 최고 단계처럼 동작. 상점 화면 정상.
- `shop.placed = []`, 모르는 `shop.grid`·`shop.schema`: 오류 없음. 산 가구만 안 보이고 `settings.layout` 고정 소품은 보임(4-2절 예상대로).

**결론: `capabilities: ['iso-office']` + 예전 클라이언트에 `min(level, 10)` 필수.** 줄여 보내면 예전 화면은 Lv.10 모습으로 깨지지 않음(위 표의 "깨지지 않는 곳"은 모두 Lv.10 이하에서 이미 쓰던 경로). 서버 쪽은 B1에서 `main/remote/capabilities.ts`로 들어감(스냅샷 응답·snapshot 이벤트를 토큰별로 줄임).

#### 능력 판정 방식 변경 (강백엔, 한리뷰 1-1·1-3 반영) — 아래 "hello" 항목보다 우선
- **능력은 토큰에 저장하지 않음.** 같은 토큰을 예전 폰과 새 폰이 함께 쓸 수 있어, 토큰 단위로 저장하면 새 폰의 hello 때문에 예전 폰도 Lv.11 이상을 받아 빈 화면이 됨.
- **요청 헤더 `X-Office-Capabilities: iso-office`** (쉼표로 여러 개, 대소문자 무시, 모르는 값은 버림)
  - `POST /v2/call`: 요청마다 판정. 헤더가 없으면 결과의 `company`를 줄여 보냄.
  - `GET /v2/events`: 연결할 때의 헤더로 그 연결만 판정. snapshot 이벤트(처음·묶음 전송 모두)를 연결마다 따로 모양을 정함. 재연결 때도 헤더를 다시 실어야 함.
- **`hello`는 확인용으로만 남김.** 아무것도 저장하지 않고 서버가 아는 능력만 돌려줌(`{ capabilities: ['iso-office'] }`). 예전 PC는 404 `unknown_method` → 칸 배치를 쓰지 않음. 스냅샷을 다시 보내지 않음.
- **줄이는 값(1-3):** `company.level = 10`, `title = COMPANY_LEVELS[9].title`, `nextXp = COMPANY_LEVELS[9].xp`, `progress = 1`(마지막 레벨과 같은 모양). `xp`는 그대로.
- **폰 쪽 할 일(서버 밖):** 화면 번들은 셸과 HTTP를 직접 하지 않으므로 헤더는 **셸이 붙임.** 제안: 새 번들이 `ready`의 `features`에 `'iso-office'`를 넣고, 셸은 그 값이 있으면 `/v2/call`·`/v2/events` 요청 모두에 헤더를 붙임(재연결 포함). 예전 APK(예전 셸+예전 번들)는 헤더가 없으므로 계속 줄여 받음.

#### 새 화면·셸이 할 일 (폰 쪽) — 구현됨 (임안드, 한리뷰 1-2)
- **화면 → 셸:** 새 번들은 `ready`에 `features: ['ime', 'iso-office']`(`renderer/mobile/install.ts`, 목록은 `remoteOffice.ts` `SCREEN_CAPABILITIES`). 화면 번들은 HTTP를 직접 하지 않으므로 헤더는 셸이 붙인다.
- **셸(Kotlin):** `ready` features 중 아는 능력(`BridgeProtocol.kt` `SCREEN_CAPABILITIES`)만 골라 `/v2/call`마다, `/v2/events`는 연결·재연결마다 `X-Office-Capabilities` 헤더로 싣는다(`RemoteClient.v2Call`·`v2Events`, `EventStream`의 `capabilities`). 화면을 다시 읽어 능력이 바뀌면 이벤트 스트림을 새 헤더로 다시 붙임. 예전 APK(예전 셸+예전 번들)는 헤더가 없어 계속 Lv.10으로 받음.
- **hello(예전 PC 판별만):** `remoteOffice.ts`가 `connection: open`(처음·재연결)과 `resync` 때마다 `hello`. 결과에 `iso-office`가 있으면 새 PC. 404 `unknown_method`면 예전 PC → `placeGridItem`·`moveGridItem`을 보내지 않고 "PC의 Claude Office를 업데이트하면…" 안내 + `pc_update_required` 오류. 확인 전에 보낸 칸 배치가 `unknown_method`로 오면 그때 예전 PC로 봄. 연결 실패 등 다른 오류는 판단을 미룸(`isoOffice()` = `null`). 스냅샷은 다시 읽지 않음(헤더로 이미 실제 레벨).
- **`blocked`의 `reason`:** 셸이 오류 본문의 `reason`을 넘기고(`BridgeOut.fail`), 화면은 `RemoteCallError.reason`으로 받음.
- **확인 (2026-10-24, A4와 같은 헤드리스 방식, `office-iso-tech/b1-capabilities-e2e.png`):** 실제 `RemoteService`(TLS) + Kotlin 셸과 같은 규칙의 셸 흉내 + 같은 토큰으로 **0.11.0 APK에서 꺼낸 예전 번들**과 **새 번들(`?iso=1`)**을 동시에 붙임. PC 레벨 15 → 16(snapshot 이벤트) → 연결 모두 끊고 재연결 → 15.
  - 예전 번들: 받은 회사 레벨 `[10, 10, 10, 10, 10]`, 화면 "Lv.10 캠퍼스 · 3층", 처음 쓰는 기기라 "회사 Lv.10 달성" 축하 창이 정상으로 뜸(A4의 빈 화면 경로), 페이지 오류 0.
  - 새 번들: `[15, 15, 16, 16, 15]`, "Lv.15 카페테리아 · 4층 건물", 아이소 방 20×20(Lv.16에서 21×21), 건물 안 4F~1F, 꾸미기 기준 레벨(`viewLevelOf`) 15, hello 200 `['iso-office']`, 페이지 오류 0.
- 테스트: `scripts/mobile.test.mts`(hello 시점·예전 PC 거절·reason), 안드 `V2ShellTest`(능력 고르기·호출 헤더·재연결마다 헤더·reason 전달).

**`placeGridItem`·`moveGridItem` 메서드 표 (이미 반영된 것과 남은 것)**
| 위치 | 상태 |
|---|---|
| `shared/officeApiShape.ts` `OFFICE_METHODS`, `shared/types.ts` OfficeApi | 반영됨 |
| `main/remote/v2.ts` `V2_METHODS` `R('s n n n n')` | 반영됨. 셸 `METHOD_NAME`(`^[A-Za-z][A-Za-z0-9]{0,63}$`)을 통과하므로 **셸은 메서드 목록 수정 불필요** |
| `shared/secretaryTools.ts` 제외 | 반영됨 |
| `scripts/mobile.test.mts` | `OVERRIDDEN`에 넣지 않음(그냥 `call`로 넘김) — 지금 테스트가 그대로 확인 |
| 422 `blocked`의 `reason` | 반영됨 — 셸 `BridgeOut.fail`이 `reason`을 넘김(예전 셸은 버렸음). 화면은 `reason`이 없으면 `message` |
| `docs/specs/android-bridge.md` 실패 모양 | 반영됨 — `error.reason?`, `ready` features `iso-office` |
| 인자 | `rot`은 0~3 정수, `floor`는 1부터 — `'n'` 검사는 숫자만 보므로 메인이 다시 검사(2-3절) |

- 새 웹 번들은 늘 같은 APK의 새 셸과 함께 나가므로(번들이 `assets/web`에 들어감) 셸 수정과 번들 수정은 같은 설치 파일로 맞춰짐. 셸 버전은 PC 번호를 따름(`android/README.md`).

---

## 5. 레벨 20

### 5-1. 한 곳으로 모으기 (`shared/officeLevel.ts`)
```ts
export interface LevelRow {
  xp: number; title: string; unlock: string       // 지금 COMPANY_LEVELS
  floors: number; exterior: ExteriorStage         // 지금 OFFICE_LEVELS (E1~E7)
  grid: [number, number]                          // 칸 크기 (김기획 표)
  material: 1 | 2 | 3 | 4 | 5                     // 바닥·벽 단계 M1~M5 (이디자 표)
  meetingRoom: number                             // MEETING_ROOMS 순번 (16~20은 강당 단계 추가)
  features: { sign?: boolean; whiteboard?: boolean; extraPlants?: boolean; ... }
}
export const LEVEL_TABLE: readonly LevelRow[]     // 20행
export const MAX_LEVEL = LEVEL_TABLE.length
export const MAX_FLOORS = Math.max(...LEVEL_TABLE.map(r => r.floors))
```
`COMPANY_LEVELS`, `OFFICE_LEVELS`, `MEETING_ROOM_OF_LEVEL`은 이 표에서 계산해 같은 이름으로 내보냄.

### 5-2. 10단계가 박혀 있는 곳
| 위치 | 지금 | 처리 |
|---|---|---|
| `shared/types.ts:216` `COMPANY_LEVELS` | 10행 | `LEVEL_TABLE`에서 계산 |
| `shared/officeLevel.ts:20` `OFFICE_LEVELS` | 10행 | 계산. 층은 Lv.6·10·14·18에서 늘어남 |
| `shared/officeLevel.ts:51–58` `MEETING_ROOMS`·`MEETING_ROOM_OF_LEVEL` | 5단계, 10칸 | 강당(20명) 단계 추가, 행마다 `meetingRoom`. 정원은 줄지 않게 |
| `renderer/map/OfficeScene.ts:113` `LEVEL_SPECS` | 10행 | **없앰.** 배치는 칸 크기·고정 칸, 겉모습은 `material`·`features` |
| `OfficeScene.ts:734·802·1007` `L >= 8`, `L >= 3` | 숫자 직접 비교 | `features.*`로 |
| `renderer/map/exteriorSprites.ts:445–541` `level >= 3…9` | 숫자 직접 비교 | `exterior` 단계(E1~E7)와 `features`. E7 캠퍼스는 다음 단계 |
| `shared/economy.ts:327–329` 업적 `level5/8/10` | 목표 5·8·10 | id·목표 그대로(받은 기록 유지). `level15`·`level20` 추가, 보상은 김기획 |
| `shared/economy.ts` 품목 `minLevel` | 1~10 | 김기획 문서 6번대로 같은 경험치 기준(5→4 … 10→8) |
| `main/office.ts:382–394` 레벨업 보상 | `2..level` | 그대로. `levelup:{n}` 키 + `INSERT OR IGNORE`로 중복 지급 없음 |
| `main/office.ts:859` `clampFloor(floor, OFFICE_LEVELS.length)` | **버그**: 레벨 수를 층 수 한도로 씀 | `officeOf(level).floors` |
| `renderer/map/OfficeMap.tsx:47·138·155` | `COMPANY_LEVELS.length` | `MAX_LEVEL` |
| `renderer/features/SettingsPage.tsx:38` 개발용 레벨 미리보기 | 10개 버튼 | 20개(선택 상자) |
| `renderer/features/LevelUp.tsx:47·57` | 0.4.0 개편 안내 | 이번 개편 안내 추가("레벨 숫자가 낮아 보여도 산 물건·자금은 그대로") |
| `renderer/features/CoachTour.tsx:16` | "10단계까지" | "20단계까지" |
| `scripts/officeLevel.test.mts` | 10단계 값 | 새 표 기준(층 수열, 정원 감소 없음, `officeOf(99) == officeOf(20)`) |

### 5-3. 레벨이 내려가지 않게 (Q7 권장안 채택 시)
설정에 `companyLevelMax` 저장, 보이는 레벨 = `max(경험치 계산값, companyLevelMax)`. 옮기는 날은 새 기준 계산값을 그대로 써서, 개편으로 한 번 낮아지는 것은 허용.

---

## 6. 직원

### 6-1. 길찾기 (`shared/iso/path.ts`)
- 칸 격자 **4방향 A***(그림이 4방향, 칸을 따라 걷는 모습).
- 걸을 수 있는 칸: 바닥 안이고 object 가구가 없는 칸, 고정 칸 중 회의실 안쪽·문·계단, flat 가구 위.
- 길 지도는 층마다 배치가 바뀔 때만 다시 만듦(A* 1회 0.1ms 수준).
- `walkTo()` 트윈을 칸 단위로(초당 약 3.5칸 ≈ 지금 120px/s), 가는 방향으로 r0~r3 선택. `route()` 경유점·`whereIs()`·lane·corridor 제거.
- 못 갈 때: 가장 가까운 닿는 칸까지 걷고 행동 취소(순간이동 없음).

### 6-2. 자리 배정 (`shared/iso/seats.ts`)
- **자리 = 의자**(`kind: 'chair'`, `use: 'sit'`). 의자가 바라보는 칸에 책상이 붙어 있으면 책상 자리(모니터 그림), 아니면 그냥 앉음.
- **섬:** 맨해튼 거리 2 이내 의자 묶음(BFS).
- **배정 순서:** 팀 순서는 지금 `layoutDesks`(`OfficeScene.ts:538`)와 같음(고용 팀 → 팀 없음 → 프로젝트 팀, 팀 안에서는 리드 먼저·고용 순). 인원 많은 팀부터 들어가는 가장 작은 섬에, 없으면 가장 큰 섬부터 나눠 앉힘.
- **안정성:** 의자를 `(gy, gx, uid)` 순으로 정렬, 결과는 저장하지 않고 매번 계산. 가구 하나를 옮기면 거기 앉은 직원만 바뀌는지 테스트.
- **층:** 직원 층은 지금처럼 `staffFloor`(팀 기준), 배정은 층마다.
- **모자랄 때:** `autoSeats(floorState, need)`가 책상 2×1 + 의자 1×1 묶음을 뒤쪽 줄부터 놓을 빈 칸을 찾음. 기본 자리는 **저장하지 않는 가상 가구**(기본 모양, 꾸미기 중 이동 불가, 사용자가 의자를 놓으면 그만큼 사라짐). 빈 칸도 없으면 출입구 근처 "대기" 칸에 서 있고 안내 문구.

### 6-3. 쉬는 직원이 찾아가는 자리
층마다 놓인 가구의 `spots`(돌리기 반영)에서 자리를 만듦. `use: 'use'`이거나 `kind: 'seat'`인 자리를 모으고, `action`이 있으면 `'fun'`, 없으면 품목 분류로 `rest`·`cafe`·`pantry`·`office`. `plan()`, `arriveAt()`, `PLAN_WEIGHTS`, `Spot`은 유지하되 `x, y`는 칸 중심 세계 좌표, `area`·`lane` 제거, `face`는 rot.

---

## 7. 작업 나누기

### 7-1. 작업 목록
| # | 작업 | 담당 추천 | 먼저 끝나야 하는 것 |
|---|---|---|---|
| A1 | 레벨표 한 곳으로: `LEVEL_TABLE` 20행, 계산 상수, 5-2절 숫자 비교 정리, `clampFloor` 버그, `officeLevel.test.mts` | 최가독 (값은 김기획) | 대표님 레벨표 확정 |
| A2 | 순수 계산 모듈 `shared/iso/` (grid, furniture·rotate, place, path, seats) + 테스트 | 박패턴 설계·리뷰, 정리드 구현(시제품에서 올림) | 없음 |
| A3 | 그림: 바닥·벽 M1~M5, 가구 상자 그리기와 rot, 직원 앞·뒤, `prop-*` 그림 | 이디자 | 대표님 그림체 확정 |
| A4 | 예전 폰 번들 점검(4-3절)과 `capabilities` 필요 여부 | 임안드 | 없음 |
| A5 | 대시보드 카드 미니 뷰 수정 적용 | 최가독 | 없음 |
| B1 | 데이터·메인: `ShopState.grid/schema`, 옮기기(3절), `placeGridItem`·`moveGridItem`, 메인 검사, 예전 메서드 호환, v2 메서드 표·`capabilities` | 강백엔 | A2(`canPlace`) |
| B2 | `IsoOfficeScene.ts`: 바닥 굽기, 깊이 정렬, 카메라, 놓인 가구, 직원 길찾기·자리·쉬는 자리, 미니 뷰 API 7종, 개발 스위치 | 정리드 | A2, A3(임시 그림 가능) |
| C1 | 꾸미기 서랍 화면(PC·폰), 꾸미기 컨트롤러, 빨강 안내 문구 | 최가독 | B1, B2 |
| C2 | 미니 뷰 값 다시 맞추기, 층 장면 비용 측정 | 박패턴 | B2 |
| C3 | 외관 E1~E6 연결, 레벨업 연출, 업적 15·20, 안내 문구(코치 투어, 업데이트 소식) | 이디자·최가독 | A1, A3 |
| D1 | 시험: 옮기기 왕복, 예전 폰 앱으로 접속, 폰 폭 꾸미기, 5층 성능 | 임안드(폰), 오큐에이 | 전부 |
| D2 | 예전 장면(`OfficeScene.ts`)과 `LEVEL_SPECS`·`route()`·`settings.layout` 읽는 코드 지우기 | 정리드 | D1 통과 |

### 7-2. 순서
```
1주차  A1 ─┐  A2 ─┐  A3 ─┐  A4  A5        (모두 동시에 가능)
2주차      │  B1 ←┘     │                  B2 ←(A2, A3 임시 그림)
3주차      C3 ←─────────┘   C1 ←(B1, B2)   C2 ←B2
4주차  D1 → D2
```
- 시제품 코드를 버리지 않고 A2·B2로 그대로 올리는 게 목표.
- B1과 B2는 동시 진행 가능. 둘 사이 약속은 `GridItem` 형태와 `canPlace`뿐.

### 7-3. 큰 위험
| 위험 | 영향 | 줄이는 법 |
|---|---|---|
| 장면을 한 번에 갈아엎음(2,300줄) | 회귀가 넓고 리뷰가 어려움 | 새 파일 + 스위치 교체, 미니 뷰 API 7종 고정, 다 되면 예전 것 삭제(D2) |
| 여러 칸 가구의 깊이 오류 | 직원이 가구를 뚫고 보임 | 위상 정렬 + 직원 개별 계산, "4×2 가구 둘레를 도는 직원" 캡처 |
| 예전 폰 번들이 Lv.11 이상에서 깨짐 | 폰 화면 오류 | A4에서 먼저 확인, 필요하면 `capabilities`로 10으로 줄여 보냄 |
| 옮기기 중 데이터 손실 | 산 가구·위치 잃음 | 트랜잭션, 백업 키, 반복 실행 테스트 |
| 24×24에 5층, 폰 성능 | 발열·끊김 | 바닥 굽기, 미니 뷰 갱신 빈도 유지, 실제 기기 FPS 측정 |
| 자리 배정이 흔들림 | 가구 하나에 모두 이사 | 결정적 정렬 + "옮긴 것만 바뀐다" 테스트 |
| 품목 칸 크기·그림 미정 | B2·C1 막힘 | 기본값 1×1과 임시 상자 그림으로 먼저 진행 |

---

## 8. 테스트 목록 (`app/scripts/`)
- `isoGrid.test.mts`: `toGrid(toWorld(g)) == g`(칸 중심), 칸 경계
- `isoFurniture.test.mts`: 1×2를 r1로 돌리면 2×1, 자리·방향도 함께, r0→r4 제자리
- `isoPlace.test.mts`: 바닥 밖, 겹침(flat 위 object 허용), 고정 칸, 길 막힘(통로를 막는 1×2 거부), `ignoreUid`
- `isoPath.test.mts`: 가구를 돌아가는 최단 경로, 못 가면 null
- `isoSeats.test.mts`: 팀이 같은 섬, 리드 먼저, 결정성, 의자 하나 옮기면 그 자리 직원만 바뀜, 모자라면 기본 자리
- `isoMigrate.test.mts`: 3절
- `officeLevel.test.mts`: 다시 씀
- 기존 `remote-v2`, `secretary`, `mobile` 테스트: 새 메서드 2개가 표에 있는지

## 9. 결정이 필요한 것
| # | 내용 | 권고 | 누가 |
|---|---|---|---|
| D1 | 칸 배치를 새 메서드로 추가(v2 유지) vs `moveItem` 인자 변경(v3) | 새 메서드, v2 유지 | 강백엔·임안드 확인 |
| D2 | 예전 `placeItem`: 1층 첫 빈칸 자동 배치 vs 거부 | 자동 배치 | 강백엔 |
| D3 | 고정 소품도 서랍에 넣어 첫 화면을 비움 vs 소품만 기본 위치에 다시 놓기 | 소품은 기본 위치에 (기획서 "모두 서랍"과 다르므로 대표님 확인) | 대표님 |
| D4 | 상점 책상·의자 품목: 개인 꾸밈(gear) 유지 vs 칸 가구로 | 이번에는 gear 유지(배정된 자리에 입힘) | 대표님·김기획 |
| D5 | 길찾기 4방향 vs 8방향 | 4방향 | 이디자 |
| D6 | 벽에 거는 품목(그림·시계) | 이번 범위 제외 | 김기획 |
| D7 | E7 캠퍼스(건물 여러 채) | 다음 단계로 | 대표님 |

## 10. 대표님 확정 (2026-10-24)
- 그림체 **A 파스텔**. 직원 크기는 지금 폭(칸의 절반), 바닥·벽은 층 기준 5단계(M1~M5) — 이디자 권장안.
- 레벨 속도 **약 3개월**(김기획 Q1), 칸 크기 **매 레벨 1칸**(Q2, Lv.1 8×8 → Lv.20 24×24), 층 Lv.6·10·14·18 최대 5층(Q3).
- 개편 첫 화면: **기본 소품은 제자리에**(D3) — 산 가구만 서랍으로, `prop-*` 소품과 기본 자리는 기본 위치에 놓음.
- 나머지는 권장안: Q4 같은 경험치 기준 minLevel, Q5 보상 공식 유지, Q6 폰 서랍은 아래에서 올라오는 판, Q7 레벨은 내려가지 않음, Q8 되돌리기 없음, D1 새 메서드·v2 유지, D2 예전 placeItem 자동 배치, D4 gear 유지, D5 4방향, D6 벽걸이 제외, D7 캠퍼스는 다음 단계.
