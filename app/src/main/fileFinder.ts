// 비서 파일 찾기·열기의 안전 규칙 (docs/specs/secretary-next.md 4·6절) — electron 없음 (scripts/fileFinder.test.mts)
// - 찾는 곳은 직원 결과물·첨부·프로젝트 폴더 안뿐. 모델은 경로를 만들지 못하고, 찾기 결과의 id로만 연다
// - 범위 판정은 realpath + path.relative (앞부분 문자열 비교 금지), 맥 기본 디스크라 대소문자·NFC 통일
// - 열기는 "파일"이고 보는 형식(허용 목록)일 때만. 그 밖은 폴더에서 보기만. 열기 직전에 realpath를 다시 확인한다
// 남은 위험: 하드링크는 막지 못한다, 확인한 뒤 열기 사이에 바꿔치기하는 틈(TOCTOU)은 확정 경로로 여는 것으로 줄이기만 한다

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** [열기]가 되는 형식 (소문자 확장자). 여기 없으면 폴더에서 보기만 — html·svg·스크립트·앱·바로가기·매크로 문서는 일부러 뺐다 */
export const OPENABLE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.pdf', '.txt', '.md', '.csv', '.tsv', '.json', '.rtf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pages', '.numbers', '.mp3', '.wav', '.m4a', '.aac', '.mp4', '.mov', '.webm'])

const SECRET_EXT = new Set(['.pem', '.key', '.p12', '.pfx', '.crt', '.cer', '.keystore', '.jks'])
const SECRET_BASE = /^(\.env.*|id_.*|credentials.*|\.npmrc|\.netrc|\.pgpass)$/i
const SKIP_DIRS = new Set(['node_modules', '.ssh', '.aws', '.gnupg', '.git'])

export const FIND_MAX_RESULTS = 20
export const FIND_MAX_VISITED = 4000
export const FIND_MAX_DEPTH = 5
export const ID_TTL_MS = 30 * 60_000
export const ID_MAX = 200

const isCaseInsensitiveFs = process.platform === 'darwin' || process.platform === 'win32'
/** 비교용 경로: NFC, 맥·윈도우는 소문자 */
const norm = (p: string) => (isCaseInsensitiveFs ? p.normalize('NFC').toLowerCase() : p.normalize('NFC'))

const real = (p: string): string | null => {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

/** target이 root 안(root 자신 제외)인가 — 둘 다 realpath를 받는다. "/proj" ↔ "/proj-evil"·".." 탈출은 relative로 거른다 */
export function isInside(root: string, target: string): boolean {
  const rel = path.relative(norm(root), norm(target))
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

/** 비밀 후보 이름 (확장자·이름 모양, 대소문자 무시) */
export function isSecretName(name: string): boolean {
  const base = path.basename(name)
  return SECRET_EXT.has(path.extname(base).toLowerCase()) || SECRET_BASE.test(base)
}

export const isHiddenName = (name: string) => path.basename(name).startsWith('.')

/** 찾기 범위로 쓸 수 있는 프로젝트 폴더인가: 홈·루트·앱 데이터 폴더이거나 그것을 품은 폴더는 뺀다 (직원 작업 폴더 기본값이 홈이라) */
export function usableRoot(root: string, danger: { home: string; userData: string }): string | null {
  const r = real(root)
  if (!r || !fs.statSync(r).isDirectory()) return null
  if (path.dirname(r) === r) return null
  const home = real(danger.home)
  const userData = real(danger.userData)
  // 홈은 자신이거나 홈을 품은 폴더만 뺀다 (홈 안의 프로젝트 폴더는 된다). 앱 데이터 폴더는 그 안쪽도 뺀다
  if (home && (norm(r) === norm(home) || isInside(r, home))) return null
  if (userData && (norm(r) === norm(userData) || isInside(r, userData) || isInside(userData, r))) return null
  return r
}

export type FoundSource = 'artifact' | 'attachment' | 'project'

export interface Candidate {
  path: string
  name: string
  mtime: number
  size: number
  /** 이 파일을 허용한 루트 (realpath) */
  root: string
}

export interface FindQuery {
  /** 이름에 들어 있는 낱말들 (모두 들어가야 함, 대소문자 무시) */
  words: string[]
  /** 이 시각 이후 바뀐 것만 */
  sinceMs?: number
}

/** 루트 안에서 이름으로 찾는다 (너비 우선). 숨김·비밀 후보·심볼릭 링크·node_modules 등은 보지 않고, 방문 수·깊이·결과 수 한도가 있다 */
export function findInRoot(root: string, q: FindQuery, limit = FIND_MAX_RESULTS): Candidate[] {
  const out: Candidate[] = []
  const words = q.words.map((w) => w.toLowerCase()).filter(Boolean)
  let visited = 0
  let level = [root]
  for (let depth = 0; level.length && depth <= FIND_MAX_DEPTH && out.length < limit; depth++) {
    const nextLevel: string[] = []
    for (const dir of level) {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries) {
        if (++visited > FIND_MAX_VISITED || out.length >= limit) return out
        if (e.isSymbolicLink() || isHiddenName(e.name) || isSecretName(e.name)) continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name.toLowerCase())) nextLevel.push(full)
          continue
        }
        if (!e.isFile()) continue
        const lower = e.name.toLowerCase()
        if (!words.every((w) => lower.includes(w))) continue
        try {
          const st = fs.statSync(full)
          if (q.sinceMs && st.mtimeMs < q.sinceMs) continue
          out.push({ path: full, name: e.name, mtime: st.mtimeMs, size: st.size, root })
        } catch {
          continue
        }
      }
    }
    level = nextLevel
  }
  return out
}

