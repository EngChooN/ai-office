# 업데이트 소식 개선 — 기술 설계안 (최가독: 가독성·단순함·재활용)

작성: 2026-11-12 · 코드 수정 없음 · 박패턴 안과 맞추지 않음

## 0. 한 줄 요약
- (B) **Release 본문을 재활용**한다. `releases/latest` 대신 `releases?per_page=10` 한 번으로 바꿔 "현재보다 높은 버전들"의 본문을 받고, 이미 있는 `pickLanguageSection`과 `parseChangelog`의 섹션 분해를 재사용해 업데이트 소식 화면 맨 위에 "아직 설치 안 한 새 버전" 카드로 얹는다.
- (A) CHANGELOG 각 버전에 **`### 요약`(3~5줄)** 섹션을 맨 앞에 추가한다. 파서는 종류 `summary` 하나만 늘리고, 화면은 요약만 펼쳐 보이고 나머지 섹션은 `<details>`로 접는다.
- 두 변경은 서로 독립이다. (A)만 먼저 해도, (B)만 먼저 해도 동작한다. 단 (B)의 새 버전 카드는 (A) 형식을 쓰면 더 읽기 좋다.

## 1. 확인한 현재 구조 (코드로 확인)
- `UpdateChecker.fetchLatestRelease`는 `RELEASE_API_URL`(`/releases/latest`) 한 건만 읽는다(`main/updates.ts:15`). 본문은 `ReleaseInfo.body`에 통째로 들어 있고, `status()`에서 `summarizeNotes`(언어 섹션만 고르고 마크다운 기호를 벗긴 평문)로 줄여 `latest.notes`로만 나간다.
- 즉 지금 renderer에는 **새 버전 본문이 평문으로만** 가고, `UpdatesPage`는 번들된 `CHANGELOG*.md`만 쓴다(`lib/changelog.ts`).
- `pickLanguageSection(body, lang)`은 이미 `shared/updateCheck.ts`에서 export 되어 있어 Release 본문에서 `## 한국어` 아래만 뽑아 준다. 그 안의 `###` 구조는 CHANGELOG와 같다. 그래서 `changelogParse.ts` 안쪽의 "`###` 나눠 섹션 만들기" 부분을 함수로 꺼내면 그대로 재사용된다.
- `UpdatesPage`의 `ReleaseNotes`는 `WhatsNew`도 쓴다. 여기를 바꾸면 두 화면이 같이 좋아진다.
- 접기는 `<details>`가 이미 `RunCard`·`PlanCard`·`SettingsPage`에서 쓰인다(별도 Collapsible 컴포넌트는 없음). 새 부품 불필요.
- 안드로이드는 `android/.../UpdateCheck.kt`에 **자체 검사기**가 따로 있다. 이번 범위 밖(웹뷰의 `window.officeUpdate`는 없음 → status 늘 null).

## 2. (B) 업데이트 전 다음 버전 소식

### 2-1. 데이터 출처 비교
| | Release 본문 재활용(추천) | 원격 CHANGELOG raw 조회 |
|---|---|---|
| 호출 | 지금과 같은 api.github.com, 호출 수 그대로(1회) | raw.githubusercontent.com 새 도메인, 언어별 파일 |
| 내용 신뢰 | 게시된 릴리스만 — 미공개/미빌드 항목이 안 보임 | main 브랜치 그대로 — `## [미정]` 같은 미출시 항목이 노출될 위험 |
| 코드 | 파서·언어 선택 이미 있음 | 4개 파일 중 하나 선택·파싱·캐시 새로 |
| 한계 | `/latest`는 최신 1건만 → 여러 버전 건넌 경우 부족 (아래로 해결) | 모든 버전이 한 파일에 있어 건넘 처리는 쉬움 |

추천 이유: 새 도메인·새 위험(미출시 노출) 없이 기존 호출 하나를 목록 호출로 바꾸는 것만으로 "여러 버전 건넘"까지 풀린다. 기타 방식(앱 서버·별도 JSON 게시)은 배포 절차가 새로 생겨 과하다.

