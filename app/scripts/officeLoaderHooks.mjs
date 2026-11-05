// office.ts를 electron 없이 시험에서 불러오기 위한 로더 (netResumeFlow.test.mts)
// - electron: globalThis.__electron에 넣어 둔 가짜 app·net (나머지 이름은 빈 객체)
// - TS: node의 타입 지우기는 매개변수 속성·type 없는 타입 import를 못 다뤄 rolldown(vite가 쓰는 것)으로 바꾼다
// - 앱은 CJS로 묶여 __filename·__dirname을 쓰므로 ESM에서도 쓸 수 있게 붙인다
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'rolldown/utils'

const ELECTRON_NAMES = ['app', 'net', 'shell', 'dialog', 'ipcMain', 'BrowserWindow', 'powerMonitor', 'screen', 'safeStorage', 'session', 'protocol', 'webContents', 'systemPreferences', 'Menu', 'nativeImage', 'Tray', 'clipboard', 'nativeTheme', 'Notification']
const ELECTRON_STUB = 'data:text/javascript,' + encodeURIComponent(ELECTRON_NAMES.map((n) => `export const ${n} = globalThis.__electron?.${n} ?? {};`).join('') + 'export default {}')

export async function resolve(specifier, context, next) {
  if (specifier === 'electron') return { url: ELECTRON_STUB, shortCircuit: true }
  if (specifier.startsWith('.') && context.parentURL && !/\.[mc]?[jt]sx?$/.test(specifier)) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(specifier + ext, context.parentURL)
      if (fs.existsSync(fileURLToPath(url))) return next(url.href, context)
    }
  }
  return next(specifier, context)
}

const CJS_GLOBALS = "import { fileURLToPath as __toPath } from 'node:url'; import { dirname as __dirOf } from 'node:path'; const __filename = __toPath(import.meta.url); const __dirname = __dirOf(__filename);\n"

export async function load(url, context, next) {
  if (!url.startsWith('file:') || !/\.tsx?$/.test(url) || url.includes('/node_modules/')) return next(url, context)
  const file = fileURLToPath(url)
  let source = transformSync(file, fs.readFileSync(file, 'utf8'), { lang: file.endsWith('x') ? 'tsx' : 'ts' }).code
  if (/\b__(?:filename|dirname)\b/.test(source)) source = CJS_GLOBALS + source
  return { format: 'module', source, shortCircuit: true }
}
