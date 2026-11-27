**게시 금지, 초안**

# Reddit 서브레딧별 계획과 초안 (AI Office 1.6.0)

> 게시 금지 상태. 대표님이 직접 읽고 말투를 고친 뒤, 승인과 지시가 있을 때만 올립니다.
> 조사 날짜: 2026-11-23. 규칙은 검색 결과로만 확인했습니다. 레딧 웹 화면에서 규칙 원문을 직접 읽지 않았습니다.
> 글 속 사실 기준: README.md, CHANGELOG.md 1.6.0(2026-11-23), 릴리즈 v1.6.0.

---

## 1. 추천 순위와 근거

| 순위 | 서브레딧 | 위험도 | 근거 (검색 결과 기준) | 게시 전 해야 할 일 |
|---|---|---|---|---|
| 1 | **r/ClaudeCode** (위클리 쇼케이스 스레드) | 중간 | 간단한 프로젝트 공유는 주간 쇼케이스 스레드로 보내는 편. 앱이 Claude Code 세션을 직원으로 쓰므로 주제와 맞음. 자기 홍보 규칙은 "낮은 노력의 홍보·반복 홍보 금지"로 보고됨 | 규칙 원문 확인. 쇼케이스 스레드가 있는 날 확인. 플레어 확인 |
| 2 | **r/ClaudeAI** | 중간~높음 | 가장 큰 Claude 커뮤니티. 그러나 홍보 규칙이 자료마다 다름. 한 자료는 "모드 허락 또는 지정 글타래에서만"이라고 함 | **모드메일로 허락 먼저.** 허락 없이 올리지 않음 |
| 3 | **r/SideProject** | 중간 (규칙 미확인) | "만든 사람의 이야기와 피드백"을 나누는 곳. 규칙 원문과 홍보 제한은 찾지 못함 | 사이드바 규칙 직접 확인. 피드백 중심으로 씀 |
| 제외 | **r/opensource** | **위험 (올리지 말 것)** | 2026년 10월 24일 규칙 변경으로 AI를 쓰거나 AI가 만든 프로젝트를 금지. 1년 이상 유지보수, 여러 기여자 조건. 혼자 만든 프로젝트 공지도 제거되는 것으로 보고됨 | 이 앱은 Claude로 만들었으므로 **올리지 않습니다** |
| 보류 | r/ChatGPT · r/codex | 확인 안 함 | 이번 조사에서 규칙을 찾지 못함. GPT 직원 기능은 있음 | Claude 쪽 반응을 본 뒤 결정 |

**추천 순서 요약**: r/ClaudeCode 쇼케이스 → (모드 허락 후) r/ClaudeAI → r/SideProject. 하루 간격을 두고, 같은 글을 같은 날 여러 곳에 올리지 않습니다.

**이전 초안과 다른 점**: 기존 `reddit-claudeai.md`의 "5-1. 규칙 7번 확인 결과 (2026-11-09, 규칙 원문 읽음)"은 이번 검색으로 근거를 찾지 못했습니다. 확인된 것으로 보지 않고 **"확인 못 함"으로 되돌려 둡니다.** 이 항목이 맞는지 대표님이 레딧에서 직접 확인해 주세요.

---

## 2. 제목 후보 (서브레딧별 2~3안)

**r/ClaudeCode (쇼케이스용, 터미널 관리 문제부터)**
1. I kept losing track of my Claude Code sessions, so I built a free desktop app to manage them as "staff"
2. Show: an open-source desktop app that puts Claude Code sessions in one place with an approval inbox
3. Managing several Claude Code terminals got messy, so I made a visual "office" with approvals and reports

**r/ClaudeAI (모드 허락 후)**
1. I got tired of juggling Claude Code terminal windows, so I built a free desktop "office" with an approval inbox
2. Built with Claude: a free, open-source desktop app for handing tasks to Claude Code "staff" with approvals
3. AI Office: a free desktop app where file changes and commands wait for your approval before they run

**r/SideProject (피드백 중심)**
1. Side project: a free desktop app that lets non-developers hand tasks to AI staff. Looking for feedback
2. I built an approval-first AI office app for Mac and Windows. What would make you trust it?

**추천**: r/ClaudeCode는 r/ClaudeCode 1번, r/ClaudeAI는 r/ClaudeAI 1번(문제에서 시작), r/SideProject는 2번(피드백 질문)이 가장 자연스럽습니다.

---

## 3. 본문 초안

공통 뼈대: 문제 → 만든 이유 → 써 본 경험 → 한계 → 피드백 요청. 링크는 **한 곳만**(릴리즈 페이지 또는 GitHub 저장소 중 하나). 기능 나열은 줄이고, 불편을 줄였는지를 중심으로 씁니다.

