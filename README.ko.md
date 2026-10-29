<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**Claude·GPT 직원을 고용해, 사무실처럼 일을 맡기세요.**

말로 일을 시키고, 중요한 일만 결재하고, 끝나면 보고받는 무료 오픈소스 데스크톱 앱입니다.<br>명령어 창도, 어려운 설정도 필요 없어요.

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="최신 릴리즈" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=최신%20릴리즈"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="다운로드" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=다운로드"></a>
<img alt="platform" src="https://img.shields.io/badge/맥%20%C2%B7%20윈도우%20%C2%B7%20안드로이드-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-10s.gif" width="800" alt="AI Office 실제 화면 — 자리에서 일하는 직원, 결재 요청, 보고">
</p>

## ⬇️ 다운로드

<p align="center">
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-mac-arm64.dmg"><img alt="macOS" src="https://img.shields.io/badge/macOS-Download-000000?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-win-x64-Setup.exe"><img alt="Windows" src="https://img.shields.io/badge/Windows-Download-0078D4?style=for-the-badge&logo=windows&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-android.apk"><img alt="Android" src="https://img.shields.io/badge/Android-Download-3DDC84?style=for-the-badge&logo=android&logoColor=white"></a>
</p>

무료예요. 컴퓨터에 **Claude** 또는 **GPT(ChatGPT)** 계정 중 하나만 로그인돼 있으면 되고, 따로 가입하거나 API 키를 만들 필요는 없어요.

