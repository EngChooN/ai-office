# 첫 실행 안내 줄이기 — 개발 전달 (A+B 섞기)

- 받는 사람: 정리드(구현), 오큐에이(검수) · 작성: 이디자 · 2026-11-16
- 대표 결정: **A+B 섞기**. 첫 설정에서 **작업 폴더 고르기**와 **실제 첫 업무(AI 사용량 드는 단계)**는 뺀다. 폴더는 직원을 추가할 때 고르고, 연습은 AI 사용량 0.
- 확정 시안: `final.html` (같은 폴더, 버튼으로 13개 화면을 넘겨 봄, `?mode=dark&step=10`처럼 바로 열기)
- 확정 그림: `shots/final-light.png`(연습 · 결재함에서 승인), `shots/final-dark.png`(직원 추가 창 첫 힌트)
- 이 문서에 "추천안(대표 미확인)"이라고 쓴 것은 디자인 제안이며 대표가 직접 고른 것이 아니에요.

## 0. 한눈에

| | 지금 | 바꾼 뒤 |
|---|---|---|
| 첫 설정 | 환영 → 로그인 → 작업 폴더 → 실제 첫 업무 → 준비 완료 (5단계) | 환영 → 로그인 (2단계) |
| 둘러보기 | 첫 설정 뒤 자동으로 기본 5곳 | 자동 없음. 5곳은 연습 안에 녹이고, 나머지 14곳은 `?`에서 고를 때만 |
| 연습 | 둘러보기 끝나면 고르기 창(업무·회의) | 로그인 뒤 바로 **업무 연습 1개**(단체방에서 지시) · 회의 연습은 `?`에서 선택 |
| 그 뒤 | 없음 | 화면을 **처음 열 때 한 번만** 짧은 힌트 + 오른쪽 위 `?` 도움말 |
| 꼭 누르는 단계 · 시간(추정) | 약 17개 · 약 5분 | 7개 · 약 1분 40초 |

시간은 대본 예산과 화면 수로 어림한 값이에요. 실제로 재지 않았어요.

---

## ① 최종 흐름 · 화면 · 문구

흐름: **환영 1장 → 로그인 → 연습 업무 1개(사무실 보기 → 단체방 지시 → 결재 → 결과) → 끝(첫 직원 추가)**

진행 점(StepDots)은 3개: 환영 · 로그인 · 연습. 지금의 "준비 점검 n/3" 머리말(`onboarding.checkStep`)은 쓰지 않아요.

### 1. 환영 (모달, 사무실은 비어 있고 사이드바는 흐리게)

| 요소 | 문구(ko) | 키 |
|---|---|---|
| 제목 | AI Office에 오신 걸 환영해요 | `onboarding.welcome.title` (기존) |
| 본문 | AI를 직원으로 두고 일을 맡기는 나만의 사무실이에요. 연습 업무 하나로 2분 안에 익혀 봐요. | `onboarding.welcome.lead` (새) |
| 흐름 그림 3칸 | 💬 일 시키기 → ✅ 결재하기 → 📦 결과 받기 | `onboarding.welcome.flow.task` / `.approve` / `.result` (새) |
| 필요한 것 | 필요한 것: Claude 유료 구독(Pro·Max) 또는 ChatGPT 계정 | `onboarding.welcome.needs` (기존, 유지) |
| 작은 글 | 연습은 AI 사용량이 들지 않아요 | `onboarding.welcome.free` (새) |
| 버튼(보조) | 건너뛰기 | `onboarding.skip` (기존) |
| 버튼(주) | 시작하기 · 약 2분 | `onboarding.startTimed` `{n}`=2 (새) |

- 지금의 아바타 6명 줄은 남겨도 돼요(선택). 카드 3장(`onboarding.card.*`)과 `introBefore/Bold/After`, `introLine2`, `welcome.footer`는 이 화면에서 빠져요.

### 2. AI 계정 확인 (모달)

- 지금의 로그인 단계(`ProviderCards`, 4초 자동 재확인, 다시 확인 버튼)를 **그대로** 써요. 바뀌는 건 아래 버튼뿐이에요.

| 상황 | 버튼 | 키 |
|---|---|---|
| 하나라도 준비됨 | **확인하고 연습 시작** (주) | `onboarding.login.toPractice` (새) |
| 둘 다 안 됨 | **계정은 나중에 · 연습 먼저 하기** (보조) + 다음 버튼 막힘 | `onboarding.login.practiceAnyway` (새) — 지금의 `onboarding.provider.laterTour` 자리 |
| 공통 | 이전 | `onboarding.prev` (기존) |

