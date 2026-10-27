# 소개 페이지 0.14.0 구성안·문구 (한·영·일·중)

> 작성: 김기획(PM) · 대상: `site/index.html` · 코드는 바꾸지 않았다. 구현 담당이 `T` 사전(`ko/en/ja/zh`)에 그대로 옮긴다.
> 근거: CHANGELOG 0.12.0~0.13.2, `docs/specs/ai-office.md`, 0.14.0 Codex 작업 커밋(공급자 선택·GPT 직원·사용량 카드·외부 Codex 세션·앱 내부 AI 선택).
> 쓰기 규칙: 기술 용어(Codex 앱 서버, MCP, Tailscale 설정 등)는 쉬운 말로 쓴다. 필요하면 괄호로 한 번만.

## 0. 먼저 정할 것 (확인 필요)

1. **핵심 메시지 vs 이전 결정.** `ai-office.md` 11절에는 "소개 문구는 특정 AI를 내세우지 않는 표현"이라고 확정돼 있다. 이번 지시는 "Claude와 GPT 직원을 함께 고용하는 AI 사무실"이다. 이 문서는 **이번 지시를 따랐다.** 단, 히어로 제목은 AI 이름을 빼고(`AI 직원`), 부제와 기능 1번에서 두 이름을 밝히는 안으로 짰다. 이름을 제목에도 넣을지는 대표 확인.
2. **GPT(Codex) 직원은 '베타' 표기** 결정(11절)이 있어 기능 1번과 FAQ에 '베타'를 붙였다.
3. **0.14.0 CHANGELOG 항목이 아직 없다.** 사용량 카드·외부 세션·앱 내부 AI 선택의 최종 화면 이름은 구현 담당(정리드)이 확인해 문구를 맞춘다. (**확인 필요**)
4. **Windows 지원 범위.** 현재 FAQ·카드는 "외부 직원 알림·화면 캡처는 Mac 전용"이다. 컴퓨터 조작 장비·Codex 외부 세션이 Windows에서도 되는지 확인 전이라 문구에서 플랫폼을 단정하지 않았다. (**확인 필요**)
5. **다운로드 용량.** Codex를 앱에 포함해 맥 파일이 약 2배(+260MB)다. 다운로드 카드에 "용량이 커요" 한 줄을 넣었다. 실제 용량은 빌드 후 숫자로 바꾼다. (**확인 필요**)

## 1. 페이지 구성 (위에서 아래로)

| # | 섹션 | id | 현재 대비 | 스크린샷 |
|---|---|---|---|---|
| 1 | 히어로 | (hero) | 제목·부제 교체, 배지에 '새로 GPT 직원' 추가 | office (교체) |
| 2 | 사용 흐름(세 단계) | #how | 1단계를 'Claude/GPT 고르기'로 보강 | 없음(글만) |
| 3 | 핵심 기능 8개 | #features | 6개 → 8개로 재구성 | 아래 표 |
| 4 | 꾸미기·레벨 | #grow | 기존 7번 항목을 독립 섹션으로 확장(데모데이 포함) | 3장 |
| 5 | 휴대폰 | #screens | 문구에 집 밖 연결 추가 | 기존 3장 교체 |
| 6 | 다운로드 | #download | 용량 안내 한 줄 | 없음 |
| 7 | FAQ | #faq | 7개 → 9개(GPT·로그인 질문 교체) | 없음 |
| 8 | 마지막 권유 | (final) | 문구 교체 | 없음 |

내비게이션: 사용법 · 기능 · 꾸미기 · 휴대폰 · 다운로드 · FAQ.

## 2. 문구

### 2-1. 공통(메타·내비·배지)

| 키 | ko | en | ja | zh |
|---|---|---|---|---|
| meta.title | AI Office — Claude와 GPT 직원을 함께 고용하는 AI 사무실 | AI Office — An AI office where you hire Claude and GPT staff together | AI Office — ClaudeとGPTの社員を一緒に雇うAIオフィス | AI Office — 同时雇用 Claude 和 GPT 员工的 AI 办公室 |
| meta.desc | Claude와 GPT 직원을 함께 뽑아 일을 맡기고, 결재하고, 보고받는 무료 오픈소스 데스크톱 앱. 명령어 창도, 어려운 설정도 필요 없습니다. | A free, open-source desktop app to hire Claude and GPT staff, hand out work, approve, and get reports. No command line, no hard setup. | ClaudeとGPTの社員を雇い、仕事を任せ、承認し、報告を受ける無料のオープンソースデスクトップアプリ。コマンド画面も難しい設定も不要です。 | 可同时雇用 Claude 和 GPT 员工、分配任务、审批并接收汇报的免费开源桌面应用。无需命令行,无需复杂设置。 |
| nav | 사용법 / 기능 / 꾸미기 / 휴대폰 / 다운로드 / FAQ | How it works / Features / Grow / Phone / Download / FAQ | 使い方 / 機能 / 育てる / スマホ / ダウンロード / FAQ | 用法 / 功能 / 成长 / 手机 / 下载 / FAQ |
| badge.oss | 무료 · 오픈소스 · 새로 GPT 직원 | Free · Open source · New: GPT staff | 無料 · オープンソース · 新登場: GPT社員 | 免费 · 开源 · 新增 GPT 员工 |

### 2-2. 히어로

- **제목**
  - ko: 코드를 몰라도,<br>**AI 직원**을 함께 고용하세요
  - en: No code needed.<br>Hire **AI staff** together.
  - ja: コードを知らなくても、<br>**AI社員**をまとめて雇えます
  - zh: 不懂代码也没关系,<br>一起雇用 **AI 员工**
- **부제**
  - ko: Claude 직원과 GPT 직원을 한 사무실에 뽑아 일을 맡기세요. 중요한 일은 결재함에서 확인하고, 끝나면 보고를 받아요. 명령어 창도, 어려운 설정도 필요 없습니다.
  - en: Put Claude staff and GPT staff in one office and hand out the work. Approve the important parts in your inbox and get a report when it's done. No command line, no hard setup.
  - ja: ClaudeとGPTの社員を一つのオフィスに迎えて、仕事を任せましょう。大事な作業は承認箱で確認し、終わったら報告が届きます。コマンド画面も難しい設定も不要です。
  - zh: 把 Claude 员工和 GPT 员工请进同一间办公室,放心交给他们工作。重要的事在审批箱确认,完成后收到汇报。无需命令行,无需复杂设置。
- **버튼:** 기존 그대로(`{os}용 다운로드`, `다른 플랫폼:`).
- **스크린샷:** `office` — 사무실 전경에 Claude 직원과 GPT 직원이 함께 앉아 있는 모습. 직원 이름표에 공급자 표시가 보이게 한다.

