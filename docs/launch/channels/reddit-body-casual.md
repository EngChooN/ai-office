# 제목
I got tired of juggling Claude Code terminals, so I built a free desktop "office" where risky stuff waits for my approval

# 본문 (maker 표기, 캐주얼 말투)
I'm the maker. AI Office is free and open source (MIT), for macOS (Apple Silicon) and Windows.

I usually have a few Claude Code sessions going at once, and I kept losing track of which one was working, which one was stuck waiting on me, and what it had actually changed. So I put them in one place: each session is a little staff member in an office view. You can hire Claude or GPT, give them work in plain chat, and they report back when they're done.

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

Honestly I'd love to hear where setup got stuck and where the approval flow felt annoying.

# 이미지 (본문 아래에 첨부)
1. docs/launch/gif/office-1.0.gif (데모)
2. img/inbox-en.png (결재함)
3. img/chat-en.png (대화)
