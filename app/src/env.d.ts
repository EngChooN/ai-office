/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
/// <reference types="vite/client" />
import type { OfficeApi } from './shared/types'
import type { OfficeUpdateApi } from './shared/updateCheck'
import type { OfficePackApi } from './shared/staffPack'
import type { OfficeSceneApi } from './shared/sceneExport'

declare global {
  interface Window {
    office: OfficeApi
    /** 데스크톱 창 상태 (preload — 모바일 빌드에는 없다) */
    officeWindow?: { onShown(cb: (isShown: boolean) => void): () => void; isShown?(): Promise<boolean> }
    /** 앱 업데이트 확인 (preload — 모바일 빌드에는 없다) */
    officeUpdate?: OfficeUpdateApi
    /** 직원·랩 파일과 직원 마켓 (preload — 모바일 빌드에는 없다) */
    officePack?: OfficePackApi
    /** 사무실 장면 내보내기 저장 (preload — 모바일 빌드에는 없다) */
    officeScene?: OfficeSceneApi
    /** 안드로이드 셸이 넣는 메시지 통로 (모바일 빌드만, docs/specs/android-bridge.md) */
    OfficeBridge?: { postMessage(text: string): void; onmessage: ((e: { data: string }) => void) | null }
  }
  // 모바일 빌드(vite.mobile.config.mts)만 정의한다 — 데스크톱·main 빌드에는 없으니 typeof로 확인하고 읽는다
  const __OFFICE_SHELL__: string | undefined
  const __OFFICE_FILE_BASE__: string | undefined
}
