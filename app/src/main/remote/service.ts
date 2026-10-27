// 원격 접속 묶음: 켜기·끄기, 키·토큰, HTTPS 서버, 공유기 포트(UPnP), 잠금 알림, 화면에 보낼 상태
// electron에 기대지 않는다 — 저장(DB·키 파일)·PC 알림은 밖에서 넣어 준다 (index.ts). 그래서 테스트가 그대로 띄워 볼 수 있다

import os from 'node:os'
import { AuthGuard, sameHash, type AuthState } from './auth.ts'
import { createSelfSignedCert, spkiFingerprint } from './cert.ts'
import { handleRequest, type RemoteOfficePort } from './handler.ts'
import { isValidQrPayload, lanForQr, qrImage } from './qr.ts'
import { detectTailscale, isAllowedClient, isTailscaleClient, pickLanAddress, readDefaultGateway, readTailscaleCli, type TsCliResult, type TsInfo } from './lan.ts'
import { RemoteServer } from './server.ts'
import { shapeFor } from './capabilities.ts'
import { EventHub, type HubEvent } from './events.ts'
import { V2Routes, type V2Office } from './v2routes.ts'
import type { AccessEntry, RemoteMode, RemoteQr, RemoteStatus, UpnpState } from '../../shared/types'
import * as upnp from './upnp.ts'

/** 기본 포트 (규격 8절 예시값 · 기획서 D4 확정 전 임시) */
export const DEFAULT_REMOTE_PORT = 47900
const ACCESS_KEEP = 20
/** QR(토큰 원문)을 화면에 보여 주는 시간 — 지나면 메모리에서도 지운다 */
export const QR_SHOW_MS = 5 * 60_000
const LEASE_RENEW_MS = 30 * 60_000
/** 전용 모드에서 네트워크 카드 주소가 바뀌었는지 보는 간격 */
export const NETWORK_WATCH_MS = 5000

/** DB에 저장하는 원격 설정 (Settings와 따로 둔다 — Settings는 스냅샷으로 화면에 가므로 토큰 해시가 새 나간다) */
export interface RemoteConfig extends AuthState {
  isEnabled: boolean
  port: number
  /** 휴대폰이 붙을 주소 (DDNS 이름·공인 IP). 비우면 공유기가 알려 준 외부 주소 */
  host: string
  /** 지금 토큰으로 휴대폰이 붙은 적이 있는지 — 없으면 켤 때 새 토큰을 내서 QR을 바로 보여 준다 (끊을 휴대폰이 없으니까) */
  isTokenUsed: boolean
  /** 같은 네트워크 전용 모드 — 공유기 포트를 열지 않고, 고른 내부 주소에만 귀를 열며, 사설 대역 밖의 연결은 끊는다. 신규 설치(저장된 설정 없음)는 true, 예전 설정은 false 유지 */
  lanOnly: boolean
  /** 예전 사용자에게 전용 모드 안내를 이미 보여 줬는지 (신규 설치는 처음부터 true) */
  isLanNoticeSeen: boolean
  /** 연결 방식 — 없으면(예전 설정) lanOnly로 정한다: true면 lan, 아니면 router. 신규 설치는 tailscale. lanOnly도 mode === 'lan'으로 계속 같이 저장한다(옛 버전으로 되돌려도 같은 동작) */
  mode?: RemoteMode
  /** 예전 사용자에게 Tailscale 안내를 이미 보여 줬는지 (신규 설치는 처음부터 true) */
  isTsNoticeSeen: boolean
}

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = { isEnabled: false, port: DEFAULT_REMOTE_PORT, host: '', tokenHash: null, revoked: [], isTokenUsed: false, lanOnly: false, isLanNoticeSeen: false, isTsNoticeSeen: false }
/** 앱을 끝낼 때 공유기 매핑 해제를 기다리는 최대 시간 */
export const SHUTDOWN_WAIT_MS = 3000

