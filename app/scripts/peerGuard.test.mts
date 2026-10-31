// 리뷰 3번 지적 회귀: 피어 일 격리·재위임 승인 주체 전파·전송 경계 가리기
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasLocalWork, isPeerOrigin, peerJobOfOrigins, shouldHoldLocal } from '../src/main/peer/peerIsolation.ts'
import { redactPeerDeep, redactPeerText } from '../src/main/peer/redact.ts'
import { PeerHost, type PeerHostOffice } from '../src/main/peer/peerHost.ts'
import { memoryPeerStore } from '../src/main/peer/peerStore.ts'

const J = '11111111-1111-4111-8111-111111111111'

test('P1 peerJobOf: 로컬 일이 앞에 서도 피어 일이 걸려 있으면 승인 주체가 빠지지 않는다 (자동결재 제한·중계 유지)', () => {
  assert.equal(peerJobOfOrigins([{ kind: 'peer', jobId: J }]), J)
  assert.equal(peerJobOfOrigins([{ kind: 'user' }, { kind: 'peer', jobId: J }]), J) // 예전에는 맨 앞만 봐서 null
  assert.equal(peerJobOfOrigins([{ kind: 'task' }, { kind: 'chat' }, { kind: 'peer', jobId: J }]), J)
  assert.equal(peerJobOfOrigins([{ kind: 'user' }, { kind: 'task' }]), null)
  assert.equal(peerJobOfOrigins([]), null)
})

test('P1 재위임: 피어 일에서 파생된 하위 delegate는 승인 주체(피어 jobId)를 이어받는다', () => {
  const derived = { kind: 'delegate', peerJobId: J }
  assert.equal(isPeerOrigin(derived), true)
  assert.equal(peerJobOfOrigins([derived]), J) // 하위 직원도 자동결재 끔·A컴 중계 대상
  assert.equal(peerJobOfOrigins([{ kind: 'user' }, derived]), J)
  // 보고가 리드에게 돌아갈 때도 같은 문맥이라 리드의 대기 규칙에 걸리지 않는다
  assert.equal(shouldHoldLocal([{ kind: 'peer', jobId: J }], { kind: 'user', peerJobId: J }, false), false)
})

test('P1 격리: 피어 일이 걸린 직원에게 온 로컬 지시는 대기, 피어 문맥·/명령은 통과, 로컬 일을 하는 직원은 피어 일을 받지 않는다', () => {
  const peerBusy = [{ kind: 'peer', jobId: J }]
  assert.equal(shouldHoldLocal(peerBusy, { kind: 'user' }, false), true)
  assert.equal(shouldHoldLocal(peerBusy, { kind: 'task' }, false), true)
  assert.equal(shouldHoldLocal(peerBusy, { kind: 'user' }, true), false) // /중단 같은 제어
  assert.equal(shouldHoldLocal(peerBusy, { kind: 'peer', jobId: 'other' }, false), false)
  assert.equal(shouldHoldLocal([{ kind: 'user' }], { kind: 'user' }, false), false) // 피어 일이 없으면 평소대로
  assert.equal(hasLocalWork([{ kind: 'user' }], 0, 0), true)
  assert.equal(hasLocalWork([], 2, 0), true)
  assert.equal(hasLocalWork([], 0, 1), true)
  assert.equal(hasLocalWork([{ kind: 'peer', jobId: J }, { kind: 'delegate', peerJobId: J }], 0, 0), false)
})

