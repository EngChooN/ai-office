import type { Entry } from './index.ts'

// 직무 11개: 한 줄 설명(직원 추가 1단계 카드·패널 '소개')과 '이런 일을 시킬 수 있어요' 예시 3개(직원 카드, 누르면 지시창에 채움)
export default {
  'roleInfo.lead.desc': { ko: '큰 일을 받아 쪼개고, 팀원에게 나눠 맡긴 뒤 모아서 보고해요.', en: 'Takes big jobs, splits them up, hands parts to the team, and reports back with the results.', ja: '大きな仕事を受けて分け、チームに任せてからまとめて報告します。', zh: '接下大任务后拆分，分给团队成员，再汇总汇报。' },
  'roleInfo.lead.ex1': { ko: '이번 주 할 일 나눠 줘', en: "Split up this week's work", ja: '今週の作業を分けて', zh: '把本周的工作分一下' },
  'roleInfo.lead.ex2': { ko: '진행 상황 모아 줘', en: 'Gather a progress update', ja: '進み具合をまとめて', zh: '汇总一下进度' },
  'roleInfo.lead.ex3': { ko: '일정표 만들어 줘', en: 'Make a schedule', ja: 'スケジュール表を作って', zh: '做一份日程表' },

  'roleInfo.frontend.desc': { ko: '사람이 보는 화면·버튼을 만들고 고쳐요.', en: 'Builds and fixes the screens and buttons people see.', ja: '人が見る画面やボタンを作って直します。', zh: '制作和修改用户看到的界面和按钮。' },
  'roleInfo.frontend.ex1': { ko: '이 화면 버튼 고쳐 줘', en: 'Fix the button on this screen', ja: 'この画面のボタンを直して', zh: '修一下这个界面的按钮' },
  'roleInfo.frontend.ex2': { ko: '시안대로 화면 만들어 줘', en: 'Build the screen from the mockup', ja: 'デザイン案どおりに画面を作って', zh: '照设计稿做出界面' },
  'roleInfo.frontend.ex3': { ko: '화면 오류 찾아 줘', en: 'Find what is broken on screen', ja: '画面の不具合を探して', zh: '找出界面上的问题' },

  'roleInfo.backend.desc': { ko: '화면 뒤에서 도는 서버·데이터 기능을 만들어요.', en: 'Builds the server and data features that run behind the screens.', ja: '画面の裏で動くサーバーやデータの機能を作ります。', zh: '开发在界面背后运行的服务器和数据功能。' },
  'roleInfo.backend.ex1': { ko: '느린 곳 찾아 줘', en: 'Find what is slow', ja: '遅いところを探して', zh: '找出慢的地方' },
  'roleInfo.backend.ex2': { ko: '저장 기능 만들어 줘', en: 'Build a save feature', ja: '保存機能を作って', zh: '做一个保存功能' },
  'roleInfo.backend.ex3': { ko: '외부 서비스 연결해 줘', en: 'Connect an outside service', ja: '外部サービスにつないで', zh: '接入外部服务' },

  'roleInfo.reviewer.desc': { ko: '다른 직원이 바꾼 코드를 읽고 문제를 찾아요.', en: 'Reads code other staff changed and looks for problems.', ja: 'ほかのスタッフが変えたコードを読んで問題を探します。', zh: '阅读其他员工改动的代码，找出问题。' },
  'roleInfo.reviewer.ex1': { ko: '오늘 바뀐 것 검토해 줘', en: "Review today's changes", ja: '今日の変更をレビューして', zh: '检查今天的改动' },
  'roleInfo.reviewer.ex2': { ko: '위험한 곳 알려 줘', en: 'Point out risky spots', ja: '危ないところを教えて', zh: '指出有风险的地方' },
  'roleInfo.reviewer.ex3': { ko: '고칠 점 정리해 줘', en: 'List what to fix', ja: '直す点をまとめて', zh: '整理需要修改的地方' },

  'roleInfo.qa.desc': { ko: '기능을 직접 써 보며 오류를 찾고 기록해요.', en: 'Tries features hands-on, finds bugs, and writes them down.', ja: '機能を実際に使ってみて不具合を探し、記録します。', zh: '亲自试用功能，找出错误并记录。' },
  'roleInfo.qa.ex1': { ko: '이 기능 시험해 줘', en: 'Test this feature', ja: 'この機能を試して', zh: '测试一下这个功能' },
  'roleInfo.qa.ex2': { ko: '버그 목록 만들어 줘', en: 'Make a bug list', ja: 'バグ一覧を作って', zh: '列一份问题清单' },
  'roleInfo.qa.ex3': { ko: '고친 것 다시 확인해 줘', en: 'Re-check the fixes', ja: '直したところをもう一度確認して', zh: '再确认一下修好的地方' },

  'roleInfo.planner.desc': { ko: '무엇을 왜 만들지 정리하고 문서로 써요.', en: 'Works out what to build and why, and writes it up.', ja: '何をなぜ作るのかを整理して文書にします。', zh: '理清做什么、为什么做，并写成文档。' },
  'roleInfo.planner.ex1': { ko: '기획서 초안 써 줘', en: 'Draft a plan', ja: '企画書の下書きを書いて', zh: '写一份策划初稿' },
  'roleInfo.planner.ex2': { ko: '화면 흐름 정리해 줘', en: 'Map out the screen flow', ja: '画面の流れをまとめて', zh: '整理界面流程' },
  'roleInfo.planner.ex3': { ko: '회의 내용 정리해 줘', en: 'Write up the meeting notes', ja: '会議の内容をまとめて', zh: '整理会议内容' },

  'roleInfo.researcher.desc': { ko: '자료를 찾아 읽고 출처와 함께 요약해요.', en: 'Finds and reads material, then sums it up with sources.', ja: '資料を探して読み、出典付きで要約します。', zh: '查找并阅读资料，附上出处做总结。' },
  'roleInfo.researcher.ex1': { ko: '비슷한 서비스 조사해 줘', en: 'Look into similar services', ja: '似たサービスを調べて', zh: '调查类似的服务' },
  'roleInfo.researcher.ex2': { ko: '자료 요약해 줘', en: 'Summarize this material', ja: '資料を要約して', zh: '总结一下资料' },
  'roleInfo.researcher.ex3': { ko: '장단점 비교해 줘', en: 'Compare the pros and cons', ja: '長所と短所を比べて', zh: '比较一下优缺点' },

  'roleInfo.designer.desc': { ko: '화면 시안과 아이콘·그림을 만들고 결과를 검수해요.', en: 'Makes screen mockups, icons, and images, and checks the finished result.', ja: '画面のデザイン案やアイコン・絵を作り、仕上がりを確認します。', zh: '制作界面设计稿、图标和图片，并检查成品。' },
  'roleInfo.designer.ex1': { ko: '화면 시안 만들어 줘', en: 'Make a screen mockup', ja: '画面のデザイン案を作って', zh: '做一份界面设计稿' },
  'roleInfo.designer.ex2': { ko: '아이콘 그려 줘', en: 'Draw an icon', ja: 'アイコンを描いて', zh: '画一个图标' },
  'roleInfo.designer.ex3': { ko: '구현된 화면 검수해 줘', en: 'Check the built screen', ja: 'できた画面を確認して', zh: '检查做好的界面' },

  'roleInfo.cs.desc': { ko: '고객 문의에 답할 글을 쓰고 자주 묻는 질문을 정리해요.', en: 'Writes replies to customer questions and keeps an FAQ.', ja: 'お客様の問い合わせへの返信を書き、よくある質問をまとめます。', zh: '撰写客户咨询的回复，整理常见问题。' },
  'roleInfo.cs.ex1': { ko: '답변 초안 써 줘', en: 'Draft a reply', ja: '返信の下書きを書いて', zh: '写一份回复初稿' },
  'roleInfo.cs.ex2': { ko: 'FAQ 정리해 줘', en: 'Organize the FAQ', ja: 'FAQをまとめて', zh: '整理常见问题' },
  'roleInfo.cs.ex3': { ko: '문의 종류 나눠 줘', en: 'Sort the questions by type', ja: '問い合わせを種類別に分けて', zh: '把咨询按类型分一下' },

  'roleInfo.marketer.desc': { ko: '홍보 글과 게시 일정을 만들고 반응을 정리해요.', en: 'Writes promo posts, plans when to post, and sums up the response.', ja: '宣伝文と投稿スケジュールを作り、反応をまとめます。', zh: '撰写宣传文案、安排发布时间，并整理反馈。' },
  'roleInfo.marketer.ex1': { ko: '홍보 글 3개 써 줘', en: 'Write 3 promo posts', ja: '宣伝文を3つ書いて', zh: '写 3 篇宣传文案' },
  'roleInfo.marketer.ex2': { ko: '게시 일정 짜 줘', en: 'Plan a posting schedule', ja: '投稿スケジュールを組んで', zh: '排一下发布日程' },
  'roleInfo.marketer.ex3': { ko: '반응 정리해 줘', en: 'Sum up the response', ja: '反応をまとめて', zh: '整理一下反馈' },

  'roleInfo.free.desc': { ko: '추가할 때 적은 업무 지침대로 일해요.', en: 'Works by the instructions you wrote when adding them.', ja: '追加するときに書いた業務の指示どおりに働きます。', zh: '按添加时写下的工作说明做事。' },
  'roleInfo.free.ex1': { ko: '자기소개 해 줘', en: 'Introduce yourself', ja: '自己紹介して', zh: '做个自我介绍' },
  'roleInfo.free.ex2': { ko: '네가 할 수 있는 일 알려 줘', en: 'Tell me what you can do', ja: 'できることを教えて', zh: '告诉我你能做什么' },
  'roleInfo.free.ex3': { ko: '이번 주 할 일 표로 만들어 줘', en: "Put this week's to-dos in a table", ja: '今週のやることを表にして', zh: '把本周要做的事列成表' },
} satisfies Record<string, Entry>
