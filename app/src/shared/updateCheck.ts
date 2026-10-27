// 업데이트 알림 — GitHub Release 응답 해석·버전 비교 (순수 함수, main·renderer·테스트가 같이 쓴다)
// 서버 없이 공개 API(인증 없음)를 읽는다. 설치 파일 주소·크기·sha256을 고르고, 실제 내려받기·설치는 main/appInstall.ts가 한다

import type { Lang } from './i18n/index.ts'

export const RELEASE_API_URL = 'https://api.github.com/repos/EngChooN/claude-office/releases/latest'
/** 앱을 켤 때 한 번 확인한 뒤 이 간격으로 다시 확인한다 (인증 없는 API 한도는 시간당 60회) */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** 창 포커스·잠자기에서 깨어날 때는 마지막 확인 뒤 이만큼 지났을 때만 다시 확인한다 */
export const UPDATE_RECHECK_GAP_MS = 30 * 60 * 1000

/**
 * 창 포커스·잠자기 해제 때 다시 확인할지 — 마지막 확인(성공·실패 모두) 뒤 gap이 지났으면 true.
 * 잠자기 동안 타이머가 밀려도 깨어나면 바로 따라잡는다. 아직 한 번도 확인하지 않았으면 true
 */
export function shouldRecheck(lastAttemptAt: number | null, now: number, gap = UPDATE_RECHECK_GAP_MS): boolean {
  return lastAttemptAt === null || now - lastAttemptAt >= gap
}

/** Release에 올리는 설치 파일 이름 (고정) */
export const ASSET_NAMES = {
  mac: 'Claude-Office-mac-arm64.dmg',
  win: 'Claude-Office-win-x64.zip',
  android: 'Claude-Office-android.apk',
} as const
export type AssetTarget = keyof typeof ASSET_NAMES

/** GitHub Release의 설치 파일 한 개 — 주소, 크기, sha256(GitHub가 준 값이 없으면 null) */
export interface ReleaseAsset {
  url: string
  size: number | null
  sha256: string | null
}

export interface ReleaseInfo {
  /** 앞의 v를 뗀 버전 (0.12.0) */
  version: string
  /** Release 설명 원문 (마크다운 — 언어별 섹션. 안내에는 summarizeNotes로 현재 언어 것만 줄여 보인다) */
  body: string
  /** 이 기기용 설치 파일 주소 — 없으면 null (Release 페이지로 대신 연다) */
  downloadUrl: string | null
  /** 이 기기용 설치 파일 정보 — 앱 안에서 내려받아 설치할 때 쓴다 */
  asset: ReleaseAsset | null
  /** Release 페이지 주소 */
  pageUrl: string
}

/** 앱 안 설치 진행 상태. idle: 안 함 · downloading: 내려받는 중 · preparing: 검사·풀기 중 · failed: 실패 (이유는 installError) */
export interface InstallStatus {
  phase: 'idle' | 'downloading' | 'preparing' | 'failed'
  /** 내려받은 비율 0~100 (모르면 null) */
  progress: number | null
  /** download: 내려받기 실패 · verify: 파일 검사(크기·sha256) 불일치 · prepare: 설치 파일을 풀거나 버전을 확인하지 못함 */
  installError: 'download' | 'verify' | 'prepare' | null
}

/** 설정 화면·배지가 보는 상태 (main → renderer) */
export interface UpdateStatus {
  current: string
  /** checking: 확인 중 · upToDate: 최신 · available: 새 버전 있음 · failed: 직접 확인했는데 실패 (자동 확인 실패는 상태를 바꾸지 않는다) */
  state: 'idle' | 'checking' | 'upToDate' | 'available' | 'failed'
  latest: { version: string; notes: string } | null
  /** [나중에]로 건너뛴 버전 */
  skippedVersion: string | null
  checkedAt: number | null
  /** 이 앱이 이 기기에서 앱 안에서 바로 설치할 수 있는지 (설치 파일이 있고, 설치된 위치를 쓸 수 있을 때) */
  canInstall: boolean
  install: InstallStatus
}

/** preload가 여는 업데이트 통로 (데스크톱만 — 모바일 빌드에는 없다) */
export interface OfficeUpdateApi {
  status(): Promise<UpdateStatus>
  check(): Promise<UpdateStatus>
  /** 고른 설치 파일을 기본 브라우저로 연다 (주소는 main이 가진 것만 쓴다) */
  download(): Promise<void>
  /** 앱 안에서 내려받아 검사한 뒤 앱을 다시 열며 바꾼다. 성공하면 앱이 꺼진다 */
  install(): Promise<UpdateStatus>
  skip(version: string): Promise<UpdateStatus>
  onStatus(cb: (status: UpdateStatus) => void): () => void
}

type ParsedVersion = { core: [number, number, number]; pre: string[] }

/** 'v0.12.0' · '0.12.0' · '0.12.0-beta.1' (빌드 정보 +… 는 무시). 형식이 다르면 null */
export function parseVersion(text: string): ParsedVersion | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim())
  if (!m) return null
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] }
}

/** semver 순서: a가 크면 양수, 같으면 0, 작으면 음수. 둘 중 하나라도 형식이 다르면 null */
export function compareVersions(a: string, b: string): number | null {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return null
  for (let i = 0; i < 3; i++) if (va.core[i] !== vb.core[i]) return va.core[i] - vb.core[i]
  // 정식 버전이 같은 숫자의 미리보기(-beta)보다 높다
  if (!va.pre.length || !vb.pre.length) return vb.pre.length - va.pre.length
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    const pa = va.pre[i]
    const pb = vb.pre[i]
    if (pa === undefined) return -1
    if (pb === undefined) return 1
    if (pa === pb) continue
    const na = /^\d+$/.test(pa)
    const nb = /^\d+$/.test(pb)
    if (na && nb) return Number(pa) - Number(pb)
    if (na !== nb) return na ? -1 : 1
    return pa < pb ? -1 : 1
  }
  return 0
}

