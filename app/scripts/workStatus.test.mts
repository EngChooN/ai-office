// 상태 보드 한 칸: 상태 전이·옛 기록 기본값·대기 시간·'재검토 필요' 세 값 — pnpm test
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  WORK_STATES, WORK_STATUS_VERSION, canMove, followTask, hasReviewRound, moveWork, normalizeWork, reReviewOf, snapshotFor, toSnapshot, waitLabel, waitTime, workStateLabel,
  type WorkStatus,
} from '../src/main/workStatus.ts'
import { headCommit } from '../src/main/review.ts'
import { doneWorksLimit, worksOf } from '../src/main/remote/protocol.ts'
import type { Task } from '../src/shared/types.ts'
import { awaitingTasks, workStateOf } from '../src/shared/workWait.ts'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const st = (over: Partial<WorkStatus> = {}): WorkStatus => ({ state: 'queued', waitingSince: null, reviewCommit: null, ...over })

test('상태 이름은 다섯 개, 보드 순서대로', () => {
  assert.deepEqual([...WORK_STATES], ['queued', 'working', 'awaitingUser', 'review', 'done'])
  assert.equal(workStateLabel('awaitingUser', 'ko'), '대표 응답 대기')
  assert.equal(workStateLabel('done', 'en'), 'Done')
})

test('옮길 수 없는 전이는 같은 객체를 그대로 돌려준다', () => {
  const q = st()
  assert.equal(moveWork(q, 'review', { now: 1000, head: A }), q)
  assert.equal(moveWork(q, 'queued', { now: 1000 }), q)
  const d = st({ state: 'done', reviewCommit: A })
  assert.equal(moveWork(d, 'awaitingUser', { now: 1000 }), d)
  assert.equal(canMove('done', 'review'), false)
  assert.equal(canMove('working', 'review'), true)
})

test('대표 응답 대기: 들어가면 시각을 찍고, 나오면 지운다. 같은 상태로는 시각이 새로 찍히지 않는다', () => {
  const w = moveWork(st({ state: 'working' }), 'awaitingUser', { now: 5000 })
  assert.deepEqual(w, { state: 'awaitingUser', waitingSince: 5000, reviewCommit: null })
  assert.equal(moveWork(w, 'awaitingUser', { now: 9000 }), w)
  assert.deepEqual(moveWork(w, 'working', { now: 9000 }), { state: 'working', waitingSince: null, reviewCommit: null })
})

test('검토: 들어갈 때 HEAD를 남기고, 완료·대표 응답 대기에서는 유지, 다시 진행하면 지운다', () => {
  const r = moveWork(st({ state: 'working' }), 'review', { now: 1, head: ` ${A}\n` })
  assert.equal(r.reviewCommit, A)
  assert.equal(moveWork(r, 'done', { now: 2 }).reviewCommit, A)
  assert.equal(moveWork(r, 'awaitingUser', { now: 2 }).reviewCommit, A)
  assert.equal(moveWork(r, 'working', { now: 2 }).reviewCommit, null)
  assert.equal(moveWork(moveWork(r, 'done', { now: 2 }), 'queued', { now: 3 }).reviewCommit, null)
  // HEAD를 모르면(깃 폴더 아님·조회 실패) 비워 둔다 → 나중에 판단 불가
  assert.equal(moveWork(st({ state: 'working' }), 'review', { now: 1, head: null }).reviewCommit, null)
  assert.equal(moveWork(st({ state: 'working' }), 'review', { now: 1, head: 'not-a-commit' }).reviewCommit, null)
})

test('옛 기록: 상태 칸이 없으면 보드 칸에서, 그것도 없으면 할 일', () => {
  assert.deepEqual(normalizeWork(undefined, 'todo'), st())
  assert.equal(normalizeWork(null, 'doing').state, 'working')
  assert.equal(normalizeWork(undefined, 'review').state, 'review')
  assert.equal(normalizeWork(undefined, 'done').state, 'done')
  assert.equal(normalizeWork(undefined).state, 'queued')
  assert.equal(normalizeWork('garbage', 'done').state, 'done')
})

