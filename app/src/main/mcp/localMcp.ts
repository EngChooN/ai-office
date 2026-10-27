import http from 'node:http'
import crypto from 'node:crypto'
import { z } from 'zod'
import type { RuntimeMcpServer } from '../ai/types'

// 앱 안의 도구(office·secretary)를 127.0.0.1 로컬 HTTP MCP 서버로 내놓는다 — Claude·Codex가 같은 서버를 쓴다.
// 인증은 등록마다 따로 발급하는 토큰(Authorization: Bearer). 프로토콜은 Streamable HTTP의 JSON 응답 모드(POST만)로 필요한 만큼만 구현한다.

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}
export interface LocalTool {
  name: string
  description: string
  shape: z.ZodRawShape
  handler(args: Record<string, unknown>): Promise<ToolResult>
}

/** sdk.tool과 같은 모양으로 도구를 만든다 */
export function defineTool<S extends z.ZodRawShape>(name: string, description: string, shape: S, handler: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>): LocalTool {
  return { name, description, shape, handler: (args) => handler(args as z.infer<z.ZodObject<S>>) }
}

const PROTOCOL_VERSION = '2025-06-18'
const BODY_MAX = 4 * 1024 * 1024

interface Registration {
  name: string
  tools: LocalTool[]
  schemas: Map<string, z.ZodObject<z.ZodRawShape>>
}

type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> }

const registrations = new Map<string, Registration>()
let server: http.Server | null = null
let port = 0

const rpcResult = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result })
const rpcError = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** JSON-RPC 요청 하나를 처리한다. 알림(id 없음)이면 null */
export async function handleRpc(reg: Registration, msg: Rpc): Promise<object | null> {
  if (msg.id === undefined) return null
  switch (msg.method) {
    case 'initialize':
      return rpcResult(msg.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: reg.name, version: '1' } })
    case 'ping':
      return rpcResult(msg.id, {})
    case 'tools/list':
      return rpcResult(msg.id, {
        tools: reg.tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: z.toJSONSchema(reg.schemas.get(tool.name)!, { io: 'input', unrepresentable: 'any' }) })),
      })
    case 'tools/call': {
      const tool = reg.tools.find((x) => x.name === msg.params?.name)
      if (!tool) return rpcError(msg.id, -32602, `알 수 없는 도구: ${String(msg.params?.name)}`)
      const parsed = reg.schemas.get(tool.name)!.safeParse(msg.params?.arguments ?? {})
      if (!parsed.success) return rpcResult(msg.id, { content: [{ type: 'text', text: `인자가 올바르지 않습니다: ${parsed.error.message}` }], isError: true })
      try {
        return rpcResult(msg.id, await tool.handler(parsed.data as Record<string, unknown>))
      } catch (e) {
        return rpcResult(msg.id, { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true })
      }
    }
    default:
      return rpcError(msg.id, -32601, `지원하지 않는 메서드: ${String(msg.method)}`)
  }
}

function bearer(req: http.IncomingMessage) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  return m?.[1] ?? ''
}

/** 토큰 비교는 길이가 달라도 시간이 같게 */
function findRegistration(token: string): Registration | null {
  const given = crypto.createHash('sha256').update(token).digest()
  let found: Registration | null = null
  for (const [t, reg] of registrations) if (crypto.timingSafeEqual(crypto.createHash('sha256').update(t).digest(), given)) found = reg
  return found
}

function readBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > BODY_MAX) {
        resolve(null)
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

async function onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const send = (status: number, body?: object) => {
    res.writeHead(status, body ? { 'content-type': 'application/json' } : {})
    res.end(body ? JSON.stringify(body) : undefined)
  }
  const reg = findRegistration(bearer(req))
  if (!reg) return send(401, rpcError(null, -32001, '인증 실패'))
  if (req.url?.split('?')[0] !== '/mcp') return send(404)
  if (req.method !== 'POST') return void (res.setHeader('allow', 'POST'), send(405))
  const raw = await readBody(req)
  if (raw === null) return send(413, rpcError(null, -32600, '요청이 너무 큽니다'))
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return send(400, rpcError(null, -32700, 'JSON을 읽지 못했습니다'))
  }
  const batch = Array.isArray(body)
  const msgs: unknown[] = Array.isArray(body) ? body : [body]
  const replies = (await Promise.all(msgs.map((m) => handleRpc(reg, m as Rpc)))).filter((r): r is object => r !== null)
  if (replies.length === 0) return send(202)
  send(200, batch ? replies : replies[0])
}

/** 서버를 띄운다 (이미 떠 있으면 그대로). 앱 시작 때 한 번 기다린다 */
export function startLocalMcp(): Promise<void> {
  if (server) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => void onRequest(req, res).catch(() => res.headersSent || (res.writeHead(500), res.end())))
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      server = s
      port = (s.address() as { port: number }).port
      resolve()
    })
  })
}

export function stopLocalMcp() {
  server?.close()
  server = null
  registrations.clear()
}

export interface LocalMcpHandle {
  /** 세션에 넘길 연결 정보 */
  config: RuntimeMcpServer
  /** 이 등록의 토큰을 폐기한다 */
  dispose(): void
}

/** 도구 묶음을 새 토큰으로 등록한다. 같은 owner를 다시 등록하면 이전 토큰은 폐기된다 */
const owners = new Map<string, string>()
export function registerLocalMcp(owner: string, name: string, tools: LocalTool[]): LocalMcpHandle {
  if (!server) throw new Error('로컬 MCP 서버가 아직 시작되지 않았습니다')
  const prev = owners.get(`${owner}/${name}`)
  if (prev) registrations.delete(prev)
  const token = crypto.randomBytes(32).toString('hex')
  registrations.set(token, { name, tools, schemas: new Map(tools.map((t) => [t.name, z.object(t.shape)])) })
  owners.set(`${owner}/${name}`, token)
  return {
    config: { type: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: `Bearer ${token}` } },
    dispose() {
      registrations.delete(token)
      if (owners.get(`${owner}/${name}`) === token) owners.delete(`${owner}/${name}`)
    },
  }
}
