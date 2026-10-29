import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import { squirrelEventOf } from './squirrelArgs'

/** 바로가기(시작 메뉴·바탕화면)를 만들거나 지운다. Update.exe는 설치 폴더 한 단계 위에 있다 */
const runUpdateExe = (...args: string[]): void => {
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe')
  spawnSync(updateExe, args, { windowsHide: true })
}

/** Squirrel 이벤트로 실행됐으면 바로가기를 처리하고 곧바로 종료한다(true). 아니면 아무것도 안 한다.
 * index.ts 맨 앞에서 불러야 DB·창을 만들기 전에 끝난다. */
export const handleSquirrelEvent = (): boolean => {
  if (process.platform !== 'win32') return false
  const event = squirrelEventOf(process.argv)
  if (!event) return false
  const exe = path.basename(process.execPath)
  if (event === 'install' || event === 'updated') runUpdateExe('--createShortcut', exe, '--shortcut-locations', 'Desktop,StartMenu')
  else if (event === 'uninstall') runUpdateExe('--removeShortcut', exe, '--shortcut-locations', 'Desktop,StartMenu')
  app.exit(0)
  return true
}

handleSquirrelEvent()
