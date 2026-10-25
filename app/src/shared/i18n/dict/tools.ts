import type { Entry } from './index.ts'

/** 브라우저 장비·/명령어 (main이 쓰는 문구 — 화면 자동완성 문구는 다른 접두어로) */
export default {
  'equip.browser.name': { ko: '브라우저', en: 'Browser', ja: 'ブラウザ', zh: '浏览器' },
  'equip.browser.desc': {
    ko: '직원 전용 크롬 창으로 사이트를 열고 클릭·입력해요. 이동·클릭·입력은 결재를 받아요.',
    en: 'Opens sites in a Chrome window just for this staff member and clicks or types. Navigating, clicking and typing need your approval.',
    ja: 'スタッフ専用の Chrome ウィンドウでサイトを開き、クリックや入力をします。移動・クリック・入力は決裁が必要です。',
    zh: '用员工专用的 Chrome 窗口打开网站并点击、输入。跳转、点击、输入需要审批。',
  },
  'equip.browser.source': { ko: '앱 기본 장비', en: 'Built into the app', ja: 'アプリ標準の装備', zh: '应用内置装备' },
  'equip.browser.needNode': {
    ko: '이 컴퓨터에 Node.js가 없어 쓸 수 없어요. nodejs.org에서 설치한 뒤 다시 열어 주세요.',
    en: "Node.js isn't installed on this computer. Install it from nodejs.org, then open this again.",
    ja: 'このコンピューターに Node.js がないため使えません。nodejs.org からインストールしてから開き直してください。',
    zh: '这台电脑没有安装 Node.js，无法使用。请从 nodejs.org 安装后重新打开。',
  },
  'staff.browser.guide': {
    ko: '브라우저 도구(mcp__office-browser__*)로 너만 쓰는 크롬 창을 다룰 수 있다. 페이지 이동·클릭·입력은 대표 결재를 거친다. 스크린샷은 {dir} 폴더에 저장되니, 보고에 화면을 붙일 때는 그 파일 경로로 report_image를 쓴다.',
    en: 'You can drive your own Chrome window with the browser tools (mcp__office-browser__*). Navigating, clicking and typing go through the boss for approval. Screenshots are saved in {dir}; to attach one to a report, call report_image with that file path.',
    ja: 'ブラウザツール(mcp__office-browser__*)で自分専用の Chrome ウィンドウを操作できる。ページ移動・クリック・入力は代表の決裁を経る。スクリーンショットは {dir} に保存されるので、報告に画面を付けるときはそのファイルパスで report_image を使う。',
    zh: '可以用浏览器工具(mcp__office-browser__*)操作你专用的 Chrome 窗口。页面跳转、点击、输入需经负责人审批。截图保存在 {dir}，要在报告里附上画面时，用该文件路径调用 report_image。',
  },
  'slash.ran': { ko: '/{name} 명령을 실행했어요.', en: 'Ran /{name}.', ja: '/{name} を実行しました。', zh: '已执行 /{name}。' },
  'slash.cleared': {
    ko: '대화를 새로 시작해요. 다음 지시부터 새 대화로 받아요(지금 하던 일이 있으면 끝난 뒤에).',
    en: 'Starting a fresh conversation. The next instruction begins a new chat (after the current work, if any).',
    ja: '会話を新しく始めます。次の指示から新しい会話になります(作業中ならその後に)。',
    zh: '将开始新的对话。下一条指示起使用新对话(如有进行中的工作，会在完成后)。',
  },
  'slash.blocked': {
    ko: '/{name} 명령은 앱에서 쓸 수 없어요. 로그인·설정·모델·장비는 앱 화면에서 바꿔 주세요.',
    en: "/{name} isn't available in the app. Change login, settings, model and equipment in the app instead.",
    ja: '/{name} はアプリでは使えません。ログイン・設定・モデル・装備はアプリの画面で変更してください。',
    zh: '应用中无法使用 /{name}。请在应用界面中更改登录、设置、模型和装备。',
  },
  'slash.loadFailed': {
    ko: '명령 목록을 불러오지 못했어요 ({error})',
    en: "Couldn't load the command list ({error})",
    ja: 'コマンド一覧を読み込めませんでした ({error})',
    zh: '无法加载命令列表 ({error})',
  },
  // 앱에서 쓰는 기본 명령(APP_BUILTINS) 설명 — 번역 호출 없이 사전으로 보여 준다
  'slash.desc.compact': {
    ko: '지금까지 대화를 요약해 짧게 줄여요 (뒤에 요약 방법을 적을 수 있어요)',
    en: 'Summarize the conversation so far to make it shorter (you can add how to summarize)',
    ja: 'これまでの会話を要約して短くします (後ろに要約の仕方を書けます)',
    zh: '总结目前的对话以缩短篇幅 (可在后面写明总结方式)',
  },
  'slash.desc.clear': { ko: '대화를 지우고 새로 시작해요', en: 'Clear the conversation and start fresh', ja: '会話を消して新しく始めます', zh: '清空对话并重新开始' },
  'slash.desc.init': {
    ko: '프로젝트를 살펴보고 CLAUDE.md 안내 파일을 만들어요',
    en: 'Look through the project and create a CLAUDE.md guide file',
    ja: 'プロジェクトを調べて CLAUDE.md の案内ファイルを作ります',
    zh: '查看项目并创建 CLAUDE.md 说明文件',
  },
  'slash.desc.review': { ko: 'PR(코드 변경 요청)을 검토해요', en: 'Review a pull request', ja: 'プルリクエストをレビューします', zh: '审查拉取请求 (PR)' },
  'slash.desc.security-review': {
    ko: '지금 브랜치의 변경에 보안 문제가 없는지 살펴봐요',
    en: 'Check the changes on the current branch for security problems',
    ja: '今のブランチの変更にセキュリティの問題がないか確認します',
    zh: '检查当前分支的改动是否有安全问题',
  },
  'slash.desc.pr-comments': {
    ko: 'GitHub PR에 달린 댓글을 가져와요',
    en: 'Fetch the comments on a GitHub pull request',
    ja: 'GitHub のプルリクエストに付いたコメントを取得します',
    zh: '获取 GitHub 拉取请求上的评论',
  },
  'slash.desc.context': {
    ko: '지금 대화가 기억 공간(컨텍스트)을 얼마나 쓰는지 보여 줘요',
    en: 'Show how much of the memory space (context) the conversation is using',
    ja: '今の会話が記憶領域 (コンテキスト) をどれだけ使っているか表示します',
    zh: '显示当前对话占用了多少记忆空间 (上下文)',
  },
} satisfies Record<string, Entry>