export interface RemoteDeps {
  office: RemoteOfficePort
  serverVersion: string
  /** 저장된 설정 (빈 칸은 기본값으로 채운다) */
  loadConfig(): Partial<RemoteConfig>
  saveConfig(c: RemoteConfig): void
  /** 키·인증서 (없으면 null, 파일은 있는데 읽거나 복호화하지 못하면 'unreadable') — 개인 키는 소유자만 읽게 저장한다 */
  loadKeys(): { keyPem: string; certPem: string } | 'unreadable' | null
  saveKeys(keys: { keyPem: string; certPem: string }): void
  /** PC 알림 (잠금 등) */
  alert(title: string, body: string): void
  /** 상태가 바뀌면 화면에 다시 보낸다 */
  changed(): void
  /** 공유기 포트 열기 (테스트에서 끈다) */
  upnp?: { find: typeof upnp.findGateway; add: typeof upnp.addPortMapping; remove: typeof upnp.deletePortMapping; external: typeof upnp.externalAddress } | null
  now?(): number
  /** 서버가 귀를 여는 주소 (테스트는 127.0.0.1). 비우면 모든 주소, 전용 모드면 고른 내부 주소 */
  listenHost?: string
  /** 네트워크 카드 목록 (테스트가 가짜를 넣는다) */
  networkInterfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>
  /** 기본 게이트웨이(공유기) 주소 읽기 — 못 읽으면 null (테스트가 가짜를 넣는다) */
  gateway?: () => Promise<string | null>
  /** 카드 주소 변화 확인 간격 */
  networkWatchMs?: number
  /** Tailscale CLI(`tailscale status --json`) 읽기 — 테스트가 가짜를 넣는다 */
  tailscaleCli?: () => Promise<TsCliResult>
  /** 원격 v2: PC 화면과 같은 처리 함수 표·첨부 저장소 (없으면 v2는 404) */
  v2?: V2Office | null
}

function isUsableCert(certPem: string) {
  try {
    spkiFingerprint(certPem)
    return true
  } catch {
    return false
  }
}

export class RemoteService {
  private config: RemoteConfig
  private guard: AuthGuard
  private server = new RemoteServer()
  private keys: { keyPem: string; certPem: string } | null = null
  private gateway: upnp.Gateway | null = null
  private upnpState: UpnpState = { state: 'off' }
  private renewTimer: ReturnType<typeof setInterval> | null = null
  private access: AccessEntry[] = []
  private error: RemoteStatus['error'] = null
  /** QR을 보여 주는 동안만 들고 있는 토큰 원문 */
  private shownToken: { token: string; until: number } | null = null
  private isReady = true
  /** 저장된 키를 못 읽어 새로 만들었는지 (PC 화면에 "새 QR로 다시 연결" 안내) */
  private isKeyRegenerated = false
  private deps: RemoteDeps
  /** 전용 모드: 지금 귀를 연 내부 주소·읽어 둔 공유기 주소·주소 변화 감시 */
  private boundLan: string | null = null
  private gatewayIp: string | null = null
  private watchTimer: ReturnType<typeof setInterval> | null = null
  private isGatewayWarned = false
  /** Tailscale 모드: 마지막으로 읽은 상태·지금 귀를 연 Tailscale 주소 */
  private ts: TsInfo = { state: 'notInstalled', address: null, name: null }
  private boundTs: string | null = null

  /** v2 이벤트 스트림 (SSE) */
  private hub: EventHub
  private v2: V2Routes | null