### 2-2. 여러 버전을 건너뛴 경우
- `fetchLatestRelease`를 `fetchReleases`로 바꿔 `GET /repos/…/releases?per_page=10`을 부른다. 시간당 60회 제한에 같은 1회라 부담이 같다.
- `parseRelease`를 배열에 `.map`해서 초안·미리보기는 걸러낸다(이미 null 반환). 가장 높은 버전이 지금의 `release`(안내 창·설치용), "현재보다 높은 모든 버전"이 소식 목록이다. 정렬은 `parseVersion` 비교로 해서 API 순서에 기대지 않는다.
- 10개 밖(10버전 넘게 건넘)이면 보이는 것까지만 보이고, 카드 아래에 "더 이전 소식은 GitHub에서" 링크(`pageUrl`)를 둔다. 조용히 자르지 않는다.
- 응답 크기는 버전당 4개 언어 ≈ 6~8KB × 10 ≈ 80KB 정도. 파싱 후 **앱 언어 섹션만** 남기므로 IPC에는 약 20KB 이하.

### 2-3. main → renderer 모양
`UpdateStatus`에 필드 하나만 더한다. `latest`는 건드리지 않아 `AppUpdate`·배지·`notifiableVersion`이 그대로 동작한다.

```ts
export interface UpdateNews { version: string; date: string; body: string } // body = 앱 언어 섹션 마크다운(### 포함)
interface UpdateStatus { …; news: UpdateNews[] }   // 현재보다 높은 버전, 높은 순. 없거나 모르면 []
```
- `status()`에서 `state === 'available'`일 때만 채운다(`latest`와 같은 조건). 평문 가공(`summarizeNotes`) 없이 `pickLanguageSection` 결과를 그대로 준다. 날짜는 본문 첫 줄 `# AI Office 1.3.0 (2026-11-12)`에서 정규식으로 읽거나, 없으면 Release의 `published_at`을 `ReleaseInfo.date`로 더 받는다(후자가 단순, 추천).
- 언어를 바꾸면 이미 `onLangChange → emit()`이 있어서 별도 처리 없이 다시 간다. raw 4개 언어를 보내지 않는 이유도 이것(IPC 4배 방지).
- `OfficeUpdateApi` 타입은 `UpdateStatus`만 쓰므로 preload 변경 없음. 원격 휴대폰 API(v2)와도 무관(update:* 채널 설명 그대로).

### 2-4. 소식 화면에 넣는 방법
- `shared/changelogParse.ts`에서 `parseChangelog` 안쪽의 섹션 분해를 `parseSections(md: string): ChangeSection[]`로 꺼낸다(동작 변화 없음, 15줄 정도 이동). `parseChangelog`는 그걸 호출한다.
- `lib/changelog.ts`(번들) 옆이 아니라 **UpdatesPage에서** `useUpdateStore(s => s.status?.news)`를 읽어 `Release` 모양으로 바꾼다: `{ version, date, note: '', sections: parseSections(body) }`. 번들에 같은 버전이 이미 있으면 제외(`version > APP_VERSION`만 취하면 자연히 없음).
- 새 버전 카드는 기존 `<article>` 그대로 재사용하고 머리에 배지 "새 버전 · 아직 설치 전"과 `[업데이트]` 버튼(`updateActions.openNotice()` — 이미 있는 안내 창으로 연결)만 더한다. 현재 버전 카드 위에 놓고 구분선 1개.
- 즉 새 컴포넌트 없음. `UpdatesPage` +20줄, `ReleaseNotes` 재사용.

