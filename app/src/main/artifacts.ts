import { app, session, shell, protocol, webContents, type WebContents } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ARTIFACT_SCHEME, artifactDocument, artifactUrl, withCspMeta } from '../shared/artifact.ts'
import type { ArtifactInfo, ArtifactVersionInfo, ArtifactView } from '../shared/types'
import { artifactVersions, findArtifactVersion, listArtifacts, respondArtifact, saveArtifact } from './artifactStore.ts'

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
  return { ...found.ref, url: artifactUrl(id, found.ref.version), source: fs.readFileSync(found.file, 'utf8'), versions: found.versions }
}

export function artifactReveal(id: string, version?: number) {
  const found = findArtifactVersion(root(), id, version)
  if (found) shell.showItemInFolder(found.file)
}

/** 기본 브라우저로: 응답 머리글을 못 붙이니 CSP meta를 넣은 사본(md는 HTML로 바꾼 것)을 임시 폴더에 만들어 연다 */
export async function artifactOpenExternal(id: string, version?: number) {
  const found = findArtifactVersion(root(), id, version)
  if (!found) return
  const dir = path.join(os.tmpdir(), 'ai-office-artifacts')
  fs.mkdirSync(dir, { recursive: true })
  const copy = path.join(dir, `${id}-v${found.ref.version}.html`)
  fs.writeFileSync(copy, withCspMeta(artifactDocument(found.ref.kind, fs.readFileSync(found.file, 'utf8'), found.ref.title)))
  await shell.openPath(copy)
}

const isArtifactUrl = (u: string) => u.startsWith(`${ARTIFACT_SCHEME}:`)

function guard(wc: WebContents) {
  // 전용 주소 안에서 다른 곳으로 가는 이동은 모두 막는다 (같은 문서 안 #링크는 허용). 처음 iframe을 여는 이동은 frame.url이 비어 있어 통과한다
  wc.on('will-frame-navigate', (e) => {
    if (e.isSameDocument) return
    if (isArtifactUrl(e.frame?.url ?? '')) e.preventDefault()
  })
  // 새 창·팝업은 응답 CSP의 sandbox(allow-popups 없음)가 막는다. 앱 창의 setWindowOpenHandler도 새 창은 모두 거절한다
}

/** app ready 뒤에 한 번 */
export function serveArtifacts() {
  protocol.handle(ARTIFACT_SCHEME, (req) => respondArtifact(req.url, root()))
  // 전용 주소에서 시작된 다운로드는 막는다
  session.defaultSession.on('will-download', (e, item) => {
    if (isArtifactUrl(item.getURL())) e.preventDefault()
  })
  app.on('web-contents-created', (_e, wc) => guard(wc))
  for (const wc of webContents.getAllWebContents()) guard(wc)
}
