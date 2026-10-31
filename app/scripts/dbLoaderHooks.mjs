// db.ts를 electron 없이 테스트에서 불러오기 위한 로더: electron은 가짜 app으로, 확장자 없는 상대 경로는 .ts로 풀어 준다
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ELECTRON_STUB = 'data:text/javascript,export const app = { getPath: () => globalThis.__testUserData }; export default { app }'

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
