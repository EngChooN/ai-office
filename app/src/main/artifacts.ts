import { app, dialog, session, shell, protocol, webContents, type WebContents } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ARTIFACT_SCHEME, artifactDocument, artifactUrl, withCspMeta } from '../shared/artifact.ts'
import type { ArtifactInfo, ArtifactVersionInfo, ArtifactView } from '../shared/types'
import { artifactVersions, findArtifactVersion, listArtifacts, readArtifactText, respondArtifact, saveArtifact } from './artifactStore.ts'

// 아티팩트 화면 쪽: 앱 데이터 폴더 저장소 + 전용 주소(office-artifact://<id>/<버전>) 응답 + 페이지 이동·새 창·다운로드 차단

const root = () => {
  const d = path.join(app.getPath('userData'), 'artifacts')
  fs.mkdirSync(d, { recursive: true })
  return d
}

/** registerAttachmentScheme과 한 번에 등록한다 — 앱과 다른 출처로 가두기 위해 standard·secure만 준다 (fetch·CSP 우회 없음) */
export const ARTIFACT_SCHEME_PRIVILEGES = { scheme: ARTIFACT_SCHEME, privileges: { standard: true, secure: true } }

export const saveArtifactFile = (input: Parameters<typeof saveArtifact>[1]) => saveArtifact(root(), input)

export const artifactList = (): ArtifactInfo[] => listArtifacts(root())
export const artifactVersionList = (id: string): ArtifactVersionInfo[] => artifactVersions(root(), id)

export function artifactOpen(id: string, version?: number): ArtifactView | null {
  const found = findArtifactVersion(root(), id, version)
  if (!found) return null
  const source = readArtifactText(root(), found.file)
  if (source === null) return null
  return { ...found.ref, url: artifactUrl(id, found.ref.version), source, versions: found.versions }
}

export function artifactReveal(id: string, version?: number) {
  const found = findArtifactVersion(root(), id, version)
  if (found) shell.showItemInFolder(found.file)
}

/** 기본 브라우저로: 응답 머리글을 못 붙이니 CSP meta를 넣은 사본(md는 HTML로 바꾼 것)을 임시 폴더에 만들어 연다 */
export async function artifactOpenExternal(id: string, version?: number) {
  const found = findArtifactVersion(root(), id, version)
  if (!found) return
  const text = readArtifactText(root(), found.file)
  if (text === null) return
  const dir = path.join(os.tmpdir(), 'ai-office-artifacts')
  fs.mkdirSync(dir, { recursive: true })
  const copy = path.join(dir, `${id}-v${found.ref.version}.html`)
  fs.rmSync(copy, { force: true })
  fs.writeFileSync(copy, withCspMeta(artifactDocument(found.ref.kind, text, found.ref.title)), { flag: 'wx' })
  const err = await shell.openPath(copy)
  if (err) throw new Error(err)
}

const isArtifactUrl = (u: string) => u.startsWith(`${ARTIFACT_SCHEME}:`)

let asking = false
async function confirmExternal(url: string) {
  if (asking || !/^https?:\/\//i.test(url)) return
  asking = true
  try {
    const shown = url.length > 300 ? `${url.slice(0, 300)}…` : url
    const r = await dialog.showMessageBox({ type: 'question', buttons: ['브라우저에서 열기', '취소'], defaultId: 1, cancelId: 1, message: '아티팩트 안의 링크를 기본 브라우저로 열까요?', detail: shown })
    if (r.response === 0) await shell.openExternal(url)
  } finally {
    asking = false
  }
}

function guard(wc: WebContents) {
  // 전용 주소 안에서 다른 곳으로 가는 이동은 모두 막는다 (같은 문서 안 #링크는 허용). 처음 iframe을 여는 이동은 frame.url이 비어 있어 통과한다
  wc.on('will-frame-navigate', (e) => {
    if (e.isSameDocument) return
    if (!isArtifactUrl(e.frame?.url ?? '')) return
    e.preventDefault()
    // http(s) 링크만, 사용자가 확인한 뒤 기본 브라우저로 연다
    if (/^https?:\/\//i.test(e.url)) void confirmExternal(e.url)
  })
  // 새 창·팝업은 응답 CSP의 sandbox(allow-popups 없음)가 막는다. 앱 창의 setWindowOpenHandler도 새 창은 모두 거절한다
}

/** app ready 뒤에 한 번 */
export function serveArtifacts() {
  protocol.handle(ARTIFACT_SCHEME, (req) => respondArtifact(req.url, root()))
  // 전용 주소에서 시작된 다운로드(blob:·data: 포함)는 모두 막는다
  session.defaultSession.on('will-download', (e, item, wc) => {
    const url = item.getURL()
    if (isArtifactUrl(url) || /^(blob|data):/i.test(url) || isArtifactUrl(wc?.getURL?.() ?? '')) e.preventDefault()
  })
  app.on('web-contents-created', (_e, wc) => guard(wc))
  for (const wc of webContents.getAllWebContents()) guard(wc)
}
