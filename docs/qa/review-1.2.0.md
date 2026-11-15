# 리뷰 — 1.2.0 묶음 (한리뷰)

## 판정
- **#10 MCP 대기 (613a3b4): approve** (권장 2건)
- **후원 (미커밋 DonateButton/Sidebar/featuresB): approve** (권장 2건)
- **토큰 절약·직원 브라우저: 리뷰 불가** — 커밋도 코드도 없음(설계 보고만). 구현이 올라오면 이어서 본다.

확인 방식: diff와 호출처 grep으로 읽음. 앱 실행·테스트 재실행은 하지 않음(강백엔 보고의 typecheck/테스트 통과를 가정).

## 1) #10 MCP 대기 — 고칠 목록
필수: 없음. 기존 직원 설정은 바뀌지 않음.
- [권장] `officeHandlers.ts:91,188` — 패널 지시·대화방 지시만 기다림. 비서 질문 경로(`secretary.ts:437`, `registerLocalMcp('secretary')`)는 그대로라 시작 직후 비서에게 물으면 같은 오류가 날 수 있음. 같은 `needMcp`를 비서 질문 핸들러에도 붙이거나 보고서에 "비서는 미적용"을 남길 것. (담당: 강백엔)
- [권장] `localMcp.ts` `stopLocalMcp` — 시작 중(`starting`)일 때 stop이 불리면 이후 `listen` 콜백이 서버를 되살림. 종료 흐름에서만 생기는 드문 경우라 필수 아님.
- 확인함: 시작 실패 시 `starting` 비워 재시도됨, 타임아웃 타이머 정리됨, `mcp.notReady` 4개 언어 모두 있음, `index.ts:398` 기존 await와 중복 시작 안 됨(같은 약속 공유).

## 2) 후원 — 고칠 목록
필수: 없음.
- 외부 링크: `window.open(https://fairy.hada.io/)` → `index.ts:314` `setWindowOpenHandler`가 `https://`만 `shell.openExternal`로 열고 앱 창은 deny. **기본 브라우저로 열림 확인.** 피드백 버튼과 같은 방식.
- 4개 언어: `sidebar.donate` ko/en/ja/zh 모두 있음. 키 누락 없음.
- [권장] `featuresB.ts:722` — `sidebar.donate`가 `settingsPage.guide.*` 키 묶음 한가운데(feedback과 feedbackPrompt 사이)에 끼어 있음. 읽기 흐름이 끊기니 `settingsPage.guide.feedbackPrompt` 뒤나 사이드바 키 근처로 옮길 것. (담당: 후원 작업자)
- [권장] 사이드바 `FeedbackButton`은 `mt-1`이 있고 `DonateButton`은 없어 두 버튼 간격이 붙음. 의도면 무시, 아니면 화면에서 확인. 화면은 보지 못함.
- 후원 URL이 코드에 하드코딩. 바뀔 일이 적어 현재는 괜찮음.
- 주의: 후원 파일은 아직 미커밋(`DonateButton.tsx`는 untracked). 커밋 때 `git add`에서 빠지지 않게 할 것.

## 3) 아직 리뷰하지 못한 것 (구현 도착 후 볼 항목)
토큰 절약:
- 절약 모드는 **새 직원 고용 기본값(HireDialog)에서만** 적용되는지, `updateStaff`/기존 직원 데이터를 건드리지 않는지
- "아끼기" 버튼이 누른 직원 한 명의 model/memory만 바꾸고 되돌리기가 이전 값으로 복원되는지, `default` 모델 직원 처리
- 4개 언어 키, Settings 타입 한 줄 추가가 `acceptEdits` 기본값 작업과 충돌하지 않는지
직원 브라우저:
- 공용 프로필 켜면 `output/` 스크린샷이 직원별로 남는지(프로필만 공용)
- 동시 사용 충돌: 두 직원이 같은 `_shared/profile`을 동시에 열 때 차단·안내가 있는지, 세션 종료 뒤에도 크롬 프로세스가 남아 표시가 풀리지 않는 경우
- 켜고 끌 때 기존 폴더를 지우거나 옮기지 않는지
- 안내 문구 4개 언어, 내 크롬 연결 문서의 보안 경고