- 연습은 AI를 부르지 않으므로 **로그인이 안 돼도 연습은 할 수 있어요.** 지금은 막히면 둘러보기로 보내는데, 바뀐 뒤에는 연습으로 보내요. 계정 연결은 나중에 기존 안내 띠(ProviderBanner)와 설정 › AI·업무에서 해요.

### 3. 연습 업무 (진짜 화면 위에 안내 · AI 사용량 0)

- 기존 모의 진행 엔진(`shared/tutorial.ts`, `main/tutorial.ts`)과 연습 회사(이리드·박디자·최코드, `연습` 꼬리표)를 그대로 써요.
- **바뀌는 점: 일을 시키는 곳이 업무 보드 → 단체방**이에요. 시안 A 그대로예요(실제로 가장 많이 쓰는 방법 한 번으로). 업무 보드는 처음 열 때 힌트로 알려 줘요(②).
- 안내 상자는 지금의 둘러보기 설명 상자 모양(대상 밝게 비춤 + 옆 상자)을 써요. 상자 위쪽 작은 글은 "연습", 오른쪽은 "n / 4".
- 위 막대에 칩 두 개: `🧪 연습 중 · AI 사용량 없음`(`tutorial.chip`, 새), `연습 n / 4`(`tutorial.guide.progress` 기존 형식).
- 모든 단계에 **튜토리얼 끝내기**(`tutorial.common.end`, 기존)와 Esc. 누르면 4번(끝) 화면으로 가요.

| # | 화면 · 비출 곳 | 안내 문구(ko) | 키 | 넘어가는 조건 | 예산 |
|---|---|---|---|---|---|
| P1 | 사무실 · 연습 직원 책상들 (`＋ 직원 추가` 버튼도 함께 테두리) | 여기가 사무실이에요. 연습 직원 3명을 미리 데려다 놨어요. 진짜 직원은 ＋ 직원 추가 버튼으로 들여요. | `tutorial.task.p1.hint` (새) | 상자의 **다음** 누름 (새 조건 `ack`) | 8초 |
| P2 | 단체방 · **보내기** 버튼 (입력칸은 미리 채움) | 일은 단체방에서 시켜요. @이름으로 부르면 그 직원이 받아요. 문장은 미리 써 뒀어요. 보내기를 눌러 보세요. | `tutorial.task.p2.hint` (새) · 입력칸 `tutorial.task.p2.message` (새, `{lead}`) | 연습 메시지 보냄 (새 조건 `chatSent`) | 12초 |
| (자동) | 단체방 · 사이드바 **결재함**(배지 1) | 큰 일은 리드가 먼저 기획안을 써서 확인을 받아요. 결재함에 1건이 왔어요. | `tutorial.task.p3.hint` (새) · 말풍선 `tutorial.task.a3.bubble` → `tutorial.task.auto1.bubble` (기존) | 결재함 열림 (`view: inbox`) — 4초 뒤 기획안 도착 | 5초 |
| P3 | 결재함 · **승인** 버튼 | 내용을 확인하고 '승인'을 누르면 팀원에게 일이 배정돼요. | `tutorial.task.a5.hint` (기존) · 기획안 `tutorial.task.plan.*` (기존) | `planApproved` | 15초 |
| (자동) | 사무실 · 말풍선 2개 | 팀원들이 일하는 모습을 구경해요. | `tutorial.task.auto2.hint` (기존) · 토스트 `tutorial.task.a5.toast` | 타이머 **8초**(지금 12초) · **지금 보기** 가능 | 8초 |
| P4 | 단체방 · 리드의 결과 보고 메시지 안 **완료로 옮기기** | 일이 끝나면 리드가 결과 보고를 올려요. 마음에 들면 완료로 옮겨 마무리해요. | `tutorial.task.p6.hint` (새) · 보고 `tutorial.task.result.*` (기존) · 말풍선 `designer.done`/`dev.done` | `taskDone` | 12초 |

- 상자 놓는 자리: 승인 단계는 상자를 **승인 버튼 아래**에 둬요(위에 두면 기획안 글을 가려요 — 시안에서 확인함). 나머지는 지금의 `placeTip` 규칙대로.
- 엔진에서 새로 필요한 것(구현 판단은 정리드): 조건 `ack`, `chatSent` / 연습 단체방(연습 팀 방)에 지시·보고 메시지 넣기 / 보고 메시지의 완료 버튼이 기존 결과 카드 `완료`와 같은 효과(`finishTask`).
- 기존 보드 흐름(a1~a7)은 지우지 말고 `?` › 업무 맡기기 연습에서 계속 쓸지, 단체방 흐름으로 바꿀지 정리드가 정해 주세요. **디자인 추천안(대표 미확인): 둘 다 새 단체방 흐름 하나로 통일.**

