import type { Entry } from './index.ts'

// 도우미(서브에이전트): 직원 장비 스위치·사용 중 표시(사무실 말풍선·카드 칩·머리말 펼침)·직원에게 주는 지시문
// 화면 이름은 '도우미' — '서브에이전트'·'분신'은 쓰지 않는다 (docs/design/subagent-indicator/handoff.md)
export default {
  'helpers.chip': { ko: '도우미 {n}', en: 'Helpers {n}', ja: 'ヘルパー {n}', zh: '助手 {n}' },
  'helpers.short': { ko: '×{n}', en: '×{n}', ja: '×{n}', zh: '×{n}' },
  'helpers.chipTitle': { ko: '도우미 {n}명이 함께 일하는 중', en: '{n} helpers working together', ja: 'ヘルパー{n}人と一緒に作業中', zh: '{n} 位助手正在一起工作' },
  'helpers.with': { ko: '도우미 {n}명과 함께', en: 'with {n} helpers', ja: 'ヘルパー{n}人と一緒', zh: '与 {n} 位助手一起' },
  'helpers.allDone': { ko: '도우미 {n}명이 끝냈어요', en: '{n} helpers finished', ja: 'ヘルパー{n}人が完了しました', zh: '{n} 位助手已完成' },
  'helpers.done': { ko: '끝남', en: 'Done', ja: '完了', zh: '已完成' },
  'helpers.expand': { ko: '펼치기', en: 'Show', ja: '開く', zh: '展开' },
  'helpers.collapse': { ko: '접기', en: 'Hide', ja: '閉じる', zh: '收起' },
  'helpers.list': { ko: '도우미가 하는 일', en: 'What the helpers are doing', ja: 'ヘルパーの作業', zh: '助手在做的事' },
  'helpers.setting.title': { ko: '도우미 나눠 쓰기', en: 'Split work with helpers', ja: 'ヘルパーに分担する', zh: '分给助手一起做' },
  'helpers.setting.desc': {
    ko: '켜면 일할 때 항상 도우미 여러 명에게 나눠 맡겨요. 큰 일이 더 빨리 끝날 수 있어요.',
    en: 'When on, this employee always splits work across several helpers. Big tasks may finish faster.',
    ja: 'オンにすると、作業を常に複数のヘルパーに分けて任せます。大きな仕事が早く終わることがあります。',
    zh: '开启后，工作时总会分给多位助手一起完成。大任务可能更快完成。',
  },
  'helpers.setting.warn': {
    ko: '비용(토큰)이 평소의 2~4배까지 늘 수 있어요.',
    en: 'Costs (tokens) can rise to 2–4× the usual.',
    ja: '費用（トークン）が通常の2〜4倍になることがあります。',
    zh: '费用（token）可能增至平时的 2–4 倍。',
  },

  // ── 직원에게 주는 지시문·막힘 사유 (도우미 쓰기가 켜진 Claude 직원만) ──
  'staff.helpers.guide': {
    ko: '[도우미 쓰기 켜짐] 일을 받으면 서로 겹치지 않는 부분으로 나눠 Agent 도구로 도우미 2명 이상에게 한 번에(같은 응답에서 동시에) 맡기고, 돌아온 결과를 직접 확인·취합해 보고하세요. 도우미에게는 할 일·찾을 곳·돌려받을 형식을 구체적으로 주세요. 도우미는 사무실 도구(위임·보고·결재 등)와 또 다른 도우미를 쓸 수 없으니 그런 일은 당신이 직접 하세요.',
    en: '[Helpers on] When you get work, split it into non-overlapping parts and hand them to 2 or more helpers at once with the Agent tool (in the same response, so they run in parallel), then check and combine their results yourself before reporting. Give each helper a concrete task, where to look and the shape of the answer you want back. Helpers cannot use office tools (delegate, report, approvals, etc.) or start other helpers, so do those yourself.',
    ja: '[ヘルパー使用オン] 仕事を受けたら重ならない部分に分け、Agent ツールでヘルパー2人以上に一度に（同じ応答で同時に）任せ、戻った結果は自分で確認・取りまとめて報告してください。ヘルパーにはやること・探す場所・返してほしい形式を具体的に伝えてください。ヘルパーはオフィスツール（委任・報告・承認など）や別のヘルパーを使えないので、それらは自分で行ってください。',
    zh: '[已开启助手] 接到工作后，把它拆成互不重叠的部分，用 Agent 工具一次性（在同一次回复中同时）交给 2 位以上助手，再亲自检查、汇总结果后汇报。给每位助手写清要做的事、要查的位置和希望返回的格式。助手不能使用办公室工具（委派、汇报、审批等），也不能再开助手，这些事由你亲自完成。',
  },
  'staff.deny.helperTool': {
    ko: '도우미는 사무실 도구와 또 다른 도우미를 쓸 수 없어요. 맡은 일의 결과만 돌려주면, 위임·보고·결재는 직원이 직접 합니다.',
    en: 'Helpers cannot use office tools or start other helpers. Just return the result of your part; the employee handles delegation, reports and approvals.',
    ja: 'ヘルパーはオフィスツールや別のヘルパーを使えません。担当分の結果だけを返してください。委任・報告・承認は社員本人が行います。',
    zh: '助手不能使用办公室工具，也不能再开助手。只需返回你负责部分的结果，委派、汇报和审批由员工本人完成。',
  },
} satisfies Record<string, Entry>
