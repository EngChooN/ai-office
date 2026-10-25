import type { Entry } from './index.ts'

/** 앱 업데이트 알림 (안내 창·사이드바 배지·설정 '업데이트 확인') */
export default {
  'update.notice.title': { ko: '새 버전 {version}이 나왔어요', en: 'Version {version} is available', ja: '新しいバージョン {version} が出ました', zh: '新版本 {version} 已发布' },
  'update.notice.desc': {
    ko: '지금 쓰는 버전은 {current}이에요. 다운로드한 파일을 열어 직접 설치해 주세요.',
    en: 'You are on version {current}. Open the downloaded file to install it yourself.',
    ja: '現在のバージョンは {current} です。ダウンロードしたファイルを開いて、ご自身でインストールしてください。',
    zh: '当前版本为 {current}。请打开下载的文件自行安装。',
  },
  'update.download': { ko: '다운로드', en: 'Download', ja: 'ダウンロード', zh: '下载' },
  'update.later': { ko: '나중에', en: 'Later', ja: 'あとで', zh: '以后再说' },
  'update.badge': { ko: '새 버전 {version}', en: 'New version {version}', ja: '新しいバージョン {version}', zh: '新版本 {version}' },
  'update.badgeShort': { ko: '새 버전', en: 'New', ja: '新版', zh: '新版' },
  'update.section.title': { ko: '업데이트 확인', en: 'Check for updates', ja: 'アップデートの確認', zh: '检查更新' },
  'update.section.desc': {
    ko: '앱을 켤 때와 6시간마다 새 버전을 확인해요. 설치는 다운로드한 파일로 직접 해요.',
    en: 'The app checks for a new version at startup and every 6 hours. You install it yourself from the downloaded file.',
    ja: 'アプリの起動時と6時間ごとに新しいバージョンを確認します。インストールはダウンロードしたファイルからご自身で行います。',
    zh: '应用会在启动时以及每 6 小时检查一次新版本。请使用下载的文件自行安装。',
  },
  'update.section.current': { ko: '현재 버전 {version}', en: 'Current version {version}', ja: '現在のバージョン {version}', zh: '当前版本 {version}' },
  'update.section.checkNow': { ko: '지금 확인', en: 'Check now', ja: '今すぐ確認', zh: '立即检查' },
  'update.section.checking': { ko: '확인하는 중…', en: 'Checking…', ja: '確認しています…', zh: '正在检查…' },
  'update.section.checkedAt': { ko: '마지막 확인 {time}', en: 'Last checked {time}', ja: '最終確認 {time}', zh: '上次检查 {time}' },
  'update.section.upToDate': { ko: '최신 버전이에요.', en: 'You are on the latest version.', ja: '最新バージョンです。', zh: '已是最新版本。' },
  'update.section.failed': {
    ko: '확인하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요.',
    en: "Couldn't check. Check your internet connection and try again in a moment.",
    ja: '確認できませんでした。インターネット接続を確認して、しばらくしてからもう一度お試しください。',
    zh: '无法检查。请检查网络连接，稍后再试。',
  },
} satisfies Record<string, Entry>