### 4. 끝 — 첫 직원 추가 (모달)

| 요소 | 문구(ko) | 키 |
|---|---|---|
| 제목 | 해냈어요! 🎉 | `tutorial.done.title` (기존) |
| 본문 | 업무를 맡기고, 승인하고, 결과까지 받았어요. 진짜 직원도 똑같이 일해요. | `tutorial.done.task` (기존) |
| 보상 줄 | 회사 자금 +{amount} (지금 규칙 그대로) | `tutorial.done.reward` (기존) |
| 큰 선택 카드 | 🧑‍💼 **첫 직원 추가하기** / 직무만 고르면 돼요 · 작업 폴더는 이때 골라요 | `onboarding.finish.hire`, `onboarding.finish.hireDesc` (새) |
| 작은 글 | 원하면 더 해 보기 (선택) | `onboarding.finish.more` (새) |
| 알약 버튼 2개 | 🗣️ 회의 연습 · 약 1분 / 🧭 나머지 화면 둘러보기 · 14곳 | `tutorial.picker.meeting` + `helpMenu.min` / `helpMenu.tour` (새) |
| 작은 글 | 연습 직원은 설정 › 안내에서 언제든 정리할 수 있어요. | `onboarding.finish.cleanupNote` (새) |
| 버튼(보조) | 나중에 | `onboarding.later.short` (새) |
| 버튼(주) | 직원 추가하기 | `coachTour.hireStaff` (기존) |

- 직원 추가하기 → `isOnboarded: true` 저장 → 사무실 화면 + 고용 창 열기. 나중에 → 저장 후 사무실, 토스트 `guideHint.replayToast`.
- 시안에는 "첫 직원을 추가하면 저절로 정리돼요"라고 적었지만, 지금 그렇게 동작하는지 **확인 못 했어요**(대본의 열린 질문). 자동 정리가 없으면 위 `cleanupNote` 문구를 쓰세요.

### 새 문구 4개 언어

