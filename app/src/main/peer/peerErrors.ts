// 연결·짝짓기·원격 직원 오류를 화면 문구 키로 (PairFailure·PeerError의 code가 그대로 키 뒤 조각이다)
import type { TKey } from '../../shared/i18n/dict/index.ts'

const KEYS = ['bad_host', 'bad_code', 'unreachable', 'closed', 'spki_mismatch', 'wrong_code', 'full', 'failed', 'no_staff', 'auto_edit', 'offline', 'unknown_peer'] as const

export function peerErrorKey(e: unknown): TKey {
  const code = (e as { code?: unknown })?.code
  const hit = KEYS.find((k) => k === code)
  if (hit) return `peer.error.${hit}`
  if (code === 'gone') return 'peer.delegate.gone'
  if (code === 'queue_full') return 'peer.delegate.queueFull'
  if (code === 'too_long') return 'peer.delegate.tooLong'
  return 'peer.error.failed'
}
