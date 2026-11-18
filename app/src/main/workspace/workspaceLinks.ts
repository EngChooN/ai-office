// 화면 보기 연결 (진짜 WorkspaceLinks): 짝지은 PC의 실시간 연결을 PeerManager와 함께 쓰고, 허락 확인·상태·창 요청을 맡는다
// 연결 줄은 PC당 하나(PeerManager가 이미 연 줄). 허락된 열쇠는 그 줄로 휴대폰과 같은 이벤트를 받는다 — 두 번째 줄을 열지 않는다
// 상태는 statusOf 한 곳에서만 정한다. 기다리는 단계마다 끝나는 시각이 있어 '연결하는 중'에 머물지 않는다 (scripts/workspace.test.mts)
// 설계: docs/design-refresh/connect-workspace/links-design-decision.md

import { PEER_LIMITS, type PeerLinkState } from '../../shared/peerProtocol.ts'
import { statusOf, WORKSPACE_OFFLINE_GRACE_MS, type WorkspaceHello, type WorkspaceLinkState, type WorkspaceStatus } from '../../shared/workspace.ts'
import type { PeerLinkEvent } from '../peer/peerManager.ts'
import type { PeerHttp } from '../peer/peerTransport.ts'
import { failureOf, helloFromResult, isOldPeerReply, OLD_PEER_HELLO, pendingFromSnapshot } from './linkModel.ts'
import type { LinkListener, RemoteRequest, WorkspaceLinks } from './workspaceService.ts'

/** PeerManager에서 쓰는 것만 (테스트가 가짜를 꽂는다) */
export interface LinkPeers {
  linkState(peerId: string): PeerLinkState
  http(peerId: string): PeerHttp | null
  watch(fn: (peerId: string, e: PeerLinkEvent) => void): () => void
}

export interface LinksDeps {
  peers: LinkPeers
  peerIdOf(workspaceId: string): string | null
  /** 내려받은 파일을 이 PC의 다운로드 폴더에 저장하고 저장한 이름을 돌려준다 */
  saveDownload(name: string, data: Buffer): Promise<string>
  appVersion: string
  platform: string
  now?: () => number
  /** hello 응답을 기다리는 시간 */
  helloTimeoutMs?: number
  retryMs?: readonly number[]
}

/** 올리기 상한 (휴대폰 셸과 같은 20MB) · 받기 상한 */
const UPLOAD_MAX = 20 * 1024 * 1024
const DOWNLOAD_MAX = 200 * 1024 * 1024
/** 결과물 받기 상한 (저쪽 PC 저장 한도 5MB와 같다 — 넘으면 저쪽이 413으로 막는다) */
const ARTIFACT_MAX = 5 * 1024 * 1024
const IMAGE_MAX = 20 * 1024 * 1024
const ID_SHAPE = /^[0-9a-f-]{36}$/i
const artifactPath = (id: string, version?: number) => `/v2/artifacts/${id}${version ? `/${version}` : ''}`

