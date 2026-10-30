// 팀·랩 대화방(#5): 방 목록·참여자·방 범위 멘션·받는 사람·결과 방·전체 방 요약·room 구분 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  appendChat,
  chatLines,
  chatRoomMembers,
  chatRoomMentionTargets,
  findRoom,
  labRoomId,
  labRoomMembers,
  labRoomMentionTargets,
  originRoom,
  parseRoom,
  pickRoomResponder,
  roomHead,
  roomLabs,
  roomMembers,
  roomMentionTargets,
  roomTeams,
} from '../src/shared/chatRooms.ts'
import { parseMentions, type ResponderCandidate } from '../src/shared/mention.ts'
import type { ChatMessage } from '../src/shared/types.ts'

const hired = [
  { id: 'kim', name: '김철수', teamId: 'dev' },
  { id: 'lee', name: '이영희', teamId: 'dev' },
  { id: 'park', name: '박디자', teamId: 'design' },
  { id: 'boss', name: '최팀장', teamId: 'design' },
]
const dev = { id: 'dev', name: '개발팀', leadId: 'boss', kind: 'hired' as const }

test('방은 hired 팀만 — project·연습 팀은 방이 없다', () => {
  const teams = [dev, { id: 'p', name: '외부', leadId: null, kind: 'project' as const }, { id: 'x', name: '연습', leadId: null, kind: 'hired' as const, isPractice: true }]
  assert.deepEqual(
    roomTeams(teams).map((t) => t.id),
    ['dev'],
  )
})

test('참여자는 팀 고용 직원 + 팀장 (팀장이 다른 팀 소속이어도)', () => {
  assert.deepEqual(
    roomMembers(dev, hired).map((s) => s.id),
    ['kim', 'lee', 'boss'],
  )
  assert.deepEqual(
    roomMembers({ id: 'dev', leadId: null }, hired).map((s) => s.id),
    ['kim', 'lee'],
  )
})

test('팀 방 멘션: @전체는 팀 전원, @팀원은 그 사람, 방 밖 직원은 멘션이 아니다', () => {
  const targets = roomMentionTargets(dev, hired)
  assert.deepEqual(parseMentions('@전체 회의해요', targets).recipientIds, ['kim', 'lee', 'boss'])
  assert.deepEqual(parseMentions('@이영희 리뷰 부탁', targets).recipientIds, ['lee'])
  const outside = parseMentions('@박디자 도와줘요', targets)
  assert.equal(outside.matched.length, 0)
  assert.equal(outside.body, '@박디자 도와줘요')
  // 다른 팀·랩 이름은 대상이 아니다
  assert.ok(!targets.some((t) => t.kind === 'team' || t.kind === 'lab'))
})

const cand = (id: string, role: string, extra: Partial<ResponderCandidate> = {}): ResponderCandidate => ({ id, role, status: 'idle', isOverBudget: false, isLead: false, ...extra })

test('멘션 없으면 팀장이 받는다 — 직무가 더 맞는 팀원이 있어도', () => {
  const cs = [cand('kim', '프론트엔드 개발자'), cand('boss', '팀장', { status: 'working' })]
  assert.equal(pickRoomResponder('프론트엔드 버그 고쳐 줘', 'boss', cs), 'boss')
})

test('팀장이 없거나 예산을 다 썼으면 방 안에서 pickResponder', () => {
  const cs = [cand('kim', '프론트엔드 개발자'), cand('lee', '백엔드 개발자'), cand('boss', '팀장', { isOverBudget: true })]
  assert.equal(pickRoomResponder('백엔드 API 추가', null, cs), 'lee')
  assert.equal(pickRoomResponder('백엔드 API 추가', 'boss', cs), 'lee')
  // 팀장 id가 방에 없는 사람(해고 등)이어도 방 안에서 고른다
  assert.equal(pickRoomResponder('프론트엔드', 'ghost', cs), 'kim')
  assert.equal(pickRoomResponder('아무거나', null, []), null)
})

test('결과 방: 출처 중 팀 방이 있으면 그 방, 없으면 전체 방', () => {
  assert.equal(originRoom([]), undefined)
  assert.equal(originRoom([{}, { room: undefined }]), undefined)
  assert.equal(originRoom([{}, { room: 'dev' }]), 'dev')
})

