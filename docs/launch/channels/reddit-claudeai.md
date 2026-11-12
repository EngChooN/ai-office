**게시 금지, 초안**

# Reddit 초안 (r/ClaudeAI 중심)

> 게시 금지 상태. 대표님이 읽고 말투를 직접 고친 뒤, 승인과 지시가 있을 때만 올립니다.
> 사실 기준: README.md, CHANGELOG.md 1.1.4(2026-11-09), 긱뉴스 1.0 최종안 중 코드로 확인한 항목(2026-11-04).
> 이 글은 AI가 쓴 초안입니다. 레딧은 광고성 글과 자동 생성 글을 엄격히 거르니, 그대로 올리지 말고 대표님 목소리로 바꿔 주세요.

---

## 1. 서브레딧 자기 홍보 규칙 요약

**확인한 내용 (확정 아님)**
- r/ClaudeAI의 자기 홍보 규칙은 이번에 찾지 못했습니다. 찾은 자료끼리 말이 달랐습니다.
  - 한 자료: 명시적으로 허용되다가 최근 규칙을 고치면서 홍보에 대한 언급이 사라졌다고 합니다.
  - 다른 자료(벤더 사이트): 모더레이터 허락이나 지정된 글타래에서만 홍보하라고 합니다. 이 자료는 광고 도구의 안내라 공식 규칙이 아닙니다.
