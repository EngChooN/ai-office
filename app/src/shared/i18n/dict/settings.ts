import type { Entry } from './index.ts'

export default {
  'settings.language.title': { ko: '언어', en: 'Language', ja: '言語', zh: '语言' },
  'settings.language.desc': {
    ko: '앱 화면 언어를 정해요. "기기 언어"는 이 컴퓨터의 언어를 따라가요.',
    en: 'Choose the app language. "System language" follows this computer.',
    ja: 'アプリの表示言語を選びます。「端末の言語」はこのパソコンの言語に合わせます。',
    zh: '选择应用界面语言。“跟随系统”会使用这台电脑的语言。',
  },
  'settings.language.auto': { ko: '기기 언어 따르기', en: 'System language', ja: '端末の言語', zh: '跟随系统' },
  'settings.language.label': { ko: '앱 언어', en: 'App language', ja: 'アプリの言語', zh: '应用语言' },
} satisfies Record<string, Entry>
