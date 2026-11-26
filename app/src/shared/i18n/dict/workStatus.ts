import type { Entry } from './index.ts'

/** 상태 보드: 맡긴 일의 상태 이름·대표 응답 대기 시간 (main/workStatus.ts) */
export default {
  'workStatus.state.queued': { ko: '할 일', en: 'To do', ja: 'To do', zh: '待办' },
  'workStatus.state.working': { ko: '진행 중', en: 'In progress', ja: '進行中', zh: '进行中' },
  'workStatus.state.awaitingUser': { ko: '대표 응답 대기', en: 'Waiting for you', ja: 'あなたの返答待ち', zh: '等待你的回复' },
  'workStatus.state.review': { ko: '검토 중', en: 'In review', ja: 'レビュー中', zh: '审核中' },
  'workStatus.state.done': { ko: '완료', en: 'Done', ja: '完了', zh: '已完成' },
  'workStatus.wait.underMinute': { ko: '1분 미만', en: 'Under 1 min', ja: '1分未満', zh: '不到 1 分钟' },
  'workStatus.wait.minutes': { ko: '{m}분', en: '{m} min', ja: '{m}分', zh: '{m} 分钟' },
  'workStatus.wait.hours': { ko: '{h}시간 {m}분', en: '{h} hr {m} min', ja: '{h}時間{m}分', zh: '{h} 小时 {m} 分钟' },
  'workStatus.wait.days': { ko: '{d}일 {h}시간', en: '{d} d {h} hr', ja: '{d}日{h}時間', zh: '{d} 天 {h} 小时' },
} satisfies Record<string, Entry>
