**게시 금지, 초안**

# Product Hunt 초안 (영어)

> 게시 금지 상태. 대표님이 승인하고 직접 지시할 때만 예약하거나 올립니다.
> 사실 기준: README.md, CHANGELOG.md 1.1.4. 맥 서명 없음 경고를 빼지 않고 적었습니다.
> 칸 글자 수 제한은 Product Hunt 도움말(build your product page) 기준입니다.

---

## 1. 입력 칸

| 칸 | 초안 | 글자 수 (제한) |
|---|---|---|
| Name | AI Office | 9자 (40자) |
| Tagline | Hire Claude & GPT staff. Run them like one office. | 50자 (60자) |
| Tagline 대안 | Hire Claude & GPT staff. Approve before they act. | 49자 (60자) |
| Description | 아래 "설명" 참고 | 500자 이하 (제한 500자) |
| Topics | Developer Tools, Artificial Intelligence, Productivity, Open Source | 목록에서 고르기 · **[목록 이름 확인 필요]** |
| Website | https://engchoon.github.io/ai-office/ | 소개 페이지 |
| Links · 소스 | https://github.com/EngChooN/ai-office | MIT |
| Thumbnail (로고) | `site/assets/icon.png`을 240×240으로 줄여 쓰기 | 240×240 권장 · 원본 512×512 있음 |

**추천 태그라인**: "Hire Claude & GPT staff. Run them like one office." (README와 같은 문구라 일관됩니다)

### 설명 (Description)

AI Office is a free, open-source desktop app (MIT) for macOS (Apple Silicon) and Windows. Hire Claude and GPT staff and give them work in plain words. File changes and commands wait in an approval inbox until you approve them, and you can undo changes. Big jobs can go to a team lead who plans, splits the work, and asks you to confirm. No API key: it uses the Claude Code or ChatGPT (Codex) sign-in on your computer. Not code-signed yet, so macOS warns on first open.

---

## 2. 메이커 첫 댓글 (Maker comment)

Hi Product Hunt, I'm the maker of AI Office.

I built it because I kept running several Claude Code sessions in separate terminal windows. It was hard to tell which one was working, which one was waiting for me, and what it had changed. So I turned each session into a staff member in a small office. You hire one (Claude or GPT), give it work in a chat, and approve the risky parts in an inbox.

What's in version 1.1.4:
- Approval inbox: file changes and commands wait for you. Pending approvals stay there after a restart (for 7 days).
- Undo for changes staff made.
- Team leads: give a big task, and they plan, split it, ask you to confirm, then report.
- Group chat with @mentions, a task board, scheduled tasks, and reports.
- An office map that shows who is working and who is waiting. It grows with the work your staff finish (up to level 20), and you can decorate it.
- An optional Android app for approvals and chat. It's off by default.

Being plain about the limits:
- It's not code-signed or notarized yet. On a Mac, the first launch shows an "unidentified developer" warning. Open it from System Settings > Privacy & Security > "Open Anyway".
- Apple Silicon Macs and Windows only. No Intel Mac, no Linux.
- On Windows, outside-staff notifications, question handling, and screen capture aren't there yet.
- Running several staff at once uses your plan's limits quickly.

It's free and open source (MIT), and it doesn't need an API key. You need Claude Code or ChatGPT signed in on the same computer.

The feedback that helps most: where setup got stuck, and where the approval flow felt slow. I'll be here answering questions today.

---

## 3. 이미지와 영상

### 있는 자료 (바로 쓸 수 있음, 확인 후 사용)

| 자료 | 크기 | 쓸 곳 | 메모 |
|---|---|---|---|
| `site/assets/icon.png` | 512×512 | 로고 (썸네일) | 240×240으로 줄여 쓰기 |
| `docs/launch/office-1.0.png` | 2760×1860 | 갤러리 (사무실 전경) | 권장 1270×760 비율(약 5:3)보다 조금 높아서, 위아래를 잘라야 함 |
| `docs/launch/gif/draft-approval-flow.gif` | 960×540 | 갤러리 (결재 흐름) 후보 | 해상도가 낮음. 새로 찍는 것을 권장 |
| `docs/launch/gif/office-1.0.gif` | 690×465 | 참고용 | 해상도가 낮아 갤러리에는 안 맞음 |

### 새로 만들어야 할 자료

**갤러리 (권장 3장 이상, 1270×760)**
1. 결재함에 승인 카드가 뜬 화면 (승인·되돌리기 버튼이 보이게)
2. 사무실 맵 (직원이 일하는 자리와 기다리는 자리가 보이게)
3. 팀장 업무 보드 또는 대화방 (계획과 진행 상황이 보이게)
4. 직원 고용 화면 (Claude와 GPT 선택지가 같이 보이게)

**영상 (선택, 권장)**
- 60초 이하, 가로 16:9 화면 녹화. 흐름: 직원 고용 → 지시 입력 → 결재 승인 → 보고서.
- `docs/launch/sns/reel3/reel3-cute-office-voice.mp4`는 세로(9:16) 릴스라서 Product Hunt에는 맞지 않습니다. 새로 찍어야 합니다.
- 촬영할 때 폴더 경로, 이메일, 프로젝트 이름이 화면에 보이지 않게 합니다.

---

## 4. 추천 출시 요일과 시간

- **요일**: 화요일~목요일
- **시간**: Product Hunt의 하루는 **태평양 시간 자정(한국 시간 오후 5시, 11월 기준)**에 시작합니다. 자정에 올리면 하루 종일 순위가 쌓입니다.
- **예약**: 최대 30일 전까지 날짜를 정할 수 있습니다. 준비가 100% 끝나지 않았으면 "Schedule launch"가 아니라 **"Create draft"**를 누릅니다. 예약한 출시는 검토 후 열립니다.
- **주의**: 하루 종일 댓글에 답하려면 한국 시간 밤까지 자리를 지켜야 합니다. HN 출시와 같은 날은 피합니다.

## 5. 준비 체크리스트

- [ ] 대표님이 설명과 메이커 댓글을 직접 읽고 말투를 고침
- [ ] 로고 240×240 파일 준비 (512 원본에서 줄이기)
- [ ] 갤러리 3장 이상 준비 (있는 자료 확인 + 새로 찍을 4장 중 3장 이상)
- [ ] 영상 60초 이하, 16:9 (선택)
- [ ] 태그라인 60자 이하, 설명 500자 이하 (입력 화면에서 한 번 더 확인)
- [ ] 소개 페이지와 GitHub 링크가 열리는지 확인
- [ ] 릴리즈 파일(맥 `AI-Office-mac-arm64.dmg`, 윈도우 `AI-Office-win-x64-Setup.exe`)이 내려받아지는지 확인
- [ ] 지인에게 **추천(upvote)을 부탁하지 않음.** 피드백만 요청 (PH 규칙)
- [ ] Show HN과 같은 날 출시하지 않음
- [ ] 출시 당일 자리를 지킬 수 있는지 확인
