import { app, net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Attachment, UploadFile } from '../shared/types'

// 첨부 저장소: 지시·보고에 붙는 파일을 앱 데이터 폴더에 복사해 두고, 화면에는 office-file:// 로 내어 준다

const SCHEME = 'office-file'
const NAME_MAX = 80
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
}

const dir = () => {
  const d = path.join(app.getPath('userData'), 'attachments')
  fs.mkdirSync(d, { recursive: true })
  return d
}

const safeName = (name: string) => name.replace(/[/\\:*?"<>|]/g, '_').slice(-NAME_MAX) || 'file'
export const mimeOf = (file: string) => MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'application/octet-stream'

/** app ready 전에 불러야 한다 */
export function registerAttachmentScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export function serveAttachments() {
  protocol.handle(SCHEME, (req) => {
    const id = new URL(req.url).pathname.replace(/^\//, '')
    const file = findById(id)
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('not found', { status: 404 })
  })
}

export function findById(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null
  const name = fs.readdirSync(dir()).find((f) => f.startsWith(`${id}__`))
  return name ? path.join(dir(), name) : null
}

/** id로 저장소의 첨부 정보를 다시 만든다 (원격 v2: 폰이 보낸 id만 믿고 나머지는 여기서 채운다) */
export function attachmentById(id: string): Attachment | null {
  const file = findById(id)
  if (!file) return null
  const name = path.basename(file).slice(`${id}__`.length)
  return { id, name, path: file, mime: mimeOf(name), size: fs.statSync(file).size }
}

/** 원격 v2 올리기: 종류는 확장자로 정한다 (보낸 쪽 mime은 확장자로 모를 때만) */
export function saveUpload(name: string, mime: string, data: Buffer): Attachment {
  const byExt = mimeOf(name)
  return write(name, byExt !== 'application/octet-stream' ? byExt : mime || byExt, data)
}

function write(name: string, mime: string, data: Buffer): Attachment {
  const id = crypto.randomUUID()
  const file = path.join(dir(), `${id}__${safeName(name)}`)
  fs.writeFileSync(file, data)
  return { id, name, path: file, mime, size: data.length }
}

export function saveUploads(files: UploadFile[]): Attachment[] {
  return files.map((f) => write(f.name, f.mime || mimeOf(f.name), Buffer.from(f.data)))
}

/** 직원이 만든 파일(스크린샷 등)을 첨부 저장소로 가져온다 */
export function importFile(file: string): Attachment {
  return write(path.basename(file), mimeOf(file), fs.readFileSync(file))
}