### 3-1. r/ClaudeCode (쇼케이스 스레드 또는 짧은 글)

Title: (위 2번 목록에서 선택)

> I'm the maker of AI Office, a free and open-source (MIT) desktop app. I built it because I had several Claude Code sessions open in separate terminal windows and kept losing track of which one was working, which one was waiting on me, and what it had changed.
>
> The app turns each session into a "staff member" in a simple office view. You hire one (Claude or GPT), give work in plain words in a chat, and a report comes back when it's done. File changes and commands go to an approval inbox first. Nothing risky runs until you approve it, and changed files can be undone.
>
> [대표님 경험 1~2문장 추가: 실제로 어떻게 썼는지. 확인 필요]
>
> Limits I know about:
> - Apple Silicon Mac and Windows only. The Mac build is not code-signed, so the first launch needs "Open Anyway" in System Settings.
> - Windows screen capture, computer control and outside-session notifications are not verified on a real Windows PC yet.
> - Scheduled jobs only run while the app is open.
> - It uses your existing Claude Code sign-in. No API key.
>
> Release notes: https://github.com/EngChooN/ai-office/releases/tag/v1.6.0
>
> What I'd most like to hear: where the approval step felt slow or annoying, and where setup got stuck.

### 3-2. r/ClaudeAI (모드 허락 후에만)

Title: (위 2번 목록에서 선택)

> I'm the maker of AI Office, a free and open-source (MIT) desktop app for macOS (Apple Silicon) and Windows.
>
> **The problem:** I was running several Claude Code sessions at once. It was hard to tell which one was waiting for me and what it had changed.
>
> **How Claude helped:** The app itself is built with Claude Code, and the staff inside it are Claude Code or Codex sessions. [확인 필요: 실제 개발에 Claude를 어떻게 썼는지 대표님 말로 고쳐 주세요]
>
> **What it does:** Each session becomes a staff member in an office view. You hire one, give work in plain words, and get a report when it's done. Risky actions wait in an approval inbox first. Big jobs can go to a team lead, who splits the plan and asks you to confirm before carrying it out.
>
> **What you need:** Claude Code (or ChatGPT/Codex) signed in on the same computer. No API key. Usage counts against that account's limits.
>
> **Known limits:**
> - Not code-signed or notarized yet. On a Mac, the first launch shows an "unidentified developer" warning.
> - Apple Silicon Mac and Windows only.
> - Windows screen capture, computer control and outside-session notifications are not verified on a real Windows PC yet.
> - Phone (Android) connection is optional and off by default.
>
> Free to try. Source and release: https://github.com/EngChooN/ai-office/releases/tag/v1.6.0
>
> I'd like feedback on two things: where setup got stuck, and whether the approval flow makes sense to someone who doesn't use a terminal every day.

### 3-3. r/SideProject (피드백 중심)

Title: (위 1번 또는 2번)

> I've been working on AI Office, a free, open-source desktop app for people who don't want to use a terminal but want AI to do real work.
>
> The idea: you hire AI "staff" (Claude or GPT), hand them work in plain words, approve the risky parts, and get a report back. I built it because the terminal was a wall for people on my team.
>
> Where I am now: version 1.6.0, free, MIT license. Mac (Apple Silicon) and Windows builds. The Mac build isn't signed yet, so there's a warning on first launch. Windows has parts that aren't tested on a real machine yet.
>
> [대표님 한마디: 왜 혼자 만들고 있는지, 지금 가장 큰 고민]
>
> Link: https://github.com/EngChooN/ai-office
>
> Questions I'd love your take on: (1) Is the "office" metaphor helpful or confusing? (2) What would make you trust an app that runs AI actions on your computer?

---

## 4. 게시 후 댓글 대응 요령

- **첫 2~3시간**: 댓글에 직접 답합니다. 답이 늦으면 좋은 질문이 묻힙니다.
- **설치가 막혔다는 댓글**: 단계와 운영체제(맥/윈도우)를 물어보고, 맥은 "Open Anyway" 안내, 윈도우는 "More info › Run anyway" 안내를 씁니다.
- **"AI가 쓴 홍보 글 아니냐"는 댓글**: 솔직하게 답합니다. 만든 사람이고, Claude로 개발했다는 점을 숨기지 않습니다. 과장하지 않습니다.
- **기능 질문**: 문서에 있는 것만 답합니다. 모르는 것은 "확인해 보고 알려 드릴게요"라고 씁니다.
- **비난이나 반박**: 논쟁하지 않고 사실만 짧게 씁니다. 답할 가치가 없으면 답하지 않습니다.
- **링크 던지기 금지**: 댓글에 링크를 여러 번 붙이지 않습니다. 스팸으로 보일 수 있습니다.
- **올린 뒤 모드 요청 시**: 즉시 글을 내리고 모드 지시를 따릅니다.