### 2-3. 사용 흐름 (#how)

- 눈썹/제목/부제
  - ko: 사용법 · 세 단계면 충분해요 · 사람에게 일을 맡기듯 하면 됩니다. 뽑고, 말하고, 확인만 하세요.
  - en: How it works · Three steps are enough · Just like handing work to a person: hire, talk, and check.
  - ja: 使い方 · 3ステップでOK · 人に仕事を頼むのと同じです。雇って、話して、確認するだけ。
  - zh: 用法 · 三步就够了 · 就像把工作交给同事:雇人、开口、确认。
- **1단계**
  - ko: **직원 뽑기** — 직무와 모습, 그리고 Claude나 GPT 중 어느 쪽 직원으로 뽑을지 고르세요. 자리에 앉으면 바로 일할 준비를 해요. / 예: 마케터 ‘한소라’(GPT)를 뽑았어요
  - en: **Hire** — Pick a role, a look, and whether the new hire is Claude or GPT. They sit down ready to work. / e.g. I hired Sora, a marketer (GPT)
  - ja: **雇う** — 職種と見た目、そしてClaudeかGPTのどちらの社員にするかを選びます。席に着けばすぐ働けます。 / 例: マーケター「ソラ」(GPT)を雇いました
  - zh: **雇人** — 选好职位、形象,以及雇 Claude 还是 GPT 员工。入座后马上就能开工。 / 例:已雇用市场专员“Sora”(GPT)
- **2단계**
  - ko: **말로 시키기** — 단체방에서 이름을 부르거나, 팀장에게 큰 일을 통째로 맡겨요. / 예: @한소라 다음 주 뉴스레터 초안 부탁해요
  - en: **Just say it** — Call someone by name in the group chat, or give a big job to the team lead. / e.g. @Sora, please draft next week's newsletter
  - ja: **話して頼む** — グループチャットで名前を呼ぶか、大きな仕事はチームリーダーにまとめて任せます。 / 例: @ソラ 来週のニュースレターの下書きをお願いします
  - zh: **开口交代** — 在群聊里点名,或把大任务整个交给组长。 / 例:@Sora 麻烦起草下周的通讯稿
- **3단계**
  - ko: **결재하고 보고받기** — 중요한 일은 결재함에서 승인하고, 끝나면 보고가 올라와요. / 예: 초안 올렸어요. 확인 부탁드려요!
  - en: **Approve and get reports** — Approve the important things in your inbox, and a report arrives when it's done. / e.g. Draft is up. Please take a look!
  - ja: **承認して報告を受ける** — 大事な作業は承認箱で承認し、終わると報告が届きます。 / 例: 下書きを出しました。ご確認をお願いします!
  - zh: **审批并接收汇报** — 重要的事在审批箱批准,完成后会收到汇报。 / 例:草稿已提交,请确认!

### 2-4. 핵심 기능 8개 (#features)

눈썹/제목/부제
- ko: 주요 기능 · 이미 아는 방식으로, 사무실처럼 · AI 세션 하나는 직원 한 명, 확인창은 결재함, 작업 기록은 업무 보고, 사용량은 급여 명세서가 됩니다.
- en: Features · Familiar, like a real office · One AI session is one employee, a confirm dialog is an approval inbox, a work log is a report, and usage is a payslip.
- ja: 主な機能 · 慣れた形で、オフィスのように · AIセッション1つが社員1人、確認画面は承認箱、作業記録は業務報告、使用量は給与明細になります。
- zh: 主要功能 · 用熟悉的方式,像办公室一样 · 一个 AI 会话就是一名员工,确认窗口是审批箱,工作记录是汇报,用量就是工资单。

| # | 기능 | 스크린샷 |
|---|---|---|
| 1 | Claude와 GPT 직원을 함께 | `staff-mix` (새로) |
| 2 | 뽑고, 말로 시키기 | `chat` (재촬영) |
| 3 | 중요한 일은 결재로, 한 번에 되돌리기 | `inbox` (재촬영) |
| 4 | 팀장이 나눠서 진행 | `board` (재촬영) |
| 5 | 단체방과 회의실 | `meeting` (재촬영) |
| 6 | 컴퓨터 조작 장비 | `computer` (새로) |
| 7 | 비서와 튜토리얼 | `secretary` (새로) |
| 8 | 사용량과 급여 명세서, 터미널 세션 보기 | `dashboard` (재촬영) |

**f1. Claude와 GPT 직원을 함께** (새 · 베타 표기)
- ko: 직원마다 Claude와 GPT 중 어느 쪽 두뇌로 일할지 고를 수 있어요. 한 사무실에서 두 종류 직원이 같이 일하고, 일에 어울리는 직원을 추천도 해 줘요. 둘 중 하나만 있어도 바로 시작할 수 있고, GPT 직원은 아직 베타예요.
- en: Choose, per employee, whether they work on Claude or GPT. Both kinds work side by side in one office, and the app suggests who fits a task. One account is enough to start. GPT staff are still in beta.
- ja: 社員ごとに、ClaudeとGPTのどちらで働くかを選べます。1つのオフィスで両方が一緒に働き、仕事に合う社員をおすすめもします。どちらか一方だけでも始められます。GPT社員はまだベータ版です。
- zh: 每位员工都可以选择用 Claude 还是 GPT 工作。两种员工在同一间办公室里协作,还会为任务推荐合适的人选。只有其中一个账号也能马上开始。GPT 员工目前为测试版。
- alt(ko/en/ja/zh): 직원 목록에 Claude 직원과 GPT 직원이 함께 보이는 화면 / A staff list showing Claude and GPT employees together / ClaudeとGPTの社員が並ぶ社員一覧 / 同时显示 Claude 和 GPT 员工的员工列表

**f2. 뽑고, 말로 시키기**
- ko: 직무와 모습을 고르면 바로 일할 준비 끝. 단체방에서 @이름 · @팀 · @전체로 부르거나, 아무도 안 부르면 일에 맞는 직원이 받아요. 준비된 직원 여섯 명을 직원 마켓에서 바로 뽑을 수도 있어요.
- en: Pick a role and a look and they're ready. Call @name, @team, or @everyone in the group chat — or just ask, and the best-fit person picks it up. You can also hire from six ready-made staff in the staff market.
- ja: 職種と見た目を選べば準備完了。グループチャットで @名前・@チーム・@全員 と呼ぶか、誰も呼ばなければ合う社員が受けます。社員マーケットから用意済みの6人をすぐ雇うこともできます。
- zh: 选好职位和形象即可开工。在群聊里用 @姓名、@团队、@全员 点名,不点名时由最合适的员工接手。也可以从员工市场里六位现成的员工中直接雇用。
- alt: 단체방에서 @이름으로 일을 시키고 직원이 답하는 화면 / Giving work with @name in the group chat and getting a reply / グループチャットで@名前を使って仕事を頼み、社員が返事する画面 / 在群聊中用 @姓名 交代任务并得到回复的画面

