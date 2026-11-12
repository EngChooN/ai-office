# 코드 리뷰 — 결재 카드 '효과 줄' 2차 (한리뷰, Round 1)

## 판정: **revise** (필수 3건)
작업 트리 코드를 읽어 확인했습니다. 시험·tsc는 직접 돌리지 않고 보고된 1406 통과·실패 0을 따랐고, 화면 동작은 보지 못했습니다. ChatPage·StaffPanel·SecretaryChat·NewManualDialog·featuresA는 범위 밖이라 보지 않았습니다.

## 필수 수정
1. **`mv`/`cp`의 `-n` 판정이 틀릴 수 있어 "건너뛰어요"를 잘못 단정** — `approvalEffect.ts` `moveEffect`
   `noClobber ||= a.includes('n')`이라 `mv -n a b -f`나 `cp -n -f a b`도 "같은 이름이 있으면 건너뛰어요"가 나옵니다. mv·cp는 `-f`/`-i`/`-n` 중 **마지막 것만** 적용합니다(macOS man: "-f overrides any previous -i or -n"). 실제로는 덮어쓰는데 안전하게 읽힙니다. 결정 4번(안전을 단정하지 않는다) 위반입니다.
   → 묶음 플래그(`-fn`)까지 앞에서부터 훑어 `f`/`i`/`n` 중 마지막 글자로 정하고, 마지막이 `n`일 때만 Keep을 씁니다. `-n -f`, `-fn`, `-nf`, `-n -i` 시험을 넣어 주세요.
2. **`sudo -u 사용자 명령`에서 안쪽 명령의 낱말이 사라짐** — `approvalGuess.ts` `hintVerbs`
   `sudo`는 `WRAPPER_SPECS`에 없어(`doas`만 있음) 직접 벗기는 분기로 갑니다. 그런데 `args.findIndex(x => !x.startsWith('-'))`가 `-u`의 값 `root`를 명령으로 잡아 `sudo -u root rm -rf /x`가 '시스템 설정·권한 변경'만 보이고 '삭제'가 빠집니다. 위험을 덜 보이게 하는 경우입니다. 또 앞의 `via.some(w => w === 'sudo' || …)`의 `sudo`는 도달하지 않는 코드입니다.
   → `commandScan.ts`에 `sudo: { flags: ['-n','-E','-H','-S','-k', …], values: ['-u','-g','-C','-h','-p','-r','-t','-T','-U'] }`를 추가해 래퍼로 풀거나, 값을 받는 옵션을 건너뛰도록 고쳐 주세요. `sudo -u root rm -rf x` → 삭제+시스템 시험 필요합니다.
3. **레이트 리밋 쉬기가 연결되지 않음** — `office.ts` `effectAi`
   결정 10번은 "레이트 리밋이면 쉬기"인데 `createApprovalEffectAi`의 `isPaused`를 넘기지 않아 한도에 걸려도 결재가 올라올 때마다 호출합니다(실패 캐시는 같은 명령만 막음). 이미 있는 한도 판정(`planUsage`·`checkPlanUsage`가 쓰는 보류 판단)에 맞춰 `isPaused`를 연결해 주세요.

## 권장 (필수 아님)
- `hintVerbs`가 `git -C dir …`·`git -c k=v …`처럼 전역 옵션이 앞에 오면 하위 명령을 못 봅니다(`git -C x reset --hard`가 낱말 없음). 또 `git rm`·`git branch -D`·`git stash drop`이 빠져 있습니다. 옵션(`-C <값>`, `-c <값>`)을 건너뛴 뒤 판정하고 `rm`→delete를 넣으세요. 현재는 AI가 켜져 있을 때만 메워집니다.
- `isReadOnlyArgs`: `sort --compress-program=…`은 프로그램을 실행합니다. `--compress-program`·`-T`도 막으면 "바꾸지 않아요"가 더 정확합니다. `file -C`도 같은 종류(드묾).
- `aiGuessPrompt`: 명령 안에 `CMD>>>`가 있으면 데이터 구역을 닫고 지시를 끼울 수 있습니다. 도구는 꺼져 있고(`tools: []`) AI는 낱말을 더하기만 하므로 피해는 대상 이름·낱말 추가 정도지만, 닫는 표지를 명령에서 치환해 두면 좋습니다.
- `SOFTENING`은 단어 목록이라 완곡 표현을 다 못 거릅니다(대상 이름이 30자 이하·마스킹이라 위험은 작음). 시험에 "대상이 위험을 낮추면 버림" 케이스를 하나 두세요.

