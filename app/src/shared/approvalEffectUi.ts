// 결재 카드 "결과 한 줄" 중 브라우저·컴퓨터 조작 도구 (electron 없이 테스트한다)
// 이름 표에 있는 도구만 문장으로, 모르는 도구·애매한 입력은 null — 원칙은 approvalEffect.ts와 같다

import { tk, type I18nText } from './i18n/index.ts'
import { BROWSER_TOOL_PREFIX } from './browserTools.ts'
import { COMPUTER_TOOL_PREFIX } from './computerTools.ts'
import { maskSecrets } from './redact.ts'

/** 문장에 그대로 넣는 입력 글자 상한 (넘으면 글자 수만 말한다) */
const TYPED_MAX = 30
/** 화면 요소 설명(모델이 적은 글) 상한 — 넘으면 문장으로 만들지 않는다 */
const ELEMENT_MAX = 40
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/

const short = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.length <= max && !HIDDEN.test(v) ? maskSecrets(v.trim()) : null)
const count = (v: unknown) => (Array.isArray(v) ? v.length : 0)

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.hostname : null
  } catch {
    return null
  }
}

/** 입력할 글자: 짧으면 그대로, 길거나 안 보이는 글자가 있으면 글자 수만 */
function typed(key: 'approval.effect.browserType' | 'approval.effect.computerType', text: unknown, submit = false): I18nText | null {
  if (typeof text !== 'string' || !text) return null
  const shown = short(text, TYPED_MAX)
  const base = shown ? tk(key, { text: shown }) : tk(`${key}Long`, { n: text.length })
  return submit ? tk('approval.effect.thenEnter', { what: base }) : base
}

function browserEffect(name: string, input: Record<string, unknown>): I18nText | null {
  const element = short(input.element, ELEMENT_MAX)
  switch (name) {
    case 'browser_navigate': {
      const host = hostOf(input.url)
      return host ? tk('approval.effect.browserOpen', { host }) : null
    }
    case 'browser_navigate_back':
      return tk('approval.effect.browserBack')
    case 'browser_navigate_forward':
      return tk('approval.effect.browserForward')
    case 'browser_reload':
      return tk('approval.effect.browserReload')
    case 'browser_click':
      return element ? tk('approval.effect.browserClick', { element }) : tk('approval.effect.browserClickSome')
    case 'browser_type':
    case 'browser_press_sequentially':
      return typed('approval.effect.browserType', input.text, input.submit === true)
    case 'browser_fill_form':
      return count(input.fields) ? tk('approval.effect.browserFill', { n: count(input.fields) }) : null
    case 'browser_select_option':
      return tk('approval.effect.browserSelect')
    case 'browser_press_key': {
      const key = short(input.key, 20)
      return key ? tk('approval.effect.pressKey', { key }) : null
    }
    case 'browser_file_upload': {
      const paths = Array.isArray(input.paths) ? input.paths : []
      const first = paths.length ? short(String(paths[0]).split('/').pop(), 80) : null
      return first ? tk('approval.effect.browserUpload', { name: first, n: paths.length }) : null
    }
    case 'browser_tabs':
      return input.action === 'new' ? tk('approval.effect.tabNew') : input.action === 'close' ? tk('approval.effect.tabClose') : input.action === 'select' ? tk('approval.effect.tabSelect') : null
    case 'browser_handle_dialog':
      return tk(input.accept === false ? 'approval.effect.dialogDismiss' : 'approval.effect.dialogAccept')
    case 'browser_evaluate':
    case 'browser_run_code':
      return tk('approval.effect.unknown.pageCode')
    default:
      return null
  }
}

const CLICKS = new Set(['left_click', 'right_click', 'middle_click', 'double_click', 'triple_click'])

function computerEffect(input: Record<string, unknown>): I18nText | null {
  const action = input.action
  const c = input.coordinate
  const at = Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number' ? { x: c[0], y: c[1] } : null
  if (typeof action !== 'string') return null
  if (CLICKS.has(action)) return at ? tk('approval.effect.computerClick', at) : tk('approval.effect.computerClickHere')
  switch (action) {
    case 'type':
      return typed('approval.effect.computerType', input.text)
    case 'key': {
      const key = short(input.text, 30)
      return key ? tk('approval.effect.pressKey', { key }) : null
    }
    case 'scroll':
      return tk('approval.effect.computerScroll')
    case 'mouse_move':
      return at ? tk('approval.effect.computerMove', at) : null
    case 'left_click_drag':
      return tk('approval.effect.computerDrag')
    default:
      return null
  }
}

/** 브라우저·컴퓨터 조작 도구의 효과 문장. 이 장비의 도구가 아니거나 풀 수 없으면 null */
export function uiEffect(toolName: string, input: Record<string, unknown>): I18nText | null {
  if (toolName.startsWith(BROWSER_TOOL_PREFIX)) return browserEffect(toolName.slice(BROWSER_TOOL_PREFIX.length), input)
  if (toolName === `${COMPUTER_TOOL_PREFIX}computer`) return computerEffect(input)
  return null
}
