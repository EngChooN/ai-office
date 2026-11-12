**게시 금지, 초안**

# dev.to 글 초안 (영어)

> 게시 금지 상태. 대표님이 직접 읽고 말투를 고친 뒤, 승인과 지시가 있을 때만 올립니다.
> 사실 기준: README.md, CHANGELOG.md 1.1.4, reddit-body-casual.md. 게시 전에 다시 대조할 것.
> dev.to의 AI 사용 표기 규칙은 확인하지 못했습니다. 글을 올리기 전에 dev.to 가이드를 읽고, 필요하면 AI 도움을 받았다고 적습니다.

---

## 입력 칸

| 칸 | 초안 |
|---|---|
| Title | I turned my AI coding agents into an "office" so anyone can run them |
| Tags (최대 4개) | `ai`, `opensource`, `productivity`, `claude` · **[실제 태그 이름 확인 필요]** |
| Cover image | `docs/launch/gif/office-1.0.gif` 또는 `site/assets/screens/en/office.webp` · **[규격 확인 필요]** |
| Canonical URL | 비워 둠 |

## 본문

I'm the maker of AI Office, a free and open source (MIT) desktop app for macOS (Apple Silicon) and Windows.

**Why I built it**

AI coding agents like Claude Code are powerful, but they live in terminal windows. If you are not a developer, a terminal is a wall. Even if you are one, running several agents at once gets messy: which window is working, which one is waiting for my OK, and what did it actually change?

So I moved the whole thing into an office.

- **AI agents are staff.** You hire Claude or GPT staff, give them work in plain chat, and they report back when they're done.
- **You can see them work.** Each agent sits at a desk in an office view. At a glance you see who is working, who is resting, and who is waiting for you.
- **Risky stuff needs your approval.** File changes and shell commands land in an approval inbox first. Nothing risky runs until you say yes, and you can undo a change.
- **Big jobs go to a team lead.** The lead plans the work, splits it up, and asks you to confirm before anything starts.

You don't need to know commands. "Hire staff, give work, approve" is enough. (Your company also levels up as staff work, and the office grows. A small thing, but it makes it fun.)

**What you need**

Claude Code or ChatGPT (Codex) already signed in on your computer. No API key. Usage is billed to that account, so running many staff at once uses your limits faster.

Everything stays on your computer. There are no analytics. The only network calls are update checks and downloads.

**Not great yet**

- Not code-signed, so macOS shows an "unidentified developer" warning the first time (System Settings > Privacy & Security > Open Anyway).
- Apple Silicon only on Mac, no Intel Mac or Linux.
- On Windows, notifications from outside staff, question handling, and screen capture are missing.

**Try it / feedback**

- Site and demo: https://engchoon.github.io/ai-office/
- Source: https://github.com/EngChooN/ai-office

I would love to hear where setup got stuck, and where the approval flow felt annoying. Especially if you are not a developer: was the "office" idea easier to understand than a terminal?

---

## 이미지 (본문 중간에 넣기)

1. 사무실 화면: `site/assets/screens/en/office.webp`
2. 결재함: `site/assets/screens/en/inbox.webp`
3. 대화: `site/assets/screens/en/chat.webp`

## 게시 전 체크리스트

- [ ] 대표님이 직접 읽고 말투를 고침 (AI가 쓴 티가 나는 문장 정리)
- [ ] dev.to 가이드의 AI 도움 표기 규칙 확인
- [ ] 태그 이름, 커버 이미지 규격을 작성 화면에서 확인
- [ ] 소개 페이지와 GitHub 링크가 열리는지 확인
- [ ] 한계(맥 서명 경고, Intel·Linux 미지원, 윈도우 제한) 문장이 들어 있는지 확인
