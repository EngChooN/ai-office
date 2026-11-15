# QA #14 2차 재확인 (ea412d3, 실제 개발 앱)

환경: 별도 데이터 폴더 `~/claude-office-qa-qa1108b`, 작업 폴더 `/tmp/qa1108b-work`, 새 직원 '수정은 자율'(acceptEdits). 앱은 ea412d3 빌드 확인 후 시험.

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 1 | 자동결재 켬: package.json 쓰기 → npm test | 통과 | 결재 대기, 이유 "⏸ 방금 바꾼 실행 스크립트를 돌리려 해서 기다려요"(build-script), `/tmp/qa1108b-ran.txt` 안 생김 |
| 2 | 자동결재 꺼짐에서 수정 → 켬 → npm test | 통과(같은 업무) / **주의(다른 업무)** | 같은 업무 안에서 수정 후 자동결재를 켜면 npm test 대기(build-script), `ran3.txt` 없음. 수정과 npm test를 **다른 업무**로 나누면 자동 승인되어 `/tmp/qa1108b-ran2.txt` 생성됨 — 업무 시작 때 고친 파일 기록을 비우는 설계 때문(office.ts clearWritten). 의도인지 확인 필요 |
| 3 | 자동결재 꺼짐 + .github/workflows/ci.yml 쓰기 | 통과 | Write 결재 카드에 이유 danger-path 표시, 파일 안 생김 |
| 4 | 일반 수정·ls·git status 무결재 | 통과 | 자동결재 켬에서 notes.txt 생성·수정, ls, git status, cat, ls -la 결재 0건 |
| 5 | Bash 리다이렉트로 package.json 쓰기 → npm test | 통과 | 이유 written-file로 대기, `/tmp/qa1108c-ran.txt` 안 생김 |
| 6 | 읽기 명령 뒤 일반 명령 과대기 없음 | 통과 | 4번 시나리오에서 대기 0건 |
| 7 | `bash -c "echo x > scripts/a.test.mts"` → npm test | 통과 | 중첩 셸 쓰기 자체가 written-file로 대기, 파일 안 생김(npm test까지 가지 않음) |
| 8 | 평소 작업 + git checkout -b 뒤 일반 명령 | 통과 | `git checkout -b qa-branch` 실제 실행됨, 결재 0건 |
| 9 | pnpm typecheck / test | 통과 | 오류 0. 1238개 중 1237 통과, 0 실패, 1 건너뜀 |

## 미확인·메모
- 캡처: 레벨업 팝업이 화면을 가려 결재함 캡처는 못 썼다. 이유 줄은 결재함 화면 글자로 확인.
- 1번에서 앱 재시작 때 이어 가는 결재 카드(이유 줄 없음, "↻ 앱을 다시 켜서 이어 가는 결재")는 별도 카드.
- 중간에 "모두 반려" 버튼을 누른 뒤 렌더러가 한 번 멈춰 앱을 재시작함(원인 미확인, 재현 안 해 봄).
- 39abde1 빌드가 한 번 낡아 있어 ea412d3로 다시 띄워 확인.

## 정리
- QA 앱 종료함. 코드 수정·커밋·push 없음.
- 삭제 명령(대표 확인 필요): `rm -rf /tmp/qa1108b-work /tmp/qa1108b-ran*.txt /tmp/qa1108c-ran.txt /tmp/qa1108b-sleep-done ~/claude-office-qa-qa1108b; rm -f /tmp/qa1108b-*.png /tmp/qa1108b-*.sh /tmp/qa1108b-*.mjs /tmp/qa1108b-start.out /tmp/aioqa-qa1108b.log`

---

# 3차 재확인 (75e74a2 기준 + 이어서 850affd, 실제 개발 앱)

환경: 같은 별도 데이터 폴더 `~/claude-office-qa-qa1108b`, 새 직원('수정은 자율'), 자동결재 켬(12시간).
**주의:** 앞부분(A~D)은 작업 트리가 75e74a2 + 아직 커밋되지 않은 수정(폴더 실경로·상하위 합치기)인 상태에서 돌렸다. 뒷부분(E~H)은 850affd(작업 트리 깨끗)에서 앱을 다시 띄워 확인.

