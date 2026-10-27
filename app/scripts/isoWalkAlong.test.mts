// 발표장 걷기 한 프레임 (데모데이 멈춤 회귀) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { walkAlong } from '../src/shared/iso/walkAlong.ts'

test('남은 걸음이 아주 작은 수여도 반복이 끝난다 (예전엔 5e-324에서 화면이 멈췄다)', () => {
  const r = walkAlong({ gx: 0, gy: 0, z: 0 }, [{ gx: 3, gy: 0, z: 0 }], 5e-324)
  assert.equal(r.path.length, 1)
  assert.ok(r.at.gx >= 0 && r.at.gx < 1e-300)
})

test('무작위 경로를 프레임마다 걸어도 늘 끝나고 결국 도착한다', () => {
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  for (let trial = 0; trial < 3000; trial++) {
    let at = { gx: rand() * 10, gy: rand() * 10, z: 0 }
    let path = Array.from({ length: 5 }, () => ({ gx: Math.round(rand() * 20) / 2, gy: Math.round(rand() * 20) / 2, z: rand() < 0.5 ? 0 : 3 }))
    const goal = path.at(-1)!
    for (let f = 0; f < 2000 && path.length; f++) ({ at, path } = walkAlong(at, path, (0.016 + rand() * 0.03) / 0.28))
    assert.equal(path.length, 0)
    assert.deepEqual(at, goal)
  }
})

test('제자리에서 높이만 바뀌는 점(계단)은 바로 지나가고, 남은 걸음은 다음 구간에 쓴다', () => {
  const r = walkAlong({ gx: 0, gy: 0, z: 0 }, [{ gx: 0, gy: 0, z: 3 }, { gx: 2, gy: 0, z: 3 }], 1)
  assert.deepEqual(r.at, { gx: 1, gy: 0, z: 3 })
  assert.equal(r.path.length, 1)
})
