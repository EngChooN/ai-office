import type { Entry } from './index.ts'

// 대화 기억 길이 (직원 패널 아래 줄)
export default {
  'memory.label': { ko: '대화 기억', en: 'Memory', ja: '会話の記憶', zh: '对话记忆' },
  'memory.short': { ko: '짧게', en: 'Short', ja: '短め', zh: '短' },
  'memory.normal': { ko: '보통', en: 'Normal', ja: '普通', zh: '普通' },
  'memory.long': { ko: '길게', en: 'Long', ja: '長め', zh: '长' },
  'memory.full': { ko: '최대', en: 'Max', ja: '最大', zh: '最大' },
  'memory.hint': {
    ko: '대화가 길어지면 비용과 시간을 아끼려고 새 대화로 넘어가요. 이때 앞 대화는 직전 보고만 이어받아요. 앞 이야기를 계속 이어 말하고 싶으면 길게 고르세요.',
    en: 'When a conversation gets long, it moves to a new one to save cost and time, carrying over only the last report. Pick a longer setting to keep talking about earlier things.',
    ja: '会話が長くなると、費用と時間を節約するため新しい会話に移ります。そのとき前の会話は直前の報告だけを引き継ぎます。前の話を続けたいときは長めを選んでください。',
    zh: '对话变长后，为了节省费用和时间会转到新对话，只带上最后一次汇报。想继续聊之前的内容，请选更长的选项。',
  },
  'memory.short.hint': {
    ko: '조금만 길어져도 새 대화로 넘겨요. 비용이 가장 적게 들어요.',
    en: 'Moves to a new conversation early. Lowest cost.',
    ja: '少し長くなるだけで新しい会話に移ります。費用がいちばん少なくて済みます。',
    zh: '稍微变长就转到新对话。费用最低。',
  },
  'memory.normal.hint': {
    ko: '기본값. 적당히 길어지면 새 대화로 넘겨요.',
    en: 'Default. Moves to a new conversation when it gets moderately long.',
    ja: '既定値。ほどよく長くなると新しい会話に移ります。',
    zh: '默认。适度变长后转到新对话。',
  },
  'memory.long.hint': {
    ko: '꽤 길어질 때까지 같은 대화를 이어요. 앞 내용을 더 잘 기억하지만 비용이 늘어요.',
    en: 'Keeps the same conversation much longer. Remembers more, costs more.',
    ja: 'かなり長くなるまで同じ会話を続けます。前の内容をよく覚えますが、費用が増えます。',
    zh: '在相当长之前一直沿用同一对话。记得更多，但费用增加。',
  },
  'memory.full.hint': {
    ko: '새 대화로 넘기지 않아요. 앞 이야기를 계속 이어 말할 수 있지만 비용이 가장 많이 들고 느려질 수 있어요. 아주 길어지면 앞부분은 요약돼요.',
    en: 'Never moves to a new conversation. You can keep referring back, but it costs the most and may slow down. Very old parts get summarized.',
    ja: '新しい会話に移りません。前の話をずっと続けられますが、費用がいちばん多くかかり、遅くなることがあります。とても長くなると前半は要約されます。',
    zh: '不转到新对话。可以一直接着之前的话题，但费用最高，也可能变慢。太长时前面的内容会被摘要。',
  },
  'memory.hintFoot': {
    ko: '새 대화로 넘어가도 이전 대화는 지워지지 않아요.',
    en: 'Earlier conversations are never deleted.',
    ja: '新しい会話に移っても、前の会話は消えません。',
    zh: '转到新对话后，之前的对话也不会被删除。',
  },
} satisfies Record<string, Entry>