  constructor(deps: RemoteDeps) {
    // 원격 상태가 바뀔 때마다 PC 화면과 열린 v2 이벤트 스트림에 함께 알린다
    this.deps = { ...deps, changed: () => (deps.changed(), this.hub?.publish('remoteStatus', this.status())) }
    // 예전 "휴대폰에서 모든 기능 쓰기" 값(isFullAccess)이 저장돼 있어도 버린다 — 원격이 켜져 있으면 v2를 바로 쓴다 (대표 결정, v2 규격 12-1절)
    const { isFullAccess: _dropped, ...saved } = deps.loadConfig() as Partial<RemoteConfig> & { isFullAccess?: unknown }
    // 저장된 원격 설정이 없는 신규 설치만 전용 모드로 시작한다. 예전 설정(lanOnly 없음)은 지금처럼 밖에서도 붙고, 안내를 한 번 보여 준다
    const isFresh = Object.keys(saved).length === 0
    // 연결 방식: 저장된 값 그대로, 없으면 신규 설치는 Tailscale, 예전 사용자는 쓰던 방식(lanOnly)을 유지하고 Tailscale 안내를 한 번 보여 준다 (자동으로 바꾸지 않는다)
    // 세 값 밖(손상·수정된 파일)이면 저장된 mode를 버리고 lanOnly로 정한다 — 모르는 값이 모든 주소에 귀를 열지 않게
    const isKnownMode = saved.mode === 'tailscale' || saved.mode === 'lan' || saved.mode === 'router'
    const mode: RemoteMode = (isKnownMode ? saved.mode : undefined) ?? (isFresh ? 'tailscale' : saved.lanOnly ? 'lan' : 'router')
    this.config = { ...DEFAULT_REMOTE_CONFIG, ...saved, mode, lanOnly: mode === 'lan', isLanNoticeSeen: saved.isLanNoticeSeen ?? isFresh, isTsNoticeSeen: saved.isTsNoticeSeen ?? isFresh }
    this.guard = this.newGuard()
    const v2 = deps.v2
    this.hub = new EventHub({
      snapshot: () => v2?.call('snapshot', []) ?? null,
      remoteStatus: () => this.status(),
      isTokenValid: (tokenHash) => {
        const current = this.guard.current.tokenHash
        return Boolean(current) && sameHash(tokenHash, current as string)
      },
      // 예전 폰 화면(연결할 때 iso-office를 알리지 않음)에는 회사 레벨을 10까지만 (A4: 11 이상이면 화면이 멈춘다)
      shape: (event, data, capabilities) => (event === 'snapshot' ? shapeFor(capabilities, data) : data),
      now: () => this.now(),
    })
    this.v2 = v2
      ? new V2Routes({
          guard: this.guard,
          hub: this.hub,
          office: v2,
          now: () => this.now(),
          isReady: () => this.isReady,
          currentPort: () => this.config.port,
          lanInfo: () => ({ lo: this.config.lanOnly, lan: this.lanHost(), ...(this.isTailscale ? { ts: true, tsHost: this.ts.address } : {}) }),
        })
      : null
  }

  /** PC에서 일어난 이벤트를 열린 v2 이벤트 스트림에 보낸다 (원격이 켜져 있을 때만) */
  publish(event: HubEvent, data: unknown) {
    if (this.server.isListening) this.hub.publish(event, data)
  }

  private now() {
    return this.deps.now?.() ?? Date.now()
  }

  private newGuard() {
    // 알림은 종류마다 10분에 한 번 (AuthGuard가 합쳐서 부른다) — count는 그 사이 합친 횟수
    return new AuthGuard({ tokenHash: this.config.tokenHash, revoked: this.config.revoked }, (scope, until, count) => {
      const at = new Date(until).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      if (scope === 'global')
        this.deps.alert('⚠️ 원격 접속 실패가 많아요', `여러 곳에서 틀린 열쇠로 ${count}번 이상 연결하려 했어요. 내가 한 일이 아니라면 휴대폰 연결을 끄거나 QR을 다시 만들어 주세요.`)
      else this.deps.alert('🔒 원격 접속을 잠갔어요', count > 1 ? `연결 실패가 많은 ${count}곳을 15분씩 막았어요 (마지막은 ${at}까지).` : `한 곳에서 연결 실패가 많아 ${at}까지 그곳을 막아요.`)
      this.deps.changed()
    })
  }

  private save() {
    this.config = { ...this.config, ...this.guard.current, isTokenUsed: this.config.isTokenUsed || this.guard.isTokenUsed }
    this.deps.saveConfig(this.config)
    this.deps.changed()
  }

  /** 앱을 켤 때: 지난번에 켜 두었으면 다시 연다 (기본은 꺼짐) */
  async init() {
    // 전용·Tailscale 모드인데 지난 실행(밖에서도 붙던 때)의 공유기 포트 매핑이 남아 있을 수 있어 한 번 닫는다 (실패는 무시)
    if (this.config.mode !== 'router' && this.deps.upnp) {
      const u = this.deps.upnp
      try {
        const gw = await u.find()
        if (gw) await u.remove(gw, this.config.port)
      } catch {
        // 공유기가 없거나 거부해도 시작은 계속한다
      }
    }
    if (this.config.isEnabled) await this.open()
  }

