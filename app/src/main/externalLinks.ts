import { shell, type WebContents } from 'electron'
import { externalUrl } from '../shared/externalLink.ts'

/** 이 창의 새 창 요청(target=_blank·window.open)은 모두 거절하고, http·https 주소만 기본 브라우저로 연다 */
export function openLinksInBrowser(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    const safe = externalUrl(url)
    if (safe) void shell.openExternal(safe)
    return { action: 'deny' }
  })
}
