# 최종 설계 결정 — 승인 카드 '결과 한 줄' (정리드, 2026-11-11)

> 비교: 설계안 A `approval-effect-readable.md`(최가독) · 설계안 B `approval-effect-pattern.md`(박패턴) · 디자인 `approval-effect/handoff.md`(이디자). 구현은 정리드.

| 쟁점 | 고른 것 | 이유 | 채택하지 않은 쪽 |
|---|---|---|---|
| 필드 | 공통: `Approval.effectI18n?: I18nText`. `summary`·`summaryI18n`은 그대로 | 매칭 키 불변. 이름은 A(`summaryI18n`과 짝), 타입은 좁게 | B 초안의 `effect: I18nArg` |
| 함수 | 공통: `shared/approvalEffect.ts` `effectOf()` + 제목 함수 `approvalHeadline()`(A 이름) | 명령 분해는 `commandScan` 재사용 | — |
| 1차 범위 | **B: Write·Edit·MultiEdit·NotebookEdit·WebFetch, Bash는 `rm`·`git push`·`curl`·`wget`만** | 위험 결재(삭제·푸시·외부 전송)가 핵심. 작게 시작해 표에 한 줄씩 추가 | A의 `git commit/add/pull`·`mv`·`cp`·`mkdir`·`WebSearch` (2차) |
| 여러 개 삭제 | **B: "{첫 대상} 등 {n}개"** | 실제 이름이 하나는 보인다. 공통 상위 폴더 계산이 필요 없다 | A의 `inDir`/`many` 3분기 |
| `git push`(인자 없음) | **A: null** | 어디로 가는지 입력만으로 모른다 | B의 "기본 원격에 올립니다" |
| `sudo`·`env` 등 앞말 | **B: null** | sudo를 숨긴 해설은 위험을 낮춰 보이게 한다 | A의 앞말 벗기기 |
| 주소 | **B: 호스트만** | 경로에도 토큰이 섞인다. 짧다 | A의 host+path |
| 긴 경로 | **A: 200자 넘으면 null, 자르지 않음** + 경로는 `maskSecrets` | 잘린 경로는 다른 파일처럼 읽힌다 | B의 60자 줄임 |
| 셸 판정 | 따옴표 밖에 `| ; & ( ) < > { } $ \` * ? [ ] ~ ! # \\` 하나라도 있으면 null, 모르는 플래그도 null | 확신 없으면 원문 | — |
| 화면 부품 | **A: `features/ApprovalSummary.tsx` 하나** (제목 → 이유 → 복원됨 → 접힌 원문) | 결재함·직원 패널이 같은 순서·토글 | B의 `ApprovalHeadline`(variant) |
| 위험 결재 원문 | **디자인: 기본 접힘** | 효과 문장에 '통째로'·'강제로'가 이미 있고, 이유 줄도 보인다 | B의 위험 결재 펼침 |
| 대시보드 | 디자인: 효과 문장 2줄, 원문은 `title`. 바로 승인/결재함 구분은 **원문 길이 유지** | 원문이 길면 결재함에서 보게 | A의 headline 길이 기준 |
| 대화 승인 | A: 말풍선 글은 그대로, 버튼 위에 효과 제목 한 줄(토글 없음 — 말풍선에 원문이 있다) | 저장된 글을 바꾸면 언어가 굳는다 | 디자인의 '말풍선 첫 줄' |
| 데스크펫 | 제목 = `approvalHeadline`, 원문은 아래 고정폭 2줄 + `title` | 좁은 창이라 토글 대신 | — |
| 피어 전달 | **이번에 뺌** (`office.ts:1770`이 커밋 안 된 도움 요청 변경과 같은 파일) | 원격 쪽은 원문 제목(깨지지 않음). 도움 요청 커밋 뒤 `peerProtocol`·`peerHost`·`approvalRelay` + 모양 검사(B)와 함께 추가 | — |
| 저장·복원 | 공통: `pendingApprovals` 저장·복원에 실음 | 재시작 뒤에도 유지 | — |

시험: `scripts/approvalEffect.test.mts` (도구·rm·push·curl·null 41가지·비밀·4개 언어·제목 우선순위·저장 왕복).

## 리뷰 반영 (한리뷰 1차, 2026-11-11)
- **git 전역 옵션:** `-c`·`-C`·`--git-dir` 등이 붙으면 도착지나 저장소가 바뀔 수 있습니다. 그래서 `push`가 맨 앞에 올 때만 문장으로 바꾸고, 나머지는 원본 명령을 그대로 보입니다. 공용 `gitSubcommand`는 허용 판정에서도 쓰므로 고치지 않았습니다.
- **안 보이는 글자:** 명령이나 경로에 제어문자, 양방향 제어 글자(예: U+202E), 폭 없는 글자가 있으면 문장을 만들지 않습니다. 이런 글자가 있으면 문장이 실제 대상과 다르게 읽히기 때문입니다.