const msg = (id: number, room?: string): ChatMessage => ({ id, ts: id * 1000, from: 'me', text: `m${id}`, ...(room ? { room } : {}) })

test('팀 방은 그 방 글만 보여 준다', () => {
  const lines = chatLines([msg(1), msg(2, 'dev'), msg(3, 'design'), msg(4, 'dev')], 'dev')
  assert.deepEqual(
    lines.map((l) => (l.kind === 'message' ? l.message.id : -1)),
    [2, 4],
  )
})

test('전체 방은 팀 방 글을 전체 글 사이 구간마다 방별 "새 글 N개" 한 줄로 접는다', () => {
  const lines = chatLines([msg(1), msg(2, 'dev'), msg(3, 'design'), msg(4, 'dev'), msg(5), msg(6, 'dev')], undefined)
  assert.deepEqual(
    lines.map((l) => (l.kind === 'message' ? `m${l.message.id}` : `${l.room}×${l.count}@${l.firstId}-${l.lastId}`)),
    ['m1', 'dev×2@2-4', 'design×1@3-3', 'm5', 'dev×1@6-6'],
  )
})

test('appendChat: 같은 id는 제자리 교체, 상한은 방마다 따로', () => {
  const base = [msg(1), msg(2, 'dev'), msg(3)]
  const settled = appendChat(base, { ...msg(2, 'dev'), text: 'done' }, 10)
  assert.equal(settled.length, 3)
  assert.equal(settled[1].text, 'done')
  // 전체 방 상한 2 → 전체 방 가장 오래된 1만 빠지고 팀 방 글은 남는다
  const next = appendChat(base, msg(4), 2)
  assert.deepEqual(
    next.map((m) => m.id),
    [2, 3, 4],
  )
  // 팀 방 글이 붙어도 전체 방 글은 밀려나지 않는다
  assert.deepEqual(
    appendChat(base, msg(5, 'dev'), 2).map((m) => m.id),
    [1, 2, 3, 5],
  )
})

// ── 랩 방 ──────────────────────────────────────────────

// 여러 팀에서 뽑은 랩: 리드는 디자인팀 최팀장, 멤버는 개발팀 김철수·디자인팀 박디자, 해고된 ghost
const lab = { id: 'L1', name: '검색개선', leadId: 'boss', memberIds: ['kim', 'park', 'ghost'] }

test('room 구분: 팀 방은 팀 id 그대로(기존 데이터 호환), 랩 방은 lab:<id>', () => {
  assert.equal(labRoomId('L1'), 'lab:L1')
  assert.deepEqual(parseRoom('lab:L1'), { kind: 'lab', id: 'L1' })
  assert.deepEqual(parseRoom('dev'), { kind: 'team', id: 'dev' })
  assert.equal(parseRoom(undefined), undefined)
  assert.equal(parseRoom(null), undefined)
  assert.equal(parseRoom(''), undefined)
  assert.equal(parseRoom('lab:'), undefined)
  // 팀 id와 랩 id가 같아도 다른 방
  const teams = [{ ...dev, id: 'same' }]
  const labs = [{ ...lab, id: 'same' }]
  assert.equal(findRoom('same', teams, labs)?.kind, 'team')
  assert.equal(findRoom('lab:same', teams, labs)?.kind, 'lab')
})

test('findRoom: 없어진 팀·랩, project 팀, 연습 랩은 전체 방(undefined)', () => {
  const labs = [lab, { ...lab, id: 'P', isPractice: true }]
  assert.equal(findRoom('lab:L1', [dev], labs)?.name, '검색개선')
  assert.equal(findRoom('lab:P', [dev], labs), undefined)
  assert.equal(findRoom('lab:nope', [dev], labs), undefined)
  assert.equal(findRoom('dev', [dev], labs)?.kind, 'team')
  assert.equal(findRoom('p', [{ id: 'p', name: '외부', leadId: null, kind: 'project' as const }], labs), undefined)
  assert.equal(findRoom(undefined, [dev], labs), undefined)
})

