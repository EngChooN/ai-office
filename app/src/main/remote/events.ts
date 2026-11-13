// 원격 v2 이벤트 스트림 (SSE, 규격 8절): PC 화면이 받는 이벤트(snapshot·log·chat·focus·remoteStatus)를 휴대폰에 그대로 보낸다
// 연결되면 hello → 지금 snapshot → remoteStatus. 다시 붙으면 Last-Event-ID로 놓친 log·chat·focus를 따라잡는다

import crypto from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { NO_CAPABILITIES, type Capabilities } from './capabilities.ts'
import { stripAttachmentPaths, V2_PROTOCOL_VERSION } from './v2.ts'

export type HubEvent = 'snapshot' | 'log' | 'chat' | 'focus' | 'remoteStatus'
export type ByeReason = 'token_revoked' | 'remote_disabled' | 'shutdown' | 'replaced' | 'slow_consumer' | 'permission_changed'

/** 다시 붙을 때 보내 줄 이벤트 (snapshot·remoteStatus는 마지막 값만 의미가 있어 쌓지 않는다) */
const REPLAYED: ReadonlySet<HubEvent> = new Set(['log', 'chat', 'focus'])
/** 마지막 값만 의미가 있어 묶어 보내는 이벤트 (remoteStatus는 요청마다 접속 기록이 바뀌어 호출마다 나가던 것을 묶는다) */
const COALESCED: ReadonlySet<HubEvent> = new Set(['snapshot', 'remoteStatus'])
export const SSE_LIMITS = {
  /** 쌓아 둘 이벤트 수·시간 (먼저 차는 쪽) */
  bufferMax: 500,
  bufferMs: 5 * 60_000,
  heartbeatMs: 15_000,
  /** snapshot·remoteStatus는 첫 값을 바로 보낸 뒤 이 간격으로 묶어 마지막 값만 보낸다 */
  coalesceMs: 500,
  perToken: 2,
  /** 휴대폰 1~2 + 피어 슬롯(8개까지: 일반 짝은 슬롯당 1개, '화면 보기' 열쇠는 휴대폰처럼 2개)을 합쳐. 열쇠 하나가 다른 열쇠 자리를 밀어내지 않게 모두 열 수 있는 수 */
  total: 18,
  /** 쓰기 대기가 이만큼 쌓인 채로 slowMs가 지나면 끊는다 */
  slowBytes: 1024 * 1024,
  slowMs: 10_000,
  retryMs: 3000,
}

interface Client {
  res: ServerResponse
  tokenHash: string
  /** 피어 슬롯 연결이면 슬롯 id (휴대폰 연결은 null) — 피어에는 고른 직원의 줄인 정보만 보낸다 */
  slot: string | null
  /** '화면 보기' 열쇠의 연결 — 휴대폰과 같은 모양(snapshot·log·chat·focus·remoteStatus 그대로)으로 보낸다 */
  view: boolean
  /** 연결할 때 헤더로 알린 능력 — 같은 토큰이라도 연결마다 다르다 (예전 폰과 새 폰이 함께 붙을 수 있다) */
  capabilities: Capabilities
  openedAt: number
  slowSince: number | null
}

interface Buffered {
  n: number
  at: number
  event: HubEvent
  data: string
}

export interface HubSource {
  /** 지금 사무실 상태·원격 상태 (연결 직후 보낸다) */
  snapshot(): unknown
  remoteStatus(): unknown
  /** 이 토큰(해시)이 아직 쓸 수 있는지 — 아니면 bye(token_revoked) */
  isTokenValid(tokenHash: string): boolean
  /** 연결마다 보낼 모양으로 바꾼다 — 예전 폰 화면(능력을 알리지 않은 연결)에 회사 레벨을 줄여 보내기 (remote/capabilities.ts). 없으면 그대로 */
  shape?(event: HubEvent, data: unknown, capabilities: Capabilities): unknown
  /** 이 슬롯이 '화면 보기' 권한을 가졌는지 (연결할 때 한 번 본다 — 바뀌면 service가 연결을 닫아 다시 붙게 한다) */
  isViewSlot?(slotId: string): boolean
  now?(): number
}

