import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isScheduleDue, nextScheduleRun } from '../src/shared/schedule.ts'
import { keyName } from '../src/renderer/lib/keyName.ts'
import { matchCommands } from '../src/shared/slashCommands.ts'
import type { StaffCommand } from '../src/shared/types.ts'

// 2026-11-09은 월요일(1)
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m)
const base = { time: '09:00', weekdays: [1, 2, 3, 4, 5], enabled: true, lastRunDate: null as string | null }

test('예약 다음 실행: 오늘 시각 전이면 오늘, 오늘 이미 돌았으면 다음 고른 요일', () => {
  assert.equal(nextScheduleRun(base, at(9, 8, 30)), at(9, 9).getTime())
  assert.equal(nextScheduleRun({ ...base, lastRunDate: '2026-11-09' }, at(9, 10)), at(10, 9).getTime())
  // 금요일에 돌았으면 주말을 건너뛰고 월요일
  assert.equal(nextScheduleRun({ ...base, lastRunDate: '2026-11-13' }, at(13, 10)), at(16, 9).getTime())
})

test('예약 다음 실행: 시각이 지났는데 오늘 아직 안 돌았으면 지금(곧 실행) — main 실행 판정과 같다', () => {
  const now = at(9, 10)
  assert.equal(isScheduleDue(base, now), true)
  assert.equal(nextScheduleRun(base, now), now.getTime())
  assert.equal(isScheduleDue({ ...base, lastRunDate: '2026-11-09' }, now), false)
  assert.equal(isScheduleDue({ ...base, enabled: false }, now), false)
  assert.equal(isScheduleDue(base, at(8, 10)), false) // 일요일
})

test('예약 다음 실행: 꺼져 있거나 요일이 없으면 null, 같은 요일 하나뿐이면 다음 주', () => {
  assert.equal(nextScheduleRun({ ...base, enabled: false }, at(9, 8)), null)
  assert.equal(nextScheduleRun({ ...base, weekdays: [] }, at(9, 8)), null)
  assert.equal(nextScheduleRun({ ...base, weekdays: [1], lastRunDate: '2026-11-09' }, at(9, 10)), at(16, 9).getTime())
})

test('예약 편집 (#12): 시간·요일을 고쳐 저장하면 다음 실행이 새 값으로 다시 계산된다', () => {
  const now = at(9, 8) // 월 08:00
  const before = { ...base, time: '18:00' }
  assert.equal(nextScheduleRun(before, now), at(9, 18).getTime())
  assert.equal(nextScheduleRun({ ...before, time: '08:30' }, now), at(9, 8, 30).getTime())
  assert.equal(nextScheduleRun({ ...before, weekdays: [3] }, now), at(11, 18).getTime())
  // 오늘 이미 돈 예약은 시각을 늦춰도 오늘 다시 돌지 않는다 (main이 lastRunDate를 유지)
  assert.equal(nextScheduleRun({ ...before, time: '20:00', lastRunDate: '2026-11-09' }, at(9, 19)), at(10, 20).getTime())
})

test('키 이름 (#12): key가 없는 합성 이벤트도 오류 없이 빈 글자, 글자 하나는 소문자', () => {
  assert.equal(keyName({}), '')
  assert.equal(keyName({ key: undefined }), '')
  assert.equal(keyName({ key: 'K' }), 'k')
  assert.equal(keyName({ key: 'ㄱ' }), 'ㄱ')
  assert.equal(keyName({ key: 'Enter' }), 'Enter')
  assert.equal(keyName({ key: 'ArrowUp' }), 'ArrowUp')
})

test('명령 자동완성 (#12): localizedDescription이 빠진 목록(예전 PC)도 오류 없이 거른다', () => {
  const old = [{ name: 'deploy', description: 'Ship to prod', argumentHint: '', isBuiltin: false }] as unknown as StaffCommand[]
  assert.deepEqual(matchCommands(old, 'prod').map((c) => c.name), ['deploy'])
  assert.deepEqual(matchCommands(old, 'zzz'), [])
})