### 2-5. 실패·오프라인·모바일
- 확인 실패: 지금도 `run()`이 실패 시 `release`를 그대로 두고 상태만 되돌리므로, 한 번 받은 `news`는 유지된다. 처음부터 실패하면 `news: []` → 새 버전 카드가 그냥 안 뜬다. 화면에 에러를 내지 않는다(자동 확인 실패는 조용히 넘긴다는 기존 원칙).
- 오프라인에서 앱을 켜면: 같은 이유로 카드 없음. 번들 소식은 그대로 보인다.
- 최신 상태(`upToDate`)면 `news` 빈 배열.
- 모바일 빌드(`window.officeUpdate` 없음): `status`가 null → 카드 없음, 코드 분기 필요 없음(`status?.news ?? []`).
- 본문 이상(빈 본문·`###` 없음): `parseSections`가 `other` 하나로 만들어 그대로 보임. 완전 빈 본문이면 카드 대신 "자세한 내용은 GitHub에서" 링크만.

## 3. (A) CHANGELOG에 '핵심 요약' 담기

### 3-1. 형식 비교
| 안 | 장점 | 단점 |
|---|---|---|
| **`### 요약` 섹션 추가(추천)** | 파서 변경 최소(종류 1개), 작성 규칙이 눈에 보임, 옛 버전은 요약 없이도 그대로 동작, 시험이 자연스럽게 4개 언어 일치까지 검사 | 요약과 상세가 따로라 어긋날 수 있음(시험으로 개수·줄 수만 검증) |
| 항목마다 굵은 제목 `- **제목** 설명` | 중복 없음, 종류 구분이 요약에 남음 | 기존 항목 전부 개조, 굵은 글씨가 파서 규칙이 됨 → 쓰는 쪽 부담 큼 |
| 항목 첫 문장 자동 요약 | 김버전 작업 없음 | 첫 문장이 사용자 가치 문장이 아닐 때가 많아 대표 요구(핵심만)를 못 채움 |

### 3-2. 형식 규칙 (CHANGELOG 4개 언어 공통)
```
## [1.4.0] - 2026-xx-xx

### 요약            (en: Summary / ja: 要約 / zh: 摘要)
- 새 기능/개선/수정 구분 없이, 사용자가 얻는 것 한 문장씩 3~5줄
- …

### 새 기능
…(기존 그대로. 상세)
```
- 요약 줄은 "무엇을 할 수 있게 됐는지" 한 문장, 가능하면 한국어 기준 60자 안팎. 한눈에 구분은 줄 맨 앞에 이모지 대신 **새/개선/수정을 말로** 붙이는 선택지가 있으나 규칙 부담이라 추천하지 않는다. 대신 상세 접기 제목에 `✨ 새 기능 · 5` 같이 개수를 붙여 구분을 보여 준다(화면 쪽 처리, 작성 규칙 없음).
- 빼기 규칙(내부·개발 사정·기기별 사소한 차이·재수정류)은 **쓰는 쪽(김버전) 규칙**이다. 파서로는 못 거른다. `CHANGELOG.md` 머리 "쓰는 규칙"에 한 줄로 추가를 제안한다. 요약에는 아예 안 넣고 상세에서도 줄인다.
- '기기별 차이' 문단(`other` 종류, 제목 없음)은 요약 밖. 화면에서 상세 접기 안 맨 아래로 간다.
- 소급 적용: 옛 버전은 요약이 없어도 된다(화면이 요약 없으면 지금처럼 전부 펼침으로 대체). 대표가 원하면 최근 2~3개(1.3.0 등)만 정리드가 김버전과 소급.

### 3-3. 파서 변경 (`shared/changelogParse.ts`)
- `ChangeKind`에 `'summary'` 추가, `KIND_BY_TITLE`에 `요약`·`Summary`·`要約`·`摘要` 4개 추가. 그 외 파서 로직 변경 없음.
- 2-4의 `parseSections` 분리만 더한다.
- `Release`에는 필드를 더하지 않는다. 화면이 `sections.find(s => s.kind === 'summary')`로 찾는다(파생값을 저장하면 어긋날 일만 늘어남).

