// 안드로이드 1.1 확인용 로컬 원격 서버 (v1 + v2 + SSE) — PC 앱의 실제 원격 코드(RemoteService)를 쓰고 사무실만 가짜로 채운다
// Electron 없이 돌아가므로 실제 사무실·PC 앱에는 손대지 않는다
//
//   node android/tools/dev-server-v2.mts [포트=47920] [QR 주소=10.0.2.2]
//
// 관리(이 PC 안에서만, 평문 = 포트+1):
//   curl -s localhost:47921/qr        QR 내용(JSON) — 디버그 앱에 --es qr 로 넣는다
//   curl -s localhost:47921/chat      단체방 메시지 이벤트 하나 보내기 (SSE 확인)
//   curl -s localhost:47921/work      박패턴 상태 바꾸고 snapshot 이벤트 보내기
//   curl -s localhost:47921/calls     폰에서 온 호출 기록
//   curl -s localhost:47921/off       원격 끄기 (bye remote_disabled)   /on  다시 켜기

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { hashToken, newToken } from '../../app/src/main/remote/auth.ts'
import { spkiFingerprint } from '../../app/src/main/remote/cert.ts'
import { DEFAULT_REMOTE_CONFIG, RemoteService, type RemoteConfig } from '../../app/src/main/remote/service.ts'
import type { V2Office } from '../../app/src/main/remote/v2routes.ts'
import { chat, reads, snapshot, staff } from './fake-office.mts'

const PORT = Number(process.argv[2] ?? 47920)
const QR_HOST = process.argv[3] ?? '10.0.2.2'

const now = () => Date.now()
const calls: string[] = []
const store = new Map<string, any>()
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-dev-v2-'))

const token = newToken()
let config: RemoteConfig = { ...DEFAULT_REMOTE_CONFIG, port: PORT, tokenHash: hashToken(token), isTokenUsed: true }
let keys: { keyPem: string; certPem: string } | null = null

const office: V2Office = {
  call: (method, args) => {
    calls.push(`📱 ${method}(${JSON.stringify(args).slice(0, 120)})`)
    if (method === 'remoteStatus') return svc.status()
    if (reads[method]) return reads[method](...args)
    if (method === 'sendChat') {
      chat.push({ id: chat.length + 1, ts: now(), from: 'me', text: String(args[0]) })
      svc.publish('chat', chat.at(-1))
      return undefined
    }
    if (method === 'instruct') {
      const s = staff.find((x) => x.id === args[0])
      if (s) Object.assign(s, { status: 'working', activity: `지시 처리 중: ${String(args[1]).slice(0, 30)}` })
      svc.publish('snapshot', snapshot())
      return undefined
    }
    return { called: method }
  },
  attachment: (id) => store.get(id) ?? null,
  saveUpload: (name, mime, data) => {
    const id = crypto.randomUUID()
    const file = path.join(dir, `${id}__${name.replace(/[/\\]/g, '_')}`)
    fs.writeFileSync(file, data)
    const a = { id, name, path: file, mime: mime || 'application/octet-stream', size: data.length }
    store.set(id, a)
    calls.push(`📎 첨부 ${name} ${data.length}B`)
    return a
  },
}

const svc = new RemoteService({
  office: { view: () => ({ staff, tasks: [] }), decide: () => true, answerQuestion: () => true, reviewPlan: () => true, instruct: () => {} },
  serverVersion: '0.9.0-dev',
  loadConfig: () => config,
  saveConfig: (c) => (config = c),
  loadKeys: () => keys,
  saveKeys: (k) => (keys = k),
  alert: (t, b) => console.log(`🔔 ${t} ${b}`),
  changed: () => {},
  upnp: null,
  listenHost: '0.0.0.0',
  v2: office,
})

await svc.enable(PORT)
const qr = () => JSON.stringify({ v: 1, host: QR_HOST, port: PORT, token, spki: spkiFingerprint(keys!.certPem), pv: 2 })

const admin: Record<string, () => string> = {
  '/qr': qr,
  '/chat': () => {
    chat.push({ id: chat.length + 1, ts: now(), from: 's5', text: `PC에서 보낸 메시지 ${new Date().toLocaleTimeString()}` })
    svc.publish('chat', chat.at(-1))
    return '채팅 이벤트 보냄'
  },
  '/work': () => {
    const s = staff.find((x) => x.id === 's2')!
    Object.assign(s, { status: s.status === 'working' ? 'idle' : 'working', activity: 'Edit', statusSince: now() })
    svc.publish('snapshot', snapshot())
    return `박패턴 → ${s.status} (snapshot 이벤트)`
  },
  '/calls': () => calls.join('\n'),
  // 원격 끄기·켜기 (열린 스트림에 bye remote_disabled, 포트 닫힘 → 다시 열림) — 같은 토큰·인증서 유지
  '/off': () => (void svc.disable(), '원격 꺼짐'),
  '/on': () => (void svc.enable(PORT), '원격 켜짐'),
}
http.createServer((req, res) => {
  const fn = admin[req.url ?? '']
  res.writeHead(fn ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(fn ? `${fn()}\n` : `${Object.keys(admin).join(' ')}\n`)
}).listen(PORT + 1, '127.0.0.1')

console.log(`원격 v1+v2 서버 https://0.0.0.0:${PORT}  (관리: http://127.0.0.1:${PORT + 1})`)
console.log(`QR: ${qr()}`)
