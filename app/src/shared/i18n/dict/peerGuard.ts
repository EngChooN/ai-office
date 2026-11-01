import type { Entry } from './index.ts'

/** 여러 PC 한 랩 — 다른 PC가 맡긴 일의 격리·위임 제한·짝짓기 v2 오류 문구 (peer.ts는 화면 담당 소유) */
export default {
  'peer.guard.held': {
    ko: '{name}은(는) 다른 PC가 맡긴 일을 하는 중이에요. 이 지시는 그 일이 끝나면 이어서 전할게요',
    en: '{name} is working on a job from another PC. This instruction will be passed on once that job is done',
    ja: '{name}は別のPCから任された作業中です。この指示はその作業が終わってからお伝えします',
    zh: '{name}正在处理另一台电脑交付的工作。这条指令会在那项工作完成后再转达',
  },
  'peer.guard.lateDropped': {
    ko: '{name}에게 온 지시는 이미 끝난 다른 PC 일에서 이어진 것이라 전하지 않았어요',
    en: 'An instruction for {name} came from a job from another PC that has already finished, so it was not passed on',
    ja: '{name}への指示はすでに終わった別のPCの作業から続いたものなので、伝えませんでした',
    zh: '发给{name}的指令来自另一台电脑已完成的工作，因此没有转达',
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
  'peer.guard.busyPeer': {
    ko: '{name}은(는) 다른 PC가 맡긴 일을 하는 중이에요. 그 일이 끝난 뒤에 다시 맡겨 주세요',
    en: '{name} is working on a job from another PC. Hand it over again once that job is done',
    ja: '{name}は別のPCから任された作業中です。その作業が終わってからもう一度任せてください',
    zh: '{name}正在处理另一台电脑交付的工作。请在该工作完成后再交给 TA',
  },
  'peer.guard.noCard': {
    ko: '다른 PC가 맡긴 일에서는 업무 카드를 새로 만들거나 기획안을 올릴 수 없어요. 결과 보고에 필요한 내용을 적어 주세요',
    en: 'Work from another PC cannot create new board tasks or submit plans. Put what is needed in your result report instead',
    ja: '別のPCから任された作業では、業務カードの作成や企画案の提出はできません。必要な内容は結果報告に書いてください',
    zh: '另一台电脑交付的工作中不能新建任务卡或提交方案。请把所需内容写在结果报告里',
  },
  'peer.guard.noCopyChain': {
    ko: '파일 복사본으로 하는 일은 다른 직원에게 다시 맡길 수 없어요. 직접 처리해 주세요',
    en: 'Work on a file copy cannot be handed on to another staff member. Please handle it yourself',
    ja: 'ファイルのコピーで行う作業は、他のスタッフに再度任せられません。ご自身で対応してください',
    zh: '基于文件副本的工作无法再转交给其他员工，请自行处理',
  },
  'peer.guard.noChain': {
    ko: '다른 PC가 맡긴 일을 또 다른 PC의 {name}에게 넘길 수는 없어요',
    en: 'Work received from another PC cannot be passed on to {name} on yet another PC',
    ja: '別のPCから任された作業を、さらに別のPCの{name}に渡すことはできません',
    zh: '无法把另一台电脑交付的工作再转给其他电脑上的{name}',
  },
  'peer.error.server_proof_mismatch': {
    ko: '상대가 올바른 PC인지 확인하지 못해 연결을 중단했어요 (가짜 서버일 수 있어요). 다른 PC에서 연결 정보를 새로 만들어 다시 붙여 넣어 주세요',
    en: 'Could not verify that the other side is the right PC, so the connection was stopped (it may be a fake server). Create new connection info on the other PC and paste it again',
    ja: '相手が正しいPCか確認できず、接続を中止しました（偽のサーバーの可能性があります）。相手のPCで接続情報を作り直して、もう一度貼り付けてください',
    zh: '无法确认对方是正确的电脑，已中止连接（可能是伪造的服务器）。请在对方电脑上重新生成连接信息并再次粘贴',
  },
  'peer.report.changes': {
    ko: '파일 변경 {n}개가 결재함에 있어요. 열어서 확인하고 반영해 주세요',
    en: '{n} file changes are waiting in your approvals. Open them to review and apply',
    ja: 'ファイル変更{n}件が承認箱にあります。開いて確認し反映してください',
    zh: '审批箱中有 {n} 个文件更改，请打开查看并应用',
  },
  'peer.report.changesFailed': {
    ko: '파일 변경을 아직 받지 못했어요. 연결이 다시 되면 자동으로 받아서 결재함에 올릴게요',
    en: 'The file changes have not arrived yet. They will be fetched and added to your approvals once the connection is back',
    ja: 'ファイル変更をまだ受け取れていません。接続が戻り次第、自動で受け取って承認箱に追加します',
    zh: '尚未收到文件更改。连接恢复后会自动获取并加入审批箱',
  },
  'peer.report.changesSummary': {
    ko: '{name}의 파일 변경 {n}개',
    en: '{n} file changes from {name}',
    ja: '{name}のファイル変更{n}件',
    zh: '来自{name}的 {n} 个文件更改',
  },
  'peer.report.noWorkspace': {
    ko: '(프로젝트 폴더가 너무 크거나 보낼 수 없는 위치라 파일 복사본 없이 일만 보냈어요)',
    en: '(The project folder was too large or in a place that cannot be sent, so only the job was sent without a file copy)',
    ja: '（プロジェクトフォルダが大きすぎるか送れない場所のため、ファイルのコピーなしで作業だけ送りました）',
    zh: '（项目文件夹过大或位置无法发送，因此只发送了任务，未附带文件副本）',
  },
} satisfies Record<string, Entry>
