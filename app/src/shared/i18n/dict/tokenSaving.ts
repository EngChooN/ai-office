import type { Entry } from './index.ts'

// 토큰 절약: 급여 화면 '이번 주 토큰 아끼기 Top 3' · 설정 '토큰 절약 모드'
export default {
  'tokenSaver.title': { ko: '이번 주 토큰 아끼기 Top 3', en: 'Save tokens this week: Top 3', ja: '今週のトークン節約 Top 3', zh: '本周节省令牌 Top 3' },
  'tokenSaver.desc': {
    ko: '이번 주에 토큰을 많이 쓴 직원 중 설정을 한 단계 낮추면 아낄 수 있는 사람이에요',
    en: 'Staff who used the most tokens this week and could save by lowering one setting a step',
    ja: '今週トークンを多く使った社員のうち、設定を一段階下げると節約できる人です',
    zh: '本周用令牌最多、把一项设置调低一档就能节省的员工',
  },
  'tokenSaver.tokens': { ko: '{n} 사용', en: '{n} used', ja: '{n} 使用', zh: '已用 {n}' },
  'tokenSaver.reason.fable': { ko: 'Fable 모델을 써요', en: 'Uses the Fable model', ja: 'Fable モデルを使っています', zh: '在用 Fable 模型' },
  'tokenSaver.reason.opus': { ko: 'Opus 모델을 써요', en: 'Uses the Opus model', ja: 'Opus モデルを使っています', zh: '在用 Opus 模型' },
  'tokenSaver.reason.memoryFull': { ko: '대화 기억이 최대예요', en: 'Conversation memory is set to Max', ja: '会話の記憶が最大です', zh: '对话记忆设为最大' },
  'tokenSaver.reason.memoryLong': { ko: '대화 기억이 길게예요', en: 'Conversation memory is set to Long', ja: '会話の記憶が長めです', zh: '对话记忆设为长' },
  'tokenSaver.save': { ko: '아끼기', en: 'Save', ja: '節約する', zh: '节省' },
  'tokenSaver.hint.model': {
    ko: '모델을 {to} 모델로 한 단계 낮춰요. 아주 어려운 일은 덜 꼼꼼할 수 있어요',
    en: 'Lowers the model one step to {to}. Very hard tasks may be handled less thoroughly',
    ja: 'モデルを {to} に一段階下げます。とても難しい仕事は丁寧さが少し落ちることがあります',
    zh: '把模型降一档到 {to}。特别难的工作可能没那么细致',
  },
  'tokenSaver.hint.memory': {
    ko: '대화 기억을 보통으로 줄여요. 대화가 길어지면 더 일찍 새 대화로 넘겨요',
    en: 'Lowers conversation memory to Normal. Long conversations move to a new one sooner',
    ja: '会話の記憶を普通に減らします。会話が長くなると早めに新しい会話へ引き継ぎます',
    zh: '把对话记忆降到普通。对话变长时会更早转到新对话',
  },
  'tokenSaver.done': { ko: '바꿨어요', en: 'Changed', ja: '変更しました', zh: '已更改' },
  'tokenSaver.undo': { ko: '되돌리기', en: 'Undo', ja: '元に戻す', zh: '撤销' },
  'tokenSaver.failed': { ko: '바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요', en: "Couldn't change it. Please try again in a moment", ja: '変更できませんでした。少ししてからもう一度押してください', zh: '没能更改，请稍后再试' },
  'settingsPage.tokenSaver.title': { ko: '토큰 절약 모드', en: 'Token saver mode', ja: 'トークン節約モード', zh: '令牌节省模式' },
  'settingsPage.tokenSaver.desc': {
    ko: '새로 추가하는 직원을 Haiku 모델과 짧은 대화 기억으로 시작해요. GPT 직원은 대화 기억만 짧게 해요. 지금 있는 직원은 바뀌지 않아요',
    en: 'New hires start with the Haiku model and short conversation memory. GPT staff only get short memory. Current staff are not changed',
    ja: '新しく雇う社員を Haiku モデルと短い会話の記憶で始めます。GPT 社員は会話の記憶だけ短くします。今いる社員は変わりません',
    zh: '新雇用的员工默认用 Haiku 模型和短对话记忆。GPT 员工只把对话记忆设短。现有员工不变',
  },
  'settingsPage.tokenSaver.toggle': { ko: '토큰 절약 모드 켜기', en: 'Turn on token saver mode', ja: 'トークン節約モードをオンにする', zh: '开启令牌节省模式' },
} satisfies Record<string, Entry>