## 담당자 전달
- 강백엔: 위 1)의 권장 2건(비서 경로, stop 경합)은 선택. 꼭 하지 않아도 됨.
- 후원 작업자: 위 2)의 키 위치·간격 확인(권장).
- 박패턴·최가독 구현 담당: 구현 완료 후 이 문서 3)을 기준으로 재요청.

---

# 2차 리뷰 — 토큰 절약(d3a1526) · 직원 브라우저+비서 MCP 대기(9b7cbc5)

확인 방식: diff·호출처 읽기. 앱 실행, typecheck·테스트 재실행은 하지 않음(커밋 작성자 보고를 가정).

## 판정
- **토큰 절약 (d3a1526): approve** (참고 2건)
- **직원 브라우저 (9b7cbc5): 수정 필요** (필수 1건, 권장 2건)
- **비서 MCP 대기 (9b7cbc5): approve**

## 토큰 절약
- 새 직원 기본값에만 적용됨: `office.ts:899-901` `hire()`가 `input.model`이 비었을 때만 haiku, `input.memory`가 없을 때만 short를 채움. `updateStaff`·기존 직원 경로는 건드리지 않음. 연습 직원은 제외. 고용 창 초기값도 `hireDefaults`로만 채움(`HireDialog.tsx:102-105`).
- 기억은 `db.updateStaffRow`로 저장하고 메모리의 staff에도 `...input`으로 들어감. 저장된 값이 'normal'이면 컬럼을 비워 둠(기존 규칙과 동일).
- 아끼기는 누른 직원 한 명의 값만 `updateStaff`로 바꾸고, 되돌리기는 직전 값으로 복원. default 모델·Codex 모델 제외, 비서·원격·퇴사자 제외.
- remote/v2: `hire.memory`, `updateSettings.tokenSaverMode` 허용 추가는 안전. 잘못된 memory 문자열이 와도 `rotateLimits`가 보통으로 처리하고, `updateStaff.memory`는 이미 원격 허용이었음. tokenSaverMode는 비용을 줄이는 쪽 설정이라 폰에서 켜도 위험 없음.
- 4개 언어: `tokenSaving.ts` 15개 키가 ko/en/ja/zh 각각 15개로 일치. 사전 합치기에도 등록됨.
- [참고] AI 비서가 직원을 고용할 때는 프롬프트 지침상 model을 `"default"`로 명시해 보내므로 절약 모드가 적용되지 않음("빈 값에만" 요구에는 맞음). 비서 고용도 절약하려면 별도 결정 필요.
- [참고] `TokenSaverTop3`는 직원이 모두 default 모델·보통 기억이면 항상 숨겨짐. 실제 직원 분포는 앱에서 확인하지 못함.

## 직원 브라우저
- 프로필만 공용: `browserProfilePath`가 `browser/_shared/profile`, `output/`은 계속 `browserOutputDir(staffId)`(직원별) — 스크린샷이 섞이지 않음. 기존 직원별 폴더는 이동·삭제하지 않음. 원격 `updateSettings`에서 `sharedBrowserLogin` 제외 확인.
- 4개 언어: `equip.browser.*`, `staff.browser.sharedBusy` 모두 4개 언어 있음.
- 두 번째 직원 거절: `equippedMcp`(세션 시작 시 1회)에서 `claim` 실패하면 브라우저를 붙이지 않고 `browserBlocked`에 넣어 직원 안내문(`staff.browser.sharedBusy`)을 줌. 동작 구조는 맞음.

### 필수 수정 (담당: 강백엔)
- [ ] **해제 시점이 실사용과 어긋날 수 있음** — `office.ts:2676` 락은 "사용 중 직원의 세션이 닫히면" 풀림. 그런데 직원 세션은 일을 끝내도 열린 채로 남는 구조로 보임(`hired.ts`에서 세션을 닫는 곳은 해고·강제중단·실패·재시작뿐, 유휴 종료는 찾지 못함). 그러면 공용 로그인을 한 번이라도 쓴 직원이 앱을 다시 켜기 전까지 다른 직원 브라우저를 계속 막음. 해결 방안 중 하나를 정해 반영: ① 해당 직원 턴이 끝나 유휴가 되면 락을 풀고 MCP(크롬)도 닫음, ② 막힌 직원 안내에 "누가 쓰는 중이고 어떻게 풀리는지" 담고 대표가 풀 수 있는 방법 제공, ③ 실제로 유휴 종료가 이미 있다면 그 근거를 보고에 남김. 개발 앱에서 직원 A가 브라우저 사용 후 직원 B가 시도하는 흐름을 직접 확인하고 결과를 보고할 것(이 리뷰에서는 실행하지 못함).

