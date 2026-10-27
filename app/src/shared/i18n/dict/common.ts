import type { Entry } from './index.ts'

/** 여러 화면이 같이 쓰는 글자 */
export default {
  'common.cancel': { ko: '취소', en: 'Cancel', ja: 'キャンセル', zh: '取消' },
  'common.confirm': { ko: '확인', en: 'OK', ja: 'OK', zh: '确定' },
  'common.save': { ko: '저장', en: 'Save', ja: '保存', zh: '保存' },
  'common.close': { ko: '닫기', en: 'Close', ja: '閉じる', zh: '关闭' },
  'common.delete': { ko: '삭제', en: 'Delete', ja: '削除', zh: '删除' },
  'common.me': { ko: '나', en: 'Me', ja: '自分', zh: '我' },
  'common.formerStaff': { ko: '퇴사자', en: 'Former staff', ja: '退職者', zh: '已离职员工' },
  'common.toBottom': { ko: '맨 아래로', en: 'Jump to latest', ja: '最新へ', zh: '回到底部' },
  'common.newMessages': { ko: '새 메시지 {count}', en: '{count} new', ja: '新着 {count}', zh: '{count} 条新消息' },
} satisfies Record<string, Entry>
