# 비개발자 눈높이 검토 (2026-11-02, 기준 0.19.2)

세 가지 검토를 합쳤습니다. 모두 코드와 사전 파일만 읽은 검토이고, 앱을 띄워 확인하지는 않았습니다.
- **A** 화면 문구: common·shell·main·settings·staff·board·tools·autonomy·memory·update·peer* 사전
- **B** 화면 문구: featuresA·featuresB·artifact·deskPet·gallery·game·knowledge·logs·pack·sceneExport·secretary 사전
- **C** 처음 쓰는 흐름: 첫 실행 마법사 → 고용 → 첫 일 → 결재 → 결과 확인

---

## 한눈에: 먼저 고칠 것

| 순위 | 문제 | 근거 |
|---|---|---|
| 1 | **Claude 로그인이 터미널 글자 화면에 의존함.** 무엇을 고르는지 안내가 없고, 유료 계정이 필요하다는 사실도 로그인 단계에서야 처음 나옴 | C-1, C-2 |
| 2 | **첫 실행에서 선택 사항인 '설치' 단계가 맨 앞에 나옴.** `curl … \| bash` 명령이 보이고, "로그인에 쓰여요"라는 사실과 다른 문구가 있음 | C-3, C-12 |
| 3 | **고용 뒤 첫 지시와 결재함으로 가는 길이 없음.** 빈 직원 패널, 결재함을 거치지 않는 첫 업무, 건너뛰면 안내를 다시 볼 방법을 모름 | C-4, C-5, C-15 |
| 4 | **같은 개념을 여러 이름으로 부름.** 정할 용어 목록은 아래 '용어 통일안' | A·B 공통 |
| 5 | **안전·권한 안내가 명령어로 쓰여 있음.** 장비 프리셋, 자동결재 범위, 자동 승인 규칙. 판단해야 할 사람이 내용을 읽을 수 없음 | B-5, B-11, A-3 |
| 6 | **개발 용어가 몰린 화면.** 변경(git) 탭, 연결 도구(MCP) 추가 창, 외부 직원 알림(hooks) 설정, 다른 PC 연결 | A·B |

## 용어 통일안 (결정 필요)

| 지금 섞여 쓰는 말 | 제안 |
|---|---|
| 플랜(요금제) ↔ 기획안·기획 확인 | 요금제는 **"AI 요금제"**, 기획은 그대로 |
| Codex / GPT / ChatGPT | **"GPT(Codex)"** |
| AI / 엔진 / AI 공급자 / 모델 | **"AI 엔진(Claude·GPT)"**. 모델은 "성능 등급" 설명을 붙임 |
| 원격 / 다른 PC / 상대 PC / B컴 | **"다른 PC"** |
| 거절 ↔ 반려 | **"반려"** |
| 매뉴얼 ↔ 스킬 | **"매뉴얼"**. 필요한 곳에만 "(스킬)"을 병기 |
| 연결 도구 ↔ MCP 서버 | **"연결 도구"** |
| 랩장 / 랩 리드 / 리드 | **"랩장"** |
| 비용 / 급여 / 수당 / 회사 자금 | 실제 돈은 **"AI 사용 비용"**, 게임은 **"회사 자금(게임 속 돈)"** |
| 결과물 ↔ 아티팩트 | **"결과물"** |
| 경로 ↔ 위치 | **"파일 위치 / 폴더 위치"** |
| 토큰(사용량) ↔ 토큰(연결 열쇠) | 연결 쪽은 **"연결 열쇠"**만 쓰고, 사용량 쪽은 비용 화면에 "토큰 = AI가 읽고 쓴 글의 양"이라는 설명을 1회 넣음 |
| 자동결재 / 자율 진행 / 완전 자율 | 이름은 그대로 두고 **각각 한 줄 설명**을 붙임 |
| 프로세스 | **"매뉴얼 단계 진행"** |

---

## C. 처음 쓰는 흐름 (20건)

