// 컴퓨터 조작 장비(computer-use-mcp): 장비 이름과 도구 판정 — 결재·자동결재가 같은 기준을 쓴다 (electron 없이 테스트한다)
// 마우스·키보드로 대표 화면 전체를 다루므로 화면 보기(스크린샷·커서 위치)만 결재 없이, 이동·클릭·입력·스크롤은 결재함으로

import { t, tr, type I18nArg } from './i18n/index.ts'

/** 장비 목록에 늘 보이는 앱 기본 장비 이름 = 세션 mcpServers 키 (도구 이름은 mcp__office-computer__computer) */
export const COMPUTER_EQUIPMENT = 'office-computer'
export const COMPUTER_TOOL_PREFIX = `mcp__${COMPUTER_EQUIPMENT}__`

/** 도구 하나(computer)에 action으로 동작을 고른다 — 화면을 바꾸지 않고 보기만 하는 action */
const READ_ACTIONS = new Set(['get_screenshot', 'get_cursor_position'])

/**
 * 컴퓨터 조작 도구 판정: 'allow' = 결재 없이, 'wait' = 결재함(자동결재 중에도 대표를 기다린다), null = 이 장비의 도구가 아님.
 * action이 없거나 모르는 값(새 버전에서 생긴 것)은 기다린다
 */
export function computerVerdict(tool: string, input: Record<string, unknown>): 'allow' | 'wait' | null {
  if (!tool.startsWith(COMPUTER_TOOL_PREFIX)) return null
  const name = tool.slice(COMPUTER_TOOL_PREFIX.length)
  return name === 'computer' && typeof input.action === 'string' && READ_ACTIONS.has(input.action) ? 'allow' : 'wait'
}

/** 결재 카드에 보일 도구 이름 — 컴퓨터 조작 도구는 "컴퓨터 조작", 나머지는 그대로 */
export function toolDisplayName(tool: string): string {
  return tool.startsWith(COMPUTER_TOOL_PREFIX) ? t('computer.tool') : tool
}

const ACTION_KEYS = new Set(['left_click', 'right_click', 'middle_click', 'double_click', 'triple_click', 'left_click_drag', 'mouse_move', 'type', 'key', 'scroll', 'get_screenshot', 'get_cursor_position'])
const TEXT_MAX = 60

/** 컴퓨터 조작 요약을 키+인자로 — 저장해 두고 화면 언어로 그때 번역한다 (action 이름만 번역, 좌표·입력 글자는 그대로). 이 장비의 도구가 아니면 null */
export function computerSummaryI18n(tool: string, input: Record<string, unknown>): I18nArg | null {
  if (!tool.startsWith(COMPUTER_TOOL_PREFIX)) return null
  const action = typeof input.action === 'string' ? input.action : ''
  const label: I18nArg = ACTION_KEYS.has(action) ? { key: `computer.action.${action}` } : action || { key: 'computer.tool' }
  const c = input.coordinate
  const at = Array.isArray(c) && c.length >= 2 && c.every((n) => typeof n === 'number') ? ` (${c[0]}, ${c[1]})` : ''
  const dir = typeof input.scroll_direction === 'string' ? ` ${input.scroll_direction}` : ''
  const text = typeof input.text === 'string' && input.text ? `: "${input.text.length > TEXT_MAX ? `${input.text.slice(0, TEXT_MAX)}…` : input.text}"` : ''
  const rest = `${dir}${at}${text}`
  return rest ? { list: [label, rest], sep: '' } : label
}

/** 컴퓨터 조작 도구 입력을 지금 언어의 쉬운 말로: "클릭 (20, 12)" · "글자 입력: \"hello\"". 이 장비의 도구가 아니면 null */
export function computerSummary(tool: string, input: Record<string, unknown>): string | null {
  const v = computerSummaryI18n(tool, input)
  return v === null ? null : tr(v)
}
