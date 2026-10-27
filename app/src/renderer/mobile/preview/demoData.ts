// 소개 사이트 스크린샷용 가상 회사 (site/assets/screens/README.md) — 실제 직원·세션 이름이 캡처에 나오지 않게 한다
// 휴대폰: 미리보기 주소에 demo=ko|en|ja|zh · PC: scripts/demo-seed.mts 가 같은 데이터를 빈 데이터 폴더의 office.db에 넣는다
// 타입만 가져온다 (node로 바로 읽을 수 있게)
import type { Lang } from '../../../shared/i18n/index.ts'

type Text = Record<Lang, string>
/** 언어와 상관없는 글 (명령·좌표) */
const same = (s: string): Text => ({ ko: s, en: s, ja: s, zh: s })

/** 직원: id · 이름 · 직무 · 아바타 · 팀 · 공급자(없으면 Claude, codex = GPT 베타) */
export const DEMO_STAFF: { id: string; name: Text; role: Text; avatar: number; teamId: string; provider?: 'codex' }[] = [
  { id: 'd1', avatar: 1, teamId: 'dt1', name: { ko: '강리더', en: 'Leo Lead', ja: '森リード', zh: '林领航' }, role: { ko: '팀장', en: 'Team Lead', ja: 'チームリーダー', zh: '团队负责人' } },
  { id: 'd2', avatar: 5, teamId: 'dt2', name: { ko: '오플랜', en: 'Paula Plan', ja: '小野プラン', zh: '周策划' }, role: { ko: '기획자 (PM)', en: 'Product Manager', ja: 'プロダクトマネージャー', zh: '产品经理' } },
  { id: 'd3', avatar: 6, teamId: 'dt2', name: { ko: '민마케', en: 'Max Market', ja: '宮マーケ', zh: '马推广' }, role: { ko: '마케터', en: 'Marketer', ja: 'マーケター', zh: '市场营销' } },
  { id: 'd4', avatar: 3, teamId: 'dt2', name: { ko: '채컬러', en: 'Coco Color', ja: '彩カラー', zh: '苏配色' }, role: { ko: '디자이너', en: 'Designer', ja: 'デザイナー', zh: '设计师' } },
  { id: 'd5', avatar: 2, teamId: 'dt1', name: { ko: '도코드', en: 'Finn Front', ja: '藤コード', zh: '程前端' }, role: { ko: '프론트엔드 개발자', en: 'Frontend Developer', ja: 'フロントエンド開発', zh: '前端开发' } },
  { id: 'd6', avatar: 10, teamId: 'dt1', name: { ko: '백서버', en: 'Ben Backend', ja: '黒サーバー', zh: '韩后端' }, role: { ko: '백엔드 개발자', en: 'Backend Developer', ja: 'バックエンド開発', zh: '后端开发' } },
  { id: 'd7', avatar: 9, teamId: 'dt2', name: { ko: '류데이터', en: 'Dana Data', ja: '数田データ', zh: '赵数据' }, role: { ko: '데이터 분석가', en: 'Data Analyst', ja: 'データアナリスト', zh: '数据分析师' } },
  { id: 'd8', avatar: 7, teamId: 'dt1', name: { ko: '표테스트', en: 'Quinn QA', ja: '品川テスト', zh: '秦测试' }, role: { ko: 'QA', en: 'QA Engineer', ja: 'QA', zh: 'QA 测试' } },
  { id: 'd9', avatar: 4, teamId: 'dt2', provider: 'codex', name: { ko: '유리서치', en: 'Rita Research', ja: '岡リサーチ', zh: '叶调研' }, role: { ko: '리서처', en: 'Researcher', ja: 'リサーチャー', zh: '研究员' } },
  { id: 'd10', avatar: 8, teamId: 'dt1', provider: 'codex', name: { ko: '서문서', en: 'Theo Docs', ja: '文野ドキュ', zh: '宋文档' }, role: { ko: '테크니컬 라이터', en: 'Technical Writer', ja: 'テクニカルライター', zh: '技术文档' } },
]

/** 장비를 지급한 직원 (앱 기본 장비 이름: office-computer = 컴퓨터 조작, office-browser = 브라우저) */
export const DEMO_EQUIPMENT: Record<string, string[]> = { d8: ['office-computer', 'office-browser'] }