test('옛 기록·받은 값 정리: 모르는 칸은 버리고, 상태와 안 맞는 시각·틀린 커밋은 비운다', () => {
  assert.deepEqual(normalizeWork({ state: 'awaitingUser', waitingSince: 7000, reviewCommit: A, extra: 1, v: 99 }, 'doing'), {
    state: 'awaitingUser', waitingSince: 7000, reviewCommit: A,
  })
  assert.equal(normalizeWork({ state: 'working', waitingSince: 7000 }).waitingSince, null)
  assert.equal(normalizeWork({ state: 'awaitingUser', waitingSince: '7000' }).waitingSince, null)
  assert.equal(normalizeWork({ state: 'awaitingUser', waitingSince: -5 }).waitingSince, null)
  assert.equal(normalizeWork({ state: 'review', reviewCommit: 'main' }).reviewCommit, null)
  assert.equal(normalizeWork({ state: 'nope' }, 'review').state, 'review')
})

test('대기 시간: 음수는 0분, 1분 미만 표기, 분·시간·일', () => {
  assert.deepEqual(waitTime(10_000, 5_000), { minutes: 0, isUnderMinute: true })
  assert.deepEqual(waitTime(0 + 1, 59_000), { minutes: 0, isUnderMinute: true })
  assert.deepEqual(waitTime(1, 60_001), { minutes: 1, isUnderMinute: false })
  assert.equal(waitTime(null, 1000), null)
  assert.equal(waitTime(1000, Number.NaN), null)
  const at = (min: number) => waitLabel(waitTime(1, 1 + min * 60_000)!, 'ko')
  assert.equal(waitLabel(waitTime(10_000, 5_000)!, 'ko'), '1분 미만')
  assert.equal(at(42), '42분')
  assert.equal(at(185), '3시간 5분')
  assert.equal(at(2 * 1440 + 4 * 60 + 30), '2일 4시간')
  assert.equal(waitLabel(waitTime(1, 30_000)!, 'en'), 'Under 1 min')
})

test("'재검토 필요' 세 값: 다르면 needed, 같으면 clear, 어느 쪽이든 모르면 unknown", () => {
  assert.equal(reReviewOf(A, B), 'needed')
  assert.equal(reReviewOf(A, A), 'clear')
  assert.equal(reReviewOf(A, A.toUpperCase()), 'clear')
  assert.equal(reReviewOf(null, A), 'unknown')
  assert.equal(reReviewOf(A, null), 'unknown')
  assert.equal(reReviewOf(A, ''), 'unknown')
})

test('짧은 커밋 번호와 전체 번호가 섞여도 같은 커밋이면 clear, 다른 커밋이면 needed', () => {
  assert.equal(reReviewOf(A.slice(0, 7), A), 'clear')
  assert.equal(reReviewOf(A, A.slice(0, 12).toUpperCase()), 'clear')
  assert.equal(reReviewOf(A.slice(0, 7), B), 'needed')
  assert.equal(reReviewOf(B, A.slice(0, 7)), 'needed')
})

test('스냅샷: 버전·상태·대기 시작 시각·검토 커밋 + 계산한 재검토 값', () => {
  const s = st({ state: 'done', reviewCommit: A })
  assert.deepEqual(toSnapshot(s, B), { v: WORK_STATUS_VERSION, state: 'done', waitingSince: null, reviewCommit: A, reReview: 'needed' })
  // 받은 스냅샷을 다시 읽어도 같은 칸 (v·reReview 같은 계산 칸은 버린다)
  assert.deepEqual(normalizeWork(JSON.parse(JSON.stringify(toSnapshot(s, B)))), s)
})

