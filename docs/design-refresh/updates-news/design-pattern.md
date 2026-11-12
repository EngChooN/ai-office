# 업데이트 소식 개선 — 기술 설계안 B (박패턴: 유지보수성·변경 영향 최소화·검증 가능성)

작성: 박패턴 / 대상: 정리드 / 2026-11-12 / 코드·CHANGELOG는 건드리지 않았고, 최가독 안은 받지 않아 비교하지 않았습니다.

## 0. 한 줄 결론
1. **(A) 요약은 `### 핵심`(en Highlights · ja ハイライト · zh 亮点) 섹션 하나를 CHANGELOG에 더하는 것으로 합니다.** 파서는 섹션 종류 `summary` 하나만 늘리고, 요약이 없는 옛 버전은 지금 모양 그대로 그려서 호환합니다.
2. **(B) 다음 버전 소식은 `releases/latest` 확인을 그대로 두고, 따로 `releases?per_page=10`을 한 번 더 읽어 만듭니다.** 새 버전이 나타났을 때만, 성공하면 한 번만 읽습니다. 업데이트 확인 자체가 이 일에 영향을 받지 않습니다.
3. **원격 글은 main이 구조로 바꿔 검증·크기 제한을 한 뒤 `UpdateStatus.news`로 보내고, 화면은 링크·이미지·화면 이동을 막은 마크다운으로만 그립니다.**
4. 화면은 `UpdatesPage`·`ReleaseNotes` 한 곳을 고칩니다. `WhatsNew`가 같은 컴포넌트를 쓰므로 요약 + 접기가 거기도 자동 반영됩니다.

## 1. 요구사항 해석
- (A) 길고 쓸데없는 것까지 적힌 문제 = **형식 문제(맨 위 요약이 없음)** + **내용 문제(내부·사소한 항목)**. 파서·화면은 앞의 것만 풀 수 있습니다. 뒤의 것은 김버전이 쓰는 방식입니다(편집은 김버전 소유 → 제안만 §5).
- (B) 업데이트 전 유저가 다음 버전 이력을 보게 하는 것. 이 저장소는 하루에 여러 번 릴리스한 적이 있어(1.1.4 → 1.1.5 → 1.2.0 → 1.3.0이 11/9~11/12), **건너뛴 중간 버전은 예외가 아니라 보통 상황**입니다. `releases/latest`만으로는 최신 한 개만 얻으므로 이 설계의 핵심 쟁점입니다.
- 확인하지 못한 것: 대표가 (B)를 모바일에서도 원하는지(브리프엔 "모바일은 status가 늘 없음"만 있음), 앱을 못 켠 채 업데이트 전 소식을 보는 상황(앱 밖)은 범위 밖으로 봤습니다.

## 2. (B) 업데이트 전 다음 버전 소식

### 2-1. 데이터 출처 — 비교와 추천
| 안 | 요청 수·호스트 | 건너뛴 버전 | 파서·시험 재활용 | 위험 |
|---|---|---|---|---|
| ① `releases/latest` body 재활용 | 이미 하는 요청, 추가 0 | **최신 1개만** | `pickLanguageSection`+섹션 파서 | 가장 작음. 하지만 1.1.5 → 1.3.0 유저는 1.2.0을 못 봄 |
| **② `releases?per_page=10` 별도 조회 (추천)** | api.github.com 1회 추가(새 버전 발견 때만, 성공하면 끝) | 최근 10개 안 전부 | ①과 동일. body 형식이 CHANGELOG와 같은 `###` 구조 | 새 호스트·새 CSP 없음. 응답 검증 코드가 늘어남 |
| ③ 태그 고정 raw CHANGELOG (`raw.githubusercontent.com/…/vX.Y.Z/CHANGELOG*.md`) | 새 호스트, 언어별 파일 | 전부 | `parseChangelog` 그대로, 4개 언어 시험이 형식을 지켜 줌 | 새 호스트·404 처리·태그 이름 규칙에 의존. 인증 없는 호출 한도와 별개라는 장점은 있음 |
| ④ `latest`를 `list`로 교체 | 0 추가 | 전부 | — | **업데이트 확인·자체 설치 경로를 건드림.** 이 앱이 스스로 업데이트하는 길이라 소식 때문에 깨지면 피해가 가장 큼 |