export const DEMO_TEAMS: { id: string; name: Text; color: string; leadId: string }[] = [
  { id: 'dt1', name: { ko: '개발팀', en: 'Engineering', ja: '開発チーム', zh: '开发组' }, color: '#4a7fe0', leadId: 'd1' },
  { id: 'dt2', name: { ko: '성장팀', en: 'Growth', ja: 'グロースチーム', zh: '增长组' }, color: '#e8925a', leadId: 'd2' },
]

export const DEMO_LAB = {
  id: 'dl1',
  color: '#58b07a',
  leadId: 'd1',
  cwd: '/Users/me/projects/habit-app',
  name: { ko: '습관 앱 출시 랩', en: 'Habit App Launch', ja: '習慣アプリ ローンチ', zh: '习惯 App 上线' } as Text,
  goal: { ko: '습관 기록 앱을 이번 달에 출시한다', en: 'Ship the habit tracker app this month', ja: '習慣記録アプリを今月リリースする', zh: '本月上线习惯记录 App' } as Text,
}

/** 업무 보드 카드 (ago = 몇 분 전) */
export const DEMO_TASKS: { id: string; status: 'todo' | 'doing' | 'review' | 'done'; assigneeId: string | null; teamId: string; ago: number; title: Text; result?: Text; plan?: { spec: Text; subtasks: { title: Text; assigneeId: string }[] } }[] = [
  {
    id: 'dk1', status: 'doing', assigneeId: 'd2', teamId: 'dt2', ago: 20,
    title: { ko: '출시 준비 기획', en: 'Launch plan', ja: 'リリース準備の企画', zh: '上线准备方案' },
    plan: {
      spec: { ko: '## 목표\n다음 주 금요일 출시', en: '## Goal\nShip next Friday', ja: '## 目標\n来週金曜にリリース', zh: '## 目标\n下周五上线' },
      subtasks: [
        { assigneeId: 'd4', title: { ko: '랜딩 페이지 시안', en: 'Landing page mockups', ja: 'LP デザイン案', zh: '落地页设计稿' } },
        { assigneeId: 'd3', title: { ko: '출시 공지 문구', en: 'Launch announcement copy', ja: 'リリース告知文', zh: '上线公告文案' } },
        { assigneeId: 'd8', title: { ko: '출시 전 QA', en: 'Pre-launch QA', ja: 'リリース前 QA', zh: '上线前测试' } },
      ],
    },
  },
  { id: 'dk2', status: 'doing', assigneeId: 'd4', teamId: 'dt2', ago: 12, title: { ko: '랜딩 페이지 시안 2안', en: 'Landing page — 2 options', ja: 'LP デザイン案 2 種', zh: '落地页两版设计' } },
  { id: 'dk3', status: 'doing', assigneeId: 'd3', teamId: 'dt2', ago: 30, title: { ko: '출시 공지 문구', en: 'Launch announcement copy', ja: 'リリース告知文', zh: '上线公告文案' } },
  { id: 'dk4', status: 'review', assigneeId: 'd6', teamId: 'dt1', ago: 15, title: { ko: '결제 API 연동', en: 'Payment API integration', ja: '決済 API 連携', zh: '支付 API 对接' }, result: { ko: 'PR 올림', en: 'PR opened', ja: 'PR 作成済み', zh: '已提交 PR' } },
  { id: 'dk5', status: 'todo', assigneeId: 'd5', teamId: 'dt1', ago: 60, title: { ko: '회원가입 화면 개선', en: 'Improve sign-up screen', ja: '会員登録画面の改善', zh: '优化注册页面' } },
  { id: 'dk6', status: 'todo', assigneeId: 'd8', teamId: 'dt1', ago: 60, title: { ko: '출시 전 QA', en: 'Pre-launch QA', ja: 'リリース前 QA', zh: '上线前测试' } },
  { id: 'dk7', status: 'done', assigneeId: 'd7', teamId: 'dt2', ago: 8, title: { ko: '지난달 가입 전환율 분석', en: 'Last month sign-up conversion', ja: '先月の登録転換率分析', zh: '上月注册转化率分析' }, result: { ko: '전환율 4.2%', en: 'Conversion 4.2%', ja: '転換率 4.2%', zh: '转化率 4.2%' } },
  { id: 'dk8', status: 'review', assigneeId: 'd9', teamId: 'dt2', ago: 22, title: { ko: '경쟁 습관 앱 요금제 비교', en: 'Competitor habit app pricing', ja: '競合習慣アプリの料金比較', zh: '竞品习惯 App 价格对比' }, result: { ko: '비교표 정리', en: 'Comparison table ready', ja: '比較表を作成', zh: '对比表已整理' } },
  { id: 'dk9', status: 'doing', assigneeId: 'd10', teamId: 'dt1', ago: 10, title: { ko: '결제 API 사용 설명서', en: 'Payment API guide', ja: '決済 API の利用ガイド', zh: '支付 API 使用说明' } },
]

