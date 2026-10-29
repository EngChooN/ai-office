// 업데이트 확인 — GitHub Release를 앱을 켤 때 한 번, 그 뒤 1시간마다 읽는다.
// 창에 다시 포커스가 오거나 잠자기에서 깨어나면 마지막 확인 뒤 30분이 지났을 때 다시 읽는다 (잠자기로 타이머가 밀려도 따라잡게).
// 자동 확인 실패(오프라인·조회 제한 403)는 조용히 넘기고, 설정의 [지금 확인]만 실패를 알린다.
// 화면과는 사무실 API(OfficeApi·원격 v2) 밖의 update:* 채널로 주고받는다 — PC 앱 자신의 업데이트라 휴대폰에서 부를 일이 없다
import { app, ipcMain, powerMonitor, shell, type BrowserWindow } from 'electron'
import { loadSkippedUpdate, saveSkippedUpdate } from './db'
import { getLang, onLangChange } from '../shared/i18n/index.ts'
import { assetTargetFor, parseRelease, RELEASE_API_URL, shouldNotify, shouldRecheck, summarizeNotes, UPDATE_CHECK_INTERVAL_MS, type InstallStatus, type ReleaseInfo, type UpdateStatus } from '../shared/updateCheck.ts'
import { canInstallHere, InstallFailure, isWinZipInstall, launchReplacer, prepareInstall } from './appInstall'

const FETCH_TIMEOUT_MS = 15_000

/** 최신 Release를 읽는다. 실패하면 throw */
async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const res = await fetch(RELEASE_API_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ClaudeOffice/${app.getVersion()}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`release check ${res.status}`)
  const release = parseRelease(await res.json(), assetTargetFor(process.platform, process.arch))
  if (!release) throw new Error('release check: unexpected response')
  return release
}

export class UpdateChecker {
  private release: ReleaseInfo | null = null
  private state: UpdateStatus['state'] = 'idle'
  private checkedAt: number | null = null
  /** 마지막으로 확인을 시도한 때 (실패 포함) — 포커스·깨어남 때 다시 확인할지 판단한다 */
  private attemptedAt: number | null = null
  private skippedVersion = loadSkippedUpdate()
  private inflight: Promise<UpdateStatus> | null = null
  private install: InstallStatus = { phase: 'idle', progress: null, installError: null }
  private isInstalling = false
  private timer: NodeJS.Timeout | null = null
  private offLang: (() => void) | null = null

  constructor(private readonly onChange: (status: UpdateStatus) => void) {}

  start() {
    void this.check(false)
    this.timer = setInterval(() => void this.check(false), UPDATE_CHECK_INTERVAL_MS)
    app.on('browser-window-focus', this.recheck)
    powerMonitor.on('resume', this.recheck)
    // 바뀐 점 요약은 앱 언어 섹션이라, 언어를 바꾸면 다시 보낸다
    this.offLang = onLangChange(() => this.emit())
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    app.off('browser-window-focus', this.recheck)
    powerMonitor.off('resume', this.recheck)
    this.offLang?.()
    this.offLang = null
  }

  status(): UpdateStatus {
    return {
      current: app.getVersion(),
      state: this.state,
      latest: this.release && this.state === 'available' ? { version: this.release.version, notes: summarizeNotes(this.release.body, getLang()) } : null,
      skippedVersion: this.skippedVersion,
      checkedAt: this.checkedAt,
      canInstall: this.state === 'available' && !!this.release && canInstallHere(this.release.asset),
      isWinZip: isWinZipInstall(),
      install: this.install,
    }
  }

  /** 창 포커스·잠자기 해제: 마지막 확인 뒤 충분히 지났으면 자동 확인 (실패는 조용히) */
  private recheck = () => {
    if (shouldRecheck(this.attemptedAt, Date.now())) void this.check(false)
  }

  /** 확인이 겹치면 진행 중인 것을 같이 기다린다 */
  check(isManual: boolean): Promise<UpdateStatus> {
    this.inflight ??= this.run(isManual).finally(() => (this.inflight = null))
    return this.inflight
  }

  private async run(isManual: boolean) {
    const before = this.state
    this.attemptedAt = Date.now()
    this.setState('checking')
    try {
      const release = await fetchLatestRelease()
      this.release = release
      this.checkedAt = Date.now()
      // 건너뛴 버전이어도 설정 화면에는 새 버전으로 보여 준다 (알림·배지만 renderer가 shouldNotify로 거른다)
      this.setState(shouldNotify(release.version, app.getVersion(), null) ? 'available' : 'upToDate')
    } catch {
      this.setState(isManual ? 'failed' : before === 'checking' ? 'idle' : before)
    }
    return this.status()
  }

  /** [나중에]: 그 버전은 다시 알리지 않는다 */
  skip(version: string) {
    this.skippedVersion = version
    saveSkippedUpdate(version)
    this.emit()
    return this.status()
  }

  /** 이 기기용 설치 파일(없으면 Release 페이지)을 기본 브라우저로 연다 */
  async openDownload() {
    if (this.state !== 'available' || !this.release) return
    await shell.openExternal(this.release.downloadUrl ?? this.release.pageUrl)
  }

  /** 앱 안에서 내려받아 설치하고 다시 연다. 성공하면 앱이 꺼진다. 이 기기에서 못 하면 Release 페이지 다운로드로 대신한다 */
  async installNow(): Promise<UpdateStatus> {
    const release = this.release
    if (this.state !== 'available' || !release || this.isInstalling) return this.status()
    if (!canInstallHere(release.asset)) {
      await this.openDownload()
      return this.status()
    }
    this.isInstalling = true
    this.setInstall({ phase: 'downloading', progress: 0, installError: null })
    try {
      const plan = await prepareInstall(release, (phase, progress) => this.setInstall({ phase, progress, installError: null }))
      // 바꿔 끼우기(맥)·설치 파일 실행(윈도우)은 별도 프로세스가 한다 — 띄운 뒤 응답을 먼저 보내고 끈다
      await launchReplacer(plan)
      setImmediate(() => app.quit())
    } catch (e) {
      this.isInstalling = false
      const installError = e instanceof InstallFailure ? e.code : 'prepare'
      this.setInstall({ phase: 'failed', progress: null, installError })
    }
    return this.status()
  }

  private setInstall(install: InstallStatus) {
    this.install = install
    this.emit()
  }

  private setState(state: UpdateStatus['state']) {
    this.state = state
    this.emit()
  }

  private emit() {
    this.onChange(this.status())
  }
}

/** update:* 채널 연결 — 상태가 바뀌면 창에 update:onStatus로 보낸다 */
export function registerUpdates(getWin: () => BrowserWindow | null) {
  const checker = new UpdateChecker((status) => getWin()?.webContents.send('update:onStatus', status))
  ipcMain.handle('update:status', () => checker.status())
  ipcMain.handle('update:check', () => checker.check(true))
  ipcMain.handle('update:download', () => checker.openDownload())
  ipcMain.handle('update:install', () => checker.installNow())
  ipcMain.handle('update:skip', (_e, version: unknown) => (typeof version === 'string' ? checker.skip(version) : checker.status()))
  return checker
}
