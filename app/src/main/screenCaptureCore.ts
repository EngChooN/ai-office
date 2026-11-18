// 화면 캡처 순수 부분 — electron 없이 맥·윈도우를 번갈아 가정해 테스트한다

/** 캡처 한 번에 필요한 화면 정보 — 테스트에서 가짜로 넣을 수 있게 electron과 떼어 둔다 */
export interface CaptureSource {
  /** 화면 하나의 id (Display.id 문자열과 맞춘다) */
  displayId: string
  /** 화면 이미지를 PNG 바이트로 (비어 있으면 못 찍은 것) */
  toPng(): Buffer
}

export interface CaptureDeps {
  /** 주 화면의 실제 픽셀 크기 — 화면 배율(DPI)을 곱해 흐려지지 않게 한다 */
  primary(): { id: string; width: number; height: number; scaleFactor: number }
  sources(size: { width: number; height: number }): Promise<CaptureSource[]>
}

/** 배율을 곱한 실제 픽셀 크기 (윈도우 125%·150% 화면에서 흐려지지 않게) */
export function physicalSize(d: { width: number; height: number; scaleFactor: number }): { width: number; height: number } {
  const f = d.scaleFactor > 0 ? d.scaleFactor : 1
  return { width: Math.max(1, Math.round(d.width * f)), height: Math.max(1, Math.round(d.height * f)) }
}

/** 주 화면을 PNG로 찍는다. 못 찍으면 null (권한 없음·화면 없음) */
export async function captureScreenPng(deps: CaptureDeps): Promise<Buffer | null> {
  const primary = deps.primary()
  const list = await deps.sources(physicalSize(primary))
  const src = list.find((s) => s.displayId === primary.id) ?? list[0]
  if (!src) return null
  const png = src.toPng()
  return png.length > 0 ? png : null
}
