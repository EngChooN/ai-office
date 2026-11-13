// 연결·짝짓기 오류를 화면 문구 키로 (PairFailure·PeerError의 code가 그대로 키 뒤 조각이다)
import type { TKey } from '../../shared/i18n/dict/index.ts'

const KEYS = ['bad_host', 'bad_code', 'unreachable', 'closed', 'spki_mismatch', 'server_proof_mismatch', 'wrong_code', 'full', 'failed', 'offline', 'unknown_peer'] as const

export function peerErrorKey(e: unknown): TKey {
  const code = (e as { code?: unknown })?.code
  const hit = KEYS.find((k) => k === code)
  return hit ? `peer.error.${hit}` : 'peer.error.failed'
}
