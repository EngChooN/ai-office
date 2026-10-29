// 내보내기 한 장 만들기: 지도 영역에서 16:9를 잘라 줄이고, 워터마크(A안)를 맨 위에 덮어 그린다 (gif-export-design.md 1·2장)
// 워터마크를 인코더 앞에서 그리므로 결과물 100%에 들어간다
import iconUrl from '../../../../build/icon.png'
import { SITE_URL } from '@shared/sceneExport'

/** GIF 크기 (16:9). 한도를 넘으면 인코더가 폭을 줄인다 */
export const GIF_SIZE = { w: 800, h: 450 }
/** PNG 최대 크기 — 지도가 이보다 작으면 원본 크기 그대로 (늘리지 않는다) */
const PNG_MAX_W = 1920

/** 워터마크 고정 색 — 화면 테마와 상관없이 늘 같아야 해서 토큰을 쓰지 않는다 */
const WM = { box: '#0B0C10', border: '#2A2E3A', title: '#FFFFFF', divider: '#3A3F4D', url: '#AAB1C2' }
const WM_FONT = '-apple-system, "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", sans-serif'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 지도 영역(기기 px) 가운데에서 가장 큰 16:9 */
export function cropOf(map: { w: number; h: number }): Rect {
  const w = Math.min(map.w, Math.floor((map.h * 16) / 9))
  const h = Math.min(map.h, Math.floor((w * 9) / 16))
  return { x: Math.floor((map.w - w) / 2), y: Math.floor((map.h - h) / 2), w, h }
}

/** PNG 크기: 자른 영역 폭을 1920까지만 (짝수로) */
export function pngSizeOf(crop: Rect) {
  const w = Math.min(PNG_MAX_W, crop.w - (crop.w % 2))
  return { w, h: Math.round((w * 9) / 16) }
}

let iconPromise: Promise<HTMLImageElement> | null = null
export function loadIcon() {
  iconPromise ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      iconPromise = null
      reject(new Error('icon'))
    }
    img.src = iconUrl
  })
  return iconPromise
}

/**
 * A안 워터마크 한 장 (출력 폭 W에 비례): 상자 높이 W×3.75%, 오른쪽 아래 여백 W×2.5%.
 * 불투명 단색 상자 — GIF는 256색이라 반투명이면 프레임마다 디더링이 달라져 지글거린다
 */
export function makeWatermark(outW: number, icon: HTMLImageElement | null) {
  const boxH = Math.round(outW * 0.0375)
  const pad = Math.round(boxH * 0.32)
  const gap = Math.round(boxH * 0.25)
  const iconSize = Math.round(boxH * 0.62)
  const titleFont = `700 ${Math.round(boxH * 0.42)}px ${WM_FONT}`
  const urlFont = `400 ${Math.round(boxH * 0.36)}px ${WM_FONT}`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = titleFont
  const titleW = Math.ceil(measure.measureText('AI Office').width)
  measure.font = urlFont
  const urlW = Math.ceil(measure.measureText(SITE_URL).width)
  const boxW = pad + (icon ? iconSize + gap : 0) + titleW + gap * 2 + 1 + urlW + pad

  const canvas = Object.assign(document.createElement('canvas'), { width: boxW, height: boxH })
  const c = canvas.getContext('2d')!
  c.fillStyle = WM.border
  c.fillRect(0, 0, boxW, boxH)
  c.fillStyle = WM.box
  c.fillRect(1, 1, boxW - 2, boxH - 2)
  let x = pad
  if (icon) {
    c.imageSmoothingQuality = 'high'
    c.drawImage(icon, x, Math.round((boxH - iconSize) / 2), iconSize, iconSize)
    x += iconSize + gap
  }
  c.textBaseline = 'middle'
  c.font = titleFont
  c.fillStyle = WM.title
  c.fillText('AI Office', x, boxH / 2)
  x += titleW + gap
  c.fillStyle = WM.divider
  c.fillRect(x, Math.round(boxH * 0.25), 1, Math.round(boxH * 0.5))
  x += 1 + gap
  c.font = urlFont
  c.fillStyle = WM.url
  c.fillText(SITE_URL, x, boxH / 2)
  return { canvas, margin: Math.round(outW * 0.025) }
}

export type Watermark = ReturnType<typeof makeWatermark>

/** 게임 캔버스의 자른 영역을 out 캔버스 크기로 줄이고 워터마크를 덮는다 */
export function composeFrame(out: CanvasRenderingContext2D, src: HTMLCanvasElement, crop: Rect, mark: Watermark) {
  const { width: w, height: h } = out.canvas
  // 픽셀 아트지만 3배쯤 줄이므로 부드럽게 줄여야 이름표 글자가 읽힌다 (팔레트는 첫 장면에서 한 번만 잡아 용량 영향이 작다)
  out.imageSmoothingEnabled = true
  out.imageSmoothingQuality = 'high'
  out.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h)
  out.drawImage(mark.canvas, w - mark.canvas.width - mark.margin, h - mark.canvas.height - mark.margin)
}
