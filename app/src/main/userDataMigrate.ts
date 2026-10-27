// 개명(Claude Office → AI Office) 데이터 폴더 이전 — 첫 실행 때 옛 폴더를 새 폴더로 "복사"한다 (순수 파일 작업, electron 없음 — 테스트 대상)
// 옛 폴더는 지우지 않는다. 복사·검사가 실패하거나 옛 앱이 켜져 있으면 옛 폴더를 그대로 쓴다.
import fs from 'node:fs'
import path from 'node:path'

export const NEW_DATA_NAME = 'AI Office'
export const OLD_DATA_NAME = 'Claude Office'
const DB_FILE = 'office.db'
const LOCK_FILE = 'office.lock'

export type MigrateStatus =
  | 'fresh' // 옛 폴더도 새 폴더 데이터도 없음 — 새 폴더로 시작
  | 'already' // 새 폴더에 이미 데이터가 있음 — 옛 폴더는 건드리지 않음
  | 'copied' // 옛 폴더를 새 폴더로 복사함
  | 'old-running' // 옛 앱이 켜져 있어 복사하지 않고 옛 폴더를 씀
  | 'copy-failed' // 복사·검사 실패 — 옛 폴더를 씀

export interface MigrateResult {
  dir: string
  status: MigrateStatus
  error?: string
}

export interface MigrateDeps {
  /** 복사본의 DB가 열리고 무결성 검사를 통과하는지 (없으면 파일 존재만 본다) */
  verify?: (dir: string) => boolean
  isAlive?: (pid: number) => boolean
}

const defaultAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function oldAppRunning(oldDir: string, alive: (pid: number) => boolean): boolean {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(oldDir, LOCK_FILE), 'utf8')) as { pid?: number }
    return !!owner.pid && owner.pid !== process.pid && alive(owner.pid)
  } catch {
    return false
  }
}

/** 이번 실행에서 쓸 데이터 폴더를 정한다 (필요하면 옛 폴더를 복사). 던지지 않는다 */
export function resolveUserDataDir(appData: string, deps: MigrateDeps = {}): MigrateResult {
  const newDir = path.join(appData, NEW_DATA_NAME)
  const oldDir = path.join(appData, OLD_DATA_NAME)
  if (fs.existsSync(path.join(newDir, DB_FILE))) return { dir: newDir, status: 'already' }
  if (!fs.existsSync(path.join(oldDir, DB_FILE))) return { dir: newDir, status: 'fresh' }
  if (oldAppRunning(oldDir, deps.isAlive ?? defaultAlive)) return { dir: oldDir, status: 'old-running' }
  const staging = `${newDir}.migrating`
  try {
    fs.rmSync(staging, { recursive: true, force: true })
    // 잠금 파일은 옛 앱의 것이라 가져오지 않는다
    fs.cpSync(oldDir, staging, { recursive: true, filter: (src) => path.basename(src) !== LOCK_FILE })
    if (!fs.existsSync(path.join(staging, DB_FILE))) throw new Error('복사본에 office.db가 없어요')
    if (deps.verify && !deps.verify(staging)) throw new Error('복사본 DB 검사에 실패했어요')
    if (fs.existsSync(newDir)) {
      // 새 폴더가 로그 등으로 먼저 만들어졌어도 있는 파일은 덮지 않고 합친다
      fs.cpSync(staging, newDir, { recursive: true, force: false, errorOnExist: false })
      fs.rmSync(staging, { recursive: true, force: true })
    } else {
      fs.renameSync(staging, newDir)
    }
    return { dir: newDir, status: 'copied' }
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true })
    return { dir: oldDir, status: 'copy-failed', error: (e as Error).message }
  }
}