/** 회의: 대표 결정을 기다리는 질문 하나 */
export const DEMO_MEETING = {
  id: 'dm1',
  participantIds: ['d1', 'd2', 'd3', 'd4'],
  topic: { ko: '출시 일정 회의', en: 'Launch schedule meeting', ja: 'リリース日程会議', zh: '上线排期会议' } as Text,
  /** 발언 (ago = 몇 분 전) */
  lines: [
    { from: 'd1', ago: 21, text: { ko: '개발은 결제 연동만 남았어요. 수요일까지 마무리할 수 있습니다.', en: 'Only the payment integration is left on our side. We can wrap it up by Wednesday.', ja: '開発は決済連携だけ残っています。水曜までに仕上げられます。', zh: '开发这边只剩支付对接，周三前可以完成。' } as Text },
    { from: 'd4', ago: 19, text: { ko: '랜딩 시안은 두 가지로 준비했어요. 내일 오전에 확정본 드릴게요.', en: 'I prepared two landing mockups. You’ll get the final one tomorrow morning.', ja: 'LP 案は 2 種類用意しました。明日の午前に確定版をお渡しします。', zh: '落地页准备了两版，明天上午给出定稿。' } as Text },
    { from: 'd3', ago: 17, text: { ko: '출시 공지는 블로그와 SNS에 같은 날 올릴게요.', en: 'I’ll post the launch announcement on the blog and social on the same day.', ja: 'リリース告知はブログと SNS に同じ日に出します。', zh: '上线公告会在同一天发到博客和社交媒体。' } as Text },
    { from: 'd2', ago: 15, text: { ko: '출시일은 다음 주 금요일로 정리할게요.', en: "Let's lock the launch for next Friday.", ja: 'リリース日は来週金曜でまとめます。', zh: '上线日定在下周五。' } as Text },
  ],
  decision: {
    askedBy: 'd3',
    question: { ko: '출시 첫 주에 무료 체험 이벤트를 할까요?', en: 'Should we run a free-trial promo in launch week?', ja: 'リリース初週に無料体験キャンペーンをしますか？', zh: '上线第一周要做免费试用活动吗？' } as Text,
    options: { ko: ['한다', '안 한다'], en: ['Yes', 'No'], ja: ['する', 'しない'], zh: ['做', '不做'] } as Record<Lang, string[]>,
  },
}

/** 결재 id (PC 시드·휴대폰 미리보기 공통) — 단체방 메시지의 approvalOf와 DEMO_LIVE의 결재를 잇는다 */
export const demoApprovalId = (staffId: string) => `demo:${staffId}`

