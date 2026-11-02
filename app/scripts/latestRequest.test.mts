// 겹친 상태 조회: 마지막에 보낸 요청의 응답만 쓴다 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLatestRequest } from '../src/renderer/lib/latestRequest.ts'

/** 밖에서 원하는 순서로 끝낼 수 있는 요청 */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('응답 순서가 뒤집혀도 먼저 보낸 느린 응답은 최신 결과를 덮지 않는다', async () => {
  const requests = createLatestRequest()
  let shown = ''
  const apply = async (p: Promise<string>) => {
    const { value, isLatest } = await requests.run(() => p)
    if (isLatest) shown = value
  }
  const slow = deferred<string>()
  const fast = deferred<string>()
  const first = apply(slow.promise) // 조용한 조회 (느림)
  const second = apply(fast.promise) // 그사이 누른 다시 확인
  fast.resolve('new')
  await second
  assert.equal(shown, 'new')
  assert.equal(requests.isPending, true, '느린 요청이 남아 있는 동안은 묻는 중')
  slow.resolve('old')
  await first
  assert.equal(shown, 'new', '늦게 온 옛 응답은 버린다')
  assert.equal(requests.isPending, false)
})

test('한 요청이 끝나도 다른 요청이 남아 있으면 묻는 중으로 본다', async () => {
  const requests = createLatestRequest()
  const a = deferred<number>()
  const b = deferred<number>()
  const ra = requests.run(() => a.promise)
  const rb = requests.run(() => b.promise)
  a.resolve(1)
  assert.equal((await ra).isLatest, false)
  assert.equal(requests.isPending, true)
  b.resolve(2)
  assert.deepEqual(await rb, { value: 2, isLatest: true })
  assert.equal(requests.isPending, false)
})

test('실패한 요청도 묻는 중 표시를 남기지 않는다', async () => {
  const requests = createLatestRequest()
  const a = deferred<number>()
  const ra = requests.run(() => a.promise)
  a.reject(new Error('boom'))
  await assert.rejects(ra)
  assert.equal(requests.isPending, false)
})
