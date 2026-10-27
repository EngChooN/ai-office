import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { codexTierModel, internalProviders, shouldFallback } from '../src/main/ai/aiSelect.ts'
import { codexMcpConfig } from '../src/main/ai/codexMcp.ts'
import { codexSkillRoots, parseMcpServers, parseRateLimits, parseSkills, skillsAsCommands } from '../src/main/ai/codexAssets.ts'
import { readExternalSession, scanCodexSessions } from '../src/main/ai/codexExternal.ts'
import { FallbackBackend } from '../src/main/ai/fallback.ts'
import type { AiBackend, SecretaryEvent } from '../src/main/ai/types.ts'
import type { ProviderStatus, ProvidersStatus } from '../src/shared/types.ts'

const st = (state: ProviderStatus['state']): ProviderStatus => ({ state, account: '', authMethod: '', plan: '', models: [], defaultModel: '', error: '' })
const both = (claude: ProviderStatus['state'], codex: ProviderStatus['state']): ProvidersStatus => ({ claude: st(claude), codex: st(codex) })

test('내부 AI 공급자: 감지 전·한쪽만 ready·둘 다 ready', () => {
  assert.deepEqual(internalProviders('codex', null), ['claude'])
  assert.deepEqual(internalProviders('claude', both('ready', 'loggedOut')), ['claude'])
  assert.deepEqual(internalProviders('claude', both('loggedOut', 'ready')), ['codex'])
  assert.deepEqual(internalProviders('claude', both('ready', 'ready')), ['claude', 'codex'])
  assert.deepEqual(internalProviders('auto', both('ready', 'ready')), ['claude', 'codex'])
  assert.deepEqual(internalProviders('codex', both('ready', 'ready')), ['codex', 'claude'])
  assert.deepEqual(internalProviders('codex', both('loggedOut', 'loggedOut')), ['claude'])
})

test('tier → Codex 모델: light는 가벼운 모델, standard는 기본', () => {
  const models = ['gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-terra']
  assert.equal(codexTierModel('light', models, 'gpt-6-sol'), 'gpt-6-luna')
  assert.equal(codexTierModel('standard', models, 'gpt-6-sol'), 'gpt-6-sol')
  assert.equal(codexTierModel('light', ['gpt-6-sol'], 'gpt-6-sol'), 'gpt-6-sol')
  assert.equal(codexTierModel('standard', [], ''), undefined)
})

test('폴백 판단: 사용자가 끊은 호출은 넘기지 않는다', () => {
  assert.equal(shouldFallback(new Error('login expired'), false), true)
  assert.equal(shouldFallback(new Error('x'), true), false)
  assert.equal(shouldFallback(new Error('abort'), false), false)
})

const fake = (provider: 'claude' | 'codex', o: { askFail?: boolean; events?: SecretaryEvent[] }): AiBackend => ({
  provider,
  async ask() {
    if (o.askFail) throw new Error('logged out')
    return { text: provider, costUsd: 0, tokensIn: 0, tokensOut: 0 }
  },
  secretary() {
    return {
      events: (async function* () {
        for (const e of o.events ?? []) yield e
      })(),
      close() {},
    }
  },
})

test('FallbackBackend.ask: 앞 공급자가 실패하면 다음으로, 중단이면 그대로 던진다', async () => {
  const b = new FallbackBackend(() => ['claude', 'codex'], (p) => fake(p, { askFail: p === 'claude' }))
  assert.equal((await b.ask({ prompt: '', system: '', tier: 'light', cwd: '/' })).text, 'codex')
  const only = new FallbackBackend(() => ['claude'], () => fake('claude', { askFail: true }))
  await assert.rejects(only.ask({ prompt: '', system: '', tier: 'light', cwd: '/' }))
  const ac = new AbortController()
  ac.abort()
  await assert.rejects(b.ask({ prompt: '', system: '', tier: 'light', cwd: '/', abortController: ac }))
})

test('FallbackBackend.secretary: 말하기 전 오류 결과면 다음 공급자로', async () => {
  const err: SecretaryEvent = { type: 'result', subtype: 'error', costUsd: 0, tokensIn: 0, tokensOut: 0 }
  const ok: SecretaryEvent[] = [{ type: 'text', text: '안녕' }, { type: 'result', subtype: 'success', costUsd: 0, tokensIn: 1, tokensOut: 1 }]
  const b = new FallbackBackend(() => ['claude', 'codex'], (p) => fake(p, { events: p === 'claude' ? [err] : ok }))
  const got: SecretaryEvent[] = []
  for await (const e of b.secretary({ prompt: '', system: '', cwd: '/', tier: 'standard', maxTurns: 1, maxBudgetUsd: 1, toolsName: 's', tools: { command: 'x' } }).events) got.push(e)
  assert.deepEqual(got, ok)
  // 이미 말한 뒤의 오류 결과는 그대로 전달한다
  const late = new FallbackBackend(() => ['claude', 'codex'], (p) => fake(p, { events: p === 'claude' ? [{ type: 'text', text: 'a' }, err] : ok }))
  const got2: SecretaryEvent[] = []
  for await (const e of late.secretary({ prompt: '', system: '', cwd: '/', tier: 'standard', maxTurns: 1, maxBudgetUsd: 1, toolsName: 's', tools: { command: 'x' } }).events) got2.push(e)
  assert.deepEqual(got2, [{ type: 'text', text: 'a' }, err])
})