| 키 | ko | en | ja | zh |
|---|---|---|---|---|
| `onboarding.welcome.lead` | AI를 직원으로 두고 일을 맡기는 나만의 사무실이에요. 연습 업무 하나로 2분 안에 익혀 봐요. | Your own office where AI works as your staff. Learn the basics in under 2 minutes with one practice task. | AIをスタッフにして仕事を任せる、自分だけのオフィスです。練習の仕事ひとつで2分以内に覚えましょう。 | 这是把 AI 当作员工、把工作交给它的专属办公室。用一个练习任务，2 分钟内就能上手。 |
| `onboarding.welcome.flow.task` | 일 시키기 | Assign | 仕事を頼む | 分配工作 |
| `onboarding.welcome.flow.approve` | 결재하기 | Approve | 承認する | 审批 |
| `onboarding.welcome.flow.result` | 결과 받기 | Get results | 結果を受け取る | 拿到结果 |
| `onboarding.welcome.free` | 연습은 AI 사용량이 들지 않아요 | Practice doesn't use any AI quota | 練習ではAI使用量はかかりません | 练习不消耗 AI 用量 |
| `onboarding.startTimed` | 시작하기 · 약 {n}분 | Start · about {n} min | はじめる · 約{n}分 | 开始 · 约 {n} 分钟 |
| `onboarding.login.toPractice` | 확인하고 연습 시작 | Continue to practice | 確認して練習を始める | 确认并开始练习 |
| `onboarding.login.practiceAnyway` | 계정은 나중에 · 연습 먼저 하기 | Connect later · practice first | アカウントは後で · 先に練習 | 稍后连接账号 · 先练习 |
| `tutorial.chip` | 연습 중 · AI 사용량 없음 | Practicing · no AI quota used | 練習中 · AI使用量なし | 练习中 · 不消耗 AI 用量 |
| `tutorial.common.next` | 다음 | Next | 次へ | 下一步 |
| `tutorial.task.p1.hint` | 여기가 사무실이에요. 연습 직원 3명을 미리 데려다 놨어요. 진짜 직원은 ＋ 직원 추가 버튼으로 들여요. | This is your office. We've brought in 3 practice staff. Add real staff with the ＋ Add staff button. | ここがオフィスです。練習用スタッフを3人連れてきました。本物のスタッフは ＋ スタッフを追加 ボタンから迎えます。 | 这里就是办公室。已经先请来 3 位练习员工。真正的员工可以通过 ＋ 添加员工 按钮加入。 |
| `tutorial.task.p2.hint` | 일은 단체방에서 시켜요. @이름으로 부르면 그 직원이 받아요. 문장은 미리 써 뒀어요. 보내기를 눌러 보세요. | Give work in the group chat. Mention @name and that person takes it. The message is ready — press Send. | 仕事はグループチャットで頼みます。@名前で呼ぶと、そのスタッフが受けます。文章は用意してあります。「送信」を押してみましょう。 | 工作在群聊里分配。用 @名字 呼叫，那位员工就会接下。消息已经写好了，点“发送”试试。 |
| `tutorial.task.p2.message` | @{lead} 로그인 화면 만들어 줘 | @{lead} please build a login screen | @{lead} ログイン画面を作って | @{lead} 帮我做一个登录界面 |
| `tutorial.task.p3.hint` | 큰 일은 리드가 먼저 기획안을 써서 확인을 받아요. 결재함에 1건이 왔어요. | For bigger work, the lead first writes a plan for you to check. 1 item is waiting in Approvals. | 大きな仕事は、まずリーダーが企画案を書いて確認をもらいます。決裁箱に1件届きました。 | 较大的工作，组长会先写策划案请你确认。审批箱里来了 1 件。 |
| `tutorial.task.p6.hint` | 일이 끝나면 리드가 결과 보고를 올려요. 마음에 들면 완료로 옮겨 마무리해요. | When the work is done, the lead posts a result report. If it looks good, move it to Done. | 仕事が終わると、リーダーが結果報告を出します。よければ「完了」に移して締めくくります。 | 工作完成后，组长会发布结果报告。满意的话，就把它移到“完成”收尾。 |
| `onboarding.finish.hire` | 첫 직원 추가하기 | Add your first staff member | 最初のスタッフを追加 | 添加第一位员工 |
| `onboarding.finish.hireDesc` | 직무만 고르면 돼요 · 작업 폴더는 이때 골라요 | Just pick a role · choose the work folder here | 職務を選ぶだけ · 作業フォルダはここで選びます | 选好职务就行 · 工作文件夹在这里选 |
| `onboarding.finish.more` | 원하면 더 해 보기 (선택) | Want more? (optional) | もっと試す（任意） | 想多试试？（可选） |
| `onboarding.finish.cleanupNote` | 연습 직원은 설정 › 안내에서 언제든 정리할 수 있어요. | You can clear the practice staff anytime in Settings › Guides. | 練習用スタッフは 設定 › ご案内 からいつでも片付けられます。 | 随时可以在 设置 › 指南 中清理练习员工。 |
| `onboarding.later.short` | 나중에 | Later | 後で | 稍后 |

---

## ② 화면마다 처음 한 번 힌트 · `?` 도움말

### 처음 한 번 힌트 (B에서 가져옴)

- 모양: 짙은 말풍선(라이트에서는 짙은 바탕·밝은 글, 다크에서는 밝은 바탕·짙은 글 — 시안의 `.hint`). 폭 약 236px, 둥글기 12px, 글 12.5px.
  - 맨 위 작은 글 "처음 한 번만 보여요", 본문 1~2줄, 오른쪽 아래 버튼 **힌트 모두 끄기**(흐린 글) · **알겠어요**(굵게).
  - 화면을 어둡게 덮지 않아요(눌러야 하는 곳을 막지 않음). 바깥을 누르거나 다른 화면으로 가도 그 힌트는 **본 것으로** 쳐요.
  - **창(모달) 안의 힌트는 떠 있는 말풍선 대신 해당 칸 바로 아래에 한 줄 상자**로 넣어요(떠 있으면 버튼을 가려요 — 시안에서 확인함). 다크 그림이 이 모양이에요.
- 한 화면에 힌트는 하나만. 한 번에 하나만 보여요(다른 안내·연습·업데이트 소식이 떠 있으면 기다림 — 지금 `WhatsNew`·`LevelUp`이 쓰는 `isBusy` 규칙과 같게).

