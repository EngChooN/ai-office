import type { Entry } from './index.ts'

/** 비서 업무 보드 정리·팀/랩 구성 (shared/boardCleanup.ts·main/office.ts) */
export default {
  'board.cleanup.close': { ko: '오래된 카드 닫기', en: 'Close stale cards', ja: '古いカードを閉じる', zh: '关闭过期卡片' },
  'board.cleanup.merge': { ko: '중복 카드 합치기', en: 'Merge duplicate cards', ja: '重複カードをまとめる', zh: '合并重复卡片' },
  'board.cleanup.assign': { ko: '팀·랩 정하기', en: 'Set team or lab', ja: 'チーム・ラボを決める', zh: '指定团队或实验室' },
  'board.cleanup.status': { ko: '상태 바로잡기', en: 'Fix card status', ja: '状態を直す', zh: '修正卡片状态' },
  'board.cleanup.closeItem': { ko: "'{title}' — {days}일째 그대로라 완료로 닫기", en: "'{title}' — unchanged for {days} days, close as done", ja: '「{title}」— {days}日間そのままなので完了にする', zh: '“{title}”— 已 {days} 天未变动，标为完成' },
  'board.cleanup.mergeItem': { ko: "'{title}' — 같은 카드 {n}장을 여기로 합치기", en: "'{title}' — merge {n} duplicate cards into this one", ja: '「{title}」— 同じカード{n}枚をここにまとめる', zh: '“{title}”— 把 {n} 张相同卡片合并到这里' },
  'board.cleanup.assignItem': { ko: "'{title}' — 담당 직원의 팀·랩으로", en: "'{title}' — to the assignee's team or lab", ja: '「{title}」— 担当者のチーム・ラボへ', zh: '“{title}”— 归入负责人的团队或实验室' },
  'board.cleanup.stuckItem': { ko: "'{title}' — 진행 중인데 아무도 하고 있지 않아 할 일로", en: "'{title}' — in progress but no one is on it, back to To do", ja: '「{title}」— 進行中なのに誰も作業していないのでTo doへ', zh: '“{title}”— 进行中却无人处理，退回待办' },
  'board.cleanup.noAssigneeItem': { ko: "'{title}' — 담당 없이 진행 중이라 할 일로", en: "'{title}' — in progress with no assignee, back to To do", ja: '「{title}」— 担当者なしで進行中なのでTo doへ', zh: '“{title}”— 无负责人却在进行中，退回待办' },
  'board.merge.from': { ko: "합친 카드: '{title}'", en: "Merged card: '{title}'", ja: '統合したカード:「{title}」', zh: '合并的卡片：“{title}”' },
  'org.mergeTeams.chat': { ko: '{from} 팀을 {into} 팀으로 합쳤어요 (직원 {n}명 이동).', en: 'Merged the {from} team into {into} ({n} staff moved).', ja: '{from}チームを{into}チームに統合しました(社員{n}人を移動)。', zh: '已将 {from} 团队并入 {into}（调动 {n} 名员工）。' },
} satisfies Record<string, Entry>