/** latest가 current보다 확실히 높을 때만 true (형식을 못 읽으면 알리지 않는다) */
export function isNewerVersion(latest: string, current: string): boolean {
  return (compareVersions(latest, current) ?? 0) > 0
}

/** 알림을 띄울지: 더 높은 버전이고 [나중에]로 건너뛴 버전이 아닐 때 (더 새 버전이 나오면 다시 알린다) */
export function shouldNotify(latest: string, current: string, skippedVersion: string | null): boolean {
  return isNewerVersion(latest, current) && (skippedVersion === null || compareVersions(latest, skippedVersion) !== 0)
}

/** 이 기기에 맞는 설치 파일. 맥 dmg는 Apple Silicon 전용이라 인텔 맥·리눅스는 null (Release 페이지로 안내) */
export function assetTargetFor(platform: string, arch: string): AssetTarget | null {
  if (platform === 'darwin') return arch === 'arm64' ? 'mac' : null
  if (platform === 'win32') return 'win'
  if (platform === 'android') return 'android'
  return null
}

/** 브라우저로 열 주소는 GitHub 것만 받는다 (응답이 이상해도 엉뚱한 주소를 열지 않게) */
const isGithubUrl = (url: unknown): url is string => typeof url === 'string' && /^https:\/\/github\.com\//.test(url)

/** assets[]에서 파일 이름으로 설치 파일을 찾는다 (주소·크기·sha256). sha256은 GitHub 응답의 digest("sha256:…")에서만 읽는다 */
export function pickAsset(assets: unknown, target: AssetTarget | null): ReleaseAsset | null {
  if (!target || !Array.isArray(assets)) return null
  const asset = assets.find((a) => (a as { name?: unknown })?.name === ASSET_NAMES[target]) as
    | { browser_download_url?: unknown; size?: unknown; digest?: unknown }
    | undefined
  if (!asset || !isGithubUrl(asset.browser_download_url)) return null
  const digest = typeof asset.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(asset.digest.trim()) : null
  return {
    url: asset.browser_download_url,
    size: typeof asset.size === 'number' && Number.isSafeInteger(asset.size) && asset.size > 0 ? asset.size : null,
    sha256: digest ? digest[1].toLowerCase() : null,
  }
}

/** assets[]에서 파일 이름으로 다운로드 주소를 찾는다 */
export function pickDownloadUrl(assets: unknown, target: AssetTarget | null): string | null {
  return pickAsset(assets, target)?.url ?? null
}

const NOTES_MAX_LINES = 8
const NOTES_MAX_CHARS = 600

/** Release 본문의 언어 섹션 머리말 ('## 한국어' 등 — docs/release-notes 형식). 휴대폰 UpdateCheck.kt와 같은 규칙 */
const LANG_HEADERS: [Lang, string][] = [
  ['ko', '한국어'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['zh', '中文'],
]
const H2 = /^##[ \t]+(.*?)[ \t]*$/

/** 본문에서 lang 섹션만. 없으면 English → 한국어 → 처음 섹션, 언어 머리말이 없는 옛 본문은 그대로 */
export function pickLanguageSection(body: string, lang: Lang): string {
  const sections = new Map<Lang, string[]>()
  let cur: string[] | null = null
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const header = H2.exec(line)?.[1]
    const code = header === undefined ? undefined : LANG_HEADERS.find(([, name]) => header.startsWith(name))?.[0]
    if (code) {
      cur = sections.get(code) ?? []
      sections.set(code, cur)
      continue
    }
    cur?.push(line)
  }
  if (!sections.size) return body
  const pick = sections.get(lang) ?? sections.get('en') ?? sections.get('ko') ?? [...sections.values()][0]
  return pick.join('\n')
}

/** Release 설명(마크다운)을 안내에 넣을 짧은 글로: lang 섹션만 골라 제목 기호·링크·이미지·주석을 걷고 앞부분만 남긴다 */
export function summarizeNotes(body: unknown, lang: Lang, maxLines = NOTES_MAX_LINES, maxChars = NOTES_MAX_CHARS): string {
  if (typeof body !== 'string') return ''
  const lines = pickLanguageSection(body, lang)
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*[-*+]\s+/, '• ')
        .replace(/\*\*|__|`/g, '')
        .trimEnd(),
    )
    .filter((l, i, all) => l.trim() !== '' || (i > 0 && all[i - 1].trim() !== ''))
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  let text = lines.slice(0, maxLines).join('\n')
  const isCut = lines.length > maxLines || text.length > maxChars
  if (text.length > maxChars) text = text.slice(0, maxChars).trimEnd()
  return isCut ? `${text}…` : text
}

/** /releases/latest 응답 → ReleaseInfo. 초안·미리보기·형식이 다른 응답은 null */
export function parseRelease(json: unknown, target: AssetTarget | null): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null
  const r = json as { tag_name?: unknown; body?: unknown; html_url?: unknown; assets?: unknown; draft?: unknown; prerelease?: unknown }
  if (r.draft === true || r.prerelease === true) return null
  if (typeof r.tag_name !== 'string' || !parseVersion(r.tag_name) || !isGithubUrl(r.html_url)) return null
  const asset = pickAsset(r.assets, target)
  return {
    version: r.tag_name.trim().replace(/^v/, ''),
    body: typeof r.body === 'string' ? r.body : '',
    downloadUrl: asset?.url ?? null,
    asset,
    pageUrl: r.html_url,
  }
}