  status(): RemoteStatus {
    const connectHost = this.connectHost()
    return {
      isEnabled: this.config.isEnabled,
      isListening: this.server.isListening,
      port: this.config.port,
      host: this.config.host,
      connectHost: connectHost?.host ?? null,
      isLanOnly: connectHost?.isLan ?? false,
      lanOnly: this.config.lanOnly,
      isLanNoticePending: !this.config.lanOnly && !this.config.isLanNoticeSeen,
      mode: this.mode,
      tsState: this.ts.state,
      tsAddress: this.ts.address,
      tsName: this.ts.name,
      isTsNoticePending: !this.isTailscale && !this.config.isTsNoticeSeen,
      fingerprint: this.keys ? spkiFingerprint(this.keys.certPem) : null,
      upnp: this.upnpState,
      error: this.error,
      lockedUntil: this.guard.latestLock(this.now()),
      recentAccess: this.access,
      isQrReady: Boolean(this.shownToken && this.shownToken.until > this.now()),
      isTokenUsed: this.config.isTokenUsed || this.guard.isTokenUsed,
      isFullAccess: true,
      isKeyRegenerated: this.isKeyRegenerated,
    }
  }

  private get mode(): RemoteMode {
    return this.config.mode ?? 'router'
  }

  private get isTailscale() {
    return this.mode === 'tailscale'
  }

  private connectHost(): { host: string; isLan: boolean } | null {
    // Tailscale 모드는 Tailscale 주소만 — 직접 입력·공유기 외부 주소·내부 주소는 쓰지 않는다
    if (this.isTailscale) return this.ts.address ? { host: this.ts.address, isLan: false } : null
    // 전용 모드는 직접 입력·공유기 외부 주소를 쓰지 않는다 — 내부 주소만
    if (this.config.lanOnly) {
      const lan = this.lanHost()
      return lan ? { host: lan, isLan: true } : null
    }
    if (this.config.host) return { host: this.config.host, isLan: false }
    if (this.upnpState.state === 'ok' && this.upnpState.externalAddress) return { host: this.upnpState.externalAddress, isLan: false }
    const lan = this.lanHost()
    return lan ? { host: lan, isLan: true } : null
  }

  /** 같은 와이파이 주소: 공유기와 이야기할 때 쓴 이 PC의 주소(UPnP가 찾은 것)가 가장 정확하고, 없으면 네트워크 카드에서 고른다 */
  private lanHost() {
    // Tailscale 모드는 100.x 밖의 연결을 끊으므로 같은 와이파이 주소를 알리지 않는다
    if (this.isTailscale) return null
    if (this.config.lanOnly) return this.pickLan()
    return this.gateway?.localAddress ?? this.pickLan()
  }

  private pickLan() {
    return pickLanAddress((this.deps.networkInterfaces ?? os.networkInterfaces)())
  }

