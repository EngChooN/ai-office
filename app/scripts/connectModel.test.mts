// 설정 › 휴대폰·PC 연결(단계형) 판단 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { devicesOf, phoneAddAction, readinessOf, seenAgo } from '../src/shared/connectModel.ts'
import type { PeerSlotView, PeerView } from '../src/shared/peerProtocol.ts'
import type { WorkspaceView } from '../src/shared/workspace.ts'

test('준비물: Tailscale은 이 PC가 연결됨일 때만 준비 끝, 같은 와이파이·공유기는 바로', () => {
  assert.deepEqual(readinessOf({ mode: 'tailscale', tsState: 'running' }), { isReady: true, pc: 'ok' })
  assert.deepEqual(readinessOf({ mode: 'tailscale', tsState: 'notInstalled' }), { isReady: false, pc: 'notInstalled' })
  assert.deepEqual(readinessOf({ mode: 'tailscale', tsState: 'needsLogin' }), { isReady: false, pc: 'needsLogin' })
  assert.deepEqual(readinessOf({ mode: 'tailscale', tsState: 'stopped' }), { isReady: false, pc: 'stopped' })
  assert.deepEqual(readinessOf({ mode: 'lan', tsState: 'notInstalled' }), { isReady: true, pc: 'ok' })
  assert.deepEqual(readinessOf({ mode: 'router', tsState: 'stopped' }), { isReady: true, pc: 'ok' })
})

test('새 휴대폰: 이미 붙은 휴대폰이 있으면 바꾸기(지금 휴대폰 끊김), 없으면 바로 QR', () => {
  assert.equal(phoneAddAction({ isTokenUsed: true }), 'replace')
  assert.equal(phoneAddAction({ isTokenUsed: false }), 'show')
})

const now = 10_000_000
const peer = (id: string, state: PeerView['state']): PeerView => ({ id, name: `PC-${id}`, host: 'h', port: 1, pairedAt: 0, state })
const slot = (id: string, lastSeenAt: number | null): PeerSlotView => ({ id, label: `S-${id}`, createdAt: 0, lastSeenAt, view: false, viewPending: false })
const ws = (peerId: string, name: string): WorkspaceView => ({ id: `w-${peerId}`, peerId, name, color: 'teal', order: 0, lastUsedAt: 0, status: 'ready', pending: 0 })

test('기기 목록: 휴대폰(열쇠 쓰였을 때만) + 이 PC가 보는 PC + 이 PC를 보는 PC, 2분 안 접속이면 지금 연결됨', () => {
  const list = devicesOf({ status: { isTokenUsed: true, phoneSeenAt: now - 30_000 }, peers: [peer('a', 'online'), peer('b', 'offline')], slots: [slot('c', now - 5 * 60_000), slot('d', null)], workspaces: [], now })
  assert.deepEqual(list.map((d) => [d.kind, d.id, d.isOnline]), [
    ['phone', 'phone', true],
    ['pc', 'a', true],
    ['pc', 'b', false],
    ['to', 'c', false],
    ['to', 'd', false],
  ])
  assert.equal(devicesOf({ status: { isTokenUsed: false, phoneSeenAt: null }, peers: [], slots: [], workspaces: [], now }).length, 0)
  assert.equal(devicesOf({ status: { isTokenUsed: true, phoneSeenAt: null }, peers: [], slots: [], workspaces: [], now })[0].isOnline, false)
})

test('같은 PC는 한 줄: 짝과 PC 목록 항목을 합치고(목록 이름 우선), 목록에만 있는 PC는 짝 없음으로, 짝만 있는 PC는 목록 없음으로', () => {
  const list = devicesOf({ status: { isTokenUsed: false, phoneSeenAt: null }, peers: [peer('a', 'online'), peer('b', 'online')], slots: [], workspaces: [ws('a', '회사 PC'), ws('gone', '옛 PC')], now })
  assert.deepEqual(
    list.map((d) => (d.kind === 'pc' ? [d.id, d.name, Boolean(d.peer), d.workspace?.id ?? null] : [d.kind])),
    [
      ['a', '회사 PC', true, 'w-a'],
      ['b', 'PC-b', true, null],
      ['gone', '옛 PC', false, 'w-gone'],
    ],
  )
})

test('마지막 접속 한 줄', () => {
  assert.deepEqual(seenAgo(null, now), { key: 'connect.seen.never' })
  assert.deepEqual(seenAgo(now - 59_000, now), { key: 'connect.seen.now' })
  assert.deepEqual(seenAgo(now - 5 * 60_000, now), { key: 'connect.seen.min', n: 5 })
  assert.deepEqual(seenAgo(now - 3 * 3_600_000, now), { key: 'connect.seen.hour', n: 3 })
  const at = new Date(2026, 10, 2, 9).getTime()
  assert.deepEqual(seenAgo(at, new Date(2026, 10, 13).getTime()), { key: 'connect.seen.date', month: 11, day: 2 })
})
