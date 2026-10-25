import { useSyncExternalStore } from 'react'
import { getLang, langFromLocale, onLangChange, resolveLang, setLang, type Lang, type LangSetting } from '@shared/i18n'

// 설정을 받기 전에도 기기 언어로 시작해 한국어가 깜빡이지 않게 한다
setLang(langFromLocale(navigator.language))

/** 설정의 언어 값을 실제 언어로 바꿔 적용한다 (스냅샷을 받을 때마다) */
export const applyLanguage = (setting: LangSetting) => setLang(resolveLang(setting, navigator.language))

/** 지금 언어. 바뀌면 이 훅을 쓰는 컴포넌트가 다시 그려진다 */
export const useLang = (): Lang => useSyncExternalStore(onLangChange, getLang)