/** 단체방: 지시 → 보고 → 결재 요청 (from = 직원 id 또는 'me', approvalOf = 그 직원의 DEMO_LIVE 결재를 단 메시지) */
export const DEMO_CHAT: { from: string; ago: number; text: Text; approvalOf?: string }[] = [
  { from: 'me', ago: 70, text: { ko: '@강리더 결제 API 연동 이번 주 안에 끝내 주세요', en: '@Leo Lead please finish the payment API integration this week', ja: '@森リード 決済 API 連携を今週中に終わらせてください', zh: '@林领航 支付 API 对接请在本周内完成' } },
  { from: 'd1', ago: 66, text: { ko: '알겠어요. 연동은 백서버가 맡고, 끝나면 표테스트가 바로 QA할게요.', en: 'Got it. Ben takes the integration, and Quinn will QA it right after.', ja: '了解です。連携は黒サーバー、終わったらすぐ品川テストが QA します。', zh: '收到。对接由韩后端负责，完成后秦测试马上测试。' } },
  { from: 'me', ago: 52, text: { ko: '@성장팀 다음 주 출시 랜딩 페이지 준비해 주세요', en: '@Growth please get the launch landing page ready for next week', ja: '@グロースチーム 来週のリリース用 LP を準備してください', zh: '@增长组 请准备下周上线的落地页' } },
  { from: 'd2', ago: 48, text: { ko: '일정 잡았어요. 문구는 민마케, 시안은 채컬러가 맡아요.', en: 'Scheduled. Max takes the copy, Coco the mockups.', ja: '日程を組みました。文章は宮マーケ、デザインは彩カラーが担当します。', zh: '已排期。文案由马推广负责，设计稿由苏配色负责。' } },
  { from: 'me', ago: 40, text: { ko: '@유리서치 경쟁 습관 앱 3곳 요금제 비교해 줘', en: '@Rita Research compare pricing for 3 competing habit apps', ja: '@岡リサーチ 競合の習慣アプリ 3 つの料金を比べて', zh: '@叶调研 对比一下 3 款竞品习惯 App 的价格' } },
  { from: 'me', ago: 30, text: { ko: '@류데이터 지난달 가입 전환율 정리해 줘', en: '@Dana Data summarize last month’s sign-up conversion', ja: '@数田データ 先月の登録転換率をまとめて', zh: '@赵数据 整理一下上月注册转化率' } },
  { from: 'd9', ago: 22, text: { ko: '비교표 정리했어요. 세 곳 모두 월 구독이고, 무료 체험은 **7일**이 가장 많아요.', en: 'Comparison is ready. All three are monthly subscriptions, and a **7-day** free trial is the most common.', ja: '比較表をまとめました。3 つとも月額制で、無料体験は **7 日間** が最も多いです。', zh: '对比表整理好了。三款都是月订阅，免费试用以 **7 天** 最常见。' } },
  { from: 'me', ago: 14, text: { ko: '@표테스트 회원가입 화면을 직접 눌러 보며 확인해 줘', en: '@Quinn QA click through the sign-up screen yourself and check it', ja: '@品川テスト 会員登録画面を実際にクリックして確認して', zh: '@秦测试 请亲自点一遍注册页面检查一下' } },
  { from: 'd7', ago: 8, text: { ko: '정리했어요. 전환율 **4.2%**로 전월보다 0.6%p 올랐어요.', en: 'Done. Conversion was **4.2%**, up 0.6 pts from the month before.', ja: 'まとめました。転換率は **4.2%** で、前月より 0.6pt 上がりました。', zh: '整理好了。转化率 **4.2%**，比前月提升 0.6 个百分点。' } },
  { from: 'd4', ago: 5, approvalOf: 'd4', text: { ko: '랜딩 시안 2안 올렸어요. 결재함에서 하나 골라 주세요.', en: 'Two landing mockups are up. Please pick one in Approvals.', ja: 'LP デザイン案を 2 つ上げました。承認箱で選んでください。', zh: '落地页两版已上传，请在审批中选一版。' } },
  { from: 'd8', ago: 3, approvalOf: 'd8', text: { ko: '화면을 확인했어요. ‘가입하기’ 버튼을 클릭할게요. 승인 부탁드려요.', en: 'I checked the screen. I’ll click the “Sign up” button — please approve.', ja: '画面を確認しました。「登録する」ボタンをクリックします。承認をお願いします。', zh: '已查看屏幕。我要点击“注册”按钮，请批准。' } },
  { from: 'd6', ago: 2, approvalOf: 'd6', text: { ko: '결제 API 배포 전에 DB 마이그레이션 실행 승인 부탁드려요.', en: 'Need your approval to run the DB migration before the payment API deploy.', ja: '決済 API のデプロイ前に DB マイグレーションの実行承認をお願いします。', zh: '支付 API 发布前，请批准执行数据库迁移。' } },
]

