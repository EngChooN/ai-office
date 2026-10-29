// 윈도우 Squirrel 실행 인자 해석 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { squirrelEventOf } from '../src/main/squirrelArgs.ts'

test('squirrelEventOf: 설치·업데이트·제거·구버전 인자를 알아본다', () => {
  assert.equal(squirrelEventOf(['claude-office.exe', '--squirrel-install', '0.14.3']), 'install')
  assert.equal(squirrelEventOf(['claude-office.exe', '--squirrel-updated', '0.14.4']), 'updated')
  assert.equal(squirrelEventOf(['claude-office.exe', '--squirrel-uninstall', '0.14.3']), 'uninstall')
  assert.equal(squirrelEventOf(['claude-office.exe', '--squirrel-obsolete', '0.14.2']), 'obsolete')
})

test('squirrelEventOf: 일반 실행·첫 실행 인자는 이벤트가 아니다', () => {
  assert.equal(squirrelEventOf(['claude-office.exe']), null)
  assert.equal(squirrelEventOf(['claude-office.exe', '--squirrel-firstrun']), null)
  assert.equal(squirrelEventOf(['claude-office.exe', '--hidden']), null)
})
