// 브라우저 장비(Playwright MCP): 장비 이름과 도구 판정 — 결재·자동결재가 같은 기준을 쓴다 (electron 없이 테스트한다)
// 대표 결정(2026-10-25): 직원 전용 브라우저를 따로 띄운다. 조회는 결재 없이, 이동·클릭·입력·업로드·제출은 결재함으로

/** 장비 목록에 늘 보이는 앱 기본 장비 이름 = 세션 mcpServers 키 (도구 이름은 mcp__office-browser__browser_*) */
export const BROWSER_EQUIPMENT = 'office-browser'
export const BROWSER_TOOL_PREFIX = `mcp__${BROWSER_EQUIPMENT}__`
/** 직원이 대표 말을 받아 브라우저 자동 허용을 켜고 끄는 사무실 도구 — 켜기는 늘 결재함에서 대표가 승인한다 */
export const BROWSER_AUTO_TOOL = 'mcp__office__browser_auto'

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

/**
 * 브라우저 자동 허용(장비 설정 browserAuto)을 켠 직원이 자동결재·자율 진행 중 결재 없이 하는 조작.
 * 대표 결정(2026-11-09): 이동·클릭·입력·게시·전송·파일 올리기까지 허용. 페이지 코드 실행·쿠키·저장소·네트워크 가로채기·파일로 남기기는 계속 기다린다
 */
const AUTO_TOOLS = new Set([
  'browser_navigate',
  'browser_navigate_back',
  'browser_navigate_forward',
  'browser_reload',
  'browser_tabs',
  'browser_click',
  'browser_hover',
  'browser_drag',
  'browser_drop',
  'browser_type',
  'browser_press_key',
  'browser_press_sequentially',
  'browser_keydown',
  'browser_keyup',
  'browser_fill_form',
  'browser_select_option',
  'browser_check',
  'browser_uncheck',
  'browser_file_upload',
  'browser_handle_dialog',
  'browser_mouse_click_xy',
  'browser_mouse_down',
  'browser_mouse_up',
  'browser_mouse_move_xy',
  'browser_mouse_drag_xy',
  'browser_mouse_wheel',
  'browser_find',
  'browser_highlight',
  'browser_hide_highlight',
])

/** 로그인·결제 칸 이름 — 여기에 입력하면 자동 허용 중에도 대표를 기다린다 (대표 결정 2026-11-09) */
const SECRET_FIELD =
  /pass(word|wd|code)|\bpass\b|비밀\s*번호|비번|암호|\bpin\b|\botp\b|인증\s*번호|보안\s*코드|card|카드|\bcvc\b|\bcvv\b|security code|expir|유효\s*기간|계좌|account number|iban|routing|결제|payment|billing|credit|신용|주민|ssn|social security|パスワード|暗証|カード|口座|決済|密码|口令|银行卡|卡号|账号|支付|验证码/i
/** 카드번호처럼 보이는 값 (숫자 13~19자리, 빈칸·- 허용) */
const CARD_NUMBER = /(?:\d[ -]?){12,18}\d/

const fieldText = (v: unknown) => (typeof v === 'string' ? v : '')

/** 이 조작이 로그인·결제 칸에 값을 넣는가 (칸 이름 또는 넣는 값으로 가려낸다) */
export function isSecretBrowserInput(name: string, input: Record<string, unknown>): boolean {
  if (name === 'browser_fill_form') {
    const fields = Array.isArray(input.fields) ? (input.fields as Record<string, unknown>[]) : []
    return fields.some((f) => SECRET_FIELD.test(`${fieldText(f?.name)} ${fieldText(f?.type)}`) || CARD_NUMBER.test(fieldText(f?.value)))
  }
  if (name === 'browser_type' || name === 'browser_press_sequentially' || name === 'browser_select_option') {
    const values = Array.isArray(input.values) ? input.values.map(fieldText).join(' ') : ''
    return SECRET_FIELD.test(`${fieldText(input.element)} ${fieldText(input.ref)}`) || CARD_NUMBER.test(`${fieldText(input.text)} ${values}`)
  }
  return false
}

/**
 * 브라우저 자동 허용을 켠 직원에게 이 조작을 결재 없이 넘겨도 되는가: 'allow' | 'wait', 브라우저 도구가 아니면 null.
 * 조회는 원래 허용, 위 목록의 조작은 로그인·결제 칸 입력만 빼고 허용, 나머지(모르는 새 도구 포함)는 기다린다
 */
export function browserAutoVerdict(tool: string, input: Record<string, unknown>): 'allow' | 'wait' | null {
  const base = browserVerdict(tool, input)
  if (base !== 'wait') return base
  const name = tool.slice(BROWSER_TOOL_PREFIX.length)
  if (!AUTO_TOOLS.has(name)) return 'wait'
  return isSecretBrowserInput(name, input) ? 'wait' : 'allow'
}
