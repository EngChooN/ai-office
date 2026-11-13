// A컴이 B컴 v2 서버에 붙는 클라이언트 (설계서 0·4절): /v2/events SSE 한 개를 유지하고 끊기면 다시 붙는다
// 네트워크(HTTPS·인증서 고정)는 밖에서 넣어 준다(OpenStream) — 상태·재연결·SSE 해석만 이 파일이 맡아 테스트가 가짜 스트림을 넣을 수 있다

import { PEER_LIMITS, type PeerLinkState } from '../../shared/peerProtocol.ts'

/** SSE 본문 해석기: 조각을 먹이면 완성된 이벤트를 하나씩 내보낸다 (retry는 무시, 이벤트 이름이 없으면 message). 주석 줄(: keep-alive)은 onComment로만 알린다 */
export class SseParser {
  private buf = ''
  private ev = { event: '', data: [] as string[], id: undefined as string | undefined }

  feed(chunk: string, emit: (e: { event: string; data: string; id?: string }) => void, onComment?: () => void) {
    this.buf += chunk
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '')
      this.buf = this.buf.slice(i + 1)
      if (line === '') {
        if (this.ev.data.length) emit({ event: this.ev.event || 'message', data: this.ev.data.join('\n'), ...(this.ev.id !== undefined ? { id: this.ev.id } : {}) })
        this.ev = { event: '', data: [], id: undefined }
      } else if (line.startsWith(':')) {
        onComment?.()
      } else {
        const c = line.indexOf(':')
        const field = c < 0 ? line : line.slice(0, c)
        const value = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '')
        if (field === 'event') this.ev.event = value
        else if (field === 'data') this.ev.data.push(value)
        else if (field === 'id') this.ev.id = value
      }
    }
    // 이벤트 하나가 끝없이 길어지는 것을 막는다 (16MB)
    if (this.buf.length > 16 * 1024 * 1024) this.buf = ''
  }
}

export interface StreamHandlers {
  /** 응답 헤더를 받았다 (status가 200이 아니면 곧 onClose가 온다) */
  onOpen(status: number): void
  onEvent(name: string, data: string, id?: string): void
  /** 서버 하트비트(주석 줄) — 이벤트가 없어도 연결이 살아 있다는 신호 (화면 보기 권한 없는 열쇠는 hello 뒤로 이것만 온다) */
  onAlive?(): void
  /** 끝났다 — code: 네트워크 오류 코드, status: 200이 아닌 응답 상태 */
  onClose(info: { status?: number; code?: string }): void
}
export interface StreamHandle {
  close(): void
}
export type OpenStream = (path: string, headers: Record<string, string>, h: StreamHandlers) => StreamHandle

export interface PeerClientOptions {
  peerId: string
  openStream: OpenStream
  /** 이벤트 (hello 포함) — data는 JSON을 풀어 준다 (못 풀면 문자열) */
  onEvent(name: string, data: unknown): void
  onState(state: PeerLinkState): void
  /** 다시 붙을 때마다 (hello 직후) — 큐 비우기·미완료 일 조회·결재 대조 */
  onOnline?(hello: Record<string, unknown>): void
  retryMs?: readonly number[]
  offlineAfterMs?: number
  /** 이 시간 동안 아무 것도 못 받으면 끊고 다시 붙는다 (하트비트 15초 → 35초) */
  idleMs?: number
  random?(): number
}

const NO_RETRY_STATUS = new Set([401, 403, 426])

export class PeerClient {
  private o: PeerClientOptions
  private link: PeerLinkState = 'connecting'
  private handle: StreamHandle | null = null
  private attempt = 0
  private lastEventId: string | undefined
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private offlineTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private isRunning = false
  private byeReason: string | null = null
  private generation = 0

  constructor(o: PeerClientOptions) {
    this.o = o
  }

  get state() {
    return this.link
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.setState('connecting')
    this.connect()
  }

  stop() {
    this.isRunning = false
    this.generation++
    this.clearTimers()
    this.handle?.close()
    this.handle = null
  }