| id | 대상 화면 · 붙는 곳 | 뜨는 때 | 문구(ko) |
|---|---|---|---|
| `hire` | 직원 추가 창 · "어디서 일할지(작업 폴더)" 칸 아래, 창 안 | 고용 창을 처음 열 때 | 직무만 고르면 돼요. 작업 폴더는 이 직원이 볼 폴더예요. 정하지 않으면 지시할 때 말한 프로젝트 폴더에서 일해요. |
| `board` | 업무 보드 · 사이드바 '업무 보드' 오른쪽(폰: 화면 위 제목 아래) | 업무 보드를 처음 열 때 | 긴 일이나 여러 사람이 나눌 일은 카드로 올려요. 담당자를 고르고 시작을 누르면 일이 시작돼요. |
| `meeting` | 회의실 · '회의 시작' 버튼 아래 | 회의실을 처음 열 때 | 여러 직원의 생각이 필요하면 회의를 열어요. 처음이면 ? › 회의 연습(AI 사용량 없음)으로 1분 만에 해 볼 수 있어요. |
| `chat` | 단체방 · 입력칸 위 | 단체방을 처음 열 때 — **업무 연습을 끝낸 사람에게는 안 띄움** | @이름으로 부르면 그 직원이 일을 받아요. |
| `inbox` | 결재함 · 첫 결재의 승인 버튼 위 | 진짜 결재가 처음 왔을 때 — **업무 연습을 끝낸 사람에게는 안 띄움** | 직원이 확인이 필요한 일은 여기로 와요. 읽고 승인하면 일이 이어져요. |

- 빈 직원 패널의 예시 지시(`guideHint.panel.*`), 빈 결재함 설명(`guideHint.inbox.*`), 고용 창 접기(`guideHint.hire.*`)는 지금 그대로 둬요. 힌트와 겹치지 않아요.
- 업무 모드(게임 요소 숨김)에서도 위 5개는 그대로 떠요(사무실 지도 관련 힌트는 없음).

| 키 | ko | en | ja | zh |
|---|---|---|---|---|
| `firstHint.badge` | 처음 한 번만 보여요 | Shown only once | 初回のみ表示 | 仅首次显示 |
| `firstHint.ok` | 알겠어요 | Got it | わかりました | 知道了 |
| `firstHint.allOff` | 힌트 모두 끄기 | Turn off all tips | ヒントをすべてオフ | 关闭所有提示 |
| `firstHint.hire` | 직무만 고르면 돼요. 작업 폴더는 이 직원이 볼 폴더예요. 정하지 않으면 지시할 때 말한 프로젝트 폴더에서 일해요. | Just pick a role. The work folder is the folder this staff member works in. Leave it empty and they'll work in whichever project folder you mention. | 職務を選ぶだけでOKです。作業フォルダはこのスタッフが見るフォルダです。決めなければ、指示で伝えたプロジェクトフォルダで働きます。 | 选好职务就行。工作文件夹是这位员工要看的文件夹。不设置的话，会在你下达指令时提到的项目文件夹里工作。 |
| `firstHint.board` | 긴 일이나 여러 사람이 나눌 일은 카드로 올려요. 담당자를 고르고 시작을 누르면 일이 시작돼요. | Post bigger or shared work as a card. Pick an owner and press Start to begin. | 長い仕事や複数人で分ける仕事はカードで出します。担当者を選んで「開始」を押すと始まります。 | 较大的或需要多人分工的工作，就发成卡片。选好负责人并点“开始”即可开工。 |
| `firstHint.meeting` | 여러 직원의 생각이 필요하면 회의를 열어요. 처음이면 ? › 회의 연습(AI 사용량 없음)으로 1분 만에 해 볼 수 있어요. | Hold a meeting when you need several staff members' views. First time? Try ? › Meeting practice (no AI quota) in about a minute. | 複数のスタッフの考えが必要なら会議を開きます。初めてなら ? › 会議の練習（AI使用量なし）で1分ほどで試せます。 | 需要听取多位员工的想法时就开会。第一次的话，可以通过 ? › 会议练习（不消耗 AI 用量）用 1 分钟试一试。 |
| `firstHint.chat` | @이름으로 부르면 그 직원이 일을 받아요. | Mention @name to hand that person the task. | @名前で呼ぶと、そのスタッフが仕事を受けます。 | 用 @名字 呼叫，那位员工就会接下工作。 |
| `firstHint.inbox` | 직원이 확인이 필요한 일은 여기로 와요. 읽고 승인하면 일이 이어져요. | Anything your staff need you to confirm lands here. Read it and approve to keep the work going. | スタッフが確認を必要とする仕事はここに届きます。読んで承認すると仕事が続きます。 | 需要你确认的事情都会来到这里。看完点批准，工作就会继续。 |

- 보드의 '시작' 버튼과 고용 창의 '작업 폴더' 이름은 실제 화면 글자와 맞춰 주세요(번역도 그 화면 키의 번역과 같게).

### `?` 도움말

- 자리: **PC** 위 막대 오른쪽, 사용량 칩 왼쪽. 26px 동그라미, 테두리 + 굵은 `?`(primary 색). 툴팁·접근성 이름 `helpMenu.open`.
  **휴대폰** 위 제목 줄 오른쪽 끝(같은 모양). 정확한 자리는 PhoneShell 위 막대에 맞춰 정리드가 정해 주세요.
