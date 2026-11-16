// 원격 인증서 키 저장 (electron 필요 — 테스트 대상 아님): userData/remote/ 폴더 0700, 파일 0600
// 개인 키는 운영체제 키체인(safeStorage)으로 한 번 더 암호화한다 — 윈도우는 파일 권한만으로는 소유자 전용이 되지 않는다

import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

const dir = () => path.join(app.getPath('userData'), 'remote')
const CERT = 'cert.pem'
/** safeStorage로 암호화한 개인 키 (암호화를 못 쓰는 환경에서만 key.pem 평문 + 0600) */
const KEY_ENC = 'key.enc'
const KEY_PLAIN = 'key.pem'

function writePrivate(file: string, data: string | Buffer) {
  fs.writeFileSync(file, data, { mode: 0o600 })
  // 이미 있던 파일은 mode가 안 바뀌므로 다시 맞춘다
  fs.chmodSync(file, 0o600)
}

/** 저장된 키 (처음이면 null, 파일은 있는데 못 읽거나 복호화에 실패하면 'unreadable' — 새로 만들고 화면에 알린다) */
export function loadRemoteKeys(): { keyPem: string; certPem: string } | 'unreadable' | null {
  if (!fs.existsSync(path.join(dir(), CERT))) return null
  try {
    const certPem = fs.readFileSync(path.join(dir(), CERT), 'utf8')
    const enc = path.join(dir(), KEY_ENC)
    if (fs.existsSync(enc)) return { certPem, keyPem: safeStorage.decryptString(fs.readFileSync(enc)) }
    return { certPem, keyPem: fs.readFileSync(path.join(dir(), KEY_PLAIN), 'utf8') }
  } catch {
    // 키체인이 바뀌었거나(다른 사용자·다른 PC로 옮김) 파일이 깨짐
    return 'unreadable'
  }
}

export function saveRemoteKeys(keys: { keyPem: string; certPem: string }) {
  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 })
  fs.chmodSync(dir(), 0o700)
  writePrivate(path.join(dir(), CERT), keys.certPem)
  if (safeStorage.isEncryptionAvailable()) {
    writePrivate(path.join(dir(), KEY_ENC), safeStorage.encryptString(keys.keyPem))
    fs.rmSync(path.join(dir(), KEY_PLAIN), { force: true })
  } else writePrivate(path.join(dir(), KEY_PLAIN), keys.keyPem)
}

/** 짝짓기 코드 (사용자가 끌 때까지 유지하려고 저장) — 코드는 비밀이라 safeStorage로 암호화한 파일에만 둔다. 암호화를 못 쓰면 저장하지 않는다 (평문 저장 금지) */
const PAIR_ENC = 'pair.enc'
const PAIR_KINDS = ['peer', 'phone', 'view']

export function loadPairingCode(): { kind: 'peer' | 'phone' | 'view'; code: string } | null {
  try {
    const file = path.join(dir(), PAIR_ENC)
    if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) return null
    const v = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as { kind?: unknown; code?: unknown }
    return typeof v.kind === 'string' && PAIR_KINDS.includes(v.kind) && typeof v.code === 'string' && /^[A-Z0-9]{12}$/.test(v.code) ? (v as { kind: 'peer' | 'phone' | 'view'; code: string }) : null
  } catch {
    // 키체인이 바뀌었거나 파일이 깨짐 — 코드는 새로 만들면 되므로 없는 것으로 본다
    return null
  }
}

export function savePairingCode(p: { kind: 'peer' | 'phone' | 'view'; code: string } | null) {
  try {
    const file = path.join(dir(), PAIR_ENC)
    if (!p || !safeStorage.isEncryptionAvailable()) return fs.rmSync(file, { force: true })
    fs.mkdirSync(dir(), { recursive: true, mode: 0o700 })
    fs.chmodSync(dir(), 0o700)
    writePrivate(file, safeStorage.encryptString(JSON.stringify(p)))
  } catch {
    // 저장에 실패해도 이번 실행의 코드는 그대로 쓴다 (다시 켜면 새 코드)
  }
}
