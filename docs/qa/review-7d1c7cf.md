# 리뷰 7d1c7cf (af7952c..7d1c7cf) — 한리뷰

## 판정
**revise (작은 수정 1건 필수)** — 홈 폴더 오탐 감소와 `cd`류 우회 차단은 의도대로 동작한다. 다만 좁히기 때문에 af7952c에서는 막히던 경로가 새로 뚫렸다.
확인 방법: `WrittenStore.get`·`movesDir`·`writtenWaitReason`을 직접 호출(/tmp 프로브). 앱 흐름·typecheck·test 재실행은 하지 않았다.

## 필수 수정
1. **절대 경로로 실행하는 비러너 명령이 새로 뚫림 (회귀).**
   - 재현: `/repo` 직원이 `/repo/scripts/e.mts`를 씀 → `/repo/app` 직원이 `node /repo/scripts/e.mts`.
   - af7952c: 상위 기록을 전부 합쳐 `written-file`로 wait. 7d1c7cf: `movesDir`가 false(node는 러너 목록에 없음), 파일이 조회 폴더 밖이고 길목 폴더(`/repo/app`의 조상)에 바로 놓인 것도 아니라서 기록이 합쳐지지 않아 **wait가 null**.
   - 원인: `movesDir`의 절대·`~`·`../` 경로 검사가 npm·테스트 러너·make 인자에만 걸려 있다. `node`·`python`·`bash`·`sh`·`tsx` 아닌 인터프리터·임의 실행 파일은 제외.
   - 권장 수정: 러너 여부와 무관하게, 어떤 명령이든 인자에 절대·`~` 경로가 있으면 `movesDir=true`(또는 그 경로를 기록 파일과 직접 대조). 가장 단순한 쪽은 앞쪽.

## 새로 생긴 우회·빈틈 (참고, 필수 아님)
- `find . -exec pnpm -C ../a test \;` → movesDir false(find 인자를 안 봄). `-exec`/`-execdir` 뒤 명령도 재귀로 볼 것.
- `turbo run test`, `nx run a:test`, `lerna run test` → movesDir false. 모노레포 러너라 다른 패키지를 돌린다. 오케스트레이터(turbo·nx·lerna·rush·moon·wireit)도 폴더 옮김으로 취급하는 편이 안전.
- 상대 경로 실행(`node ../a/x.mts`, `sh ../a/run.sh`, `node --test ../a/x.test.mts`): 기록을 합쳐도 `scanWritten`이 cwd를 몰라 상대 경로를 못 맞춘다 → **af7952c에서도 null인 기존 한계**이며 이번 변경이 악화시킨 것은 아니다. 다만 "cd/옵션 없이도 다른 폴더 기록을 본다"는 설명으로는 이 경우가 안 막힌다는 점은 알아 둘 것.
- 형제 폴더 간 기록(`/repo/a` 기록, `/repo/b` 직원 `pnpm test`)은 nested가 아니라 원래 안 보였다. `-C ../a`·`--filter` 등은 이제 막힌다. 상위 폴더 테스트 러너가 형제 테스트를 부르는 경우(상위 `/repo` 기록에 `/repo/a/x.test.ts`, `/repo/b` 직원 `pnpm test`)는 이전엔 wait였고 이제 통과 — 합리적인 좁히기로 본다(b의 `pnpm test`가 a를 부르려면 위 옵션이 필요).

## 확인된 것
- movesDir 막힘(기록 합침 + wait): `tsx ../x`, `xargs -I{} pnpm -C a test`, `nohup pnpm --prefix ../a test`, `time pnpm -C ../a test`, `pnpm exec -- vitest ../a`, `pnpm test --dir=../a`, `npm test --workspace a`, `cd ../a && …`.
- 길목 규칙: `/repo` 의 `package.json` 기록 → `/repo/a`의 `npm test`는 `build-script` wait. 하위 `/repo/a/sub`의 `pnpm test`도 wait.
- (2) 같은 폴더 평소 명령(`pnpm test`, `npm run typecheck`, `git status`, `pnpm -C . test`, `npm run build --prefix .`): 기록이 소스 파일(`src/a.ts`)뿐이면 모두 wait 없음. 결재 증가 없음. 단 `-C .`·`--prefix .`는 movesDir true라 모든 폴더 기록을 합치므로, 다른 폴더 기록이 있으면 같은 폴더 평소 명령도 늘 수 있다(드문 경우).

## 가정
- 직원의 실제 작업 폴더 = `s.cwd`와 같은 절대 경로.
## 대표 확인 필요
- 없음.
