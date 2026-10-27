import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { approvalResponse, approvalSettings, approvalTool, commandText, newCodexState, pickModel, toolOfItem, translateNotification } from '../src/main/ai/codexEvents.ts'
import { codexCostUsd, priceFor } from '../src/main/ai/codexPricing.ts'
import { findCodexRollout, readCodexTail } from '../src/main/ai/codexSession.ts'

const usage = (o: Partial<{ inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number; outputTokens: number }>) => ({ inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, ...o })

test('캐시 쓰기 토큰은 입력 토큰에 포함돼 있어 한 번만 세고 입력 단가의 1.25배다', () => {
  const luna = priceFor('gpt-6-luna')
  const cost = codexCostUsd('gpt-6-luna', usage({ inputTokens: 1_000_000, cachedInputTokens: 500_000, cacheWriteInputTokens: 200_000 }))
  assert.ok(Math.abs(cost - (300_000 * luna.input + 200_000 * luna.input * 1.25 + 500_000 * luna.cachedInput) / 1e6) < 1e-9)
})

test('단가표: 캐시분은 싼 단가, 모르는 모델은 중간 단가', () => {
  const luna = priceFor('gpt-6-luna')
  const cost = codexCostUsd('gpt-6-luna', usage({ inputTokens: 1_000_000, cachedInputTokens: 600_000, outputTokens: 100_000 }))
  assert.ok(Math.abs(cost - (400_000 * luna.input + 600_000 * luna.cachedInput + 100_000 * luna.output) / 1e6) < 1e-9)
  assert.deepEqual(priceFor('gpt-미래-모델'), priceFor(undefined))
  assert.ok(codexCostUsd('gpt-미래-모델', usage({ inputTokens: 1000 })) > 0)
  assert.equal(codexCostUsd('gpt-6-luna', usage({})), 0)
})

test('이벤트 변환: 답 글·토큰·턴 끝(result)', () => {
  const st = newCodexState('gpt-6-luna')
  assert.deepEqual(translateNotification('item/completed', { item: { type: 'agentMessage', text: '  ' } }, st), [])
  assert.deepEqual(translateNotification('item/completed', { item: { type: 'agentMessage', text: '안녕' } }, st), [{ type: 'text', text: '안녕' }])
  const ctx = translateNotification('thread/tokenUsage/updated', { tokenUsage: { total: { inputTokens: 29645, cachedInputTokens: 26496, outputTokens: 102 }, last: { inputTokens: 14874 } } }, st)
  assert.deepEqual(ctx, [{ type: 'context', tokens: 14874 }])
  const [r] = translateNotification('turn/completed', { turn: { status: 'completed', items: [{ type: 'agentMessage', phase: 'commentary', text: '하는 중' }, { type: 'agentMessage', phase: 'final_answer', text: '끝' }] } }, st)
  assert.equal(r.type, 'result')
  if (r.type !== 'result') return
  assert.equal(r.ok, true)
  assert.equal(r.subtype, 'success')
  assert.equal(r.text, '끝')
  assert.equal(r.tokensIn, 29645)
  assert.equal(r.tokensOut, 102)
  assert.equal(r.costUsd, codexCostUsd('gpt-6-luna', st.usage))
})

test('이벤트 변환: 중단·실패는 result(ok=false), 재시도 오류는 건너뜀', () => {
  const st = newCodexState()
  const [a] = translateNotification('turn/completed', { turn: { status: 'interrupted', items: [] } }, st)
  assert.ok(a.type === 'result' && !a.ok && a.subtype === 'interrupted' && a.text === '')
  const [b] = translateNotification('turn/completed', { turn: { status: 'failed', items: [] } }, st)
  assert.ok(b.type === 'result' && !b.ok && b.subtype === 'error')
  assert.deepEqual(translateNotification('error', { error: { message: 'x' }, willRetry: true }, st), [])
  assert.deepEqual(translateNotification('error', { error: { message: '끊김' }, willRetry: false }, st), [{ type: 'error', error: '끊김' }])
})

test('이벤트 변환: 파일 변경은 완료됐을 때만 fileTouched', () => {
  const st = newCodexState()
  const item = { type: 'fileChange', id: 'f1', changes: [{ path: '/w/a.ts' }, { path: '/w/b.ts' }] }
  translateNotification('item/started', { item }, st)
  assert.deepEqual(st.fileChanges.get('f1'), ['/w/a.ts', '/w/b.ts'])
  assert.deepEqual(translateNotification('item/completed', { item: { ...item, status: 'declined' } }, st), [])
  translateNotification('item/started', { item }, st)
  assert.deepEqual(translateNotification('item/completed', { item: { ...item, status: 'completed' } }, st), [
    { type: 'fileTouched', path: '/w/a.ts' },
    { type: 'fileTouched', path: '/w/b.ts' },
  ])
  assert.equal(st.fileChanges.size, 0)
})