| # | 중요도 | 단계 | 위치 | 문제 | 개선 제안 |
|---|---|---|---|---|---|
| 1 | 상 | 로그인 | Onboarding.tsx:313-344, main/setup.ts:71-83 | 터미널에서 `claude auth login` 글자 화면이 열림. 무엇을 고르는지, 화살표 키를 쓴다는 것, 끝나면 창을 닫아도 된다는 것을 알려 주지 않음 | 화면 예시와 고를 항목을 보여 줌. 가능하면 브라우저 로그인 방식으로 바꿈 |
| 2 | 상 | 소개→로그인 | featuresA.ts:609, 653 | 유료 계정이 필요하다는 사실이 로그인 단계에서야 나옴 | 소개 화면에 "필요한 것: Claude 유료 구독 또는 ChatGPT 계정"을 넣음. 무료 플랜이면 따로 안내 |
| 3 | 상 | 설치 | Onboarding.tsx:278-300, featuresA.ts:619 | 선택 사항인데 1/4로 맨 앞에 나옴. 터미널 명령이 보이고, "로그인에 쓰여요"는 사실과 다름(실제 로그인은 앱에 든 엔진으로 함) | 점검 목록에서 빼고 고급 설정으로 옮김. 틀린 문구는 삭제 |
| 4 | 상 | 결재 | Onboarding.tsx:430-442, useFirstTask.ts:105-131 | 첫 업무에서 결재함을 한 번도 보지 않음 | 완료 화면에 결재함 안내 한 줄과 바로 가기를 둠 |
| 5 | 상 | 고용 뒤 | HireDialog.tsx:149-151, featuresB.ts:16-17 | 빈 패널에 "아직 기록이 없어요"만 보이고 다음 행동 안내가 없음 | 예시 지시 칩 2~3개를 띄움 |
| 6 | 상 | 고용 창 | HireDialog.tsx:167-336 | 항목 12개가 한 화면에 다 펼쳐짐. 설명도 "Claude Code 세션"이라고 씀 | 처음에는 이름·직무만 보이고 나머지는 '자세히'로 접음. 모델에 "빠름/똑똑함" 설명을 붙임 |
| 7 | 중 | 작업 폴더 | Onboarding.tsx:357-366 | 무엇을 고르면 되는지, 직원이 그 폴더의 파일을 고칠 수 있다는 것을 설명하지 않음 | 예시 폴더와 권한 설명을 넣고, 안 골라도 된다고 알려 줌 |
| 8 | 중 | 첫 업무 실패 | Onboarding.tsx:468-485 | 'unknown' 실패는 원인을 보여 주지 않음. 네트워크 실패에도 로그인 버튼이 나옴 | 원문을 접어서 보여 주고, 실패 종류에 맞는 버튼만 둠 |
| 9 | 중 | 시간 초과 | useFirstTask.ts:13, 91-102 | 90초가 지나면 실패로 처리됨. '이어 보기'를 눌러도 그 직원 패널이 열리지 않음 | 해당 직원 패널을 열고, 끝나면 알림을 줌 |
| 10 | 중 | 계정 미준비 | Onboarding.tsx:369-377 | 다음에 무엇을 할지 고를 버튼이 없음 | '로그인 단계로', '연습 튜토리얼' 버튼을 둠 |
| 11 | 중 | 로그인 게이트 | Onboarding.tsx:326 | 상태를 확인하는 동안 '나중에'가 눌림 | 확인이 끝날 때까지 버튼을 막고 '확인 중…'을 표시 |
| 12 | 중 | 단계 순서 | Onboarding.tsx:20 | 선택 사항인 설치가 필수인 로그인보다 앞에 있음 | 로그인 → 폴더 → 첫 업무 순서로 바꿈 |
| 13 | 중 | 완료 뒤 | CoachTour.tsx:50-70, Tutorial.tsx:54-73 | 19단계 둘러보기가 끝나면 연습 고르기가 또 뜸 | 둘러보기를 5단계로 줄이고, 실제 업무를 해 봤으면 연습은 생략 |
| 14 | 중 | 소개 | Onboarding.tsx:249-264 | 카드가 6장이고 팀·랩 같은 고급 개념까지 나옴 | 고용·지시·결재 3장으로 줄임 |
| 15 | 중 | 건너뛰기 | Onboarding.tsx:269, App.tsx:158-192 | 건너뛰면 안내를 다시 볼 방법을 알려 주지 않음 | 빈 사무실 띠에 '직원 고용'·'안내 다시 보기' 버튼, 건너뛸 때 알림 |
| 16 | 중 | 둘러보기 그만두기 | CoachTour.tsx:146-158 | 다시 보는 방법을 알려 주지 않음 | "설정 › 안내" 알림을 띄움 |
| 17 | 하 | 둘러보기 끝 | CoachTour.tsx:171-176 | 고용 뒤 일을 맡기는 안내가 금방 사라짐 | 지시 칸을 강조 표시 (5번과 함께 처리) |
| 18 | 하 | 결재함 빈 상태 | InboxPage.tsx:82-84 | "🎉"만 나오고 결재가 언제 생기는지 설명이 없음 | 결재가 생기는 때를 설명하고 고용 버튼을 둠 |
| 19 | 하 | 완료 화면 | Onboarding.tsx:494-532 | 보고를 다시 보는 곳을 알려 주지 않음. 버튼 3개 중 추천이 무엇인지 안 보임 | 한 줄 안내를 넣고 추천 버튼 1개만 강조 |
| 20 | 하 | GPT 띠 | ProviderBanner.tsx:12-44 | 새로 설치한 사용자에게도 띠가 떠서 위쪽에 띠 2개가 쌓임 | 업데이트한 사용자에게만, 또는 직원이 1명 이상일 때만 띄움 |