/** PC 대시보드 '최근 활동' (ago = 몇 분 전 — 오늘 기록만 보이니 짧게) */
export const DEMO_FEED: { from: string; ago: number; type: 'result' | 'reply' | 'approval' | 'delegate' | 'commit'; text: Text }[] = [
  { from: 'd7', ago: 9, type: 'result', text: { ko: '지난달 가입 전환율 분석 완료 — 전환율 4.2%', en: 'Finished last month’s sign-up analysis — conversion 4.2%', ja: '先月の登録転換率分析が完了 — 転換率 4.2%', zh: '上月注册转化率分析完成 — 转化率 4.2%' } },
  { from: 'd1', ago: 8, type: 'delegate', text: { ko: '결제 API 연동을 백서버에게 맡겼어요', en: 'Handed the payment API integration to Ben Backend', ja: '決済 API 連携を黒サーバーに任せました', zh: '已把支付 API 对接交给韩后端' } },
  { from: 'd9', ago: 7, type: 'result', text: { ko: '경쟁 앱 요금제 비교 완료 — 무료 체험 7일이 가장 많음', en: 'Competitor pricing done — 7-day free trials are most common', ja: '競合アプリの料金比較が完了 — 無料体験は 7 日間が最多', zh: '竞品价格对比完成 — 免费试用以 7 天最常见' } },
  { from: 'd4', ago: 6, type: 'reply', text: { ko: '랜딩 시안 2안을 올렸어요', en: 'Uploaded two landing mockups', ja: 'LP デザイン案を 2 つ上げました', zh: '已上传两版落地页设计' } },
  { from: 'd6', ago: 4, type: 'approval', text: { ko: '결재 요청: npm run db:migrate', en: 'Approval request: npm run db:migrate', ja: '承認依頼: npm run db:migrate', zh: '审批请求：npm run db:migrate' } },
  { from: 'd5', ago: 3, type: 'commit', text: { ko: '회원가입 폼 검사 개선', en: 'Improve sign-up form validation', ja: '会員登録フォームの検証を改善', zh: '优化注册表单校验' } },
  { from: 'd8', ago: 3, type: 'approval', text: { ko: '결재 요청: 화면 클릭 (가입하기 버튼)', en: 'Approval request: click on screen (Sign up button)', ja: '承認依頼: 画面クリック（登録ボタン）', zh: '审批请求：点击屏幕（注册按钮）' } },
  { from: 'd8', ago: 2, type: 'result', text: { ko: '로그인 화면 테스트 12건 통과', en: '12 login screen tests passed', ja: 'ログイン画面のテスト 12 件に合格', zh: '登录页 12 项测试全部通过' } },
  { from: 'd10', ago: 1, type: 'commit', text: { ko: '결제 API 설명서 초안 추가', en: 'Add payment API guide draft', ja: '決済 API ガイドの草案を追加', zh: '新增支付 API 说明初稿' } },
]

/** 직원별 하루 토큰 (지난 7일치를 이 크기 근처로 넣는다) */
export const DEMO_TOKENS_PER_DAY: Record<string, number> = { d1: 420_000, d2: 260_000, d3: 180_000, d4: 310_000, d5: 520_000, d6: 470_000, d7: 150_000, d8: 230_000, d9: 340_000, d10: 210_000 }

/** 플랜 사용률 카드 (Claude · GPT) — 리셋까지 남은 분. 80% 아래로 둬서 보류·경고가 뜨지 않게 */
export const DEMO_PLAN_USAGE: Record<'claude' | 'codex', { type: string; percent: number; resetsInMin: number }[]> = {
  claude: [
    { type: 'five_hour', percent: 42, resetsInMin: 130 },
    { type: 'seven_day', percent: 63, resetsInMin: 3 * 1440 + 200 },
  ],
  codex: [
    { type: 'five_hour', percent: 18, resetsInMin: 220 },
    { type: 'seven_day', percent: 35, resetsInMin: 5 * 1440 + 60 },
  ],
}

/**
 * 비서 대화 (PC 비서 화면, f7): 못 하는 일 안내 → 카드 합치기 확인 카드(전·후 비교). agoMin = 몇 분 전.
 * 카드 단계 글은 앱(secretaryDescribe)이 한국어로만 만들어서, 다른 언어 캡처에 섞이지 않게 여기서 언어별로 적는다
 */
