// 프로젝트 간 협업 승인 판정 (shared/collabPairs.ts) 시험
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCollab, collabLimit, folderClash, isSameFolder, pairOf, parseApprovedPairs, sameScopes, scopesOf, withApproved, type CollabScope } from '../src/shared/collabPairs.ts'
import { isPersistable } from '../src/main/pendingApprovals.ts'

const A: CollabScope = { key: 'labA', cwd: '/w/a' }
const B: CollabScope = { key: 'labB', cwd: '/w/b' }
const now = 1000

test('협업 단위: 프로젝트 전부(정렬), 없으면 팀, 둘 다 없으면 빈 목록', () => {
  assert.deepEqual(scopesOf([{ id: 'z', cwd: '/z' }, { id: 'a', cwd: '' }], 't1'), [{ key: 'a', cwd: null }, { key: 'z', cwd: '/z' }])
  assert.deepEqual(scopesOf([], 't1'), [{ key: 'team:t1', cwd: null }])
  assert.deepEqual(scopesOf([], null), [])
})

test('쌍 키는 순서와 무관하고 폴더도 키 순서대로 놓인다', () => {
  assert.deepEqual(pairOf(A, B), pairOf(B, A))
  assert.deepEqual(pairOf(B, A), { pair: 'labA|labB', cwds: ['/w/a', '/w/b'] })
})

test('폴더 비교: 같음·안팎은 같은 폴더, 끝 슬래시·대소문자·역슬래시 무시, 없거나 비슷한 이름은 아님', () => {
  assert.ok(isSameFolder('/w/a', '/w/a/'))
  assert.ok(isSameFolder('/w/a', '/w/a/sub'))
  assert.ok(isSameFolder('/W/A/sub', '/w/a'))
  assert.ok(isSameFolder('C:\\w\\a', 'c:/w/a/x'))
  assert.ok(!isSameFolder('/w/a', '/w/ab'))
  assert.ok(!isSameFolder('/w/a', null))
})

test('같은 프로젝트를 함께하면 묻지 않는다 (다른 프로젝트도 함께 있어도)', () => {
  const r = checkCollab({ from: [A, B], to: [B], approved: [], isOverBudget: false, now })
  assert.deepEqual(r.reasons, [])
  assert.deepEqual(r.drafts, [])
})

test('처음 만나는 다른 프로젝트: 쌍 승인 + 다른 폴더 이유, 승인하면 다음부터 통과', () => {
  const r = checkCollab({ from: [A], to: [B], approved: [], isOverBudget: false, now })
  assert.deepEqual(r.reasons, ['newPair', 'otherFolder'])
  assert.deepEqual(r.otherFolders, ['/w/a', '/w/b'])
  assert.equal(r.drafts.length, 1)
  const approved = withApproved([], r.drafts)
  assert.deepEqual(checkCollab({ from: [B], to: [A], approved, isOverBudget: false, now }).reasons, [], '반대 방향도 같은 쌍')
})

test('승인 뒤 작업 폴더가 바뀌면 다시 묻는다', () => {
  const approved = withApproved([], checkCollab({ from: [A], to: [B], approved: [], isOverBudget: false, now }).drafts)
  const moved = { ...B, cwd: '/w/b2' }
  assert.deepEqual(checkCollab({ from: [A], to: [moved], approved, isOverBudget: false, now }).reasons, ['folderChanged', 'otherFolder'])
})

test('여러 프로젝트 소속이면 승인 안 된 쌍만 한 카드로 모은다', () => {
  const C: CollabScope = { key: 'labC', cwd: null }
  const approved = withApproved([], [{ ...pairOf(A, C), approvedAt: 1 }])
  const r = checkCollab({ from: [A, B], to: [C], approved, isOverBudget: false, now })
  assert.deepEqual(r.reasons, ['newPair'], '폴더가 없는 쪽은 다른 폴더로 치지 않는다')
  assert.deepEqual(r.drafts.map((d) => d.pair), ['labB|labC'])
})

test('프로젝트 없는 팀장끼리는 팀 단위 쌍', () => {
  const r = checkCollab({ from: scopesOf([], 't1'), to: scopesOf([], 't2'), approved: [], isOverBudget: false, now })
  assert.deepEqual(r.reasons, ['newPair'])
  assert.equal(r.drafts[0].pair, 'team:t1|team:t2')
})