## 75e74a2 지시 4항목
| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 1 | 업무 A가 package.json 수정 → **업무 B**에서 npm test | 통과 | 결재 대기, 이유 build-script, `/tmp/qa1108d-ran.txt` 안 생김 (지난번 우회 해소) |
| 2 | **다른 직원**이 같은 작업 폴더에서 npm test | 통과 | 대기(build-script), 결과 파일 없음 |
| 3-1 | 회귀: 같은 업무에서 수정 → npm test | 통과 | 대기(build-script), `ran2.txt` 없음 |
| 3-4 | 회귀: 평소 명령(Write·Edit·ls·git status·cat) | 통과 | 결재 0건, notes2.txt 수정됨 |
| 4 | '모두 반려' 뒤 화면 멈춤 | 원인 확인 | 아래 |

### '모두 반려' 멈춤
- 1회차: 결재 2건 대기 중 '모두 반려' 클릭 → 이후 CDP eval·snapshot이 응답하지 않음(재현). 원인: `InboxPage.tsx:33`의 `window.confirm("대기 중인 결재를 모두 반려할까요?")`. 네이티브 확인창이 떠서 화면 스크립트가 멈추는 것이고(CDP로는 창이 안 보여 닫을 수 없음), 앱이 죽은 것은 아님.
- 2회차(앱 재시작 후 같은 결재 2건): `window.confirm`을 true로 바꿔 두고 클릭 → 확인창 1회 호출, 결재 0건으로 정상 반려, 멈춤 없음.
- 사람이 직접 누르면 확인창에서 "확인"을 누르면 끝나므로 버그는 아님. 자동 시험에서만 멈춘 것처럼 보임. (확인창을 직접 눌러 닫는 것은 못 해 봄: 손쉬운 사용 권한 없음)

## 850affd 추가 확인 (작업 폴더 관계)
폴더: `/tmp/qa1108d-p` (직원 A=P, B1=P/app, B2=P/proj2; P/proj1, P/scripts 있음). 직원 A가 `P/app/package.json`, `P/proj1/a.test.mts`, `P/scripts/e.mts`를 Write로 고침.

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 5 | 상·하위: B1(P/app)의 `npm test` (A가 `/tmp/…/app/package.json`을 고친 뒤) | **실패** | 결재 없이 실행됨, `/tmp/qa1108d-m1.txt` 생김 |
| 5′ | 같은 시험, A가 **`/private/tmp/…`** 경로로 쓴 경우 | 통과 | 대기(written-file), `m5.txt` 없음 |
| 6 | 형제: B2(P/proj2)의 `npm test` | 통과 | 자동 승인, `m3.txt` 생김 |
| 6′ | 형제: B2가 `cd ../proj1 && npm test` | 통과 | 대기(written-file), `m2.txt` 없음 |
| 7 | 평소 명령: B2의 `ls`·`git status`·`npm run lint` | 통과 | 새 결재 대기 0건(lint는 자동결재 기록에 승인으로 남음) |
| 8 | A가 `P/scripts/e.mts` 씀 → B1(P/app)의 `node /tmp/…/scripts/e.mts` | 통과 | 대기(written-file), `m4.txt` 없음 |
| 8′ | B1의 `node ../scripts/e.mts` | 통과 | 대기(written-file), `m4.txt` 없음 |