- 누르면 오른쪽에서 서랍(폭 300px, 폰은 아래에서 올라오는 시트)이 열려요. 바깥·Esc·✕로 닫아요.

| 묶음 | 줄 | 누르면 | 키 |
|---|---|---|---|
| 지금 화면 · {화면 이름} | 지금 화면 설명 1줄 | (읽기만) | 제목 `helpMenu.here` (새), 본문은 **기존 둘러보기 설명** `coachTour.{화면}.body` 재사용 |
| 연습해 보기 (AI 사용량 없음) | 💬 업무 맡기기 연습 · 약 1분 (해 봤으면 ✓ 해 봤어요) | `tutorialStart('task')` | `helpMenu.practice`, `tutorial.picker.task`, `helpMenu.min`, `tutorial.picker.tried` |
| | 🗣️ 회의 열기 연습 · 약 1분 | `tutorialStart('meeting')` | `tutorial.picker.meeting` |
| 더 알아보기 | 🧭 나머지 화면 둘러보기 · 14곳 | CoachTour를 '더 보기' 단계만으로 시작 | `helpMenu.more`, `helpMenu.tour` |
| | 💡 처음 힌트 다시 보기 | 본 힌트 기록을 비움 + 토스트 | `helpMenu.hintsReset`, `helpMenu.hintsResetToast` |
| | ↺ 처음 안내 다시 보기 | `isOnboarded: false` (지금 설정 › 안내와 같음) | `settingsPage.guide.onboarding` (기존) |

| 키 | ko | en | ja | zh |
|---|---|---|---|---|
| `helpMenu.open` | 도움말 | Help | ヘルプ | 帮助 |
| `helpMenu.here` | 지금 화면 · {view} | This screen · {view} | この画面 · {view} | 当前界面 · {view} |
| `helpMenu.practice` | 연습해 보기 (AI 사용량 없음) | Practice (no AI quota) | 練習する（AI使用量なし） | 练习一下（不消耗 AI 用量） |
| `helpMenu.min` | 약 {n}분 | about {n} min | 約{n}分 | 约 {n} 分钟 |
| `helpMenu.more` | 더 알아보기 | Learn more | もっと知る | 了解更多 |
| `helpMenu.tour` | 나머지 화면 둘러보기 · {n}곳 | Tour the other screens · {n} | ほかの画面を見て回る · {n}か所 | 浏览其他界面 · {n} 处 |
| `helpMenu.hintsReset` | 처음 힌트 다시 보기 | Show first-time tips again | 初回ヒントをもう一度表示 | 重新显示首次提示 |
| `helpMenu.hintsResetToast` | 화면을 처음 열 때처럼 힌트가 다시 나와요. | Tips will show again as if you're opening each screen for the first time. | 各画面を初めて開いたときのように、ヒントがまた表示されます。 | 打开各界面时会像第一次一样再次显示提示。 |

### 다시 보기 방법 (정리)

- 힌트: `?` › 처음 힌트 다시 보기, 설정 › 안내(같은 버튼 하나 추가 — `helpMenu.hintsReset` 재사용). "힌트 모두 끄기"를 눌렀어도 이걸로 다시 켜져요.
- 처음 안내 전체: `?` › 처음 안내 다시 보기, 설정 › 안내 › 처음 안내 다시 보기, 빈 사무실 띠의 '안내 다시 보기'(지금 그대로).
- 연습·둘러보기: `?` 서랍, 설정 › 안내(지금 그대로, 둘러보기 버튼 이름만 아래 ③ 참고).

---

## ③ 기존 것 처리표

### Onboarding.tsx 5단계

| 단계 | 처리 | 메모 |
|---|---|---|
| welcome | **유지(줄임)** | ①-1 문구로. 카드 3장 빼고 흐름 그림 3칸 |
| login | **유지** | 버튼 2개 이름·갈 곳만 바꿈(①-2). 막혀도 연습으로 |
| folder | **삭제** | 폴더는 고용 창에서(힌트 `hire`). `defaultCwd` 설정값은 지우지 말 것 — 이미 고른 사람의 고용 창 미리 채우기에 계속 씀 |
| firstTask | **삭제** | AI 사용량 드는 실제 첫 업무 없음. `useFirstTask`·`firstTaskFlow`·관련 `onboarding.firstTask.*` 문구 정리 여부는 정리드 판단 (`hasDoneFirstTask` 기록은 ⑤ 규칙에 씀) |
| ready | **이동·교체** | 연습 끝 화면(①-4)으로. '직원 마켓에서 데려오기'는 빠짐(빈 사무실 띠에 이미 있음) |

