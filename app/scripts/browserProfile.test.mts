// 브라우저 프로필 경로(직원별/공용)와 공용 로그인 사용 중 표시 시험
import assert from 'node:assert/strict'
import path from 'node:path'
import { register } from 'node:module'
import { test } from 'node:test'
const g = globalThis as unknown as { __electron: unknown }
g.__electron = { app: { getPath: () => '/tmp', getVersion: () => '0.0.0', getLocale: () => 'ko', getAppPath: () => process.cwd(), isPackaged: false, on() {} } }
register('./officeLoaderHooks.mjs', import.meta.url)
const { browserProfilePath, createBrowserLock, browserOutputDir } = await import('../src/main/browser.ts')

test('프로필 경로: 꺼짐은 직원별, 켜짐은 공용', () => {
  assert.equal(browserProfilePath('/u', 'a', false), path.join('/u', 'browser', 'a', 'profile'))
  assert.equal(browserProfilePath('/u', 'a', true), path.join('/u', 'browser', '_shared', 'profile'))
  assert.equal(browserProfilePath('/u', 'b', true), browserProfilePath('/u', 'a', true))
})

test('설정이 없으면(undefined) 꺼짐으로 직원별', () => {
  const settings: { sharedBrowserLogin?: boolean } = {}
  assert.equal(browserProfilePath('/u', 'a', settings.sharedBrowserLogin === true), path.join('/u', 'browser', 'a', 'profile'))
})

test('output(스크린샷)은 켜짐과 상관없이 늘 직원별', () => {
  assert.equal(browserOutputDir('a'), path.join('/tmp', 'browser', 'a', 'output'))
  assert.notEqual(browserOutputDir('a'), browserOutputDir('b'))
})

test('사용 중 표시: 첫째 성공, 둘째 거절, 해제 후 성공', () => {
  const lock = createBrowserLock()
  assert.equal(lock.claim('a'), true)
  assert.equal(lock.claim('a'), true)
  assert.equal(lock.claim('b'), false)
  lock.release('b') // 잡지 않은 직원의 해제는 영향 없다
  assert.equal(lock.claim('b'), false)
  lock.release('a')
  assert.equal(lock.claim('b'), true)
})

test('사용 중 직원의 세션이 닫혔으면 다음 직원이 넘겨받는다', () => {
  const open = new Set(['a'])
  const lock = createBrowserLock((id) => open.has(id))
  assert.equal(lock.claim('a'), true)
  assert.equal(lock.claim('b'), false)
  open.delete('a')
  assert.equal(lock.claim('b'), true)
})