**f3. 중요한 일은 결재로, 되돌리기까지**
- ko: 파일을 바꾸거나 명령을 실행하는 일은 결재함에 먼저 올라옵니다. 얼마나 맡길지는 내가 정하고, 위험한 명령은 항상 막아요. 마음에 안 들면 ‘작업 전으로 되돌리기’ 한 번으로 직원이 바꾼 파일을 돌려 놓아요.
- en: Anything that changes files or runs commands lands in your approval inbox first. You decide how much to delegate, and risky commands are always blocked. If you don't like the result, one click on "Undo to before the task" restores the files they changed.
- ja: ファイルを変えたりコマンドを実行する作業は、まず承認箱に届きます。どこまで任せるかは自分で決められ、危険なコマンドは常にブロックします。気に入らなければ「作業前に戻す」を押すだけで、社員が変えたファイルが元に戻ります。
- zh: 修改文件或执行命令的操作会先进入审批箱。放权到什么程度由你决定,危险命令始终会被拦下。结果不满意时,点一下“恢复到任务之前”,员工改动的文件就会还原。
- alt: 결재함에 회의 결정·질문·명령 실행 요청이 모인 화면 / The approval inbox with decisions, questions, and command requests / 会議の決定・質問・コマンド実行の依頼が集まった承認箱 / 汇集会议决定、提问和命令执行请求的审批箱

**f4. 팀장이 나눠서 진행**
- ko: 큰 일을 팀장에게 주면 계획을 세워 나누고, 확인을 받은 뒤 순서대로 진행해 보고합니다. 진행 상황은 업무 보드에서, 카드마다 쓴 비용도 볼 수 있어요.
- en: Give a big job to a team lead: they draft a plan, split it up, get your OK, then run it step by step and report. Follow along on the task board, with the cost shown on each card.
- ja: 大きな仕事をリーダーに渡すと、計画を立てて分担し、確認を受けてから順番に進めて報告します。進み具合は業務ボードで、カードごとの費用も見られます。
- zh: 把大任务交给组长,他会制定计划、拆分任务,经你确认后依次推进并汇报。进度看任务看板,每张卡片还显示所花费用。
- alt: 업무 보드와 팀장이 나눈 계획(기획 확인 대기) / The task board and a lead's plan awaiting approval / 業務ボードと、リーダーが分けた計画(確認待ち) / 任务看板与组长拆分的计划(待确认)

**f5. 단체방과 회의실**
- ko: 보고와 허락 요청이 채팅으로 흐르고, 결재함이나 단체방에서 바로 승인하거나 답할 수 있어요. 회의실에서는 직원들이 돌아가며 의견을 내고, 회의록과 할 일이 자동으로 정리돼요.
- en: Reports and permission requests flow through chat, and you can approve or reply right there. In the meeting room, staff take turns giving opinions, and the minutes and to-dos are written up for you.
- ja: 報告や許可の依頼がチャットで流れ、その場で承認や返信ができます。会議室では社員が順番に意見を出し、議事録とやることが自動でまとまります。
- zh: 汇报和许可请求通过聊天流转,可以直接在群聊里批准或回复。会议室里员工轮流发表意见,会议纪要和待办会自动整理好。
- alt: 회의실에서 직원들이 돌아가며 발언하는 화면 / Staff taking turns speaking in the meeting room / 会議室で社員が順番に発言する画面 / 员工在会议室轮流发言的画面

**f6. 컴퓨터 조작 장비** (새)
- ko: 장비를 지급받은 직원은 내 화면을 보고 마우스와 키보드로 직접 작업해요. 화면을 보는 건 바로, 클릭하거나 글을 입력하는 건 결재함에서 내가 승인한 뒤에만 해요. 브라우저를 열어 사이트를 확인하는 장비도 있어요.
- en: A staff member with the computer kit can look at your screen and work with the mouse and keyboard. Looking is instant; clicking and typing only happen after you approve in the inbox. There's also a browser kit for checking websites.
- ja: 装備を支給された社員は、画面を見ながらマウスとキーボードで作業します。見るだけなら即座に、クリックや入力は承認箱で承認した後にだけ行います。サイトを開いて確認するブラウザ装備もあります。
- zh: 配发了装备的员工能看到你的屏幕,并用鼠标和键盘直接操作。查看屏幕无需审批,点击和输入则必须等你在审批箱批准后才会执行。还有可打开网页查看内容的浏览器装备。
- alt: 직원이 화면을 보고 클릭 승인을 기다리는 결재 카드 / An approval card asking to approve a click on the screen / 画面を見てクリックの承認を待つ承認カード / 员工查看屏幕后等待点击批准的审批卡片

**f7. 비서와 튜토리얼**
- ko: 처음엔 둘러보기가 사무실 쓰는 법을 안내하고, ‘한 사이클 해 보기’로 업무 맡기기·회의 열기를 따라 해 볼 수 있어요. 그다음부터는 비서에게 말로 부탁하세요 — 팀 옮기기, 업무 보드 정리, 사무실 꾸미기, 직원 점검까지 해 줘요. 직원이 왜 멈췄는지도 물어볼 수 있어요.
- en: A first-run tour shows you around, and "Try one full cycle" lets you practice handing off a task or running a meeting. After that, just ask the secretary: move people between teams, tidy the task board, redecorate, review staff instructions — even "why did they stop?"
- ja: 最初はツアーで使い方を案内し、「ひととおり体験」で仕事の依頼や会議の開催を真似して試せます。その後は秘書に話しかけるだけ。チームの異動、業務ボードの整理、オフィスの模様替え、社員の点検までお任せです。なぜ止まったのかも聞けます。
- zh: 首次使用有导览带你熟悉办公室,“完整体验一轮”可以跟着练习分配任务和召开会议。之后直接对秘书说就行:调整团队、整理任务看板、布置办公室、检查员工指令都能办,还能问“他为什么停下了”。
- alt: 비서와 대화하며 업무 보드를 정리하는 화면 / Chatting with the secretary to tidy the task board / 秘書と話しながら業務ボードを整理する画面 / 与秘书对话并整理任务看板的画面