- 여러 자료가 공통으로 권하는 것: 올리기 전에 **모드메일로 먼저 묻기**, 제목과 본문에 "만든 사람"이라고 밝히기, 링크만 던지지 않고 대화하기.
- 참고한 자료: [ThreadOtter r/ClaudeAI 규칙 정리](https://www.threadotter.com/subreddit-rules/claudeai) (벤더 정리, 공식 아님)

**반드시 할 일 (게시 전)**
1. 레딧 웹에서 `reddit.com/r/ClaudeAI/about/rules`를 열어 규칙 원문을 읽습니다. (여기서 확인하지 못했습니다)
2. 규칙에 홍보 문구가 없거나 애매하면 모드메일을 보냅니다. 예: "AI Office라는 무료 오픈소스 앱을 만들었습니다. 한 번 소개 글을 올려도 될까요? 규칙에 맞게 바꾸겠습니다."
3. 모드가 승인하기 전에는 올리지 않습니다.

## 2. 같이 올릴 만한 서브레딧과 바꿀 점

| 서브레딧 | 적합한 이유 | 확인할 것 | 바꿀 점 |
|---|---|---|---|
| r/ClaudeAI | 주 대상. Claude 사용자가 가장 많음 | 홍보 규칙 (위 1번) | 아래 기본 글 그대로 (모드 허락 후) |
| r/ClaudeCode | Claude Code 사용자 중심. 터미널 여러 개를 쓰는 사람이 많음 | 규칙 원문 (미확인) | 제목을 "터미널 창 여러 개 관리 문제"로 시작. "사무실" 비유는 뒤로 |
| r/SideProject | 만든 사람의 이야기와 피드백을 나누는 곳 | 자기 홍보 제한, 지정 홍보 글타래 여부 (미확인) | "왜 만들었나"와 "피드백 받고 싶은 것"을 앞에 |
| r/opensource | MIT 무료 앱, 소스 공개 | 규칙 원문 (미확인) | 라이선스, 소스 위치, 기여 방법을 앞에 |
| r/ChatGPT · r/codex | GPT 직원 기능이 있음 | 과열된 홍보 금지 여부 (미확인) | 보류 권장. Claude 쪽 반응을 본 뒤 결정 |

**공통 원칙**: 기능을 나열하기보다 "어떤 불편을 줄였는지"를 먼저 씁니다. 같은 글을 여러 곳에 똑같이 올리지 않습니다.

---

## 3. 제목 후보 (3개)

1. I got tired of juggling Claude Code terminal windows, so I built a free desktop "office" with an approval inbox
2. I built a free, open-source desktop app that lets you run Claude and GPT as "staff" and approve risky actions before they run
3. AI Office: a free desktop app for handing tasks to Claude Code staff, where file changes and commands wait for your approval

**추천**: 1번. 문제에서 시작해서 광고처럼 읽히지 않습니다. 3번은 기능을 바로 보여 주지만 "approval inbox"가 낯설 수 있습니다.

## 4. 본문

I'm the maker of AI Office, a free and open-source (MIT) desktop app for macOS (Apple Silicon) and Windows.

**The problem I had:** I kept several Claude Code sessions running in different terminal windows. It was hard to tell which one was working, which one was waiting for me, and what it had changed.

**How Claude helped:** I built the app with Claude Code, from the first prototype to the latest release. It wrote and reviewed most of the code, and I used Claude sessions as staff in the app itself (planning, code review, QA) while building it. [대표님 확인: 실제로 쓰신 방식에 맞게 고쳐 주세요]

**What I did:** Each session became a staff member in a small office view. You hire one (Claude or GPT), give work in plain words in a chat or a staff panel, and the report comes back when it's done.

The part I cared about most is the approval step. File changes and commands go to an approval inbox first, and nothing risky runs until you approve it. You can also undo a change that staff made.

A few other things:
- Big jobs can go to a team lead, who plans, splits the work, asks you to confirm, and then reports back.
- Pending approvals stay in the inbox after you restart the app (kept for 7 days).
- There is an optional Android app for approvals and chat. It's off by default.

**What you need:** Claude Code or ChatGPT (Codex) signed in on the same computer. No API key. Usage counts against that account's limits, so running several staff at once uses your limit faster.

**Data:** Everything runs on your computer, and chats and records stay there. The app doesn't collect usage analytics. The only outside requests it makes are checking for and downloading updates.

**Known limits (I'd rather say them up front):**
- The app isn't code-signed or notarized yet. On a Mac, the first launch shows an "unidentified developer" warning. You can open it from System Settings › Privacy & Security › "Open Anyway".
- macOS on Apple Silicon and Windows only. No Intel Mac, no Linux.
- On Windows, outside-staff notifications, question handling (hooks) and screen capture aren't available yet.
- The phone connection is off by default.

Links:
- Website and short demo: https://engchoon.github.io/ai-office/
- Source and releases: https://github.com/EngChooN/ai-office

What would help most: where setup got stuck, and where the approval flow felt slow or annoying. I'm happy to answer questions here.

---

## 5. 첫 댓글 (작성자, 게시 직후)

Some details for anyone who asked:

- Built with Electron and React. Claude staff run on the Claude Agent SDK, and GPT staff run on the Codex app-server.
- The data is in a local SQLite file. On a Mac it's at `~/Library/Application Support/AI Office/office.db`.
- The approval inbox shows why something is waiting (for example, a command it hasn't seen before, or a delete or push).
- The current version is 1.1.4. The changelog is in the repo (CHANGELOG.md).

If the setup fails or the approval flow is confusing, tell me the step and your OS and I'll look into it.

---

## 5-1. r/ClaudeAI 규칙 7번 확인 결과 (2026-11-09, 규칙 원문 읽음)
- 홍보 허용. 조건: Claude로 만든 프로젝트, 만든 내용·Claude가 어떻게 도왔는지 자세히, 무료로 써 볼 수 있다고 명시, 홍보 문구 최소, 추천 링크 금지, 구직 글 금지.
- **피드 글은 작성자 카르마 100 초과 필요.** 대표님 카르마는 확인하지 못함.
- 글머리 플레어를 골라야 함 (규칙 9번).
- 본문에 "How Claude helped" 문단을 추가함 (가정: Claude Code로 개발. 대표님이 실제와 맞게 수정).

## 6. 게시 전 체크리스트

- [ ] r/ClaudeAI 규칙 원문을 직접 읽음 (`reddit.com/r/ClaudeAI/about/rules`)
- [ ] 모드메일로 승인을 받음 (또는 규칙상 허용을 확인함)
- [ ] 대표님 말투로 고침 (AI 말투 제거)
- [ ] 제목과 본문에 "maker"임을 밝힘
- [ ] 링크 두 개가 열리는지 확인 (2026-11-04에 200 확인, 다시 확인 필요)
- [ ] 이미지: `docs/launch/gif/office-1.0.gif` (690×465, 3MB) 첨부. 더 큰 해상도 자료가 필요하면 `docs/launch/office-1.0.png` (2760×1860)
- [ ] 같은 글을 여러 서브레딧에 동시에 올리지 않음. 하루 간격
- [ ] 댓글은 게시 후 몇 시간 동안 직접 답함