### CoachTour 기본 5곳 → 연습에 녹임

| 기본 단계 | 어디로 |
|---|---|
| 사무실 (`coachTour.map`) | 연습 P1 |
| 직원 추가 (`coachTour.hire`) | 연습 P1(버튼 테두리) + 힌트 `hire` |
| 단체방 (`coachTour.chat`) | 연습 P2 |
| 결재함 (`coachTour.inbox`) | 연습 자동 단계 + P3 |
| 첫 고용 (`coachTour.firstHire`) | 끝 화면(①-4) |

- 첫 실행 뒤 둘러보기 **자동 시작 없음**. `Onboarding`의 `onStartTour` 연결과 `App.tsx`의 "둘러보기 끝나면 연습 고르기(TutorialPicker) 자동으로 띄우기"를 끊어요.

### '더 보기' 14곳 · 회의 연습

| 항목 | 어디에 |
|---|---|
| 더 보기 14곳 (HUD·비서·바탕화면 비서·대시보드·조직도·업무 보드·회의실·매뉴얼·예약·보고서·급여·상점·설정·업데이트) | `?` › 나머지 화면 둘러보기 · 14곳, 끝 화면 알약 버튼, 설정 › 안내. **'더 보기' 단계만** 장(章) 순서대로 시작. 업무 모드·휴대폰에서 빠지는 단계 규칙은 지금 그대로(그래서 '14곳' 숫자는 실제 단계 수로 넣기) |
| 회의 연습 | `?` › 회의 열기 연습, 끝 화면 알약 버튼, 회의실 첫 힌트에서 안내, 설정 › 안내 › 연습 튜토리얼 해 보기 |
| TutorialPicker(연습 고르기 창) | 자동으로는 안 띄움. 설정 › 안내 › 연습 튜토리얼 해 보기에서만 계속 사용 |
| TutorialDone(축하 창) | `?`·설정에서 시작한 연습의 끝에는 지금 그대로. 첫 실행 연습의 끝에는 ①-4 화면 |
| 설정 › 안내 버튼 이름 | '메뉴 둘러보기 다시 보기' → '화면 둘러보기 (14곳)' 추천안(대표 미확인). 새 키가 필요하면 `helpMenu.tour` 재사용 |

### 건너뛰기 자리

| 어디서 | 버튼 | 결과 |
|---|---|---|
| 환영 | 건너뛰기 | `isOnboarded: true`, 빈 사무실, 토스트 `guideHint.replayToast`. 처음 힌트는 켜진 채로 |
| 로그인 | 계정은 나중에 · 연습 먼저 하기 | 연습으로 (건너뛰는 건 계정 연결만) |
| 연습 각 단계 | 튜토리얼 끝내기 / Esc | 연습 정리 후 끝 화면(①-4) |
| 연습 자동 단계 | 지금 보기 | 기다리지 않고 다음 단계 |
| 끝 화면 | 나중에 | `isOnboarded: true`, 사무실, 토스트 |

- 어디서 끝내든 `isOnboarded: true`가 저장돼야 다음 실행에 다시 안 떠요.

---

## ④ 라이트 · 다크 · 레트로 · 휴대폰 확인할 점

시안은 라이트·다크(라벤더 계열)만 만들었어요. 레트로와 휴대폰은 **그리지 않았고 아래는 확인 목록이에요.**

| 테마/기기 | 확인할 점 |
|---|---|
| 라이트 | 연습 안내 상자가 기획안 글을 가리지 않는지(승인은 버튼 아래). 어둡게 덮은 바탕 위에서 `연습` 꼬리표(노랑) 글이 읽히는지 |
| 다크 | 힌트가 반전색(밝은 상자)이라 너무 튀지 않는지 — 튀면 카드색 + primary 테두리로 바꿔도 됨. `?` 버튼 테두리가 바탕과 구분되는지 |
| 레트로 | 힌트·`?`·서랍이 레트로의 각진 테두리·글꼴을 따르는지(둥근 모서리가 섞이지 않게). 힌트 반전색이 레트로 팔레트에서 대비 4.5:1 이상인지. 흐름 그림 3칸 이모지가 듀오 아이콘으로 바뀌는지(`IconText`) |
| 테마 전체 | 11개 테마(lavender~retro)에서 primary 위 글자 대비. 흐린 사이드바(환영·로그인 때) 가 테마마다 너무 사라지지 않는지 |
| 휴대폰 (원격 화면) | 연습 안내 상자는 아래 탭 위(지금 `phone:bottom-20` 규칙). 힌트는 떠 있는 말풍선 대신 화면 아래 시트 한 줄로. `?` 서랍은 아래 시트. P1의 '＋ 직원 추가'가 폰에서 어디인지에 맞춰 테두리. 바탕화면 비서 단계는 빠짐(지금 규칙) |
| 휴대폰 첫 실행 | 원격 휴대폰 화면에서 첫 실행 안내가 뜨는지 **확인 못 함**. 보통 PC에서 이미 안내를 마친 상태라 뜨지 않는 것이 맞다고 추정 |
| 좁은 PC 창 | 환영 모달 폭 440px · 서랍 300px이 창 폭 800px 안팎에서 겹치지 않는지 |
| 4개 언어 | 영어·일본어에서 버튼 "Connect later · practice first"가 두 줄로 안 깨지는지. 흐름 그림 칸 글자 넘침 |

