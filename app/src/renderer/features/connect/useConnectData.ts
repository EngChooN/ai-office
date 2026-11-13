import { useCallback, useEffect, useState } from 'react'
import { IS_REMOTE_SCREEN } from '@/shell'
import type { RemoteStatus } from '@shared/types'
import type { PeerSlotView, PeerView } from '@shared/peerProtocol'
import type { WorkspaceView } from '@shared/workspace'
import { useWorkspaces } from '../workspace/useWorkspaces'

const TS_POLL_MS = 3000
const NO_WORKSPACES: WorkspaceView[] = []
/** 'N분 전 접속'을 맞추려고 상태를 다시 읽는 간격 — 휴대폰 접속 시각은 요청마다 화면에 알리지 않는다 */
const SEEN_POLL_MS = 15_000

/**
 * 설정 › 휴대폰·PC 연결이 읽는 상태를 한 곳에서: 원격 상태(+ Tailscale 3초 확인) · 이 PC를 보는 PC(slots) · 이 PC가 보는 PC(peers + PC 목록 workspaces)
 */
export function useConnectData({ isTsPolling }: { isTsPolling: boolean }) {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [slots, setSlots] = useState<PeerSlotView[]>([])
  const [peers, setPeers] = useState<PeerView[]>([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    void window.office.remoteStatus().then(setStatus)
    return window.office.onRemoteStatus(setStatus)
  }, [])
  // Tailscale 준비물을 보는 동안 3초마다 다시 읽는다 (사용자가 로그인을 마치면 저절로 다음 단계로).
  // 휴대폰은 PC의 Tailscale을 다시 확인할 수 없다(pc_only) — 바뀐 상태는 onRemoteStatus로 받는다
  const mode = status?.mode
  useEffect(() => {
    if (!isTsPolling || mode !== 'tailscale' || IS_REMOTE_SCREEN) return
    const read = () => void window.office.refreshRemoteTailscale().then(setStatus)
    read()
    const timer = setInterval(read, TS_POLL_MS)
    return () => clearInterval(timer)
  }, [mode, isTsPolling])
  const isEnabled = !!status?.isEnabled
  useEffect(() => {
    if (!isEnabled) return
    const timer = setInterval(() => {
      setNow(Date.now())
      void window.office.remoteStatus().then(setStatus)
    }, SEEN_POLL_MS)
    return () => clearInterval(timer)
  }, [isEnabled])
  const loadSlots = useCallback(() => void (IS_REMOTE_SCREEN ? undefined : window.office.peerSlots().then((list) => setSlots(list ?? []))), [])
  const loadPeers = useCallback(() => void (IS_REMOTE_SCREEN ? undefined : window.office.peerList().then((list) => setPeers(list ?? []))), [])
  useEffect(loadSlots, [loadSlots])
  // PC 목록이 바뀌면(추가·해제·연결 상태) 짝 목록도 다시 읽는다
  const ws = useWorkspaces()
  const workspaces = ws?.list ?? NO_WORKSPACES
  useEffect(loadPeers, [loadPeers, workspaces])
  // 이 PC가 보는 PC의 연결 상태는 이 PC 연결(서버)을 켜지 않아도 바뀐다 — 따로 다시 읽는다
  useEffect(() => {
    if (IS_REMOTE_SCREEN) return
    const timer = setInterval(loadPeers, SEEN_POLL_MS)
    return () => clearInterval(timer)
  }, [loadPeers])
  return { status, setStatus, slots, peers, workspaces, loadSlots, loadPeers, now }
}