/** 앞 몇 바이트로 그림·PDF 종류를 알아본다 (저쪽 응답의 Content-Type은 getBytes가 넘기지 않는다). 모르면 내려받기용 */
export function sniffMime(d: Buffer): string {
  if (d.length >= 8 && d.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (d.length >= 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return 'image/jpeg'
  if (d.length >= 6 && /^GIF8[79]a$/.test(d.subarray(0, 6).toString('latin1'))) return 'image/gif'
  if (d.length >= 12 && d.subarray(0, 4).toString('latin1') === 'RIFF' && d.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (d.length >= 5 && d.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  return 'application/octet-stream'
}
/** 한 PC로 동시에 보내는 요청 수 (휴대폰 셸과 같은 5개, docs/specs/android-bridge.md 3절) */
const CONCURRENT_MAX = 5
const HELLO_TIMEOUT_MS = 10_000

interface Rec {
  peerId: string
  downSince?: number
  hasBeenOnline: boolean
  hello: WorkspaceHello | null
  error: string | null
  pending: number
  /** 다음 hello에 허락을 요청할지 — PC를 추가했거나 '다시 요청'을 눌렀을 때만 (거절 뒤 저쪽에 카드가 계속 뜨지 않게) */
  wantsGrant: boolean
  /** 이 PC가 허락을 요청한 적이 있는지 — 있으면 서버의 'none'은 거절, 없으면 요청 전 */
  hasAsked: boolean
  /** 늦게 온 hello 응답을 버리려고 */
  seq: number
  attempt: number
  timer: ReturnType<typeof setTimeout> | null
  clock: ReturnType<typeof setTimeout> | null
  running: number
  queue: (() => void)[]
  /** 마지막으로 알린 상태 — 줄 상태는 알림을 받기 전에 이미 바뀌어 있어 '바뀌기 전'을 다시 계산할 수 없다 */
  last: WorkspaceStatus
}

type Fail = { status: number; code: string; message: string; alternative?: string; reason?: string }
const fail = (status: number, code: string, message = '', extra: Record<string, unknown> = {}): Fail => ({
  status,
  code,
  message,
  ...(typeof extra.alternative === 'string' ? { alternative: extra.alternative } : {}),
  ...(typeof extra.reason === 'string' ? { reason: extra.reason } : {}),
})
/** 저쪽 PC 응답 본문의 실패를 창이 받는 모양으로 */
const failOf = (status: number, body: Record<string, unknown>) => fail(status, typeof body.error === 'string' ? body.error : 'call_failed', typeof body.message === 'string' ? body.message : '', body)

const linkOf = (s: PeerLinkState): WorkspaceLinkState => (s === 'unpaired' ? 'offline' : s)

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    t.unref?.()
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })
}

export function createWorkspaceLinks(deps: LinksDeps): WorkspaceLinks & { dispose(): void } {
  const now = deps.now ?? Date.now
  const recs = new Map<string, Rec>()
  let listener: LinkListener = { changed: () => {}, message: () => {} }

  const statusOfRec = (r: Rec): WorkspaceStatus =>
    statusOf({ link: linkOf(deps.peers.linkState(r.peerId)), downSince: r.downSince, hasBeenOnline: r.hasBeenOnline, hello: r.hello, error: r.error, now: now() })

  /** 창의 연결 띠: 준비됨 = open · 끊긴 지 8초 = closed · 그 사이 = reconnecting */
  const connectionOf = (s: WorkspaceStatus) => (s === 'ready' ? 'open' : s === 'offline' ? 'closed' : s === 'reconnecting' ? 'reconnecting' : 'connecting')

  /** 기록을 바꾸고, 상태·결재 수가 달라졌으면 목록과 창에 알린다 */
  const update = (id: string, r: Rec, change: () => void) => {
    const pendingBefore = r.pending
    change()
    if (recs.get(id) !== r) return
    const after = statusOfRec(r)
    const isChanged = r.last !== after
    r.last = after
    if (isChanged) listener.message(id, { type: 'connection', state: connectionOf(after) })
    if (isChanged || pendingBefore !== r.pending) listener.changed()
  }

  /** 끊긴 지 8초가 되는 때 한 번 다시 판정한다 (statusOf는 시간을 받아 계산할 뿐 스스로 불리지 않는다) */
  const armClock = (id: string, r: Rec) => {
    if (r.clock) clearTimeout(r.clock)
    if (r.downSince === undefined) return
    r.clock = setTimeout(() => {
      r.clock = null
      update(id, r, () => {})
    }, Math.max(0, r.downSince + WORKSPACE_OFFLINE_GRACE_MS - now()) + 20)
    r.clock.unref?.()
  }

  const retryLater = (id: string, r: Rec) => {
    if (r.timer) clearTimeout(r.timer)
    const delays = deps.retryMs ?? PEER_LIMITS.retryMs
    r.timer = setTimeout(
      () => {
        r.timer = null
        if (recs.get(id) === r && deps.peers.linkState(r.peerId) === 'online') void verify(id, r)
      },
      delays[Math.min(r.attempt++, delays.length - 1)],
    )
    r.timer.unref?.()
  }

  /** 연결 직후 허락·버전 확인: /v2/call hello. 답이 없으면 정해진 시간 뒤 끊김(unreachable)으로 두고 다시 시도한다 */
  const verify = async (id: string, r: Rec) => {
    const seq = ++r.seq
    const http = deps.peers.http(r.peerId)
    if (!http) return update(id, r, () => (r.error = 'unauthorized'))
    const requestView = r.wantsGrant
    let res: { status: number; body: Record<string, unknown> }
    try {
      res = await withTimeout(http.call('POST', '/v2/call', { method: 'hello', args: [{ capabilities: ['iso-office'], requestView }] }), deps.helloTimeoutMs ?? HELLO_TIMEOUT_MS)
    } catch {
      if (seq !== r.seq || recs.get(id) !== r) return
      // 줄이 끊긴 상태라면 PeerClient가 다시 붙을 때 다시 묻는다.
      // unpaired면 지금 사유를 그대로 둔다 — 짝 풀림 알림은 이미 다시 짝짓기로 적었고, 앱을 켠 직후(연결 시작 전)에는 응답 없음만으로 다시 짝짓기를 띄우지 않는다
      const link = deps.peers.linkState(r.peerId)
      update(id, r, () => (r.error = link === 'unpaired' ? r.error : link === 'online' ? 'unreachable' : null))
      if (link === 'online') retryLater(id, r)
      return
    }
    if (seq !== r.seq || recs.get(id) !== r) return
    if (requestView) {
      r.wantsGrant = false
      r.hasAsked = true
    }
    if (res.status === 200 && res.body.ok === true) {
      r.attempt = 0
      return update(id, r, () => {
        const hello = helloFromResult(res.body.result) ?? OLD_PEER_HELLO
        r.hello = hello.grant === 'none' && r.hasAsked ? { ...hello, grant: 'denied' } : hello
        r.error = null
      })
    }
    if (isOldPeerReply(res.body)) {
      return update(id, r, () => {
        r.hello = OLD_PEER_HELLO
        r.error = null
      })
    }
    const reason = failureOf(res.status, res.body)
    if (reason) return update(id, r, () => (r.error = reason))
    // 잠시 뒤 다시 (rate_limited·5xx 등)
    update(id, r, () => (r.error = 'unreachable'))
    retryLater(id, r)
  }

  const onPeer = (peerId: string, e: PeerLinkEvent) => {
    for (const [id, r] of recs) {
      if (r.peerId !== peerId) continue
      if (e.type === 'state') {
        if (e.state === 'online') {
          update(id, r, () => {
            r.hasBeenOnline = true
            r.downSince = undefined
            r.attempt = 0
            // 줄이 붙었으면 열쇠는 살아 있다 — 지난 실패는 hello가 다시 정한다
            r.error = null
          })
          armClock(id, r)
          void verify(id, r)
        } else if (e.state === 'unpaired') {
          update(id, r, () => (r.error = 'unauthorized'))
          // 426(이 PC가 낡음)인지 hello로 사유를 알아낸다
          void verify(id, r)
        } else {
          update(id, r, () => {
            if (r.downSince === undefined) r.downSince = now()
            // 다시 붙는 중이면(새로 짝지음 포함) 지난 짝 풀림·응답 없음은 지운다
            r.error = null
          })
          armClock(id, r)
        }
      } else if (e.name === 'snapshot') {
        update(id, r, () => (r.pending = pendingFromSnapshot(e.data)))
        listener.message(id, { type: 'event', name: e.name, data: e.data })
      } else if (e.name === 'hello') {
        // 보관 범위 밖에서 다시 붙었다 — 창이 스냅샷·기록을 다시 읽게 한다
        if (r.hasBeenOnline && (e.data as { resync?: unknown } | null)?.resync === true) listener.message(id, { type: 'resync' })
      } else if (e.name !== 'bye') {
        listener.message(id, { type: 'event', name: e.name, data: e.data })
      }
    }
  }
  const unwatch = deps.peers.watch(onPeer)

  const add = (id: string, peerId: string) => {
    const r: Rec = { peerId, downSince: now(), hasBeenOnline: false, hello: null, error: null, pending: 0, wantsGrant: false, hasAsked: false, seq: 0, attempt: 0, timer: null, clock: null, running: 0, queue: [], last: 'connecting' }
    recs.set(id, r)
    const link = deps.peers.linkState(peerId)
    if (link === 'online') {
      r.hasBeenOnline = true
      r.downSince = undefined
      void verify(id, r)
    } else if (link === 'unpaired') {
      // 앱을 켠 직후(연결 시작 전)에도 unpaired로 보인다 — 짝 풀림인지는 hello로 확인한다
      void verify(id, r)
    }
    r.last = statusOfRec(r)
    armClock(id, r)
  }

  const drop = (id: string) => {
    const r = recs.get(id)
    if (!r) return
    for (const t of [r.timer, r.clock]) if (t) clearTimeout(t)
    r.seq++
    recs.delete(id)
  }

  /** 한 PC에 동시에 5개까지 — 넘는 요청은 차례를 기다린다 */
  const limited = <T>(r: Rec, run: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const go = () => {
        r.running++
        run()
          .then(resolve, reject)
          .finally(() => {
            r.running--
            r.queue.shift()?.()
          })
      }
      if (r.running < CONCURRENT_MAX) go()
      else r.queue.push(go)
    })

  const send = async (http: PeerHttp, req: RemoteRequest): Promise<unknown> => {
    if (req.type === 'call') {
      const res = await http.call('POST', '/v2/call', { method: req.method, args: req.args, ...(req.confirm ? { confirm: true } : {}) }).catch(() => {
        throw fail(0, 'unreachable')
      })
      if (res.status === 200 && res.body.ok === true) return res.body.result ?? null
      throw failOf(res.status, res.body)
    }
    if (req.type === 'upload') {
      const data = Buffer.from(req.base64, 'base64')
      if (data.length > UPLOAD_MAX) throw fail(413, 'payload_too_large')
      if (!http.postBytes) throw fail(0, 'unreachable')
      const res = await http.postBytes('/v2/attachments', data, { 'Content-Type': req.mime || 'application/octet-stream', 'X-File-Name': encodeURIComponent(req.name) }).catch(() => {
        throw fail(0, 'unreachable')
      })
      if ((res.status === 200 || res.status === 201) && res.body.attachment) return res.body.attachment
      throw failOf(res.status, res.body)
    }
    if (!ID_SHAPE.test(req.fileId)) throw fail(400, 'invalid_request')
    if (!http.getBytes) throw fail(0, 'unreachable')
    const isArtifact = req.type === 'read' || req.kind === 'artifact'
    const path = isArtifact ? artifactPath(req.fileId, req.version) : `/v2/files/${req.fileId}`
    const res = await http.getBytes(path, isArtifact ? ARTIFACT_MAX : DOWNLOAD_MAX).catch(() => {
      throw fail(0, 'unreachable')
    })
    if (res.status !== 200 || !res.data) throw fail(res.status, res.status === 404 ? 'file_not_found' : res.status === 413 ? 'payload_too_large' : 'call_failed')
    if (req.type === 'read') return { name: res.fileName ?? '', text: res.data.toString('utf8') }
    return deps.saveDownload(req.name || res.fileName || 'file', res.data)
  }

  return {
    status: (id) => {
      const r = recs.get(id)
      return r ? statusOfRec(r) : 'connecting'
    },
    pending: (id) => recs.get(id)?.pending ?? 0,
    readFile: async (id, fileId) => {
      const r = recs.get(id)
      const http = r ? deps.peers.http(r.peerId) : null
      if (!r || !http?.getBytes || !ID_SHAPE.test(fileId)) return null
      const res = await limited(r, () => http.getBytes!(`/v2/files/${fileId}`, IMAGE_MAX)).catch(() => null)
      return res?.status === 200 && res.data ? { data: res.data, mime: sniffMime(res.data) } : null
    },
    request: (id, req) => {
      const r = recs.get(id)
      const http = r ? deps.peers.http(r.peerId) : null
      if (!r || !http) return Promise.reject(fail(0, 'workspace_not_ready'))
      return limited(r, () => send(http, req))
    },
    sync: (ids) => {
      for (const id of [...recs.keys()]) if (!ids.includes(id)) drop(id)
      for (const id of ids) {
        if (recs.has(id)) continue
        const peerId = deps.peerIdOf(id)
        if (peerId) add(id, peerId)
      }
    },
    listen: (l) => {
      listener = l
    },
    ready: (id) => {
      const r = recs.get(id)
      if (!r) return
      listener.message(id, { type: 'hello', platform: deps.platform, appVersion: deps.appVersion, protocol: 2, isTablet: false })
      listener.message(id, { type: 'connection', state: connectionOf(statusOfRec(r)) })
    },
    requestGrant: (id) => {
      const r = recs.get(id)
      if (!r) return
      r.wantsGrant = true
      if (deps.peers.linkState(r.peerId) === 'online') void verify(id, r)
    },
    dispose: () => {
      unwatch()
      for (const id of [...recs.keys()]) drop(id)
    },
  }
}
