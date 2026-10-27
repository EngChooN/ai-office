// 연결 도구(MCP) 출처 읽기 + 직접 추가 검사·저장 — 가짜 홈 폴더에 출처 파일을 깔아 놓고 읽는다
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { readMcpSources } from '../src/main/mcpSources.ts'
import { loadCustomMcp, parseCustomMcp, removeCustomMcp, upsertCustomMcp, type CustomMcp } from '../src/shared/customMcp.ts'
import { isInvalidArgs } from '../src/shared/errors.ts'

const write = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-src-'))
  const cwd = path.join(home, 'proj')
  const desktopConfig = path.join(home, 'desktop.json')
  const pluginRoot = path.join(home, '.claude', 'plugins', 'cache', 'm', 'figma', '1.0.0')
  write(path.join(home, '.claude.json'), {
    mcpServers: { shared: { command: 'user-cmd' } },
    projects: { [cwd]: { mcpServers: { localOnly: { type: 'sse', url: 'http://127.0.0.1:3845/sse' } } } },
    mcpNeedsAuthNoticed: ['plugin:figma:figma'],
    claudeAiMcpEverConnected: ['claude.ai Atlassian'],
  })
  write(path.join(home, '.claude', 'settings.json'), {
    enabledPlugins: { 'figma@official': true, 'off@official': false },
    mcpServers: { fromSettings: { command: 'settings-cmd', args: ['-x'] } },
  })
  write(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), {
    version: 2,
    plugins: {
      'figma@official': [{ scope: 'user', installPath: pluginRoot }],
      'off@official': [{ scope: 'user', installPath: path.join(home, 'off') }],
    },
  })
  write(path.join(pluginRoot, '.mcp.json'), {
    mcpServers: {
      figma: { type: 'http', url: 'https://mcp.figma.com/mcp', headers: { 'X-Bundle': 'b' }, _meta: { icon: 'x' } },
      helper: { command: '${CLAUDE_PLUGIN_ROOT}/bin/run', args: ['${CLAUDE_PLUGIN_ROOT}/a.js'] },
    },
  })
  write(path.join(home, 'off', '.mcp.json'), { mcpServers: { offServer: { command: 'nope' } } })
  write(desktopConfig, { mcpServers: { shared: { command: 'desktop-cmd' }, desktopOnly: { command: 'd' }, broken: { type: 'ws', url: 'x' } } })
  write(path.join(cwd, '.mcp.json'), { mcpServers: { projectOne: { command: 'p' } } })
  return { home, cwd, desktopConfig, pluginRoot }
}

test('출처마다 읽고 나중 출처가 앞을 덮는다 (Desktop < 설정 < 플러그인 < 내 계정 < 로컬 < 프로젝트 < 직접 추가)', () => {
  const h = fakeHome()
  const custom: CustomMcp[] = [{ name: 'projectOne', config: { command: 'mine' }, addedAt: 1 }]
  const list = readMcpSources({ ...h, custom })
  const by = Object.fromEntries(list.map((e) => [e.name, e]))
  assert.equal(by.shared.kind, 'user')
  assert.equal(by.shared.detail, 'user-cmd')
  assert.equal(by.desktopOnly.kind, 'desktop')
  assert.equal(by.fromSettings.kind, 'settings')
  assert.equal(by.fromSettings.detail, 'settings-cmd -x')
  assert.equal(by.localOnly.kind, 'local')
  assert.equal(by.projectOne.kind, 'custom')
  assert.equal(by.projectOne.detail, 'mine')
  // 꺼진 플러그인은 읽지 않는다
  assert.equal(by.offServer, undefined)
})

test('플러그인 MCP: 알려진 필드만 남기고 ${CLAUDE_PLUGIN_ROOT}를 바꾸며, 인증 필요 기록을 붙인다', () => {
  const h = fakeHome()
  const by = Object.fromEntries(readMcpSources({ ...h, custom: [] }).map((e) => [e.name, e]))
  assert.equal(by.figma.kind, 'plugin')
  assert.equal(by.figma.origin, 'figma')
  assert.equal(by.figma.status, 'auth')
  assert.equal(by.figma.reason, 'needsAuth')
  assert.deepEqual(by.figma.config, { type: 'http', url: 'https://mcp.figma.com/mcp', headers: { 'X-Bundle': 'b' } })
  assert.deepEqual(by.helper.config, { command: `${h.pluginRoot}/bin/run`, args: [`${h.pluginRoot}/a.js`] })
  assert.equal(by.helper.status, 'ok')
})

test('claude.ai 커넥터·모르는 형식은 불러올 수 없음 + 이유, 새로 고침 결과가 있으면 그쪽을 쓴다', () => {
  const h = fakeHome()
  const list = readMcpSources({ ...h, custom: [] })
  const jira = list.find((e) => e.name === 'claude.ai Atlassian')
  assert.deepEqual([jira?.kind, jira?.status, jira?.reason, jira?.config], ['claudeai', 'unsupported', 'claudeai', undefined])
  const broken = list.find((e) => e.name === 'broken')
  assert.deepEqual([broken?.status, broken?.reason], ['unsupported', 'badConfig'])

  const probed = readMcpSources({ ...h, custom: [], probe: { connectors: ['claude.ai Figma', 'claude.ai Atlassian MCP'], needsAuth: ['shared'] } })
  assert.deepEqual(probed.filter((e) => e.kind === 'claudeai').map((e) => e.name), ['claude.ai Figma', 'claude.ai Atlassian MCP'])
  assert.equal(probed.find((e) => e.name === 'shared')?.status, 'auth')
})