test('예산 초과는 매번 묻고 기억하지 않는다 (같은 프로젝트여도)', () => {
  const r = checkCollab({ from: [A], to: [A], approved: [], isOverBudget: true, now })
  assert.deepEqual(r.reasons, ['overBudget'])
  assert.deepEqual(r.drafts, [])
})

test('같은 폴더를 쓰는 다른 프로젝트는 경고 폴더를 돌려준다 (승인된 쌍이어도)', () => {
  const B2 = { key: 'labB', cwd: '/w/a/sub' }
  const first = checkCollab({ from: [A], to: [B2], approved: [], isOverBudget: false, now })
  assert.deepEqual(first.reasons, ['newPair'])
  assert.equal(first.sameFolder, '/w/a/sub')
  const again = checkCollab({ from: [A], to: [B2], approved: withApproved([], first.drafts), isOverBudget: false, now })
  assert.deepEqual(again.reasons, [])
  assert.equal(again.sameFolder, '/w/a/sub')
  assert.equal(checkCollab({ from: [A], to: [A], approved: [], isOverBudget: false, now }).sameFolder, null, '같은 프로젝트 안은 경고하지 않는다')
})

test('직원이 직접 지정한 작업 폴더가 있으면 모든 협업 단위의 폴더를 그것으로 본다', () => {
  assert.deepEqual(scopesOf([{ id: 'a', cwd: '/w/a' }], 't1', '/mine'), [{ key: 'a', cwd: '/mine' }])
  assert.deepEqual(scopesOf([], 't1', '/mine'), [{ key: 'team:t1', cwd: '/mine' }])
})

test('폴더 겹침: 다른 단위끼리 같은 폴더(안팎 포함)면 첫 쌍, 같은 단위를 함께하면 보지 않는다', () => {
  const x = { name: '가', keys: ['labA'], cwds: ['/w/a'] }
  const y = { name: '나', keys: ['labB'], cwds: ['/w/a/sub'] }
  assert.deepEqual(folderClash([x, y]), { a: '가', b: '나', cwd: '/w/a/sub' })
  assert.equal(folderClash([x, { ...y, keys: ['labB', 'labA'] }]), null, '같은 프로젝트를 함께하면 원래 같은 폴더')
  assert.equal(folderClash([x, { ...y, cwds: ['/w/b'] }]), null)
  assert.equal(folderClash([x, { ...y, cwds: [null] }]), null, '폴더가 없으면 겹침 아님')
  assert.equal(folderClash([x]), null)
})

test('공통 한도: 받는 사람 수 초과가 먼저, 그다음 토큰 예산', () => {
  assert.equal(collabLimit({ count: 7, max: 6, isOverBudget: true }), 'tooMany')
  assert.equal(collabLimit({ count: 6, max: 6, isOverBudget: true }), 'overBudget')
  assert.equal(collabLimit({ count: 6, max: 6, isOverBudget: false }), null)
})

test('저장본 읽기는 모양이 틀린 줄을 버리고, 같은 쌍은 새 값으로 바꾼다', () => {
  const ok = { pair: 'a|b', cwds: ['/a', null], approvedAt: 1 }
  assert.deepEqual(parseApprovedPairs([ok, { pair: 1 }, null, 'x']), [ok])
  assert.deepEqual(parseApprovedPairs('nope'), [])
  assert.equal(withApproved([{ pair: 'a|b', cwds: ['/a', null], approvedAt: 1 }], [{ pair: 'a|b', cwds: ['/a2', null], approvedAt: 2 }])[0].approvedAt, 2)
})

test('앱 결재(app:)는 재시작 복원용으로 저장하지 않는다', () => {
  assert.ok(!isPersistable({ id: 'app:x', toolName: 'request_help' }))
  assert.ok(isPersistable({ id: 'x', toolName: 'Bash' }))
})

test('sameScopes: 순서·폴더 표기 차이는 같다고 보고, 소속이 늘거나 폴더가 바뀌면 다르다', () => {
  assert.equal(sameScopes([A, B], [{ key: 'labB', cwd: '/W/b/' }, A]), true)
  assert.equal(sameScopes([A], [A, B]), false)
  assert.equal(sameScopes([A], [{ key: 'labA', cwd: '/w/a2' }]), false)
  assert.equal(sameScopes([{ key: 'labA', cwd: null }], [A]), false)
})
