# 리뷰 d25d58e — 한리뷰

## 판정
**수정 필요 (작은 1건)** — QA 5번 증상(부모 폴더가 있는 파일)은 고쳐졌다. 같은 종류의 빈틈이 "부모 폴더가 아직 없는 새 파일"에 남았다.
확인 방법: `WrittenStore.aliases`·`get`·`writtenWaitReason`을 실제 심볼릭 링크 폴더(/tmp/hrt2)로 직접 호출. 앱 흐름·typecheck·test 재실행은 하지 않았다.

## (1) 남은 빈틈
- **필수:** `aliases()`는 부모 폴더 realpath가 실패하면(`ENOENT`) 쓴 그대로만 기록한다. `Write`는 폴더를 새로 만들므로, `/tmp/…/proj/newdir/a.test.mts`처럼 **새 폴더 안 새 파일**이면 `/private/tmp/…`가 기록되지 않는다.
  - 재현(폴더 키 `/tmp`→`/private/tmp`): `/proj` 직원이 `newdir/a.test.mts`·`newdir/package.json`을 씀 → 하위 `/proj/newdir` 직원의 `pnpm test`·`npm test`는 **wait null(통과)**. 상위 `/proj` 직원은 wait(이름 비교가 맞음).
  - 권장: 존재하는 가장 가까운 조상까지 거슬러 올라가 realpath를 풀고, 남은 꼬리 경로를 붙인다(`while(dir!=='/')` 루프). 
- 파일 자체가 심볼릭 링크인 경우(링크 파일에 쓰면 실제로는 다른 곳이 바뀜)는 리프를 안 푼다. 위험 낮음, 필수 아님.
- 상대 경로 file_path는 그대로 기록되고, `get`이 폴더 키 기준으로 절대화하므로 문제 없다(도구는 보통 절대 경로).
- 확인된 정상: 부모 존재 + 하위 폴더 직원 `pnpm test` → wait. 링크 폴더(`/link/c.test.mts` → `/real`) 경유 파일, 직원 cwd가 링크든 실경로든 → wait.

## (2) 결재 증가·상한
- 두 번째 경로는 경로가 실제로 다를 때만 추가된다(`real !== p`). 둘은 같은 파일이라 wait 판단이 달라지지 않으므로 불필요한 결재 증가는 없다.
- 상한: 링크 폴더(macOS `/tmp`, `/var`) 아래에서는 파일당 2개가 쌓여 `WRITTEN_FILES_MAX=500`에 실질 250파일에서 닿는다. 닿으면 러너 wait(안전한 쪽). 드문 경우라 수용 가능. 걱정되면 상한 비교를 "서로 다른 파일 수" 기준으로 하거나 상한을 1000으로.

## (3) Bash 쓰기
- `recordBashWrite`는 별칭 처리가 없지만 필수는 아니다: 하지 않아도 `unplaced`+`runnable`이 켜져 하위 폴더에도 적용된다.
- 예외: 대상이 전부 `/tmp/`로 시작하면 `harmless`라 `unplaced`를 켜지 않는다(기존 동작). 이때 파일은 `/tmp/…` 그대로만 기록돼 실경로 비교는 안 맞지만, 명령에 절대 경로가 들어 있으면 `movesDir`가 모든 기록을 합쳐 글자로 맞추므로 잡힌다. 상대 경로로 부르는 하위 폴더 직원(`node scripts/x.mts`)이 놓칠 수 있어, 일관성을 위해 `recordBashWrite`의 절대 경로 대상에도 `aliases`를 적용하는 것을 **권장**(필수 아님).

## 가정
- 폴더 키는 `fs.realpathSync.native`(office.ts:350) 결과.
## 대표 확인 필요
- 없음. (자율 모드 훅이 `rm -rf /tmp/hrt` 정리를 막아 /tmp/hrt2, /tmp/hr 임시 파일이 남아 있다: `rm -rf /tmp/hrt2 /tmp/hr`)

---

# 재검토 — a5062de (한리뷰)

## 판정
**approve** — 필수 1건이 고쳐졌다. 확인 방법은 /tmp 심볼릭 폴더에서 `aliases`·`get`·`writtenWaitReason` 직접 호출이다. 앱 흐름·typecheck·test 재실행은 하지 않았다.

## (1) 재현 재확인
- `/tmp/…/proj/newdir/package.json`(newdir는 직원 cwd로 존재): 하위 `newdir` 직원의 `npm test` → **wait=build-script**. `newdir/a.test.mts`의 `pnpm test` → **wait=written-file**. 상위 직원도 wait.
- 새 폴더가 여러 단계(`a/b/c/new.test.mts`)여도 `/private/tmp/…/a/b/c/…`로 풀린다. 링크 폴더 아래 새 폴더(`link/n1/n2/f.mts` → `real/n1/n2/f.mts`)도 맞다.
- 주의(문제 아님): 하위 폴더가 **실제로 없는** 상태에서 조회하면 `key(cwd)`가 풀리지 않아 안 맞는다. 직원의 cwd는 존재하는 폴더라 실사용에서는 해당 없음.

## (2) 경계
- `/x.mts`·`/nonexistent_zz/x/y.mts`·`/`·`/tmp/`·상대 경로: 오류 없이 쓴 경로 하나만 반환. 무한 루프·빈 문자열 기록 없음.
- `//`·`..`·끝 `/`는 `normWrittenPath`로 정리된 뒤 풀려서 실경로가 깔끔하다(`/tmp//hrt2/proj//q.mts` → `/private/tmp/hrt2/proj/q.mts`). 루트까지 올라가는 경우도 `resolve('/')`의 끝 `/`를 떼고 꼬리를 붙여 정상.

## 권장 항목
- Bash 쓰기에 `aliases` 적용: **이번엔 불필요**. `unplaced`·`runnable`이 켜져 하위 폴더에도 적용되고, `/tmp/`만 쓰는 `harmless` 경우도 절대 경로 명령은 `movesDir`가 합쳐 잡는다. 남는 구멍은 상대 경로로 부르는 하위 폴더 직원이 `/tmp/` 대상 Bash 쓰기를 못 보는 경우뿐이고, 그 쓰기는 `harmless`로 판단된 것이라 감수 가능.
- 상한 조정: 불필요(닿으면 wait 쪽으로 안전).

## 가정
- 직원 cwd는 존재하는 폴더.
## 대표 확인 필요
- 없음. 임시 파일 정리(`rm -rf /tmp/hrt2 /tmp/hr`)는 자율 모드 훅이 막아 대표 확인 필요 목록에 남긴다.