안드로이드 앱(`Onboarding.kt`)은 이번 범위에 넣지 않았어요.

---

## ⑤ 기존 사용자에게 영향 없게 (다시 안 뜨는 규칙)

1. **`isOnboarded`가 이미 `true`인 사람에게는 새 첫 실행 안내가 뜨지 않아요.** 판단 기준은 지금의 `isOnboarded` 하나 그대로 (새 버전 번호 비교 없음).
2. **처음 한 번 힌트는 새 사용자만.** 업데이트로 처음 켰을 때 `isOnboarded === true`이고 힌트 기록이 아직 없으면, 힌트 5개를 **모두 본 것으로 표시**하고 시작해요. (안 하면 기존 사용자가 화면을 열 때마다 힌트를 처음부터 다 보게 돼요.)
3. 힌트 기록은 설정에 저장 추천안(대표 미확인): `seenHints: string[]`(본 힌트 id), `isHintsOff: boolean`(모두 끄기). 위치(설정 파일 vs 브라우저 저장소)는 정리드 판단. 다만 PC와 휴대폰이 같은 기록을 보면 좋아요.
4. `chat`·`inbox` 힌트는 업무 연습을 끝냈거나(`tutorial.completed`에 `task`) 예전에 실제 첫 업무를 해 본 사람(`hasDoneFirstTask()`)에게는 안 띄워요.
5. 첫 설정 도중(안내를 다 마치지 않은 채) 업데이트한 사람: 새 흐름의 환영부터 다시 시작해요. 고른 폴더(`defaultCwd`)는 그대로 둬요.
6. 이미 있는 `defaultCwd`, 연습 회사 데이터, `tutorial.completed`, 둘러보기 관련 값은 지우지 않아요.
7. `?` 버튼은 모두에게 새로 보여요. 이건 의도한 변화이니 이번 버전 업데이트 소식에 한 줄 넣어 주세요: "오른쪽 위 ? 에서 연습·둘러보기·도움말을 언제든 열 수 있어요." (4개 언어는 업데이트 소식 담당이 작성)
8. 업데이트 소식(`WhatsNew`)·레벨업은 지금처럼 `isOnboarded`가 `false`인 동안 안 뜨고, 연습 중에도 안 떠요.

검수용 시나리오(오큐에이): 새로 설치 / 안내 마친 기존 사용자 업데이트 / 안내 도중 업데이트 / 설정에서 처음 안내 다시 보기 / 로그인 없이 끝까지 / 연습 중 앱 종료 후 재실행(대본 규칙: 처음부터) — 각각 힌트가 뜨는지·안 뜨는지.

---

## ⑥ 확정 시안 그림

- `shots/final-light.png` — 라이트 · 연습 3/4 결재함에서 승인 (상자가 승인 버튼 아래)
- `shots/final-dark.png` — 다크 · 직원 추가 창 첫 힌트(창 안 한 줄 상자) + 오른쪽 위 `?`
- 나머지 화면은 `final.html`에서: 1 환영 · 2 로그인 · 3~8 연습 · 9 끝 화면 · 10~12 처음 힌트 · 13 `?` 서랍.
- 시안의 사무실·단체방·결재함은 앱 화면을 비슷하게 다시 그린 그림이에요. 실제 크기·글꼴은 앱의 기존 컴포넌트를 따르세요.

## 아직 정해지지 않은 것

- 기존 보드 흐름 연습(a1~a7)을 남길지, 단체방 흐름으로 통일할지(①-3) — 정리드 판단, 디자인 추천은 통일.
- 연습 직원이 첫 실제 고용 때 자동 정리되는지 — 확인 못 함(①-4 문구가 달라짐).
- 힌트 기록 저장 위치(⑤-3).
- 예상 시간은 실측 전. 구현 후 오큐에이가 재 보면 환영 화면의 "약 2분"을 맞춰 주세요.
