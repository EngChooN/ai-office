import type { Entry } from './index.ts'

// 직원 목록 위 알림 줄(v1.3.2 2차 ①) — 문제 생김·요금제 많이 씀, 요약 끝 '오늘 끝낸 일' 링크
export default {
  'alertBar.error.one': { ko: '{name} 님이 문제로 멈췄어요', en: '{name} stopped because of a problem', ja: '{name}さんが問題で止まりました', zh: '{name} 因问题停下了' },
  'alertBar.error.many': { ko: '{n}명이 문제로 멈췄어요', en: '{n} people stopped because of a problem', ja: '{n}人が問題で止まっています', zh: '{n} 人因问题停下了' },
  'alertBar.retry': { ko: '다시 시도', en: 'Try again', ja: 'もう一度', zh: '重试' },
  'alertBar.details': { ko: '자세히', en: 'Details', ja: '詳しく', zh: '详情' },
  'alertBar.view': { ko: '보기', en: 'View', ja: '見る', zh: '查看' },
  'alertBar.plan.title': { ko: 'AI 요금제를 많이 썼어요', en: "You've used a lot of your AI plan", ja: 'AIプランをたくさん使いました', zh: 'AI 套餐已用得很多' },
  'alertBar.plan.detail': { ko: '{n}% 사용 · {time}에 다시 채워져요', en: '{n}% used · resets at {time}', ja: '{n}%使用 · {time}に回復します', zh: '已用 {n}% · {time} 恢复' },
  'alertBar.plan.detailNoTime': { ko: '{n}% 사용', en: '{n}% used', ja: '{n}%使用', zh: '已用 {n}%' },
  'alertBar.plan.viewCost': { ko: '비용 보기', en: 'View costs', ja: '費用を見る', zh: '查看费用' },
  'alertBar.plan.hideToday': { ko: '오늘은 그만 보기', en: "Don't show again today", ja: '今日は表示しない', zh: '今天不再显示' },
  'alertBar.doneToday': { ko: '오늘 끝낸 일 {n}건', en: '{n} tasks done today', ja: '今日完了した仕事 {n}件', zh: '今天完成 {n} 项' },
} satisfies Record<string, Entry>