### 3-4. 화면 변경 (`ReleaseNotes`)
- 요약 있음: 요약 섹션을 제목 없이 본문(글머리 목록)으로 먼저 보이고, 나머지 섹션(새 기능/개선/수정/기타)은 하나의 `<details>`("자세히 보기")에 넣는다. 기본 닫힘.
- 요약 없음(옛 버전): 지금과 같이 전부 보임.
- `WhatsNew` 창도 같은 `ReleaseNotes`라 자동 적용. 창이 짧아져 읽기 쉬워지는 효과.
- 새 문자열 키 2개(`updates.kind.summary` 불필요, `updates.more`="자세히 보기", `updates.newBadge`="새 버전 · 설치 전")를 `dict/featuresB.ts`에 4개 언어로. 새 버전 카드 `[업데이트]` 버튼은 기존 `update.download` 류 키 재활용 후보.

### 3-5. 안내 창(AppUpdate)과의 관계
- `summarizeNotes`는 요약 섹션이 있으면 그것만 쓰게 하는 2~3줄 선택이 가능하나, 안내 창은 이미 스크롤되고 별도 요구가 없으므로 **이번엔 건드리지 않는다**(범위 확대 방지). 후속으로 남긴다.
- `docs/release-notes/X.Y.Z.md`는 CHANGELOG의 해당 버전을 복사하므로 요약 섹션도 같이 들어가 (B)의 카드가 바로 이득을 본다. 별도 변환 없음.

### 3-6. 시험 (`scripts/changelog.test.mts`)
- 4개 언어 일치 시험은 **그대로 통과**한다: 섹션 종류 배열에 `summary`가 같은 자리에 들어가고, 항목 수 비교(`bullets`)가 요약 줄 수 일치까지 검사한다. 수정 불필요.
- 추가(각 5줄 안팎):
  1. 요약이 있으면 **첫 섹션**이고 항목이 3~5개(ko 기준, 기준 버전 이후만 — `SUMMARY_FROM = '1.4.0'`처럼 상수로 옛 버전 면제).
  2. 요약 항목 길이 상한(예: 120자) — 지나치게 긴 줄 방지.
  3. (파서 단위) `### 요약`·`### Summary`·`### 要約`·`### 摘要`가 모두 `summary`로 읽힘, `parseSections`가 `parseChangelog`와 같은 결과.
- `scripts/updateCheck.test.mts`에: 릴리스 목록 응답에서 현재보다 높은 버전만 골라 내림차순으로 `news`가 나오는지(초안·미리보기 제외, 10개 상한, 이상한 항목은 건너뜀) 순수 함수로 검사. 이를 위해 목록 정리 로직을 `shared/updateCheck.ts`의 순수 함수 `pickNews(list, current, lang)` 하나로 두는 걸 추천(main에는 fetch만 남김 → 시험 가능, main 가독성 유지).

## 4. 바뀌는 파일 목록
| 파일 | 변경 | 크기 |
|---|---|---|
| `shared/changelogParse.ts` | `summary` 종류·4개 제목, `parseSections` 분리 | 작음 |
| `shared/updateCheck.ts` | `UpdateNews`·`UpdateStatus.news`, `ReleaseInfo.date`, `pickNews`, `RELEASES_API_URL`(목록) | 중간 |
| `main/updates.ts` | `fetchLatestRelease` → 목록 호출, `news` 보관·`status()`에 포함 | 중간 |
| `renderer/features/UpdatesPage.tsx` | 새 버전 카드, `ReleaseNotes` 요약+접기 | 중간 |
| `shared/i18n/dict/featuresB.ts` | 문구 2~3개 × 4개 언어 | 작음 |
| `scripts/changelog.test.mts`, `scripts/updateCheck.test.mts` | 시험 추가 | 작음 |
| `CHANGELOG*.md` 4개, `docs/release-notes/*.md` | `### 요약` 추가·쓰는 규칙 한 줄 — **김버전 소유, 정리드 조율 후 한 번에** | — |
변경 없음: `lib/update.ts`(스토어 그대로), `AppUpdate.tsx`, `preload.ts`, `WhatsNew.tsx`(자동 적용), 안드로이드, `ChatPage`·`StaffPanel`·`SecretaryChat`(미커밋분 건드리지 않음).