## 점검해 본 것 (문제 없음)
- **mergeGuess**: 최종 낱말 = `hintVerbs ∪ AI`라 AI가 뺄 수 없습니다. `read`는 읽기 전용 목록(`isReadOnlyChain`)이 보증할 때만 남고, 빈 결과는 '확인 못 함'으로 내려갑니다. `unsure`면 대상 이름을 숨깁니다.
- **parseAiGuess**: 잘못된 모양·알 수 없는 낱말·숨은 글자·긴 대상은 버리거나 null입니다.
- **office.ts**: 결과 도착 시 `s.approvals`에서 같은 id를 다시 찾아, 이미 처리돼 사라졌으면 버립니다(저장·알림도 안 함). 저장은 `persistApproval`, 복원은 `toRestoredApproval`로 `effectGuess`가 이어지고 `isRestored`는 AI를 새로 부르지 않습니다. 사용량은 결재를 올린 직원(`a.staffId`) 몫이며 캐시 적중·합쳐진 요청은 기록하지 않습니다. `askOnce`는 `tools: []`·`maxTurns: 1`·8초 시간 초과로 막혀 있습니다.
- **ApprovalSummary**: `approvalSummaryView`로 분기하고, 결과 불명·AI 추정 줄 옆에서는 원문을 펼쳐 둡니다.
- **사전**: 4개 언어가 모두 있고 짝이 맞습니다. 읽기 전용 줄만 '바꾸지 않아요'이고 덮어쓰기 경고가 붙습니다. `git clean -n`류의 "지우지 않아요"는 git에서 `-n`이 우선이라 맞습니다.
- 잔여물: `console.log`·미사용 import는 보이지 않았습니다.

## 다음 단계 지시
필수 1~3만 다음 라운드에서 고치고, 각각 시험(`mv -n -f` 계열, `sudo -u … rm`, `isPaused` 연결)을 추가해 주세요. 권장은 여유가 있을 때 하세요.

## Round 1 반영 (정리드)
1. `moveEffect`: 묶음 포함 앞에서부터 훑어 `f`/`i`/`n` 중 마지막 글자로 판정, 마지막이 `n`일 때만 Keep. `-i`가 마지막이면 덮어쓰기 문장(보수적).
2. `hintVerbs`: `WRAPPER_SPECS`에 sudo를 넣으면 commandScan 전체(자동 허용 판정 등)에 영향이 가서 넣지 않았고, `hintVerbs` 안에서 `SUDO_VALUES`(-u·-g·-C·-h·-p·-r·-t·-T·-U·-D·-R·긴 이름)를 값까지 건너뛰도록 고침. 도달하지 않던 `via`의 sudo 검사 제거(doas만 남김).
3. `office.ts` `effectAi`에 `isPaused: () => this.currentHold('claude').isHeld` 연결 — 예약·보드 자동 진행과 같은 보류 판정.
- 시험 3개 추가(`mv -n -f` 계열 10건, `sudo -u … rm` 6건, planHold 연동 isPaused). tsc 통과, 전체 1410 중 1409 통과·실패 0·건너뜀 1.
- 권장 4건은 이번 라운드에서 손대지 않음.

---

# 코드 리뷰 — Round 2 (한리뷰)

## 판정: **approve**
필수 3건 모두 맞게 고쳐졌고 새 회귀는 보이지 않습니다. 시험·tsc는 직접 돌리지 않고 보고된 1409 통과·실패 0을 따랐습니다.

