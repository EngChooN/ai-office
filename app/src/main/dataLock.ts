// 데이터 폴더 하나는 AI Office 하나만 쓴다 (설치본과 개발 앱이 같은 office.db를 동시에 쓰면 서로 덮어쓴다)
// AI_OFFICE_USER_DATA(옛 이름 CLAUDE_OFFICE_USER_DATA도 인식) 를 주면 그 폴더를 데이터 폴더로 쓴다 (설치본이 켜져 있을 때 개발 앱·QA를 따로 띄울 때)
import { app, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { resolveUserDataDir } from './userDataMigrate'

const LOCK_FILE = 'office.lock'

const envDir = process.env.AI_OFFICE_USER_DATA || process.env.CLAUDE_OFFICE_USER_DATA
if (envDir) {
  app.setPath('userData', path.resolve(envDir))
} else {
  // 데이터 폴더는 새 이름('AI Office')이고, 첫 실행에는 옛 'Claude Office' 폴더를 복사해 온다 (실패하면 옛 폴더를 그대로 쓴다)
  const verify = (dir: string) => {
    const db = new DatabaseSync(path.join(dir, 'office.db'), { readOnly: true })
    try {
      return (db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined)?.integrity_check === 'ok'
    } finally {
      db.close()
    }
  }
  // AI_OFFICE_APPDATA: 이전 시험용으로 appData 위치만 바꾼다. 개발·QA 전용이며 사용자에게 안내하지 않는다
  const r = resolveUserDataDir(process.env.AI_OFFICE_APPDATA || app.getPath('appData'), { verify })
  app.setPath('userData', r.dir)
  if (r.status !== 'fresh' && r.status !== 'already') console.warn(`[data] 데이터 폴더 이전: ${r.status}${r.error ? ` (${r.error})` : ''} → ${r.dir}`)
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** 데이터 폴더 잠금을 잡는다. 다른 실행 중인 AI Office가 잡고 있으면 false (주인 없는 잠금은 넘겨받는다) */
export function acquireDataLock(): boolean {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, LOCK_FILE)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, version: app.getVersion(), isPackaged: app.isPackaged }), { flag: 'wx' })
      app.on('will-quit', () => {
        try {
          if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.unlinkSync(file)
        } catch {
          // 이미 지워졌으면 그대로 둔다
        }
      })
      return true
    } catch {
      let owner: { pid?: number } = {}
      try {
        owner = JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch {
        // 깨진 잠금 파일은 주인 없는 것으로 본다
      }
      if (owner.pid && owner.pid !== process.pid && isAlive(owner.pid)) return false
      fs.rmSync(file, { force: true })
    }
  }
  return false
}

/** 잠금을 못 잡았을 때: 알리고 끝낸다 */
export function quitForDataLock() {
  dialog.showErrorBox(
    'AI Office가 이미 켜져 있어요',
    `같은 데이터 폴더(${app.getPath('userData')})를 쓰는 다른 AI Office(옛 이름 Claude Office 포함)가 실행 중이에요. 그 앱을 끄고 다시 열어 주세요.\n\n개발용으로 따로 띄우려면 AI_OFFICE_USER_DATA 환경 변수로 다른 데이터 폴더를 지정하세요.`,
  )
  app.exit(0)
}
