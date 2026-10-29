// 사무실 장면 내보내기(GIF·PNG) — main·preload·renderer가 함께 쓰는 계약 (docs/specs/gif-export-tech.md)

/** 워터마크에 넣는 주소 (바꿀 때 여기 한 곳만) */
export const SITE_URL = 'engchoon.github.io/ai-office'

/** GIF 용량 한도 — 링크드인 5MB가 확인된 가장 빡빡한 한도 (beta-launch.md 6-1) */
export const GIF_MAX_BYTES = 5 * 1024 * 1024
/** GIF 길이 (고정) */
export const GIF_SECONDS = 10

/** 렌더러 → main 한 번에 받을 최대 크기 (5MB 한도를 못 맞춘 GIF·큰 PNG까지 여유) */
export const SCENE_FILE_MAX_BYTES = 64 * 1024 * 1024

export type SceneFileKind = 'gif' | 'png'

/** 저장 실패 원인 (문구는 렌더러 사전 export.err.*) */
export type SceneSaveReason = 'noPermission' | 'diskFull' | 'unknown'

export type SceneSaveResult = { ok: true; path: string; name: string; bytes: number } | { ok: false; reason: SceneSaveReason }

/** 어느 폴더에 저장할지 — 경로는 렌더러가 보내지 않는다. 'picked'인데 고른 폴더가 없으면 기본 폴더 */
export type SceneFolderTarget = 'default' | 'picked'

/** 지금 저장 폴더 (화면 표시용). isPicked = 사용자가 대화창으로 고른 폴더 */
export interface SceneFolder {
  dir: string
  isPicked: boolean
}

/** preload가 window.officeScene으로 내놓는 것 (PC 전용 scene:* 채널 — 모바일 빌드에는 없다) */
export interface OfficeSceneApi {
  /** 기본 폴더(~/Pictures/AI Office) 또는 main이 기억하는 고른 폴더에 ai-office-YYYYMMDD-HHmm.<kind>로 쓴다 */
  save(data: Uint8Array, kind: SceneFileKind, target: SceneFolderTarget): Promise<SceneSaveResult>
  /** 지금 저장 폴더 */
  folder(): Promise<SceneFolder>
  /** 이번 실행에서 저장한 파일만 Finder·탐색기에서 선택해 연다 */
  openFolder(filePath: string): Promise<void>
  /** 다른 저장 폴더 고르기 (main이 기억). 취소하면 null */
  pickFolder(): Promise<SceneFolder | null>
}