## 필수 3건 확인
1. **mv·cp `-n`**: `moveEffect`가 묶음 플래그도 글자 단위로 앞에서부터 훑어 `f`/`i`/`n` 중 마지막 것을 `clobber`로 두고, `n`일 때만 Keep을 씁니다. `-n -f`·`-nf`·`-n -i`는 덮어쓰기 문장, `-i -n`·`-fn`은 건너뛰기 문장이라 man 동작과 맞습니다. `-i`가 마지막이면 덮어쓰기 문장이라 보수적입니다. 시험 10건이 이 경우들을 덮습니다.
2. **sudo**: `SUDO_VALUES`로 값을 받는 옵션은 값까지 건너뛰고, `--`도 처리해 `sudo -u root rm -rf x`가 삭제+시스템으로 나옵니다. `WRAPPER_SPECS`에 넣지 않은 이유(자동 허용 판정 영향)도 타당합니다. 도달하지 않던 sudo 검사는 제거됐고 doas는 래퍼로 풀려 `via`에서 잡힙니다.
3. **isPaused**: `currentHold('claude').isHeld`가 `planHold`(우회 시각 포함)를 쓰는 기존 보류 판정과 같습니다. 보류 중이면 호출하지 않고 풀리면 다시 부르는 시험이 있습니다.

## 권장 (필수 아님)
- 앱 기본 AI가 Codex(GPT)일 때 `askOnce`는 Codex 쪽으로 가는데 `isPaused`는 Claude 보류만 봅니다. `jobProvider`처럼 쓰는 엔진 기준(`currentHold(엔진)`)으로 맞추면 정확합니다.
- `approvalGuess.ts:28` `new Set` 앞 공백(`GIT_MODIFY =new Set`)이 빠져 있습니다. 포매터가 잡을 수 있으니 정리하세요.
- `sudo -E VAR=x cmd`·`sudo -i/-s`는 안쪽 명령을 못 읽어 '시스템'만 나옵니다(위험을 낮추지는 않음). Round 1의 권장 4건(git 전역 옵션·`git rm`, `sort --compress-program`, `CMD>>>` 표지, 완곡 표현 시험)도 그대로 남아 있습니다.

## 다음 단계 지시
구현 완료. 사용자에게 PR 작성 권한 넘김.

## 권장 4건 반영 (정리드, 대표 지시: 권장까지 고친 뒤 커밋)
1. `hintVerbs` git: 전역 옵션(`-C`·`-c`·`--git-dir` 등 `GIT_GLOBAL_VALUES`는 값까지)을 건너뛴 뒤 하위 명령 판정. `git rm`·`git branch -d/-D/--delete`·`git stash drop/clear` → 삭제.
2. `isReadOnlyArgs`: `sort --compress-program`·`-T`/`--temporary-directory`, `file -C`/`--compile`도 읽기 전용에서 제외.
3. `aiGuessPrompt`: 명령 안의 `<<<CMD`·`CMD>>>`를 `[CMD]`로 바꿔 데이터 구역을 닫지 못하게 함.
4. 시험: 영어 완곡 대상("harmless temp files") 버림 케이스 추가.
- 시험 3개 추가. tsc 통과, 전체 1413 중 1412 통과·실패 0·건너뜀 1.

---

# 코드 리뷰 — Round 3 (한리뷰)

## 판정: **approve**
권장 4건 반영분만 읽었고 새 회귀는 보이지 않습니다. 시험·tsc는 직접 돌리지 않고 보고된 1413 중 1412 통과·실패 0을 따랐습니다.

## 확인
1. **git 전역 옵션**: `GIT_GLOBAL_VALUES`는 값을 받는 옵션만 2칸, 나머지 `-`로 시작하는 토큰은 1칸 건너뜁니다. `--git-dir=x`처럼 붙여 쓴 형태도 1칸이라 맞습니다. `git rm`·`branch -d/-D/--delete`(묶음 `-vd` 포함)·`stash drop/clear`는 삭제로 판정됩니다.
2. **읽기 전용 제외**: `sort`의 `-o`·`-T`·`--compress-program`·`--temporary-directory`, `file`의 `-C`·`--compile`이 제외됩니다. 정규식이 `-k2`처럼 숫자가 낀 옵션은 잡지 않아 과잉 제외는 없습니다.
3. **표지 치환**: `<<<CMD`·`CMD>>>`를 `[CMD]`로 바꾼 뒤 감싸서 데이터 구역을 닫을 수 없습니다.
4. **시험**: `권장:` 3개가 위 세 경우와 완곡 대상 버림을 덮습니다.

## 권장 (필수 아님)
- `approvalGuess.ts:28`의 `GIT_MODIFY =new Set` 공백은 Round 2 권장 그대로입니다. 커밋 전에 정리하면 좋습니다.

## 다음 단계 지시
구현 완료. 사용자에게 PR 작성 권한 넘김.
