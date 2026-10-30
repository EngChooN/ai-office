# AI Office — SPEC

> 결정된 사항만 적는다. 미정은 "열린 질문"에 둔다.

## 1. 한 줄 정의
내 AI 세션들(Claude Code·Codex, 곧 Claude 직원·GPT 직원)을 **직원**으로 삼아, 하나의 사무실처럼 보고·부리고·관리하는 데스크톱 앱.

## 2. 결정 사항 (2026-10-20)
| 항목 | 결정 |
|---|---|
| 사용자 | 나 혼자 (내 맥의 내 세션) |
| 앱 형태 | Electron 데스크톱 |
| 화면 | 2D 사무실 맵 ↔ 대시보드 전환 (기본 맵) |
| UI 프레임워크 | React |
| 맵 렌더링 | Phaser (타일맵·캐릭터 이동) |
| Claude Code 연동 | 하이브리드 — 고용한 직원은 Agent SDK로 직접 구동, 밖에서 띄운 세션은 hooks + `~/.claude`로 관찰해 "외부 직원"으로 표시 |
| 저장소 | SQLite (로컬 파일 DB) |
| 0.1 범위 | 상태 보기 · 알림 · 지시하기 · 직원 고용 |
| 빌드 도구 | Electron Forge + Vite 플러그인 (패키징·서명도 Forge) |
| 상태관리 | Zustand (Phaser 씬에서도 store 직접 구독·수정) |
| 스타일링 | Tailwind + shadcn/ui |
| 맵 에셋 | AI 생성 스프라이트 + 리터칭 — 현재는 코드로 그린 밝은 탑다운 픽셀아트(외곽선 캐릭터 24종 × 앉기 5·서기 4 프레임, 가구 15종), 이미지 생성 에셋은 같은 텍스처 키로 교체 |
| 맵 레이아웃 | 왼쪽 업무 구역(팀별 칸막이 자리 4열) + 오른쪽 회의실·휴게실. 일하면 자리, 쉬면 휴게실, 회의면 회의실로 걸어간다 |
| 이력 관리 | git 없음 (폴더만) |

## 3. 기능 목록

### 3-1. 0.1 (1차)
- **상태 보기**: 직원별 작업 중/막힘/완료/대기, 맵에서는 캐릭터 애니메이션(타이핑·졸음·손 들기)
- **알림 받기**: 권한 요청·질문·완료 시 "직원이 손 든다" + OS 알림
- **지시하기**: 직원에게 메시지 전송, 권한 승인/거절
- **직원 고용**: 역할·이름·아바타·모델·프롬프트·작업 폴더를 정해 SDK 세션 생성 (`.claude/agents` 정의 불러오기)
- **기록 보기**: 직원별 오늘 한 일·토큰 사용량

### 3-2. 이후 로드맵 (선택된 아이디어, 순서 미정)
- 인사·조직: 부서/팀 배치(프로젝트별 방), 팀장 에이전트(일 쪼개서 분배·취합), 직원 프로필·성장(누적 실적·레벨)
- 업무 흐름: 결재함(승인 모아 처리), 업무 보드(칸반 → 직원에게 드래그 배정), 회의실(여러 직원 토론), 출퇴근·예약 업무(아침 브리핑·예약 실행·퇴근 보고)
- 분위기·관리: 급여 명세서(토큰·비용, 예산 경고), 통합 타임라인/보고서, 사무실 단체방(채팅체 보고 피드), 사무실 꾸미기(가구·테마·낮밤)

## 4. 0.1 구현 (2026-10-20 완료)
| 단계 | 결과 |
|---|---|
| 1. 연동 스파이크 | SDK·레지스트리·hooks 검증 → docs/spike-integration.md |
| 2. 앱 뼈대 | Forge+Vite+React+TS, Tailwind4/shadcn, Zustand, `node:sqlite`(네이티브 빌드 불필요), IPC |
| 3. 대시보드 | 고용/외부 직원 카드(긴급순), 상세 패널(결재·지시·중단·오늘 한 일·토큰/비용), OS 알림, 상단 "확인 필요" 버튼 0.10.1: 직원 카드 테두리·바탕이 상태색(`StaffCard.tsx`), 카드 미니 뷰는 칸 비율대로 넓게 그림(`officeStage.ts` 슬롯 최대 4:1·COLS 2, `LiveMiniView.tsx` ResizeObserver) |
| 4. 직원 고용 | 생김새·이름·작업 폴더·직무(프리셋/`.claude/agents` 불러오기)·모델·결재 방식·업무 지침, 퇴사 |
| 5. 사무실 맵 | 책상 그리드, 자세(타이핑/손 들기/졸음), 모니터 켜짐, 확인 필요 `!`, 말풍선, 클릭 선택, 새 직원 문에서 입장 |
| 6. 기록 | 고용 직원은 DB 로그·턴별 비용 차액, 외부 직원은 트랜스크립트에서 지시·보고·토큰 집계 |

### 동작 규칙
- 결재: SDK `canUseTool`이 앱 승인까지 대기. "모두 결재" = default 모드, "수정은 자율" = acceptEdits
- 비용: SDK `result.total_cost_usd`/`modelUsage`는 query 누적값 → 직전 값과의 차액만 저장. 재시작 후 같은 세션을 `resume`으로 이어받음
- 외부 직원 hooks: 기본 꺼짐. 상단 "외부 직원 알림"에서 사용자가 켜면 `~/.claude/settings.json`에 hooks 5개 추가(백업 `settings.json.claude-office.bak`), 이벤트는 127.0.0.1:47823으로만 전송

