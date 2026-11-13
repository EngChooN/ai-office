# 매뉴얼실 개편 1차 QA (커밋 d6a1747)

## 판정
**pass (일부 blocked)** — fail 없음. 관찰 사항 3건은 아래 "참고" 참조.

## 환경
- 개발 앱: `scripts/qa-start.sh start ocue --cdp 9461 --vite 5191` (데이터 `~/claude-office-qa-ocue`), 조작은 `qa-cdp.mjs`.
- 시험 프로젝트 폴더 `/tmp/qa-ocue-proj` (저장은 모두 여기. 실제 `~/.claude/skills`는 건드리지 않음 — 시작·끝 목록 동일: feature-flow, fix-qa, issue-flow, refine-question, synced, work-flow).
- 시험용 직원 7명(Claude 6·Codex 1, 직무: 개발자·리뷰어·QA·작성자·편집자·기획자) + 팀 2개는 DB에 직접 넣음(`/tmp` 아닌 QA 데이터 폴더 안). 시험 매뉴얼 8개는 앱의 `deleteManual`로 지움.
- 자동 시험 `node --test scripts/manuals.test.mts`: 25개 모두 통과.
- 제약: 창 캡처(`shot`)가 두 번째 실행부터 멈춰 화면 캡처는 첫 두 장뿐이고, 4개 언어는 DOM 검사(원문 키 노출·넘침·빈 버튼)로 확인함. 파일 선택 창(`pickFolder`)은 자동 조작이 안 돼 폴더 선택 대신 직원 작업 폴더(`/tmp/qa-ocue-proj`)가 선택지에 뜨는 것으로 대신함.

## 시나리오 결과
| # | 항목 | 재현 절차 | 기대 | 결과 | 판정 |
|---|------|-----------|------|------|------|
| 1a | Claude 직원이 title 매뉴얼 호출 | 고객 응대 메일 쓰기 템플릿 저장(SKILL.md에 `title:` 있음) → `window.office.instruct('qa-c1', '…매뉴얼(manual-fo8m2z)을 써서…')` | 오류 없이 호출 | 호출 성공, 매뉴얼 절차대로 답장 작성. 머리글에는 title이 아닌 description 첫 줄이 쓰임(`[매뉴얼 사용: 고객 문의에 정중하고 짧은 답장 초안]`) — Claude Code는 `title` 키를 무시 | pass |
| 1b | Codex 직원이 title 매뉴얼 호출 | 같은 지시를 `qa-x1`(codex)에 보냄 → 결재(`cat …/ai-office-skills-*/manual-fo8m2z/SKILL.md`) 승인 | 오류 없이 호출 | 호출 성공, 머리글에 `[매뉴얼 사용: 고객 응대 메일 쓰기]`(title) 사용 | pass |
| 2a | 템플릿 7개 저장 | 새 매뉴얼 → 예시에서 고르기 → 저장 (회의 내용·고객 메일·문제 원인(bugFix)·쓰고 검토받기·기획·글 쓰고 다듬기(contentPublish)·**하루 업무 보고(저장·삭제만)**) | SKILL.md 생성, `title`·`kind` 기록 | 7개 모두 저장 확인(`kind: process` 4개, personal 3개) | pass |
| 2b | 단계 담당 매칭 | bugFix 실행(`startRun`, 팀 qa-t1) | 개발자→개발자, 리뷰어→리뷰어, QA→QA | s1·s2 클로드개발, s3 클로드리뷰, s4 클로드QA. contentPublish: 작성자→클로드작성, 편집자→클로드편집. planBuildQA: 기획자·개발자·QA 각 매칭 | pass |
| 2c | 내 확인 — bugFix 4단계 | bugFix 끝까지 | s4에서만 '확인 필요'(status `checking`) | s1~s3는 자동 진행, s4에서 `checking`. `reviewRun(approve)` 후 `done` | pass |
| 2d | 내 확인 — contentPublish 3단계 | contentPublish 실행 | s3에서만 확인 대기 | s3에서 `checking`. 피드백(`제목을 더 짧게`) 반려 → s3 다시 실행(최종본이 피드백 반영) → 승인 → `done` | pass |
| 2e | 되돌리기 | bugFix(리뷰가 계속 '고쳐야 함'이게 입력) / writeReview / planBuildQA 실행 | `onRevise` 단계로 돌아가고 최대 2번 | bugFix: s3→s2 두 번 되돌린 뒤 `loops {s3:2}`로 '되돌리기를 2번 했는데도…' 확인 요청. writeReview: s2→s1 한 번 되돌려 통과 후 `done`. planBuildQA: s3→s2 두 번 후 확인 요청 | pass |
| 3 | title 없는 옛 매뉴얼 | 기존 refine-question 목록·고치기 | 이름으로 표시, 편집 창 열림, 파일 이름 읽기 전용 | 목록에 이름 그대로 표시, 고치기 열림(제목칸에 `refine-question`), 파일 이름칸 `readOnly` | pass |
| 4a | 한글 이름이면 manual-xxxxxx | 한글 제목 템플릿 저장 | `manual-` + 6자 | `manual-iy5b10`, `manual-tojmk9` 등 | pass |
| 4b | 겹치면 -2 | 제목 `QA Dup Test`로 두 번 저장 | `qa-dup-test`, `qa-dup-test-2` | 폴더 두 개 확인 | pass |
| 5a | 편집 창 닫을 때 확인창 | 수정 없이 취소 → 제목에 ` X` 붙이고 취소 | 안 고쳤으면 그냥 닫힘, 고쳤으면 확인창 | 처음엔 확인창 없이 닫힘. 수정 뒤에는 `window.confirm('고친 내용이 저장되지 않았어요. 닫을까요?')`, 거절하면 창이 열린 채 값 유지, 수락하면 닫힘 | pass |
| 5b | 초안 중 닫으면 편집 창 안 열림 | 말로 설명 → 초안 만들기(약 25초 걸림) → 만드는 중에 닫기 → 45초 대기 | 편집 창이 뜨지 않음 | 닫은 뒤에도 편집 창·대화상자 없음 | pass |
| 6 | 직원 0명일 때 말로 설명 초안 | 직원 0명 상태에서 말로 설명 → 초안 만들기 | 초안 생성 | 약 25초 뒤 편집 창이 열리고 제목·설명·본문 채워짐 | pass |
| 7a | 저장 후 '쓸 수 있게 하기' 창 | 팀 2개 있는 상태에서 process 매뉴얼 저장 | 비어서 열림 | 팀 칩 2개 모두 미선택 | pass |
| 7b | 모두 선택 | 모두 선택 클릭 → 쓸 수 있게 하기 | 모두 선택됨, 저장 | 칩 2개 선택됨, 저장 뒤 `team.manuals`에 매뉴얼 이름 기록 | pass |
| 7c | personal 매뉴얼의 '쓸 수 있게 하기' 창 | personal 템플릿 저장 | 비어서 열림 | **'전부 사용' 직원은 처음부터 선택된 채 열림**(Codex 직원은 미선택). 참고 1 | 참고 |
| 8 | 4개 언어 문구 | 설정에서 ko/en/ja/zh 전환 → 새 매뉴얼 창·예시 목록·bugFix 편집 창 | 원문 키·빈 버튼·가로 넘침 없음 | 4개 언어 모두 원문 키 없음, 빈 버튼 0, 넘침은 sr-only '닫기' 한 개뿐(오탐). 템플릿 키 누락은 자동 시험에서도 통과 | pass |