test('출처 파일이 하나도 없어도 빈 목록', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-empty-'))
  assert.deepEqual(readMcpSources({ home, cwd: home, desktopConfig: path.join(home, 'none.json'), custom: [] }), [])
})

const invalid = (fn: () => unknown) => assert.throws(fn, (e) => isInvalidArgs(e))

test('직접 추가: 명령·URL·JSON 세 방식', () => {
  assert.deepEqual(parseCustomMcp({ kind: 'command', name: 'ctx7', command: ' npx ', args: ['-y', '@upstash/context7-mcp'], env: { API_KEY: 'k' } }, 5), [
    { name: 'ctx7', config: { command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: { API_KEY: 'k' } }, addedAt: 5 },
  ])
  assert.deepEqual(parseCustomMcp({ kind: 'url', name: 'jira', url: 'https://mcp.atlassian.com/v1/sse', transport: 'sse' }, 5)[0].config, { type: 'sse', url: 'https://mcp.atlassian.com/v1/sse' })
  const many = parseCustomMcp({ kind: 'json', json: JSON.stringify({ mcpServers: { a: { command: 'x' }, b: { url: 'https://b.example/mcp' } } }) }, 5)
  assert.deepEqual(many.map((m) => [m.name, m.config]), [['a', { command: 'x' }], ['b', { type: 'http', url: 'https://b.example/mcp' }]])
  assert.deepEqual(parseCustomMcp({ kind: 'json', json: '{"c": {"command": "y"}}' }, 5)[0].name, 'c')
  // 설정 하나만 붙여 넣으면 이름을 따로 받는다
  assert.equal(parseCustomMcp({ kind: 'json', name: 'solo', json: '{"type":"http","url":"https://s.example"}' }, 5)[0].name, 'solo')
})

test('직접 추가 입력 검사: 이름·예약어·명령·URL·헤더·환경 변수·JSON·방식', () => {
  invalid(() => parseCustomMcp({ kind: 'command', name: 'has space', command: 'x' }, 0))
  invalid(() => parseCustomMcp({ kind: 'command', name: 'office', command: 'x' }, 0))
  invalid(() => parseCustomMcp({ kind: 'command', name: 'office-browser', command: 'x' }, 0))
  invalid(() => parseCustomMcp({ kind: 'command', name: 'a', command: '  ' }, 0))
  invalid(() => parseCustomMcp({ kind: 'command', name: 'a', command: 'x\nrm -rf /' }, 0))
  invalid(() => parseCustomMcp({ kind: 'command', name: 'a', command: 'x', env: { 'BAD-KEY': 'v' } }, 0))
  invalid(() => parseCustomMcp({ kind: 'url', name: 'a', url: 'file:///etc/passwd' }, 0))
  invalid(() => parseCustomMcp({ kind: 'url', name: 'a', url: 'not a url' }, 0))
  invalid(() => parseCustomMcp({ kind: 'url', name: 'a', url: 'https://x.example', headers: { Authorization: 'a\r\nX: y' } }, 0))
  invalid(() => parseCustomMcp({ kind: 'json', json: '{oops' }, 0))
  invalid(() => parseCustomMcp({ kind: 'json', json: '[]' }, 0))
  invalid(() => parseCustomMcp({ kind: 'json', json: '{"a":{"type":"ws","url":"wss://x"}}' }, 0))
  invalid(() => parseCustomMcp({ kind: 'json', json: '{"command":"x"}' }, 0))
})

test('직접 추가 목록: 추가·수정(자리·추가 시각 유지)·이름 충돌·삭제, 저장값 복원', () => {
  const a = parseCustomMcp({ kind: 'command', name: 'a', command: 'x' }, 1)
  const b = parseCustomMcp({ kind: 'command', name: 'b', command: 'y' }, 2)
  let list = upsertCustomMcp(upsertCustomMcp([], a), b)
  invalid(() => upsertCustomMcp(list, parseCustomMcp({ kind: 'command', name: 'b', command: 'z' }, 3)))
  list = upsertCustomMcp(list, parseCustomMcp({ kind: 'command', name: 'a2', command: 'x2' }, 9), 'a')
  assert.deepEqual(list.map((m) => [m.name, m.addedAt]), [['a2', 1], ['b', 2]])
  invalid(() => upsertCustomMcp(list, b, 'none'))
  // 고칠 때 다른 항목 이름으로 바꾸면 거절
  invalid(() => upsertCustomMcp(list, parseCustomMcp({ kind: 'command', name: 'b', command: 'x' }, 9), 'a2'))
  list = removeCustomMcp(list, 'a2')
  assert.deepEqual(list.map((m) => m.name), ['b'])
  invalid(() => removeCustomMcp(list, 'a2'))

  const raw = JSON.stringify([...list, { name: 'bad name', config: { command: 'x' } }, { name: 'c', config: { type: 'ws' } }, 'junk'])
  assert.deepEqual(loadCustomMcp(raw), list)
  assert.deepEqual(loadCustomMcp('{broken'), [])
  assert.deepEqual(loadCustomMcp(null), [])
})
