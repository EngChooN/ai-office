# 재검토 결과: 39abde1 (범위 4fb1350..39abde1)

## 판정: revise (꼭 고칠 것 2건)
순수 함수 `recordBashWrite`·`writtenWaitReason`을 직접 호출해 재현함(/tmp/h7.mts). 실제 앱·SDK 흐름은 거치지 않음. typecheck·test는 이번에 재실행하지 않음(강백엔 보고 기준).

## 1) 지난번 재현 입력 — 대부분 해결
직후 `pnpm test`가 wait가 되는 것: `echo > scripts/evil.test.mts`, heredoc(`cat > f <<EOF`, `cat <<EOF > f`), `cp`, `mv`, `sed -i`, `tee`(`-a` 포함), `npm pkg set`, `dd of=`, `install`, `ln`, `awk … > f`, `&&`로 이어 붙인 cp.
한편 읽기 명령(ls, git status, cat file, echo x, grep > /dev/null, 2>&1, >&2, git diff/log, sed -n, sort, tar tf, pnpm test 2>&1)은 기록이 켜지지 않아 결재 과다 없음.
`pnpm test > out.log`, `| tee run.log`, `> /tmp/o.txt`는 harmless로 통과(의도대로).

## 꼭 고칠 것

### 필수 1) runnable만 켜지는 경우 `writtenWaitReason`이 바로 null을 반환
- 위치: `writtenFiles.ts:311`의 조기 반환(files·scripts·allScripts·makeTargets·allMake가 모두 비면 null). runnable은 이 조건에 없다.
- 재현(recordBashWrite는 true인데 직후 `pnpm test`는 null=통과):
  - `git apply p.diff`, `git checkout other -- scripts/x.test.mts`, `git stash pop`
  - 대상을 못 뽑는 쓰기: `echo x > $HOME/a`, `echo x > "$F"`, `echo x > out.log; pnpm test`
- 기대: 위 명령 직후 `pnpm test`는 wait.
- 고칠 방향: 조기 반환 조건에 `&& !rec.runnable`을 추가. 시험에 위 입력을 넣는다(지금 시험은 git apply·checkout을 담지 않아 놓침).

### 필수 2) 쓰기 대상을 못 알아보는 우회
`recordBashWrite`가 false를 내고 직후 `pnpm test`가 통과하는 입력:
- 공백 없는 리다이렉트: `echo x>scripts/e.test.mts` (토큰이 `x>scripts/...` 하나라 `REDIRECT_OUT`이 앞에서 시작하지 못함)
- 중첩 셸: `bash -c "echo x > scripts/a.test.mts"`, `sh -c "…"`
- 인터프리터 한 줄: `python -c "open(…,'w')…"`, `python3 - <<EOF`, `node -e "fs.writeFileSync(…)"`, `ruby -e`, `perl -pi -e … file`
- 내려받기: `curl -o scripts/a.test.mts URL`, `wget -O …`
- 고칠 방향(가장 단순하고 안전한 쪽): ① 토큰 안 어디서든 `>`를 찾는 정규식으로 바꿔 `x>file`을 잡고, ② `bash|sh|zsh -c`는 안의 문자열을 다시 `bashWrites`로 재귀 검사, ③ 아니면 `bash|sh|zsh -c`·`python*`·`node -e`·`ruby`·`perl`(`-e`·`-c`·`-pi`·stdin)·`curl -o/-O`·`wget -O`는 보수적으로 `writes=true`(runnable)로 본다. 단, 보기 명령(`node a.js` 등 파일 실행)은 기존대로 별도 규칙이 처리하므로 `-e`·`-c`·heredoc 형태만 대상으로 한다.
- 참고: 지난번 필수 항목 중 `python -c open(...).write`는 이번 지시가 "wait가 되는지"를 묻는데, 현재는 wait가 아니다.

## 권장(필수 아님)
- `echo x > scripts/a.test.mts.log`는 `.log`로 끝나 harmless인 줄 알았으나 대상 `scripts/…`가 records 경로 규칙에 걸려 wait. 의도와 다르지만 안전한 쪽이라 문제 없음.
- `/tmp/../Users/a/scripts/a.test.mts`는 `/^\/tmp\//`에 걸려 harmless일 뻔했으나 `scripts/` 규칙에 걸려 wait. 정규화 후 `/tmp/`를 비교하면 더 정확.
- `git checkout -b x`·`git stash list`는 쓰기로 보지만(runnable) 필수 1이 고쳐지면 그 뒤 `pnpm test`가 wait가 되는 결재 과다가 생긴다. `checkout -b`·`stash list/show`는 제외하면 좋다.
- `git merge`·`pull`·`reset --hard`·`cherry-pick`·`rebase`도 파일을 바꾸지만 기록되지 않는다. 다만 이 명령들은 기본 규칙에서 별도로 기다릴 가능성이 있어 이번 범위 밖으로 둠(미확인).

## 가정
- `writtenWaitReason(rec, 'pnpm test')`가 wait인지를 직후 판정의 기준으로 삼았다.
- 자동결재가 Bash를 `allow`로 푼 경우만 `noteWrite`가 불린다고 본다(코드 읽기).

## 대표 확인 필요
- 없음. 임시 파일은 /tmp/h7.mts에만 있음.
