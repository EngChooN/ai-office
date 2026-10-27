// 컴퓨터 조작 장비(computer-use-mcp): 장비 이름과 도구 판정 — 결재·자동결재가 같은 기준을 쓴다 (electron 없이 테스트한다)
// 마우스·키보드로 대표 화면 전체를 다루므로 화면 보기(스크린샷·커서 위치)만 결재 없이, 이동·클릭·입력·스크롤은 결재함으로

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
