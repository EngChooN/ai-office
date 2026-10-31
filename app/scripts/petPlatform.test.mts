// 바탕화면 비서 맥·윈도우 차이 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPetPlatform, needsBoundsRetry, petAllWorkspaces, petTopLevel } from '../src/main/petPlatform.ts'

test('맥·윈도우에서만 비서를 띄운다', () => {
  assert.equal(isPetPlatform('darwin'), true)
  assert.equal(isPetPlatform('win32'), true)
  assert.equal(isPetPlatform('linux'), false)
})

test('항상 위 단계: 맥은 그대로 floating, 윈도우는 screen-saver', () => {
  assert.equal(petTopLevel('darwin'), 'floating')
  assert.equal(petTopLevel('win32'), 'screen-saver')
})

test('모든 데스크톱 위 표시는 맥만', () => {
  assert.equal(petAllWorkspaces('darwin'), true)
  assert.equal(petAllWorkspaces('win32'), false)
})

test('윈도우는 배율 때문에 크기가 틀어졌을 때만 다시 맞춘다 (맥은 안 함)', () => {
  const want = { x: 10, y: 10, width: 200, height: 300 }
  assert.equal(needsBoundsRetry('win32', want, { ...want, width: 250 }), true)
  assert.equal(needsBoundsRetry('win32', want, { ...want, x: 99 }), false)
  assert.equal(needsBoundsRetry('darwin', want, { ...want, width: 250 }), false)
})
