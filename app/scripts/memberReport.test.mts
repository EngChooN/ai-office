// 리더에게 가는 팀원 보고 길이·대신 고른 답 표시 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clipLeaderReport, LEADER_REPORT_MAX } from '../src/shared/memberReport.ts'
import { markProxyAnswers } from '../src/shared/autonomy.ts'

const note = (n: number) => `…(${n}자 생략)`

test('리더 보고: 600자를 넘는 보고도 상한 안이면 자르지 않는다', () => {
  const body = `${'앞'.repeat(3_000)}\n결론: 대표 결정 필요 — 끝`
  assert.equal(clipLeaderReport(body, note), body)
  assert.ok(clipLeaderReport(body, note).endsWith('끝'))
})

test('리더 보고: 상한을 넘으면 앞부분 + 몇 자를 뺐는지 표시', () => {
  const body = 'x'.repeat(LEADER_REPORT_MAX + 123)
  const out = clipLeaderReport(body, note)
  assert.equal(out, `${'x'.repeat(LEADER_REPORT_MAX)}\n…(123자 생략)`)
  assert.equal(clipLeaderReport('a'.repeat(LEADER_REPORT_MAX), note), 'a'.repeat(LEADER_REPORT_MAX), '딱 상한이면 그대로')
})

test('대신 고른 답: 모든 답에 대표 미확인 표시를 붙인다', () => {
  assert.deepEqual(markProxyAnswers({ '색은?': '파랑 (추천)', '크기?': '중간' }, (a) => `${a} [대표 미확인]`), { '색은?': '파랑 (추천) [대표 미확인]', '크기?': '중간 [대표 미확인]' })
})
