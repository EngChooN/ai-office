import type { Entry } from './index.ts'

// 대화방 구성원 상태 줄 · 일하는 직원에게 보내기 · 매뉴얼·명령 버튼
export default {
  'chat.status.list': { ko: '구성원 상태', en: 'Member status', ja: 'メンバーの状態', zh: '成员状态' },
  'chat.status.more': { ko: '+{count}명', en: '+{count} more', ja: '+{count}人', zh: '+{count}人' },
  'chat.status.less': { ko: '접기', en: 'Less', ja: '閉じる', zh: '收起' },
  'chat.status.task': { ko: '맡은 일', en: 'Assigned', ja: '担当の仕事', zh: '负责的工作' },
  'chat.status.now': { ko: '지금 하는 것', en: 'Doing now', ja: '今やっていること', zh: '正在做' },
  'chat.status.queued': { ko: '뒤에 기다리는 일 {count}건', en: '{count} more waiting', ja: '後に待っている仕事 {count}件', zh: '后面还有 {count} 项' },
  'chat.status.open': { ko: '누르면 직원 패널이 열려요', en: 'Click to open the staff panel', ja: 'クリックで社員パネルを開きます', zh: '点击打开员工面板' },
  'chat.busyNote': {
    ko: '{names} 님은 작업 중이에요 · 끝나면 보내거나 지금 끼어들 수 있어요',
    en: '{names} is working · send when done, or interrupt now',
    ja: '{names}さんは作業中です · 終わったら送るか、今すぐ割り込めます',
    zh: '{names} 正在工作 · 可以完成后发送，或立即插话',
  },
  'chat.manualButtonTitle': {
    ko: '받는 사람(멘션이 없으면 팀장·랩장)의 매뉴얼 고르기',
    en: "Pick a manual of the recipient (the team or lab lead if no one is mentioned)",
    ja: '受け取る人（メンションがなければチーム長・ラボ長）のマニュアルを選ぶ',
    zh: '选择接收人（未点名时为组长或实验室负责人）的手册',
  },
  'chat.commandButtonTitle': {
    ko: '받는 사람(멘션이 없으면 팀장·랩장)에게 보낼 AI 기본 명령 고르기',
    en: 'Pick an AI built-in command for the recipient (the team or lab lead if no one is mentioned)',
    ja: '受け取る人（メンションがなければチーム長・ラボ長）に送る AI の標準コマンドを選ぶ',
    zh: '为接收人（未点名时为组长或实验室负责人）选择 AI 内置命令',
  },
  'progress.waiting.labelTo': {
    ko: '대기 메시지 · {name} 님이 지금 하는 일이 끝나면 보내요',
    en: 'Queued message · sent to {name} when the current task ends',
    ja: '待機メッセージ · {name}さんの今の作業が終わったら送ります',
    zh: '排队消息 · {name} 当前任务结束后发送',
  },
} satisfies Record<string, Entry>
