import type { Entry } from './index.ts'

// 직원 목록(A안) 카드·한 문장 요약·상황판 접는 칸·지금 하는 일 문장
export default {
  // ── 한 문장 요약 ──
  'staffCard.summary.total': { ko: '{n}명 중', en: 'Of {n}:', ja: '{n}人のうち', zh: '{n} 人中' },
  'staffCard.summary.working': { ko: '{n}명 일하는 중', en: '{n} working', ja: '{n}人が作業中', zh: '{n} 人在工作' },
  'staffCard.summary.waiting': { ko: '{n}명이 대표님 확인을 기다려요', en: '{n} waiting for your OK', ja: '{n}人が代表の確認待ち', zh: '{n} 人在等您确认' },
  'staffCard.summary.error': { ko: '{n}명 문제 생김', en: '{n} ran into a problem', ja: '{n}人に問題あり', zh: '{n} 人遇到问题' },
  'staffCard.summary.idle': { ko: '{n}명 쉬는 중', en: '{n} resting', ja: '{n}人が休憩中', zh: '{n} 人在休息' },
  'staffCard.summary.offline': { ko: '{n}명 퇴근', en: '{n} off work', ja: '{n}人が退勤', zh: '{n} 人已下班' },
  'staffCard.summary.filterHint': { ko: '이 직원만 보기 (다시 누르면 전체)', en: 'Show only these (click again for all)', ja: 'このスタッフだけ表示（もう一度押すと全員）', zh: '只看这些员工（再点一次显示全部）' },

  // ── 카드 ──
  'staffCard.nowLabel': { ko: '지금 하는 일', en: 'Doing now', ja: 'いまやっていること', zh: '正在做' },
  'staffCard.canLabel': { ko: '이런 일을 시킬 수 있어요', en: 'You can ask things like', ja: 'こんな仕事を頼めます', zh: '可以让他做这些事' },
  'staffCard.exampleTitle': { ko: '지시창에 채우기 (보내기는 직접)', en: 'Fill the message box (you send it)', ja: '指示欄に入れる（送信はご自身で）', zh: '填入指令框（由您发送）' },
  'staffCard.action.confirm': { ko: '확인하기', en: 'Review', ja: '確認する', zh: '去确认' },
  'staffCard.action.retry': { ko: '다시 시도', en: 'Try again', ja: 'もう一度', zh: '重试' },
  'staffCard.action.assign': { ko: '일 시키기', en: 'Give a task', ja: '仕事を頼む', zh: '安排工作' },
  'staffCard.retryDraft': { ko: '멈춘 일을 이어서 다시 해 줘', en: 'Please pick up where you stopped and try again', ja: '止まった作業を続けてもう一度やって', zh: '请接着刚才中断的工作再试一次' },
  'staffCard.details': { ko: '자세히 ›', en: 'Details ›', ja: '詳しく ›', zh: '详情 ›' },
  'staffCard.add.title': { ko: '직원 추가', en: 'Add staff', ja: 'スタッフを追加', zh: '添加员工' },
  'staffCard.add.hint': { ko: '직무만 고르면 바로 일해요', en: 'Pick a role and they start right away', ja: '職務を選ぶだけですぐ働きます', zh: '选好职务就能马上开工' },
  'staffCard.add.roles': { ko: '디자이너 · 기획자 · 개발자 · QA …', en: 'Designer · Planner · Developer · QA …', ja: 'デザイナー · 企画 · 開発 · QA …', zh: '设计师 · 策划 · 开发 · QA …' },

  // ── 지금 하는 일 문장 (shared/staffCard.ts nowLine) ──
  'staffCard.now.question': { ko: '질문 {n}개 — "{q}"', en: '{n} question(s) — "{q}"', ja: '質問 {n}件 — 「{q}」', zh: '{n} 个问题 — “{q}”' },
  'staffCard.now.approvalOf': { ko: '{what} — 해도 되는지 확인을 기다려요', en: '{what} — waiting for your OK', ja: '{what} — してよいか確認待ちです', zh: '{what} — 正在等您确认可否' },
  'staffCard.now.approval': { ko: '도구를 써도 되는지 확인을 기다려요', en: 'Waiting for your OK to use a tool', ja: 'ツールを使ってよいか確認待ちです', zh: '正在等您确认能否使用工具' },
  'staffCard.now.netError': { ko: '인터넷 연결이 끊겨 멈췄어요', en: 'Stopped — the internet connection dropped', ja: 'インターネット接続が切れて止まりました', zh: '网络连接中断，已暂停' },
  'staffCard.now.error': { ko: '문제가 생겨 멈췄어요', en: 'Stopped because of a problem', ja: '問題が起きて止まりました', zh: '出现问题，已停下' },
  'staffCard.now.working': { ko: '일하는 중이에요', en: 'Working on it', ja: '作業中です', zh: '正在工作' },
  'staffCard.now.task': { ko: '맡은 일: {title}', en: 'Assigned: {title}', ja: '担当: {title}', zh: '负责：{title}' },
  'staffCard.now.none': { ko: '맡은 일이 없어요', en: 'Nothing assigned', ja: '担当の仕事はありません', zh: '暂无负责的工作' },
  'staffCard.now.awaitingTeam': { ko: '팀원에게 맡긴 일을 기다리는 중이에요', en: 'Waiting on work delegated to the team', ja: 'メンバーに任せた作業を待っています', zh: '正在等待交给成员的工作' },
  'staffCard.now.offline': { ko: '퇴근했어요', en: 'Off work', ja: '退勤しました', zh: '已下班' },
  'staffCard.tool.edit': { ko: '파일을 고치는 중', en: 'Editing files', ja: 'ファイルを直しています', zh: '正在修改文件' },
  'staffCard.tool.write': { ko: '파일을 만드는 중', en: 'Writing a file', ja: 'ファイルを作っています', zh: '正在创建文件' },
  'staffCard.tool.read': { ko: '자료를 읽는 중', en: 'Reading', ja: '資料を読んでいます', zh: '正在阅读资料' },
  'staffCard.tool.run': { ko: '프로그램을 실행하는 중', en: 'Running a program', ja: 'プログラムを実行しています', zh: '正在运行程序' },
  'staffCard.tool.search': { ko: '파일을 찾는 중', en: 'Looking through files', ja: 'ファイルを探しています', zh: '正在查找文件' },
  'staffCard.tool.web': { ko: '인터넷에서 찾아보는 중', en: 'Searching the web', ja: 'インターネットで調べています', zh: '正在上网查找' },
  'staffCard.tool.agent': { ko: '일을 나눠 맡기는 중', en: 'Handing off part of the work', ja: '仕事を分けて任せています', zh: '正在分派工作' },
  'staffCard.tool.plan': { ko: '할 일을 정리하는 중', en: 'Planning the steps', ja: 'やることを整理しています', zh: '正在整理待办' },
  'staffCard.tool.other': { ko: '도구를 쓰는 중', en: 'Using a tool', ja: 'ツールを使っています', zh: '正在使用工具' },

  // ── 상황판 접는 칸 ──
  'staffCard.board.title': { ko: '상황판', en: 'Status board', ja: '状況ボード', zh: '状况看板' },
  'staffCard.board.attention': { ko: '확인 필요 {n}', en: '{n} need attention', ja: '要確認 {n}', zh: '待确认 {n}' },
  'staffCard.board.hint': { ko: '확인 필요 · 쓴 토큰 · 최근 활동', en: 'Needs attention · Tokens used · Recent activity', ja: '要確認 · 使用トークン · 最近の活動', zh: '待确认 · 已用 token · 最近动态' },
} satisfies Record<string, Entry>
