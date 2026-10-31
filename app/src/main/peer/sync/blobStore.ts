// sha256 주소로 파일 내용을 보관하는 곳 (B컴: 받은 복사본 내용·변경 묶음 내용 / A컴: 받은 변경 묶음 스테이징)
// 넣을 때 해시를 다시 계산해 주소와 다르면 거절한다. 임시 파일에 쓰고 rename (반쯤 쓴 파일이 남지 않게)

import crypto from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isSha256, SyncError, SYNC_LIMITS } from '../../../shared/peerSync.ts'
import { sha256Of } from './manifest.ts'

export class BlobStore {
  readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  pathOf(sha: string) {
    if (!isSha256(sha)) throw new SyncError('blob_mismatch', 'bad address')
    return path.join(this.dir, sha.slice(0, 2), sha)
  }

  async has(sha: string) {
    return !!(await fs.stat(this.pathOf(sha)).catch(() => null))?.isFile()
  }

  /** 내용을 넣는다 — 해시가 주소와 다르거나 한도를 넘으면 SyncError */
  async put(sha: string, data: Buffer, expectedSize?: number) {
    if (data.length > SYNC_LIMITS.fileMax || (expectedSize !== undefined && data.length !== expectedSize)) throw new SyncError('blob_mismatch', 'size')
    if (sha256Of(data) !== sha) throw new SyncError('blob_mismatch', 'hash')
    const dest = this.pathOf(sha)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    const tmp = `${dest}.${crypto.randomUUID()}.tmp`
    await fs.writeFile(tmp, data, { mode: 0o600, flag: 'wx' })
    await fs.rename(tmp, dest)
  }

  /** 디스크 파일을 그대로 넣는다 (링크는 따라가지 않음). 넣은 주소를 돌려준다 */
  async putFile(abs: string): Promise<{ sha256: string; size: number }> {
    const fh = await fs.open(abs, constants.O_RDONLY | constants.O_NOFOLLOW)
    let data: Buffer
    try {
      const st = await fh.stat()
      if (!st.isFile() || st.size > SYNC_LIMITS.fileMax) throw new SyncError('changes_too_large', 'file')
      data = await fh.readFile()
    } finally {
      await fh.close()
    }
    const sha = sha256Of(data)
    if (!(await this.has(sha))) await this.put(sha, data)
    return { sha256: sha, size: data.length }
  }

  read(sha: string) {
    return fs.readFile(this.pathOf(sha))
  }

  async remove(sha: string) {
    await fs.rm(this.pathOf(sha), { force: true })
  }

  /** 쓰는 곳이 없는 내용을 지운다 */
  async prune(keep: ReadonlySet<string>) {
    const tops = await fs.readdir(this.dir).catch(() => [] as string[])
    for (const top of tops) {
      const sub = path.join(this.dir, top)
      for (const name of await fs.readdir(sub).catch(() => [] as string[])) {
        if (!keep.has(name)) await fs.rm(path.join(sub, name), { force: true })
      }
    }
  }
}
