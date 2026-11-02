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

export type LoginResult = 'browser' | 'fallback' | 'cancelled'

let active: { cancel: () => void } | null = null

/** 진행 중인 로그인을 끝낸다 (새 로그인 시작·앱 종료 때) */
export const cancelClaudeLogin = () => active?.cancel()

/** 주소 뒤에 이 글자가 오면 주소가 끝까지 들어온 것이다 */
const URL_CHARS = String.raw`[^\s"'<>\x60]+`
/** 주소 뒤 구분 글자가 안 오면(출력이 주소에서 끊김) 이만큼 더 기다린 뒤 들어온 데까지로 연다 — 인증에 꼭 필요한 값이 다 있을 때만 */
export const LOGIN_URL_SETTLE_MS = 300
/** 인증 주소에 꼭 있어야 하는 값 — 하나라도 없으면 쿼리가 아직 덜 들어온 주소다 */
const REQUIRED_OAUTH_PARAMS = ['client_id', 'redirect_uri', 'state']

/** 구분 글자 없이 끝난 주소도 열어도 되는지 — 인증에 필요한 값이 모두 들어왔는지 본다 */
export function isCompleteOAuthUrl(url: string): boolean {
  const params = new URL(url).searchParams
  return REQUIRED_OAUTH_PARAMS.every((key) => !!params.get(key))
}

/**
 * CLI 출력에서 로그인 주소를 찾는다 — 글자 색 코드를 지우고, Claude·Anthropic 주소 중 인증(oauth·authorize) 주소만.
 * isCompleteOnly: 주소 뒤에 공백·줄바꿈 등이 따라온 것(끝까지 들어온 주소)만 — 출력이 조각나 들어올 때 앞 조각으로 확정하지 않게
 */
export function extractLoginUrl(output: string, { isCompleteOnly = false }: { isCompleteOnly?: boolean } = {}): string | null {
  // eslint-disable-next-line no-control-regex -- 터미널 색·커서 코드
  const plain = output.replace(/\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007/g, '')
  const pattern = new RegExp(`https://${URL_CHARS}${isCompleteOnly ? `(?=[\\s"'<>\x60])` : ''}`, 'g')
  for (const raw of plain.match(pattern) ?? []) {
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
 * 'fallback': 주소를 못 잡았거나 브라우저를 못 열었다(실행 실패·먼저 종료·시간 초과·열기 실패) — 호출하는 쪽이 터미널 창으로 연다 ·
 * 'cancelled': 새 로그인 시작·앱 종료로 취소됐다 — 아무것도 하지 않는다
 */
export function loginClaudeInBrowser(
  binary: string,
  openUrl: (url: string) => Promise<void> | void,
  {
    args = CLAUDE_LOGIN_ARGS,
    urlWaitMs = LOGIN_URL_WAIT_MS,
    settleMs = LOGIN_URL_SETTLE_MS,
    totalMs = LOGIN_TOTAL_MS,
  }: { args?: string[]; urlWaitMs?: number; settleMs?: number; totalMs?: number } = {},
): Promise<LoginResult> {
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
    /** 주소를 찾아 브라우저를 여는 중 — 더 들어오는 출력은 보지 않는다 */
    let isOpening = false
    let output = ''
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    const answer = (result: LoginResult) => {
      if (isAnswered) return
      isAnswered = true
      clearTimeout(urlTimer)
      clearTimeout(settleTimer)
      if (result !== 'browser') stop()
      resolve(result)
    }
    const stop = () => {
      clearTimeout(totalTimer)
      if (active === me) active = null
      child.kill()
    }
    const me = { cancel: () => (isAnswered ? stop() : answer('cancelled')) }
    active = me
    const urlTimer = setTimeout(() => answer('fallback'), urlWaitMs)
    const totalTimer = setTimeout(stop, totalMs)
    /** 브라우저가 열린 뒤에야 'browser'로 확정한다 — 열기에 실패하면 프로세스를 정리하고 터미널 방식으로 */
    const open = (url: string) => {
      if (isOpening || isAnswered) return
      isOpening = true
      clearTimeout(urlTimer)
      clearTimeout(settleTimer)
      Promise.resolve()
        .then(() => openUrl(url))
        .then(
          () => answer('browser'),
          (e) => {
            console.error('[setup] 로그인 주소를 열지 못했습니다:', e)
            answer('fallback')
          },
        )
    }
    const onData = (chunk: Buffer) => {
      if (isAnswered || isOpening) return
      output += chunk.toString('utf8')
      const url = extractLoginUrl(output, { isCompleteOnly: true })
      if (url) return open(url)
      // 주소가 출력 끝에서 끊겼을 수 있다 — 나머지 조각을 잠깐 기다렸다가, 필요한 값이 다 들어왔으면 연다.
      // 덜 들어왔으면 계속 기다리고, 끝내 안 오면 urlTimer가 터미널 방식으로 넘긴다
      clearTimeout(settleTimer)
      if (extractLoginUrl(output)) settleTimer = setTimeout(() => {
        const partial = extractLoginUrl(output)
        if (partial && isCompleteOAuthUrl(partial)) open(partial)
      }, settleMs)
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
