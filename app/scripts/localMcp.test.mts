import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { codexMcpConfig } from '../src/main/ai/codexMcp.ts'
import { defineTool, registerLocalMcp, startLocalMcp, stopLocalMcp } from '../src/main/mcp/localMcp.ts'

const post = (config: { url: string; headers?: Record<string, string> }, body: unknown, headers?: Record<string, string>) =>
  fetch(config.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(headers ?? config.headers) }, body: JSON.stringify(body) })

test('로컬 MCP: 토큰 인증·도구 목록·호출·잘못된 인자·폐기', async () => {
  await startLocalMcp()
  const echo = defineTool('echo', '되풀이', { msg: z.string().describe('할 말') }, async ({ msg }) => ({ content: [{ type: 'text', text: `echo:${msg}` }] }))
  const boom = defineTool('boom', '실패', {}, async () => {
    throw new Error('터짐')
  })
  const h = registerLocalMcp('s1', 'office', [echo, boom])
  const cfg = h.config as { url: string; headers: Record<string, string> }
  assert.match(cfg.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/)

  assert.equal((await post(cfg, { jsonrpc: '2.0', id: 1, method: 'ping' }, {})).status, 401)
  assert.equal((await post(cfg, { jsonrpc: '2.0', id: 1, method: 'ping' }, { Authorization: 'Bearer nope' })).status, 401)

  const init = await (await post(cfg, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json()
  assert.equal(init.result.serverInfo.name, 'office')
  assert.equal((await post(cfg, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202)

  const list = await (await post(cfg, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
  assert.deepEqual(list.result.tools.map((t: { name: string }) => t.name), ['echo', 'boom'])
  assert.equal(list.result.tools[0].inputSchema.properties.msg.description, '할 말')
  assert.deepEqual(list.result.tools[0].inputSchema.required, ['msg'])

  const ok = await (await post(cfg, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { msg: '안녕' } } })).json()
  assert.equal(ok.result.content[0].text, 'echo:안녕')
  const bad = await (await post(cfg, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'echo', arguments: {} } })).json()
  assert.equal(bad.result.isError, true)
  const err = await (await post(cfg, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'boom' } })).json()
  assert.equal(err.result.isError, true)
  assert.equal(err.result.content[0].text, '터짐')

  // 같은 직원을 다시 등록하면 이전 토큰은 못 쓴다
  const h2 = registerLocalMcp('s1', 'office', [echo])
  assert.equal((await post(cfg, { jsonrpc: '2.0', id: 6, method: 'ping' })).status, 401)
  assert.equal((await post(h2.config as { url: string }, { jsonrpc: '2.0', id: 6, method: 'ping' }, (h2.config as { headers: Record<string, string> }).headers)).status, 200)
  h2.dispose()
  assert.equal((await post(h2.config as { url: string }, { jsonrpc: '2.0', id: 7, method: 'ping' }, (h2.config as { headers: Record<string, string> }).headers)).status, 401)
  stopLocalMcp()
})

test('Codex 설정 변환: http는 토큰을 환경 변수로, stdio는 command·args·env', () => {
  const r = codexMcpConfig({
    office: { type: 'http', url: 'http://127.0.0.1:1234/mcp', headers: { Authorization: 'Bearer abc', 'X-Team': 't1' } },
    'my server': { type: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: { KEY: 'v"1' } },
  })
  assert.deepEqual(r.env, { AI_OFFICE_MCP_OFFICE_TOKEN: 'abc', AI_OFFICE_MCP_OFFICE_H_X_TEAM: 't1' })
  const pairs = r.args.filter((_, i) => i % 2 === 1)
  assert.ok(pairs.includes('mcp_servers.office.url="http://127.0.0.1:1234/mcp"'))
  assert.ok(pairs.includes('mcp_servers.office.bearer_token_env_var="AI_OFFICE_MCP_OFFICE_TOKEN"'))
  assert.ok(pairs.includes('mcp_servers.office.env_http_headers={X-Team="AI_OFFICE_MCP_OFFICE_H_X_TEAM"}'))
  assert.ok(pairs.includes('mcp_servers."my server".command="npx"'))
  assert.ok(pairs.includes('mcp_servers."my server".args=["-y","pkg"]'))
  assert.ok(pairs.includes('mcp_servers."my server".env={KEY="v\\"1"}'))
  assert.ok(r.args.every((a, i) => (i % 2 === 0 ? a === '-c' : true)))
  assert.ok(!r.args.join(' ').includes('abc'), '토큰이 인자에 노출되면 안 된다')
})