### 0.1의 한계
- 외부 직원에게는 지시·결재 불가(보기 전용)
- 패키징(dmg/zip) 미검증 — Agent SDK를 external로 두므로 패키지에 node_modules 포함 설정 필요
- 외부 직원 비용은 계산하지 않음(토큰만)

## 5. 0.2 구현 (2026-10-20 완료) — 그래픽 개편 + 로드맵 전체
| 기능 | 동작 |
|---|---|
| 그래픽 | (0.2.1) 방향별 스프라이트(정면·뒤·옆), 의자 3종(앉은·빈·뒤), 걷기 4프레임·깜빡임·숨쉬기·zzz·이모트. 참고 이미지(밝은 탑다운 오피스) 톤: 타일 바닥·벽(창문·시계·액자·TV·화이트보드), 칸막이·의자·책상, 원목 휴게실(소파·탁자·자판기·정수기·책장). 줌 최대 1.25 |
| 휴게실 | 대기 직원은 자리에서 일어나 휴게실로 걸어가 돌아다니고, 가까운 둘이 수다 말풍선. 일이 오면 자리로 복귀. 소파에선 꾸벅꾸벅 |
| 마우스오버 | 이름·상태·활동·폴더·레벨 정보창, 오른쪽 위 현황판(HUD) |
| 팀(부서) | 조직도에서 팀 생성·이동·팀장 임명. 맵은 팀별 구역, 외부 직원은 프로젝트 폴더별 가상 팀 |
| 팀장 위임 | 직원 세션에 사무실 MCP(`team`·`delegate`·`add_task`, 결재 없이 허용). 팀원이 끝내면 `[팀원 보고]`가 팀장에게 자동 전달 |
| 업무 보드 | 할 일→진행 중→검토→완료. 담당자 고르면 지시가 나가고, 보고 오면 검토로 이동. 드래그로 열 이동 |
| 결재함 | 모든 고용 직원의 권한 요청 + 외부 직원 확인 대기를 한곳에, 모두 승인/반려 |
| 단체방 | 입사 인사·위임·결재 요청·보고가 채팅으로. `@이름`·`@팀`·`@랩`·`@전체`로 지시(구성원 중복 없이, 이름이 겹치면 자동완성이 `@디자인(팀)`처럼 종류를 붙임, 멘션만 있고 내용이 없으면 보내지 않음). 멘션이 없으면 직무가 맞는 직원 한 명(없으면 팀장·랩 리드 → 한가한 직원, 예산 소진 직원 제외)이 받고 "OO 님이 받았어요" 안내 | **0.12.0: `/` 명령어 자동완성**(스킬·`.claude/commands`·기본 명령 7개, 직원별 목록 `staffCommands`, 방향키·Enter·Tab, 단체방은 `@이름 /명령`, 앱에서 막힌 명령(`/login`·`/config` 등)은 안내만. `/clear`는 세션 초기화, `/compact`는 SDK로 전달. 휴대폰은 remote v2 `loadStaffCommands`로 같은 목록)
| 회의실 | 참석자 2명+ · 최대 인원은 레벨별 회의실(`shared/officeLevel.ts` `meetingRoomOf`: Lv.1~3 8 · 4~5 10 · 6~7 12 · 8~9 14 · 10 16명, 단계 folding→wood→oak→walnut→board로 테이블 길이·소품), 화면과 `startMeeting` 모두 이 값으로 자름 · 1~3바퀴 돌아가며 발언(도구 없는 단발 호출) → 회의록 + "할 일:" 글머리표를 보드 카드로 |
| 예약 업무 | 시각·요일·지시. 출근 브리핑/퇴근 보고/주간 정리 프리셋, 지금 실행. 앱이 켜져 있을 때만 |
| 보고서 | 날짜별 전체 타임라인 + 일일 보고서(AI 호출 없음, 복사) |
| 급여 명세서 | 월별 직원 비용·토큰·완료 수, 월 예산 80%/100% 알림 |
| 프로필·성장 | XP(완료 30·위임 10·결재 5·도구 2·지시 1) → 레벨, 실적·소속·예약 업무 |
| 꾸미기 | 사무실 그림 테마 4종(기본·민트·파스텔·야근), 낮밤(시간 따라/고정), 화분 수, 수다 on/off. 바깥 UI는 별도: 화면 모드(기기 설정 따르기·라이트·다크)와 색 테마 6종(라벤더·스카이·노을·숲속·벚꽃·모노) — 0.15.0 |

검증(실제 실행, haiku): 팀 생성 → 팀장·팀원 고용 → 팀장 위임 → 팀원 파일 작성·보고 → 팀장 최종 보고, 보드 배정 → 검토 이동, 1바퀴 회의 → 회의록, 예약 업무 즉시 실행, 급여·일일 보고서.

