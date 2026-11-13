// A컴의 PC 간 연결 총괄: 짝짓기 → 연결 유지(재연결) → 끊기. 워크스페이스(다른 PC 사무실 창)가 이 연결 상태를 쓴다
// PeerRegistry(기록)·PeerClient(연결)를 묶고, Office에는 좁은 입구만 보인다 (PeerOfficePort)
// 다른 PC 직원 빌려주기·데려오기(일·결재·파일 맞추기)는 1.3.2에서 없앴다 — 옛 데이터 정리는 legacyPeerCleanup.ts
// 네트워크는 deps.net으로 넣어 준다 — 테스트가 한 프로세스 안의 가짜 B컴이나 실제 서버(127.0.0.1)를 꽂는다

import { PEER_PATHS, type PeerLinkState, type PeerView } from '../../shared/peerProtocol.ts'
import { checkPairInput, pairWithHost, PairFailure, type PairTransport } from './pairing.ts'
import { PeerClient, type OpenStream, type PeerClientOptions } from './peerClient.ts'
import { PeerRegistry, type TokenVault } from './peerRegistry.ts'
import type { PeerRecord, PeerStore } from './peerStore'
import type { PeerHttp } from './peerTransport'

/** Office가 열어 주는 입구 (Office를 직접 import하지 않는다) */
export interface PeerOfficePort {
  /** 화면에 다시 보낼 것이 바뀜 */
  changed(): void
  /** 이 PC 이름 (짝지을 때 상대에게 알릴 이름) */
  ownName(): string
}

export interface PeerNet {
  pair(host: string, port: number): PairTransport
  http(peer: PeerRecord, token: string): PeerHttp
  stream(peer: PeerRecord, token: string): OpenStream
}

export interface PeerManagerDeps {
  store: PeerStore
  vault: TokenVault
  office: PeerOfficePort
  net: PeerNet
  now?(): number
  /** 짝지을 수 있는 주소인지 (기본: Tailscale·사설·*.ts.net). 테스트가 127.0.0.1을 허용하려고 바꾼다 */
  isHostAllowed?(host: string): boolean
  /** 테스트용: 재연결 지연·offline 판정 시간 */
  clientOptions?: Pick<PeerClientOptions, 'retryMs' | 'offlineAfterMs' | 'idleMs'>
}

export class PeerError extends Error {
  code: 'unknown_peer'
  constructor(code: PeerError['code']) {
    super(code)
    this.name = 'PeerError'
    this.code = code
  }
}

export class PeerManager {
  readonly registry: PeerRegistry
  private d: PeerManagerDeps
  private clients = new Map<string, PeerClient>()
  private states = new Map<string, PeerLinkState>()

  constructor(d: PeerManagerDeps) {
    this.d = d
    this.registry = new PeerRegistry(d.store, d.vault, d.now)
  }

  /** 앱을 켤 때: 저장된 피어마다 연결을 시작한다 */
  start() {
    for (const p of this.registry.listPeers()) this.connect(p)
  }

  dispose() {
    for (const c of this.clients.values()) c.stop()
    this.clients.clear()
  }

  // ── 연결 ──

  linkState(peerId: string): PeerLinkState {
    return this.clients.get(peerId)?.state ?? this.states.get(peerId) ?? 'unpaired'
  }

  private httpOf(peerId: string): PeerHttp | null {
    const peer = this.registry.getPeer(peerId)
    const token = this.registry.tokenOf(peerId)
    if (!peer || !token || token === 'unreadable') return null
    return this.d.net.http(peer, token)
  }

  private connect(peer: PeerRecord) {
    this.clients.get(peer.id)?.stop()
    const token = this.registry.tokenOf(peer.id)
    // 토큰을 읽지 못하면 몰래 새로 만들지 않고 "다시 짝짓기"로 둔다 (설계서 1-5)
    if (!token || token === 'unreadable') {
      this.clients.delete(peer.id)
      this.states.set(peer.id, 'unpaired')
      return this.d.office.changed()
    }
    const client = new PeerClient({
      peerId: peer.id,
      openStream: this.d.net.stream(peer, token),
      onState: (s) => {
        this.states.set(peer.id, s)
        this.d.office.changed()
      },
      // 연결 상태만 쓴다 (이벤트 본문은 화면 보기 창이 따로 받는다)
      onEvent: () => {},
      onOnline: () => this.registry.touch(peer.id),
      ...this.d.clientOptions,
    })
    this.clients.set(peer.id, client)
    client.start()
  }

  // ── 화면 입구 ──

  list(): PeerView[] {
    return this.registry.listPeers().map((p) => ({
      id: p.id,
      name: p.name,
      host: p.lastHost ?? p.host,
      port: p.port,
      pairedAt: p.pairedAt,
      state: this.linkState(p.id),
    }))
  }

  /** A컴에서 B컴으로 짝짓기 (IP+코드). 성공하면 저장하고 연결을 시작한다 */
  async pairConnect(host: string, port: number, code: string): Promise<PeerView & { fingerprint: string }> {
    const h = host.trim()
    checkPairInput(h, code, this.d.isHostAllowed)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new PairFailure('bad_host')
    const r = await pairWithHost(this.d.net.pair(h, port), { code, clientName: this.d.office.ownName(), kind: 'peer' })
    const rec = this.registry.addPeer({ name: r.peerName || h, host: h, port, spki: r.spki, slotId: r.slotId, token: r.token })
    this.connect(rec)
    this.d.office.changed()
    return { ...this.list().find((p) => p.id === rec.id)!, fingerprint: r.fingerprint }
  }

  /** 연결 끊기: B컴에 알리되(실패해도 진행) A컴 쪽은 모두 지운다 */
  async unpair(peerId: string) {
    if (!this.registry.getPeer(peerId)) throw new PeerError('unknown_peer')
    const http = this.httpOf(peerId)
    await Promise.race([http?.call('POST', PEER_PATHS.unpair, {}).catch(() => {}), new Promise((r) => setTimeout(r, 3000).unref?.())])
    this.clients.get(peerId)?.stop()
    this.clients.delete(peerId)
    this.states.delete(peerId)
    this.registry.removePeer(peerId)
    this.d.office.changed()
  }

  /** 지금 바로 다시 연결해 본다 */
  reconnect(peerId: string) {
    this.clients.get(peerId)?.retryNow()
  }
}