---

## 5. 게시 전 체크리스트

- [ ] 해당 서브레딧의 규칙 원문을 레딧 웹에서 직접 읽음 (r/ClaudeCode, r/ClaudeAI, r/SideProject 각각)
- [ ] r/ClaudeAI는 모드메일로 허락을 받음
- [ ] 플레어(글 종류 표시)를 골라 둠
- [ ] 대표님 말투로 고쳐 씀 (AI 말투 제거)
- [ ] 대표님 경험 한두 문장을 넣음 (지어내지 않음)
- [ ] 링크(릴리즈 페이지)가 열리는지 확인
- [ ] 서브레딧 사이 하루 간격
- [ ] 같은 글을 여러 곳에 똑같이 올리지 않음
- [ ] 게시 후 2~3시간 댓글 대응 가능

---

## 6. 확인 못 함 (대표님이 확인해 주셔야 할 것)

- r/ClaudeAI 홍보 규칙 원문 (자료마다 말이 다름). 피드 글에 필요한 카르마 기준도 자료마다 다름(100 또는 50). 확인 못 함.
- r/ClaudeCode 규칙 원문과 쇼케이스 스레드 날짜. 확인 못 함.
- r/SideProject 규칙 원문과 홍보 제한. 확인 못 함.
- 대표님 계정의 카르마와 계정 나이. 확인 못 함.
- 실제 개발에 Claude를 어떻게 썼는지 (글에 "Claude로 만들었다"고 쓴 부분). 추정이므로 대표님이 맞는지 확인 필요.

---

## 7. 정해 주실 것

1. r/ClaudeAI에 모드메일을 보낼지 (추천: 보냄, 허락 전에는 올리지 않음)
2. r/ClaudeCode 쇼케이스 스레드를 첫 채널로 할지 (추천: 예)
3. 본문 속 "써 본 경험" 한두 문장을 어떻게 쓸지

---

## 자세한 정보

- 조사 출처(검색 결과, 공식 규칙 아님):
  - r/ClaudeAI: https://www.threadotter.com/subreddit-rules/claudeai , https://www.replyhey.com/subreddits/claude , https://github.com/Zontak-LLC/usehourly/issues/8
  - r/ClaudeCode: https://www.threadotter.com/subreddit-rules/claudecoding , https://spacestationlabs.ai/subreddits/claudecode , https://agentagency.si/subreddits/r/claudecode
  - r/SideProject: https://thehiveindex.com/communities/r-sideproject (규칙 원문 없음)
  - r/opensource: https://runtimewire.com/article/r-opensource-bars-ai-projects-and-requires-a-year-of-maintenance-for-promotion , https://www.linux-magazine.com/Online/News/r-opensource-Bans-AI-Assisted-and-AI-Related-Projects
- 글 속 사실 출처: README.md(설치·한계), CHANGELOG.md 1.6.0(버전), 릴리즈 https://github.com/EngChooN/ai-office/releases/tag/v1.6.0
- 기존 파일: `docs/launch/channels/reddit-claudeai.md` (5-1 항목은 확인 못 함으로 보류)

---

## 8. 비개발자 관점 r/SideProject 초안 (2026-11-23 추가, 게시 금지·대표 검토 전)

> 방향: 이 앱은 터미널을 안 쓰는 비개발자를 위한 앱. "터미널 세션 관리"가 아니라 "코딩 몰라도 AI에게 일 맡기기"로 시작. [ ] 표시는 대표님이 직접 채울 곳(지어내지 않음).

Title: I built a free desktop app so people who don't code can hand real work to AI, and approve the risky parts first. What would make you trust it?

> I'm the maker of AI Office, a free, open-source (MIT) desktop app for Mac (Apple Silicon) and Windows.
>
> **The problem:** AI tools that can actually change files and run commands usually live in a terminal. For people who don't code, that's a wall.
>
> **What it does:** You hire AI "staff" (Claude or GPT) in a simple office view, hand them work in plain words in a chat, and get a report back. File changes and commands wait in an approval inbox first. Nothing risky runs until you approve it, and changed files can be undone.
>
> **What you need:** Claude Code or ChatGPT/Codex signed in on the same computer. No API key.
>
> [대표님 한마디: 왜 비개발자용으로 만들었는지, 주변 누구를 떠올렸는지]
>
> **Limits:** Mac build isn't code-signed yet (first launch needs "Open Anyway"). Parts of Windows aren't verified on a real PC. Scheduled jobs only run while the app is open.
>
> Link: https://github.com/EngChooN/ai-office
>
> Questions: (1) Is the "office" metaphor helpful or confusing? (2) What would make you trust an app that runs AI actions on your computer?
