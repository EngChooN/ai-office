// 화면 ↔ 안드로이드 셸 메시지 통로 (계약: docs/specs/android-bridge.md)
// 화면 → 셸: OfficeBridge.postMessage(JSON 문자열) · 셸 → 화면: OfficeBridge.onmessage (e.data = JSON 문자열)
// DOM·React를 쓰지 않는다 — scripts/mobile.test.mts가 가짜 통로로 그대로 돌린다

export interface BridgePort {
  postMessage(text: string): void
  onmessage: ((e: { data: string }) => void) | null
}

/** 셸이 돌려주는 실패 (status 0 = PC 응답을 못 받음) */
export interface BridgeError {
  status: number
  code: string
  message: string
  alternative?: string
  /** 422 blocked일 때 막힌 이유 (out_of_bounds·overlap·blocks_path 등, 새 셸만 넘긴다) */
  reason?: string
}

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed'

export type ShellMessage =
  | { type: 'hello'; platform: string; appVersion: string; protocol: number; isTablet: boolean }
  | { type: 'result'; id: string; ok: true; result: unknown }
  | { type: 'result'; id: string; ok: false; error: BridgeError }
  | { type: 'event'; name: string; data: unknown }
  | { type: 'resync' }
  | { type: 'connection'; state: ConnectionState; reason?: string }
  | { type: 'back' }
  /** 키보드가 WebView 아래를 가리는 높이(CSS px, 0 = 닫힘). ready에 features:['ime']를 보낸 화면에만 온다 (셸은 WebView를 줄이지 않는다) */
  | { type: 'insets'; ime: number }

/** id가 붙는 요청 (셸이 꼭 한 번 result로 답한다) */
export type BridgeRequest =
  | { type: 'call'; method: string; args: unknown[]; confirm?: boolean }
  | { type: 'upload'; name: string; mime: string; base64: string }
  | { type: 'download'; fileId: string; name: string }

/** 답이 없는 알림 */
export type BridgeNotice = { type: 'ready'; features?: string[] } | { type: 'backResult'; handled: boolean }

/** 셸 응답을 기다리는 시간: PC 처리 상한 120초 + 여유 */
export const BRIDGE_TIMEOUT_MS = 130_000

const TYPES = new Set(['hello', 'result', 'event', 'resync', 'connection', 'back', 'insets'])

/** 셸이 보낸 문자열을 읽는다. 모양이 틀리거나 모르는 종류면 null (버린다) */
export function parseShellMessage(text: unknown): ShellMessage | null {
  if (typeof text !== 'string') return null
  let msg: unknown
  try {
    msg = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof msg !== 'object' || msg === null || !TYPES.has((msg as { type?: string }).type ?? '')) return null
  const m = msg as Record<string, unknown>
  if (m.type === 'result' && (typeof m.id !== 'string' || typeof m.ok !== 'boolean')) return null
  if (m.type === 'result' && m.ok === false && (typeof m.error !== 'object' || m.error === null)) return null
  if (m.type === 'event' && typeof m.name !== 'string') return null
  if (m.type === 'insets' && !(typeof m.ime === 'number' && Number.isFinite(m.ime) && m.ime >= 0)) return null
  return msg as ShellMessage
}

export interface Bridge {
  request(msg: BridgeRequest): Promise<unknown>
  notify(msg: BridgeNotice): void
  on(handler: (msg: ShellMessage) => void): () => void
}

export function createBridge(port: BridgePort, { timeoutMs = BRIDGE_TIMEOUT_MS } = {}): Bridge {
  let seq = 0
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: BridgeError) => void; timer: ReturnType<typeof setTimeout> }>()
  const handlers = new Set<(msg: ShellMessage) => void>()

  port.onmessage = (e) => {
    const msg = parseShellMessage(e?.data)
    if (!msg) return
    if (msg.type === 'result') {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.ok) p.resolve(msg.result)
      else p.reject({ status: Number(msg.error.status) || 0, code: String(msg.error.code ?? 'app_error'), message: String(msg.error.message ?? ''), ...(msg.error.alternative ? { alternative: String(msg.error.alternative) } : {}) })
      return
    }
    for (const h of [...handlers]) h(msg)
  }

  return {
    request(msg) {
      const id = `w${++seq}`
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject({ status: 0, code: 'bridge_timeout', message: '휴대폰 앱이 답하지 않아요. 잠시 뒤에 다시 시도하세요' })
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        port.postMessage(JSON.stringify({ ...msg, id }))
      })
    },
    notify(msg) {
      port.postMessage(JSON.stringify(msg))
    },
    on(handler) {
      handlers.add(handler)
      return () => void handlers.delete(handler)
    },
  }
}
