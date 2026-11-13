// 비서 대기 줄: 번호표·취소·합치기·꽉 참·휴대폰 질문 섞임·답이 먼저 시작/끝난 경우 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { AskQueue, mergedText, QUEUE_MAX, queuePosition } from '../src/shared/secretaryQueue.ts'

const ask = (msgId: number, remote = false) => ({ msgId, text: `질문${msgId}`, remote })
const filled = (...items: ReturnType<typeof ask>[]) => {
  const q = new AskQueue()
  for (const x of items) q.push(x)
  return q
}

test('queuePosition: 대기 순서는 1부터, 없으면 0', () => {
  assert.equal(queuePosition([5, 7, 9], 5), 1)
  assert.equal(queuePosition([5, 7, 9], 9), 3)
  assert.equal(queuePosition([5, 7, 9], 1), 0)
  assert.equal(queuePosition([], 1), 0)
})

test('세 개를 연달아 넣으면 그 순서로 id가 보이고, 꽉 찬다', () => {
  const q = filled(ask(1), ask(2), ask(3))
  assert.deepEqual(q.ids(), [1, 2, 3])
  assert.equal(QUEUE_MAX, 3)
  assert.equal(q.isFull, true)
})

test('가운데를 빼면 뒤 순서가 당겨지고, 없는 id(이미 답을 시작함)는 false', () => {
  const q = filled(ask(1), ask(2), ask(3))
  assert.equal(q.cancel(2), true)
  assert.deepEqual(q.ids(), [1, 3])
  assert.equal(queuePosition(q.ids(), 3), 2)
  assert.equal(q.cancel(2), false)
})

test('합치기: 첫 질문 자리 한 칸으로, 본문은 머리말 + 번호 줄, 나머지 id는 지울 목록', () => {
  const q = filled(ask(1), ask(2), ask(3))
  const r = q.merge('한꺼번에 답해 주세요.')
  assert.ok(r)
  assert.deepEqual(q.ids(), [1])
  assert.deepEqual(r.removed, [2, 3])
  assert.equal(r.kept.text, '한꺼번에 답해 주세요.\n1. 질문1\n2. 질문2\n3. 질문3')
  // 합친 한 질문을 한 번만 꺼내 답한다
  assert.equal(q.shift()?.text, r.kept.text)
  assert.equal(q.shift(), undefined)
  assert.equal(mergedText(['a'], 'h'), 'h\n1. a')
})

test('합치기: 휴대폰 질문이 하나라도 있으면 합친 질문도 휴대폰 질문 (①의 원격 차단을 비켜 가지 못하게)', () => {
  for (const order of [[ask(1), ask(2, true)], [ask(1, true), ask(2)], [ask(1), ask(2), ask(3, true)]]) {
    const r = filled(...order).merge('h')
    assert.equal(r?.kept.remote, true, JSON.stringify(order))
  }
  assert.equal(filled(ask(1), ask(2)).merge('h')?.kept.remote, false)
})

test('합치는 사이 답이 먼저 시작돼 하나만 남았으면 합치지 않는다 (그 질문은 그대로)', () => {
  const q = filled(ask(1), ask(2))
  q.shift() // 1번 답 시작
  assert.equal(q.merge('h'), null)
  assert.deepEqual(q.ids(), [2])
  // 2번 답도 시작·끝난 뒤 빼기·합치기 — 줄이 비어 있으니 아무 일 없이 false/null
  q.shift()
  assert.equal(q.cancel(2), false)
  assert.equal(q.merge('h'), null)
  assert.equal(q.size, 0)
})

test('대화 지우기·멈추기(clear)는 줄을 비운다', () => {
  const q = filled(ask(1), ask(2))
  q.clear()
  assert.deepEqual(q.ids(), [])
  assert.equal(q.isFull, false)
})

test('Secretary: 꽉 차거나 잦으면 말풍선 없이 ok:false, 답할 때는 그 칸의 원격 여부를 쓴다, 상태에 queued', () => {
  const src = fs.readFileSync(new URL('../src/main/secretary.ts', import.meta.url), 'utf8')
  const ask = src.slice(src.indexOf('  ask(text: string)'), src.indexOf('  cancelQueued('))
  // 받지 않을 때는 add(말풍선) 전에 돌아간다
  assert.ok(ask.indexOf("reason: 'full'") < ask.indexOf("this.add({ role: 'me'"))
  assert.ok(ask.indexOf("reason: 'rate'") < ask.indexOf("this.add({ role: 'me'"))
  assert.match(ask, /this\.queue\.push\(\{ msgId: mine\.id, text: body, remote: isRemoteCall\(\) \}\)/)
  assert.match(src, /this\.turnRemote = item\?\.remote \?\? false/)
  assert.match(src, /queued: this\.queue\.ids\(\)/)
  assert.match(src, /private closeSession\(\) \{[\s\S]*?this\.queue\.clear\(\)/)
  // 빼기·합치기로 사라진 말풍선은 DB에서도 지운다
  assert.match(src, /db\.deleteSecretaryMessage\(id\)/)
})
