import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ARTIFACT_CSP, ARTIFACT_MAX_BYTES, artifactDocument, checkArtifactFile, cleanArtifactTitle, parseArtifactUrl } from '../shared/artifact.ts'
import type { ArtifactInfo, ArtifactKind, ArtifactRef, ArtifactVersionInfo } from '../shared/types.ts'

// 아티팩트 저장소: <root>/<아티팩트 id>/meta.json 과 <root>/<아티팩트 id>/<버전>/<파일> (electron 없이 폴더만 받아 쓴다)

const ID_RE = /^[a-f0-9-]{36}$/
const NAME_MAX = 80

interface StoredVersion extends ArtifactVersionInfo {
  hash: string
}
interface Meta {
  id: string
  title: string
  kind: ArtifactKind
  staffId: string
  staffName: string
  taskId: string | null
  sourcePath: string
  versions: StoredVersion[]
}

export interface ArtifactOwner {
  staffId: string
  staffName: string
  taskId: string | null
}
export type SaveResult = { ok: true; ref: ArtifactRef; file: string; isNewVersion: boolean } | { ok: false; reason: 'missing' | 'ext' | 'size' | 'empty' }

const safeName = (name: string) => path.basename(name).replace(/[/\\:*?"<>|]/g, '_').slice(-NAME_MAX) || 'artifact'

/** root 밖으로 나가는 경로는 거절한다 */
function inside(root: string, ...parts: string[]): string | null {
  const base = path.resolve(root)
  const target = path.resolve(base, ...parts)
  return target === base || target.startsWith(base + path.sep) ? target : null
}

/** 실제 경로(realpath)가 저장소 안인 기존 파일만 돌려준다 — 심볼릭 링크로 밖을 가리키면 null */
function realInside(root: string, file: string): string | null {
  try {
    const base = fs.realpathSync(root)
    const real = fs.realpathSync(file)
    return real.startsWith(base + path.sep) ? real : null
  } catch {
    return null
  }
}

/** 심볼릭 링크는 따라가지 않고 최대 max바이트까지만 읽는다 (더 크면 null) */
export function readLimited(file: string, max = ARTIFACT_MAX_BYTES): Buffer | null {
  let fd: number | null = null
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    if (!fs.fstatSync(fd).isFile()) return null
    const buf = Buffer.alloc(max + 1)
    let n = 0
    for (;;) {
      const r = fs.readSync(fd, buf, n, buf.length - n, null)
      if (r <= 0) break
      n += r
      if (n > max) return null
    }
    return buf.subarray(0, n)
  } catch {
    return null
  } finally {
    if (fd !== null) fs.closeSync(fd)
  }
}

/** 저장소 안의 파일을 안전하게 읽는다 (realpath 검사 + 크기 제한) */
export function readArtifactText(root: string, file: string): string | null {
  const real = realInside(root, file)
  const data = real ? readLimited(real) : null
  return data ? data.toString('utf8') : null
}

function readMeta(root: string, id: string): Meta | null {
  if (!ID_RE.test(id)) return null
  const file = inside(root, id, 'meta.json')
  const real = file && realInside(root, file)
  const data = real ? readLimited(real, 1024 * 1024) : null
  if (!data) return null
  try {
    return JSON.parse(data.toString('utf8')) as Meta
  } catch {
    return null
  }
}

const refOf = (m: Meta, v: StoredVersion): ArtifactRef => ({ id: m.id, title: m.title, kind: m.kind, version: v.version, name: v.name, size: v.size })

function versionFile(root: string, m: Meta, v: StoredVersion) {
  return inside(root, m.id, String(v.version), safeName(v.name))
}

/** 파일을 새 아티팩트로, 또는 같은 직원이 같은 파일 경로·같은 제목으로 올렸던 아티팩트의 새 버전으로 저장한다. 내용이 같으면 버전을 올리지 않는다 */
export function saveArtifact(root: string, input: { title: string; source: string } & ArtifactOwner): SaveResult {
  // 원본이 심볼릭 링크면 받지 않는다 (링크로 앱 밖 비공개 파일을 끌어오는 것을 막는다)
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(input.source)
  } catch {
    return { ok: false, reason: 'missing' }
  }
  if (!stat.isFile()) return { ok: false, reason: 'missing' }
  const check = checkArtifactFile(input.source, stat.size)
  if (!check.ok) return { ok: false, reason: check.reason }
  // 한도(5MB)까지만 읽는다 — 읽는 사이에 커진 파일은 size로 거른다
  const data = readLimited(input.source)
  if (!data) return { ok: false, reason: fs.existsSync(input.source) ? 'size' : 'missing' }
  if (!data.length) return { ok: false, reason: 'empty' }
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  const title = cleanArtifactTitle(input.title) || path.basename(input.source)
  const sourcePath = path.resolve(input.source)

  const found = listMetas(root).find((m) => m.staffId === input.staffId && m.kind === check.kind && (m.sourcePath === sourcePath || m.title.toLowerCase() === title.toLowerCase()))
  const meta: Meta = found ?? { id: crypto.randomUUID(), title, kind: check.kind, staffId: input.staffId, staffName: input.staffName, taskId: input.taskId, sourcePath, versions: [] }
  const last = meta.versions[meta.versions.length - 1]
  if (last && last.hash === hash) {
    const file = versionFile(root, meta, last)
    if (file && realInside(root, file)) return { ok: true, ref: refOf(meta, last), file, isNewVersion: false }
  }
  const version: StoredVersion = { version: (last?.version ?? 0) + 1, name: safeName(input.source), size: data.length, createdAt: Date.now(), hash }
  const file = versionFile(root, meta, version)
  if (!file) return { ok: false, reason: 'missing' }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const realDir = realInside(root, path.dirname(file))
  if (!realDir) return { ok: false, reason: 'missing' }
  const realFile = path.join(realDir, path.basename(file))
  // 새 파일만 만든다 (이미 있는 링크·파일은 덮어쓰지 않는다)
  fs.writeFileSync(realFile, data, { flag: 'wx' })
  // 다시 올릴 때의 제목·업무 카드·이름으로 맞춘다
  Object.assign(meta, { title, staffName: input.staffName, taskId: input.taskId ?? meta.taskId, sourcePath })
  meta.versions.push(version)
  const metaDir = realInside(root, path.join(root, meta.id))
  if (!metaDir) return { ok: false, reason: 'missing' }
  // 임시 파일에 쓰고 바꿔치기 — meta.json 자리에 링크가 있어도 링크 대상에 쓰지 않는다
  const tmpMeta = path.join(metaDir, `meta.${crypto.randomUUID()}.tmp`)
  fs.writeFileSync(tmpMeta, JSON.stringify(meta), { flag: 'wx' })
  fs.renameSync(tmpMeta, path.join(metaDir, 'meta.json'))
  return { ok: true, ref: refOf(meta, version), file: realFile, isNewVersion: true }
}

