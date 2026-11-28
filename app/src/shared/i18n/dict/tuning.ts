import type { Entry } from './index.ts'

// 생각 깊이·빠른 모드 (직원 패널 아래 줄, /effort·/fast)
export default {
  'tuning.effort.label': { ko: '생각 깊이', en: 'Thinking', ja: '考える深さ', zh: '思考深度' },
  'tuning.effort.default': { ko: '기본', en: 'Default', ja: '標準', zh: '默认' },
  'tuning.effort.low': { ko: '낮게', en: 'Low', ja: '低', zh: '低' },
  'tuning.effort.medium': { ko: '보통', en: 'Medium', ja: '中', zh: '中' },
  'tuning.effort.high': { ko: '높게', en: 'High', ja: '高', zh: '高' },
  'tuning.effort.xhigh': { ko: '매우 높게', en: 'Extra high', ja: 'かなり高', zh: '很高' },
  'tuning.effort.max': { ko: '최대', en: 'Max', ja: '最大', zh: '最高' },
  'tuning.effort.hint': {
    ko: '깊게 생각할수록 답이 꼼꼼해지지만 느려지고 사용량이 늘어요. 기본은 모델이 정한 값이에요. 일하는 중에 바꾸면 다음 단계부터 적용돼요.',
    en: 'Deeper thinking gives more careful answers but is slower and uses more. Default uses the model’s own setting. Changes made while working apply from the next step.',
    ja: '深く考えるほど答えは丁寧になりますが、遅くなり使用量も増えます。標準はモデルが決めた値です。作業中に変えると次の段階から適用されます。',
    zh: '思考越深，回答越周到，但会更慢、用量更多。默认使用模型自己的设置。工作中更改会从下一步开始生效。',
  },
  'tuning.fast.label': { ko: '빠른 모드', en: 'Fast mode', ja: '高速モード', zh: '快速模式' },
  'tuning.fast.hint': {
    ko: '답을 더 빨리 받아요. 대신 사용량을 더 쓰고, 모델·요금제에 따라 쓸 수 없으면 보통 속도로 돌아요.',
    en: 'Get answers faster. It uses more, and runs at normal speed if your model or plan does not support it.',
    ja: '答えをより速く受け取ります。その分使用量が増え、モデルやプランが対応していなければ通常の速度で動きます。',
    zh: '更快得到回答。会多用用量；若模型或套餐不支持，则以普通速度运行。',
  },
  'tuning.writing': { ko: '쓰는 중', en: 'Writing', ja: '入力中', zh: '正在写' },
  'slash.effort.current': {
    ko: '지금 생각 깊이는 {current}예요. 바꾸려면 /effort 뒤에 {choices} 중 하나를 적어 주세요.',
    en: 'Thinking depth is {current}. To change it, type one of {choices} after /effort.',
    ja: '現在の考える深さは {current} です。変更するには /effort の後ろに {choices} のいずれかを書いてください。',
    zh: '当前思考深度为 {current}。要更改，请在 /effort 后输入 {choices} 之一。',
  },
  'slash.effort.unknown': {
    ko: '"{arg}"는 모르는 값이라 바꾸지 않았어요. 지금 생각 깊이는 {current}이고, 고를 수 있는 값은 {choices}예요.',
    en: 'Unknown value "{arg}", so nothing was changed. Thinking depth is {current}; choose one of {choices}.',
    ja: '"{arg}" は不明な値のため変更しませんでした。現在の考える深さは {current}、選べる値は {choices} です。',
    zh: '"{arg}" 不是已知值，未做更改。当前思考深度为 {current}，可选值为 {choices}。',
  },
  'slash.effort.changed': {
    ko: '생각 깊이를 {effort}(으)로 바꿨어요. 일하는 중이면 다음 단계부터 적용돼요.',
    en: 'Thinking depth changed to {effort}. If working, it applies from the next step.',
    ja: '考える深さを {effort} に変更しました。作業中なら次の段階から適用されます。',
    zh: '思考深度已改为 {effort}。若正在工作，将从下一步开始生效。',
  },
  'slash.fast.unknown': {
    ko: '"{arg}"는 모르는 값이라 바꾸지 않았어요. /fast on 또는 /fast off로 적어 주세요 (뒤를 비우면 켜고 끄기를 바꿔요).',
    en: 'Unknown value "{arg}", so nothing was changed. Use /fast on or /fast off (leave it empty to toggle).',
    ja: '"{arg}" は不明な値のため変更しませんでした。/fast on または /fast off と書いてください（空欄なら切り替えます）。',
    zh: '"{arg}" 不是已知值，未做更改。请输入 /fast on 或 /fast off（留空则切换开关）。',
  },
  'slash.fast.on': {
    ko: '빠른 모드를 켰어요. 사용량을 더 쓰고, 모델·요금제가 지원하지 않으면 보통 속도로 돌아요.',
    en: 'Fast mode is on. It uses more, and runs at normal speed if your model or plan does not support it.',
    ja: '高速モードをオンにしました。使用量が増え、モデルやプランが対応していなければ通常の速度で動きます。',
    zh: '已开启快速模式。会多用用量；若模型或套餐不支持，则以普通速度运行。',
  },
  'slash.fast.off': {
    ko: '빠른 모드를 껐어요.',
    en: 'Fast mode is off.',
    ja: '高速モードをオフにしました。',
    zh: '已关闭快速模式。',
  },
} satisfies Record<string, Entry>
