[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

# Claude Office

내 Claude Code 세션들을 **직원**으로 삼아 하나의 사무실처럼 보고·부리는 개인 PoC (Electron 데스크톱 앱).

- 상태: **0.12.2** (2026-10-26) — 사무실 맵(팀 구역·회의실·휴게실) · 팀/팀장 위임 · 업무 보드 · 결재함 · 단체방 · 회의 · 예약 업무 · 보고서 · 급여 명세서 · 꾸미기
- 스택: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite(`node:sqlite`) · Claude Agent SDK

## 설치 (0.12.2)
- `app/out/make/dmg/arm64/Claude Office.dmg` 를 열어 Applications로 드래그
- Apple Silicon 전용 · 서명/공증 없음 → 처음 열 때 "확인되지 않은 개발자" 경고가 나오면 시스템 설정 › 개인정보 보호 및 보안 › "그래도 열기"
- 필요 조건: 그 맥에서 Claude Code에 로그인되어 있을 것 (직원은 그 계정으로 일하고 비용도 그 계정에 청구)
- 다시 빌드: `cd app && pnpm make`

## 윈도우 (1차 · 시험판)
- 빌드: `cd app && pnpm install && pnpm make:win` → `app/out/make/zip/win32/x64/*.zip` (설치 없이 풀어서 `claude-office.exe` 실행)
  - 맥에서 만들어도 된다. `pnpm-workspace.yaml`의 `supportedArchitectures`로 윈도우 x64용 claude 실행 파일 패키지까지 받아 둔다(설정을 바꾼 뒤 `pnpm install` 한 번 필요)
- 서명 없음 → 처음 열 때 SmartScreen "Windows의 PC 보호" 창이 뜨면 "추가 정보 › 실행"
- 데이터: `%APPDATA%\Claude Office\office.db`
- 아직 맥 전용: 외부 직원 알림·질문 받기(hooks), 화면 캡처. 작업 결과 검토(커밋·PR)는 Git for Windows·GitHub CLI가 있어야 하고 실제 확인 전

## 휴대폰 원격 (0.8.0~)
- 설정 › 휴대폰 연결에서 켜고 QR로 안드로이드 앱(`android/`)을 연결한다. **기본 꺼짐.** 켜면 이 PC의 포트(기본 47900)가 인터넷 쪽으로 열리니 쓰지 않을 때는 끈다.
- 휴대폰의 결재·지시는 PC에서 직접 하는 것과 같은 힘이 있다. 잃어버리면 "QR 다시 만들기".
- 알림은 15분쯤마다 확인하는 방식이라 수십 분 늦을 수 있다. PC 원격 키가 바뀌면(인증서 고정) QR을 다시 만들어 다시 연결한다.
- 호환: 데스크톱 **0.8.0 이상** ↔ 안드로이드 **1.0.x** ↔ 프로토콜 **v1** (`docs/specs/remote-protocol-v1.md`). 데스크톱 **0.9.0 이상** ↔ 안드로이드 **1.1.x** ↔ 프로토콜 **v2**(PC 화면 전체, `docs/specs/remote-protocol-v2.md`) — 1.0.x 앱은 0.9.0 PC에도 v1로 계속 연결된다. **0.10.1부터 폰 앱 번호는 PC와 같다(PC 0.10.1 ↔ 폰 0.10.1, 위의 1.x 표기는 그 이전 이력).** 앱 빌드·서명 지문은 `android/README.md`, 릴리스 노트는 `docs/release-notes/0.8.0.md`.

## 개발 실행
```bash
cd app
pnpm install
pnpm start
```
- 로그인: 별도 API 키 없이 이 맥의 Claude Code 로그인을 그대로 쓴다.
- 데이터: `~/Library/Application Support/Claude Office/office.db`
- 데이터 폴더 하나는 한 앱만 쓴다(`office.lock`). 설치본이 켜져 있으면 개발 앱은 "이미 켜져 있어요"를 띄우고 꺼진다. 설치본을 켠 채 개발 앱·QA를 띄우려면 다른 폴더를 준다: `CLAUDE_OFFICE_USER_DATA=~/claude-office-dev pnpm start`

## 직원 두 종류
| | 고용 직원 | 외부 직원 |
|---|---|---|
| 정체 | 앱이 Agent SDK로 띄운 세션 | 터미널·데스크톱 앱에서 이미 실행 중인 세션 |
| 상태 | 실시간 (스트림) | `~/.claude/sessions` 레지스트리 2초 폴링 (+ 옵트인 hooks) |
| 지시·결재 | 앱에서 | 원래 창에서 |
| 오늘 한 일 | 앱 DB | 트랜스크립트 jsonl |

## 폴더
- `app/` — 앱 (`src/main` 메인 프로세스, `src/renderer` 화면, `src/shared` 공용 타입)
- `spikes/` — 1단계 연동 검증 스크립트
- `docs/` — 조사·스파이크 기록

## 문서
- [CONTEXT.md](CONTEXT.md) — 처음 보는 사람을 위한 맥락 문서 · [intro.html](intro.html) — 소개 슬라이드(브라우저로 열기) · [SPEC.md](SPEC.md) — 결정된 명세 · [CHANGELOG.md](CHANGELOG.md) — 변경 이력 · [docs/spike-integration.md](docs/spike-integration.md)