### 권장
- [ ] 막힌 직원이 나중에 락이 풀려도 현재 세션에서는 브라우저가 계속 없음(`browserBlocked`는 다음 세션 시작 때만 갱신). 안내문에 "세션을 새로 시작하면 쓸 수 있어요" 정도를 덧붙이면 좋음.
- [ ] `browserBlocked`·락 기록은 해고된 직원이 남기면 정리되지 않음(메모리뿐, 영향 작음).

## 비서 MCP 대기
- `secretary.ts` `answer()` 앞부분에서 `whenLocalMcpReady()` 실패 시 `mcp.notReady` 오류 메시지를 남기고 return → `next()`가 이어서 다음 질문을 처리하고 `isBusy`가 풀림. 문제 없음.

## 필수 수정 요약 (보고용)
1. (강백엔) 공용 브라우저 락 해제 시점: 유휴 세션이 열려 있어 다른 직원이 계속 막힐 수 있음 — 위 항목.
토큰 절약(정리드)은 필수 수정 없음.

## 확인 못 한 것
앱 실행·화면, 실제 크롬 동시 실행 충돌, 세션 종료 후 Playwright MCP·크롬 프로세스가 같이 끝나는지, 토큰 절약 화면(Top3) 표시.

---

# 3차 재리뷰 — 공용 브라우저 락 해제 (커밋 4d897e0)

## 판정
**approve** (필수 수정 없음)

## 확인한 내용 (diff·호출 흐름 읽기 + 신규 테스트 4건 실행 통과)
- **진행 중 턴 보호:** 세션 닫기는 `applyPendingRestart()`에서만 일어나고, 맨 앞에서 `isRunning`이면 바로 return. 결재 대기는 턴 도중에만 생기므로 함께 보호됨. 턴 끝 직후 대기 중인 다음 업무(`rt.queued`)가 있으면 `isRunning`이 true라 닫지 않음.
- **백그라운드 작업:** `backgroundTasks.length === 0`일 때만 닫음(함께 죽는 것 방지).
- **예약 업무:** 한가할 때만 닫고, 이후 예약 업무가 오면 기존 `send` → 이어받기 경로로 세션을 다시 엶. 닫는 동안 끊기는 일 없음.
- **공용 모드 꺼짐 = 기존 동작:** 락을 잡는 곳(`claim`)이 공용 모드일 때만 실행됨. 꺼져 있으면 보유자·막힘 기록이 없어 `releaseBrowser`가 false → 세션을 닫지 않음(테스트로도 확인).
- **대화 이어짐:** `closeSession()`은 `rt.close()`만 하고 `staff.sessionId`를 지우지 않음. 다음 지시 때 `resumeId: s.sessionId`로 이어 엶(장비 변경 `restart()`와 같은 경로).
- **해고 정리:** `fire`·전체 정리 두 경로 모두 `releaseBrowserFor` 호출. 지난번 권장 사항(해고 시 기록 정리)도 해결됨.
- **안내문:** 4개 언어 모두 갱신됨.

## 참고 (필수 아님)
- 공용 모드에서는 브라우저를 쓴 직원이 **턴마다** 세션을 닫고 다시 여는 구조라, 다음 지시 때 재시작 시간이 조금 더 걸리고 프롬프트 캐시 이점이 줄 수 있음. 요구한 동작이라 감수 범위.
- 대기 상태인 직원도 락이 없는 상태에서 `pendingRestart` 분기에서는 `releaseBrowser`를 호출만 하고 영향 없음.

## 확인 못 한 것
앱 실행, 직원 A→B 실제 크롬 전환, 세션 종료 시 Playwright MCP·크롬 프로세스 종료 여부.