export class EventHub {
  /** 서버가 켜질 때마다 새로 — 다른 epoch의 Last-Event-ID는 따라잡지 못한다(resync) */
  readonly epoch = crypto.randomBytes(4).toString('hex')
  private seq = 0
  private buffer: Buffered[] = []
  private clients: Client[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  /** 묶는 중인 이벤트의 마지막 값(dirty = 아직 못 보낸 값)과 타이머 */
  private pending = new Map<HubEvent, { data: unknown; dirty: boolean; timer: ReturnType<typeof setTimeout> }>()
  private source: HubSource

  constructor(source: HubSource) {
    this.source = source
  }

  private now() {
    return this.source.now?.() ?? Date.now()
  }

  get size() {
    return this.clients.length
  }

  /** 연결을 더 받을 수 있는지 (전체 4개). 같은 토큰의 세 번째는 가장 오래된 것을 밀어내므로 받을 수 있다 */
  canAccept(tokenHash: string, slot: string | null = null) {
    // 피어 슬롯은 슬롯당 1개('화면 보기' 열쇠는 2개) — 넘는 새 연결은 옛 연결을 밀어낸다
    if (slot) return this.clients.length < SSE_LIMITS.total || this.clients.filter((c) => c.slot === slot).length >= this.slotLines(slot)
    const mine = this.clients.filter((c) => c.tokenHash === tokenHash).length
    return this.clients.length < SSE_LIMITS.total || mine >= SSE_LIMITS.perToken
  }

  private slotLines(slot: string) {
    return this.source.isViewSlot?.(slot) ? SSE_LIMITS.perToken : 1
  }

  /** 새 연결: 헤더 → hello → (따라잡기) → snapshot → remoteStatus */
  open(res: ServerResponse, tokenHash: string, lastEventId: string | undefined, capabilities: Capabilities = NO_CAPABILITIES, slot: string | null = null) {
    const view = slot ? this.slotLines(slot) > 1 : false
    const mine = this.clients.filter((c) => (slot ? c.slot === slot : c.tokenHash === tokenHash && !c.slot))
    // 같은 토큰은 2개까지(일반 피어 슬롯은 1개) — 넘으면 가장 오래된 연결을 닫는다 (재연결이 겹칠 때)
    if (mine.length >= (slot ? this.slotLines(slot) : SSE_LIMITS.perToken)) this.close(mine[0], 'replaced')
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const client: Client = { res, tokenHash, slot, view, capabilities, openedAt: this.now(), slowSince: null }
    this.clients.push(client)
    res.on('close', () => (this.clients = this.clients.filter((c) => c !== client)))

    const missed = this.missedSince(lastEventId)
    res.write(`retry: ${SSE_LIMITS.retryMs}\n\n`)
    this.writeRaw(client, 'hello', JSON.stringify({ protocolVersion: V2_PROTOCOL_VERSION, epoch: this.epoch, lastEventId: this.seq, heartbeatSec: SSE_LIMITS.heartbeatMs / 1000, resync: missed === null, serverTime: this.now() }))
    // 짝만 지은 PC 열쇠에는 놓친 log를 다시 보내지 않는다 (화면 보기 권한이 없다)
    if (!slot || view) for (const b of missed ?? []) this.writeRaw(client, b.event, b.data, b.n)
    const snap = this.shaped('snapshot', this.source.snapshot(), client)
    if (snap !== null) this.writeRaw(client, 'snapshot', JSON.stringify(stripAttachmentPaths(snap)), this.nextId())
    // 접속 기록이 든 remoteStatus는 휴대폰에만
    if (!slot || view) this.writeRaw(client, 'remoteStatus', JSON.stringify(this.source.remoteStatus()), this.nextId())
    this.startTimer()
  }

  private shaped(event: HubEvent, data: unknown, c: Client): unknown | null {
    // 짝만 지은 PC 열쇠(화면 보기 권한 없음)에는 hello·keep-alive만 — 연결 상태만 알 수 있다
    if (c.slot && !c.view) return null
    return this.source.shape ? this.source.shape(event, data, c.capabilities) : data
  }

  /** 이 슬롯의 연결을 닫는다 (해제) */
  closeSlot(slotId: string, reason: ByeReason) {
    for (const c of [...this.clients]) if (c.slot === slotId) this.close(c, reason)
  }

  /** Last-Event-ID 뒤로 놓친 log·chat·focus (모두 보관 범위 안이면 그 목록, 아니면 null = 앱이 다시 읽어야 함) */
  private missedSince(lastEventId: string | undefined): Buffered[] | null {
    const m = lastEventId?.match(/^([0-9a-f]+):(\d+)$/)
    if (!m || m[1] !== this.epoch) return null
    const n = Number(m[2])
    this.trim()
    // n 뒤의 이벤트 중 이미 버린 것이 있으면 따라잡을 수 없다 (쌓지 않는 snapshot·remoteStatus 번호는 상관없다)
    if (n > this.seq || this.lastDropped > n) return null
    return this.buffer.filter((b) => b.n > n)
  }

  /** 보관 범위를 벗어나 버린 마지막 이벤트 번호 */
  private lastDropped = 0

  private nextId() {
    return ++this.seq
  }

  private trim() {
    const now = this.now()
    while (this.buffer.length > SSE_LIMITS.bufferMax || (this.buffer[0] && now - this.buffer[0].at > SSE_LIMITS.bufferMs)) this.lastDropped = this.buffer.shift()!.n
  }

  /** PC에서 일어난 이벤트를 모든 연결에 보낸다. snapshot·remoteStatus는 조용하던 뒤 첫 값은 바로, 뒤따르는 값은 500ms에 한 번 마지막 값으로 묶는다 */
  publish(event: HubEvent, data: unknown) {
    if (!COALESCED.has(event)) return this.broadcast(event, data)
    const waiting = this.pending.get(event)
    if (waiting) {
      waiting.data = data
      waiting.dirty = true
      return
    }
    this.broadcast(event, data)
    this.armCoalesce(event)
  }

  /** 바로 보낸 뒤 500ms 동안 쌓인 값이 있으면 그 끝에 마지막 값을 보낸다 (마지막 값은 반드시 나간다). 뒤따르는 값을 보낸 뒤에는 창을 다시 열지 않아, 그 직후의 새 변화는 또 바로 나간다 */
  private armCoalesce(event: HubEvent) {
    const timer = setTimeout(() => {
      const latest = this.pending.get(event)
      this.pending.delete(event)
      if (latest?.dirty) this.broadcast(event, latest.data)
    }, SSE_LIMITS.coalesceMs)
    timer.unref?.()
    this.pending.set(event, { data: undefined, dirty: false, timer })
  }

  private broadcast(event: HubEvent, data: unknown) {
    const n = this.nextId()
    const text = JSON.stringify(stripAttachmentPaths(data))
    if (REPLAYED.has(event)) {
      this.buffer.push({ n, at: this.now(), event, data: text })
      this.trim()
    }
    // 연결마다 모양이 다를 수 있다 — 바뀐 값만 따로 문자열로 만든다 (같은 값이면 한 번 만든 문자열을 함께 쓴다)
    const texts = new Map<unknown, string>([[data, text]])
    for (const c of [...this.clients]) {
      const v = this.shaped(event, data, c)
      if (v === null) continue
      if (!texts.has(v)) texts.set(v, JSON.stringify(stripAttachmentPaths(v)))
      this.writeRaw(c, event, texts.get(v)!, n)
    }
  }

  private writeRaw(c: Client, event: string, data: string, id?: number) {
    if (c.res.destroyed) return
    c.res.write(`${id !== undefined ? `id: ${this.epoch}:${id}\n` : ''}event: ${event}\ndata: ${data}\n\n`)
    this.checkSlow(c)
  }

  /** 쓰기 대기가 1MB를 넘은 채로 10초가 지나면 끊는다 (다시 붙으면 Last-Event-ID로 따라잡는다) */
  private checkSlow(c: Client) {
    const now = this.now()
    if (c.res.writableLength <= SSE_LIMITS.slowBytes) return void (c.slowSince = null)
    c.slowSince ??= now
    if (now - c.slowSince >= SSE_LIMITS.slowMs) this.close(c, 'slow_consumer')
  }

  /** 15초마다 살아 있다는 주석 줄 + 토큰이 아직 유효한지 확인 */
  heartbeat() {
    for (const c of [...this.clients]) {
      if (!this.source.isTokenValid(c.tokenHash)) {
        this.close(c, 'token_revoked')
        continue
      }
      if (!c.res.destroyed) c.res.write(': keep-alive\n\n')
      this.checkSlow(c)
    }
    if (this.clients.length === 0) this.stopTimer()
  }

  private startTimer() {
    if (this.timer) return
    this.timer = setInterval(() => this.heartbeat(), SSE_LIMITS.heartbeatMs)
    this.timer.unref?.()
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private close(c: Client, reason: ByeReason, extra: Record<string, unknown> = {}) {
    this.clients = this.clients.filter((x) => x !== c)
    if (!c.res.destroyed) {
      c.res.write(`event: bye\ndata: ${JSON.stringify({ reason, ...extra })}\n\n`)
      c.res.end()
    }
  }

  /** 모든 연결을 닫는다 (원격 끄기·QR 다시 만들기·앱 종료) */
  closeAll(reason: ByeReason, opts: { phonesOnly?: boolean } = {}) {
    // phonesOnly: 휴대폰 QR 재발급은 휴대폰 연결만 끊는다 (다른 PC 연결의 토큰은 그대로라 'token_revoked'를 받으면 안 된다)
    for (const c of [...this.clients]) if (!opts.phonesOnly || !c.slot) this.close(c, reason)
    this.stopTimer()
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.pending.clear()
  }
}
