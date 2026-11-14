<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**말로 시키면 AI 직원들이 일하는 나만의 사무실.**

Claude와 GPT 직원을 뽑아 일을 맡기고, 중요한 일만 결재하고, 끝나면 보고받는 무료 오픈소스 앱이에요.<br>명령어 창도, 어려운 설정도 필요 없어요.

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="최신 릴리즈" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=최신%20릴리즈"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="다운로드" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=다운로드"></a>
<img alt="platform" src="https://img.shields.io/badge/맥%20%C2%B7%20윈도우%20%C2%B7%20안드로이드-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-1.0.gif" width="800" alt="AI Office 실제 화면 — 자리에서 일하는 직원, 결재 요청, 보고">
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
| 🧑‍💼 | **비서에게 먼저 말하세요** | 비서가 결재를 카드로 바로 받게 하고, 밤사이 일을 요약하고, 긴 대화도 이어 가요. 직원이 만든 파일도 찾아 줘요. |
| 👥 | **Claude와 GPT 직원을 함께** | 직원마다 Claude와 GPT 중 어느 쪽으로 일할지 고를 수 있어요. 하나만 있어도 시작할 수 있어요. |
| 💬 | **메신저 같은 대화방** | 말로 시키면 '받음 → 작업 중 → 완료'가 보여요. 답장·예약·끼어들기도 돼요. |
| ✅ | **중요한 일은 결재로** | 위험한 일은 무엇을 하는지 한 줄로 알려 주고 먼저 물어요. 바꾼 파일은 되돌릴 수 있어요. |
| 🧭 | **팀장이 나눠서 진행** | 큰 일을 팀장에게 주면 계획을 나누고, 확인받은 뒤 진행해 보고해요. |
| 📱 | **휴대폰에서도** | 안드로이드 앱을 연결하면 결재·대화를 자리를 비워도 해요. 누르면 바로 '처리 중'으로 바뀌어요. |
| 🎮 | **내 취향대로** | 색 테마 10종과 레트로 오피스 게임 테마, 일할수록 자라는 사무실이에요. |

## 🚀 빠른 시작

1. **설치하고 로그인** — 위에서 내 컴퓨터용을 받아 열어요. 그 컴퓨터에 Claude 또는 GPT(ChatGPT)가 로그인돼 있어야 해요.
2. **첫 직원 뽑기** — 직무를 고르고 Claude와 GPT 중 어느 쪽으로 일할지 정해요.
3. **일 맡기고 결재하기** — 단체방이나 비서에게 말로 시키고, 결재를 승인하고, 끝나면 보고를 받아요.

## 🔗 링크