**추천 ②를 "별도 모듈"로.** `latest` 확인(`UpdateChecker.run`)은 한 줄도 바꾸지 않고, 확인이 `available`이 된 뒤 `void this.loadNews(version)`만 덧붙입니다.
- 이득: 소식 조회가 실패하거나 느려도 업데이트 안내·설치는 그대로 동작합니다. 시험도 새 순수 함수에만 걸면 됩니다.
- 추가 복잡도: 요청 경로 둘(latest, list), 캐시 상태 하나(`newsFor: version`). 한도는 시간당 60회 중 새 버전이 나올 때만 +1이라 무시할 수 있습니다.
- ③을 안 고른 이유: 문서(`docs/versioning.md`)가 "Release 설명을 그대로 notes로 쓴다"는 단일 경로를 이미 정해 두었고, 새 호스트는 이번 작업에서 얻는 것보다 위험이 큽니다. 다만 Release 본문(손으로 복사)과 CHANGELOG가 어긋날 수 있는 단점은 ②에도 있어, §4의 어긋남 감시 시험으로 보완합니다.

### 2-2. main → renderer 모양 (UpdateStatus 확장)
```ts
// shared/updateNews.ts (순수 함수, main·시험 공용)
export function parseNewsList(json: unknown, current: string, latest: string, lang: Lang): Release[]
```
- `UpdateStatus`에 **선택 필드 `news: Release[]`** (이미 있는 `Release` 타입 재사용: version·date·note·sections). 새 IPC 채널을 만들지 않습니다.
  - 이유: ① `useUpdateStore`가 이미 `status`를 받고 있고, ② 언어를 바꾸면 `UpdateChecker`가 이미 `emit()`을 다시 하므로(notes와 같은 이유) 언어별 재전송을 공짜로 얻고, ③ preload·타입·스토어를 더 늘리지 않아도 됩니다.
  - 비용: 상태 푸시마다 news(최대 ~30KB)가 함께 갑니다. 상태 변화가 드물어(시간당·진행률 정도) 문제가 안 됩니다. **설치 진행률(`install.progress`)이 emit을 자주 일으키는지는 구현 때 확인하고, 잦으면 news를 별도 채널로 뺍니다.**
- 원문 body는 main에만 두고 `status()` 안에서 lang별로 파싱(캐시 1칸). renderer는 마크다운 문자열 정리·언어 선택을 하지 않습니다.
- `parseNewsList`가 맡는 일(전부 순수·시험 대상): draft·prerelease 제외 → 버전 형식 검사 → **`current` 초과 ~ `latest` 이하만** → `compareVersions` 내림차순(목록 순서를 믿지 않음) → 언어 섹션 선택(`pickLanguageSection` 재사용) → `###` 섹션 파서 → 크기 제한(릴리스 10개·섹션 3~4개·본문 합계 N천 자, 넘으면 자름) → 이미지·HTML 주석 제거(`summarizeNotes`가 이미 하는 규칙 재사용).
- `Release.date`는 body 첫 줄(`# AI Office 1.3.0 (2026-11-12)`)에서 읽고, 못 읽으면 빈 값.

