// 지시 처리 상태(#9): 직원별 진행 정보 계산·오류 문구
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildStaffProgress, summarizeInstruction } from '../src/shared/staffProgress.ts'
import MAIN_DICT from '../src/shared/i18n/dict/main.ts'

const o = (text: string, room?: string) => ({ text, room })

test('받은 일이 없으면 null', () => {
  assert.equal(buildStaffProgress({ status: 'idle', origins: [], queued: 0, hasApproval: false }), null)
})

test('상태: 작업 중·대기·오류·결재', () => {
  const base = { origins: [o('a', 'r1'), o('b')], queued: 1, hasApproval: false }
  assert.deepEqual(buildStaffProgress({ ...base, status: 'working' }), { state: 'working', text: 'a', room: 'r1', queued: 1 })
  assert.equal(buildStaffProgress({ ...base, status: 'idle' })?.state, 'queued')
  assert.equal(buildStaffProgress({ ...base, status: 'error' })?.state, 'error')
  assert.equal(buildStaffProgress({ ...base, status: 'working', hasApproval: true })?.state, 'approval')
})

test('대기 메시지: 앱이 들고 있는 지시를 받은 순서대로, 대기 수에 더해 센다', () => {
  const waiting = [
    { id: 'w1', text: 'b' },
    { id: 'w2', text: 'c' },
  ]
  const p = buildStaffProgress({ status: 'working', origins: [o('a')], queued: 1, hasApproval: false, waiting })
  assert.deepEqual(p?.waiting, waiting)
  assert.equal(p?.queued, 3)
  // 런타임에 이미 넘긴 지시(origins 뒤쪽)는 대기 메시지가 아니다 — 취소·지금 보내기를 할 수 없다
  assert.equal('waiting' in (buildStaffProgress({ status: 'working', origins: [o('a'), o('b')], queued: 1, hasApproval: false }) ?? {}), false)
  // 비면 필드 자체를 뺀다
  assert.equal('waiting' in (buildStaffProgress({ status: 'working', origins: [o('a')], queued: 0, hasApproval: false, waiting: [] }) ?? {}), false)
  // 긴 글은 500자까지
  assert.equal(buildStaffProgress({ status: 'working', origins: [o('a')], queued: 0, hasApproval: false, waiting: [{ id: 'w', text: 'x'.repeat(900) }] })?.waiting?.[0].text.length, 500)
})

test('대기 수는 런타임이 센 값을 그대로 쓴다', () => {
  assert.equal(buildStaffProgress({ status: 'working', origins: [o('a')], queued: 0, hasApproval: false })?.queued, 0)
})

test('요약: 공백 정리·80자 제한', () => {
  assert.equal(summarizeInstruction(' a \n b '), 'a b')
  assert.equal(summarizeInstruction('x'.repeat(100)).length, 81)
})

test('오류 문구 4개 언어', () => {
  const d = (MAIN_DICT as Record<string, Record<string, string>>)['chat.runError']
  for (const l of ['ko', 'en', 'ja', 'zh']) assert.ok(d[l].includes('{error}'))
})

test('도움 요청으로 받은 일: 현재 지시의 부탁한 사람 이름을 붙인다', () => {
  const nameOf = (id: string) => ({ a: '김기획' })[id]
  const help = { kind: 'help', fromId: 'a', text: '사진 추가' }
  assert.equal(buildStaffProgress({ status: 'working', origins: [help], queued: 0, hasApproval: false, nameOf })?.requestedBy, '김기획')
  // 현재(첫) 지시가 도움 요청이 아니면 붙이지 않는다
  assert.equal(buildStaffProgress({ status: 'working', origins: [o('대표 지시'), help], queued: 1, hasApproval: false, nameOf })?.requestedBy, undefined)
  // 부탁한 직원이 없어졌으면 붙이지 않는다
  assert.equal('requestedBy' in buildStaffProgress({ status: 'working', origins: [{ ...help, fromId: 'gone' }], queued: 0, hasApproval: false, nameOf })!, false)
})

test('도움 요청 문구 4개 언어', async () => {
  const B = (await import('../src/shared/i18n/dict/featuresB.ts')).default as Record<string, Record<string, string>>
  for (const k of ['progress.helpFrom', 'approval.requestedBy']) for (const l of ['ko', 'en', 'ja', 'zh']) assert.ok(B[k][l].includes('{name}'))
})

