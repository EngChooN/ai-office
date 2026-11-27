import type { Entry } from './index.ts'

/** 상태 보드: 맡긴 일의 상태 이름·대표 응답 대기 시간 (main/workStatus.ts) */
export default {
  'workStatus.state.queued': { ko: '할 일', en: 'To do', ja: '未着手', zh: '待办' },
  'workStatus.state.working': { ko: '진행 중', en: 'In progress', ja: '進行中', zh: '进行中' },
  'workStatus.state.awaitingUser': { ko: '대표 응답 대기', en: 'Waiting for you', ja: 'あなたの返答待ち', zh: '等待你的回复' },
  'workStatus.state.review': { ko: '검토 중', en: 'In review', ja: 'レビュー中', zh: '审核中' },
  'workStatus.state.done': { ko: '완료', en: 'Done', ja: '完了', zh: '已完成' },
  'workStatus.wait.underMinute': { ko: '1분 미만', en: 'Under 1 min', ja: '1分未満', zh: '不到 1 分钟' },
  'workStatus.wait.minutes': { ko: '{m}분', en: '{m} min', ja: '{m}分', zh: '{m} 分钟' },
  'workStatus.wait.hours': { ko: '{h}시간 {m}분', en: '{h} hr {m} min', ja: '{h}時間{m}分', zh: '{h} 小时 {m} 分钟' },
  'workStatus.wait.days': { ko: '{d}일 {h}시간', en: '{d} d {h} hr', ja: '{d}日{h}時間', zh: '{d} 天 {h} 小时' },
  'workStatus.band.title': { ko: '대표 응답 대기 {n}건', en: '{n} waiting for you', ja: '返答待ち {n}件', zh: '等待回复 {n} 项' },
  'workStatus.band.more': { ko: '+{n}건', en: '+{n}', ja: '+{n}件', zh: '+{n} 项' },
  'workStatus.band.viewAll': { ko: '모두 보기', en: 'View all', ja: 'すべて見る', zh: '查看全部' },
  'workStatus.band.dialogTitle': { ko: '대표 응답을 기다리는 일', en: 'Tasks waiting for you', ja: 'あなたの返答を待っている仕事', zh: '等待你回复的任务' },
  'workStatus.band.dialogDesc': { ko: '오래 기다린 일부터 보여요. 누르면 자세히 볼 수 있어요.', en: 'Longest wait first. Click one to see details.', ja: '待ち時間が長い順です。押すと詳しく見られます。', zh: '按等待时间从长到短排列。点击查看详情。' },
  'workStatus.waitedFor': { ko: '{time}째', en: 'for {time}', ja: '{time}経過', zh: '已等 {time}' },
  'workStatus.reReview': { ko: '재검토 필요', en: 'Re-review', ja: '再レビュー', zh: '需重新审核' },
  'workStatus.reReviewTitle': { ko: '검토한 뒤 코드가 바뀌었어요. 다시 확인해 주세요.', en: 'The code changed after review. Please check it again.', ja: 'レビュー後にコードが変わりました。もう一度確認してください。', zh: '审核后代码有变动，请再确认一次。' },
  'workStatus.failed': { ko: '실패', en: 'Failed', ja: '失敗', zh: '失败' },
  'workStatus.failedTitle': { ko: '담당 직원이 끝내지 못해 할 일로 돌아왔어요. 이유: {reason}', en: "The assignee couldn't finish, so it's back in To do. Reason: {reason}", ja: '担当者が終えられず「やること」に戻りました。理由: {reason}', zh: '负责人未能完成，已退回待办。原因：{reason}' },
  'workStatus.failedTitleNoReason': { ko: '담당 직원이 끝내지 못해 할 일로 돌아왔어요.', en: "The assignee couldn't finish, so it's back in To do.", ja: '担当者が終えられず「やること」に戻りました。', zh: '负责人未能完成，已退回待办。' },
  'workStatus.mapTip': { ko: '{task} · {time}째', en: '{task} · for {time}', ja: '{task} · {time}経過', zh: '{task} · 已等 {time}' },
} satisfies Record<string, Entry>