> 처음 열 때 나오는 경고, 요구 사항, 윈도우·휴대폰 안내는 [설치 전에 읽어 주세요](#설치-전에-읽어-주세요)에 있어요.

## ✨ 이런 걸 할 수 있어요

| | 기능 | 설명 |
|:-:|---|---|
| 👥 | **Claude와 GPT 직원을 함께** | 직원마다 Claude와 GPT 중 어느 쪽으로 일할지 고를 수 있어요. 하나만 있어도 시작할 수 있어요(GPT 직원은 베타). |
| 💬 | **뽑고, 말로 시키기** | 직무와 모습을 고르면 준비 끝. 단체방에서 @이름으로 부르면 되고, 아무도 안 부르면 알맞은 직원이 받아요. |
| ✅ | **중요한 일은 결재로** | 파일을 바꾸거나 명령을 실행하는 일은 결재함에 먼저 올라와요. 마음에 안 들면 한 번에 되돌릴 수 있어요. |
| 🧑‍💼 | **팀장이 나눠서 진행** | 큰 일을 팀장에게 주면 계획을 세워 나누고, 확인을 받은 뒤 진행해 보고해요. 진행은 업무 보드에서 봐요. |
| 🏢 | **자라는 사무실** | 누가 일하고 누가 기다리는지 한눈에 보고, 레벨이 오르면 사무실이 넓어져요. 가구로 꾸밀 수도 있어요. |
| 📱 | **휴대폰에서도** | 안드로이드 앱을 연결하면 대시보드·결재함·단체방을 자리를 비워도 쓸 수 있어요. |

## 🚀 빠른 시작

1. **설치하고 로그인** — 위에서 내 컴퓨터용을 받아 열어요. 그 컴퓨터에 Claude 또는 GPT(ChatGPT)가 로그인돼 있어야 해요.
2. **첫 직원 뽑기** — 직무를 고르고 Claude와 GPT 중 어느 쪽으로 일할지 정해요. 자리에 앉으면 바로 준비해요.
3. **일 맡기고 결재하기** — 단체방에서 말로 시키고, 결재함에서 승인하고, 끝나면 보고를 받아요.

## 🔗 링크

[소개 사이트](https://engchoon.github.io/ai-office/) · [불편한 점·의견 보내기](https://github.com/EngChooN/ai-office/issues/new) · [모든 릴리즈](https://github.com/EngChooN/ai-office/releases/latest)

---

## 프로젝트 소개

Claude 직원과 GPT 직원을 함께 **고용**해 하나의 사무실처럼 일을 맡기고, 결재하고, 보고받는 무료 오픈소스 데스크톱 앱 (Electron). 직원은 Claude Code 또는 Codex(GPT) 세션입니다. 예전 이름은 Claude Office이며, 첫 실행 때 기존 데이터를 자동으로 복사해 옵니다(옛 폴더는 그대로 둡니다).

- 상태: **0.15.1** (2026-10-29) — GPT 직원(베타) · 사무실 맵(팀 구역·회의실·휴게실) · 팀/팀장 위임 · 업무 보드 · 결재함 · 단체방 · 회의 · 예약 업무 · 보고서 · 급여 명세서 · 꾸미기
- 스택: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite(`node:sqlite`) · Claude Agent SDK · Codex app-server(GPT 직원)

## 설치 전에 읽어 주세요
- 위 버튼으로 받은 `.dmg`를 열어 Applications로 드래그 (직접 빌드했다면 `app/out/make/dmg/arm64/AI-Office.dmg`)
- Apple Silicon 전용 · 서명/공증 없음 → 처음 열 때 "확인되지 않은 개발자" 경고가 나오면 시스템 설정 › 개인정보 보호 및 보안 › "그래도 열기"
- 필요 조건: 그 맥에서 Claude(Claude Code) 또는 GPT(ChatGPT·Codex) 중 하나 이상에 로그인되어 있을 것. 둘 다 연결하면 직원마다 고를 수 있다 (직원은 그 계정으로 일하고 비용도 그 계정에 청구)
- 다시 빌드: `cd app && pnpm make`

## 윈도우 (1차 · 시험판)
- 설치: `AI-Office-win-x64-Setup.exe`를 내려받아 실행하면 사용자 폴더에 설치되고 시작 메뉴·바탕화면에 바로가기가 생겨요(관리자 권한 불필요). 이후 업데이트는 앱 안에서 눌러 새 Setup.exe로 진행돼요
- 빌드: `cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe` (맥에는 wine이 없어 설치 파일을 못 만들어요. GitHub Actions `win-installer`로 빌드)
  - 맥에서 만들어도 된다. `pnpm-workspace.yaml`의 `supportedArchitectures`로 윈도우 x64용 claude 실행 파일 패키지까지 받아 둔다(설정을 바꾼 뒤 `pnpm install` 한 번 필요)
- 서명 없음 → Setup.exe를 처음 열 때 SmartScreen "Windows의 PC 보호" 창이 뜨면 "추가 정보 › 실행"
- 예전에 zip을 풀어 쓰던 분: Setup.exe로 설치한 뒤 옛 폴더를 지우면 돼요(설정과 기록은 그대로 이어져요)
- 데이터: `%APPDATA%\AI Office\office.db`
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
- 로그인: 별도 API 키 없이 이 맥의 Claude Code·Codex 로그인을 그대로 쓴다. 연결 상태는 설정에서 공급자별로 본다.
- 데이터: `~/Library/Application Support/AI Office/office.db`
- 데이터 폴더 하나는 한 앱만 쓴다(`office.lock`). 설치본이 켜져 있으면 개발 앱은 "이미 켜져 있어요"를 띄우고 꺼진다. 설치본을 켠 채 개발 앱·QA를 띄우려면 다른 폴더를 준다: `CLAUDE_OFFICE_USER_DATA=~/claude-office-dev pnpm start`

## 직원 두 종류
| | 고용 직원 | 외부 직원 |
|---|---|---|
| 정체 | 앱이 띄운 세션 (Claude: Agent SDK · GPT: Codex app-server) | 터미널·데스크톱 앱에서 이미 실행 중인 Claude Code·Codex 세션 |
| 상태 | 실시간 (스트림) | Claude: `~/.claude/sessions` 레지스트리 2초 폴링 (+ 옵트인 hooks) · Codex: `~/.codex/sessions` 기록 파일로 보기 전용 |
| 지시·결재 | 앱에서 | 원래 창에서 |
| 오늘 한 일 | 앱 DB | 트랜스크립트 jsonl |

## 폴더
- `app/` — 앱 (`src/main` 메인 프로세스, `src/renderer` 화면, `src/shared` 공용 타입)
- `spikes/` — 1단계 연동 검증 스크립트
- `docs/` — 조사·스파이크 기록

## 문서
- [CONTEXT.md](CONTEXT.md) — 처음 보는 사람을 위한 맥락 문서 · [intro.html](intro.html) — 소개 슬라이드(브라우저로 열기) · [SPEC.md](SPEC.md) — 결정된 명세 · [CHANGELOG.md](CHANGELOG.md) — 변경 이력 · [docs/spike-integration.md](docs/spike-integration.md)
