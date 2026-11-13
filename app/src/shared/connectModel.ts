// 설정 › 휴대폰·PC 연결(단계형) 화면의 판단 — 어느 단계가 끝났는지, 연결된 기기 몇 대인지, 새 휴대폰이 지금 휴대폰을 끊는지.
// 상태값 → 결과의 표로 두어 화면 없이 시험한다 (scripts/connectModel.test.mts)
import type { RemoteStatus } from './types'
import type { PeerSlotView, PeerView } from './peerProtocol'
import type { WorkspaceView } from './workspace'

/** '지금 연결됨'으로 보는 시간 — 휴대폰·다른 PC가 이 안에 접속했으면 */
export const ONLINE_MS = 2 * 60_000

/** ② 준비물 확인: 이 PC에서 확인할 수 있는 것만 ✓ (휴대폰 쪽 Tailscale은 PC가 알 수 없어 늘 '직접 확인') */
export function readinessOf(status: Pick<RemoteStatus, 'mode' | 'tsState'>): { isReady: boolean; pc: 'ok' | Exclude<RemoteStatus['tsState'], 'running'> } {
  if (status.mode !== 'tailscale') return { isReady: true, pc: 'ok' }
  const ts = status.tsState
  return ts === 'running' ? { isReady: true, pc: 'ok' } : { isReady: false, pc: ts }
}

/** [+ 기기 추가 › 휴대폰]: 휴대폰 열쇠는 하나라, 이미 붙은 휴대폰이 있으면 새 QR(재발급)이 지금 휴대폰을 끊는다 */
export const phoneAddAction = (status: Pick<RemoteStatus, 'isTokenUsed'>): 'show' | 'replace' => (status.isTokenUsed ? 'replace' : 'show')

export type ConnectDevice =
  | { kind: 'phone'; id: 'phone'; seenAt: number | null; isOnline: boolean }
  /** 이 PC가 보는 PC — 짝(peer)과 PC 목록 항목(workspace: 이름·색)을 같은 PC면 한 줄로 합친다. 목록에만 있고 짝이 없으면 peer null(다시 연결 필요) */
  | { kind: 'pc'; id: string; name: string; isOnline: boolean; peer: PeerView | null; workspace: WorkspaceView | null }
  /** 이 PC를 보는 PC (이 PC가 열쇠를 내준 슬롯) */
  | { kind: 'to'; id: string; name: string; seenAt: number | null; isOnline: boolean }

/** 연결된 기기 목록 — 휴대폰(열쇠가 쓰였으면 1대) + 이 PC가 보는 PC + 이 PC를 보는 PC */
export function devicesOf({ status, slots, peers, workspaces, now }: { status: Pick<RemoteStatus, 'isTokenUsed' | 'phoneSeenAt'>; slots: PeerSlotView[]; peers: PeerView[]; workspaces: WorkspaceView[]; now: number }): ConnectDevice[] {
  const isRecent = (at: number | null) => at !== null && now - at < ONLINE_MS
  const byPeer = new Map(workspaces.map((w) => [w.peerId, w]))
  const peerIds = new Set(peers.map((p) => p.id))
  return [
    ...(status.isTokenUsed ? [{ kind: 'phone', id: 'phone', seenAt: status.phoneSeenAt, isOnline: isRecent(status.phoneSeenAt) } as const] : []),
    ...peers.map((p) => {
      const w = byPeer.get(p.id) ?? null
      return { kind: 'pc', id: p.id, name: w?.name ?? p.name, isOnline: p.state === 'online', peer: p, workspace: w } as const
    }),
    ...workspaces.filter((w) => !peerIds.has(w.peerId)).map((w) => ({ kind: 'pc', id: w.peerId, name: w.name, isOnline: false, peer: null, workspace: w }) as const),
    ...slots.map((s) => ({ kind: 'to', id: s.id, name: s.label, seenAt: s.lastSeenAt, isOnline: isRecent(s.lastSeenAt) }) as const),
  ]
}

/** 마지막 접속 한 줄: 1분 안 '방금', 1시간 안 'N분 전', 하루 안 'N시간 전', 그 뒤 'M월 D일' (null = 이 PC를 켠 뒤 아직 접속 안 함) */
export function seenAgo(at: number | null, now: number): { key: 'connect.seen.never' | 'connect.seen.now' | 'connect.seen.min' | 'connect.seen.hour' | 'connect.seen.date'; n?: number; month?: number; day?: number } {
  if (at === null) return { key: 'connect.seen.never' }
  const diff = Math.max(0, now - at)
  if (diff < 60_000) return { key: 'connect.seen.now' }
  if (diff < 3_600_000) return { key: 'connect.seen.min', n: Math.floor(diff / 60_000) }
  if (diff < 86_400_000) return { key: 'connect.seen.hour', n: Math.floor(diff / 3_600_000) }
  const d = new Date(at)
  return { key: 'connect.seen.date', month: d.getMonth() + 1, day: d.getDate() }
}
