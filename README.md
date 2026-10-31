<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**Hire Claude &amp; GPT staff. Run them like one office.**

A free, open-source desktop app: hand out work in plain words, approve the important parts, and get a report when it's done.<br>No command line. No hard setup.

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="latest release" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=latest%20release"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="downloads" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=downloads"></a>
<img alt="platform" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Android-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-10s.gif" width="800" alt="AI Office in action — staff at their desks, an approval request, and a report">
</p>

## ⬇️ Download

<p align="center">
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-mac-arm64.dmg"><img alt="macOS" src="https://img.shields.io/badge/macOS-Download-000000?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-win-x64-Setup.exe"><img alt="Windows" src="https://img.shields.io/badge/Windows-Download-0078D4?style=for-the-badge&logo=windows&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-android.apk"><img alt="Android" src="https://img.shields.io/badge/Android-Download-3DDC84?style=for-the-badge&logo=android&logoColor=white"></a>
</p>

Free. You only need to be signed in to **Claude** or **GPT (ChatGPT)** on your computer — no separate account or API key.

> First-launch warnings, requirements and Windows/phone details are in [Before you install](#before-you-install).

## ✨ What you can do

| | What | Description |
|:-:|---|---|
| 👥 | **Claude and GPT staff together** | Pick Claude or GPT for each employee. Either one alone is enough to start (GPT staff are beta). |
| 💬 | **Hire, then just tell them** | Choose a role and a look, then @mention staff in the group chat. The right person picks up unassigned work. |
| ✅ | **Approve what matters** | File changes and commands wait in your approval inbox first. One click to undo what staff changed. |
| 🧑‍💼 | **Team leads split big jobs** | Give a big task to a team lead: it plans, splits, asks you to confirm, then reports. Track it on the task board. |
| 🏢 | **A map that grows** | See who is working or waiting at a glance. The office grows with your level and you can decorate it. |
| 📱 | **Your phone, too** | Connect the Android app to use the dashboard, approvals and group chat away from your desk. |

## 🚀 Quick start

1. **Install & sign in** — Download for your computer above and open it. Make sure Claude or GPT (ChatGPT) is signed in on that computer.
2. **Hire your first employee** — Pick a role and which AI (Claude or GPT) they use. They sit down and get ready.
3. **Give a task, then approve** — Ask in the group chat, approve in the inbox, and read the report when it's done.

## 🔗 Links

[Website](https://engchoon.github.io/ai-office/) · [Report a problem / feedback](https://github.com/EngChooN/ai-office/issues/new) · [All releases](https://github.com/EngChooN/ai-office/releases/latest)

---

## About this project

A free, open-source desktop app (Electron) where you **hire** Claude staff and GPT staff together and run them like one office: hand out work, approve, and get reports. Staff are Claude Code or Codex (GPT) sessions. (Formerly named Claude Office — existing data is copied automatically on first launch; the old folder is left untouched.)

- Status: **0.16.3** (2026-10-31) — GPT staff (beta) · Office map (team zones, meeting rooms, lounge) · Team / team-lead delegation · Task board · Approval inbox · Group chat · Meetings · Scheduled tasks · Reports · Payslips · Decorating
- Stack: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite (`node:sqlite`) · Claude Agent SDK · Codex app-server (GPT staff)

## Before you install
- Download the `.dmg` from the button above, open it and drag the app into Applications (if you build it yourself, it is `app/out/make/dmg/arm64/AI-Office.dmg`)
- Apple Silicon only · Not signed or notarized → if you see an "unidentified developer" warning the first time you open it, go to System Settings › Privacy & Security › "Open Anyway"
- Requirement: at least one of Claude (Claude Code) or GPT (ChatGPT · Codex) must be signed in on that Mac. With both connected you choose per employee (staff work under that account, and usage is billed to it)
- Rebuild: `cd app && pnpm make`

## Windows (first release · beta)
- Install: download and run `AI-Office-win-x64-Setup.exe`. It installs into your user folder and adds Start menu and desktop shortcuts (no admin rights needed). Later updates run from inside the app using a new Setup.exe
- Build: `cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe` (a Mac has no wine, so it cannot build the installer; build it with the GitHub Actions `win-installer` workflow)
  - You can build it on a Mac too. `supportedArchitectures` in `pnpm-workspace.yaml` also fetches the claude executable package for Windows x64 (after changing the setting, run `pnpm install` once)
- Not signed → if the SmartScreen "Windows protected your PC" window appears when you first open Setup.exe, click "More info › Run anyway"
- If you used the old zip: install with Setup.exe, then delete the old folder (your settings and history carry over)
- Data: `%APPDATA%\AI Office\office.db`
- Still Mac-only: external staff notifications and question handling (hooks), and screen capture. Reviewing task results (commit · PR) requires Git for Windows and GitHub CLI, and has not been verified in practice yet

## Phone remote (0.8.0 and later)
- Turn it on under Settings › Phone connection, then connect the Android app (`android/`) by scanning the QR code. **Off by default.** When on, this PC's port (default 47900) is opened toward the internet, so turn it off when not in use.
- Approvals and instructions from the phone carry the same power as doing them on the PC. If you lose the phone, use "Regenerate QR".
- Notifications are checked about every 15 minutes, so they can be delayed by tens of minutes. If the PC's remote key changes (certificate pinning), regenerate the QR code and reconnect.
- Compatibility: Desktop **0.8.0+** ↔ Android **1.0.x** ↔ protocol **v1** (`docs/specs/remote-protocol-v1.md`). Desktop **0.9.0+** ↔ Android **1.1.x** ↔ protocol **v2** (entire PC screen, `docs/specs/remote-protocol-v2.md`) — 1.0.x apps keep connecting to 0.9.0 PCs over v1. **From 0.10.1, the phone app version matches the PC (PC 0.10.1 ↔ phone 0.10.1; the 1.x notation above is earlier history).** For the app build and signing fingerprint see `android/README.md`; release notes for 0.8.0 are in `docs/release-notes/0.8.0.md`.

## Development
```bash
cd app
pnpm install
pnpm start
```
- Sign-in: no separate API key is needed; it uses the Claude Code and Codex sign-ins on this Mac as is. Connection status per provider is shown in Settings.
- Data: `~/Library/Application Support/AI Office/office.db`
- One data folder can be used by only one app at a time (`office.lock`). If the installed app is running, the dev app shows "already running" and quits. To run the dev app or QA while the installed app is open, give it a different folder: `CLAUDE_OFFICE_USER_DATA=~/claude-office-dev pnpm start`

## Two kinds of staff
| | Hired staff | External staff |
|---|---|---|
| Identity | A session the app starts (Claude: Agent SDK · GPT: Codex app-server) | A Claude Code or Codex session already running in a terminal or desktop app |
| Status | Real-time (stream) | Claude: polls the `~/.claude/sessions` registry every 2 seconds (+ opt-in hooks) · Codex: view-only from `~/.codex/sessions` log files |
| Instructions & approvals | In the app | In the original window |
| Today's work | App DB | Transcript jsonl |

## Folders
- `app/` — the app (`src/main` main process, `src/renderer` screens, `src/shared` shared types)
- `spikes/` — Stage 1 integration verification scripts
- `docs/` — research and spike records

## Documents
- [CONTEXT.md](CONTEXT.md) — background document for newcomers · [intro.html](intro.html) — intro slides (open in a browser) · [SPEC.md](SPEC.md) — decided spec · [CHANGELOG.en.md](CHANGELOG.en.md) — change history · [docs/spike-integration.md](docs/spike-integration.md)
