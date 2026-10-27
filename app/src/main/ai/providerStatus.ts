import { spawn, type ChildProcessByStdio } from 'node:child_process'
import fs from 'node:fs'
import type { Readable, Writable } from 'node:stream'
import type { ProviderStatus } from '../../shared/types'

// 공급자 감지: electron 없이 돌아가도록 실행 파일 경로는 호출하는 쪽에서 넘긴다 (단위 테스트·번들 시험에서 그대로 쓴다)

const CODEX_TIMEOUT_MS = 15_000

const blank = (state: ProviderStatus['state'], error = ''): ProviderStatus => ({ state, account: '', authMethod: '', plan: '', models: [], defaultModel: '', error })

/** 실행 자체가 실패했는지 — 못 띄움(ENOENT·EACCES·EBADARCH 등)·시간 초과·출력 해석 불가. 숫자 종료 코드(로그아웃이 1로 끝나는 경우)는 아니다 */
export function isRunFailure(e: unknown): boolean {
  if (e instanceof SyntaxError) return true
  const x = e as { code?: unknown; killed?: boolean; signal?: unknown } | null
  return typeof x?.code === 'string' || Boolean(x?.killed) || Boolean(x?.signal)
}

/** `claude auth status` 의 JSON → 상태. 실행 파일이 없으면 'missing', 실행 실패(isBroken)는 'broken', 그 밖의 확인 실패는 로그아웃으로 본다 */
export function classifyClaude(binaryExists: boolean, statusJson: unknown, error = '', isBroken = false): ProviderStatus {
  if (!binaryExists) return blank('missing', error)
  if (isBroken) return blank('broken', error)
  const s = (statusJson ?? {}) as { loggedIn?: boolean; email?: string; authMethod?: string; subscriptionType?: string }
  if (!s.loggedIn) return blank('loggedOut', error)
  return { ...blank('ready'), account: s.email ?? '', authMethod: s.authMethod ?? '', plan: s.subscriptionType ?? '' }
}

interface CodexAccountResult {
  account?: { type?: string; email?: string | null; planType?: string } | null
  requiresOpenaiAuth?: boolean
}
interface CodexModelResult {
  data?: { id?: string; model?: string; hidden?: boolean; isDefault?: boolean }[]
}

/** account/read + model/list 응답 → 상태.
 * 계정이 없고 OpenAI 로그인이 필요하면 로그아웃. 모델은 숨김 제외, 기본 모델(isDefault) 우선으로 고른다 */
export function classifyCodex(account: CodexAccountResult | null, models: CodexModelResult | null): ProviderStatus {
  if (!account) return blank('loggedOut', '계정 정보를 읽지 못했습니다')
  const a = account.account
  if (!a) return blank('loggedOut')
  const list = (models?.data ?? []).filter((m) => !m.hidden && (m.model || m.id))
  const ids = list.map((m) => (m.model ?? m.id) as string)
  const def = list.find((m) => m.isDefault) ?? list[0]
  return {
    state: 'ready',
    account: a.email ?? '',
    authMethod: a.type ?? '',
    plan: a.planType ?? '',
    models: ids,
    defaultModel: def ? ((def.model ?? def.id) as string) : '',
    error: '',
  }
}

/** 이번 확인 결과가 '확인 못 함'이면 직전 상태를 그대로 쓴다 (직전 상태가 없으면 '확인 못 함' 그대로) */
export function keepPrevOnUnknown(prev: ProviderStatus | null | undefined, next: ProviderStatus): ProviderStatus {
  return next.state === 'unknown' && prev ? prev : next
}

/** Codex app-server를 stdio로 띄워 account/read, model/list를 읽고 바로 끝낸다 */
export function probeCodex(binary: string, timeoutMs = CODEX_TIMEOUT_MS): Promise<ProviderStatus> {
  if (!fs.existsSync(binary)) return Promise.resolve(blank('missing'))
  return new Promise((resolve) => {
    let child: ChildProcessByStdio<Writable, Readable, null>
    try {
      child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    } catch (e) {
      // 다른 CPU용 실행 파일(EBADARCH) 등은 error 이벤트가 아니라 바로 던져진다
      resolve(blank('broken', e instanceof Error ? e.message : String(e)))
      return
    }
    let done = false
    let buf = ''
    let nextId = 0
    const pending = new Map<number, (r: unknown) => void>()
    const finish = (s: ProviderStatus) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      resolve(s)
    }
    // 시간 초과는 실행 오류가 아니다 (느린 네트워크 등) — '확인 못 함'으로 두고 부르는 쪽이 직전 상태를 유지한다
    const timer = setTimeout(() => finish(blank('unknown', 'Codex 응답 시간 초과')), timeoutMs)
    const send = (o: object) => child.stdin.write(`${JSON.stringify(o)}\n`)
    const call = (method: string, params?: object) =>
      new Promise<unknown>((res) => {
        const id = ++nextId
        pending.set(id, res)
        send({ id, method, ...(params ? { params } : {}) })
      })
    child.on('error', (e) => finish(blank('broken', e.message)))
    child.stdin.on('error', () => {}) // 먼저 끝난 프로세스에 쓰는 EPIPE는 exit 처리로 충분하다
    child.on('exit', () => finish(blank('broken', 'Codex가 먼저 종료됐습니다')))
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        try {
          const m = JSON.parse(line) as { id?: number; method?: string; result?: unknown }
          if (m.id !== undefined && !m.method) pending.get(m.id)?.(m.result ?? null)
        } catch {
          /* 로그 줄은 무시 */
        }
      }
    })
    void (async () => {
      await call('initialize', { clientInfo: { name: 'ai-office', title: 'AI Office', version: '0' }, capabilities: { experimentalApi: true } })
      send({ method: 'initialized' })
      const account = (await call('account/read', { refreshToken: false })) as CodexAccountResult | null
      const models = (await call('model/list', {})) as CodexModelResult | null
      finish(classifyCodex(account, models))
    })()
  })
}