test('snapshotFor: 검토 커밋 없으면 git을 부르지 않고, 같은 폴더는 한 번만 읽고, 조회 실패는 판단 불가', async () => {
  let calls = 0
  const read = async () => (calls++, B)
  const heads = new Map<string, Promise<string | null>>()
  assert.equal((await snapshotFor(st({ state: 'working' }), '/w', heads, read)).reReview, 'unknown')
  assert.equal(calls, 0)
  const r = st({ state: 'review', reviewCommit: A })
  assert.equal((await snapshotFor(r, '/w', heads, read)).reReview, 'needed')
  assert.equal((await snapshotFor(r, '/w', heads, read)).reReview, 'needed')
  assert.equal(calls, 1)
  assert.equal((await snapshotFor(r, null, heads, read)).reReview, 'unknown')
  assert.equal((await snapshotFor(r, '/x', heads, async () => { throw new Error('git') })).reReview, 'unknown')
  // 다음 응답은 새 Map — 그새 HEAD가 검토 커밋으로 돌아왔으면 새로 읽어 clear
  assert.equal((await snapshotFor(r, '/w', new Map(), async () => A)).reReview, 'clear')
})

test('실제 git 폴더: 검토 뒤 커밋하면 재검토 필요, git 폴더가 아니면 판단 불가', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-status-'))
  try {
    assert.equal(await headCommit(dir), null)
    const g = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, stdio: 'pipe' })
    g('init', '-q')
    assert.equal(await headCommit(dir), null) // 커밋 없음
    fs.writeFileSync(path.join(dir, 'a.txt'), '1')
    g('add', '.'); g('commit', '-qm', 'one')
    const r = moveWork(st({ state: 'working' }), 'review', { now: 1, head: await headCommit(dir) })
    assert.equal((await snapshotFor(r, dir)).reReview, 'clear')
    fs.writeFileSync(path.join(dir, 'a.txt'), '2')
    g('commit', '-qam', 'two')
    assert.equal((await snapshotFor(r, dir)).reReview, 'needed')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('화면용: 상태 칸이 없는 카드는 보드 칸에서, 대표 응답 대기는 오래 기다린 순(시각 모르면 맨 뒤)', () => {
  assert.equal(workStateOf({ status: 'doing' }), 'working')
  assert.equal(workStateOf({ status: 'done' }), 'done')
  assert.equal(workStateOf({ status: 'doing', work: st({ state: 'awaitingUser', waitingSince: 5 }) }), 'awaitingUser')
  const tk = (id: string, work?: WorkStatus) => ({ id, status: 'doing' as const, work })
  const list = [
    tk('new', st({ state: 'awaitingUser', waitingSince: 9_000 })),
    tk('plain'),
    tk('unknown', st({ state: 'awaitingUser', waitingSince: null })),
    tk('old', st({ state: 'awaitingUser', waitingSince: 1_000 })),
    tk('review', st({ state: 'review', reviewCommit: A })),
  ]
  assert.deepEqual(awaitingTasks(list).map((x) => x.id), ['old', 'new', 'unknown'])
})

