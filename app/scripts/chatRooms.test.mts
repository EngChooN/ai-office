// 팀 대화방(#5): 방 목록·참여자·방 범위 멘션·받는 사람·결과 방·전체 방 요약 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendChat, chatLines, originRoom, pickRoomResponder, roomMembers, roomMentionTargets, roomTeams } from '../src/shared/chatRooms.ts'
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
