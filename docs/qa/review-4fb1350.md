# 검토 결과: 4fb1350 (범위 abb0392..4fb1350)

## 판정: revise (꼭 고칠 것 1건)
typecheck 통과. test 1236건 중 1235 통과, 실패 0, 건너뜀 1. 순수 함수(autoApprove, writtenFiles)를 직접 호출해 재현함(/tmp/h5.mts, /tmp/h6.mts). 실제 앱·SDK 흐름은 거치지 않음.

## 꼭 고칠 것 1: Bash로 쓴 파일이 기록되지 않아 자동결재 우회됨
- 원인: `hired.ts:398`은 `isEditTool`일 때만 `noteWrite`(→ `recordWrite`)를 부른다. Bash 쓰기는 기록이 없다.
- 재현 입력(현재 판정 allow, 기대 판정: 허용은 하되 쓴 경로를 기록):
  - `echo "…execSync('git push')" > scripts/evil.test.mts`
  - `cat > scripts/evil.test.mts <<EOF …`
  - `cp /tmp/e.mts scripts/evil.test.mts`
  - `mv /tmp/e.mts scripts/evil.test.mts`
  - 그 외 allow: `sed -i … scripts/x.test.mts`, `tee scripts/evil.test.mts`, `echo x > src/a.test.ts`, `echo x > scripts/x.sh`
- 시나리오: 위 명령이 기록 없이 allow → 이어서 `pnpm test`(scripts/*.test.mts 실행)가 기록이 비어 allow → 직원이 쓴 코드가 결재 없이 실행됨.
- 기대 판정: 위 명령 직후 `pnpm test`는 wait.
- 이미 wait인 것(정상): package.json·Makefile·justfile·.npmrc·.github/workflows 쓰기, `npm pkg set`, `git apply`, `patch`, `python -c open(...)`, `jq . > package.json`.
- 고칠 방향(둘 중 하나):
  1. Bash가 allow로 풀릴 때 리다이렉트(`>`,`>>`), `tee`, `cp`, `mv`, `install`, `sed -i`, `touch`, `ln`의 대상 경로를 `recordWrite(rec, path, null, null)`로 기록. `autoApprove.ts`의 `FILE_WRITERS`, `LAST_ARG_TARGET`을 재사용.
  2. 가장 단순한 방법: 자동 허용된 Bash 쓰기 명령이 있으면 그 직원 기록의 `runnable`을 켜서 그 업무 동안 npm 계열 스크립트 실행을 wait로.
- 시험: 위 4개 명령이 allow로 풀린 뒤 `pnpm test`가 wait인지 추가.

## 권장(필수 아님)
- Codex 쓰기 경로가 상대 경로면 `readFileSync`가 프로세스 cwd 기준이라 "새 파일"로 오판(`before=null`). `after`도 알 수 없어 "전부 바뀜"으로 처리되므로 안전한 쪽. 경로를 작업 폴더 기준으로 풀면 더 정확.
- 거부·취소된 쓰기도 기록이 먼저라 남는다. `canUseTool`에서 거부 시 기록을 되돌리면 오탐 감소(선택).
- 같은 쓰기가 훅과 `autoDecide`에서 두 번 기록되나 멱등(Set, 값 덮어쓰기)이라 문제 없음.
- 이유 줄: `waitReason`에 위험 경로 반영(`hired.ts:422`)은 의도대로. 화면은 미확인.

## autoWritten.clear() 제거에 따른 오탐 영향 의견
- 제거 자체는 옳다: 자동결재를 나중에 켜도 켜기 전 쓴 파일이 유지돼 보안상 이득.
- 비우는 시점은 업무 시작·완료·중단뿐이라, 한 업무 안에서는 기록이 계속 쌓인다. 그 결과 업무 중 쓴(또는 거부된) 테스트·scripts 파일이나 package.json 스크립트 때문에 이후 npm 계열 명령이 wait가 되는 오탐이 늘 수 있다.
- 자율 모드에선 wait가 곧 거부라 `pnpm test` 등이 거부될 수 있으나, 업무 종료·새 시작 때 풀린다. 업무 없이 오래 쓰는 직원의 키(`staffId:`)는 다음 비우기까지 유지되지만 규모가 작아 메모리 문제는 없다.
- 결론: 허용 가능. 보안 약화 없음, 오탐만 증가.

## 가정
- 기본 규칙(`commandWaits`) 현재 동작을 허용/기다림 기준으로 삼음. 규칙이 바뀌면 필수 1의 범위도 달라짐.
- 훅 순서는 코드 읽기로 판단.