  /** 원격 켜기. 처음이면 인증서 키쌍과 토큰을 만들고 QR을 보여 줄 수 있게 한다 */
  async enable(port = this.config.port) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return this.status()
    // 이미 켜져 있으면: 포트가 같으면 공유기 설정만 다시 시도, 다르면 닫고 새 포트로 연다
    const isSamePort = port === this.config.port
    if (this.server.isListening && isSamePort) {
      if (this.mode === 'router' && this.upnpState.state !== 'ok' && this.upnpState.state !== 'trying') await this.mapPort()
      return this.status()
    }
    if (this.server.isListening) await this.close()
    this.config = { ...this.config, port, isEnabled: true }
    // 처음이거나, 지금 토큰으로 붙은 휴대폰이 없으면 새 토큰을 내서 QR을 바로 보여 준다 (끊을 휴대폰이 없으니 안전).
    // 이미 붙은 휴대폰이 있으면 토큰을 그대로 둬서 그 휴대폰이 계속 붙게 한다 (원문이 없어 QR은 다시 만들어야 보인다)
    const isQrShowing = Boolean(this.shownToken && this.shownToken.until > this.now())
    if (!this.config.tokenHash || (!this.config.isTokenUsed && !this.guard.isTokenUsed && !isQrShowing)) this.issueToken()
    this.save()
    await this.open()
    return this.status()
  }

  /** 원격 끄기: 포트·남은 연결·공유기 매핑을 모두 닫는다. 토큰은 그대로 (다시 켜면 같은 QR로 붙는다) */
  async disable() {
    this.config = { ...this.config, isEnabled: false }
    this.save()
    this.hub.closeAll('remote_disabled')
    await this.close()
    return this.status()
  }

  /**
   * 연결 방식 바꾸기(tailscale · lan · router). 열린 연결은 끊기고 새 방식으로 다시 연다(토큰은 그대로).
   * lan·tailscale은 열린 공유기 매핑을 닫고, router는 모든 주소에 열고 공유기 포트를 다시 시도한다
   */
  async setMode(mode: RemoteMode) {
    if (!['tailscale', 'lan', 'router'].includes(mode) || this.mode === mode) return this.status()
    this.config = { ...this.config, mode, lanOnly: mode === 'lan', isLanNoticeSeen: true, isTsNoticeSeen: true }
    this.save()
    if (this.server.isListening || this.error === 'no_network') {
      this.hub.closeAll('remote_disabled')
      await this.close()
      await this.open()
    }
    return this.status()
  }

  /** 같은 네트워크 전용 모드 켜기·끄기 (옛 화면 호환) — 켜면 lan, 끄면 router */
  setLanOnly(isLanOnly: boolean) {
    if (this.config.lanOnly === isLanOnly) return Promise.resolve(this.status())
    return this.setMode(isLanOnly ? 'lan' : 'router')
  }

  /** Tailscale 상태를 지금 다시 읽는다. 서버가 켜져 있고 주소가 바뀌었으면 다시 연다. 화면이 3초마다 부른다 */
  async refreshTailscale() {
    if (!this.isTailscale) return this.status()
    if (this.config.isEnabled) await this.checkNetwork()
    else await this.readTailscale()
    return this.status()
  }

  /** Tailscale 안내(예전 사용자용)를 닫는다 (다시 보이지 않게) */
  dismissTsNotice() {
    if (!this.config.isTsNoticeSeen) {
      this.config = { ...this.config, isTsNoticeSeen: true }
      this.save()
    }
    return this.status()
  }

  private async readTailscale() {
    const cli = await (this.deps.tailscaleCli ?? readTailscaleCli)().catch((): TsCliResult => ({ kind: 'failed' }))
    const next = detectTailscale((this.deps.networkInterfaces ?? os.networkInterfaces)(), cli)
    const isChanged = next.state !== this.ts.state || next.address !== this.ts.address || next.name !== this.ts.name
    this.ts = next
    if (isChanged) this.deps.changed()
  }

  /** 예전 사용자에게 보여 주는 첫 실행 안내를 닫는다 (다시 보이지 않게) */
  dismissLanNotice() {
    if (!this.config.isLanNoticeSeen) {
      this.config = { ...this.config, isLanNoticeSeen: true }
      this.save()
    }
    return this.status()
  }

  /** QR 다시 만들기: 새 토큰, 이전 토큰은 즉시 폐기, 열린 연결은 끊는다 */
  async regenerate() {
    this.issueToken()
    this.save()
    this.hub.closeAll('token_revoked')
    if (this.server.isListening) {
      await this.server.stop()
      await this.listen()
    }
    return this.status()
  }

  /** 휴대폰이 붙을 주소 바꾸기 (DDNS 이름·공인 IP, 비우면 자동) */
  setHost(host: string) {
    const h = host.trim()
    if (h && !/^[A-Za-z0-9.:[\]-]{1,255}$/.test(h)) return this.status()
    this.config = { ...this.config, host: h }
    this.save()
    return this.status()
  }

  /** 보여 줄 QR (토큰 원문이 메모리에 있을 때만 — 지나면 다시 만들어야 한다) */
  qr(): RemoteQr | null {
    const shown = this.shownToken
    const host = this.connectHost()?.host
    if (!shown || shown.until <= this.now() || !this.keys || !host) return null
    // 같은 와이파이의 휴대폰은 lan으로 먼저 붙는다 (공유기가 외부 주소로 되돌아 들어오기를 못 하는 집이 많다)
    const lan = lanForQr(host, this.lanHost())
    const isTs = this.isTailscale
    // pv = 이 PC가 아는 가장 높은 프로토콜 (v2 규격 2-1절). v는 1.0.x 앱이 거부하지 않게 계속 1
    const payload = { v: 1, host, port: this.config.port, token: shown.token, spki: spkiFingerprint(this.keys.certPem), ...(lan ? { lan } : {}), ...(this.v2 ? { pv: 2 } : {}), ...(this.config.lanOnly ? { lo: true } : {}), ...(isTs ? { ts: true } : {}) }
    if (!isValidQrPayload(payload)) return null
    return { image: qrImage(payload), host, lan: lan ?? null, port: payload.port, until: shown.until }
  }

  /** 앱이 끝나는 중이면 503으로 답하고 포트를 닫는다 (공유기 매핑도 지운다) */
  async shutdown(waitMs = SHUTDOWN_WAIT_MS) {
    this.isReady = false
    this.hub.closeAll('shutdown')
    // 공유기가 답이 없어도 앱 종료를 오래 붙잡지 않는다 (매핑은 1시간 임대라 못 지워도 1시간 안에 사라진다)
    await Promise.race([this.close(), new Promise<void>((resolve) => setTimeout(resolve, waitMs).unref?.())])
  }

  private issueToken() {
    this.ensureKeys()
    const { token } = this.guard.rotate()
    this.config = { ...this.config, isTokenUsed: false }
    this.shownToken = { token, until: this.now() + QR_SHOW_MS }
    setTimeout(() => {
      if (this.shownToken?.token === token) this.shownToken = null
      this.deps.changed()
    }, QR_SHOW_MS).unref?.()
  }

  private ensureKeys() {
    if (this.keys) return
    const saved = this.deps.loadKeys()
    if (saved && saved !== 'unreadable' && isUsableCert(saved.certPem)) {
      this.keys = saved
      return
    }
    // 저장된 키를 못 읽으면(복호화 실패·예전 인코딩 버그로 만든 인증서 등) 새로 만든다 — 지문이 바뀌므로 휴대폰은 새 QR이 필요하다
    this.keys = createSelfSignedCert()
    this.deps.saveKeys(this.keys)
    if (saved) this.isKeyRegenerated = true
  }

  private async open() {
    this.ensureKeys()
    // 키를 새로 만들었으면 예전 QR은 지문이 달라 쓸 수 없다 → 새 토큰으로 QR을 바로 보여 준다
    if (this.isKeyRegenerated && !this.shownToken) {
      this.issueToken()
      this.save()
    }
    await this.listen()
    // 전용·Tailscale 모드는 공유기 포트를 열지 않는다 (UPnP 끔) — 대신 주소 변화를 지켜본다
    if (this.mode !== 'router') this.startWatch()
    else if (this.server.isListening) void this.mapPort()
  }

  /** 전용 모드: 게이트웨이를 읽어 두고(못 읽으면 사설 대역만 적용) 카드 주소가 바뀌는지 몇 초마다 본다 */
  private async refreshGateway() {
    this.gatewayIp = await (this.deps.gateway ?? readDefaultGateway)().catch(() => null)
    if (!this.gatewayIp && !this.isGatewayWarned) {
      this.isGatewayWarned = true
      console.warn('[remote] 공유기(기본 게이트웨이) 주소를 읽지 못해 사설 대역 필터만 적용해요')
    }
  }

  private startWatch() {
    if (this.watchTimer) return
    this.watchTimer = setInterval(() => void this.checkNetwork(), this.deps.networkWatchMs ?? NETWORK_WATCH_MS)
    this.watchTimer.unref?.()
  }

  private stopWatch() {
    if (this.watchTimer) clearInterval(this.watchTimer)
    this.watchTimer = null
  }

  /** 전용 모드에서 내부 주소가 바뀌었으면 새 주소로 다시 귀를 연다 (토큰·QR 유지, 열린 연결은 끊긴다). 감시 타이머가 부르고, 테스트도 직접 부른다 */
  async checkNetwork() {
    if (this.mode === 'router' || !this.config.isEnabled || this.isChecking) return
    this.isChecking = true
    try {
      let now: string | null
      if (this.isTailscale) {
        await this.readTailscale()
        now = this.ts.address
        if (now === this.boundTs && (this.server.isListening || !now)) return
      } else {
        now = this.pickLan()
        if (now === this.boundLan && this.server.isListening) return
      }
      this.hub.closeAll('remote_disabled')
      await this.server.stop()
      await this.listen()
    } finally {
      this.isChecking = false
    }
  }
  private isChecking = false

  private async listen() {
    this.error = null
    // 전용 모드는 고른 내부 주소 하나에만 귀를 연다 (없으면 열지 않고 감시가 주소가 생기길 기다린다)
    // Tailscale 모드는 Tailscale 주소 하나에만 귀를 연다 (running이 아니면 열지 않고 감시가 켜지길 기다린다)
    if (this.isTailscale) {
      await this.readTailscale()
      this.boundTs = this.ts.address
      this.boundLan = null
      if (!this.ts.address) {
        this.error = 'no_network'
        return this.deps.changed()
      }
    }
    const lan = this.config.lanOnly ? this.pickLan() : null
    const host = this.isTailscale ? (this.deps.listenHost ?? this.ts.address) : this.config.lanOnly ? (this.deps.listenHost ?? lan) : this.deps.listenHost
    if (!this.isTailscale) this.boundLan = lan
    if (this.config.lanOnly) await this.refreshGateway()
    if (this.config.lanOnly && !lan) {
      this.error = 'no_network'
      return this.deps.changed()
    }
    try {
      await this.server.start({
        keyPem: this.keys!.keyPem,
        certPem: this.keys!.certPem,
        port: this.config.port,
        host: host ?? undefined,
        isAllowed: this.isTailscale ? isTailscaleClient : this.config.lanOnly ? (ip) => isAllowedClient(ip, this.gatewayIp) : undefined,
        handle: (req) =>
          req.url.startsWith('/v2/') && this.v2
            ? this.v2.call(req)
            : handleRequest(req, { guard: this.guard, office: this.deps.office, serverVersion: this.deps.serverVersion, now: this.now(), isReady: this.isReady }),
        // v2는 본문을 읽기 전에 앞단(인증 등)을 먼저 — 통과해야 /v2/call 본문을 1MB까지 받는다. v1은 16KB를 읽은 뒤 handleRequest가 판단
        precheck: (req) => (req.url.startsWith('/v2/') && this.v2 ? this.v2.precheck(req) : null),
        stream: (req, res, ctx) => this.v2?.stream(req, res, ctx) ?? false,
        onAccess: (entry) => {
          this.access = [entry, ...this.access].slice(0, ACCESS_KEEP)
          // 이 토큰으로 휴대폰이 처음 붙었으면 기억한다 (다음에 켤 때 토큰을 바꾸지 않게)
          if (this.guard.isTokenUsed && !this.config.isTokenUsed) this.save()
          this.deps.changed()
        },
      })
    } catch (e) {
      this.error = (e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'port_in_use' : 'start_failed'
    }
    this.deps.changed()
  }

  private async close() {
    this.stopWatch()
    if (this.renewTimer) clearInterval(this.renewTimer)
    this.renewTimer = null
    await this.server.stop()
    const gw = this.gateway
    this.gateway = null
    this.upnpState = { state: 'off' }
    if (gw && this.deps.upnp) await this.deps.upnp.remove(gw, this.config.port).catch(() => {})
    this.deps.changed()
  }

  /** 공유기 포트 열기 시도 — 실패해도 서버는 켜 둔다 (화면에 수동 안내) */
  private async mapPort() {
    const u = this.deps.upnp
    if (!u) return
    this.upnpState = { state: 'trying' }
    this.deps.changed()
    const gw = await u.find().catch(() => null)
    if (!gw) {
      this.upnpState = { state: 'failed', reason: 'no_gateway' }
      return this.deps.changed()
    }
    try {
      await u.add(gw, this.config.port)
      // 그 사이에 원격을 껐으면 바로 되돌린다
      if (!this.server.isListening) return void (await u.remove(gw, this.config.port).catch(() => {}))
      this.gateway = gw
      const ext = await u.external(gw).catch(() => null)
      this.upnpState = { state: 'ok', externalAddress: ext, isCarrierShared: Boolean(ext && upnp.isCarrierShared(ext)), isDoubleNat: Boolean(ext && upnp.isPrivateIpv4(ext)) }
      this.renewTimer = setInterval(() => void u.add(gw, this.config.port).catch(() => {}), LEASE_RENEW_MS)
      this.renewTimer.unref?.()
    } catch {
      this.upnpState = { state: 'failed', reason: 'refused' }
    }
    this.deps.changed()
  }
}
