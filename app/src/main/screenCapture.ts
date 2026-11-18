import { desktopCapturer, screen } from 'electron'
import type { CaptureDeps } from './screenCaptureCore'

// 화면 캡처: 맥·윈도우 공통으로 앱 기본 기능(desktopCapturer)을 쓴다. 외부 명령(screencapture)에 기대지 않는다
export { captureScreenPng } from './screenCaptureCore'

export const electronCaptureDeps: CaptureDeps = {
  primary() {
    const d = screen.getPrimaryDisplay()
    return { id: String(d.id), width: d.size.width, height: d.size.height, scaleFactor: d.scaleFactor }
  },
  async sources(size) {
    const list = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
    return list.map((s) => ({ displayId: s.display_id, toPng: () => s.thumbnail.toPNG() }))
  },
}
