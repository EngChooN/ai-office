// A컴의 피어 기록과 토큰 보관 (설계서 1-5 · 2절)
// 토큰은 DB에 평문으로 두지 않는다 — TokenVault가 키체인으로 암호화한 파일에 둔다 (읽지 못하면 'unreadable' = 다시 짝짓기)

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { PeerRecord, PeerStore } from './peerStore'

export interface TokenVault {
  load(peerId: string): string | 'unreadable' | null
  save(peerId: string, token: string): void
  remove(peerId: string): void
}

export function memoryTokenVault(): TokenVault {
  const m = new Map<string, string>()
  return { load: (id) => m.get(id) ?? null, save: (id, t) => void m.set(id, t), remove: (id) => void m.delete(id) }
}

/** 파일 보관: <dir>/<peerId>.token.enc (폴더 0700·파일 0600). encrypt·decrypt는 safeStorage를 밖에서 넣어 준다 (없으면 0600 평문) */
export function fileTokenVault(dir: string, crypt?: { encrypt(s: string): Buffer; decrypt(b: Buffer): string }): TokenVault {
  const file = (id: string) => path.join(dir, `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.token.enc`)
  return {
    load(id) {
      try {
        const buf = fs.readFileSync(file(id))
        return crypt ? crypt.decrypt(buf) : buf.toString('utf8')
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : 'unreadable'
      }
    },
    save(id, token) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
      fs.chmodSync(dir, 0o700)
      fs.writeFileSync(file(id), crypt ? crypt.encrypt(token) : token, { mode: 0o600 })
      fs.chmodSync(file(id), 0o600)
    },
    remove(id) {
      fs.rmSync(file(id), { force: true })
    },
  }
}

export class PeerRegistry {
  private store: PeerStore
  private vault: TokenVault
  private now: () => number

  constructor(store: PeerStore, vault: TokenVault, now: () => number = Date.now) {
    this.store = store
    this.vault = vault
    this.now = now
  }

  listPeers() {
    return this.store.peers.list().sort((a, b) => a.pairedAt - b.pairedAt)
  }

  getPeer(id: string) {
    return this.store.peers.get(id)
  }

  /** 새 피어를 저장한다. 같은 주소·지문이면 같은 피어로 보고 토큰만 바꾼다 (다시 짝짓기) */
  addPeer(input: { name: string; host: string; port: number; spki: string; slotId: string; token: string }): PeerRecord {
    const same = this.listPeers().find((p) => p.host === input.host && p.port === input.port)
    const rec: PeerRecord = { id: same?.id ?? crypto.randomBytes(6).toString('hex'), name: input.name.slice(0, 60) || input.host, host: input.host, port: input.port, spki: input.spki, slotId: input.slotId, pairedAt: this.now(), lastSeenAt: null }
    this.vault.save(rec.id, input.token)
    this.store.peers.put(rec)
    return rec
  }

  tokenOf(peerId: string) {
    return this.vault.load(peerId)
  }

  touch(peerId: string, lastHost?: string) {
    const p = this.store.peers.get(peerId)
    if (p) this.store.peers.put({ ...p, lastSeenAt: this.now(), ...(lastHost ? { lastHost } : {}) })
  }

  /** 피어와 그 토큰을 지운다 */
  removePeer(peerId: string) {
    this.store.peers.delete(peerId)
    this.vault.remove(peerId)
  }
}
