import type { Entry } from './index.ts'

/** 처음 쓰는 사람을 위한 다음 행동 안내 — 고용 창 접기, 빈 직원 패널 예시 지시, 빈 결재함, 안내 다시 보기 */
export default {
  // HireDialog.tsx — 처음에는 이름·직무만, 나머지는 '자세히'
  'guideHint.hire.more': { ko: '자세히 설정', en: 'More settings', ja: '詳細設定', zh: '更多设置' },
  'guideHint.hire.moreDesc': {
    ko: '팀·프로젝트·AI 엔진·성능 등급·결재 방식·업무 지침 — 안 바꿔도 기본값으로 바로 일할 수 있어요.',
    en: 'Team, projects, AI engine, performance level, approval mode, guidelines — the defaults work fine if you skip this.',
    ja: 'チーム・プロジェクト・AIエンジン・性能レベル・承認方式・業務指針 — 変えなくても既定値ですぐ働けます。',
    zh: '团队、项目、AI 引擎、性能等级、审批方式、工作准则 — 不改也能用默认设置直接开始工作。',
  },
  'guideHint.hire.less': { ko: '간단히 보기', en: 'Show less', ja: '簡単に表示', zh: '收起' },
  'guideHint.model.default': {
    ko: '알아서 골라요 (추천)',
    en: 'Picks for you (recommended)',
    ja: 'おまかせ（おすすめ）',
    zh: '自动选择（推荐）',
  },
  'guideHint.model.fable': {
    ko: '가장 어려운 일 · 가장 느림',
    en: 'Hardest tasks · slowest',
    ja: '最も難しい仕事向け · 最も遅い',
    zh: '最难的工作 · 最慢',
  },
  'guideHint.model.opus': {
    ko: '아주 똑똑해요 · 느리고 사용량이 많아요',
    en: 'Very smart · slower and uses more',
    ja: 'とても賢い · 遅めで使用量が多め',
    zh: '非常聪明 · 较慢，用量较多',
  },
  'guideHint.model.sonnet': {
    ko: '똑똑함과 빠르기의 균형',
    en: 'Balance of smarts and speed',
    ja: '賢さと速さのバランス',
    zh: '聪明与速度的平衡',
  },
  'guideHint.model.haiku': {
    ko: '가장 빨라요 · 간단한 일에 알맞아요',
    en: 'Fastest · good for simple tasks',
    ja: '最も速い · 簡単な仕事向き',
    zh: '最快 · 适合简单任务',
  },

  // StaffPanel.tsx — 고용 직후 빈 패널
  'guideHint.panel.emptyTitle': {
    ko: '아직 기록이 없어요. 아래 칸에 맡길 일을 적어 보내 보세요.',
    en: 'No records yet. Type a task in the box below and send it.',
    ja: 'まだ記録がありません。下の欄に任せたい仕事を書いて送ってみましょう。',
    zh: '还没有记录。在下方输入框写下要交给 TA 的工作并发送吧。',
  },
  'guideHint.panel.examples': { ko: '예시를 누르면 칸에 채워져요', en: 'Tap an example to fill the box', ja: '例を押すと欄に入ります', zh: '点击示例即可填入输入框' },
  'guideHint.panel.ex1': {
    ko: '작업 폴더에 어떤 파일이 있는지 정리해 줘',
    en: 'Summarize what files are in the work folder',
    ja: '作業フォルダにどんなファイルがあるかまとめて',
    zh: '整理一下工作文件夹里有哪些文件',
  },
  'guideHint.panel.ex2': {
    ko: '자기소개와 함께 네가 도울 수 있는 일을 알려 줘',
    en: 'Introduce yourself and tell me what you can help with',
    ja: '自己紹介と、手伝えることを教えて',
    zh: '做个自我介绍，并告诉我你能帮忙做什么',
  },
  'guideHint.panel.ex3': {
    ko: '이번 주 할 일 목록을 표로 만들어 줘',
    en: "Make a table of this week's to-dos",
    ja: '今週のやることリストを表にして',
    zh: '把本周待办事项做成表格',
  },

  // InboxPage.tsx — 빈 결재함
  'guideHint.inbox.emptyDesc': {
    ko: '직원이 파일을 고치거나 프로그램을 실행하기 전, 또는 고르기 질문을 할 때 여기에 결재가 올라와요.',
    en: 'Approvals show up here before staff edit files or run programs, or when they ask you to choose.',
    ja: 'スタッフがファイルを編集したりプログラムを実行する前、または選択の質問をするときに、ここに承認が届きます。',
    zh: '员工修改文件或运行程序之前，或请你做选择时，审批会出现在这里。',
  },
  'guideHint.inbox.noStaff': {
    ko: '아직 직원이 없어요. 직원을 추가해 일을 맡기면 결재가 생겨요.',
    en: 'No staff yet. Add someone and give them work to see approvals.',
    ja: 'まだスタッフがいません。スタッフを追加して仕事を任せると承認が届きます。',
    zh: '还没有员工。添加员工并分配工作后就会出现审批。',
  },

  // App.tsx · CoachTour.tsx — 안내를 다시 보는 곳
  'guideHint.replay': { ko: '안내 다시 보기', en: 'Replay guide', ja: '案内をもう一度', zh: '重新查看指南' },
  'guideHint.replayToast': {
    ko: '안내는 설정 › 안내에서 언제든 다시 볼 수 있어요.',
    en: 'You can replay the guides anytime in Settings › Guides.',
    ja: '案内は 設定 › ご案内 からいつでも見直せます。',
    zh: '随时可以在 设置 › 指南 中重新查看。',
  },
  'guideHint.empty.hint': {
    ko: '아직 직원이 없어요. 직원을 추가하거나 마켓에서 데려와 일을 맡겨 보세요.',
    en: 'No staff yet. Add someone or bring one from the market and give them work.',
    ja: 'まだスタッフがいません。追加するかマーケットから連れてきて仕事を任せましょう。',
    zh: '还没有员工。添加一位或从市场带来一位，然后分配工作吧。',
  },
  'firstHint.badge': { ko: '처음 한 번만 보여요', en: 'Shown only once', ja: '初回のみ表示', zh: '仅首次显示' },
  'firstHint.ok': { ko: '알겠어요', en: 'Got it', ja: 'わかりました', zh: '知道了' },
  'firstHint.allOff': { ko: '힌트 모두 끄기', en: 'Turn off all tips', ja: 'ヒントをすべてオフ', zh: '关闭所有提示' },
  'firstHint.hire': {
    ko: '직무만 고르면 돼요. 작업 폴더는 이 직원이 볼 폴더예요. 정하지 않으면 지시할 때 말한 프로젝트 폴더에서 일해요.',
    en: "Just pick a role. The work folder is the folder this staff member works in. Leave it empty and they'll work in whichever project folder you mention.",
    ja: '職務を選ぶだけでOKです。作業フォルダはこのスタッフが見るフォルダです。決めなければ、指示で伝えたプロジェクトフォルダで働きます。',
    zh: '选好职务就行。工作文件夹是这位员工要看的文件夹。不设置的话，会在你下达指令时提到的项目文件夹里工作。',
  },
  'firstHint.board': {
    ko: '긴 일이나 여러 사람이 나눌 일은 카드로 올려요. 담당자를 고르고 시작을 누르면 일이 시작돼요.',
    en: 'Post bigger or shared work as a card. Pick an owner and press Start to begin.',
    ja: '長い仕事や複数人で分ける仕事はカードで出します。担当者を選んで「開始」を押すと始まります。',
    zh: '较大的或需要多人分工的工作，就发成卡片。选好负责人并点“开始”即可开工。',
  },
  'firstHint.meeting.remote': {
    ko: '여러 직원의 생각이 필요하면 회의를 열어요. 주제와 참석자를 고르면 돼요.',
    en: "Hold a meeting when you need several staff members' views. Just pick a topic and who joins.",
    ja: '複数のスタッフの考えが必要なら会議を開きます。議題と参加者を選ぶだけです。',
    zh: '需要听取多位员工的想法时就开会。选好议题和参会人即可。',
  },
  'firstHint.meeting': {
    ko: '여러 직원의 생각이 필요하면 회의를 열어요. 처음이면 ? › 회의 열기(AI 사용량 없음)로 1분 만에 연습해 볼 수 있어요.',
    en: "Hold a meeting when you need several staff members' views. First time? Practice with ? › Hold a meeting (no AI quota) in about a minute.",
    ja: '複数のスタッフの考えが必要なら会議を開きます。初めてなら ? › 会議を開く（AI使用量なし）で1分ほどで練習できます。',
    zh: '需要听取多位员工的想法时就开会。第一次的话，可以通过 ? › 召开会议（不消耗 AI 用量）用 1 分钟练习一下。',
  },
  'firstHint.chat': { ko: '@이름으로 부르면 그 직원이 일을 받아요.', en: 'Mention @name to hand that person the task.', ja: '@名前で呼ぶと、そのスタッフが仕事を受けます。', zh: '用 @名字 呼叫，那位员工就会接下工作。' },
  'firstHint.inbox': {
    ko: '직원이 확인이 필요한 일은 여기로 와요. 읽고 승인하면 일이 이어져요.',
    en: 'Anything your staff need you to confirm lands here. Read it and approve to keep the work going.',
    ja: 'スタッフが確認を必要とする仕事はここに届きます。読んで承認すると仕事が続きます。',
    zh: '需要你确认的事情都会来到这里。看完点批准，工作就会继续。',
  },
  'helpMenu.open': { ko: '도움말', en: 'Help', ja: 'ヘルプ', zh: '帮助' },
  'helpMenu.close': { ko: '닫기', en: 'Close', ja: '閉じる', zh: '关闭' },
  'helpMenu.here': { ko: '지금 화면 · {view}', en: 'This screen · {view}', ja: 'この画面 · {view}', zh: '当前界面 · {view}' },
  'helpMenu.practice': { ko: '연습해 보기 (AI 사용량 없음)', en: 'Practice (no AI quota)', ja: '練習する（AI使用量なし）', zh: '练习一下（不消耗 AI 用量）' },
  'helpMenu.practicePcOnly': {
    ko: '업무 맡기기·회의 열기 연습은 PC 화면에서만 진행돼서 원격 화면에서는 못 해요. PC 앱에서 해 주세요.',
    en: 'Task and meeting practice only runs on the PC screen, so it is not available on a remote screen. Please do it in the PC app.',
    ja: '仕事を任せる・会議を開くの練習は PC の画面でのみ進むため、リモート画面では行えません。PC アプリで行ってください。',
    zh: '分派任务、召开会议的练习只能在电脑屏幕上进行，远程画面无法使用。请在电脑应用中进行。',
  },
  'helpMenu.min': { ko: '약 {n}분', en: 'about {n} min', ja: '約{n}分', zh: '约 {n} 分钟' },
  'helpMenu.more': { ko: '더 알아보기', en: 'Learn more', ja: 'もっと知る', zh: '了解更多' },
  'helpMenu.tour': { ko: '나머지 화면 둘러보기 · {n}곳', en: 'Tour the other screens · {n}', ja: 'ほかの画面を見て回る · {n}か所', zh: '浏览其他界面 · {n} 处' },
  'helpMenu.hintsReset': { ko: '처음 힌트 다시 보기', en: 'Show first-time tips again', ja: '初回ヒントをもう一度表示', zh: '重新显示首次提示' },
  'helpMenu.hintsResetToast': {
    ko: '화면을 처음 열 때처럼 힌트가 다시 나와요.',
    en: "Tips will show again as if you're opening each screen for the first time.",
    ja: '各画面を初めて開いたときのように、ヒントがまた表示されます。',
    zh: '打开各界面时会像第一次一样再次显示提示。',
  },
} satisfies Record<string, Entry>