**f8. 사용량과 급여 명세서, 터미널 세션 보기**
- ko: 누가 일하고 누가 확인을 기다리는지 한눈에 보고, 직원별 사용량과 Claude·GPT 각각의 플랜 사용량을 카드로 확인해요. 사용량이 거의 다 차면 예약 업무를 잠시 멈춰 알려 줘요. 터미널에서 따로 돌리던 Claude·GPT 작업도 사무실에서 '일하는 중'으로 볼 수 있어요.
- en: See at a glance who's working and who's waiting, with per-employee usage and a card for each of your Claude and GPT plans. When usage runs near the limit, scheduled work pauses and you're told. Claude and GPT sessions you started in a terminal also show up as "working" in the office.
- ja: 誰が働き、誰が確認待ちかをひと目で確認。社員ごとの使用量と、ClaudeとGPTそれぞれのプラン使用量をカードで見られます。使用量が上限に近づくと予約作業を一時停止してお知らせします。ターミナルで別に動かしているClaude・GPTの作業も、オフィスで「作業中」として見えます。
- zh: 一眼看清谁在工作、谁在等你确认,员工用量以及 Claude 和 GPT 各自的套餐用量都以卡片显示。用量快满时会暂停定时任务并提醒你。在终端里另外运行的 Claude、GPT 工作,也会在办公室里显示为“工作中”。
- alt: 직원별 사용량과 Claude·GPT 사용량 카드가 보이는 대시보드 / A dashboard with per-employee usage and Claude/GPT usage cards / 社員別の使用量とClaude・GPTの使用量カードがあるダッシュボード / 显示员工用量及 Claude、GPT 用量卡片的仪表盘

### 2-5. 꾸미기·레벨 (#grow) — 신설

- 눈썹/제목/부제
  - ko: 꾸미기 · 일할수록 자라는 회사 · 직원이 일하면 회사 레벨이 올라 사무실이 넓어지고, 새 가구가 열려요.
  - en: Grow · A company that grows as you work · Staff work, the company levels up, the office expands, and new furniture unlocks.
  - ja: 育てる · 働くほど育つ会社 · 社員が働くと会社のレベルが上がり、オフィスが広がって新しい家具が解放されます。
  - zh: 成长 · 越工作越壮大的公司 · 员工工作后公司升级,办公室变大,解锁新的家具。
- **블록 1. 레벨과 사무실** (스크린샷 `exterior`: 건물 외관, 재촬영)
  - ko: 차고에서 5층 타워까지 커져요. 레벨 11~20에서는 새 가구·소품 20종이 열리고, 레벨 15부터는 레벨마다 전설 품목이 하나씩 있어요. 업무 모드에서는 이런 요소를 숨길 수 있어요.
  - en: From a garage up to a five-floor tower. Levels 11–20 unlock 20 new pieces of furniture and decor, with one legendary item per level from level 15. Work mode can hide all of this.
  - ja: ガレージから5階建てのタワーまで成長します。レベル11〜20では新しい家具・小物20種が解放され、レベル15からは毎レベル伝説級のアイテムが1つ登場します。業務モードでは非表示にできます。
  - zh: 从车库一路成长为五层大楼。11~20 级会解锁 20 件新家具和摆设,从 15 级起每级还有一件传说级物品。办公模式下可以隐藏这些元素。
- **블록 2. 내 맘대로 꾸미기** (스크린샷 `decorate`, 새로: 책상 세트·칸막이가 있는 층)
  - ko: 상점에서 가구·벽지·칸막이·고양이와 강아지를 사서 꾸며요. 책상과 의자는 한 세트로 돌려 놓고, 직원 자리에 앉힐 수 있어요. 커피머신·수족관 같은 소품은 움직이고 반응해요. "알아서 예쁘게 배치해줘"는 비서에게 맡기세요.
  - en: Buy furniture, wallpaper, partitions, cats and dogs in the shop. Rotate a desk and chair as one set and assign it to a person. Props like the coffee machine and aquarium move and react. Or ask the secretary to "arrange it nicely for me."
  - ja: ショップで家具・壁紙・パーテーション・猫や犬を買って飾れます。机と椅子はセットで回転でき、社員の席に置けます。コーヒーマシンや水槽などの小物は動いて反応します。「いい感じに配置して」は秘書にお任せ。
  - zh: 在商店购买家具、壁纸、隔断和猫狗来装饰。桌椅可作为一套整体旋转,并分配给员工的座位。咖啡机、水族箱等摆设会动起来并有反应。“帮我漂亮地布置一下”也可以交给秘书。
- **블록 3. 데모데이** (스크린샷 `demoday`, 새로: 무대와 뒷벽 스크린)
  - ko: 정해진 요일과 시간에 직원들이 무대에 올라 끝낸 일을 발표해요. 결과물은 갤러리에 모여 기간·직원·랩으로 골라 볼 수 있어요.
  - en: On a set day and time, staff step on stage and present what they finished. Results gather in a gallery you can filter by period, person, or lab.
  - ja: 決めた曜日と時間に、社員がステージに上がって完了した仕事を発表します。成果物はギャラリーに集まり、期間・社員・ラボで絞り込めます。
  - zh: 在设定的日期和时间,员工会登台展示完成的工作。成果汇集到画廊,可按时间、员工或实验室筛选。
- alt: 건물 외관 / 책상 세트와 칸막이가 있는 사무실 / 데모데이 무대 — Building exterior / An office with desk sets and partitions / The demo day stage — 建物の外観 / 机セットとパーテーションのあるオフィス / デモデイのステージ — 大楼外观 / 带桌椅套装和隔断的办公室 / 演示日舞台

### 2-6. 휴대폰 (#screens)

- 눈썹/제목/부제
  - ko: 휴대폰 · 자리를 비워도 손안에서 · 안드로이드 앱을 PC와 연결하면 대시보드·결재함·단체방을 휴대폰에서 그대로 쓸 수 있어요. 집 밖에서도 연결돼요.
  - en: Phone · Away from your desk, still in your hand · Link the Android app to your PC and use the dashboard, approval inbox, and group chat from your phone — even outside your home network.
  - ja: スマホ · 席を離れても手のひらで · AndroidアプリをPCとつなぐと、ダッシュボード・承認箱・グループチャットをスマホでそのまま使えます。外出先からでも接続できます。
  - zh: 手机 · 离开座位也在掌心 · 把安卓应用与电脑连接后,仪表盘、审批箱和群聊都能在手机上使用。在外面也能连上。
- 캡션(ko/en/ja/zh)
  - 대시보드: **대시보드** — 확인이 필요한 일을 바로 결재 / **Dashboard** — approve what needs you, right away / **ダッシュボード** — 確認が必要な作業をすぐ承認 / **仪表盘** — 需要确认的事当场审批
  - 결재함: **결재함** — 밖에서도 승인·반려 / **Approval inbox** — approve or reject from anywhere / **承認箱** — 外出先でも承認・却下 / **审批箱** — 在外面也能批准、驳回
  - 단체방: **단체방** — 말로 지시하고 보고받기 / **Group chat** — give orders and get reports / **グループチャット** — 話して指示し、報告を受ける / **群聊** — 开口交代,接收汇报
