// Codex 직원 셸 네트워크 옵션: 켠 직원만 app-server에 network_access 설정을 넘긴다.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approvalSettings, shellNetworkArgs } from '../src/main/ai/codexEvents.ts'

test('꺼져 있으면 인자를 넘기지 않는다', () => {
  assert.deepEqual(shellNetworkArgs(undefined), [])
  assert.deepEqual(shellNetworkArgs(false), [])
})

test('켜면 workspace-write 네트워크를 허용하는 -c 인자를 넘긴다', () => {
  assert.deepEqual(shellNetworkArgs(true), ['-c', 'sandbox_workspace_write.network_access=true'])
})

test('승인 정책과 샌드박스 모드는 그대로다', () => {
  assert.deepEqual(approvalSettings('ask'), { approvalPolicy: 'untrusted', sandbox: 'workspace-write' })
})