  /** 지금 바로 다시 붙어 본다 (오프라인에서 사용자가 "다시 연결"을 눌렀을 때) */
  retryNow() {
    if (!this.isRunning || this.link === 'online' || this.link === 'unpaired') return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.handle?.close()
    this.connect()
  }

  private setState(next: PeerLinkState) {
    if (this.link === next) return
    this.link = next
    this.o.onState(next)
  }

  private clearTimers() {
    for (const t of [this.retryTimer, this.offlineTimer, this.idleTimer]) if (t) clearTimeout(t)
    this.retryTimer = this.offlineTimer = this.idleTimer = null
  }

  private touchIdle(gen: number) {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (gen === this.generation) this.handle?.close()
    }, this.o.idleMs ?? 35_000)
    this.idleTimer.unref?.()
  }

  private connect() {
    const gen = ++this.generation
    this.byeReason = null
    const headers: Record<string, string> = { 'X-Office-Capabilities': 'iso-office', Accept: 'text/event-stream' }
    if (this.lastEventId) headers['Last-Event-ID'] = this.lastEventId
    const parser = new SseParser()
    let isClosed = false
    // 8초 안에 못 붙으면 offline (그 전까지는 connecting으로 두어 화면이 깜빡이지 않는다)
    if (this.link !== 'offline' && !this.offlineTimer) {
      this.offlineTimer = setTimeout(() => {
        this.offlineTimer = null
        if (this.isRunning && this.link === 'connecting') this.setState('offline')
      }, this.o.offlineAfterMs ?? PEER_LIMITS.offlineAfterMs)
      this.offlineTimer.unref?.()
    }
    this.handle = this.o.openStream('/v2/events', headers, {
      onOpen: (status) => {
        if (gen !== this.generation) return
        if (status === 200) this.touchIdle(gen)
      },
      onAlive: () => {
        if (gen === this.generation) this.touchIdle(gen)
      },
      onEvent: (name, data, id) => {
        if (gen !== this.generation) return
        this.touchIdle(gen)
        if (id) this.lastEventId = id
        let value: unknown = data
        try {
          value = JSON.parse(data)
        } catch {
          // 문자열 그대로
        }
        if (name === 'hello') {
          this.attempt = 0
          if (this.offlineTimer) clearTimeout(this.offlineTimer)
          this.offlineTimer = null
          this.setState('online')
          this.o.onOnline?.(value as Record<string, unknown>)
        } else if (name === 'bye') {
          this.byeReason = String((value as { reason?: unknown })?.reason ?? '')
        }
        this.o.onEvent(name, value)
      },
      onClose: (info) => {
        if (gen !== this.generation || !this.isRunning || isClosed) return
        isClosed = true
        if (this.idleTimer) clearTimeout(this.idleTimer)
        this.idleTimer = null
        this.handle = null
        // 다시 붙어도 소용없는 끝: 토큰 폐기·권한·버전 (인증서가 달라진 경우도)
        if ((info.status && NO_RETRY_STATUS.has(info.status)) || this.byeReason === 'token_revoked' || info.code === 'SPKI_MISMATCH') {
          this.clearTimers()
          return this.setState('unpaired')
        }
        // 원격 끄기·교체는 곧 다시 붙을 수 있으니 계속 시도한다
        if (this.link === 'online') {
          this.setState('connecting')
          if (!this.offlineTimer) {
            this.offlineTimer = setTimeout(() => {
              this.offlineTimer = null
              if (this.isRunning && this.link === 'connecting') this.setState('offline')
            }, this.o.offlineAfterMs ?? PEER_LIMITS.offlineAfterMs)
            this.offlineTimer.unref?.()
          }
        }
        const delays = this.o.retryMs ?? PEER_LIMITS.retryMs
        const base = delays[Math.min(this.attempt++, delays.length - 1)]
        const jitter = 1 + ((this.o.random?.() ?? Math.random()) * 0.4 - 0.2)
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null
          if (this.isRunning) this.connect()
        }, Math.round(base * jitter))
        this.retryTimer.unref?.()
      },
    })
  }
}
