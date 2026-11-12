# 제목
I made Claude Code and Codex usable for non-developers: a free "AI office" desktop app where you hire AI staff

# 본문
I'm the maker. AI Office is free and open source (MIT), for macOS (Apple Silicon) and Windows.

Claude Code and Codex are great, but they live in a terminal, so most non-developers never get to use them. I wanted something anyone could pick up, so I built it around a concept everybody already knows: an office. You hire AI staff (Claude or GPT), hand them work in plain language, and they report back when they're done.

I built the whole thing with Claude Code. It wrote and reviewed most of the code, and while building I used Claude sessions as "staff" in the app itself for planning, code review and QA. Kind of dogfooding it on itself.

The bit I care about most is the approval inbox. File changes and shell commands land there first and nothing risky runs until you say yes. You can also undo a change staff made. Big jobs can go to a team lead who splits the work and asks you before anything starts.

What you need: Claude Code or ChatGPT (Codex) already signed in on your machine. No API key. It uses that account's limits, so several staff at once burns through them faster.

Everything stays on your computer. No analytics. The only network calls are update checks.

Stuff that's not great yet:
- Not code-signed, so macOS shows an "unidentified developer" warning the first time (System Settings > Privacy & Security > Open Anyway)
- Apple Silicon and Windows only, no Intel Mac or Linux
- On Windows a few things are missing: notifications from outside staff, question hooks, screen capture

Site + demo: https://engchoon.github.io/ai-office/
Source: https://github.com/EngChooN/ai-office

If you're not a developer, I'd especially love to hear where setup got stuck and whether the "office" idea made sense right away.

# 이미지
1. docs/launch/gif/office-1.0.gif
2. img/inbox-en.png
3. img/chat-en.png