---

## A. 화면 문구, 1부 (29건)

| 중요도 | 파일:키 | 현재 | 문제 | 제안 |
|---|---|---|---|---|
| 상 | tools:equip.reason.needsAuth | 터미널의 claude에서 /mcp로 인증한 뒤… | 개발자만 할 수 있는 절차 | 앱에서는 로그인할 수 없다고 알리고, 개발 담당자에게 부탁하라고 안내 |
| 상 | peer:peer.report.lost | B컴에서 일의 기록을… | 내부에서 쓰는 말이 그대로 노출됨 | 상대 PC에서… |
| 상 | main:tray.autoWaits | 위험 명령·푸시·외부 전송은 기다려요 | "푸시" | 삭제·코드 올리기·외부 전송은 대표 결재를 기다려요 |
| 상 | main:tray.phoneOn | 켜짐 (포트 {port}) | 포트를 알 필요가 없음 | 켜짐 |
| 상 | main:notify.planUsage 외 plan* | 플랜 사용률 {window} | 기획안과 헷갈리고, 기술값이 그대로 나옴 | AI 요금제 사용량 {percent}% (최근 5시간) |
| 상 | tools:equip.browser.needNode | Node.js가 없어… | 무엇을 받아야 하는지 모름 | 무료 프로그램이라고 설명하고, 'LTS' 버튼으로 설치하라고 안내 |
| 상 | peer:peer.error.bad_host 외 | 같은 Tailscale 망의… | 설명이 없음 | Tailscale(내 PC끼리 잇는 무료 프로그램) |
| 상 | shell:pickFilesDesc 외 | 경로를… / ~/projects/… | 개발자식 표기 | 파일 위치. Finder '경로 이름 복사' 안내 |
| 중 | settings:provider.section.title | AI 공급자 | 직역투이고 온보딩과 이름이 다름 | AI 계정 |
| 중 | settings:provider.codex.* | Codex/GPT/ChatGPT | 이름이 세 가지 | GPT(Codex) |
| 중 | settings:provider.claude.loggedOut | Console(API) 계정 | 설명이 없음 | 구독 또는 개발자 계정(쓴 만큼 결제) |
| 중 | settings:provider.claude.missing/broken | 실행 파일 | 기술 용어 | Claude 프로그램 |
| 중 | tools:mcp.err.* | stdio·인자·환경 변수·헤더·JSON | 화면 전체가 개발 용어 | "고급(개발자용)"으로 묶고 오류 문구를 쉽게 바꿈 |
| 중 | tools:equip.source.* | 설정 파일/로컬/커넥터/플러그인 | 개발자식 출처 표기 | Claude 앱 설정에서 / 이 작업 폴더 전용 등 |
| 중 | tools:equip.reason.claudeai | 직원 세션에 붙일 수 없어요 | 뜻이 모호함 | 직원에게 줄 수 없어요. 연결 주소를 [직접 추가]로 넣어 주세요 |
| 중 | tools:slash.desc.init 외 | CLAUDE.md / 브랜치 / PR | 설명이 없음 | 괄호로 짧게 설명 |
| 중 | main:auto.part.command/edit | 명령 / 수정 | "지시"로 읽힘 | 프로그램 실행 / 파일 수정 |
| 중 | 자동결재·자율 진행·완전 자율 | — | 차이를 알 수 없음 | 각각 한 줄 설명 |
| 중 | main:tray.external(Waiting) | 외부 직원 / 원래 창 | 무엇을 가리키는지 모호함 | 앱 밖(터미널 등)에서 일하는 직원 |
| 중 | main:notify.processConfirm/Done | 프로세스 확인 | 직역투 | 업무 흐름 확인 / 완료 |
| 중 | peerSync:action.reject | 거절 | 반려와 다름 | 반려 |
| 중 | peer:peer.tag/badge 외 | 원격/다른 PC/상대 PC | 이름이 네 가지 | 다른 PC |
| 중 | peer:ready.remoteOffDesc/notOpen | 휴대폰 연결에서 켜야… / 열리지 않았어요 | 어디서 켜는지 헷갈리고, 포트 개념이 나옴 | 휴대폰을 안 써도 [원격 켜기]가 필요하다고 안내 / 준비 중이에요 |
| 중 | peer:client.host | 100.64.0.5:47900 | IP·포트 형식 | 상대 화면의 '이 PC 주소'를 그대로 적으라고 안내 |
| 중 | peerSync:error.changes_rejected | 허용되지 않는 경로 | 뜻이 모호함 | 작업 폴더 밖 파일이 있어 안전을 위해 받지 않았어요 |
| 중 | staff:msg.leadNudge/backgroundNudge | delegate·add_task / 백그라운드 | 도구 이름이 채팅에 노출됨 | 팀원에게 맡기거나 업무 카드로 올리세요 |
| 중 | autonomy:log.autonomousSkip | {tool}=Bash 등 | 영어 도구 이름 | 우리말 동작 이름 |
| 하 | main:meeting.fallbackNote | 연결이 안 돼 | 무엇이 안 됐는지 모호함 | 이 직원의 AI 계정에 연결이 안 돼 |
| 하 | update:update.download | 다운로드 | [지금 업데이트]와 차이를 모름 | 설치 파일 직접 받기 |
| 하 | staff:role.qa/researcher | QA / 리서처 | 다른 직무와 달리 설명이 없음 | 품질 검수(QA) / 조사 담당(리서처) |