test('followTask: 보드 칸·대표 응답 대기를 따라간다 (칸을 바로 옮겨도, 옛 카드를 완료로 옮겨도)', () => {
  const at = { now: 5_000 }
  const queued = normalizeWork(null, 'todo')
  assert.equal(followTask(queued, 'todo', false, at), queued)
  assert.equal(followTask(queued, 'done', false, at).state, 'done')
  assert.equal(followTask(queued, 'review', false, at).state, 'review')
  const working = followTask(queued, 'doing', false, at)
  assert.equal(working.state, 'working')
  const waiting = followTask(working, 'doing', true, at)
  assert.deepEqual(waiting, { state: 'awaitingUser', waitingSince: 5_000, reviewCommit: null })
  assert.equal(followTask(waiting, 'doing', true, { now: 9_000 }), waiting)
  assert.equal(followTask(waiting, 'doing', false, at).state, 'working')
  // 턴 끝 글 질문(카드가 먼저 검토로 감)·재시작 복원(할 일로 돌아감)도 대표 응답 대기, 완료만 대기 표시를 무시한다
  assert.equal(followTask(working, 'review', true, at).state, 'awaitingUser')
  assert.equal(followTask(queued, 'todo', true, at).state, 'awaitingUser')
  assert.equal(followTask(working, 'done', true, at).state, 'done')
  const reviewed = { state: 'review' as const, waitingSince: null, reviewCommit: A }
  assert.equal(followTask(reviewed, 'done', false, at).reviewCommit, A)
  assert.equal(followTask(reviewed, 'doing', false, at).reviewCommit, null)
  // 검토 중에 질문이 올라와도 검토 커밋은 남고, 답이 끝나면 다시 검토 중
  const asking = followTask(reviewed, 'review', true, at)
  assert.deepEqual(asking, { state: 'awaitingUser', waitingSince: 5_000, reviewCommit: A })
  assert.equal(followTask(asking, 'review', false, at).state, 'review')
  // 대기를 마치고 검토로 돌아와도 같은 회차 — 기준 커밋을 지우지 않는다 (지우면 '재검토 필요'가 사라진다)
  assert.equal(followTask(asking, 'review', false, at).reviewCommit, A)
  assert.equal(moveWork(asking, 'review', { now: 6_000, head: B }).reviewCommit, A)
  // 진행 중 대기(기준 없음)에서 검토로 가면 새 회차
  assert.equal(followTask(waiting, 'review', false, { now: 6_000, head: B }).reviewCommit, B)
})

test('hasReviewRound: 검토 커밋을 남겨 둘 상태 — 검토·대기·완료만', () => {
  assert.deepEqual(WORK_STATES.filter(hasReviewRound), ['awaitingUser', 'review', 'done'])
})

test('headCommit: 응답마다 새로 읽는다 — 커밋이 바뀌면 바로 다른 값, 저장소가 아니면 null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-sync-'))
  try {
    assert.equal(await headCommit(dir), null)
    const g = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir })
    g('init', '-q')
    g('commit', '-q', '--allow-empty', '-m', 'a')
    const first = await headCommit(dir)
    assert.match(first ?? '', /^[0-9a-f]{40}$/)
    g('commit', '-q', '--allow-empty', '-m', 'b')
    assert.notEqual(await headCommit(dir), first)
    assert.equal(reReviewOf(first, await headCommit(dir)), 'needed')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('worksOf: 끝나지 않은 업무는 모두 싣고, 완료는 최근 20건 + 빠진 개수, 검토 커밋도 싣는다', () => {
  const card = (i: number, status: Task['status'], work?: Task['work']) =>
    ({ id: `t${i}`, title: `일 ${i}`, status, assigneeId: null, updatedAt: i, work } as unknown as Task)
  const tasks = [
    ...Array.from({ length: 200 }, (_, i) => card(i, 'doing')),
    card(200, 'doing', { state: 'awaitingUser', waitingSince: 1_000, reviewCommit: null }),
    ...Array.from({ length: 25 }, (_, i) => card(300 + i, 'done', { state: 'done', waitingSince: null, reviewCommit: A })),
  ]
  const { works, worksDoneOmitted } = worksOf(tasks, {}, new Map())
  assert.equal(works.filter((w) => w.state !== 'done').length, 201)
  assert.ok(works.some((w) => w.id === 't200' && w.state === 'awaitingUser' && w.waitingSince === 1_000))
  assert.equal(works.filter((w) => w.state === 'done').length, 20)
  assert.equal(worksDoneOmitted, 5)
  assert.equal(works.find((w) => w.id === 't324')?.reviewCommit, A)
  assert.equal(works.find((w) => w.id === 't0')?.reviewCommit, '')
  // 휴대폰 '이전 완료 더 보기': 달라는 만큼(20~500) 싣는다
  const more = worksOf(tasks, {}, new Map(), 40)
  assert.equal(more.works.filter((w) => w.state === 'done').length, 25)
  assert.equal(more.worksDoneOmitted, 0)
  assert.deepEqual([undefined, 0, 5, 40, 41.7, 9999, NaN].map(doneWorksLimit), [20, 20, 20, 40, 41, 500, 20])
})
