// 사무실 지도 준비 신호 (renderer/map/renderSignal.ts) — 루프가 자고 있어도(창 숨김·가림) 신호가 와야 안으로 들어간다 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { afterNextRender } from '../src/renderer/map/renderSignal.ts'

/** Phaser 게임 대신: step이 그리기 끝 신호를 낸다 */
function fakeGame(running: boolean) {
  const listeners = new Map<string, (() => void)[]>()
  const game = {
    loop: { running },
    steps: 0,
    events: { once: (e: string, fn: () => void) => listeners.set(e, [...(listeners.get(e) ?? []), fn]) },
    step() {
      game.steps++
      game.render()
    },
    render() {
      const fns = listeners.get('postrender') ?? []
      listeners.delete('postrender')
      for (const fn of fns) fn()
    },
  }
  return game
}

test('루프가 자고 있으면 한 장만 그려 바로 알린다 (루프는 계속 잔다)', () => {
  const game = fakeGame(false)
  let ready = 0
  afterNextRender(game, 'postrender', () => ready++, 0)
  assert.equal(ready, 1)
  assert.equal(game.steps, 1)
  assert.equal(game.loop.running, false)
})

test('루프가 돌고 있으면 따로 그리지 않고 다음 그리기를 기다린다', () => {
  const game = fakeGame(true)
  let ready = 0
  afterNextRender(game, 'postrender', () => ready++, 0)
  assert.equal(ready, 0)
  assert.equal(game.steps, 0)
  game.render()
  game.render()
  assert.equal(ready, 1)
})

test('지도를 빨리 떼었다 붙여도(언어 바꾸기) 붙일 때마다 한 번씩 알린다', () => {
  const game = fakeGame(false)
  const calls: string[] = []
  afterNextRender(game, 'postrender', () => calls.push('old'), 0)
  afterNextRender(game, 'postrender', () => calls.push('new'), 0)
  assert.deepEqual(calls, ['old', 'new'])
})
