// A컴의 피어·원격 직원 기록과 토큰 보관 (설계서 1-5 · 2절)
// 토큰은 DB에 평문으로 두지 않는다 — TokenVault가 키체인으로 암호화한 파일에 둔다 (읽지 못하면 'unreadable' = 다시 짝짓기)

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { peerStaffId, type PeerStaffBrief } from '../../shared/peerProtocol.ts'
import type { PeerRecord, PeerStaffRecord, PeerStore } from './peerStore'

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

  /** 피어와 그 원격 직원·토큰을 지운다. 랩에서 빼야 할 원격 직원 id를 돌려준다 */
  removePeer(peerId: string): string[] {
    const staff = this.listStaff(peerId)
    for (const s of staff) this.store.staff.delete(s.id)
    this.store.peers.delete(peerId)
    this.vault.remove(peerId)
    return staff.map((s) => s.id)
  }

  // ── 원격 직원 ──

  listStaff(peerId?: string) {
    return this.store.staff.list().filter((s) => !peerId || s.peerId === peerId)
  }

  /** p:<peerId>:<remoteId> → 기록 (없으면 undefined) */
  staffOf(id: string) {
    return this.store.staff.get(id)
  }

  /** 랩에 넣을 직원으로 저장 (이미 있으면 그 기록) */
  addStaff(peerId: string, brief: PeerStaffBrief): PeerStaffRecord {
    const id = peerStaffId(peerId, brief.id)
    const old = this.store.staff.get(id)
    if (old) return old
    const rec: PeerStaffRecord = { id, peerId, remoteId: brief.id, name: brief.name, role: brief.role, avatar: brief.avatar, provider: brief.provider, model: brief.model, lastKnownStatus: brief.status, lastSeenAt: this.now(), addedAt: this.now() }
    this.store.staff.put(rec)
    return rec
  }

  removeStaff(id: string) {
    this.store.staff.delete(id)
  }

  /** B컴이 준 얇은 목록으로 캐시를 고친다: 있으면 갱신, 없어졌으면 isGone. 달라진 게 있으면 true */
  syncStaff(peerId: string, briefs: PeerStaffBrief[]) {
    let isChanged = false
    for (const s of this.listStaff(peerId)) {
      const b = briefs.find((x) => x.id === s.remoteId)
      const next: PeerStaffRecord = b
        ? { ...s, name: b.name, role: b.role, avatar: b.avatar, provider: b.provider, model: b.model, lastKnownStatus: b.status, lastSeenAt: this.now(), isGone: false }
        : { ...s, isGone: true }
      if (JSON.stringify(next) !== JSON.stringify({ ...s, lastSeenAt: next.lastSeenAt })) isChanged = true
      this.store.staff.put(next)
    }
    return isChanged
  }

  /** B컴 snapshot의 직원 상태 반영 (빠르게 자주 오므로 달라졌을 때만 쓴다) */
  patchStatus(peerId: string, briefs: PeerStaffBrief[]) {
    let isChanged = false
    for (const b of briefs) {
      const s = this.store.staff.get(peerStaffId(peerId, b.id))
      if (!s || s.lastKnownStatus === b.status) continue
      this.store.staff.put({ ...s, lastKnownStatus: b.status, lastSeenAt: this.now() })
      isChanged = true
    }
    return isChanged
  }
}