### 2-3. 화면에 넣는 방법
- `lib/update.ts`에 `useUpcomingReleases()` 선택자 하나(`status?.news ?? []`). 모바일은 `bridge`가 없어 `status`가 null → 빈 배열이라 **분기 코드가 필요 없습니다.**
- `UpdatesPage`: `[...upcoming, ...releasesFor(lang)]`. 위쪽 카드에 "새 버전 · 업데이트하면 쓸 수 있어요" 뱃지와, 기존 안내 창을 여는 [업데이트] 버튼(`isNoticeOpen`)만 더합니다. 번들본과 같은 `ReleaseNotes`로 그려 레이아웃이 한 벌입니다.
- 번들 CHANGELOG에 이미 같은 버전이 있으면(개발 중 로컬 빌드) 번들본을 우선하고 news 쪽을 버립니다(중복 방지 한 줄).
- 건너뛴 버전(`skippedVersion`)이어도 소식 화면엔 보입니다. 알림·배지만 막는 기존 규칙이며, 이 화면은 능동적으로 찾아본 곳이라서입니다.

### 2-4. 실패·오프라인·모바일
| 상황 | 동작 |
|---|---|
| 조회 실패·403 한도·타임아웃(15초 `AbortSignal`) | `news=[]`, 화면 변화·오류 표시 없음. 캐시를 "성공"으로 기록하지 않아 **다음 시간 확인 때 다시 시도** |
| 오프라인으로 앱 재시작 | 메모리 캐시뿐이라 news 없음 = 번들 CHANGELOG만 보이는 지금과 같음. 디스크 캐시는 만들지 않음(이득 대비 복잡) |
| 조회 중 더 새 버전이 나옴 | 결과의 `latest`가 지금 `release.version`과 다르면 버림(경합 방지) |
| 응답이 이상함(JSON 아님·필드 없음) | `parseNewsList`가 `[]` 반환, 예외 없음 |
| 모바일(안드로이드 웹뷰) | `bridge` 없음 → 빈 배열. 모바일 앱 자체의 업데이트 안내(`UpdateCheck.kt`)는 이번 범위 밖. (원하면 후속) |
| 새 버전 없음 | 조회 안 함 |

### 2-5. 원격 글을 그릴 때의 안전성
현재 `Markdown`은 원시 HTML을 켜지 않았지만(rehype-raw 없음) 세 가지가 남습니다.
1. `[x](#view=hire)` 같은 **앱 내부 화면 이동 링크**가 원격 글에서도 동작합니다.
2. **`![](https://…)` 이미지**가 그대로 로드돼 열람 사실·IP가 새어 나갑니다(렌더러 CSP는 `index.html`에서 찾지 못했음 → 구현 때 확인).
3. 임의 `https` 링크가 눌러집니다(피싱용 문구를 넣을 수 있음).

대응(작고 한 곳): `Markdown`에 **선택 prop `isUntrusted`(기본 false)**를 추가해 true면 `allowedElements={['p','ul','ol','li','strong','em','code']}` + `unwrapDisallowed`(링크·이미지·제목은 글자만 남김)를 적용합니다. 이득: 소식에 링크가 필요 없고, 안전한 쪽으로 한 번에 닫힙니다. 기존 호출부는 prop이 없어 그대로입니다. 보조로 `parseNewsList`에서도 이미지·HTML을 한 번 더 걷습니다(이중 방어, 비용 작음).
- 신뢰 경계 메모: 본문 작성자는 대표 소유 저장소의 릴리스 업로더뿐이라 위협이 낮지만, 계정·토큰이 탈취될 때를 이 안전장치가 막습니다.

## 3. (A) CHANGELOG '핵심 요약'

### 3-1. 형식
```md
## [1.3.0] - 2026-11-12
- 기기별 차이: …(그대로)

### 핵심
- **새 기능** 내 PC 여러 대를 오가며 쓸 수 있어요.
- **새 기능** 매뉴얼을 말로 설명하면 AI가 초안을 써 줘요.
- **개선** 설정 화면이 쉬운 말로 정리됐어요.
- **버그 수정** 직원이 보낸 링크가 안 열리던 문제를 고쳤어요.

### 새 기능  (…상세, 지금과 같음)
```
- 4개 언어 각각 `### 핵심 | Highlights | ハイライト | 亮点`. 3~5줄, 줄마다 사용자 가치 한 문장.
- **종류 표시는 줄 앞 굵은 말**(`**새 기능**` 등 = 기존 `KIND_BY_TITLE` 표의 말) — 별도 표기법을 만들지 않고 이미 있는 표를 씁니다. 사람이 md로 읽어도 자연스럽고, 화면은 이 말을 뽑아 색 뱃지(현재 `KIND_STYLE` 색 재사용)로 바꿉니다. 말이 없는 줄은 뱃지 없이 그립니다(깨지지 않음).
- 상세 `### 새 기능/개선/버그 수정`과 맨 위 '기기별 차이' 문단은 **접기 안**에 들어갑니다. 화면 위계: 헤더(버전·날짜) → 요약 → "자세히 보기(n)" 접기.

