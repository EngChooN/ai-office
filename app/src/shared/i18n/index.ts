/**
 * 다국어(ko·en·ja·zh) — 외부 라이브러리 없는 가벼운 t(key, vars).
 * main·renderer가 같이 쓴다. 사전은 `dict/*.ts`(영역별 파일, 키마다 4개 언어)에 있고, 한국어가 기준이다.
 * 빠진 번역은 영어 → 한국어 → 키 이름 순으로 대신 보여 준다.
 * 언어 설정은 `Settings.language`('auto' | 'ko' | 'en' | 'ja' | 'zh')에 저장한다. 'auto'면 기기 언어를 따르고, 지원하지 않으면 영어.
 */
import { DICT, type TKey } from './dict/index.ts'

export const LANGS = ['ko', 'en', 'ja', 'zh'] as const
export type Lang = (typeof LANGS)[number]
/** 설정에 저장하는 값 */
export type LangSetting = Lang | 'auto'
export type { TKey }

/** 언어 선택 상자에 보일 이름 (각 언어의 자기 이름 — 번역하지 않는다) */
export const LANG_NAMES: Record<Lang, string> = { ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文' }

/** 기기 언어 코드(예: 'ja-JP', 'zh-Hans-CN', 'ko')를 지원 언어로. 지원하지 않으면 영어 */
export function langFromLocale(locale: string | undefined | null): Lang {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0]
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : 'en'
}

/** 설정값 + 기기 언어 → 실제로 쓸 언어 (main은 app.getLocale(), renderer는 navigator.language를 넘긴다) */
export function resolveLang(setting: LangSetting | undefined, systemLocale: string | undefined | null): Lang {
  return setting && setting !== 'auto' && (LANGS as readonly string[]).includes(setting) ? setting : langFromLocale(systemLocale)
}

/** Intl에 넘길 로케일 */
export const INTL_LOCALE: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }

let current: Lang = 'ko'
const listeners = new Set<() => void>()

export const getLang = (): Lang => current
export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  listeners.forEach((l) => l())
}
/** 언어가 바뀔 때 부른다. 반환값으로 해제 */
export function onLangChange(l: () => void) {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export type TVars = Record<string, string | number>

/** `{name}` 자리를 vars 값으로 채운다 */
export function fill(text: string, vars?: TVars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text
}

/** 현재 언어로 번역. 언어를 직접 주면(예: 직원 안내문) 그 언어로 */
export function t(key: TKey, vars?: TVars, lang: Lang = current): string {
  const e = DICT[key] as Record<Lang, string> | undefined
  return fill(e?.[lang] || e?.en || e?.ko || key, vars)
}

/** 숫자 표기 (1,234.5) */
export const fmtNumber = (n: number, lang: Lang = current) => new Intl.NumberFormat(INTL_LOCALE[lang]).format(n)
/** 날짜·시간 표기. 옵션은 Intl.DateTimeFormat 그대로 */
export const fmtDate = (d: number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }, lang: Lang = current) =>
  new Intl.DateTimeFormat(INTL_LOCALE[lang], opts).format(d)

/** 키를 코드로 만들어 쓰는 곳(가구 이름처럼 id가 키 일부)용. 사전에 없으면 fallback(저장된 원문)을 보여 준다 */
export function tx(key: string, fallback: string, vars?: TVars, lang: Lang = current): string {
  const e = (DICT as Record<string, Record<Lang, string> | undefined>)[key]
  return fill(e?.[lang] || fallback, vars)
}

/** 저장해 두고 보일 때 번역하는 글 = 사전 키 + 인자. 인자 안에 또 번역할 글·목록을 넣을 수 있다 (이름·사용자 입력은 그냥 글자로) */
export interface I18nText {
  key: string
  params?: Record<string, I18nArg>
  /** 키가 사전에 없을 때 보일 원문 (가구 이름처럼 키를 id로 만든 경우) */
  fallback?: string
}
export type I18nArg = string | number | I18nText | { list: I18nArg[]; sep: string }

/** 저장할 번역 문구 만들기 (키 오타는 타입이 잡는다) */
export const tk = (key: TKey, params?: Record<string, I18nArg>): I18nText => (params ? { key, params } : { key })

/** 저장된 I18nText를 지금 언어(또는 준 언어)로 */
export function tr(v: I18nArg, lang: Lang = current): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if ('list' in v) return v.list.map((x) => tr(x, lang)).join(v.sep)
  const vars = v.params && Object.fromEntries(Object.entries(v.params).map(([k, x]) => [k, tr(x, lang)]))
  return v.fallback === undefined ? t(v.key as TKey, vars, lang) : tx(v.key, v.fallback, vars, lang)
}

/** 번역할 글이 저장돼 있으면 지금 언어로, 없으면(예전 기록) 저장된 글자 그대로 */
export const trOr = (v: I18nArg | undefined, text: string, lang: Lang = current) => (v === undefined ? text : tr(v, lang))