- 보조 한 줄(스크린 아래, 새로)
  - ko: 공유기 설정을 바꾸지 않고, 내 기기끼리만 이어지는 개인 전용 연결(Tailscale)로 안전하게 붙어요. 같은 와이파이에서만 쓰게 제한할 수도 있어요.
  - en: No router changes — it connects over a private link between your own devices (Tailscale). You can also limit it to the same Wi-Fi.
  - ja: ルーターの設定は不要で、自分の端末同士だけをつなぐ専用回線(Tailscale)で安全に接続します。同じWi-Fiだけに制限することもできます。
  - zh: 无需改路由器设置,通过只连接你自己设备的专用网络(Tailscale)安全接入。也可以限制只能在同一 Wi-Fi 下使用。
- **스크린샷:** `phone-dashboard`, `phone-inbox`, `phone-chat` 재촬영. 대시보드에 GPT 직원이 함께 보이게 한다.

### 2-7. 다운로드 (#download)

- 눈썹/제목/부제
  - ko: 다운로드 · 무료로 받아 보세요 · Claude 또는 GPT(ChatGPT) 계정 중 하나만 로그인돼 있으면 시작할 수 있어요.
  - en: Download · Get it for free · One logged-in account, Claude or GPT (ChatGPT), is enough to start.
  - ja: ダウンロード · 無料でどうぞ · ClaudeまたはGPT(ChatGPT)のアカウントのどちらか1つにログインしていれば始められます。
  - zh: 下载 · 免费获取 · 只要登录 Claude 或 GPT(ChatGPT)账号中的一个就能开始。
- 카드 문구는 기존 유지. **Mac 카드 1줄 추가**
  - ko: 용량이 커요(GPT 직원 기능 포함, 약 ○○MB)
  - en: Larger download (includes GPT staff, about ○○ MB)
  - ja: ファイルサイズが大きめです(GPT社員機能を含む、約○○MB)
  - zh: 体积较大(含 GPT 员工功能,约 ○○MB)
  - ○○는 빌드 뒤 실제 용량으로 바꾼다.
- 버전 표시(`v<span data-version>`)는 자동. 기본값 0.14.0.
- 파일 링크 3종: `Claude-Office-mac-arm64.dmg` / `Claude-Office-win-x64.zip` / `Claude-Office-android.apk` — 개명 뒤 실제 파일 이름과 맞는지 다음 단계에서 확인(현재 `index.html` 11~13줄은 `Claude-Office-*`).

### 2-8. FAQ (#faq) — 9개

| # | ko 질문 / 답 |
|---|---|
| q1 | **따로 가입하거나 API 키가 필요한가요?** 아니요. 컴퓨터에 로그인된 Claude 또는 GPT(ChatGPT) 계정을 그대로 씁니다. 직원들은 그 계정으로 일하고, 사용량도 그 계정에 잡힙니다. |
| q2 | **Claude와 GPT 중 하나만 있어도 되나요?** 네. 하나만 로그인해 있으면 바로 시작할 수 있고, 나머지는 설정에서 나중에 연결하면 돼요. 두 계정이 모두 있으면 직원마다 어느 쪽으로 일할지 고를 수 있어요. 아직 GPT 직원은 베타입니다. |
| q3 | 개발을 전혀 몰라도 쓸 수 있나요? 네. 직원을 뽑고, 채팅으로 일을 시키고, 결재함에서 승인·반려만 하면 됩니다. 명령어를 입력할 일은 없습니다. |
| q4 | 설치할 때 경고창이 떠요. (기존) |
| q5 | 직원이 마음대로 파일을 바꾸지 않나요? 영향이 큰 일은 결재함에 먼저 올라오고, 승인해야 진행됩니다. 직원이 바꾼 파일은 ‘작업 전으로 되돌리기’로 한 번에 돌릴 수 있어요. 되돌리기 어려운 위험한 명령은 항상 막습니다. |
| q6 | **내 데이터는 어디에 저장되나요?** 직원·업무·대화 기록은 내 컴퓨터 안에 저장됩니다. 휴대폰 연결은 기본으로 꺼져 있고, 켤 때만 연결돼요. GPT 로그인 정보는 앱이 갖지 않고 로그인 도구가 관리해요. |
| q7 | **직원이 내 컴퓨터 화면을 마음대로 조작하나요?** 아니요. 장비를 지급받은 직원만 화면을 볼 수 있고, 클릭·입력은 결재함에서 승인해야만 합니다. |
| q8 | 휴대폰 앱만 따로 쓸 수 있나요? 아니요. PC에서 켜 둔 AI Office를 원격으로 쓰는 앱이라 PC 앱이 켜져 있어야 합니다. 집 밖에서도 연결할 수 있어요. |
| q9 | 어떤 언어로 쓸 수 있나요? (기존) |

- **en**
  - q1: Do I need to sign up or get an API key? — No. It uses the Claude or GPT (ChatGPT) account already logged in on your computer. Staff work under that account and usage counts against it.
  - q2: Do I need both Claude and GPT? — No. One logged-in account is enough to start; connect the other later in Settings. With both, you choose per employee which one they work on. GPT staff are still in beta.
  - q3: Can I use it with no dev background? — Yes. Hire staff, give work in chat, and approve or reject in the inbox. You never type a command.
  - q4: A warning shows when I install. — (keep existing)
  - q5: Won't staff change my files on their own? — High-impact actions go to the approval inbox first and only proceed once you approve. You can roll back everything they changed with "Undo to before the task," and risky commands that can't be undone are always blocked.
  - q6: Where is my data stored? — Staff, tasks, and chats are stored on your computer. Phone connection is off by default and only connects when you turn it on. The app doesn't hold your GPT sign-in; the login tool manages it.
  - q7: Can staff control my screen freely? — No. Only staff given the computer kit can see your screen, and clicks and typing happen only after you approve them in the inbox.
  - q8: Can I use the phone app alone? — No. It's a remote for the AI Office running on your PC, so the PC app must be on. It also works away from home.
  - q9: Which languages are supported? — (keep existing)