export type FoundEntry =
  | { kind: 'artifact'; artifactId: string; name: string; who: string; at: number }
  | { kind: 'file'; path: string; root: string; source: 'attachment' | 'project'; name: string; who: string; at: number }

/** 찾기 결과에만 묶인 예측 불가 id → 항목. 시간이 지나면 사라진다 (모델이 지어낸 id는 열리지 않는다) */
export class FileRegistry {
  private items = new Map<string, { entry: FoundEntry; expires: number }>()
  private now: () => number
  constructor(now: () => number = Date.now) {
    this.now = now
  }

  register(entry: FoundEntry): string {
    const t = this.now()
    for (const [k, v] of this.items) if (v.expires <= t) this.items.delete(k)
    while (this.items.size >= ID_MAX) this.items.delete(this.items.keys().next().value as string)
    const id = `ff_${crypto.randomBytes(9).toString('hex')}`
    this.items.set(id, { entry, expires: t + ID_TTL_MS })
    return id
  }

  get(id: string): FoundEntry | null {
    const v = this.items.get(id)
    if (!v) return null
    if (v.expires <= this.now()) {
      this.items.delete(id)
      return null
    }
    return v.entry
  }
}

export type OpenHow = 'open' | 'reveal'
export type OpenCheck = { ok: true; path: string } | { ok: false; reason: 'gone' | 'outside' | 'not_openable' }

/** [열기]가 되는 파일인가 (이름만 본다): 비밀 후보가 아니고 허용 형식 */
export const canOpenName = (name: string) => !isHiddenName(name) && !isSecretName(name) && OPENABLE_EXT.has(path.extname(name).toLowerCase())

/**
 * 열기 직전 확인: 지금 허용된 루트(allowedRoots, realpath) 안에 여전히 있는지, 파일인지, 열기면 허용 형식인지.
 * 통과하면 확정된 realpath를 돌려주고 호출한 쪽은 그 경로로만 연다.
 */
export function checkOpen(entry: Extract<FoundEntry, { kind: 'file' }>, how: OpenHow, allowedRoots: string[]): OpenCheck {
  const target = real(entry.path)
  if (!target) return { ok: false, reason: 'gone' }
  const root = real(entry.root)
  if (!root || !allowedRoots.some((r) => norm(r) === norm(root))) return { ok: false, reason: 'outside' }
  if (!isInside(root, target)) return { ok: false, reason: 'outside' }
  if (isHiddenName(target) || isSecretName(target)) return { ok: false, reason: 'outside' }
  if (how === 'reveal') return { ok: true, path: target }
  let isFile = false
  try {
    isFile = fs.statSync(target).isFile()
  } catch {
    return { ok: false, reason: 'gone' }
  }
  // 폴더·번들(.app, x.pdf 폴더)이거나 허용 형식이 아니면 열지 않는다
  if (!isFile || !canOpenName(target)) return { ok: false, reason: 'not_openable' }
  return { ok: true, path: target }
}
