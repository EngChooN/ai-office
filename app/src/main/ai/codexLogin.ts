import { spawn, type ChildProcessByStdio } from 'node:child_process'
import fs from 'node:fs'
import type { Readable, Writable } from 'node:stream'

// Codex ChatGPT 로그인: app-server가 로컬 콜백 서버를 열어 두므로, 브라우저 인증이 끝날 때까지 프로세스를 살려 둔다.
// electron 없이 돌도록 브라우저 여는 함수는 호출하는 쪽에서 넘긴다.

const LOGIN_TIMEOUT_MS = 5 * 60_000
let active: { cancel: () => void } | null = null

/** 진행 중인 로그인을 취소한다 (새 로그인 시작·앱 종료 때) */
export const cancelCodexLogin = () => active?.cancel()

/** 로그인 결과: 성공이면 '', 실패면 사용자에게 보일 사유 */
export function loginCodex(binary: string, openUrl: (url: string) => Promise<void> | void, timeoutMs = LOGIN_TIMEOUT_MS): Promise<string> {
  cancelCodexLogin()
  if (!fs.existsSync(binary)) return Promise.resolve('Codex 실행 파일을 찾지 못했습니다')
  return new Promise((resolve) => {
    let child: ChildProcessByStdio<Writable, Readable, null>
    try {
      child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    } catch (e) {
      resolve(e instanceof Error ? e.message : String(e))
      return
    }
    let done = false
    let buf = ''
    let nextId = 0
    let loginId: string | null = null
    const pending = new Map<number, (r: { result?: unknown; error?: { message?: string } }) => void>()
    const me = { cancel: () => finish('로그인이 취소됐습니다') }
    const finish = (err: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (active === me) active = null
      child.kill()
      resolve(err)
    }
    active = me
    const timer = setTimeout(() => finish('로그인 시간이 초과됐습니다. 다시 시도해 주세요'), timeoutMs)
    const send = (o: object) => child.stdin.write(`${JSON.stringify(o)}\n`)
    const call = (method: string, params?: object) =>
      new Promise<{ result?: unknown; error?: { message?: string } }>((res) => {
        const id = ++nextId
        pending.set(id, res)
        send({ id, method, ...(params ? { params } : {}) })
      })
    child.on('error', (e) => finish(e.message))
    child.stdin.on('error', () => {})
    child.on('exit', () => finish('Codex가 먼저 종료됐습니다'))
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        try {
          const m = JSON.parse(line) as { id?: number; method?: string; result?: unknown; error?: { message?: string }; params?: { loginId?: string | null; success?: boolean; error?: string | null; authMode?: string | null } }
          if (m.id !== undefined && !m.method) pending.get(m.id)?.(m)
          // 로그인 상태가 바뀌었다는 알림 — 인증 방식이 생겼으면 성공 (완료 알림보다 먼저 올 수 있다)
          else if (m.method === 'account/updated' && loginId !== null && m.params?.authMode) finish('')
          else if (m.method === 'account/login/completed' && (!loginId || !m.params?.loginId || m.params.loginId === loginId)) {
            finish(m.params?.success ? '' : (m.params?.error ?? '로그인에 실패했습니다'))
          }
        } catch {
          /* 로그 줄은 무시 */
        }
      }
    })
    void (async () => {
      await call('initialize', { clientInfo: { name: 'ai-office', title: 'AI Office', version: '0' }, capabilities: { experimentalApi: true } })
      send({ method: 'initialized' })
      const r = await call('account/login/start', { type: 'chatgpt' })
      const res = r.result as { loginId?: string; authUrl?: string } | undefined
      if (!res?.authUrl) return finish(r.error?.message ?? '로그인 주소를 받지 못했습니다')
      loginId = res.loginId ?? null
      try {
        await openUrl(res.authUrl)
      } catch (e) {
        finish(e instanceof Error ? e.message : String(e))
      }
    })()
  })
}