test('승인 매핑: 명령은 Bash, 파일 변경은 Edit, 모르는 요청은 null', () => {
  const st = newCodexState()
  const cmd = approvalTool('item/commandExecution/requestApproval', { command: '/bin/zsh -lc "printf hi > a.txt"', commandActions: [{ type: 'unknown', command: 'printf hi > a.txt' }] }, st)
  assert.deepEqual(cmd, { toolName: 'Bash', input: { command: 'printf hi > a.txt' } })
  assert.equal(commandText({ command: '/bin/zsh -lc "ls"' }), '/bin/zsh -lc "ls"')
  st.fileChanges.set('f1', ['/w/a.ts'])
  assert.deepEqual(approvalTool('item/fileChange/requestApproval', { itemId: 'f1' }, st), { toolName: 'Edit', input: { file_path: '/w/a.ts' } })
  assert.equal(approvalTool('item/permissions/requestApproval', {}, st), null)
  assert.deepEqual(toolOfItem({ type: 'mcpToolCall', server: 'office', tool: 'team', arguments: { a: 1 } }), { toolName: 'mcp__office__team', input: { a: 1 } })
  assert.equal(toolOfItem({ type: 'agentMessage' }), null)
})

test('승인 매핑: MCP 도구 호출 elicitation은 mcp__서버__도구, 응답은 action', () => {
  const st = newCodexState()
  const params = { serverName: 'office', message: 'Allow the office MCP server to run tool "delegate"?', _meta: { codex_approval_kind: 'mcp_tool_call', tool_params: { member: 'a' } } }
  assert.deepEqual(approvalTool('mcpServer/elicitation/request', params, st), { toolName: 'mcp__office__delegate', input: { member: 'a' } })
  assert.equal(approvalTool('mcpServer/elicitation/request', { ...params, _meta: {} }, st), null)
  assert.deepEqual(approvalResponse({ behavior: 'allow' }, 'mcpServer/elicitation/request'), { action: 'accept', content: null })
  assert.deepEqual(approvalResponse({ behavior: 'deny', message: 'x', interrupt: true }, 'mcpServer/elicitation/request'), { action: 'cancel', content: null })
})

test('승인 응답: 허용=accept, 거절=decline, 거절+중단=cancel', () => {
  assert.deepEqual(approvalResponse({ behavior: 'allow' }), { decision: 'accept' })
  assert.deepEqual(approvalResponse({ behavior: 'deny', message: 'x' }), { decision: 'decline' })
  assert.deepEqual(approvalResponse({ behavior: 'deny', message: 'x', interrupt: true }), { decision: 'cancel' })
  assert.deepEqual(approvalSettings('ask'), { approvalPolicy: 'untrusted', sandbox: 'workspace-write' })
  assert.deepEqual(approvalSettings('acceptEdits'), { approvalPolicy: 'on-request', sandbox: 'workspace-write' })
})

test('모델 고르기: 요청값 > 기본 > 첫 번째, 숨김 제외', () => {
  const list = [{ id: 'a', hidden: true, isDefault: true }, { id: 'b' }, { id: 'c', isDefault: true }]
  assert.equal(pickModel(list, 'b'), 'b')
  assert.equal(pickModel(list, 'opus'), 'c')
  assert.equal(pickModel([{ id: 'x' }, { id: 'y' }], undefined), 'x')
  assert.equal(pickModel([{ id: 'h', hidden: true, isDefault: true }], undefined), 'h')
  assert.equal(pickModel([], 'a'), undefined)
})

test('세션 기록: 롤아웃 파일 찾기 + 끝에서 문맥 크기·마지막 답 읽기', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sess-'))
  const day = path.join(dir, '2026', '10', '27')
  fs.mkdirSync(day, { recursive: true })
  const file = path.join(day, 'rollout-2026-10-27T18-33-33-abc-123.jsonl')
  const line = (payload: object) => JSON.stringify({ type: 'event_msg', payload })
  fs.writeFileSync(
    file,
    [
      '{"잘린 줄',
      line({ type: 'token_count', info: { last_token_usage: { input_tokens: 111 } } }),
      line({ type: 'task_complete', last_agent_message: '첫 보고' }),
      line({ type: 'token_count', info: { last_token_usage: { input_tokens: 222 } } }),
      line({ type: 'token_count', info: null }),
      line({ type: 'task_complete', last_agent_message: ' 마지막 보고 ' }),
    ].join('\n'),
  )
  assert.equal(findCodexRollout(dir, 'abc-123'), file)
  assert.equal(findCodexRollout(dir, 'zzz'), null)
  assert.deepEqual(readCodexTail(file), { contextTokens: 222, lastText: '마지막 보고' })
  assert.deepEqual(readCodexTail(path.join(dir, '없음.jsonl')), { contextTokens: 0, lastText: '' })
})
