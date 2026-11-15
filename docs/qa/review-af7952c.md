# 재검토 결과: af7952c (범위 75e74a2..af7952c)

## 판정: approve (꼭 고칠 것 없음)
순수 함수(`WrittenStore`, `recordWrite`, `recordBashWrite`, `writtenWaitReason`)를 직접 호출해 확인함(/tmp/h11.mts). 실제 앱 흐름·typecheck·test 재실행은 하지 않음(강백엔 보고 기준: 1240건 중 1239 통과, 실패 0, 건너뜀 1).

## 1) 두 재현 — 막힘
- 재현 1: `/repo` 직원이 `/repo/app/package.json`의 test 스크립트를 바꿈 → `/repo/app` 직원의 `npm test` = build-script(wait).
- 재현 2: `/repo/app` 직원이 `echo x > scripts/e.test.mts`(상대 경로) → `/repo` 직원의 `pnpm test`, `pnpm -C app test` = written-file(wait).
- 영향 없어야 할 곳: 다른 폴더(`/other`)와 형제(`/repo/other`는 기록 `/repo/app`과 무관) = 기록 없음(통과). 단 `/repo` 기록은 그 아래 모든 폴더(`/repo/application` 포함)에 적용된다(상위 기록이라 당연).
- 남은 중첩 우회 점검:
  - 루트 `/` 기록: 모든 절대 경로가 하위로 보여 wait. 안전.
  - 윈도우: 드라이브 문자를 지우므로 `C:\repo`→`C:\repo\app` wait. `D:` 같은 다른 드라이브도 같은 키로 합쳐져 wait(더 기다리는 쪽, 안전).
  - 상대 cwd: 같은 상대값끼리만 맞고 절대 경로와는 안 맞는다(`repo` vs `/abs/repo` = 기록 없음). 다만 직원 cwd는 고용 때 `workDirOf`로 절대 경로가 되고(`office.ts:922`), `realpathSync.native`가 상대 경로를 절대로 풀어 주므로 실제로는 해당 없음.
  - 심볼릭 링크: 폴더 실경로 풀이 추가됨. 파일 경로 자체(링크를 통과한 `/link/x`)는 실경로로 풀지 않아, 직접 실행(`node /link/x.js`)처럼 경로 비교에만 영향. 스크립트 이름 기반(package.json)은 경로와 무관해 영향 없음. 낮은 위험.
  - realpath 실패(없는 폴더)는 원래 경로로 돌아가 안전.

## 2) 홈 폴더(~) cwd 직원의 결재 증가 — 받아들일 수준인가
- 확인: 홈 기록에 `/Users/me/proj1/src/a.test.ts` 하나만 있어도 `/Users/me` 아래 모든 폴더의 `pnpm test`, `pnpm typecheck`, `npm run lint`, `npm run build`가 written-file로 wait. `node a.js`는 통과. 반대 방향(하위 폴더 기록 → 홈 직원)은 해당 폴더만 영향이고 형제 폴더(proj1 vs proj2)는 서로 영향 없음.
- 평가: 보안은 약화 없음. 다만 폴더를 안 고르면 홈에서 범용으로 일하는 직원이 기본이라, 그 직원이 어느 프로젝트의 테스트·scripts 파일을 한 번 고치면 앱 재시작 전까지 **모든 프로젝트의 npm 계열 명령**이 기다린다. 자율 진행에서는 곧 거부라 불편이 크다. 승인 가능하나 개선 가치가 크다 → 권장으로 분류(필수 아님).
- 줄이는 방법(보안 유지):
  1. **파일 위치로 범위 좁히기(추천):** 조회하는 쪽 cwd보다 위에 있는 기록은 그 기록의 절대 경로 파일 중 조회 cwd 아래에 있는 것이 하나라도 있을 때만 합친다. `runnable`·scripts는 그 경우에만 반영. proj1을 고친 기록은 proj2에 영향이 없다. 파일을 못 뽑은 쓰기(`> $HOME/a`, `python -c` 등)는 기록에 "위치 불명" 표시를 두고 이때만 전역으로 적용한다.
  2. 기록 키를 직원 cwd가 아니라 **쓴 파일이 속한 프로젝트 루트**(가장 가까운 `package.json`·`.git` 조상)로 하면 홈 직원 문제가 근본적으로 사라진다. 변경이 커서 별도 작업으로.
  3. 대표가 직접 승인한 러너 실행(결재 카드로 본 것)은 그 폴더의 `runnable`·`scripts` 기록을 비운다(대표가 확인한 쓰기만 해당하면 안전).
- 홈 기록이 하위 폴더 기록에 영향을 주지 않고 그 반대만 있는 현재 구조에서, 위 1번은 보수적 합치기를 유지하면서도 오탐만 줄이는 최소 변경이다.

## 권장(필수 아님)
- 위 홈 폴더 오탐 완화(1번 우선). 시험으로 "홈 기록(proj1 테스트 파일) → proj2 `pnpm test` = 통과, proj1 = wait"를 추가.
- 앱 재시작 시 기록 소실, 파일 경로의 심볼릭 링크 풀이, 기록 개수 상한은 이전 검토(review-75e74a2.md)의 권장과 같음.

## 가정
- 직후 판정 기준은 `writtenWaitReason(store.get(cwd), 명령)`.
- 직원의 실제 작업 폴더는 `s.cwd`와 같고 절대 경로라고 봄(`office.ts:922`).

## 대표 확인 필요
- 없음. 임시 파일은 /tmp/h11.mts에만 있음.
