# 리뷰 850affd (7d1c7cf..850affd) — 한리뷰

## 판정
**approve** — 필수 재현이 막히고, 평소 명령의 결재는 늘지 않았다. 남은 우회는 모두 af7952c 이전부터 있던 한계다.
확인 방법: `WrittenStore.get`·`movesDir`·`writtenWaitReason`을 직접 호출(/tmp 프로브, `/repo` 기록 → `/repo/app` 조회). 앱 흐름·typecheck·test 재실행은 하지 않았다.

## (1) 필수 재현과 새 우회
- 막힘(wait=written-file): `node /repo/scripts/e.mts`, `node ../scripts/e.mts`, `node ../../repo/scripts/e.mts`, `node ./../scripts/e.mts`, `node "$PWD/../scripts/e.mts"`, `node $(pwd)/../scripts/e.mts`, `node -r /abs/e.mts x`, `node --import ../e.mts`, `source`/`.` `../e.mts`, `cd .. && node scripts/e.mts`, `find . -exec node /abs/e.mts \;`, `find .. -name e.mts -exec node {} \;`.
- 오케스트레이터(turbo 등): movesDir true라 기록을 합친다. 실행 파일이 안 겹치면 wait 없음(정상).
- **남은 우회(기존 한계, 필수 아님):**
  - 변수로 시작하는 경로: `node $HOME/x.mts`, `node ${R}/scripts/e.mts` — 경로가 `$`로 시작해 movesDir·pointsAt 모두 못 본다.
  - 문자열 안에 든 경로: `node -e "require('/abs/e.mts')"`, `python -c "exec(open('/abs/e.mts').read())"` — 인자가 `/`로 시작하지 않는다.
  - `xargs node < list`, `find ../scripts -exec node {} +`(`{}`는 파일명을 모름): 대상이 실행 시점에야 정해진다.
  - 위는 af7952c에서도 같은 폴더 직원 기준으로 안 막혔다. 이번 변경이 새로 만든 구멍이 아니다. 대안은 `$`로 시작하는 인자와 `-e`/`-c` 문자열 인자를 보수적으로 movesDir=true로 두는 것.

## (2) pointsAt 완화와 결재 증가
- 같은 폴더 평소 명령(`pnpm test`, `node scripts/x.mts`, `echo hi > /tmp/o`, `cat /etc/hosts`, `git diff /tmp/x`, `ls /tmp`, `pnpm test ../shared`, `node ../x.mts`)은 기록이 `src/a.ts`뿐이면 모두 wait 없음.
- movesDir가 넓어져 `ls /tmp` 같은 명령도 "모든 기록 합침"이 되지만, 합친 기록은 러너·파일 대조에서만 wait를 만든다. 비러너 명령이 기록 파일과 안 겹치면 wait 없음(`cat /repo/scripts/e.mts`, `git diff -- /repo/app/a.ts` → null).
- 증가 가능 지점: 다른 폴더 기록에 `x/y.mts`가 있을 때 `node ../y.mts`·`../x/y.mts` 같은 명령이 끝부분 일치만으로 wait가 된다. 이름이 겹칠 때만 생기고 더 기다리는 쪽이라 허용 범위.
- 미세 주의: `pnpm test /abs/path`처럼 절대 경로 인자가 붙은 러너는 모든 기록을 합쳐 다른 폴더의 `runnable` 기록 때문에 wait가 될 수 있다. 자주 쓰는 형태는 아니다.

## 가정
- 직원의 실제 작업 폴더 = `s.cwd`와 같은 절대 경로.
## 대표 확인 필요
- 없음.
