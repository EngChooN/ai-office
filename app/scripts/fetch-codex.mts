// Codex app-server 패키지를 받아 vendor/codex/<플랫폼>-<arch> 에 푼다 (forge 패키징이 설치본 Resources/codex 로 복사).
// 사용: node scripts/fetch-codex.mts [플랫폼-arch ...]   (생략하면 이 PC 것)  예) darwin-arm64 darwin-x64 win32-x64
// 도구 실행에는 codex-app-server 만으로 모자라 codex-code-mode-host·rg 가 든 패키지 전체가 필요하다.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const VERSION = '0.164.0'
const TARGETS: Record<string, { triple: string; sha256: string }> = {
  'darwin-arm64': { triple: 'aarch64-apple-darwin', sha256: '7fcd5f0346c9338dd45f1af7c53115a29f651ac61a4264e2dbca49b7aa064ac0' },
  'darwin-x64': { triple: 'x86_64-apple-darwin', sha256: '125dea1f429558275a6cd73dfc7f20cc823193c1a61ee69222af250ae04e9762' },
  'win32-x64': { triple: 'x86_64-pc-windows-msvc', sha256: 'e177a62037b0b6b26774700f07a713db67f85efd2187c6a574c7a6a14ebf4b7e' },
}

const root = path.resolve(import.meta.dirname, '..', 'vendor', 'codex')
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : [`${process.platform}-${process.arch}`]

for (const key of wanted) {
  const t = TARGETS[key]
  if (!t) throw new Error(`지원하지 않는 대상: ${key} (${Object.keys(TARGETS).join(', ')})`)
  const dest = path.join(root, key)
  const marker = path.join(dest, 'codex-package.json')
  if (fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker, 'utf8')).version === VERSION) {
    console.log(`[codex] ${key} ${VERSION} 이미 있음`)
    continue
  }
  const url = `https://github.com/openai/codex/releases/download/rust-v${VERSION}/codex-app-server-package-${t.triple}.tar.gz`
  console.log(`[codex] ${key} 내려받는 중: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`내려받기 실패 ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const sum = createHash('sha256').update(buf).digest('hex')
  if (sum !== t.sha256) throw new Error(`체크섬 불일치 ${key}: ${sum}`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'co-codex-dl-'))
  try {
    const tgz = path.join(tmp, 'pkg.tar.gz')
    fs.writeFileSync(tgz, buf)
    fs.rmSync(dest, { recursive: true, force: true })
    fs.mkdirSync(dest, { recursive: true })
    execFileSync('tar', ['-xzf', tgz, '-C', dest], { stdio: 'inherit' })
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  console.log(`[codex] ${key} 준비됨 → ${dest}`)
}
