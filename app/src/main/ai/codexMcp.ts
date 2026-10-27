import type { RuntimeMcpServer } from './types.ts'

// 직원 장비(MCP) → Codex app-server의 `-c mcp_servers.<이름>.<키>=<TOML 값>` 인자. 프로세스 없이 테스트할 수 있게 순수 함수로 둔다.
// 비밀 값(토큰·헤더)은 인자(ps에 보인다) 대신 app-server 환경 변수로 넘기고 설정에는 변수 이름만 적는다.

/** TOML 기본 문자열 (JSON 문자열 이스케이프와 호환) */
const tomlString = (v: string) => JSON.stringify(v)
const tomlKey = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k))
const tomlArray = (v: string[]) => `[${v.map(tomlString).join(',')}]`
const tomlTable = (v: Record<string, string>) => `{${Object.entries(v).map(([k, x]) => `${tomlKey(k)}=${tomlString(x)}`).join(',')}}`

/** 환경 변수 이름에 쓸 수 있게 */
const envSafe = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()

export interface CodexMcpConfig {
  /** app-server 실행 인자 (`-c key=value` 쌍들) */
  args: string[]
  /** app-server 프로세스 환경에 더할 값 */
  env: Record<string, string>
}

/** 서버 목록 → 실행 인자·환경. 같은 이름은 뒤의 것이 덮는다 */
export function codexMcpConfig(servers: Record<string, RuntimeMcpServer>): CodexMcpConfig {
  const args: string[] = []
  const env: Record<string, string> = {}
  const set = (name: string, key: string, value: string) => args.push('-c', `mcp_servers.${tomlKey(name)}.${key}=${value}`)
  for (const [name, server] of Object.entries(servers)) {
    if ('url' in server) {
      // Codex는 Streamable HTTP만 지원한다 (sse 설정도 같은 url로 시도한다)
      set(name, 'url', tomlString(server.url))
      const headers = { ...server.headers }
      const authKey = Object.keys(headers).find((k) => k.toLowerCase() === 'authorization')
      const bearer = authKey ? /^Bearer\s+(.+)$/i.exec(headers[authKey])?.[1] : undefined
      if (authKey && bearer) {
        const v = `AI_OFFICE_MCP_${envSafe(name)}_TOKEN`
        env[v] = bearer
        set(name, 'bearer_token_env_var', tomlString(v))
        delete headers[authKey]
      }
      const named: Record<string, string> = {}
      for (const [h, value] of Object.entries(headers)) {
        const v = `AI_OFFICE_MCP_${envSafe(name)}_H_${envSafe(h)}`
        env[v] = value
        named[h] = v
      }
      if (Object.keys(named).length) set(name, 'env_http_headers', tomlTable(named))
    } else {
      set(name, 'command', tomlString(server.command))
      if (server.args?.length) set(name, 'args', tomlArray(server.args))
      if (server.env && Object.keys(server.env).length) set(name, 'env', tomlTable(server.env))
    }
    // 시작이 오래 걸려도(npx 첫 실행 등) 직원이 일을 시작할 수 있게
    set(name, 'startup_timeout_sec', '60')
  }
  return { args, env }
}