test('P2 가리기: 절대 경로는 이름만, 토큰·비밀번호 모양은 가린다 (일반 문장은 그대로)', () => {
  const out = redactPeerText('빌드 끝: /Users/joonyoung/secret-proj/dist/app.js 와 ~/.ssh/id_rsa 를 봤어요. token=abcd1234efgh, Bearer abcdefghijklmnop, sk-abcdefghijklmnopqrstuvwx, C:\\Users\\kim\\a.txt')
  assert.equal(out.includes('/Users/joonyoung'), false)
  assert.equal(out.includes('abcd1234efgh'), false)
  assert.equal(out.includes('abcdefghijklmnop'), false)
  assert.equal(out.includes('sk-abcdef'), false)
  assert.equal(out.includes('C:\\Users'), false)
  assert.match(out, /…\/app\.js/)
  assert.equal(redactPeerText('src/main/office.ts 를 고쳤어요. 테스트 960개 통과'), 'src/main/office.ts 를 고쳤어요. 테스트 960개 통과')
  assert.equal(redactPeerText('postgres://admin:hunter22@db.local/x').includes('hunter22'), false)
  // 4차 P2: 열거 밖 절대 경로·따옴표 안 공백 비밀값
  assert.equal(redactPeerText('결과: /data/internal/report.txt 참고'), '결과: …/report.txt 참고')
  for (const s of ['password="alpha beta"', "token='a b c d'", '"api_key": "x y z w"']) {
    const o = redactPeerText(s)
    assert.ok(o.includes('‹가림›') && !/alpha|beta|\bb c d|y z w/.test(o), `${s} → ${o}`)
  }
  for (const s of ['https://x/y', 'https://example.com/a/b', 'and/or', '읽기/쓰기', 'A / B', '1/2/3', 'src/a/b.ts 수정', 'see http://h.io/a/b/c'])
    assert.equal(redactPeerText(s), s)
  assert.equal(redactPeerText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U').includes('eyJhbGci'), false)
  assert.deepEqual(redactPeerDeep({ a: ['/home/x/y.txt'], b: { c: 1 } }), { a: ['…/y.txt'], b: { c: 1 } })
})

function hostWith(over: Partial<PeerHostOffice>) {
  const store = memoryPeerStore()
  const published: { event: string; data: any }[] = []
  const office: PeerHostOffice = {
    staffBriefs: () => [{ id: 'kim', name: '김', role: '기획', avatar: 1, provider: 'claude', model: 'default', status: 'working', thought: '/Users/me/p/a.ts 수정 중' }],
    startJob: () => 'ok',
    cancelJob: () => {},
    decide: () => true,
    answerQuestion: () => true,
    pendingApprovals: () => [{ jobId: J, approvalId: 'a1', staffId: 'kim', toolName: 'Write', summary: '/Users/me/p/.env 쓰기 password=hunter2x', createdAt: 1 }],
    approvalJob: () => J,
    ...over,
  }
  const host = new PeerHost({ store, office, publish: (_s, event, data) => published.push({ event, data }) })
  return { host, store, published }
}

test('P2 전송 경계: 결과·오류·결재 요약·말풍선이 B컴에서 나가기 전에 가려진다', () => {
  const h = hostWith({})
  h.host.accept('s1', { jobId: J, staffId: 'kim', instruction: 'x', lead: { name: 'L', role: 'r' } })
  h.host.onApproval({ jobId: J, approvalId: 'a1', staffId: 'kim', toolName: 'Write', summary: '/Users/me/p/.env 쓰기 password=hunter2x', summaryI18n: { key: 'k', args: { file: '/Users/me/p/.env' } }, createdAt: 1, questions: [{ q: '/home/me/x' }] })
  const ap = h.published.find((p) => p.event === 'approval')!.data
  assert.equal(JSON.stringify(ap).includes('/Users/me'), false)
  assert.equal(JSON.stringify(ap).includes('hunter2x'), false)
  assert.equal(JSON.stringify(h.host.approvals('s1').body).includes('hunter2x'), false)
  assert.equal(JSON.stringify(h.host.staff()).includes('/Users/me'), false)
  h.host.finish(J, '끝났어요: /Users/me/p/out.txt token=zzzz9999')
  const done = h.published.filter((p) => p.event === 'job').at(-1)!.data
  assert.equal(done.result.includes('/Users/me'), false)
  assert.equal(done.result.includes('zzzz9999'), false)
  assert.match(done.result, /…\/out\.txt/)
})

test('P1 busy: 직원이 로컬 일을 하는 중이면 일을 받지 않고(503 staff_busy) 수신함에 남기지 않아 A컴이 같은 jobId로 다시 보낼 수 있다', () => {
  const h = hostWith({ startJob: () => 'busy' })
  const r = h.host.accept('s1', { jobId: J, staffId: 'kim', instruction: 'x', lead: { name: 'L', role: 'r' } })
  assert.deepEqual([r.status, r.body.error], [503, 'staff_busy'])
  assert.equal(h.store.inbox.get(J), undefined)
})

// ── 4차 한리뷰 지적 (office.ts가 쓰는 순수 판정) ──
import { blocksCopyRedelegate, canCreateCards, derivedPeerAction, heldByOtherPeerJob, peerCwdRestored } from '../src/main/peer/peerIsolation.ts'

test('4차 P1-1 피어 문맥(재위임 포함)에서는 add_task·propose_plan 카드 생성을 막고, 로컬 직원은 허용한다', () => {
  assert.equal(canCreateCards([{ kind: 'peer', jobId: 'J1' }]), false)
  assert.equal(canCreateCards([{ kind: 'delegate', peerJobId: 'J1' }]), false)
  assert.equal(canCreateCards([{ kind: 'user' }, { kind: 'peer', jobId: 'J1' }]), false)
  assert.equal(canCreateCards([{ kind: 'user' }]), true)
})

test('4차 P1-2 다른 jobId가 점유한 직원은 피어 수신·내부 delegate·add_task 모두 busy', () => {
  const j1 = [{ kind: 'peer', jobId: 'J1' }]
  assert.equal(heldByOtherPeerJob(j1, undefined, 'J2'), true) // 피어 수신
  assert.equal(heldByOtherPeerJob(j1, undefined, undefined), true) // 로컬 delegate/add_task
  assert.equal(heldByOtherPeerJob([], 'J1', 'J2'), true) // 복사본 폴더 점유
  assert.equal(heldByOtherPeerJob([{ kind: 'delegate', peerJobId: 'J1' }], undefined, 'J1'), false) // 같은 일의 재위임은 허용
  assert.equal(heldByOtherPeerJob([], undefined, 'J2'), false)
})

test('4차 P2-3 복사본 폴더로 하는 피어 일은 재위임 거절', () => {
  assert.equal(blocksCopyRedelegate(['J1'], 'J1'), true)
  assert.equal(blocksCopyRedelegate(['J1'], 'J2'), false)
  assert.equal(blocksCopyRedelegate(['J1'], null), false)
})

test('4차 P2-4 실제 작업 폴더가 원래대로 돌아오기 전에는 복사본 기록을 지우지 않는다', () => {
  assert.equal(peerCwdRestored('/copy/j1', '/home/me/proj'), false)
  assert.equal(peerCwdRestored('/home/me/proj', '/home/me/proj'), true)
})

test('4차 재리뷰 P1-2 늦게 온 팀원 보고: 끝난 피어 일이면 버리고, 다른 피어 일이 쓰는 리드는 대기, 같은 일·로컬 지시는 통과', () => {
  const active = (id: string) => id === 'J1' || id === 'J2'
  const report = { kind: 'user', peerJobId: 'J1' }
  assert.equal(derivedPeerAction(report, [], undefined, active), 'pass')
  assert.equal(derivedPeerAction(report, [{ kind: 'peer', jobId: 'J1' }], undefined, active), 'pass')
  assert.equal(derivedPeerAction(report, [{ kind: 'peer', jobId: 'J2' }], undefined, active), 'hold')
  assert.equal(derivedPeerAction(report, [], 'J2', active), 'hold')
  assert.equal(derivedPeerAction({ kind: 'user', peerJobId: 'J0' }, [], undefined, active), 'drop')
  assert.equal(derivedPeerAction({ kind: 'user' }, [{ kind: 'peer', jobId: 'J2' }], undefined, active), 'pass') // 로컬 지시는 기존 대기 규칙 몫
  assert.equal(derivedPeerAction({ kind: 'peer', jobId: 'J3' }, [], undefined, active), 'pass')
})
