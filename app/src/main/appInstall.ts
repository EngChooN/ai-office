// 앱 안에서 설치 — 내려받기 → 크기·sha256 검사 → 새 앱 풀기 → 앱이 꺼진 뒤 설치 위치에 바꿔 끼우고 다시 열기
// Electron 자동 업데이트(Squirrel.Mac)는 앱 서명이 맞아야 해서 서명 없는 맥에서 쓸 수 없어 직접 한다.
// 설치 파일은 앱이 HTTPS로 직접 받으므로 브라우저 검역 표시(quarantine)가 붙지 않는다. 대신 GitHub가 준 sha256으로 파일이 온전한지 본다.
// 윈도우는 PowerShell로 풀고 바꾼다 (실행 중인 exe는 덮어쓸 수 없어 앱이 꺼진 뒤에 바꾼다). 윈도우 쪽은 이 기기에서 검증하지 못했다.
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

/** 이 기기에서 앱 안 설치를 할 수 있는지: 설치 파일과 sha256이 있고, 설치 위치의 상위 폴더에 쓸 수 있어야 한다 */
export function canInstallHere(asset: ReleaseAsset | null): boolean {
  const where = installedLocation()
  if (!asset?.sha256 || !where) return false
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

/** 윈도우: zip을 풀고 실행 파일이 든 폴더를 찾는다. 경로는 환경 변수로 넘겨 명령 문자열에 끼워 넣지 않는다 */
async function prepareWin(zip: string, dest: string) {
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:CO_ZIP -DestinationPath $env:CO_DEST -Force'], {
      env: { ...process.env, CO_ZIP: zip, CO_DEST: dest },
    })
  } catch {
    throw new InstallFailure('prepare')
  }
  for (const name of await fs.readdir(dest)) {
    const folder = path.join(dest, name)
    if (existsSync(path.join(folder, 'claude-office.exe'))) return folder
  }
  throw new InstallFailure('prepare')
}

/** 내려받기·검사·풀기까지 한다. 바꿔 끼우는 일은 앱이 꺼진 뒤 launchReplacer가 한다 */
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
  const staged = path.join(staging, 'new')
  if (process.platform === 'darwin') return { source: await prepareMac(file, staged, release.version), target }
  return { source: await prepareWin(file, staged), target }
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

export function launchReplacer(plan: { source: string; target: string }) {
  const { source, target } = plan
  if (process.platform === 'darwin') {
    const child = spawn('/bin/sh', ['-c', MAC_SWAP_SCRIPT, 'sh', String(process.pid), target, source, `${target}.update-old`], { detached: true, stdio: 'ignore' })
    child.unref()
    return
  }
  const script = path.join(app.getPath('temp'), 'claude-office-update', 'replace-app.ps1')
  // 기다리는 동안 실패해도 새 파일을 덮고 다시 연다. 덮기가 실패하면 예전 파일로 남는다
  const body = [
    'param([int]$ProcId, [string]$Source, [string]$Target)',
    'try { Wait-Process -Id $ProcId -Timeout 120 -ErrorAction SilentlyContinue } catch {}',
    'try { Copy-Item -Path (Join-Path $Source "*") -Destination $Target -Recurse -Force } catch {}',
    'Start-Process -FilePath (Join-Path $Target "claude-office.exe")',
  ].join('\r\n')
  return fs.mkdir(path.dirname(script), { recursive: true }).then(() => fs.writeFile(script, body)).then(() => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-ProcId', String(process.pid), '-Source', source, '-Target', target], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  })
}