test('Codex 스킬·MCP 원천: 이름·종류만 남기고 비밀 값은 읽지 않는다', () => {
  const skills = parseSkills({ data: [{ cwd: '/a', skills: [{ name: 'x', description: 'd1\nd2', path: '/s/x/SKILL.md', scope: 'user', enabled: true }, { name: 'off', description: '', path: '/s/off/SKILL.md', scope: 'user', enabled: false }] }, { cwd: '/b', skills: [{ name: 'x', description: 'd1', path: '/s/x/SKILL.md', scope: 'user' }] }] })
  assert.equal(skills.length, 2)
  assert.deepEqual(skillsAsCommands(skills), [{ name: 'x', description: 'd1', argumentHint: '' }])
  const mcp = parseMcpServers({ config: { mcp_servers: { figma: { command: 'npx', env: { TOKEN: 'secret' }, enabled: false }, web: { url: 'https://x', http_headers: { a: 'secret' } }, bad: {} } } })
  assert.deepEqual(mcp, [{ name: 'figma', transport: 'stdio', enabled: false }, { name: 'web', transport: 'http', enabled: true }])
  assert.ok(!JSON.stringify(mcp).includes('secret'))
})

test('Codex 사용량: 무료는 30일 창 하나, 유료는 5시간·주간', () => {
  const free = parseRateLimits({ ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 2, windowDurationMins: 43200, resetsAt: 100 }, secondary: null, rateLimitReachedType: null } })
  assert.deepEqual(free?.unifiedWindows, { thirty_day: { utilization: 0.02, resetsAt: 100 } })
  assert.equal(free?.status, 'allowed')
  const paid = parseRateLimits({ ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 85, windowDurationMins: 300, resetsAt: 1 }, secondary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: 2 } } })
  assert.deepEqual(Object.keys(paid?.unifiedWindows ?? {}), ['five_hour', 'seven_day'])
  assert.equal(paid?.status, 'allowed_warning')
  assert.equal(parseRateLimits({ ordinaryUsageAllowed: false, rateLimits: { primary: { usedPercent: 100, windowDurationMins: 300 } } })?.status, 'rejected')
  assert.equal(parseRateLimits({ rateLimits: {} }), null)
})

test('Codex MCP: 장비로 고르지 않은 설정 서버만 끈다', () => {
  const r = codexMcpConfig({ office: { command: 'x' } }, ['figma', 'office', 'my server'])
  assert.ok(r.args.includes('mcp_servers.figma.enabled=false'))
  assert.ok(r.args.includes('mcp_servers."my server".enabled=false'))
  assert.ok(!r.args.includes('mcp_servers.office.enabled=false'))
})

test('Codex 스킬 루트: all이면 Claude 스킬 폴더, 목록이면 고른 것만 링크', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-home-'))
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-cwd-'))
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'a'), { recursive: true })
  fs.mkdirSync(path.join(cwd, '.claude', 'skills', 'b'), { recursive: true })
  assert.deepEqual(codexSkillRoots(cwd, 'all', home).roots, [path.join(home, '.claude', 'skills'), path.join(cwd, '.claude', 'skills')])
  assert.deepEqual(codexSkillRoots(cwd, [], home).roots, [])
  const picked = codexSkillRoots(cwd, ['b', '../evil', 'missing'], home)
  assert.deepEqual(fs.readdirSync(picked.roots[0]), ['b'])
  picked.cleanup()
  assert.ok(!fs.existsSync(picked.roots[0]))
})

test('외부 Codex 세션: 앱이 연 세션은 빼고, 턴이 열려 있으면 일하는 중', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-sess-'))
  const now = Date.now()
  const d = new Date(now)
  const day = path.join(dir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
  fs.mkdirSync(day, { recursive: true })
  const write = (id: string, originator: string, events: string[]) =>
    fs.writeFileSync(path.join(day, `rollout-x-${id}.jsonl`), [JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/proj', originator, timestamp: d.toISOString() } }), ...events.map((t) => JSON.stringify({ type: 'event_msg', payload: { type: t } }))].join('\n') + '\n')
  write('t-work', 'codex_cli', ['task_started'])
  write('t-idle', 'codex_cli', ['task_started', 'task_complete'])
  write('t-own', 'ai-office', ['task_started'])
  const list = scanCodexSessions(dir, now)
  assert.deepEqual(list.map((s) => [s.threadId, s.status]).sort(), [['t-idle', 'idle'], ['t-work', 'working']])
  assert.equal(readExternalSession(path.join(day, 'rollout-x-t-idle.jsonl'), now + 3_600_000), null)
})
