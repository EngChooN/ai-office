import { create } from 'zustand'
import type { ConnectionState } from '../mobile/bridge'

// 원격 창(다른 PC 화면)에만 있는 화면 상태: 연결 상태·한 줄 안내. 데스크톱 store(store.ts)에는 원격 사정을 넣지 않는다

interface RemoteUiState {
  connection: ConnectionState
  /** 화면 띠 아래 한 줄 안내 (PC 전용 동작 등) */
  notice: { text: string; at: number } | null
  /** 연결된 PC가 예전 버전이라 칸 배치를 못 함 */
  isPcOutdated: boolean
  showNotice(text: string): void
}

export const useRemoteUi = create<RemoteUiState>((set) => ({
  connection: 'connecting',
  notice: null,
  isPcOutdated: false,
  showNotice: (text) => set({ notice: { text, at: Date.now() } }),
}))
