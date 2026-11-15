# 재검토 결과: ea412d3 (범위 39abde1..ea412d3)

## 판정: pass (꼭 고칠 것 없음)
순수 함수(`recordBashWrite`, `writtenWaitReason`, `autoApprove`)를 직접 호출해 확인함(/tmp/h8.mts, /tmp/h9.mts). 실제 앱·SDK 흐름, typecheck·test 재실행은 하지 않음.

## 1) 문서의 재현 입력 — 모두 직후 `pnpm test`가 wait
- 필수 1: `git apply`, `git checkout other -- f`, `git checkout .`, `git stash pop`, `git stash`, `echo x > $HOME/a`, `echo x > "$F"`, `git restore` → wait.
- 필수 2: `echo x>f`, `echo x>>f`, `bash -c "…"`, `sh -c`, `bash -lc`, 중첩 `bash -c 'bash -c …'`, `python -c`, `python3 - <<EOF`, `node -e`, `ruby -e`, `perl -pi`, `curl -o/-O/-sSLo`, `wget -O` → wait.
- 이전 항목(`echo >`, heredoc, `cp`, `mv`, `sed -i`, `tee`, `npm pkg set`, `dd of=`, `install`, `ln`)도 유지.

## 2) 읽기·일반 명령 — runnable 안 켜짐(결재 과다 없음)
`ls`, `git status/diff/log`, `cat`, `echo x`, `grep > /dev/null`, `2>&1`, `git checkout -b/-B`, `git stash list/show`, `node a.js`, `node --version`, `python script.py`, `python -m pytest`, `python -V`, `curl URL`, `curl -s URL | head`, `curl -I`, `bash script.sh`, `bash -c "ls"`, `git switch/branch/fetch/add/commit`, `jq`, `awk`, `tsc`, `pnpm typecheck/lint`, `perl script.pl`, `php`, `deno run`, `bun run`, `echo "a=>b"`, `echo "a > b"`, `a => b` 모두 통과.
`pnpm test > out.log`, `echo x > out.log; pnpm test`는 의도대로 harmless(통과).

## 새로 생긴 오탐(권장, 영향 작음)
- 따옴표 안의 `>`: `cat a | grep ">"`, `grep -r ">" .`는 리다이렉트로 오인해 쓰기로 기록 → 이후 `pnpm test`·npm 스크립트가 wait. 렉서가 따옴표를 지워 토큰이 `>`만 남기 때문. 흔하지 않음.
- 플래그가 파일 뒤에 오는 경우: `python script.py -i`, `node a.js -p`, `node scripts/foo.js --eval x`는 인라인 실행으로 오인. 인터프리터 인자 중 첫 위치 인자(파일) 앞에 온 플래그만 보면 해소.
- `wget`은 항상 쓰기로 봄(`wget --version`도). 영향 미미.
- `git checkout <branch>`는 쓰기로 봄(파일 바뀜) → 이후 `pnpm test` wait. 브랜치 전환 뒤 테스트가 기다리는 건 보수적이지만 안전한 쪽이라 허용.

## 남은 우회(권장 — 기본 규칙에서 이미 wait라 실위험 낮음)
- `eval "…> f"`, `echo x | sh`, `printf x | bash`, `find -exec cp`, `sudo tee`, `xargs cp`, `bash script.sh`, `python3 -m http.server`: `recordBashWrite`는 기록하지 않지만 `autoApprove`가 이미 wait라 자동 허용되지 않음(noteWrite는 허용된 경우만 유의미).
- `make build`, `chmod +x`, `mkdir`, `git merge/pull/cherry-pick/rebase`는 allow지만 직원이 쓴 코드를 만들지 않음(외부·기존 내용). `git merge/pull`이 가져온 파일을 실행하는 건 직원 작성물이 아니라 범위 밖.
- 위 wait 규칙이 바뀌면 이 목록이 우회로 바뀔 수 있다 → 규칙 변경 시 재점검.

## 가정
- 직후 판정 기준은 `writtenWaitReason(rec, 'pnpm test')`와 `autoApprove`의 현재 규칙.
- `noteWrite`는 자동 허용된 Bash에서만 의미가 있다고 봄(코드 읽기).

## 대표 확인 필요
- 없음. 임시 파일은 /tmp/h8.mts, /tmp/h9.mts에만 있음.
