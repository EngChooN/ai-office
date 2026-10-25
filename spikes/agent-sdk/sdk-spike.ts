// 1단계 스파이크: Agent SDK로 "직원" 세션을 띄우고 스트림·권한요청·후속 지시·비용을 받는지 확인
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SANDBOX_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sandbox')

// 스트리밍 입력: 사무실에서 나중에 보내는 지시를 흉내 내는 큐
const inbox: SDKUserMessage[] = []
let wake: (() => void) | null = null
let closed = false
function send(text: string) {
  inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
  wake?.()
}
async function* messages(): AsyncGenerator<SDKUserMessage> {
  while (!closed) {
    if (inbox.length === 0) await new Promise<void>((r) => (wake = r))
    while (inbox.length) yield inbox.shift()!
  }
}

const q = query({
  prompt: messages(),
  options: {
    cwd: SANDBOX_DIR,
    model: 'haiku',
    permissionMode: 'default',
    settingSources: [],
    canUseTool: async (toolName, input) => {
      console.log(`[권한요청] ${toolName}`, JSON.stringify(input).slice(0, 120))
      return { behavior: 'allow', updatedInput: input }
    },
    hooks: {
      PreToolUse: [{ hooks: [async (i) => { console.log('[hook PreToolUse]', (i as { tool_name?: string }).tool_name); return {} }] }],
    },
  },
})

send('hello.txt 파일을 만들고 안에 "출근했습니다"라고 써줘. 짧게 답해.')
let turn = 0
for await (const m of q) {
  if (m.type === 'system' && m.subtype === 'init') console.log('[init] session', m.session_id, 'model', m.model, 'apiKeySource', m.apiKeySource)
  else if (m.type === 'assistant') {
    for (const b of m.message.content) if (b.type === 'text') console.log('[assistant]', b.text)
  } else if (m.type === 'result') {
    console.log('[result]', m.subtype, 'turns', m.num_turns, 'cost $', m.total_cost_usd, 'tokens', m.usage.input_tokens, '/', m.usage.output_tokens)
    turn++
    if (turn === 1) send('방금 만든 파일 내용을 한 줄로 알려줘.')
    else { closed = true; wake?.(); break }
  }
}