test('연습 랩은 방을 만들지 않는다', () => {
  assert.deepEqual(
    roomLabs([lab, { ...lab, id: 'P', isPractice: true }]).map((l) => l.id),
    ['L1'],
  )
})

test('랩 방 참여자: 랩 멤버 + 랩 리드 가운데 고용 직원 (여러 팀에서)', () => {
  assert.deepEqual(
    labRoomMembers(lab, hired).map((s) => s.id),
    ['kim', 'park', 'boss'],
  )
  assert.deepEqual(
    labRoomMembers({ leadId: null, memberIds: ['lee'] }, hired).map((s) => s.id),
    ['lee'],
  )
  const info = findRoom('lab:L1', [dev], [lab])!
  assert.deepEqual(
    chatRoomMembers(info, hired).map((s) => s.id),
    ['kim', 'park', 'boss'],
  )
  // 팀 방 정보도 같은 함수로
  assert.deepEqual(
    chatRoomMembers(findRoom('dev', [dev], [lab])!, hired).map((s) => s.id),
    roomMembers(dev, hired).map((s) => s.id),
  )
})

test('랩 방 멘션: @전체는 랩 전원, @멤버는 그 사람, 랩 밖 직원·팀·랩은 대상이 아니다', () => {
  const targets = labRoomMentionTargets(lab, hired)
  assert.deepEqual(parseMentions('@전체 회고해요', targets).recipientIds, ['kim', 'park', 'boss'])
  assert.deepEqual(parseMentions('@박디자 시안 부탁', targets).recipientIds, ['park'])
  const outside = parseMentions('@이영희 도와줘요', targets)
  assert.equal(outside.matched.length, 0)
  assert.equal(outside.body, '@이영희 도와줘요')
  assert.ok(!targets.some((t) => t.kind === 'team' || t.kind === 'lab'))
  assert.deepEqual(
    chatRoomMentionTargets(findRoom('lab:L1', [dev], [lab])!, hired).map((t) => t.key),
    targets.map((t) => t.key),
  )
})

test('랩 방 받는 사람: 멘션 없으면 랩 리드, 리드가 없거나 예산을 다 썼으면 랩 안에서 pickResponder', () => {
  const info = findRoom('lab:L1', [dev], [lab])!
  const cs = [cand('kim', '프론트엔드 개발자'), cand('park', '디자이너'), cand('boss', '팀장', { status: 'working' })]
  assert.equal(pickRoomResponder('디자인 시안', info.leadId, cs), 'boss')
  const over = [cand('kim', '프론트엔드 개발자'), cand('park', '디자이너'), cand('boss', '팀장', { isOverBudget: true })]
  assert.equal(pickRoomResponder('디자이너 시안', info.leadId, over), 'park')
  const noLead = findRoom('lab:L2', [], [{ ...lab, id: 'L2', leadId: null }])!
  assert.equal(noLead.leadId, null)
  assert.equal(pickRoomResponder('프론트엔드 화면', noLead.leadId, cs), 'kim')
})

test('머리말: 팀 방 [팀이름 방], 랩 방 [랩이름 랩]', () => {
  assert.equal(roomHead(findRoom('lab:L1', [dev], [lab])!), '[검색개선 랩]')
  assert.equal(roomHead(findRoom('dev', [dev], [lab])!), '[개발팀 방]')
})

test('결과 방·전체 방 요약: 랩 방도 팀 방과 같이', () => {
  assert.equal(originRoom([{}, { room: 'lab:L1' }]), 'lab:L1')
  const lines = chatLines([msg(1), msg(2, 'lab:L1'), msg(3, 'dev'), msg(4, 'lab:L1'), msg(5)], undefined)
  assert.deepEqual(
    lines.map((l) => (l.kind === 'message' ? `m${l.message.id}` : `${l.room}×${l.count}`)),
    ['m1', 'lab:L1×2', 'dev×1', 'm5'],
  )
  assert.deepEqual(
    chatLines([msg(1), msg(2, 'lab:L1'), msg(3, 'dev')], 'lab:L1').map((l) => (l.kind === 'message' ? l.message.id : -1)),
    [2],
  )
})