## 6. 0.4.0 (2026-10-21 설치본 빌드)
| # | 기능 | 내용 |
|---|---|---|
| 1 | 외부 직원 해고 | 확인 후 그 Claude Code 프로세스를 종료(SIGTERM). 원래 창의 작업도 멈춘다 |
| 2 | 외부 직원 정식 채용 | 외부 세션을 사무실 직원으로 데려와 `resume`으로 대화를 이어받고 지시·결재까지. 원래 창이 열려 있으면 먼저 닫도록 안내 |
| 3 | 회사 레벨·사무실 확장 | 직원 레벨과 별개로 회사 레벨(직원 수·완료 업무·누적 실적). 레벨업하면 사무실이 넓어지고 방·소품이 늘어난다 (예: 작은 사무실 → 층 확장 → 라운지·옥상) |
| 4 | 작업 결과 검토 | 직원이 바꾼 파일 diff 보기, 커밋·PR까지 결재로 처리 |
| 5 | 장비 지급 | 직원별 MCP 서버·스킬·허용 도구를 지급/회수, 직원별 비용 상한. **0.12.0: 앱 기본 장비 '브라우저'**(Playwright, 항상 목록에 표시, 직원별 프로필 `userData/browser/<staffId>`로 로그인 유지). 조회(스냅샷·스크린샷·탭 목록·콘솔·네트워크)는 결재 없이 허용, 이동·클릭·입력·업로드·폼 제출·스크립트 실행은 결재함(자동결재도 같은 판정, `shared/browserTools.ts`). 실행 환경(npx·node)이 없으면 칩을 끄고 안내. 스크린샷은 `report_image`로 보고에 붙임 |
| 6 | 메뉴바 상주 + 알림 | 창을 닫아도 메뉴바 아이콘에 확인 필요 배지, 메뉴에서 바로 승인 |
| 7 | 사무실 꾸미기 확장 | 가구를 드래그로 배치, 직원 레벨에 따라 책상 업그레이드, 근무시간 외 퇴근 연출 |
| 8 | 랩(프로젝트 팀) | 팀(직무 소속, 1개)과 별개인 교차 조직. 여러 팀에서 뽑은 멤버·리드·목표·폴더, 한 사람이 여러 랩 |
| 10 | 외부 직원 지시 | 세션 포크(SDK forkSession)로 분신을 고용해 지시. 원래 세션은 건드리지 않음 |
| 11 | 첫 실행 안내 | 소개 → 로그인 점검(claude auth status, 로그인은 터미널 창) → 코치마크 둘러보기 |
| 9 | 맵 확대·이동 | ⌘+스크롤·핀치·버튼으로 확대, 빈 곳 드래그·두 손가락 스크롤로 이동, 전체 보기 |
| 12 | 업무 매뉴얼 | 스킬을 매뉴얼로 부름. 개인(직원 교육·지시창에서 고르기) / 프로세스(랩·팀 교육, 앱이 단계 진행·확인·revise 루프). 결정 상세는 `docs/specs/manuals.md` |
| 13 | 작업 폴더 | 직원 폴더는 선택. 지정 없음 = 홈 폴더에서 범용(지시·랩 안내의 프로젝트 폴더로 가서 일함, 모호하면 질문). 랩 폴더는 지침·프로세스 단계에 안내로만. 폴더별로 대화 기록이 따로라 바뀌면 새 대화. 지정 없는 직원은 변경 탭(diff·커밋)을 못 씀 |
| 14 | 마크다운 | 직원이 쓴 글은 GFM 마크다운으로 표시(react-markdown + remark-gfm), 내가 쓴 글은 그대로 |
| 15 | 리드 업무 흐름 | 보드 업무를 받은 리드는 기획 → propose_plan(카드 제목+기획서+하위 업무·담당, 순서대로) → 대표 확인 → 앱이 하위 카드를 만들어 적힌 순서대로 하나씩 배정(앞 결과 전달, 한 직원엔 카드 하나씩·나머진 대기열) → 하위 모두 검토/완료 시 리드에게 결과 전달 → 취합 보고 후 상위 카드 검토. 작은 일은 기획안 없이 직접 처리 가능 |
| 16 | 질문 답하기 | 고용 직원: canUseTool에서 AskUserQuestion을 잡아 answers를 채워 허용. 외부 직원: 옵트인 PreToolUse hook(matcher AskUserQuestion, 600초)이 /ask로 답을 기다림 — 빈 응답이면 원래 창 UI |
| 17 | 업데이트 소식 | 루트 CHANGELOG.md를 렌더러 빌드에 `?raw`로 넣어 버전별 새 기능·개선·버그 수정을 보여 줌(사이드바 하단). 마지막으로 본 버전(localStorage)과 다르면 "새로워진 점" 창 1회. CHANGELOG는 버전마다 `### 새 기능 / 개선 / 버그 수정`으로 쓴다 |
| 18 | 토큰 한도 | Claude 구독 한도는 토큰 수로 제공되지 않음(5시간·7일 사용률 %와 리셋 시각만, SDK rate_limit_event). 그래서 일·주·월 토큰 한도는 직접 입력. 사용률은 rate_limit_event의 (타입에 없는) unifiedWindows{five_hour,seven_day…: utilization 0~1, resetsAt 초}로 받아 급여 명세서에 참고 표시, "지금 확인"은 haiku 1회 호출 |
| 19 | 회사 레벨·자금·상점 | 레벨 20단계(`shared/officeLevel.ts` `LEVEL_TABLE`: 칸 크기 N×N·층 수·회의실 정원·외관 단계). 자금 = 토큰×₩10 + 보너스·보상 − 구매. 상점: 벽지·바닥(업무 구역·회의실), 가구(서랍·꾸미기), 레벨 전용 가구, 책상·의자(직원별). 레벨 기본 지급은 `levelgrant:{n}`, 구역 가구 지급은 `zonegrant:{구역}` 키로 한 번씩(`main/isoMigrate.ts`). 상세 docs/specs/economy-levels.md · office-iso-levels.md |
| 20 | 상점 2차 | 101종(등급 일반·희귀·전설, 시즌 한정), 가구별 직원 행동(fun 자리·이모트·대사), 세트 10개 완성 보너스, 일일 미션 3개·업적 14개(장부 key로 1회 지급), 오늘의 특가(날짜 시드, Math.imul LCG). 상세 docs/specs/economy-levels.md 2차 |
| 21 | 참고 문서 | 직원·팀·랩에 문서 절대 경로를 등록(파일 선택·직접 입력, `~` 허용, 설정마다 5개·중복 차단). 세션을 열 때 개인 → 팀 → 랩 순으로 합쳐(중복 하나로, 출처 표기, 없는 파일 제외, 합계 15개 넘으면 "외 n개 생략") "작업 전에 먼저 읽으라"는 안내와 경로만 맥락에 넣고, 같은 목록(전달된 것만)의 Read는 "모두 결재" 직원도 결재 없이 허용(경로 정규화 후 비교). 저장은 `setRefDocs` 하나로만(staff·team은 `ref_docs` 열, 랩은 data JSON), 바뀌면 영향받는 직원 세션을 다시 연다(일하는 중이면 끝난 뒤). 규칙은 `shared/refDocs.ts` |
| 22 | 사무실 칸 장면·외관·층 | **장면은 `map/IsoOfficeScene.ts` 하나**(비스듬한 칸 사무실 — 예전 평면 장면과 전환 스위치는 지웠다). 저장된 예전 데이터(settings.layout·shop.placed)는 `main/isoMigrate.ts`가 칸 배치(shop.grid)로 옮긴다. **평면** `shared/iso/plan.ts` `planOf(level, floor)`: 층마다 모양이 다르다(1층 현관·로비 돌출 + 오른쪽 테라스, 2층 ㄱ, 3층 ㄷ 안뜰, 4층 T — Lv.17부터 깎인 자리가 옥상 정원, 5층 탑). 바닥은 레벨이 올라도 줄지 않고, 칸 종류(없음·실내·야외)·경계(안쪽 벽·유리벽·문턱·난간)는 `edgesOf`로 그린다. **회의실** `shared/iso/meeting.ts` 6단계(접이식 8·원목 10·오크 12·월넛 14·보드룸 16·강당 20): 의자 수 = 정원, 참석자는 참석 순서대로 앉고 모자라면 빈 칸에 선다. **휴게 구역** `shared/iso/zoneLayouts.ts` `ZONE_LAYOUTS`(휴게 코너 Lv.3 ~ 대표실 Lv.20, 구역 id = 바닥 종류 이름[:번호]): 열린 레벨에 기본 가구를 정해 둔 칸에 놓고, `planOf`가 `room.zones`를 채워 구역 바닥·쉬는 자리 가중치·말풍선에 쓴다. **자리 부족**: 층별 자리 상한(`seatCapOf` = 업무 칸 ÷ 8), 자리 없는 직원은 쉬는 자리(쉬러 올 몫 1~2자리만 남기고)에서 일하고 그래도 모자라면 출입구 근처 실내 바닥 칸(`waitCellFor`)에 서며, 현황판에 레벨업 안내를 띄운다. **외관** `exteriorDiorama.ts`·`iso/exteriorArt.ts`: 땅 한 판 위의 건물(단계 E1~E7 + 꾸밈), 건물 클릭 → 1층, "밖으로"로 복귀. 층 데이터 `buildFloors` = 층마다 `{ floor, teams, staff, meetingRoom }`. 팀 층은 team `floor` 열(없으면 1층, 저장은 1~최대 층수만), 외부 프로젝트 팀·무소속은 1층. 회의는 참석자가 가장 많은 층(같으면 낮은 층)에서 열리고, 다른 층 참석자는 자리에서 "N층 회의 중". 보정은 그릴 때만(`clampFloor`·`teamFloor`) — DB 값은 그대로라 레벨이 오르면 제자리. 2층 이상이면 오른쪽 층 버튼·왼쪽 위 미니맵·조직도 팀 "층" 선택. 레벨은 `viewLevelOf` = 개발용 미리보기(설정 맨 아래, 개발 빌드에서만) ?? 회사 레벨. 상세 docs/specs/office-iso-spaces.md · office-iso-tech.md |
| 23 | 윈도우 1차 | OS 차이는 main `platform.ts`(`IS_WINDOWS`·`exeName`·`WHICH`·`toolEnv`: Path/PATH 하나로 합치고 Git for Windows·GitHub CLI 경로 추가)와 renderer `lib/platform.ts`(`osText`·`MOD_KEY`·`TRAY_PLACE`) + `<html data-platform>`·Tailwind `win:` 변형에 모은다. claude 실행 파일은 win32에서 `claude.exe`(SDK와 같은 규칙). 로그인: 맥 osascript→터미널, 윈도우는 claude.exe를 detached로 띄워 자기 콘솔 창. 터미널용 claude 찾기: 윈도우 `~\.local\bin\claude.exe`·`%APPDATA%\npm\claude.cmd`·`where`. 창: 윈도우는 `titleBarStyle: 'hidden'` + `titleBarOverlay`(높이 44), 상단 바 `win:pr-[144px]`. 트레이: 윈도우는 16·32px 전용 컬러 `trayWin.png`(@2x)·왼쪽 클릭=사무실 열기·확인 필요 수는 툴팁, 트레이가 켜져 있으면 창을 닫아도 앱 유지. 알림용 AppUserModelId = appBundleId. 빌드: maker-zip(win32, 설치 없이 실행), `runtimeModules(platform, arch)`로 대상 OS의 SDK 실행 파일 패키지를 넣고, 아이콘은 `node scripts/icon.mjs final`이 `scripts/icon-art/art-grid.png`(칸당 1px 도트 사무실, `icon-extract.mjs`로 한 번 추출)와 `icon-art/small.mjs`(팔레트·16·32px 전용 그림)로 맥 icns·윈도우 ico(16~256 7종)·trayWin·사이트·안드로이드 adaptive(전경·그라데이션 배경·진하기 3단계 monochrome)를 한 번에 만든다. 임시 폴더에 쓰고 다시 읽어 검사(크기·모서리 투명·그림 비율·안전 영역)를 통과해야 교체. 화면 캡처·외부 직원 hooks는 2차(화면에 "윈도우 준비 중"). 참고 문서 경로 규칙은 `shared/refDocs.ts` 한 곳: 입력 모양으로 판단해 `C:\`·`C:/`를 절대 경로로 받고 `C:\a\b`(드라이브 대문자·`\`)로 통일, 윈도우 홈이면 `~\`도 펼침, 네트워크 폴더(`\\서버`)는 `network`로 거부. 비교는 `refDocKey`(윈도우 경로만 소문자 — 등록 중복·합치기·결재 없는 Read), 맥 경로는 `\`를 파일 이름 글자로 두고 대소문자도 그대로 | **0.14.4: 윈도우 설치형** — forge `MakerSquirrel`로 `AI-Office-win-x64-Setup.exe`(사용자 폴더 설치, `main/squirrelEvents.ts`가 --squirrel-* 실행에서 바로가기 처리 후 종료). 맥에는 wine이 없어 GitHub Actions `win-installer`가 빌드·스모크 테스트. 앱 안 업데이트(`appInstall.ts`)는 Setup.exe를 받아 sha256 검사 후 실행하고 앱을 끈다(zip 덮어쓰기 제거, zip 사용자는 `isWinZip` 안내).
| 24 | 원격 API (휴대폰, 프로토콜 v1) | 규격은 `docs/specs/remote-protocol-v1.md`(계약). 연결 방식은 3가지 — `tailscale`(추천, 신규 설치 기본: Tailscale 주소(100.64/10)에만 바인딩하고 그 밖 주소는 TLS 전에 끊음, UPnP 안 씀, QR에 `ts:true`·host=Tailscale 주소·`lan` 없음, 설치·로그인 상태를 `tailscale status --json`/NIC로 읽어 단계 안내) / `lan`(같은 네트워크 전용) / `router`(고급: UPnP·수동 포트포워딩). 예전 사용자는 쓰던 방식(`lanOnly` → `lan`·`router`)을 그대로 두고 Tailscale 안내 배너를 한 번 본다. 상세는 `docs/specs/tailscale-mode.md`(초안). **기본 꺼짐** — 켤 때만 HTTPS 포트(기본 47900, D4 확정 전 임시)를 열고 UPnP로 공유기 포트 매핑(1시간 임대·30분 갱신, 실패해도 서버는 켜 두고 수동 포트포워딩 안내), 끄면 포트·열린 연결·매핑을 닫는다. 경로는 `GET /v1/status`·`GET /v1/decisions`·`POST /v1/decisions/{id}`·`POST /v1/instructions` 4개뿐, 나머지는 404·405. 판단 순서: 버전(426) → 잠금 → 인증 → 속도(429) → 경로 → 본문(415·413·400). 401은 `unauthorized`(실패 횟수에 셈)·`token_revoked`(폐기 목록 20개)·`auth_locked`+`retryAt`(잠금 중엔 맞는 토큰도)로 나눈다. 실패 제한: `Bearer` 형식이 맞는 틀린 토큰만 세고 IP 5회/10분 → 그 IP 15분 잠금 + PC 알림, 전체 20회/10분은 PC 알림만(잠그지 않음), 기억하는 IP 5000개 상한. 요약이 잘린 결재(`isTruncated`)는 원격 승인 불가(`400 review_on_pc`, 반려는 가능). `activity`는 도구 이름 수준만. 본문 16KB(`Content-Length`로 먼저 거절, 길이 없이 넘기면 소켓 끊기)·동시 연결 주소당 8(v2 앱의 SSE + 동시 호출, 0.9.0에서 4→8)·전체 64·핸드셰이크 5초. PC 알림은 종류마다 10분에 한 번(횟수 합침), 잠근 IP 5000개 상한. `activity`의 자유 문장은 "작업 중". UPnP는 같은 사설 IPv4 호스트의 설명·제어 주소만, 응답 256KB 상한. 토큰은 1개 공유(D3 확정 전), QR(`v`·`host`·`port`·`token`·`spki`)에만 원문이 있고 서버는 SHA-256 해시만 저장·상수 시간 비교, URL·로그에 넣지 않는다. QR은 5분 뒤 가리고 토큰 원문도 메모리에서 지움 → 다시 보려면 재발급(이전 토큰 즉시 폐기·연결 끊기·잠금 초기화). 인증서는 자체 서명 ECDSA P-256(Node 기본 기능), 휴대폰은 SPKI 지문으로 고정. 키는 `userData/remote/`(0700·0600, 개인 키 safeStorage 암호화), 설정은 DB `'remote'`. 응답은 고용 직원만, 작업 폴더·지침·참고 문서·비용·세션·장비 등은 넣지 않는다. 숫자 자료형은 규격 3-4절(`avatar`는 `canonicalAvatar`로 32비트 안, 시각은 64비트). 원격 결정·지시는 기록에 `📱 원격`. 푸시(FCM)는 2단계 — `Notifier` 인터페이스만. 코드 `main/remote/`, 테스트 `scripts/remote.test.mts` |
| 25 | 원격 API v2 (휴대폰 전체 조작, 0.9.0 예정) | 규격 `docs/specs/remote-protocol-v2.md`. v1은 그대로, `/v2/*` 4종 추가: `POST /v2/call`(OfficeApi 84개 전체를 PC 화면과 같은 처리 함수 표 `main/officeHandlers.ts`로), `GET /v2/events`(SSE — snapshot·log·chat·focus·remoteStatus 그대로, Last-Event-ID 따라잡기), `POST /v2/attachments`(20MB), `GET /v2/files/{id}`(첨부 저장소에서 UUID로만). 메서드 목록은 `shared/officeApiShape.ts` 한 곳(OfficeApi와 어긋나면 tsc 실패), 분류표 `remote/v2.ts` `V2_METHODS`(R 58·S 17·P 6·C 2·U 1 — P는 `422 pc_only`+대신할 길, C는 `confirm` 필요·응답 뒤 적용, U는 올리기 경로로). 첨부는 `id`만 믿고 응답·이벤트의 첨부 `path`는 뺀다, 매뉴얼 지우기·덮어쓰기는 지금 있는 매뉴얼 경로만. **전체 조작 스위치 없음**(대표 결정 — 원격이 켜져 있으면 v2를 바로 쓴다, 꺼져 있으면 포트가 닫혀 v1·v2 모두 안 됨. 저장된 옛 `isFullAccess`는 무시, `v2_disabled` 폐지, `/v1/status`의 `fullAccess`는 호환용으로 항상 true. 보안 안내는 연결 가이드 첫 단계 문구. `setRemoteFullAccess`는 지웠고, `RemoteStatus.isFullAccess`는 `true` 고정 호환 필드). 앞단(버전·잠금·인증·속도)은 `/v2/*` 본문을 읽기 **전에** — 막히면 본문을 읽지 않고 `Connection: close`, `/v2/call` 1MB는 인증된 요청만(`RemoteServerOptions.precheck`). 객체 인자는 메서드별 허용 필드만(`V2_FIELDS`, 타입으로 OfficeApi 시그니처와 맞춤). `snapshot`·`remoteStatus`는 500ms로 묶어 마지막 값만. 파일 받기는 폴더·사라진 파일·읽기 실패를 404로, 첨부 저장 실패는 500(경로 없는 문장). `/v2/*` 오류의 `protocolVersion`은 2. 포트를 바꾸면 설정에 저장되어 다음 실행 때도 그 포트, 휴대폰에서 바꿀 때 `confirm_required` 문구에 안내(`PORT_CHANGE_NOTICE`). 원격에서 한 지시·결재는 기록에 `📱 원격`(`main/remoteContext.ts` AsyncLocalStorage). v1 상태에 `supportedProtocols`·`fullAccess`, QR에 `pv: 2`. 테스트 `scripts/remote-v2.test.mts` |
| 27 | 자동결재 + 메뉴바 (대표 부재 중) | 기간: 지금부터 N시간(1·4·8·12, 끝나는 시각으로 저장) 또는 매일 시간대(자정 넘김 가능, 예 23:00–08:00). 끝나면 저절로 꺼지고(N시간은 설정도 off) 단체방·알림으로 요약. 판정은 `shared/autoApprove.ts` `autoApprove(tool, input)` 하나 — 명령을 낱말로 나눠(`shared/commandScan.ts`, 따옴표·이스케이프·git 전역 옵션·괄호·중괄호·치환·제어문 안쪽까지, `bashPolicy` 위험 명령 훅과 같은 분해) 위험 명령·푸시·배포·외부 전송·스크립트 실행·실행 위험 경로 쓰기(셸 rc·git 훅·.claude·.ssh·CI)·화면 캡처는 wait, 나머지(수정·일반 명령·커밋·빌드·테스트)는 allow. WebSearch 허용·WebFetch는 URL에 `?`·`#`이면 wait, MCP는 이름의 모든 낱말을 봐 쓰기 동사가 섞이면 wait·읽기 동사만 allow(`query` 제외). `npx`·`pnpm dlx`·`npm exec`(임의 패키지)·`timeout`·`xargs`·`watch` 감싸기·`find -exec`·원격 `rsync`도 wait. `package.json`·`Makefile`은 쓰기는 allow하되 그 기간에 쓴 뒤 `npm run`·`make` 실행은 wait. `hired.ts` `canUseTool`의 결재 요청 직전에 `HiredHooks.autoDecide`. 질문은 `Office.answerWhileAway`(비서 연결 자리, 지금은 "대표 부재 중, 알아서 판단하고 진행"). 기록 `🤖 자동결재`, 처리 목록 `autoApproveLog()`(300건), 스냅샷 `autoApprove`. OfficeApi `autoApproveStatus`·`setAutoApprove`·`autoApproveLog`(v2 R — 휴대폰에서도 켜고 끔). 메뉴바 `main/trayMenu.ts`: 요약(작업 중·확인 필요·오늘 완료·오늘 비용), 자동결재, 결재 대기, 직원 전체(팀·랩 하위 메뉴), 전체 멈추기(자동결재도 함께 끔)·할 일 추가(클립보드, 확인 창·detail 4000자)·비서에게 말하기(자리)·휴대폰 연결(켤 때 확인 창), 사무실 열기·종료. 직원 활동·잘린 결재는 가려서 보임(`remoteActivity`). 윈도우 트레이는 툴팁·왼쪽 클릭 열기. 잘못된 `setAutoApprove`는 v2에서 400 invalid_args. 테스트 `scripts/autoApprove.test.mts` |
| 26 | 휴대폰 앱 화면 (모바일 빌드, 안드로이드 1.1 → 0.10.1부터 앱 번호는 PC와 같음) | 같은 renderer를 `pnpm build:mobile`(`vite.mobile.config.mts`·`mobile.html`)로 묶어 `app/dist-mobile/` → APK `assets/web/`. `renderer/mobile/`: 셸 통로(`bridge.ts`, docs/specs/android-bridge.md)·OfficeApi 원격 어댑터(`remoteOffice.ts` — `OFFICE_METHODS` 자동 연결, `pc_only`는 경로 입력 시트·휴대폰에 저장·"PC에서 열어 주세요" 안내로 대신, `confirm_required`는 `window.confirm` 뒤 재호출)·`install.ts`(연결 배너·뒤로 가기·resync·키보드). 배치는 폭 840 기준: 이상은 PC 배치 그대로, 미만은 `layout/PhoneShell.tsx`(상단 바·아래 탭 5칸·더보기·직원 패널 전체 화면 시트·대화상자 아래 시트). 폰 분기는 틀·UI 부품·CSS `phone:` 변형(`[data-shell=mobile]`에서만)으로만 — feature는 `useLayout` 금지(테스트). 지도 두 손가락 확대, 입력 Enter = 줄바꿈. 미리보기 `pnpm preview:mobile`(가짜 셸). 0.9.0 업데이트 안내 `RemoteUpgradeNotice`(한 번, `Settings.isFullAccessNoticeSeen`). 테스트 `scripts/mobile.test.mts` |
| 28 | 비서 (말로 앱 쓰기) | 기획 `docs/specs/secretary.md`·화면 `secretary-ui.md`. **세션** `main/secretary.ts`: 직원과 같은 Agent SDK 세션(직원 목록 밖), 작업 폴더 `userData/secretary`, 기본 도구 전부 끔(`tools: []` — 파일 쓰기·Bash·파일 읽기 없음), `settingSources: []`, 쓰는 도구는 비서 MCP 4개(`read` 조회 20개만 · `propose` 확인 카드 · `propose_edit` 첨삭 카드 · `read_guide` SPEC·CHANGELOG 근거, 설치본은 extraResource). **분류표** `shared/secretaryTools.ts` `SECRETARY_TOOLS: Record<OfficeMethod,…>`(조회 20·변경 41·제외 23+비서 자신 4, 위험도·단계 이름, 인자 모양 `SECRETARY_SIGNATURES`). **확인 카드** `main/secretaryCore.ts`(electron 없음): 제안은 실행하지 않고 카드만, [실행]을 눌러야 `officeHandlers`로 위에서 아래로(앞 단계 결과 `$1.id` 참조, 실패하면 뒤는 건너뜀·[이어서 하기], 한 번만, 10분 만료, [고치기] 값), 첨삭은 적용 직전 원문이 그대로일 때만·[일부 적용]은 줄 덩어리(`shared/textDiff.ts`). OfficeApi `secretaryAsk`·`secretaryRun`·`secretaryCancel`·`secretaryClear`(v2 R), 대화·카드는 스냅샷 `secretary`로(휴대폰도 그대로). 대화 DB `secretary_message` 30일, 세션 id 설정 `secretarySession`. **비용** usage 표 `SECRETARY_ID`(급여 명세서 "비서" 줄·한도 합계 포함, 대시보드 "그중 비서 n", 화면 "오늘 비서 n 토큰"·"이번 답 n 토큰"), 토큰 한도 100%면 제안 도구 쉼. **자동결재 연결** `office.answerWhileAway` = 비서 판정(답함/둠, 빠른 모델·60초 상한, 실패하면 예전 고정 답) + 비서 대화에 기록. **화면** 사이드바 맨 위 "비서"(`features/secretary/*`), 상단 바 "비서 ⌘K"·⌘K/Ctrl+K 빠른 창(바꾸는 일은 비서 화면으로 넘김), 폰 상단 바 비서 버튼, 메뉴바 "비서에게 말하기"(`SECRETARY_FOCUS`), 답의 `#view=…` 링크는 앱 안 화면 이동. 테스트 `scripts/secretary.test.mts` |
| 29 | 0.12.1: 파티션·가벽 4종 · 소품 연출 · 휴대폰 재연결 · 리드 멈춤 방지 | **파티션·가벽** 기획 `docs/specs/partition-items.md`. 상품 `shared/economy.ts`(낮은 패브릭·낮은 유리·화이트 가벽·원목 가벽), 길막음·가려짐 규칙은 `shared/iso/furniture.ts`(낮은 것도 지나가지 못하고 돌아감, 높은 가벽 뒤 직원은 반투명). **소품 연출** 공통 규칙 `shared/iso/propMotion.ts` 표 `PROP_MOTION`(A 늘 · B 켜기·끄기 · C 쓸 때 · D 업무 상태 · E 지나가면 · F 행사 · G 시간대, 동시 동작 상한, 켜짐 저장 `shop.grid`), 시트 생성기 `scripts/motion-pilot.mts`. **리드 멈춤 방지** `shared/leadNudge.ts`: 리드가 "맡길게요" 류 약속만 하고 위임·승인 대기 기획안이 없으면 한 번 다시 지시(자동 점검으로 시작된 턴 뒤에는 다시 점검 안 함, 4개 언어 감지). **휴대폰 재연결** `android/.../web/EventStream.kt`: 앱 복귀·네트워크 전환 시 즉시 재연결(`reconnectNow`), 끊김은 유예 뒤에도 안 붙을 때만 화면에 표시, 재시도 간격 점진 증가·지터, 서버가 준 `retryAfter` 존중. 테스트 `scripts/partition.test.mts`·`propMotion.test.mts`·`leadNudge.test.mts`·안드로이드 `GraceReporterTest.kt` |
| 30 | 0.12.2: 단체방 결재·질문 바로 답하기 · 직원 카드/목록 보기 · 결재함으로 질문 · 업데이트 1시간 확인 · 백그라운드 작업 멈춤 · 업데이트 소식 표시 | **단체방 결재·질문 카드** `shared/chatApproval.ts`(요청·질문에 바로 승인·반려·답, 처리 결과 표시, 테스트 `scripts/chatApproval.test.mts`). **직원 보기 전환** `renderer/features/StaffRow.tsx`·`staffView.ts`(카드/목록, 고른 보기 유지). **업데이트 확인** `main/updates.ts`(1시간 주기 + 창 포커스·잠자기 깨움 때 확인), `shared/updateCheck.ts`(테스트 `updateCheck.test.mts`). **백그라운드 작업 멈춤** `shared/leadNudge.ts`·`main/hired.ts`(테스트 `leadNudge.test.mts`). **직원 질문 지침** `i18n/dict/staff.ts`(결재함 질문으로 묻기). **업데이트 소식 줄** `renderer/features/Sidebar.tsx`. |
| 31 | 0.15.0: 바깥 UI 색 테마·화면 모드 | `Settings.uiMode`(system·light·dark)·`uiTheme`(6종)를 `shared/uiTheme.ts`(값·`resolveMode`·`sanitizeUi`·`WINDOW_BG`)에 두고, renderer `lib/uiTheme.ts`가 `<html data-theme data-mode>`에 반영(색은 `index.css` 토큰). 첫 페인트 전 `index.html` 인라인 스크립트가 localStorage 캐시(`office.uiTheme`)로 먼저 칠하고, main은 `nativeTheme.themeSource`·창 배경·윈도우 제목 표시줄 색을 같은 모드에 맞춘다. 사무실 그림 테마(`theme`·`dayNight`)와는 별개. 폰 원격(`v2.ts`)은 `uiMode`·`uiTheme` 변경을 PC에서만 허용. ui 컴포넌트(버튼·카드·입력·선택·대화상자·배지)를 색 토큰으로 바꾸고 선택 상자 꺾쇠·Page 하단 여백·카드 hover 클리핑을 손봄. 설정 화면은 왼쪽 분류(일반·AI·업무·사무실·연결)로 개편(폰은 위쪽 가로 탭, 모양 설정은 PC 전용 안내). 스태프 팩 직무는 직접 입력한 이름(1~40자)도 허용. 검증: tsc·테스트 통과(`uiTheme.test.mts` 추가). |
| 32 | 0.16.1: 팀·랩 대화방, 자율 진행, 결재 정리, 사이드바 묶음·탭 | chat 표 `room` 칸(비면 전체, 팀 id, `lab:<랩 id>`), 방별 최근 300개, 방 범위 멘션·받는 사람 로직. 자율 진행 `shared/autonomy.ts`(업무별 스위치+전체 '완전 자율', 켜기는 PC만). 결재 정리: 직접 지시 시 대기 결재 철회·글 질문 대체, 답한 질문을 지식 창고 '결정'으로 저장하고 `shared/askDecision.ts`로 같은 질문 자동 답. 직원 카드 안 읽은 보고 배지(`shared/unreadReports.ts`, `markReportsRead`). 사이드바 16→10묶음+위쪽 탭, 직원 마켓 디자이너·CS·마케터, 사무실 밖 실수 배율·확대·이동, 업데이트 진행률 버튼 표시. 검증: tsc·테스트 통과. |

검증: 타입 체크 통과, 개발 앱에서 화면·장비 목록·git 변경 읽기 확인. 랩 위임·외부 직원 해고/채용·커밋/PR·회사 Lv.3 이상 화면은 실제로 실행해 보지 않음(직원 없음·되돌릴 수 없는 동작이라 보류).

## 7. 열린 질문
- 이미지 생성 에셋으로 교체할 시점·스타일
- 패키징(배포용 빌드) 방식
- ~~Agent SDK 인증·과금~~ → 로컬 Claude Code 로그인으로 동작 확인 (docs/spike-integration.md)
