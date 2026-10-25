import os from 'node:os'
import path from 'node:path'

// 맥·윈도우 차이를 한 곳에: 실행 파일 이름, 명령 찾기, 흔한 설치 경로

export const IS_WINDOWS = process.platform === 'win32'

/** 실행 파일 이름 (윈도우는 .exe) */
export const exeName = (name: string) => (IS_WINDOWS ? `${name}.exe` : name)

/** 명령이 어디 있는지 찾는 명령 */
export const WHICH = IS_WINDOWS ? 'where' : 'which'

const HOME = os.homedir()
const PROGRAM_FILES = process.env.ProgramFiles ?? 'C:\\Program Files'

// 앱을 Finder·탐색기에서 열면 PATH가 짧아 Homebrew·Git for Windows의 git·gh를 못 찾으므로 흔한 경로를 붙인다
const EXTRA_PATHS = IS_WINDOWS
  ? [path.join(PROGRAM_FILES, 'Git', 'cmd'), path.join(PROGRAM_FILES, 'GitHub CLI'), path.join(HOME, '.local', 'bin')]
  : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']

/** 외부 명령(git·gh 등)을 돌릴 환경 변수. 윈도우는 Path·PATH가 섞이지 않게 하나로 합친다 */
export function toolEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const current = Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')
  const value = [...current.map((k) => env[k]), ...EXTRA_PATHS].filter(Boolean).join(path.delimiter)
  for (const k of current) delete env[k]
  env.PATH = value
  return env
}
