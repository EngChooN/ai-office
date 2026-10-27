import path from 'node:path'
import { app } from 'electron'
import { exeName } from '../platform'

/** Codex app-server 패키지 폴더 (bin/codex-app-server + bin/codex-code-mode-host + codex-path/rg).
 * 설치본: Resources/codex. 개발: AI_OFFICE_CODEX_DIR 또는 app/vendor/codex/<플랫폼>-<arch> (scripts/fetch-codex.mts 가 받는다) */
export function codexPackageDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'codex')
  return process.env.AI_OFFICE_CODEX_DIR ?? path.join(app.getAppPath(), 'vendor', 'codex', `${process.platform}-${process.arch}`)
}

export const codexBinaryPath = () => path.join(codexPackageDir(), 'bin', exeName('codex-app-server'))
