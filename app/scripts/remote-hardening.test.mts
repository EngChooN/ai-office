// 원격 보안 보강 (0.13.0): 원격에서 Bash·자동결재·작업 폴더를 못 넓히게 막은 경로와, 인증 전 연결·잠금의 IPv6 /64 묶음·인증 연결 전용 자리
import assert from 'node:assert/strict'
import https from 'node:https'
import net from 'node:net'
import { test } from 'node:test'
import { AuthGuard, ipKey, newToken } from '../src/main/remote/auth.ts'
import { createSelfSignedCert } from '../src/main/remote/cert.ts'
import { AUTHED_RESERVED, MAX_CONNECTIONS_PER_ADDRESS, RemoteServer } from '../src/main/remote/server.ts'
import { handleV2Call, pickFields, V2_METHODS, type V2CallDeps } from '../src/main/remote/v2.ts'
import { isRemoteAutoAllowed, isRemoteManualDirAllowed, isRemoteManualScopeAllowed, isRemoteRuleBlocked, restrictRemoteArgs } from '../src/main/remoteGuard.ts'
import { remoteSafeEquipment } from '../src/shared/staffPack.ts'
import { READ_ONLY_BASH, RISKY_BASH } from '../src/shared/bashPolicy.ts'

const callOf = (over: Partial<V2CallDeps> = {}) => {
  const calls: { method: string; args: unknown[] }[] = []
  const deps: V2CallDeps = { call: (method, args) => (calls.push({ method, args }), { ok: true }), attachment: () => null, manualPaths: async () => [], currentPort: () => 47900, now: 1, ...over }
  return { deps, calls }
}

// ── 1) 원격 장비: Bash 허용·금지 필드는 아예 받지 않는다 ─────────

test('setEquipment 허용 필드: MCP·스킬·예산만 — allowedTools·disallowedTools는 버린다', () => {
  const [, picked] = pickFields('setEquipment', ['kim', { mcpServers: ['a'], skills: 'all', allowedTools: ['Bash'], disallowedTools: [], monthlyBudgetUsd: 5, lightModelOff: true }]) as [string, Record<string, unknown>]
  assert.deepEqual(Object.keys(picked).sort(), ['lightModelOff', 'mcpServers', 'monthlyBudgetUsd', 'skills'])
})

test('setEquipment: 원격이 Bash를 넣으려 해도 호출 인자에 도달하지 않는다', async () => {
  const d = callOf()
  await handleV2Call({ method: 'setEquipment', args: ['kim', { mcpServers: [], skills: 'all', allowedTools: ['Bash', 'Bash(rm:*)'], disallowedTools: [], monthlyBudgetUsd: 0 }] }, d.deps)
  assert.equal(d.calls.length, 1)
  assert.equal('allowedTools' in (d.calls[0].args[1] as object), false)
  assert.equal('disallowedTools' in (d.calls[0].args[1] as object), false)
})

test('PC 쪽 방어(remoteSafeEquipment): Bash·Bash(...)는 걸러 내고 읽기 전용 표식만 남긴다', () => {
  const cur = { mcpServers: [], skills: 'all' as const, allowedTools: [], disallowedTools: [RISKY_BASH], monthlyBudgetUsd: 0 }
  const r = remoteSafeEquipment(cur, { ...cur, allowedTools: ['Bash', 'bash(git:*)', 'Bash(rm:*)', READ_ONLY_BASH, 'WebFetch'] })
  assert.deepEqual(r.allowedTools, [READ_ONLY_BASH, 'WebFetch'])
})

test('PC 쪽 방어: 이미 켜 둔 "위험 명령 금지"는 원격이 빼지 못한다 (값이 없거나 비워도 유지)', () => {
  const cur = { mcpServers: [], skills: 'all' as const, allowedTools: [], disallowedTools: [RISKY_BASH, 'WebSearch'], monthlyBudgetUsd: 0 }
  assert.deepEqual(remoteSafeEquipment(cur, { monthlyBudgetUsd: 9 }).disallowedTools, [RISKY_BASH, 'WebSearch'])
  assert.deepEqual(remoteSafeEquipment(cur, { disallowedTools: [] }).disallowedTools, [RISKY_BASH])
  assert.equal(remoteSafeEquipment(cur, { monthlyBudgetUsd: 9 }).monthlyBudgetUsd, 9)
  // 금지를 켜 둔 적 없으면 원격이 새로 넣거나 비우는 값은 그대로 (늘리는 쪽은 막을 필요가 없다)
  assert.deepEqual(remoteSafeEquipment({ ...cur, disallowedTools: [] }, { disallowedTools: ['X'] }).disallowedTools, ['X'])
})