- **ja**
  - q1: 会員登録やAPIキーは必要ですか? — いいえ。パソコンにログインしているClaudeまたはGPT(ChatGPT)のアカウントをそのまま使います。社員はそのアカウントで働き、使用量もそのアカウントにカウントされます。
  - q2: ClaudeとGPTの両方が必要ですか? — いいえ。どちらか1つにログインしていれば始められ、もう一方は後から設定でつなげます。両方あれば、社員ごとにどちらで働くか選べます。GPT社員はまだベータ版です。
  - q3: 開発を全く知らなくても使えますか? — はい。社員を雇い、チャットで仕事を頼み、承認箱で承認・却下するだけです。コマンドを入力する必要はありません。
  - q4: インストール時に警告が出ます。 — (既存どおり)
  - q5: 社員が勝手にファイルを変えませんか? — 影響の大きい作業はまず承認箱に届き、承認して初めて進みます。社員が変えたファイルは「作業前に戻す」で一度に戻せます。元に戻せない危険なコマンドは常にブロックします。
  - q6: データはどこに保存されますか? — 社員・業務・会話の記録はパソコン内に保存されます。スマホ接続は初期状態ではオフで、オンにしたときだけ接続できます。GPTのログイン情報はアプリではなくログイン用ツールが管理します。
  - q7: 社員が勝手にパソコンの画面を操作しませんか? — いいえ。装備を支給された社員だけが画面を見られ、クリックや入力は承認箱で承認したときだけ行われます。
  - q8: スマホアプリだけで使えますか? — いいえ。PCで起動中のAI Officeを遠隔操作するアプリなので、PCアプリを起動しておく必要があります。外出先からも接続できます。
  - q9: どの言語で使えますか? — (既存どおり)
- **zh**
  - q1: 需要注册或 API 密钥吗? — 不需要。直接使用电脑上已登录的 Claude 或 GPT(ChatGPT)账号。员工用该账号工作,用量也计入该账号。
  - q2: 必须同时有 Claude 和 GPT 吗? — 不必。登录其中一个就能开始,另一个可以以后在设置里连接。两个都有时,可以为每位员工选择用哪一个。GPT 员工目前为测试版。
  - q3: 完全不懂开发也能用吗? — 可以。雇人、在聊天里交代任务、在审批箱批准或驳回即可,不需要输入命令。
  - q4: 安装时出现警告。 — (保持现有)
  - q5: 员工会擅自修改文件吗? — 影响较大的操作会先进入审批箱,批准后才会进行。员工改动的文件可以用“恢复到任务之前”一次还原。无法撤销的危险命令始终会被拦截。
  - q6: 我的数据存放在哪里? — 员工、任务和聊天记录都存放在你的电脑里。手机连接默认关闭,开启后才可连接。GPT 登录信息不由应用保管,而由登录工具管理。
  - q7: 员工会随意操作我的屏幕吗? — 不会。只有配发了装备的员工才能看到屏幕,点击和输入必须经你在审批箱批准。
  - q8: 可以只用手机应用吗? — 不可以。手机应用是远程使用电脑上运行的 AI Office,所以电脑端必须保持开启。在外面也能连接。
  - q9: 支持哪些语言? — (保持现有)
- q4·q9 원문(기존 ko/en/ja/zh)은 `site/index.html`에서 그대로 가져온다.

### 2-9. 마지막 권유 (final)

| 키 | ko | en | ja | zh |
|---|---|---|---|---|
| end.title | 오늘 첫 직원을 뽑아 보세요 | Hire your first employee today | 今日、最初の社員を雇いましょう | 今天就雇用第一位员工吧 |
| end.sub | 무료이고, 설치하고 몇 분이면 Claude든 GPT든 첫 업무를 맡길 수 있어요. | It's free, and a few minutes after installing you can hand a first task to Claude or GPT. | 無料で、インストールして数分でClaudeにもGPTにも最初の仕事を任せられます。 | 免费使用,安装后几分钟就能把第一项任务交给 Claude 或 GPT。 |
| end.btn | 무료로 받기 | Get it free | 無料で入手 | 免费获取 |

## 3. 스크린샷 목록 (실데이터 복사본 개발 앱에서 촬영, 개인 정보 가리기)

각 언어 폴더(`assets/screens/{ko,en,ja,zh}/`)에 같은 파일 이름으로 둔다. 데스크톱 1360×860, 휴대폰 390×844.

| 파일 | 어디에 | 상태 | 담을 장면 |
|---|---|---|---|
| `office.png` | 히어로 | 교체 | 사무실에 Claude·GPT 직원이 함께 앉은 전경 |
| `staff-mix.png` | f1 | **새로** | 직원 목록/고용 창: Claude·GPT 직원, '베타' 라벨, 모델 추천 |
| `chat.png` | f2 | 재촬영 | 단체방 @이름 지시와 GPT 직원 답변 |
| `inbox.png` | f3 | 재촬영 | 결재 카드(명령 실행·질문)와 '작업 전으로 되돌리기' |
| `board.png` | f4 | 재촬영 | 팀장 계획과 카드별 비용 |
| `meeting.png` | f5 | 재촬영 | 회의실 발언 장면 |
| `computer.png` | f6 | **새로** | 컴퓨터 조작 클릭 승인 카드 + 화면 캡처 |
| `secretary.png` | f7 | **새로** | 비서 대화로 보드 정리·비교 카드 |
| `dashboard.png` | f8 | 재촬영 | 직원별 사용량 + Claude·GPT 사용량 카드, 터미널 세션 '일하는 중' |
| `exterior.png` | 꾸미기 1 | 재촬영 | 높은 레벨 건물 외관 |
| `decorate.png` | 꾸미기 2 | **새로** | 레벨 11~20 가구, 책상 세트, 칸막이 |
| `demoday.png` | 꾸미기 3 | **새로** | 데모데이 무대·뒷벽 스크린 |
| `phone-dashboard.png` `phone-inbox.png` `phone-chat.png` | 휴대폰 | 재촬영 | 같은 화면, GPT 직원 포함 |
| `og.png` | 링크 미리보기 | 교체 | 제목에 새 메시지 반영(텍스트가 들어 있다면) |

- 새 파일 6개(`staff-mix`·`computer`·`secretary`·`decorate`·`demoday` + 필요시 언어별 변형)와 재촬영 10개 내외. 언어별 4세트이므로 촬영은 한 번에 몰아서 한다.
- 개인 정보: 이메일, 실제 작업 폴더 경로, 고객·회사 이름, 결재 내용 속 비밀은 가리거나 샘플 데이터로 바꾼다.

## 4. 구현 시 메모 (정리드용)

- `T.*`에 새 키가 필요한 곳: `f1~f8`(기존 f6·f8·f9 번호 재배치), `grow.*`, `ph.note`, `q2·q5~q8` 교체, `dl.sub`·`mac.4`.
- 휴대폰 섹션 id는 그대로 `#screens`, 꾸미기는 `#grow`를 새로 둔다. 내비도 같이 고친다.
- `softwareVersion`과 `data-version` 기본값 0.12.0 → 0.14.0, `description`도 'Claude와 GPT 직원' 표현으로(JSON-LD).
- 텍스트가 길어진 4개 언어(특히 ja)가 모바일 폭에서 줄바꿈으로 깨지지 않는지 확인.

