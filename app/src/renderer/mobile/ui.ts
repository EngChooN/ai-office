import { create } from 'zustand'
import type { View } from '@/store'
import type { ConnectionState } from './bridge'

// 모바일 빌드에만 있는 화면 상태: 경로 입력 시트·한 줄 안내·연결 상태·더보기·탭 기록·키보드
// 데스크톱 store(store.ts)에는 원격 사정을 넣지 않는다

export type PathKind = 'folder' | 'files'

interface MobileUiState {
  /** 경로 입력 시트 (pickFolder·pickFiles 대신) — 고르면 resolve */
  pathRequest: { kind: PathKind; resolve: (value: string | string[] | null) => void } | null
  /** 화면 아래 한 줄 안내 */
  notice: { text: string; at: number } | null
  connection: ConnectionState
  /** 한 번이라도 연결됐는지 (처음 연결 중에는 배너를 띄우지 않는다) */
  wasOpen: boolean
  /** 끊겼다가 다시 연결된 시각 ("다시 연결됐어요" 잠깐) */
  reconnectedAt: number | null
  /** 끊기기 전 마지막으로 받은 시각 */
  lastEventAt: number | null
  isMoreOpen: boolean
  /** 뒤로 가기용 지난 화면 */
  history: View[]
  isKeyboardOpen: boolean
  /** 연결된 PC가 예전 버전이라 칸 배치를 못 함 (hello 404·능력 없음) — 꾸미기 서랍이 "PC를 업데이트" 안내로 바뀐다 */
  isPcOutdated: boolean
  requestPath(kind: PathKind): Promise<string | string[] | null>
  finishPath(value: string | string[] | null): void
  showNotice(text: string): void
  setMoreOpen(v: boolean): void
}

export const useMobileUi = create<MobileUiState>((set, get) => ({
  pathRequest: null,
  notice: null,
  connection: 'connecting',
  wasOpen: false,
  reconnectedAt: null,
  lastEventAt: null,
  isMoreOpen: false,
  history: [],
  isKeyboardOpen: false,
  isPcOutdated: false,
  requestPath: (kind) =>
    new Promise((resolve) => {
      get().pathRequest?.resolve(null)
      set({ pathRequest: { kind, resolve } })
    }),
  finishPath: (value) => {
    get().pathRequest?.resolve(value)
    set({ pathRequest: null })
  },
  showNotice: (text) => set({ notice: { text, at: Date.now() } }),
  setMoreOpen: (isMoreOpen) => set({ isMoreOpen }),
}))
