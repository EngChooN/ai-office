import { spawn } from 'node:child_process'

// Claude 로그인: `claude auth login`을 창 없이 띄워 출력에 나온 로그인 주소를 브라우저로 연다.
// 주소를 못 잡으면 터미널 창 방식으로 돌아가도록 'fallback'을 돌려준다. electron 없이 돌도록 브라우저 여는 함수는 호출하는 쪽에서 넘긴다.

/** --claudeai: 구독 계정으로 바로 — 터미널에서 계정 종류를 화살표로 고르는 메뉴가 사라진다 */
export const CLAUDE_LOGIN_ARGS = ['auth', 'login', '--claudeai']
/** 이 시간 안에 주소가 안 나오면 터미널 방식으로 */
export const LOGIN_URL_WAIT_MS = 10_000
/** 브라우저 인증을 기다리는 최대 시간 (로컬 콜백을 받으려면 프로세스가 살아 있어야 한다) */
const LOGIN_TOTAL_MS = 5 * 60_000
const LOGIN_HOSTS = ['claude.ai', 'claude.com', 'anthropic.com']

let active: { cancel: () => void } | null = null

/** 진행 중인 로그인을 끝낸다 (새 로그인 시작·앱 종료 때) */
export const cancelClaudeLogin = () => active?.cancel()

/** CLI 출력에서 로그인 주소를 찾는다 — 글자 색 코드를 지우고, Claude·Anthropic 주소 중 인증(oauth·authorize) 주소만 */
export function extractLoginUrl(output: string): string | null {
  // eslint-disable-next-line no-control-regex -- 터미널 색·커서 코드
  const plain = output.replace(/\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007/g, '')
  for (const raw of plain.match(/https:\/\/[^\s"'<>`]+/g) ?? []) {
    const candidate = raw.replace(/[).,;\]]+$/, '')
    try {
      const url = new URL(candidate)
      const isLoginHost = LOGIN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
      if (isLoginHost && /oauth|authorize/i.test(url.pathname + url.search)) return url.toString()
    } catch {
      /* 주소가 아니면 다음 후보 */
    }
  }
  return null
}

/**
 * 로그인 주소를 브라우저로 연다. 'browser': 주소를 열었다(인증이 끝날 때까지 프로세스를 살려 둔다) ·
 * 'fallback': 주소를 못 잡았다(실행 실패·먼저 종료·시간 초과) — 호출하는 쪽이 터미널 창으로 연다
 */
export function loginClaudeInBrowser(
  binary: string,
  openUrl: (url: string) => Promise<void> | void,
  { args = CLAUDE_LOGIN_ARGS, urlWaitMs = LOGIN_URL_WAIT_MS, totalMs = LOGIN_TOTAL_MS }: { args?: string[]; urlWaitMs?: number; totalMs?: number } = {},
): Promise<'browser' | 'fallback'> {
  cancelClaudeLogin()
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      // 주소가 줄바꿈으로 잘리지 않게 폭을 넓게 준다
      child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, COLUMNS: '1000' } })
    } catch {
      resolve('fallback')
      return
    }
    let isAnswered = false
    let output = ''
    const answer = (result: 'browser' | 'fallback') => {
      if (isAnswered) return
      isAnswered = true
      clearTimeout(urlTimer)
      if (result === 'fallback') stop()
      resolve(result)
    }
    const stop = () => {
      clearTimeout(totalTimer)
      if (active === me) active = null
      child.kill()
    }
    const me = { cancel: () => (isAnswered ? stop() : answer('fallback')) }
    active = me
    const urlTimer = setTimeout(() => answer('fallback'), urlWaitMs)
    const totalTimer = setTimeout(stop, totalMs)
    const onData = (chunk: Buffer) => {
      if (isAnswered) return
      output += chunk.toString('utf8')
      const url = extractLoginUrl(output)
      if (!url) return
      answer('browser')
      void Promise.resolve(openUrl(url)).catch((e) => console.error('[setup] 로그인 주소를 열지 못했습니다:', e))
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.stdin?.on('error', () => {})
    child.on('error', () => answer('fallback'))
    child.on('exit', () => {
      clearTimeout(totalTimer)
      if (active === me) active = null
      answer('fallback')
    })
  })
}
