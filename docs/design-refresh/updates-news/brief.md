# 업데이트 소식 개선 — 요구사항 브리프 (정리드, 2026-11-12)

## 대표 피드백
- (A) 앱의 '업데이트 소식'(UpdatesPage)이 쓸데없는 것까지 적혀 있고 길어서, 무엇이 추가됐는지 한눈에 안 들어온다. 비개발자용 쉬운 말은 유지하되 짧고 훑어보기 쉽게.
- (B) 업데이트를 안 한 유저는 새 버전이 있어도 업데이트 소식에서 '다음 버전' 이력을 못 본다(앱에 번들된 CHANGELOG만 보이므로). 업데이트 전에도 새 버전 소식을 보게.

## 현재 구조
- 화면: `app/src/renderer/features/UpdatesPage.tsx` — 버전 카드마다 섹션(새 기능/개선/버그 수정) 제목 + 마크다운 본문을 전부 펼쳐 보인다. `WhatsNew.tsx`도 `ReleaseNotes`를 쓴다.
- 데이터: `app/src/renderer/lib/changelog.ts`가 저장소 루트 `CHANGELOG.md`·`.en`·`.ja`·`.zh`를 빌드에 넣고, `app/src/shared/changelogParse.ts`가 `## [버전] - 날짜` / `### 새 기능|개선|버그 수정`으로 나눈다. 섹션 앞 본문(예: '기기별 차이:')은 kind 'other'.
- 시험: `app/scripts/changelog.test.mts` — 4개 언어 파일의 버전 목록·날짜·섹션 종류·항목 수가 같은지.
- 새 버전 확인: `app/src/main/updates.ts` → GitHub `releases/latest` API(인증 없음, 시간당 60회). Release 본문(`body`)은 `docs/release-notes/X.Y.Z.md`를 그대로 넣은 것으로 `## 한국어/English/日本語/中文` 아래 CHANGELOG와 같은 `###` 구조. 지금은 `summarizeNotes`로 화면 언어 섹션을 평문으로 줄여 `UpdateStatus.latest.notes`에 담아 안내 창(`AppUpdate.tsx`)에만 보인다. 업데이트 소식 화면에는 안 보인다.
- 모바일(안드로이드 웹뷰) 빌드는 업데이트 통로(preload)가 없어 `status`가 늘 없다.
- 1.3.0 항목(김버전 작성·커밋 7907fc8): 새 기능 5줄, 개선 4줄, 버그 수정 5줄 + '기기별 차이' 문단. 줄마다 3~8문장.

## 하고 싶은 방향 (확정 아님 — 각자 관점으로 제안)
- 버전마다 핵심 3~5줄 요약(사용자 가치 한 문장씩)을 맨 위, 상세는 접기.
- 내부·개발 사정·기기별 사소한 차이·재수정류는 빼기.
- 화면에서 '새 기능/개선/수정' 구분을 한눈에.
- 업데이트 전 유저도 다음 버전 소식을 볼 수 있게 (가장 단순·안전한 방식).
- 4개 언어 유지, 기존 시험(4개 언어 구조 일치) 유지 또는 새 형식에 맞게 갱신.

## 지키는 것
- CHANGELOG*.md·docs/release-notes는 김버전 소유 — 편집은 정리드가 김버전과 조율한 뒤 한 번에. 다른 사람은 고치지 말고 제안만.
- 작업 트리의 ChatPage/StaffPanel/SecretaryChat 미커밋 수정은 건드리지 않는다. 푸시·태그·게시 금지.