export const DEMO_SECRETARY: { role: 'me' | 'secretary'; agoMin: number; text: Text; card?: { title: Text; label: Text; detail: Text; compareLabel: Text; before: Text; after: Text } }[] = [
  { role: 'me', agoMin: 6, text: { ko: '표테스트 월급 좀 올려 줘', en: 'Give Quinn QA a raise', ja: '品川テストの給料を上げて', zh: '给秦测试涨点工资' } },
  {
    role: 'secretary',
    agoMin: 6,
    text: {
      ko: '급여는 제가 바꿀 수 없어요. 직원 급여는 쓴 토큰으로 정해져요. **급여 명세서**에서 직원별 금액을 볼 수 있어요.',
      en: "I can't change pay. Staff pay is based on the tokens they use. You can see each person's amount in **Payslips**.",
      ja: '給料は私には変えられません。社員の給料は使ったトークンで決まります。**給与明細**で社員ごとの金額を確認できます。',
      zh: '工资我改不了。员工工资按使用的 token 计算。可以在**工资单**里查看每位员工的金额。',
    },
  },
  { role: 'me', agoMin: 2, text: { ko: '결제 API 카드 두 개 하나로 합쳐 줘', en: 'Merge the two payment API cards into one', ja: '決済 API のカード 2 枚を 1 枚にまとめて', zh: '把两张支付 API 卡片合并成一张' } },
  {
    role: 'secretary',
    agoMin: 1,
    text: { ko: '합치기 전에 확인해 주세요. 설명서 카드를 연동 카드 아래에 붙이고 지울게요.', en: "Please check before I merge. I'll append the guide card to the integration card, then delete it.", ja: 'まとめる前に確認してください。ガイドのカードを連携カードの下に追記してから削除します。', zh: '合并前请确认。我会把说明卡片接在对接卡片下面,然后删除它。' },
    card: {
      title: { ko: '업무 카드 합치기', en: 'Merge task cards', ja: 'カードをまとめる', zh: '合并任务卡片' },
      label: { ko: '카드 합치기 — 결제 API 연동', en: 'Merge cards — Payment API integration', ja: 'カードをまとめる — 決済 API 連携', zh: '合并卡片 — 支付 API 对接' },
      detail: { ko: '남길 카드: 결제 API 연동 · 합칠 카드: 결제 API 사용 설명서', en: 'Keep: Payment API integration · Merge in: Payment API guide', ja: '残すカード: 決済 API 連携 · まとめるカード: 決済 API の利用ガイド', zh: '保留: 支付 API 对接 · 并入: 支付 API 使用说明' },
      compareLabel: { ko: '카드 설명', en: 'Card description', ja: 'カードの説明', zh: '卡片说明' },
      before: { ko: '결제 API 연동\nPR 올림', en: 'Payment API integration\nPR opened', ja: '決済 API 連携\nPR 作成済み', zh: '支付 API 对接\n已提交 PR' },
      after: {
        ko: '결제 API 연동\nPR 올림\n+ 결제 API 사용 설명서 (서문서)',
        en: 'Payment API integration\nPR opened\n+ Payment API guide (Theo Docs)',
        ja: '決済 API 連携\nPR 作成済み\n+ 決済 API の利用ガイド（文野ドキュ）',
        zh: '支付 API 对接\n已提交 PR\n+ 支付 API 使用说明（宋文档）',
      },
    },
  },
]

/** 터미널에서 돌아가는 외부 Claude 세션 (대시보드 '일하는 중') — 이름은 앱이 폴더 이름 대신 보여 주는 세션 이름 */
export const DEMO_EXTERNAL: { sessionId: string; cwd: string; name: Text; agoMin: number }[] = [
  { sessionId: 'demo-terminal-1', cwd: '/Users/me/projects/habit-api', name: { ko: '알림 서버 리팩터링', en: 'Refactor notification server', ja: '通知サーバーのリファクタリング', zh: '重构通知服务' }, agoMin: 18 },
]

