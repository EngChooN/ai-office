import type { Entry } from './index.ts'

/** 여러 PC 한 랩 — 다른 PC가 맡긴 일의 격리·위임 제한·짝짓기 v2 오류 문구 (peer.ts는 화면 담당 소유) */
export default {
  'peer.guard.held': {
    ko: '{name}은(는) 다른 PC가 맡긴 일을 하는 중이에요. 이 지시는 그 일이 끝나면 이어서 전할게요',
    en: '{name} is working on a job from another PC. This instruction will be passed on once that job is done',
    ja: '{name}は別のPCから任された作業中です。この指示はその作業が終わってからお伝えします',
    zh: '{name}正在处理另一台电脑交付的工作。这条指令会在那项工作完成后再转达',
  },
  'peer.guard.noAutoEdit': {
    ko: '{name}은(는) 파일 수정을 결재 없이 하는 설정이라, 다른 PC가 맡긴 일에서는 일을 넘길 수 없어요',
    en: '{name} edits files without approval, so work from another PC cannot be handed to them',
    ja: '{name}は承認なしでファイルを編集する設定のため、別のPCから任された作業は渡せません',
    zh: '{name}设置为无需审批即可修改文件，因此无法把另一台电脑交付的工作转给 TA',
  },
  'peer.guard.busy': {
    ko: '{name}은(는) 이 PC의 다른 일을 하는 중이에요. 끝난 뒤에 다시 맡겨 주세요',
    en: '{name} is busy with other work on this PC. Hand it over again once that is done',
    ja: '{name}はこのPCの別の作業中です。終わってからもう一度任せてください',
    zh: '{name}正在处理这台电脑上的其他工作。请在完成后再交给 TA',
  },
  'peer.guard.noChain': {
    ko: '다른 PC가 맡긴 일을 또 다른 PC의 {name}에게 넘길 수는 없어요',
    en: 'Work received from another PC cannot be passed on to {name} on yet another PC',
    ja: '別のPCから任された作業を、さらに別のPCの{name}に渡すことはできません',
    zh: '无法把另一台电脑交付的工作再转给其他电脑上的{name}',
  },
  'peer.error.server_proof_mismatch': {
    ko: '상대가 올바른 PC인지 확인하지 못해 연결을 중단했어요 (가짜 서버일 수 있어요)',
    en: 'Could not verify that the other side is the right PC, so the connection was stopped (it may be a fake server)',
    ja: '相手が正しいPCか確認できず、接続を中止しました（偽のサーバーの可能性があります）',
    zh: '无法确认对方是正确的电脑，已中止连接（可能是伪造的服务器）',
  },
} satisfies Record<string, Entry>