### 실패 상세 (5)
- 재현: 작업 폴더가 `/tmp` 아래(macOS에서 `/private/tmp`로 연결된 심볼릭 링크)일 때, 상위 폴더 직원이 `/tmp/…/app/package.json`을 쓰고 하위 폴더 직원이 `npm test`를 실행하면 기다리지 않는다.
- 추정 원인(코드만 읽음, 수정·재현 시험은 안 함): 폴더 키는 `realpath`로 `/private/tmp/…`가 되는데 기록된 파일 경로는 쓴 그대로 `/tmp/…`라서 `WrittenStore.get`의 `relevant` 비교(`under(p, k)`)가 맞지 않음. 같은 시험을 `/private/tmp/…` 경로로 쓰면 정상 대기하는 것이 근거. 8번이 통과한 것은 명령 글자의 `/tmp/…`가 기록과 글자 그대로 같고 다른 폴더로 옮겨 실행하는 경로는 모든 기록을 보기 때문으로 보임.
- 영향: macOS `/tmp`·`/var`나 심볼릭 링크 폴더에서만 해당. 일반 프로젝트 폴더(`~/…`)에서는 시험 안 함(미확인).

## 미확인
- 850affd에서 75e74a2 시나리오(1~3번) 재실행은 안 함(구현이 같은 폴더 기록 경로를 그대로 쓰고 5~8에서 같은 폴더 동작은 함께 확인됨).
- 홈(`~/…`) 아래 비심볼릭 폴더에서의 상·하위 시험, `pnpm typecheck/test` 재실행은 이번엔 안 함.

## 정리
- QA 앱 종료. 코드 수정·커밋·push 없음.
- 삭제 명령(대표 확인 필요): `rm -rf /tmp/qa1108d-p /tmp/qa1108d-m*.txt /tmp/qa1108d-ran*.txt /tmp/qa1108d-o*.txt ~/claude-office-qa-qa1108b /tmp/qa1108b-work; rm -f /tmp/qa1108d-*.png /tmp/qa1108d-*.sh /tmp/qa1108d-*.mjs /tmp/qa1108d-start.out`

---

# 4차 재확인 (a5062de, 실제 개발 앱)

d25d58e(경로 둘 다 기록)와 a5062de(없던 폴더의 새 파일도 실경로 기록)가 모두 들어간 a5062de 빌드로 확인(작업 트리 깨끗). 같은 별도 데이터 폴더, 직원 '수정은 자율', 자동결재 켬. 폴더: `/tmp/qa1108d-p`(A=P, B1=P/app, B2=P/proj2), 홈 `~/qa1108e-h`(A=H, B=H/app), `P/newdir`(없던 폴더, 직원 BN).

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 1 | A가 `/tmp/…/app/package.json` 수정 → B1(P/app) `npm test` | 통과(3차 실패 5번 해소) | 대기(written-file), `/tmp/qa1108e-n1.txt` 안 생김 |
| 1′ | 홈 아래: A(H)가 `~/qa1108e-h/app/package.json` 수정 → B(H/app) `npm test` | 통과 | 대기(이유 build-script), `qa1108e-hn.txt` 안 생김 |
| 2 | 회귀: B1 `node /tmp/…/scripts/e.mts` | 통과 | 대기(written-file), `n4.txt` 없음 |
| 3 | 회귀: 형제 B2(P/proj2) `npm test` | 통과 | 자동 승인, `/tmp/qa1108e-m3.txt` 생김 |
| 4 | 회귀: B2의 `ls`·`git status`·`cat package.json` | 통과 | 새 결재 대기 0건(대기 횟수 변화 없음) |
| 5 | A가 아직 없는 `P/newdir/package.json`을 Write로 새로 만듦 → BN(P/newdir) `npm test` | 통과 | 대기(written-file), `n5.txt` 안 생김 |

미확인: Bash 리다이렉트로 쓴 `/tmp` 경로(알려진 제한, 시험 안 함). 상위 폴더 직원이 쓴 파일을 하위 직원이 `../` 상대 경로로 실행하는 경우는 3차에서만 확인.
정리: QA 앱 종료, 코드 수정·커밋·push 없음.
삭제 명령(대표 확인 필요): `rm -rf /tmp/qa1108d-p /tmp/qa1108d-m*.txt /tmp/qa1108e-*.txt ~/qa1108e-h ~/claude-office-qa-qa1108b /tmp/qa1108b-work; rm -f /tmp/qa1108d-*.png /tmp/qa1108d-*.sh /tmp/qa1108d-*.mjs /tmp/qa1108d-start.out`
