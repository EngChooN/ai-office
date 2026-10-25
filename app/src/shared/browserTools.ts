// 브라우저 장비(Playwright MCP): 장비 이름과 도구 판정 — 결재·자동결재가 같은 기준을 쓴다 (electron 없이 테스트한다)
// 대표 결정(2026-10-25): 직원 전용 브라우저를 따로 띄운다. 조회는 결재 없이, 이동·클릭·입력·업로드·제출은 결재함으로

/** 장비 목록에 늘 보이는 앱 기본 장비 이름 = 세션 mcpServers 키 (도구 이름은 mcp__office-browser__browser_*) */
export const BROWSER_EQUIPMENT = 'office-browser'
export const BROWSER_TOOL_PREFIX = `mcp__${BROWSER_EQUIPMENT}__`

/** 화면을 바꾸지 않고 보기만 하는 도구 — 결재 없이 허용 */
const READ_TOOLS = new Set([
  'browser_snapshot',
  'browser_take_screenshot',
  'browser_console_messages',
  'browser_network_requests',
  'browser_wait_for',
  'browser_generate_locator',
  'browser_resize',
  'browser_close',
])

/**
 * 브라우저 도구 판정: 'allow' = 결재 없이, 'wait' = 결재함(자동결재 중에도 대표를 기다린다), null = 브라우저 도구가 아님.
 * 모르는 도구(새 버전에서 생긴 것)는 기다린다
 */
export function browserVerdict(tool: string, input: Record<string, unknown>): 'allow' | 'wait' | null {
  if (!tool.startsWith(BROWSER_TOOL_PREFIX)) return null
  const name = tool.slice(BROWSER_TOOL_PREFIX.length)
  if (READ_TOOLS.has(name) || name.startsWith('browser_verify_')) return 'allow'
  // 탭은 목록 보기만 조회 — 새 탭·닫기·고르기는 이동과 같다
  if (name === 'browser_tabs') return input.action === 'list' ? 'allow' : 'wait'
  return 'wait'
}