※ AI 직원에게만 보내는 지시문(staff.ctx.*, staff.tool.*.desc 등)은 검토에서 뺐습니다.

## B. 화면 문구, 2부 (30건)

| 중요도 | 파일:키 | 현재 | 문제 | 제안 |
|---|---|---|---|---|
| 상 | featuresB:settingsPage.hooks.* | settings.json·hooks·127.0.0.1·.bak | 개발 용어가 한 문장에 몰림 | "터미널에서 일하는 Claude(외부 직원)의 결재를 사무실에서 바로 알 수 있어요". 파일 이름은 '자세히'로 |
| 상 | featuresB:settingsPage.askHook.desc | AskUserQuestion·세션 | 내부 도구 이름 | 외부 직원이 고르기 질문을 하면 결재함에 떠요 |
| 상 | featuresA:hire.desc | 새 Claude Code 세션을 직원으로… | 고용 화면의 첫 문장부터 개발 용어 | AI 직원을 새로 채용해요 |
| 상 | featuresA:manuals.description | AI 엔진의 스킬이에요 | 설명이 없음 | 직원이 일하는 순서를 적어 둔 문서(AI 쪽 이름: 스킬) |
| 상 | featuresA:equipment.preset.*.hint | Bash·deny·ls·grep·rm -rf·git push --force… | 명령어 목록이 그대로 나옴 | "무엇이 막히고 무엇이 허용되는지"로 쓰고, 명령어 예시는 접음 |
| 상 | featuresB:review.* (탭 안내) | diff·커밋·git 저장소·분리된 HEAD | 변경 탭 전체가 git 용어 | 바뀐 내용 / 저장 기록 / 변경 기록을 관리하지 않는 폴더 |
| 상 | featuresB:review.commit·pushPr 외 | 커밋 결재 / 푸시·PR / gh | 무슨 일이 일어나는지 모름 | 변경 확정(커밋) / 올리고 검토 요청(PR) |
| 상 | featuresB:staffPanel.resume.codexMissing | npm i -g @openai/codex | 설치 명령을 그대로 보여 줌 | [설치 안내] 버튼 |
| 상 | featuresB:staffPanel.external.* | 세션 종료 / Codex에서 연 세션 | 직원을 "세션"이라고 부름 | 외부 직원의 일을 끝낼까요? / 내보내기 |
| 상 | featuresA:mcpAdd.* | 인자·환경 변수·헤더·JSON | 개발자용 화면 | 상단에 "고급" 안내를 넣고 칸 이름을 쉽게 바꿈 |
| 상 | knowledge:rule.confirm / featuresB:autoApprove.scope | npm 스크립트 / 셸 설정·.ssh·깃 훅·CI·푸시 | 안전 안내인데 읽을 수 없음 | 컴퓨터·보안·자동 배포 설정 파일은 제외, 코드 올리기는 기다림 |
| 상 | featuresB:remote.qr.tokenUsed | 열쇠(토큰) | "토큰"의 뜻이 겹침 | 연결 열쇠 |
| 상 | payroll.desc 외 토큰 전반 | 오늘 토큰 | 설명이 어디에도 없음 | 비용 화면에 설명 1회 |
| 중 | payroll.col.tokensIn.hint | 캐시로 다시 읽은 것 | 캐시 | 다시 본 양도 포함 |
| 중 | planUsage.refreshTitle | haiku를 한 번… | 모델 이름이 노출됨 | 가장 가벼운 AI에게 물어 |
| 중 | equipment.saveNote | 세션을 닫고 | 세션 | 지금 일을 마무리한 뒤 |
| 중 | hire.templates | 에이전트 정의 불러오기 | 직역투 | 직원 설정 파일 불러오기 |
| 중 | MCP 서버 ↔ 연결 도구 | — | 이름이 다름 | 연결 도구 |
| 중 | 스킬 ↔ 매뉴얼 | — | 이름이 다름 | 매뉴얼 |
| 중 | AI / 엔진 / 공급자 / 모델 | — | 이름이 다름 | AI 엔진 |
| 중 | 랩장 / 랩 리드 / 리드 | — | 이름이 다름 | 랩장 |
| 중 | 비용 / 급여 / 수당 / ₩ | — | 실제 돈과 게임 돈이 섞임 | AI 사용 비용 / 회사 자금(게임) |
| 중 | board.runProcess 외 | 프로세스로 진행 | 무엇인지 모호함 | 매뉴얼 단계대로 진행 |
| 중 | onboarding.install/terminal.desc | 터미널·세션 | 첫 화면부터 개발 용어 | 로그인 때만 잠깐 필요해요 (C-3과 함께 처리) |
| 중 | onboarding.login.desc | Console(API) | 설명이 없음 | 회사 개발용 계정(쓴 만큼 결제) |
| 중 | refDocs.* / knowledge:editor.docHint | 경로 / ~/… | 다른 곳의 "위치"와 불일치 | 파일 위치 |
| 중 | meeting.description | AI 호출 | 개발 용어 | AI 사용량이 조금씩 들어요 |
| 하 | logs:log.taskDone/rotated | {n}턴 / {k}k 토큰 | 턴·k | 주고받기 n번 / 약 n천 토큰 |
| 하 | manuals.editor.location* / schedule.preset.morning | ~/.claude/skills / git log·status | 경로와 git 용어 | 모든 프로젝트에서 사용 / 최근 바뀐 것 |
| 하 | artifact.link.confirm / secretary:d.gridSpot | 아티팩트 / {x},{y}칸 | 다른 곳과 불일치, 좌표 노출 | 결과물 / 놓을 자리 |

---

## 반복되는 패턴
1. **개발 도구 이름이 화면에 그대로 나옴.** 고용·설정·장비·변경 탭, 다른 PC 연결 화면에 몰려 있음.
2. **같은 개념을 화면마다 다르게 부름.** 위 '용어 통일안'을 정하면 대부분 해결됨.
3. **안전 안내일수록 명령어로 설명함.** 본문은 "무엇이 막히고 무엇이 허용되는지"로 쓰고, 명령어는 '자세히'로 접음.
4. **실패·빈 상태에서 다음 행동이 빠짐.** 원인 한 문장과 할 일 한 문장을 붙임.