### 3-2. 파서(`shared/changelogParse.ts`) 변경 — 작게
- `ChangeKind`에 `'summary'`, `KIND_BY_TITLE`에 4개 제목 추가.
- `parseChangelog` 안의 `###` 분할 부분을 **`parseSections(text): ChangeSection[]`로 추출·export**. (이득: B의 Release body 파싱이 같은 함수를 씀. 추가 복잡도: 함수 하나 추출, 동작 불변.)
- 순수 도우미 `splitRelease(r): { summary: SummaryItem[] | null; details: ChangeSection[] }`와 `SummaryItem = { kind: ChangeKind|null; text: string }`. 요약이 없으면 `summary=null`.

### 3-3. 옛 형식 호환
- `summary === null`이면 **지금처럼 섹션을 펼친 모양 그대로**(접지 않음). 옛 버전 코드·시험이 바뀌지 않습니다.
- 자동 요약(상세 첫 문장 뽑기)은 **하지 않습니다.** 문장 경계가 한·중·일에서 깨지기 쉽고, 틀린 요약이 사용자 앞에 나가는 비용이 큽니다. 필요하면 김버전이 최근 2~3개 버전만 손으로 채우면 됩니다.
- 요약 필수 기준은 시험 상수 `SUMMARY_REQUIRED_FROM`(처음 요약이 들어가는 버전, 예: 다음 릴리스)으로 둡니다. 그 이전은 없어도 통과.