---

## 5. 마케팅용 캡처 활용안 (추가)

### 5-1. 왜 흐릿했나 — 원인과 촬영 기준

| 확인한 것 | 내용 |
|---|---|
| 현재 PC 캡처 | 1360×860 PNG(1배). 히어로에서는 최대 1100px 폭으로 보여 줌 |
| 현재 휴대폰 캡처 | 390×844(1배). 화면에서는 약 290px로 보여 줌 |
| 원인 | 맥 레티나·폰은 화면 1px을 실제 점 2개로 그린다. 1배 그림은 2배로 늘어나 번진다 |

**새 기준**
- **PC:** 앱 창을 1360×860으로 맞추고 **2배(2720×1720)** 로 촬영. 사이트에는 2배 파일을 그대로 쓰고 `width/height`는 1360×860 유지. 용량이 크면 WebP(품질 85)로 변환하고 PNG는 원본 보관.
- **휴대폰:** 390×844 **3배(1170×2532)** 로 촬영(실기기 해상도와 같음).
- **서로 같은 구도·같은 데이터**: 4개 언어가 같은 장면이어야 하므로 데모 데이터(`demo-seed`)로 언어만 바꿔 찍는다. 개인 정보가 들어갈 여지도 없다.
- **글자가 읽혀야 한다**: 캡처 한 장에 보여 줄 것은 **한 가지**. 창 전체를 담되, 핵심 영역은 아래의 **확대 조각(크롭)** 을 따로 만들어 함께 쓴다.
- **번호 표시(콜아웃)는 이미지에 굽지 않고 HTML로 얹는다.** 그래야 4개 언어 문구를 같은 이미지 위에서 바꿀 수 있다. 이미지에 글자를 굽는 건 `og.png`만.
- 파일 용량 목표: 이미지당 300KB 이하(WebP). 첫 화면(히어로) 외에는 `loading="lazy"`.
- (선택, 마케팅 효과가 큼) 3장짜리 **짧은 움직이는 화면(WebM 5~8초)**: ① 단체방에서 지시 → 결재함에 카드 → 승인 ② 컴퓨터 조작 클릭 승인. 정지 캡처보다 "일이 흘러가는 느낌"이 잘 전해진다.

### 5-2. 기능별 캡처와 설명 (캡처 위 번호 ①②③ + 한 줄 설명)

각 줄은 **그 캡처에서 눈으로 짚어 줄 곳 3개**와 마케팅 한 문장이다. 번호 문구는 4개 언어다.

#### 히어로 — `office.png`
- **한 문장:** "여기가 우리 회사예요. Claude 직원과 GPT 직원이 같은 자리에서 일해요."
- ① 자리에서 일하는 직원 ② 직원 머리 위 상태 말풍선 ③ 층 이동·레벨 표시

| | ① | ② | ③ |
|---|---|---|---|
| ko | 직원이 자리에서 일해요 | 지금 무엇을 하는지 한눈에 | 회사가 커지면 층이 늘어요 |
| en | Staff work at their desks | See what each is doing at a glance | More floors as you grow |
| ja | 社員が席で働いています | 今何をしているかひと目で | 成長するとフロアが増えます |
| zh | 员工在座位上工作 | 谁在做什么一目了然 | 公司壮大,楼层增加 |

#### f1 — `staff-mix.png` (Claude + GPT)
- **한 문장:** "일에 맞는 직원을 골라 뽑으세요. 어느 쪽 두뇌인지도 직원마다 정할 수 있어요."
- ① 직원 카드의 Claude/GPT 표시 ② 추천 배지와 이유 한 줄 ③ GPT '베타' 라벨

| | ① | ② | ③ |
|---|---|---|---|
| ko | 직원마다 Claude 또는 GPT | 이 일엔 이 직원, 이유까지 | GPT 직원은 베타예요 |
| en | Claude or GPT, per employee | Best fit for the task, with a reason | GPT staff are in beta |
| ja | 社員ごとにClaudeかGPT | この仕事にはこの人、理由つき | GPT社員はベータ版です |
| zh | 每位员工可选 Claude 或 GPT | 推荐合适人选并说明理由 | GPT 员工为测试版 |

#### f2 — `chat.png`
- **한 문장:** "사람에게 말하듯 시키세요. 이름을 부르면 그 직원이, 아무도 안 부르면 맞는 직원이 받아요."
- ① 입력창의 @이름 ② 직원 답변과 진행 상태 ③ 입력창 아래 매뉴얼·명령 버튼

| | ① | ② | ③ |
|---|---|---|---|
| ko | @이름으로 바로 지시 | 진행 상황이 대화로 | 매뉴얼로 업무 방식을 불러와요 |
| en | Just @mention to assign | Progress shows up in chat | Pull in a manual for how to work |
| ja | @名前ですぐ指示 | 進み具合がチャットに | マニュアルで進め方を呼び出せます |
| zh | @姓名即可交代任务 | 进度直接显示在对话里 | 用手册调出工作方式 |

#### f3 — `inbox.png`
- **한 문장:** "AI가 마음대로 하지 않아요. 중요한 일은 항상 내 허락을 먼저 받아요."
- ① 어떤 일인지 적힌 결재 카드 ② 승인·반려 버튼 ③ ‘앞으로 항상 승인’과 ‘작업 전으로 되돌리기’

| | ① | ② | ③ |
|---|---|---|---|
| ko | 무엇을 하려는지 먼저 보여 줘요 | 눌러서 승인, 또는 반려 | 자주 하는 건 자동 승인, 마음에 안 들면 되돌리기 |
| en | See what they plan to do first | Approve or reject in one click | Auto-approve routine asks; undo if unhappy |
| ja | やろうとしていることを先に表示 | ワンクリックで承認・却下 | よくあるものは自動承認、気に入らなければ元に戻す |
| zh | 先告诉你准备做什么 | 一键批准或驳回 | 常规请求可自动批准,不满意可还原 |

#### f4 — `board.png`
- **한 문장:** "큰 일은 팀장에게 한 번에. 계획을 확인받고 순서대로 진행해요."
- ① '확인 대기' 계획 카드 ② 단계별 하위 업무와 담당자 ③ 카드별 사용 비용

| | ① | ② | ③ |
|---|---|---|---|
| ko | 계획을 먼저 확인받아요 | 단계마다 알맞은 직원에게 배정 | 일마다 쓴 비용이 보여요 |
| en | The plan comes to you first | Each step goes to the right person | Cost shown per task |
| ja | まず計画を確認します | 段階ごとに適した社員へ割り当て | 仕事ごとの費用が見えます |
| zh | 计划先交给你确认 | 每个步骤分配给合适的人 | 每项任务的费用清清楚楚 |