## 5. 위험과 대응
| 위험 | 대응 |
|---|---|
| 목록 호출 응답이 `latest`와 달라 새 버전을 잘못 고름(예: 수동 등록 순서) | 정렬을 `parseVersion` 비교로 하고, 초안·미리보기 제외. 시험으로 고정 |
| 요약이 상세와 어긋남(사람 작성) | 시험은 개수·위치·길이만 보장. 내용 일치는 김버전 작성 규칙 + 리뷰 |
| 새 버전 본문 형식이 달라 화면이 깨짐(예전 형식 Release) | `parseSections`가 `other`로 폴백. 본문 비면 링크만 |
| 요약 없는 버전과 있는 버전이 섞여 화면 높이가 들쭉날쭉 | 의도된 폴백. 최근 2~3개 소급 권장 |
| IPC에 큰 본문이 반복 전송(상태가 자주 emit) | 앱 언어 섹션만, 10개 상한. 그래도 크면 `news`를 `available`일 때만 담는 현재 설계로 충분 |
| GitHub 조회 제한(60/시간) | 호출 수 그대로(1회/확인). 변경 없음 |
| 번역 시험이 새 형식 때문에 갑자기 실패 | 요약을 한 언어에만 넣고 빠뜨리면 실패하는 것이 의도(기존 정책과 동일) |

## 6. 검증 방법
1. `npm test`(`scripts/*.test.mts`) — 위 시험 포함 통과.
2. 타입 검사·린트(프로젝트 기존 명령).
3. 화면: 개발 실행에서 `UpdateStatus.news`에 가짜 본문을 넣은 상태(스토어 `setState`)로 새 버전 카드·접기·요약 없는 옛 버전 폴백을 확인하고 캡처. 모바일 빌드(`window.officeUpdate` 없음)에서 카드가 안 뜨는지.
4. 네트워크: 오프라인/403 상태에서 카드가 없어도 번들 소식이 정상인지, 한 번 받은 뒤 끊어도 카드 유지되는지.
5. 4개 언어 전환 시 새 버전 카드 언어가 따라 바뀌는지.

## 7. 정리드가 고를 쟁점과 내 추천
| 쟁점 | 추천 | 이유 |
|---|---|---|
| 출처 | Release 목록 호출 | 호출 수 같고 미출시 노출 없음, 건넘 해결 |
| IPC 모양 | `news: {version,date,body}[]` 추가, `latest` 유지 | 기존 안내 창·배지 무변경 |
| 요약 형식 | `### 요약` 3~5줄 | 파서·시험 변경 최소, 소급 선택 가능 |
| 접기 | 요약 외 전부 `<details>` 하나 | 기존 패턴, 새 부품 없음 |
| 옛 버전 소급 | 최근 2~3개만 | 비용 대비 효과, 나머지는 폴백 |
| 안내 창 요약화 | 이번엔 보류 | 범위 확대 방지 |
| 순수 함수 `pickNews` 분리 | 한다 | 시험 가능성은 이득이 분명해 이번엔 분리 정당 |

## 8. 미확인·가정
- Release `published_at` 날짜를 쓴다는 가정(본문 첫 줄 정규식은 대안). 날짜 표기가 CHANGELOG와 다를 수 있음(UTC 기준).
- GitHub Release가 실제로 `docs/release-notes`를 그대로 담는지는 브리프 설명을 따랐고 실제 게시물은 확인하지 않음.
- 요약 문구 길이·줄 수(3~5줄, 120자)는 어림값, 김버전과 조율 필요.
- 안드로이드 네이티브 업데이트 안내(`UpdateCheck.kt`)는 별도라 이번 설계에 포함하지 않음.