/**
 * 꾸민 사무실 (Lv.4 1층 11×11칸, 회의실은 뒤 오른쪽) — 상점의 Lv.4 이하 품목만. [품목, gx, gy, 돌리기]
 * 뒤 왼쪽 개발팀 섬·오른쪽 성장팀 섬(책상 2개에 마주 앉는 의자 4개), 앞 왼쪽 라운지, 앞 오른쪽 놀이·간식 코너
 * 앱의 canPlace 검사를 통과한 배치다 — 바꾸면 꾸미기 화면에서 놓이는지 확인할 것
 */
export const DEMO_DECOR: [string, number, number, (0 | 1 | 2 | 3)?][] = [
  ['lv-cubicle-desk', 0, 3], ['lv-cubicle-desk', 2, 3], ['chair', 0, 2], ['chair', 2, 2], ['chair', 1, 4, 2], ['chair', 3, 4, 2],
  ['lv-cubicle-desk', 6, 6], ['lv-cubicle-desk', 8, 6], ['chair', 6, 5], ['chair', 8, 5], ['chair', 7, 7, 2], ['chair', 9, 7, 2],
  ['bookshelf', 0, 0], ['fig-tree', 2, 0], ['whiteboard', 3, 0], ['monstera', 10, 4], ['fern', 10, 6],
  ['lv-studio-sofa', 1, 7], ['zone-low-table', 1, 8], ['lv-studio-sofa', 1, 9, 2], ['rug-round', 1, 8], ['lava-lamp', 0, 7], ['monstera', 0, 9], ['floor-lamp', 3, 7],
  ['jukebox', 10, 8, 1], ['foosball', 6, 9], ['icecream', 10, 9, 1], ['coffee-machine', 10, 10, 1], ['flower-pot', 8, 10],
]
/** 벽지·바닥 (상점 품목 id) */
export const DEMO_SURFACES = { work: { wallpaper: 'wall-cream', floor: 'floor-carpet' } }

/** 컴퓨터 조작 장비의 도구 (shared/computerTools.ts COMPUTER_TOOL_PREFIX + computer) */
const COMPUTER_TOOL = 'mcp__office-computer__computer'
const CLICK_INPUT = { action: 'left_click', coordinate: [640, 412] }

/**
 * 실시간 상태: 휴대폰 미리보기는 그대로 쓰고, PC는 demo-seed가 demo-live.json으로 넘겨 CLAUDE_OFFICE_DEMO=1일 때만 채운다 (main/demoLive.ts)
 * activity가 없으면 결재 요약을 쓴다. approval.input = 도구 입력 ('앞으로 항상 승인' 규칙을 앱과 같은 방법으로 만든다). summary는 앱이 쓰는 모양 그대로
 */
export const DEMO_LIVE: Record<string, { status: 'working' | 'waiting' | 'idle' | 'error'; activity?: string; approval?: { toolName: string; summary: Text; input?: Record<string, unknown>; options?: Record<Lang, string[]> } }> = {
  d1: { status: 'working', activity: 'Read' },
  d2: { status: 'idle' },
  d3: { status: 'working', activity: 'Write' },
  d4: {
    status: 'waiting',
    approval: {
      toolName: 'AskUserQuestion',
      summary: { ko: '랜딩 시안 중 어느 쪽으로 갈까요?', en: 'Which landing mockup should we go with?', ja: 'LP 案はどちらにしますか？', zh: '落地页用哪一版？' },
      options: { ko: ['A안 (사진 중심)', 'B안 (일러스트)'], en: ['A (photo)', 'B (illustration)'], ja: ['A 案（写真）', 'B 案（イラスト）'], zh: ['A 版（照片）', 'B 版（插画）'] },
    },
  },
  d5: { status: 'working', activity: 'Edit' },
  d6: { status: 'waiting', activity: 'Bash', approval: { toolName: 'Bash', summary: same('npm run db:migrate'), input: { command: 'npm run db:migrate' } } },
  d7: { status: 'idle' },
  // 앱의 computerSummary(shared/computerTools.ts)와 같은 모양 "클릭 (x, y)"
  d8: { status: 'waiting', approval: { toolName: COMPUTER_TOOL, summary: { ko: '클릭 (640, 412)', en: 'Click (640, 412)', ja: 'クリック (640, 412)', zh: '点击 (640, 412)' }, input: CLICK_INPUT } },
  d9: { status: 'idle' },
  d10: { status: 'working', activity: 'Edit' },
}
