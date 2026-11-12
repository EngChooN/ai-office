# 1.3.0 반영 요청 (정리드 → 김버전)

업데이트 소식 개편 + 쉬운 말 보고 말투. 둘 다 구현·한리뷰 검토·타입 검사·npm test(1,427개 중 1,426 통과·1 건너뜀·실패 0) 완료.
대표 지시: 같은 1.3.0 커밋으로 합치고 dmg·zip·APK 재빌드. **푸시·태그·게시 금지.**

## 1) 변경 이력 한 줄 추가
4개 언어 CHANGELOG(.md/.en/.ja/.zh)와 `docs/release-notes/1.3.0.md`의 1.3.0 상세 '새 기능'에 한 줄:
> 직원·비서 보고가 쉬운 말로 — 결과부터 짧게, 어려운 용어는 풀어 써요. 설정 › 보고 말투에서 전문가 말투로 바꿀 수 있어요

- 1.3.0은 이미 새 규칙(`### 한눈에 보기` 3~5줄 + 줄 앞 굵은 종류 말)으로 다시 써 둠. 한눈에 보기가 이미 5줄(최대)이라 **상세에만** 추가(요약에 넣으려면 한 줄을 바꿔 5줄 이하 유지).
- 4개 언어 종류 순서가 같아야 changelog 시험 통과. 추가 뒤 `cd app && npm test`.

## 2) 커밋 — HEAD 7907fc8("버전 1.3.0: …", 푸시·태그 전)에 amend
제목에 '업데이트 소식 개편·쉬운 말 보고'를 덧붙임. **아래 파일만** 넣는다.
- CHANGELOG.md, CHANGELOG.en.md, CHANGELOG.ja.md, CHANGELOG.zh.md, SPEC.md, docs/release-notes/1.3.0.md
- app/scripts/changelog.test.mts, duoIcon.test.mts, updateCheck.test.mts, reportStyle.test.mts(새)
- app/src/main/hired.ts, office.ts, remote/v2.ts, secretary.ts, updates.ts
- app/src/renderer/components/duo-icon-data.ts, markdown.tsx, more-toggle.tsx
- app/src/renderer/features/AppUpdate.tsx, SettingsPage.tsx, UpdatesPage.tsx
- app/src/shared/changelogParse.ts, iconText.ts, types.ts, updateCheck.ts, reportStyle.ts(새), i18n/dict/featuresB.ts, i18n/dict/staff.ts
- docs/design-refresh/updates-news/ 전체, docs/design-refresh/plain-report/ 전체

**넣지 말 것:** app/src/renderer/features/ChatPage.tsx, StaffPanel.tsx, secretary/SecretaryChat.tsx(무관한 미커밋 수정), docs/design-refresh/chat-header/, docs/design-refresh/usability-v1/qa.md·review.md

## 3) 빌드
맥 dmg, 맥 zip, 안드로이드 APK 재빌드(윈도우는 이번 요청 아님).

## 완료 보고
새 커밋 해시, 시험 결과, 세 산출물 경로·크기, 문제가 있었다면 그 내용.
