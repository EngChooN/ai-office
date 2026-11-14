<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**Just say it — your own office of AI staff gets to work.**

A free, open-source app: hire Claude and GPT staff, hand out work in plain words, approve only the important parts, and get a report when it's done.<br>No command line. No hard setup.

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="latest release" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=latest%20release"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="downloads" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=downloads"></a>
<img alt="platform" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Android-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-1.0.gif" width="800" alt="AI Office in action — staff at their desks, an approval request, and a report">
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

| | Feature | What it does |
|:-:|---|---|
| 🧑‍💼 | **Talk to your secretary first** | The secretary takes approvals as cards right in its reply, sums up what happened overnight, and keeps long conversations going. It also finds files your staff made. |
| 👥 | **Claude and GPT staff together** | Choose per employee whether they work with Claude or GPT. One of them is enough to start. |
| 💬 | **A chat room like a messenger** | Give an order and watch it go "received → working → done". Replies, scheduling and cutting in work too. |
| ✅ | **Important things go through approval** | For risky actions, a one-line note says what will happen, and you are asked first. Changed files can be undone. |
| 🧭 | **A team lead splits the work** | Hand a big job to a team lead: it splits the plan, gets your OK, carries it out and reports. |
| 📱 | **On your phone too** | Connect the Android app to approve and chat while you're away. A tap switches to "Processing" right away. |
| 🎮 | **Your way** | 10 color themes, a retro office game theme, and an office that grows as your staff work. |

## 🚀 Quick start

1. **Install and sign in** — download the one for your computer above and open it. Claude or GPT (ChatGPT) must be signed in on that computer.
2. **Hire your first employee** — pick a role and choose whether it works with Claude or GPT.
3. **Hand out work and approve** — tell the group chat or your secretary in plain words, approve, and get a report when it's done.

## 🔗 Links

[Website](https://engchoon.github.io/ai-office/) · [Report a problem / feedback](https://github.com/EngChooN/ai-office/issues/new) · [All releases](https://github.com/EngChooN/ai-office/releases/latest) · [What's new](CHANGELOG.en.md) · [Support us](https://fairy.hada.io/@ai-office)

---

## About this project

A free, open-source desktop app (Electron) where you **hire** Claude staff and GPT staff together and run them like one office: hand out work, approve, and get reports. Staff are Claude Code or Codex (GPT) sessions. (Formerly named Claude Office — existing data is copied automatically on first launch; the old folder is left untouched.)

## Before you install

**Mac**
- Open the `.dmg` from the button above and drag the app into Applications.
- Apple Silicon only, not signed or notarized. If an "unidentified developer" warning appears the first time you open it, go to System Settings › Privacy & Security › "Open Anyway".

**Windows**
- Download and run `AI-Office-win-x64-Setup.exe`. It installs into your user folder and adds Start menu and desktop shortcuts (no admin rights needed). Updates run from inside the app.
- Not signed. If the SmartScreen "Windows protected your PC" window appears the first time you open Setup.exe, click "More info › Run anyway".
- If you used the old zip: install with Setup.exe, then delete the old folder (your settings and history carry over).
- Data is in `%APPDATA%\AI Office\office.db`.
- Still Mac-only: notifications and question handling for staff started outside the app (hooks), and screen capture. Reviewing task results (commit · PR) requires Git for Windows and GitHub CLI, and has not been verified in practice yet.

**Requirement for both**
- At least one of Claude (Claude Code) or GPT (ChatGPT · Codex) must be signed in on that computer. With both connected you choose per employee. Staff work under that account, and usage is billed to it.

## Phone connection

- Turn it on under Settings › Phone connection, then connect the Android app by scanning the QR code. **Off by default.** When on, it accepts connections only over your Tailscale address by default; you can also choose same-network only or router port forwarding. Port forwarding opens this PC's port (default 47900) toward the internet, so turn it off when not in use.
- Approvals and instructions from the phone carry the same power as doing them on the PC. If you lose the phone, use "Regenerate QR".
- Notifications are checked about every 15 minutes, so they can be delayed by tens of minutes. If the PC's remote key changes, regenerate the QR code and reconnect.
- Use the same version for the phone app and the PC. For the app build and signing fingerprint, see `android/README.md`.

## For developers

```bash
cd app
pnpm install
pnpm start
```

- Stack: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite (`node:sqlite`) · Claude Agent SDK · Codex app-server (GPT staff)
- Sign-in: no separate API key is needed; it uses the Claude Code and Codex sign-ins on this computer as is. Connection status per provider is shown in Settings.
- Data: on Mac, `~/Library/Application Support/AI Office/office.db`
- One data folder can be used by only one app at a time (`office.lock`). If the installed app is running, the dev app shows "already running" and quits. To run the dev app or QA while the installed app is open, give it a different folder: `AI_OFFICE_USER_DATA=~/ai-office-dev pnpm start` (the old name `CLAUDE_OFFICE_USER_DATA` is still recognized)
- Build the Mac installer: `cd app && pnpm make` → `app/out/make/dmg/arm64/AI-Office.dmg`
- Build the Windows installer: `cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe`. A Mac has no wine, so build it with the GitHub Actions `win-installer` workflow. On a Mac you can also fetch the claude executable package for Windows x64 through `supportedArchitectures` in `pnpm-workspace.yaml` (run `pnpm install` once after changing it).
- Folders: `app/` (the app: `src/main` main process, `src/renderer` screens, `src/shared` shared types) · `android/` (phone app) · `site/` (website) · `docs/` (specs and research records)
- Documents: [CONTEXT.md](CONTEXT.md) (background for newcomers, including the two kinds of staff) · [intro.html](intro.html) (intro slides) · [SPEC.md](SPEC.md) (decided spec) · [CHANGELOG.en.md](CHANGELOG.en.md) (change history)