#### f5 — `meeting.png`
- **한 문장:** "회의를 열면 직원들이 돌아가며 말하고, 결정은 할 일 카드가 돼요."
- ① 발언 중인 직원 ② 오가는 의견 ③ 회의록과 ‘할 일로 만들기’

| | ① | ② | ③ |
|---|---|---|---|
| ko | 직원들이 돌아가며 발언 | 서로 다른 관점의 의견 | 결정은 곧바로 할 일 카드로 |
| en | Staff take turns speaking | Different viewpoints on the table | Decisions become to-do cards |
| ja | 社員が順番に発言 | 異なる視点の意見 | 決定はそのままやることカードに |
| zh | 员工轮流发言 | 不同角度的意见 | 决定直接变成待办卡片 |

#### f6 — `computer.png` (컴퓨터 조작)
- **한 문장:** "직원이 내 화면을 보고 직접 클릭해요. 단, 내가 승인해야만요."
- ① 직원이 본 화면 캡처 ② ‘이 위치를 클릭할게요’ 승인 카드 ③ 장비 탭의 컴퓨터·브라우저 장비

| | ① | ② | ③ |
|---|---|---|---|
| ko | 직원이 내 화면을 보고 판단해요 | 클릭·입력은 승인 뒤에만 | 장비를 지급한 직원만 쓸 수 있어요 |
| en | Staff look at your screen | Clicks and typing only after approval | Only staff given the kit can use it |
| ja | 社員が画面を見て判断 | クリック・入力は承認後のみ | 装備を支給された社員だけが使えます |
| zh | 员工查看屏幕后判断 | 点击和输入须先获批准 | 仅限配发装备的员工使用 |

#### f7 — `secretary.png`
- **한 문장:** "정리하고 싶은 건 비서에게 말만 하세요. 바꾸기 전에 비교해서 보여 줘요."
- ① 비서에게 건 말 ② 고치기 전·후 비교 카드 ③ 못 하는 일은 이유와 대신 갈 곳 링크

| | ① | ② | ③ |
|---|---|---|---|
| ko | 말로 부탁하면 돼요 | 바꾸기 전과 후를 나란히 | 못 하는 일도 방법을 알려 줘요 |
| en | Just ask in plain words | Before and after, side by side | If it can't, it tells you what to do |
| ja | 話しかけるだけでOK | 変更前と後を並べて確認 | できないときは方法を案内 |
| zh | 开口说就行 | 修改前后并排对比 | 做不到时会告诉你替代办法 |

#### f8 — `dashboard.png`
- **한 문장:** "누가 일하는지, 비용이 얼마인지, 한도가 얼마나 남았는지 한 화면에서."
- ① 직원 상태(작업 중·확인 필요) ② Claude·GPT 사용량 카드 ③ 터미널에서 돌아가는 작업

| | ① | ② | ③ |
|---|---|---|---|
| ko | 누가 일하고 누가 기다리는지 | Claude·GPT 한도를 각각 확인 | 터미널 작업도 함께 보여요 |
| en | Who's working, who's waiting | Claude and GPT limits, side by side | Terminal sessions show up too |
| ja | 誰が働き、誰が待っているか | ClaudeとGPTの上限をそれぞれ確認 | ターミナルの作業も表示 |
| zh | 谁在工作、谁在等待 | 分别查看 Claude 与 GPT 额度 | 终端里的任务也能看到 |

#### 꾸미기 — `decorate.png`, `demoday.png`
- `decorate.png`: ① 레벨 11~20 새 가구 ② 책상+의자 한 세트 돌리기 ③ 파티션으로 공간 나누기
  - ko: 새 가구가 레벨마다 열려요 / 책상 세트를 돌려 놓아요 / 칸막이로 팀 공간을 나눠요
  - en: New furniture unlocks each level / Rotate a desk set / Divide spaces with partitions
  - ja: レベルごとに新しい家具が解放 / 机セットを回転して配置 / パーテーションで空間を分ける
  - zh: 每升一级解锁新家具 / 旋转桌椅套装 / 用隔断划分空间
- `demoday.png`: ① 뒷벽 발표 스크린 ② 무대 위 직원 ③ ‘스크린 크게 보기’
  - ko: 끝낸 일을 스크린으로 발표해요 / 직원이 무대에 올라요 / 크게 눌러 자세히 봐요
  - en: Results shown on the big screen / Staff step on stage / Click to enlarge
  - ja: 完了した仕事をスクリーンで発表 / 社員がステージへ / クリックで拡大
  - zh: 用大屏展示完成的工作 / 员工登台 / 点击放大查看

#### 휴대폰 — `phone-*.png`
- 대시보드: ① 확인 필요 건수 ② 직원 상태 ③ GPT 직원도 함께
- 결재함: ① 승인할 카드 ② 한 번 눌러 승인 ③ 알림 배지
- 단체방: ① 말로 지시 ② 직원 보고 ③ 같은 대화가 PC와 이어짐
- 번호 문구는 위 표와 같은 방식으로 구현 담당이 `cap.*`에 맞춰 쓴다(필요하면 내가 이어서 4개 언어로 작성).

### 5-3. 페이지에서 캡처를 보여 주는 법 (디자인·구현 메모)
1. **히어로**: 큰 캡처 하나 + 아래에 한 줄 "Claude, GPT 직원이 한 사무실에서".
2. **기능 행**: 왼쪽 글, 오른쪽 캡처(좌우 번갈아). 캡처 위에 번호 점 ①②③를 HTML로 얹고, 캡처 아래 3줄 설명을 같은 번호로 나열. 번호는 4개 언어에서 위치가 같다.
3. **확대 보기**: 캡처를 누르면 큰 창으로 열려 글자까지 볼 수 있게 한다(2배 파일 사용).
4. **캡처 주변에 '결과 문장'**: 기능 이름이 아니라 "무엇이 편해지나"를 제목에 쓴다(위 '한 문장').
5. 마케팅 채널용(스토어·광고·SNS)으로는 같은 캡처를 **1200×630, 1080×1080** 두 비율로 따로 크롭해 `docs/marketing/`에 둔다(후속, 지금은 사이트 우선).

### 5-4. 촬영 순서(몰아서 한 번에)
1. 데모 데이터에 GPT 직원 2명·컴퓨터 장비·결재 카드·사용량 카드가 보이게 시드를 보강(`demo-seed.mts`) — 구현 담당 확인.
2. 한국어로 2배 촬영 → 장면 확정 → en/ja/zh는 앱 언어만 바꿔 같은 장면 반복.
3. 휴대폰은 `mobile-preview.html?demo=<언어>`를 3배로.
4. 저장 전 개인 정보 확인(이메일·경로·실제 이름).
