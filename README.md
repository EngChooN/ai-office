[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

# AI Office

A personal PoC (Electron desktop app) that turns AI sessions (currently Claude Code) into **staff** you can hire, direct and review together, like one office. (Formerly named Claude Office — existing data is copied automatically on first launch; the old folder is left untouched.)

- Status: **0.14.0** (2026-10-27) — GPT staff (beta) · Office map (team zones, meeting rooms, lounge) · Team / team-lead delegation · Task board · Approval inbox · Group chat · Meetings · Scheduled tasks · Reports · Payslips · Decorating
- Stack: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite (`node:sqlite`) · Claude Agent SDK

## Installation (0.14.0)
- Open `app/out/make/dmg/arm64/AI-Office.dmg` and drag it into Applications
- Apple Silicon only · Not signed or notarized → if you see an "unidentified developer" warning the first time you open it, go to System Settings › Privacy & Security › "Open Anyway"
- Requirement: Claude Code must be signed in on that Mac (staff work under that account, and usage is billed to it)
- Rebuild: `cd app && pnpm make`

## Windows (first release · beta)
- Build: `cd app && pnpm install && pnpm make:win` → `app/out/make/zip/win32/x64/*.zip` (unzip and run `claude-office.exe`, no installation needed)
  - You can build it on a Mac too. `supportedArchitectures` in `pnpm-workspace.yaml` also fetches the claude executable package for Windows x64 (after changing the setting, run `pnpm install` once)
- Not signed → if the SmartScreen "Windows protected your PC" window appears on first launch, click "More info › Run anyway"
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
- Sign-in: no separate API key is needed; it uses the Claude Code sign-in on this Mac as is.
- Data: `~/Library/Application Support/AI Office/office.db`
- One data folder can be used by only one app at a time (`office.lock`). If the installed app is running, the dev app shows "already running" and quits. To run the dev app or QA while the installed app is open, give it a different folder: `CLAUDE_OFFICE_USER_DATA=~/claude-office-dev pnpm start`

## Two kinds of staff
| | Hired staff | External staff |
|---|---|---|
| Identity | A session the app starts with the Agent SDK | A session already running in a terminal or desktop app |
| Status | Real-time (stream) | Polls the `~/.claude/sessions` registry every 2 seconds (+ opt-in hooks) |
| Instructions & approvals | In the app | In the original window |
| Today's work | App DB | Transcript jsonl |

## Folders
- `app/` — the app (`src/main` main process, `src/renderer` screens, `src/shared` shared types)
- `spikes/` — Stage 1 integration verification scripts
- `docs/` — research and spike records

## Documents
- [CONTEXT.md](CONTEXT.md) — background document for newcomers · [intro.html](intro.html) — intro slides (open in a browser) · [SPEC.md](SPEC.md) — decided spec · [CHANGELOG.en.md](CHANGELOG.en.md) — change history · [docs/spike-integration.md](docs/spike-integration.md)