[소개 사이트](https://engchoon.github.io/ai-office/) · [불편한 점·의견 보내기](https://github.com/EngChooN/ai-office/issues/new) · [모든 릴리즈](https://github.com/EngChooN/ai-office/releases/latest) · [업데이트 소식](CHANGELOG.md) · [후원하기](https://fairy.hada.io/@ai-office)

---

## 프로젝트 소개

Claude 직원과 GPT 직원을 함께 **고용**해 하나의 사무실처럼 일을 맡기고, 결재하고, 보고받는 무료 오픈소스 데스크톱 앱(Electron)입니다. 직원은 Claude Code 또는 Codex(GPT) 세션입니다. 예전 이름은 Claude Office이며, 첫 실행 때 기존 데이터를 자동으로 복사해 옵니다(옛 폴더는 그대로 둡니다).

## 설치 전에 읽어 주세요

**맥**
- 위 버튼으로 받은 `.dmg`를 열어 Applications로 드래그하세요.
- Apple Silicon 전용이고 서명·공증이 없어요. 처음 열 때 "확인되지 않은 개발자" 경고가 나오면 시스템 설정 › 개인정보 보호 및 보안 › "그래도 열기"를 누르세요.

**윈도우**
- `AI-Office-win-x64-Setup.exe`를 받아 실행하면 사용자 폴더에 설치되고 시작 메뉴·바탕화면에 바로가기가 생겨요(관리자 권한 불필요). 업데이트는 앱 안에서 눌러 진행돼요.
- 서명이 없어서 처음 열 때 SmartScreen "Windows의 PC 보호" 창이 뜨면 "추가 정보 › 실행"을 누르세요.
- 예전에 zip을 풀어 쓰던 분은 Setup.exe로 설치한 뒤 옛 폴더를 지우세요(설정과 기록은 그대로 이어져요).
- 데이터는 `%APPDATA%\AI Office\office.db`에 있어요.
- 아직 맥에서만 되는 것: 앱 밖에서 연 직원의 알림·질문 받기(hooks), 화면 캡처. 작업 결과 검토(커밋·PR)는 Git for Windows·GitHub CLI가 있어야 하고 실제 확인 전이에요.

**공통 요구 사항**
- 그 컴퓨터에 Claude(Claude Code) 또는 GPT(ChatGPT·Codex) 중 하나 이상이 로그인돼 있어야 해요. 둘 다 연결하면 직원마다 고를 수 있어요. 직원은 그 계정으로 일하고 비용도 그 계정에 청구돼요.

## 휴대폰 연결

- 설정 › 휴대폰 연결에서 켜고 QR로 안드로이드 앱을 연결하세요. **기본은 꺼짐**이에요. 켜면 Tailscale 주소로만 접속되는 방식이 기본이고, 같은 네트워크 전용·공유기 포트포워딩 방식도 고를 수 있어요. 포트포워딩은 이 PC의 포트(기본 47900)가 인터넷 쪽으로 열리니 쓰지 않을 때는 끄세요.
- 휴대폰의 결재·지시는 PC에서 직접 하는 것과 힘이 같아요. 휴대폰을 잃어버리면 "QR 다시 만들기"를 누르세요.
- 알림은 15분쯤마다 확인하는 방식이라 수십 분 늦을 수 있어요. PC의 원격 키가 바뀌면 QR을 다시 만들어 다시 연결하세요.
- 휴대폰 앱은 PC와 같은 버전을 쓰세요. 앱 빌드·서명 지문은 `android/README.md`에 있어요.

## 개발자용

```bash
cd app
pnpm install
pnpm start
```

- 스택: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite(`node:sqlite`) · Claude Agent SDK · Codex app-server(GPT 직원)
- 로그인: 별도 API 키 없이 이 컴퓨터의 Claude Code·Codex 로그인을 그대로 써요. 연결 상태는 설정에서 공급자별로 봐요.
- 데이터: 맥 `~/Library/Application Support/AI Office/office.db`
- 데이터 폴더 하나는 한 앱만 써요(`office.lock`). 설치본이 켜져 있으면 개발 앱은 "이미 켜져 있어요"를 띄우고 꺼져요. 설치본을 켠 채 개발 앱·QA를 띄우려면 다른 폴더를 주세요: `AI_OFFICE_USER_DATA=~/ai-office-dev pnpm start` (옛 이름 `CLAUDE_OFFICE_USER_DATA`도 인식해요)
- 맥 설치 파일 만들기: `cd app && pnpm make` → `app/out/make/dmg/arm64/AI-Office.dmg`
- 윈도우 설치 파일 만들기: `cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe`. 맥에는 wine이 없어 GitHub Actions `win-installer`로 만들어요. 맥에서도 `pnpm-workspace.yaml`의 `supportedArchitectures`로 윈도우 x64용 claude 실행 파일 패키지를 받아 둘 수 있어요(설정을 바꾼 뒤 `pnpm install` 한 번).
- 폴더: `app/`(앱: `src/main` 메인 프로세스, `src/renderer` 화면, `src/shared` 공용 타입) · `android/`(휴대폰 앱) · `site/`(소개 사이트) · `docs/`(명세·조사 기록)
- 문서: [CONTEXT.md](CONTEXT.md)(처음 보는 사람을 위한 맥락, 직원 두 종류 설명 포함) · [intro.html](intro.html)(소개 슬라이드) · [SPEC.md](SPEC.md)(결정된 명세) · [CHANGELOG.md](CHANGELOG.md)(변경 이력)