## 참고 (fail 아님, 확인 필요)
1. **personal 매뉴얼 '쓸 수 있게 하기' 창이 비어서 열리지 않음.** 지시 7번은 "비어서 열린다"이나 `skills: 'all'`(전부 사용)인 직원은 이미 쓸 수 있는 상태라 선택된 채 열림(`manuals.test.mts`나 코드상 의도로 보임). 팀·랩은 비어서 열림. 의도라면 문서만 정리하면 됨.
2. **옛 매뉴얼을 고치면 제목칸이 이름으로 채워짐** (`manualLabel` 폴백). 그대로 저장하면 SKILL.md에 `title: "refine-question"`이 새로 생김. 의도인지 확인 필요(저장은 시험하지 않음 — 실제 `~/.claude/skills` 파일이라 건드리지 않음).
3. 한국어 되돌리기 선택지 문구가 `1. 원인 찾기(으)로 다시 보내기`처럼 조사 `(으)로`가 그대로 보임(`고치기(으)로`). 어색하지만 동작엔 문제 없음.

## blocked / 수동 QA
- Claude Code가 `title:` 키를 다른 버전에서도 무시하는지(이번엔 이 앱 번들 버전만). 
- 실제 브라우저(외부 Chrome)에서의 화면 확인, 캡처 2번째부터 `shot`이 멈춰 모든 화면의 시각 확인(잘림·줄바꿈)은 못 함 — 4개 언어는 DOM 검사만.
- 하루 업무 보고 정리하기 템플릿은 저장·삭제만 하고 호출하지 않음(personal 3개 중 2개만 호출).
- 안드로이드·원격 웹(remote.html)의 매뉴얼 화면은 범위 밖.