function listMetas(root: string): Meta[] {
  let names: string[]
  try {
    names = fs.readdirSync(root)
  } catch {
    return []
  }
  return names.map((n) => readMeta(root, n)).filter((m): m is Meta => Boolean(m && m.versions?.length))
}

export function listArtifacts(root: string): ArtifactInfo[] {
  return listMetas(root)
    .map((m) => {
      const v = m.versions[m.versions.length - 1]
      return { ...refOf(m, v), staffId: m.staffId, staffName: m.staffName, taskId: m.taskId, updatedAt: v.createdAt, versionCount: m.versions.length }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function artifactVersions(root: string, id: string): ArtifactVersionInfo[] {
  return (readMeta(root, id)?.versions ?? []).map(({ version, name, size, createdAt }) => ({ version, name, size, createdAt }))
}

/** id·버전(생략하면 최신)의 정보와 파일 경로 — 없거나 id·버전이 이상하면 null */
export function findArtifactVersion(root: string, id: string, version?: number): { ref: ArtifactRef; file: string; versions: ArtifactVersionInfo[] } | null {
  const m = readMeta(root, id)
  if (!m?.versions.length) return null
  const v = version === undefined ? m.versions[m.versions.length - 1] : m.versions.find((x) => x.version === version)
  if (!v) return null
  const file = versionFile(root, m, v)
  const real = file && realInside(root, file)
  if (!real) return null
  return { ref: refOf(m, v), file: real, versions: m.versions.map(({ version, name, size, createdAt }) => ({ version, name, size, createdAt })) }
}

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }

/** 전용 주소 요청 하나에 답한다 (경로는 id·버전 숫자로만 읽고 파일 경로로 쓰지 않는다) */
export function respondArtifact(url: string, dir: string): Response {
  const parsed = parseArtifactUrl(url)
  const found = parsed ? findArtifactVersion(dir, parsed.id, parsed.version) : null
  if (!found) return new Response('not found', { status: 404, headers: NO_STORE })
  const text = readArtifactText(dir, found.file)
  if (text === null) return new Response('not found', { status: 404, headers: NO_STORE })
  const body = artifactDocument(found.ref.kind, text, found.ref.title)
  return new Response(body, { status: 200, headers: { ...NO_STORE, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': ARTIFACT_CSP } })
}

/** 브라우저로 열 사본을 새 전용 폴더(mkdtemp, 0700)에 쓴다 — 미리 만들어 둔 링크·파일을 따라가거나 지우지 않는다 */
export function writeBrowserCopy(tmpBase: string, name: string, html: string): string {
  const dir = fs.mkdtempSync(path.join(tmpBase, 'ai-office-artifact-'))
  const copy = path.join(dir, safeName(name))
  fs.writeFileSync(copy, html, { flag: 'wx', mode: 0o600 })
  return copy
}
