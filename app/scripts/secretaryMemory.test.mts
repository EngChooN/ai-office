import assert from 'node:assert/strict'
import test from 'node:test'
import { CONTEXT_MESSAGES, contextParts, nextSummary, priorMessages, shouldSummarize, splitPrior, summaryAlive, summaryInput, SUMMARY_BATCH, SUMMARY_MAX_CHARS } from '../src/main/secretaryMemory.ts'

const msg = (id: number, text = `말${id}`, role: 'me' | 'secretary' | 'notice' = id % 2 ? 'me' : 'secretary') => ({ id, ts: id * 1000, role, text })
const convo = (n: number) => Array.from({ length: n }, (_, i) => msg(i + 1))

test('앞 대화: 마지막(지금 질문)과 안내 문구는 뺀다', () => {
  const m = [msg(1), msg(2, '안내', 'notice'), msg(3), msg(4)]
  assert.deepEqual(priorMessages(m).map((x) => x.id), [1, 3])
})
test('8개 이하면 밀려난 것이 없어 요약하지 않는다', () => {
  const { recent, overflow } = splitPrior(convo(CONTEXT_MESSAGES), null)
  assert.equal(recent.length, CONTEXT_MESSAGES)
  assert.equal(shouldSummarize(overflow), false)
})
test('밀려난 것이 BATCH 미만이면 요약하지 않고, 이상이면 한다', () => {
  assert.equal(shouldSummarize(splitPrior(convo(CONTEXT_MESSAGES + SUMMARY_BATCH - 1), null).overflow), false)
  assert.equal(shouldSummarize(splitPrior(convo(CONTEXT_MESSAGES + SUMMARY_BATCH), null).overflow), true)
})
test('이미 요약에 담긴 것은 다시 세지 않는다 (이어 쓰기)', () => {
  const prior = convo(CONTEXT_MESSAGES + 6)
  const summary = { text: '요약', upTo: 4, coveredTs: 4000 }
  assert.deepEqual(splitPrior(prior, summary).overflow.map((m) => m.id), [5, 6])
})
test('질문에 붙는 문맥: 요약은 맨 앞, 안 담긴 오래된 것은 최대 BATCH-1개 + 최근 8개', () => {
  const prior = convo(CONTEXT_MESSAGES + 10)
  const { summary, lines } = contextParts(prior, { text: '배포 얘기', upTo: 2, coveredTs: 2000 })
  assert.equal(summary, '배포 얘기')
  assert.equal(lines.length, CONTEXT_MESSAGES + SUMMARY_BATCH - 1)
})
test('요약이 아직 없으면 최근 8개 + 아직 요약 못 한 몇 개만 (한도·실패 때도 문맥이 커지지 않는다)', () => {
  assert.equal(contextParts(convo(30), null).lines.length, CONTEXT_MESSAGES + SUMMARY_BATCH - 1)
  assert.equal(contextParts(convo(5), null).lines.length, 5)
  assert.equal(contextParts(convo(5), null).summary, '')
})
test('요약기 입력과 결과에서 비밀값을 가린다', () => {
  const secret = 'sk-ant-api03-' + 'a'.repeat(40)
  const input = summaryInput(null, [msg(1, `키는 ${secret}`)])
  assert.ok(!input.includes(secret))
  const out = nextSummary(`요약 ${secret}`, [msg(1)])
  assert.ok(out && !out.text.includes(secret))
})
test('요약 결과: 길이 상한, 빈 결과는 null, 어디까지 담았는지 기록', () => {
  const items = [msg(1), msg(2), msg(9)]
  const s = nextSummary('가'.repeat(SUMMARY_MAX_CHARS + 100), items)
  assert.equal(s?.text.length, SUMMARY_MAX_CHARS)
  assert.equal(s?.upTo, 9)
  assert.equal(nextSummary('   ', items), null)
})
test('보관 기간이 지난 요약은 없는 것으로', () => {
  const s = { text: 'x', upTo: 1, coveredTs: 0 }
  assert.equal(summaryAlive(s, 31 * 86_400_000, 30), null)
  assert.equal(summaryAlive(s, 29 * 86_400_000, 30), s)
  assert.equal(summaryAlive(null, 0, 30), null)
})