### 3-4. 시험(`scripts/changelog.test.mts`) 변경 — 기존 시험 유지
- **기존 3종(버전·날짜·섹션 종류·항목 수 4개 언어 일치)은 그대로 통과합니다.** `summary`가 섹션 종류 배열에 들어가므로 "요약 유무·위치가 4개 언어에서 같음"이 공짜로 검증됩니다.
- 추가: ① `SUMMARY_REQUIRED_FROM` 이상은 `summary` 섹션이 정확히 1개, ② 줄 수 3~5, ③ 각 줄 길이 ≤ 120자(언어 공통 느슨한 상한), ④ 요약 줄의 굵은 말은 `KIND_BY_TITLE`의 해당 언어 제목이고 **4개 언어에서 종류 순서가 같음**, ⑤ 요약에 코드 서식(`` ` ``)·경로 같은 기술어가 없음(CHANGELOG 규칙 재확인용 가벼운 검사).
- 이유: 요약은 사람이 쓰는 곳이라 "길이·개수·언어 간 일치"만 기계가 지키고, 문장의 좋고 나쁨은 사람이 봅니다.

## 4. 화면 구조(역할 분리)
| 역할 | 위치 | 비고 |
|---|---|---|
| 데이터·검증 | `shared/changelogParse.ts`, `shared/updateNews.ts` | 순수 함수. 화면·네트워크 모름 |
| 외부 통신·캐시 | `main/updateNews.ts`(fetch+캐시) → `UpdateChecker`가 호출 | 실패는 삼킴 |
| 상태 | `UpdateStatus.news` → `useUpdateStore` | 새 스토어 없음 |
| 표시 | `UpdatesPage`: `ReleaseCard`(헤더) · `ReleaseNotes`(요약+접기) | `WhatsNew`는 `ReleaseNotes`만 씀 |

- 분리 이유: `ReleaseNotes`가 이미 두 화면에서 재사용 중이라 요약+접기를 여기 한 곳에 넣으면 두 화면이 같이 좋아집니다. 접기는 **네이티브 `<details>`**로 합니다(포커스·키보드 기본 제공, 의존성 0). `WhatsNew` 창은 현재 버전 한 개만 보여 주므로 접기를 기본 닫힘으로 두면 창이 짧아집니다.
- 공통화하지 않는 것: `AppUpdate`의 평문 `ReleaseSummary`는 그대로 둡니다(마크다운 렌더 없이 평문이라 구조가 다름). 선택 개선: `summarizeNotes`가 `### 핵심`이 있으면 그것만 안내 창에 쓰게 하면 안내 창도 짧아지지만, `summarizeNotes`/Kotlin `summarizeNotes`와 규칙을 맞춰야 해서(휴대폰 `UpdateCheck.kt`가 "같은 규칙") **이번엔 제외, 후속**을 추천합니다.

## 5. 김버전에게 넘길 제안(편집은 정리드가 조율)
- `### 핵심` 4개 언어 추가 시점: 다음 릴리스부터. 1.3.0·1.2.0은 선택 backfill.
- 쓰는 규칙(CHANGELOG 머리말에 한 줄 추가 필요): 핵심은 "사용자가 할 수 있게 된 일" 한 문장, 내부·개발 사정·기기별 사소한 차이·같은 날 재수정은 **상세에서도** 뺀다. `docs/versioning.md`의 Release 본문 규칙에도 "CHANGELOG 항목 그대로(핵심 포함)"를 확인.
- 1.3.0 같은 항목(줄마다 3~8문장)은 상세에 두고 요약만 새로 쓰면 됩니다. 상세 자체를 줄이는 것은 내용 결정이라 파서로 풀 수 없습니다.

## 6. 바뀌는 파일
| 파일 | 변경 | 위험 |
|---|---|---|
| `app/src/shared/changelogParse.ts` | `summary` 종류, `parseSections` 추출, `splitRelease` | 낮음(동작 불변 추출 + 추가) |
| `app/src/shared/updateNews.ts` | **신규** `parseNewsList` | 낮음(순수) |
| `app/src/main/updateNews.ts` | **신규** fetch·캐시 | 중간(네트워크·경합) |
| `app/src/main/updates.ts` | `run()` 끝에 `loadNews` 호출 1줄, `status()`에 `news` | 중간 — 업데이트 핵심 파일이라 변경을 최소화 |
| `app/src/shared/updateCheck.ts` | `UpdateStatus.news?` 타입 | 낮음 |
| `app/src/renderer/lib/update.ts` | `useUpcomingReleases` | 낮음 |
| `app/src/renderer/features/UpdatesPage.tsx` | 카드·요약·접기·새 버전 뱃지 | 중간(`WhatsNew`와 공유) |
| `app/src/renderer/components/markdown.tsx` | 선택 prop `isUntrusted` | 낮음(기본값 동작 불변) |
| `app/src/shared/i18n/*` | 문구(새 버전 뱃지·자세히 보기·종류 뱃지)4개 언어 | 낮음. 4개 언어 키 일치 시험이 이미 지켜 줌 |
| `app/scripts/changelog.test.mts` | §3-4 추가 | 낮음 |
| `app/scripts/updateNews.test.mts` | **신규** | — |
| (김버전) `CHANGELOG*.md`·`docs/release-notes/*.md`·`docs/versioning.md` | `### 핵심` 추가·규칙 문구 | 내용 소유자 조율 |

**건드리지 않는 것**: `ChatPage`·`StaffPanel`·`SecretaryChat`(미커밋), `AppUpdate.tsx`, preload, 모바일 코드. 코드 착수 전 `updates.ts`·`UpdatesPage.tsx`가 다른 진행 중 변경과 겹치지 않는지 `git status`로 확인합니다(지금은 위 세 파일만 수정 중이라 겹치지 않음).

## 7. 검증 방법
1. `npm test`(= `node --test scripts/*.test.mts`): ① 기존 `changelog.test` 통과 → ② 요약 규칙 신설분 → ③ `updateNews.test`: 
   - 정상 목록(1.1.5 → 1.3.0이면 1.2.0·1.3.0 두 개, 내림차순), 목록 순서가 뒤섞여도 정렬, draft·prerelease 제외, `current` 이하·`latest` 초과 제외, 버전 형식 불량 제외, body 없음·언어 섹션 없음(English→한국어 폴백), 이미지·HTML 걷힘, 크기 초과 절단, JSON이 배열이 아님 → `[]`, 언어 바꿔 재호출 시 해당 언어.
   - 어긋남 감시: 각 `docs/release-notes/X.Y.Z.md`의 언어별 섹션이 같은 버전 `CHANGELOG*.md` 항목과 **섹션 종류·항목 수가 같은지**(`updateCheck.test.mts`는 형식만 봄). **현재 이미 어긋난 파일이 있는지 먼저 돌려 보고** 범위(최근 N개 vs 전부)를 정합니다.
2. `UpdateChecker` 경계: `fetch`를 주입 가능하게 만들어(현재 전역 fetch 직접 사용) 성공·실패·경합(버전 바뀜) 시나리오를 단위 시험 — 주입이 부담이면 `loadNews`만 순수에 가깝게 떼어 시험.
3. 수동·화면: `releases?per_page=10` 응답을 로컬 목 서버/고정 JSON으로 바꿔 ① 새 버전 2개 건너뜀 ② 오프라인 ③ `![](http://…)`·`[x](#view=hire)`가 든 악의 본문 ④ 요약 없는 옛 버전 ⑤ 4개 언어 전환 ⑥ 모바일 빌드(빈 news)를 확인. 화면 캡처는 PC 한 장(요약+접기+새 버전 카드).
4. `npm run typecheck`, `lint`.

## 8. 정리드가 고를 쟁점과 추천
| # | 쟁점 | 추천 | 이유·대가 |
|---|---|---|---|
| 1 | 출처 ①/②/③ | **② 별도 list 조회** | 중간 버전 문제를 풀고 업데이트 경로를 안 건드림. 대가: 요청 경로 +1 |
| 2 | 건너뛴 버전 상한 | 10개 | 한도 내 1회. 초과분은 "이전 소식은 업데이트 후"로 생략(조용히 안 자르고 한 줄 표시) |
| 3 | news를 `UpdateStatus`에 넣기 vs 새 채널 | 넣기(진행률 emit 빈도 확인 후) | 경로 추가 없음. 잦으면 분리 |
| 4 | 종류 표시 방식 | 굵은 말(`**새 기능**`) | 기존 표 재사용. 대가: 작성 시 한 단어 더. 대안: 개수 뱃지 칩(작성 부담 0, 정보 적음) |
| 5 | 옛 버전 | 지금 모양 유지, 자동 요약 안 함 | 틀린 요약의 비용 > 이득 |
| 6 | `Markdown.isUntrusted` | 도입 | 링크·이미지·화면 이동 차단. 대가: prop 1개 |
| 7 | 안내 창(`AppUpdate`)도 요약만 | 후속 | Kotlin과 규칙 동기화 필요 |
| 8 | `SUMMARY_REQUIRED_FROM` | 다음 릴리스 버전 | 김버전 backfill 부담 없이 시작 |
| 9 | 모바일에서도 다음 버전 소식 | 이번 제외 | 전달 통로가 없어 별도 작업(Kotlin `UpdateCheck`) |

대표 결정이 필요한 사항은 없습니다(사용자에게 새로 나가는 정보·권한이 없고, 같은 GitHub API를 한 번 더 부르는 정도). 단 쟁점 9(모바일)와 §5(내용 규칙)는 대표 의도 확인이 있으면 좋습니다.
