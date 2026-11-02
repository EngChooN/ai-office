import type { Entry } from './index.ts'

/** 처음 쓰는 사람을 위한 다음 행동 안내 — 고용 창 접기, 빈 직원 패널 예시 지시, 빈 결재함, 안내 다시 보기 */
export default {
  // HireDialog.tsx — 처음에는 이름·직무만, 나머지는 '자세히'
  'guideHint.hire.more': { ko: '자세히 설정', en: 'More settings', ja: '詳細設定', zh: '更多设置' },
  'guideHint.hire.moreDesc': {
    ko: '생김새·팀·작업 폴더·AI 엔진·성능 등급·결재 방식·업무 지침 — 안 바꿔도 기본값으로 바로 일할 수 있어요.',
    en: 'Appearance, team, work folder, AI engine, performance level, approval mode, guidelines — the defaults work fine if you skip this.',
    ja: '見た目・チーム・作業フォルダ・AIエンジン・性能レベル・承認方式・業務指針 — 変えなくても既定値ですぐ働けます。',
    zh: '外观、团队、工作文件夹、AI 引擎、性能等级、审批方式、工作准则 — 不改也能用默认设置直接开始工作。',
  },
  'guideHint.hire.less': { ko: '간단히 보기', en: 'Show less', ja: '簡単に表示', zh: '收起' },
  'guideHint.model.default': {
    ko: '알아서 골라요 (추천)',
    en: 'Picks for you (recommended)',
    ja: 'おまかせ（おすすめ）',
    zh: '自动选择（推荐）',
  },
  'guideHint.model.opus': {
    ko: '가장 똑똑해요 · 느리고 사용량이 많아요',
    en: 'Smartest · slower and uses more',
    ja: '最も賢い · 遅めで使用量が多め',
    zh: '最聪明 · 较慢，用量较多',
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
    ko: '아직 직원이 없어요. 직원을 고용해 일을 맡기면 결재가 생겨요.',
    en: 'No staff yet. Hire someone and give them work to see approvals.',
    ja: 'まだスタッフがいません。スタッフを雇って仕事を任せると承認が届きます。',
    zh: '还没有员工。雇用员工并分配工作后就会出现审批。',
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
    ko: '아직 직원이 없어요. 직원을 고용하거나 마켓에서 데려와 일을 맡겨 보세요.',
    en: 'No staff yet. Hire someone or bring one from the market and give them work.',
    ja: 'まだスタッフがいません。雇用するかマーケットから連れてきて仕事を任せましょう。',
    zh: '还没有员工。雇用一位或从市场带来一位，然后分配工作吧。',
  },
} satisfies Record<string, Entry>