test('대기 메시지: 대화방에서 보낸 것은 그 방을 달고, 방이 없으면 필드를 뺀다', () => {
  const p = buildStaffProgress({ status: 'working', origins: [o('a')], queued: 0, hasApproval: false, waiting: [{ id: 'w1', text: 'b', room: 'lab:x' }, { id: 'w2', text: 'c', room: undefined }] })
  assert.deepEqual(p?.waiting, [{ id: 'w1', text: 'b', room: 'lab:x' }, { id: 'w2', text: 'c' }])
})

// 상태 줄 방 = 보고 게시와 같은 규칙(roomForOrigins) — Office.progressOf와 같은 연결
import { roomForOrigins } from '../src/shared/chatRooms.ts'
import { progressesForRoom } from '../src/shared/progressView.ts'

test('상태 줄 방: 랩 방 지시→랩 방, 단체방 지시→전체 방, 위임 하위 일→리드 지시 방, 패널 지시→소속 방', () => {
  const progressIn = (origin: { kind: string; room?: string; text?: string }, home: string | undefined, waitingRoomOrigin?: { kind: string; room?: string }) => {
    const mapped = [{ ...origin, room: roomForOrigins([origin], () => undefined, home) }]
    const waiting = waitingRoomOrigin ? [{ id: 'w1', text: '대기', room: roomForOrigins([waitingRoomOrigin], () => undefined, home) }] : undefined
    return buildStaffProgress({ status: 'working', origins: mapped, queued: 0, hasApproval: false, waiting })
  }
  const staff = (progress: ReturnType<typeof progressIn>) => [{ id: 's', progress }]
  const lab = progressIn({ kind: 'chat', room: 'lab:L1' }, 'dev')
  const global = progressIn({ kind: 'chat', room: '' }, 'lab:L1')
  const delegated = progressIn({ kind: 'delegate', room: 'lab:L1' }, 'dev')
  const panel = progressIn({ kind: 'user' }, 'lab:L1')
  assert.equal(lab?.room, 'lab:L1')
  assert.equal(global?.room, undefined, '전체 방 = room 없음')
  assert.equal(delegated?.room, 'lab:L1')
  assert.equal(panel?.room, 'lab:L1')
  assert.equal(progressesForRoom(staff(lab), 'lab:L1').length, 1)
  assert.equal(progressesForRoom(staff(lab), undefined).length, 0, '랩 방 일은 단체방에 안 뜬다')
  assert.equal(progressesForRoom(staff(global), undefined).length, 1)
  assert.equal(progressesForRoom(staff(global), 'lab:L1').length, 0, '단체방 일은 랩 방에 안 뜬다')
  const w = progressIn({ kind: 'chat', room: '' }, 'dev', { kind: 'chat', room: 'lab:L1' })
  assert.equal(w?.waiting?.[0]?.room, 'lab:L1')
  assert.equal(progressIn({ kind: 'chat', room: '' }, 'dev', { kind: 'chat', room: '' })?.waiting?.[0]?.room, undefined)
})

test('여러 방의 지시가 섞이면 다른 방 지시도 그 방 상태 줄에 뜬다 (섞이지 않으면 others 없음)', async () => {
  const { progressesForRoom } = await import('../src/shared/progressView.ts')
  const mixed = buildStaffProgress({ status: 'working', origins: [{ text: 'A 일', room: 'tA', chatId: 1 }, { text: '전체 일', room: '', chatId: 2 }, { text: 'A 일 2', room: 'tA', chatId: 3 }], queued: 2, hasApproval: false })!
  assert.deepEqual(mixed.others, [{ text: '전체 일', chatId: 2 }])
  const s = [{ id: 'x', progress: mixed }]
  assert.equal(progressesForRoom(s, 'tA')[0].progress.text, 'A 일')
  const g = progressesForRoom(s, '')
  assert.equal(g.length, 1)
  assert.equal(g[0].progress.text, '전체 일')
  assert.equal(g[0].progress.chatId, 2)
  assert.equal(progressesForRoom(s, 'tB').length, 0)
  const plain = buildStaffProgress({ status: 'working', origins: [{ text: 'A', room: 'tA' }, { text: 'B', room: 'tA' }], queued: 1, hasApproval: false })!
  assert.equal(plain.others, undefined)
})
