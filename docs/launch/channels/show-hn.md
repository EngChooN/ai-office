**게시 금지, 초안**

# Show HN 초안 (영어)

> 게시 금지 상태. 대표님이 승인하고 직접 지시할 때만 올립니다. 올린 뒤 몇 시간은 댓글에 직접 답할 수 있어야 합니다.
> 사실 기준: README.md, CHANGELOG.md 1.1.4. 맥 서명 없음은 빼지 않고 적었습니다.

---

## 1. 규칙 확인 (news.ycombinator.com/showhn.html, newsguidelines.html 원문, 2026-11-09 확인)

- **제목은 "Show HN:"으로 시작**해야 합니다.
- **직접 해 볼 수 있는 것**만 됩니다. 랜딩 페이지, 가입 페이지, 뉴스레터, 블로그 글은 안 됩니다. 이 프로젝트는 GitHub에서 내려받아 실행하는 앱이라 맞습니다.
- **최신 버전 공지 형식은 보통 안 됩니다.** "1.1.4가 나왔다"는 Show HN이 아닙니다. 그래서 제목과 첫 댓글은 **프로젝트 자체**를 소개하고, 버전 소식은 빼거나 한 줄로 둡니다.
- **지인에게 추천·댓글을 부탁하면 안 됩니다.** 지인 응원 요청도 하지 않습니다.
- **제목은 중립적으로**. 대문자 강조, 느낌표, 칭찬 문구, 사이트 이름, 불필요한 숫자를 넣지 않습니다.
- **만든 사람이 직접 토론에 참여**해야 합니다.
- 설치에 **가입이나 이메일이 필요 없다**는 조건이 있는데, AI Office는 가입은 없지만 **Claude Code 또는 ChatGPT(Codex) 로그인이 있는 맥·윈도우 PC**가 필요합니다. 이 점을 첫 댓글에 분명히 씁니다.

출처: [Show HN 안내](https://news.ycombinator.com/showhn.html), [HN 가이드라인](https://news.ycombinator.com/newsguidelines.html)

---

## 2. 제출 정보

- **제목**: `Show HN: AI Office - Hire Claude Code and Codex staff and approve their work`
  - 대안: `Show HN: AI Office - A desktop office for Claude and GPT coding agents, with an approval inbox`
  - 추천 이유: 첫 번째가 짧고, "approve their work"로 핵심(결재)을 바로 보여 줍니다. 칭찬 문구가 없습니다.
- **URL**: https://github.com/EngChooN/ai-office
  - 소개 페이지(https://engchoon.github.io/ai-office/)는 랜딩 페이지라 HN 규칙상 제출 주소로 쓰지 않습니다. 소스 저장소를 제출하고, 소개 페이지 링크는 첫 댓글에 둡니다.
- **본문(텍스트) 칸**: 비워 둡니다. 설명은 첫 댓글에 씁니다.

## 3. 첫 댓글 (작성자, 게시 직후)

Hi HN, I'm the maker of AI Office.

Claude Code and Codex are powerful, but they live in a terminal, so most non-developers never get to use them. I wanted something anyone could pick up, so I built it around a concept everybody knows: an office. I also built the app itself with Claude Code, and used Claude sessions as staff in the app for planning, code review and QA along the way.

AI Office puts each session into a small desktop "office" as a staff member. You hire one as Claude (via the Claude Agent SDK) or GPT (via the Codex app-server), give it work in plain words, and file changes or commands wait in an approval inbox until you approve them. You can undo a change with one click.

Some details:
- Electron + React, MIT licensed. Local SQLite file for data.
- No API key. It uses the Claude Code or Codex sign-in already on your machine, and usage is billed to that account.
- The app doesn't collect usage analytics. Its only outside requests are checking for and downloading updates.
- Approvals stay in the inbox across app restarts (for 7 days).

Limits, stated plainly:
- macOS (Apple Silicon) and Windows only. No Intel Mac or Linux.
- The builds aren't code-signed or notarized yet, so macOS shows an "unidentified developer" warning on first launch. Open it from System Settings > Privacy & Security > "Open Anyway". Windows shows a SmartScreen warning; choose "More info" > "Run anyway".
- On Windows, outside-staff notifications, question handling (hooks) and screen capture aren't there yet.
- You need a Claude Code or ChatGPT sign-in on the same machine.

Website and demo GIF: https://engchoon.github.io/ai-office/

I'm around for the next few hours to answer questions. Criticism of the approval flow is especially useful.

---

## 4. 올리기 좋은 요일과 시간

- **요일**: 화요일~목요일 (주말은 피합니다)
- **시간**: 미국 동부 시간 오전 8~10시 = **한국 시간 밤 10시~자정** (미국 동부는 11월 현재 UTC-5, 한국은 UTC+9)
- **이유**: HN 독자는 미국 낮 시간에 많이 읽습니다. 이 시간대는 업계 통념이라 효과를 보장하지 않습니다.
- **주의**: 올린 뒤 2~3시간은 자리를 비우지 않습니다. 같은 날 Product Hunt 출시와 겹치면 두 곳의 질문에 동시에 답해야 하니 **하루 띄웁니다.**

## 5. 게시 전 체크리스트

- [ ] 대표님이 제목과 첫 댓글을 직접 읽고 말투를 고침 (HN은 생성 글을 싫어합니다)
- [ ] 지인에게 댓글이나 추천을 부탁하지 않음
- [ ] 저장소가 공개 상태이고 최신 릴리즈(1.1.5)의 맥·윈도우 파일이 내려받아지는지 확인
- [ ] 맥 경고 우회 방법(시스템 설정 경로)이 댓글에 있음
- [ ] 2~3시간 동안 댓글에 답할 시간이 있음
