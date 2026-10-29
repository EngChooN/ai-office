// 앱 안에서 설치 — 내려받기 → 크기·sha256 검사 → 새 앱 풀기 → 앱이 꺼진 뒤 설치 위치에 바꿔 끼우고 다시 열기
// Electron 자동 업데이트(Squirrel.Mac)는 앱 서명이 맞아야 해서 서명 없는 맥에서 쓸 수 없어 직접 한다.
// 설치 파일은 앱이 HTTPS로 직접 받으므로 브라우저 검역 표시(quarantine)가 붙지 않는다. 대신 GitHub가 준 sha256으로 파일이 온전한지 본다.
// 윈도우는 Squirrel 설치 파일(AI-Office-win-x64-Setup.exe)을 받아 검사한 뒤 실행하고 앱을 끈다. 설치 파일이 사용자 폴더에 새 버전을 깔고 자동으로 연다 —
// 실행 중인 exe를 덮어쓰지 않으므로 옛 zip 방식의 '덮어쓰기 실패 → 옛 버전 재실행'이 없고, zip으로 쓰던 사용자도 같은 길로 설치형으로 넘어온다. 윈도우 쪽은 이 기기에서 검증하지 못했다.
import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { accessSync, constants, createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import type { InstallStatus, ReleaseAsset, ReleaseInfo } from '../shared/updateCheck.ts'

const run = promisify(execFile)
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000

/** 설치 단계에서 사용자에게 보일 실패 이유 (InstallStatus.installError와 같은 값) */
export class InstallFailure extends Error {
  constructor(readonly code: NonNullable<InstallStatus['installError']>) {
    super(code)
  }
}

/** 지금 켜진 앱이 있는 위치 — 맥은 .app 묶음, 윈도우는 실행 파일이 든 폴더. 패키지 앱이 아니면 null (개발 실행) */
export function installedLocation(): string | null {
  if (!app.isPackaged) return null
  if (process.platform === 'darwin') {
    const i = process.execPath.indexOf('.app/')
    return i < 0 ? null : process.execPath.slice(0, i + '.app'.length)
  }
  if (process.platform === 'win32') return path.dirname(process.execPath)
  return null
}

/** 윈도우 설치형(Squirrel) 실행인지 — 실행 파일이 든 app-버전 폴더 한 단계 위에 Update.exe가 있다 */
export function isSquirrelInstall(): boolean {
  return process.platform === 'win32' && app.isPackaged && existsSync(path.resolve(path.dirname(process.execPath), '..', 'Update.exe'))
}

/** 윈도우에서 zip을 풀어 쓰는 중인지 (설치형이 아님) — 다음 업데이트 때 설치형으로 넘어가며 옛 폴더는 지워도 된다고 안내한다 */
export function isWinZipInstall(): boolean {
  return process.platform === 'win32' && app.isPackaged && !isSquirrelInstall()
}

/** 이 기기에서 앱 안 설치를 할 수 있는지: 설치 파일과 sha256이 있어야 한다. 맥은 설치 위치의 상위 폴더에 쓸 수 있어야 하고, 윈도우는 설치 파일이 사용자 폴더에 깔아 쓰기 검사가 필요 없다 */
export function canInstallHere(asset: ReleaseAsset | null): boolean {
  const where = installedLocation()
  if (!asset?.sha256 || !where) return false
  if (process.platform === 'win32') return asset.url.toLowerCase().endsWith('-setup.exe')
  try {
    accessSync(path.dirname(where), constants.W_OK)
    return true
  } catch {
    return false
  }
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

/** 설치 파일을 내려받는다. 진행률은 10% 단위가 아니라 1% 단위로 알린다 (총 크기를 모르면 null) */
async function download(asset: ReleaseAsset, file: string, onProgress: (pct: number | null) => void) {
  const res = await fetch(asset.url, {
    headers: { 'User-Agent': `ClaudeOffice/${app.getVersion()}` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  })
  if (!res.ok || !res.body) throw new InstallFailure('download')
  const total = asset.size ?? (Number(res.headers.get('content-length')) || null)
  let received = 0
  let lastPct = -1
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length
      if (total) {
        const pct = Math.min(100, Math.floor((received * 100) / total))
        if (pct !== lastPct) {
          lastPct = pct
          onProgress(pct)
        }
      }
      cb(null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), meter, createWriteStream(file))
  } catch {
    throw new InstallFailure('download')
  }
}

/** 내려받은 파일이 GitHub가 알려 준 크기·sha256과 같은지 본다 */
async function verify(file: string, asset: ReleaseAsset) {
  if (asset.size !== null && (await fs.stat(file)).size !== asset.size) throw new InstallFailure('verify')
  if (!asset.sha256 || (await sha256Of(file)) !== asset.sha256) throw new InstallFailure('verify')
}

/** 맥: 디스크 이미지를 잠깐 열어 새 .app을 스테이징 폴더로 옮기고 이미지는 바로 닫는다. 버전이 맞는지 확인 */
async function prepareMac(dmg: string, staged: string, version: string) {
  const mount = path.join(path.dirname(staged), 'mount')
  await fs.mkdir(mount, { recursive: true })
  try {
    await run('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg])
    const name = (await fs.readdir(mount)).find((n) => n.endsWith('.app'))
    if (!name) throw new InstallFailure('prepare')
    await run('/usr/bin/ditto', [path.join(mount, name), staged])
  } catch (e) {
    if (e instanceof InstallFailure) throw e
    throw new InstallFailure('prepare')
  } finally {
    await run('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => {})
  }
  const plist = path.join(staged, 'Contents', 'Info.plist')
  const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]).catch(() => {
    throw new InstallFailure('prepare')
  })
  if (stdout.trim() !== version) throw new InstallFailure('prepare')
  return staged
}

/** 내려받기·검사까지 한다(맥은 새 .app 꺼내기까지). 바꿔 끼우거나 설치하는 일은 launchReplacer가 한다 */
export async function prepareInstall(release: ReleaseInfo, onPhase: (phase: 'downloading' | 'preparing', pct: number | null) => void): Promise<{ source: string; target: string }> {
  const asset = release.asset
  const target = installedLocation()
  if (!asset || !target || !canInstallHere(asset)) throw new InstallFailure('prepare')
  const staging = path.join(app.getPath('temp'), 'claude-office-update', release.version)
  await fs.rm(staging, { recursive: true, force: true })
  await fs.mkdir(staging, { recursive: true })
  const file = path.join(staging, path.basename(new URL(asset.url).pathname))
  onPhase('downloading', 0)
  await download(asset, file, (pct) => onPhase('downloading', pct))
  onPhase('preparing', null)
  await verify(file, asset)
  if (process.platform === 'darwin') return { source: await prepareMac(file, path.join(staging, 'new'), release.version), target }
  return { source: file, target }
}

/** 앱이 꺼진 뒤 설치 위치를 새 것으로 바꾸고 다시 연다. 바꾸다 실패하면 예전 것을 되돌린다 */
const MAC_SWAP_SCRIPT = `
pid="$1"; target="$2"; source="$3"; old="$4"
rm -rf "$old"
while kill -0 "$pid" 2>/dev/null; do sleep 0.5; done
if mv "$target" "$old"; then
  if /usr/bin/ditto "$source" "$target"; then rm -rf "$old"; else rm -rf "$target"; mv "$old" "$target"; fi
fi
/usr/bin/open "$target"
`

export function launchReplacer(plan: { source: string; target: string }): Promise<void> | void {
  const { source, target } = plan
  if (process.platform === 'darwin') {
    const child = spawn('/bin/sh', ['-c', MAC_SWAP_SCRIPT, 'sh', String(process.pid), target, source, `${target}.update-old`], { detached: true, stdio: 'ignore' })
    child.unref()
    return
  }
  // 윈도우: 설치 파일을 따로 띄우고 앱을 끈다. 설치 파일이 새 버전을 깔고 연다. 못 띄우면 실패로 알린다 (옛 방식은 실패를 삼켜 옛 버전이 다시 열렸다)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(source, [], { detached: true, stdio: 'ignore' })
    child.once('error', () => reject(new InstallFailure('prepare')))
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
