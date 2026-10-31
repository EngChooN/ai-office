import type { Entry } from './index.ts'

/** 아티팩트 카드·크게 보기 창 */
export default {
  'artifact.kind.html': { ko: 'HTML', en: 'HTML', ja: 'HTML', zh: 'HTML' },
  'artifact.kind.md': { ko: '문서', en: 'Document', ja: '文書', zh: '文档' },
  'artifact.open': { ko: '열기', en: 'Open', ja: '開く', zh: '打开' },
  'artifact.view': {
    ko: '보기 방식',
    en: 'View',
    ja: '表示方法',
    zh: '查看方式',
  },
  'artifact.tab.live': {
    ko: '실제 화면',
    en: 'Preview',
    ja: '実際の画面',
    zh: '实际画面',
  },
  'artifact.tab.source': { ko: '원본', en: 'Source', ja: '原本', zh: '源文件' },
  'artifact.version': {
    ko: '버전',
    en: 'Version',
    ja: 'バージョン',
    zh: '版本',
  },
  'artifact.versionOption': {
    ko: 'v{version} · {date}',
    en: 'v{version} · {date}',
    ja: 'v{version} · {date}',
    zh: 'v{version} · {date}',
  },
  'artifact.openExternal': {
    ko: '브라우저로 열기',
    en: 'Open in browser',
    ja: 'ブラウザで開く',
    zh: '在浏览器中打开',
  },
  'artifact.reveal': {
    ko: '파일 위치 열기',
    en: 'Show file location',
    ja: 'ファイルの場所を開く',
    zh: '打开文件位置',
  },
  'artifact.loading': {
    ko: '불러오는 중…',
    en: 'Loading…',
    ja: '読み込み中…',
    zh: '加载中…',
  },
  'artifact.missing': {
    ko: '이 버전을 찾지 못했어요. 파일이 지워졌을 수 있어요.',
    en: 'Could not find this version. The file may have been deleted.',
    ja: 'このバージョンが見つかりませんでした。ファイルが削除された可能性があります。',
    zh: '找不到此版本，文件可能已被删除。',
  },
  'artifact.error': {
    ko: '열지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    en: 'Could not open it. Please try again in a moment.',
    ja: '開けませんでした。少し待ってからもう一度お試しください。',
    zh: '无法打开，请稍后再试。',
  },
  'artifact.pcOnly': {
    ko: 'PC에서 열어 주세요',
    en: 'Open it on the PC',
    ja: 'PC で開いてください',
    zh: '请在电脑上打开',
  },
  'artifact.pcOnlyHint': {
    ko: '이 결과물은 PC 앱에서 볼 수 있어요.',
    en: 'This result can be viewed in the PC app.',
    ja: 'この成果物は PC アプリで見られます。',
    zh: '此成果可在电脑应用中查看。',
  },
} satisfies Record<string, Entry>
