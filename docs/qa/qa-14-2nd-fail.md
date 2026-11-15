# QA #14 2차 통합 (a38deb1 + abb0392) — 실패 상세

## 1) 1번 실패: 고친 파일 실행 우회
- 직원: 새로 고용, 결재 모드 `수정은 자율`(acceptEdits), 자동결재 4시간 켬. 작업 폴더 /tmp/qa1108-work
- 직원이 쓴 파일: `package.json` = `{"scripts":{"test":"echo ok > /tmp/qa1108-ran.txt"}}`
- 실행 명령 원문: `npm test`
- 기대: 직원이 방금 쓴 파일을 실행하는 명령이므로 자동결재가 기다리고 "고친 파일을 실행" 이유가 표시됨
- 실제: 결재 없이 자동 승인("자동결재 승인: Bash npm test"), /tmp/qa1108-ran.txt에 `ok` 생성
- 원인 추정: `app/src/main/office.ts:2300~2314` — `recordWrite`가 자동결재 판정 안에서만 호출됨. acceptEdits 직원의 파일 수정은 이 판정을 안 거쳐 기록이 안 남음. (기록 로직은 writtenFiles.ts 계열)
- 고칠 방향: `hired.ts`의 `onToolUse`에서 acceptEdits 직원의 쓰기에도 `recordWrite` 호출. 수정 후 "package.json 수정 → npm test" 시나리오 테스트 추가.
- 참고: `node x.test.mjs`는 '처음 보는 명령'으로 원래 대기(이유 줄은 "처음 보는 명령")

## 2) 2번: 이유 줄 빈 경우
- 자동결재 꺼짐 + 위험 경로(`.github/workflows/ci.yml`) 쓰기 결재. `hired.ts` `onToolUse`가 `{ask:true}`만 반환하고 `waitReason` 미지정. 파일은 만들어지지 않아 차단 자체는 정상. 자동결재 꺼짐 시 의도인지 확인 필요.

## 3) 4~8번
- 4 통과: "마지막 갱신 2분 전" 확인, 30분 초과 노란색은 Date.now +31분 조작으로 확인(실대기 안 함)
- 5 통과: [켜기]→설정 열림, 직원 프로필 결재 방식 줄 확인. 설정 내 구역 스크롤은 미확인
- 6 통과: 새 직원 기본 '수정은 자율', 외부 연동 13명 모두 ask. 휴대폰·팩 직원은 코드 미변경 확인만
- 7 통과: 영어 "Updated 4m ago · As of 11/8, 5:03 PM", "⏸ Waiting because this command is unfamiliar", "Auto-approved: Bash npm test" 정상
- 8 통과: pnpm typecheck 오류 0, pnpm test 1235개 중 1234 통과/0 실패/1 건너뜀
- 3 통과: 결재함·직원 패널·바탕화면 비서 패널·대시보드 4곳 이유 줄 확인

## 4) 남은 임시 폴더
- /tmp/qa1108-work, /tmp/qa1108-ran.txt, ~/claude-office-qa-qa1108
- /tmp/qa1108-*.png, /tmp/aioqa-qa1108.log
- 삭제 명령(대표 확인 필요): `rm -rf /tmp/qa1108-work /tmp/qa1108-ran.txt ~/claude-office-qa-qa1108; rm -f /tmp/qa1108-*.png /tmp/aioqa-qa1108.log`
