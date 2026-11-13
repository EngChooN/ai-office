// 휴대폰 반응 개선(화면): '보내는 중' 말풍선 짝짓기 · 결재 카드 즉시 반응 연결 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { lastChatId, matchedPending, type PendingSend } from '../src/shared/pendingSend.ts'
import { decideOutcome } from '../src/renderer/features/secretary/decideOutcome.ts'
import { t } from '../src/shared/i18n/index.ts'
import type { ChatMessage } from '../src/shared/types.ts'

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const pend = (tempId: string, text: string, extra: Partial<PendingSend> = {}): PendingSend => ({ tempId, room: undefined, text, attachments: [], mode: 'wait', replyTo: undefined, afterId: 10, status: 'sending', ...extra })
const msg = (id: number, text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, ts: 0, from: 'me', text, ...extra })

test('돌아온 내 글과 짝지으면 그 임시 말풍선을 지운다', () => {
  assert.deepEqual(matchedPending([pend('a', '안녕')], [msg(11, '안녕')]), ['a'])
  assert.deepEqual(matchedPending([pend('a', '안녕')], []), [])
})

test('짝이 아닌 것: 보내기 전 글(id ≤ afterId)·남이 쓴 글·다른 방·다른 글', () => {
  const p = pend('a', '안녕', { room: 'team1' })
  assert.deepEqual(matchedPending([p], [msg(10, '안녕', { room: 'team1' })]), [])
  assert.deepEqual(matchedPending([p], [msg(11, '안녕', { room: 'team1', from: 's1' })]), [])
  assert.deepEqual(matchedPending([p], [msg(11, '안녕')]), [])
  assert.deepEqual(matchedPending([p], [msg(11, '안녕', { room: 'team2' })]), [])
  assert.deepEqual(matchedPending([p], [msg(11, '다른 글', { room: 'team1' })]), [])
  assert.deepEqual(matchedPending([p], [msg(11, '안녕 ', { room: 'team1' })]), ['a'])
})

test('같은 글을 연달아 보내면 순서대로 하나씩만 짝짓는다', () => {
  const ps = [pend('a', '응'), pend('b', '응'), pend('c', '응')]
  assert.deepEqual(matchedPending(ps, [msg(11, '응')]), ['a'])
  assert.deepEqual(matchedPending(ps.slice(1), [msg(11, '응'), msg(12, '응')]), ['b', 'c'])
  assert.deepEqual(matchedPending(ps, [msg(11, '응'), msg(12, '응'), msg(13, '응')]), ['a', 'b', 'c'])
})

test('실패한 말풍선도 PC에 저장된 글이 늦게 오면 치운다 (다시 보내기로 두 번 보내지 않게)', () => {
  assert.deepEqual(matchedPending([pend('a', '안녕', { status: 'failed' })], [msg(11, '안녕')]), ['a'])
  assert.deepEqual(matchedPending([pend('a', '안녕', { status: 'failed' })], [msg(10, '안녕')]), [])
})

test('lastChatId: 비어 있으면 0, 아니면 가장 큰 id', () => {
  assert.equal(lastChatId([]), 0)
  assert.equal(lastChatId([msg(3, 'a'), msg(9, 'b'), msg(5, 'c')]), 9)
})

test('결재 처리 결과: false·오류는 실패(되돌림), true만 성공(카드 숨김)', async () => {
  assert.equal(await decideOutcome(() => true, true), 'approved')
  assert.equal(await decideOutcome(() => false, true), 'failed')
  assert.equal(await decideOutcome(() => Promise.reject(new Error('x')), false), 'failed')
})

test('결재 버튼은 모두 같은 훅(useDecide)을 거치고 직접 decide를 부르지 않는다 (카드별 busy·결과)', () => {
  for (const f of ['ApprovalTab', 'InboxPage', 'ChatPage']) {
    const src = read(`src/renderer/features/${f}.tsx`)
    assert.match(src, /useDecide\(a\.id\)/, f)
    assert.doesNotMatch(src.replace(/handleAll[\s\S]*?\n {2}\}\n/, ''), /office\.decide\(a\.id, (true|false)\)/, f)
  }
  const hook = read('src/renderer/features/useDecide.ts')
  assert.match(hook, /decideOutcome\(/)
  assert.match(hook, /lock\.current/)
})

test('보내는 중 말풍선: 휴대폰·원격 화면에서만, 첨부 업로드 뒤에 띄운다', () => {
  const hook = read('src/renderer/features/usePendingSends.ts')
  assert.match(hook, /if \(!IS_REMOTE_SCREEN\) return void window\.office\.sendChat/)
  const chat = read('src/renderer/features/ChatPage.tsx')
  assert.match(chat, /const attachments = await draftFiles\.upload\(\)\n\s+draftFiles\.clear\(\)\n\s+onSend\(/)
})

test('새 문구 4개 언어', () => {
  for (const key of ['approval.processing', 'chat.pending.sending', 'chat.pending.failed', 'chat.pending.retry'] as const) {
    const texts = (['ko', 'en', 'ja', 'zh'] as const).map((l) => t(key, undefined, l))
    assert.equal(new Set(texts).size, 4, key)
    assert.ok(texts.every((x) => x && x !== key), key)
  }
})