// ── 2) 규칙·자동결재·매뉴얼 ─────────────────────────────

test('원격 자동결재는 끄기만, 항상 승인 규칙은 Bash 제외, 매뉴얼은 랩 폴더만', () => {
  assert.equal(isRemoteAutoAllowed({ mode: 'off' }), true)
  for (const mode of ['hours', 'daily']) assert.equal(isRemoteAutoAllowed({ mode }), false, mode)
  assert.equal(isRemoteRuleBlocked('Bash'), true)
  assert.equal(isRemoteRuleBlocked(' bash '), true)
  assert.equal(isRemoteRuleBlocked('Edit'), false)
  assert.equal(isRemoteManualDirAllowed('/work/lab', ['/work/lab/'], null), true)
  assert.equal(isRemoteManualDirAllowed('/work/lab/../other', ['/work/lab'], null), false)
  assert.equal(isRemoteManualDirAllowed('/etc', ['/work/lab'], null), false)
  assert.equal(isRemoteManualDirAllowed('/work/own', ['/work/lab'], '/work/own'), true)
  assert.equal(isRemoteManualDirAllowed(null, ['/work/lab'], null), false)
  assert.equal(isRemoteManualDirAllowed('', [], null), false)
})

test('원격 매뉴얼 범위: 프로젝트만, 전역 매뉴얼 생성·수정·옮기기는 막는다', () => {
  assert.equal(isRemoteManualScopeAllowed('project'), true)
  assert.equal(isRemoteManualScopeAllowed('project', 'project'), true)
  assert.equal(isRemoteManualScopeAllowed('user'), false)
  assert.equal(isRemoteManualScopeAllowed('user', 'user'), false)
  assert.equal(isRemoteManualScopeAllowed('project', 'user'), false)
})

// ── 3) S 분류: hire·updateStaff·recruitExternal ─────────

test('hire·updateStaff 허용 필드에서 작업 폴더·승인 방식을 뺀다', () => {
  const [hired] = pickFields('hire', [{ name: 'a', role: 'b', avatar: 1, model: 'default', systemPrompt: '', teamId: null, cwd: '/', approvalMode: 'acceptEdits' }]) as [Record<string, unknown>]
  assert.equal('cwd' in hired || 'approvalMode' in hired, false)
  const [, patch] = pickFields('updateStaff', ['kim', { name: 'a', cwd: '/etc', approvalMode: 'acceptEdits' }]) as [string, Record<string, unknown>]
  assert.deepEqual(patch, { name: 'a' })
})

test('S 분류는 restrict를 거친다: 새 직원은 기본 폴더와 ask, R 분류는 거치지 않는다', async () => {
  const seen: string[] = []
  const restrict: V2CallDeps['restrict'] = (method, args) => (seen.push(method), restrictRemoteArgs(method, args, { defaultCwd: '/work/default' }))
  const d = callOf({ restrict })
  await handleV2Call({ method: 'hire', args: [{ name: 'a', role: 'b', avatar: 1, model: 'default', systemPrompt: '', teamId: null, cwd: '/etc', approvalMode: 'acceptEdits' }] }, d.deps)
  assert.deepEqual(d.calls[0].args[0], { name: 'a', role: 'b', avatar: 1, model: 'default', systemPrompt: '', teamId: null, cwd: '/work/default', approvalMode: 'ask' })
  await handleV2Call({ method: 'recruitExternal', args: ['ext', { role: 'r', model: 'default', teamId: null, approvalMode: 'acceptEdits' }] }, d.deps)
  assert.equal((d.calls[1].args[1] as { approvalMode: string }).approvalMode, 'ask')
  await handleV2Call({ method: 'snapshot', args: [] }, d.deps)
  assert.deepEqual(seen, ['hire', 'recruitExternal'])
  assert.equal(V2_METHODS.hire.cls, 'S')
})

test('PC 전용(P): 훅 설치는 휴대폰에서 부르지 않는다', async () => {
  for (const method of ['setHooksInstalled', 'setAskHookInstalled']) {
    const d = callOf()
    const r = await handleV2Call({ method, args: [true] }, d.deps)
    assert.deepEqual([r.response.status, r.response.body.error, d.calls.length], [422, 'pc_only', 0], method)
  }
})

// ── 4) IPv6 /64 묶음 ────────────────────────────────

test('ipKey: IPv4는 그대로, IPv4-매핑은 풀고, IPv6는 앞 64비트로 묶는다', () => {
  assert.equal(ipKey('203.0.113.7'), '203.0.113.7')
  assert.equal(ipKey('::ffff:203.0.113.7'), '203.0.113.7')
  assert.equal(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:0db8:0001:0002::/64')
  assert.equal(ipKey('2001:db8:1:2::1'), ipKey('2001:DB8:1:2:ffff::9'))
  assert.notEqual(ipKey('2001:db8:1:2::1'), ipKey('2001:db8:1:3::1'))
  assert.equal(ipKey('::1'), '0000:0000:0000:0000::/64')
  assert.equal(ipKey('fe80::1%en0'), 'fe80:0000:0000:0000::/64')
  assert.equal(ipKey(ipKey('2001:db8:1:2::1')), '2001:0db8:0001:0002::/64')
  assert.equal(ipKey('not-an-ip'), 'not-an-ip')
})

test('잠금: 같은 /64 안에서 주소를 바꿔도 실패가 합쳐져 잠기고, 다른 /64는 영향 없다', () => {
  const guard = new AuthGuard({ tokenHash: null, revoked: [] })
  guard.rotate()
  const now = 1_800_000_000_000
  for (let i = 0; i < 5; i++) guard.check(newToken(), `2001:db8:1:2:${i}::${i + 1}`, now)
  assert.ok(guard.lockedUntil('2001:db8:1:2:ffff::1', now))
  assert.equal(guard.lockedUntil('2001:db8:1:3::1', now), null)
  assert.equal(guard.lockedIps, 1)
})

// ── 5) 연결 슬롯: 인증된 연결은 인증 전 한도와 따로 ───────────

test('인증을 마친 연결은 인증 전 연결 한도(주소당 8개)에서 빠진다', async () => {
  const { certPem, keyPem } = createSelfSignedCert()
  const server = new RemoteServer()
  const ok = { status: 200, headers: {}, body: { ok: true } }
  const port = await server.start({
    keyPem,
    certPem,
    port: 0,
    host: '127.0.0.1',
    handle: () => ok,
    precheck: (req) => (req.authorization === 'Bearer good' ? { bodyLimit: 100 } : { blocked: { status: 401, headers: {}, body: { error: 'unauthorized' } } }),
  })
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 })
  try {
    assert.ok(AUTHED_RESERVED > 0)
    const status = await new Promise<number>((resolve, reject) => {
      const r = https.request({ host: '127.0.0.1', port, path: '/v2/call', method: 'POST', rejectUnauthorized: false, agent, headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json', 'Content-Length': 2 } }, (res) => (res.resume(), res.on('end', () => resolve(res.statusCode ?? 0))))
      r.on('error', reject)
      r.end('{}')
    })
    assert.equal(status, 200)
    // 인증된 연결 1개가 살아 있어도, 인증 전 연결은 주소당 8개를 모두 쓸 수 있다
    const held: net.Socket[] = []
    for (let i = 0; i < 20; i++) {
      const s = net.connect(port, '127.0.0.1')
      s.on('error', () => {})
      held.push(s)
    }
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(held.filter((x) => !x.destroyed && x.readyState === 'open').length, MAX_CONNECTIONS_PER_ADDRESS)
    for (const s of held) s.destroy()
  } finally {
    agent.destroy()
    await server.stop()
  }
})
