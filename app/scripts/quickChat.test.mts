// 빠른 대화(임시 직원 대화방): 인원 판단·room 구분·제목·목록 순서·전체 방 요약 제외·세션 파일 삭제 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { countsAsStaff, quickRoomId, quickStaffIdOf, quickTitleFrom, sortQuickChats, QUICK_TITLE_MAX } from '../src/shared/quickChat.ts'
import { chatLines, findRoom, parseRoom } from '../src/shared/chatRooms.ts'
import { deleteSessionFile } from '../src/main/quickSession.ts'
import type { ChatMessage } from '../src/shared/types.ts'

test('countsAsStaff: 연습 직원·빠른 대화 임시 직원은 인원으로 세지 않는다', () => {
  assert.equal(countsAsStaff({}), true)
  assert.equal(countsAsStaff({ isPractice: true }), false)
  assert.equal(countsAsStaff({ isQuick: true }), false)
})

test('room: quick:<id>는 빠른 대화 — 팀 방으로 오인하지 않고 팀·랩·단체방을 찾지 않는다', () => {
  const room = quickRoomId('abc')
  assert.equal(quickStaffIdOf(room), 'abc')
  assert.equal(quickStaffIdOf('team-1'), null)
  assert.equal(quickStaffIdOf('quick:'), null)
  assert.equal(quickStaffIdOf(undefined), null)
  assert.deepEqual(parseRoom(room), { kind: 'quick', id: 'abc' })
  // 같은 id의 팀이 있어도 빠른 대화 방은 팀 방이 아니다
  assert.equal(findRoom(room, [{ id: 'abc', name: 'T', leadId: null, kind: 'hired' }], []), undefined)
})

test('제목: 첫 줄 앞부분, 길면 …', () => {
  assert.equal(quickTitleFrom('  엑셀 합계 수식\n둘째 줄'), '엑셀 합계 수식')
  const long = quickTitleFrom('가'.repeat(50))
  assert.equal(long.length, QUICK_TITLE_MAX)
  assert.ok(long.endsWith('…'))
  assert.equal(quickTitleFrom(''), '')
})

test('목록 순서: 빠른 대화만, 진행 중 먼저 · 그 안에서 최근 것 먼저', () => {
  const list = sortQuickChats([
    { id: 'old', isQuick: true, quickClosedAt: 100, hiredAt: 1 },
    { id: 'staff', hiredAt: 999 },
    { id: 'open1', isQuick: true, quickClosedAt: null, hiredAt: 50 },
    { id: 'new', isQuick: true, quickClosedAt: 300, hiredAt: 2 },
    { id: 'open2', isQuick: true, hiredAt: 80 },
  ] as { id: string; isQuick?: boolean; quickClosedAt?: number | null; hiredAt: number }[])
  assert.deepEqual(list.map((s) => s.id), ['open2', 'open1', 'new', 'old'])
})

test('전체 방: 빠른 대화 글은 요약 줄로도 나오지 않는다 (빠른 대화 방 안에서는 보인다)', () => {
  const m = (id: number, room?: string) => ({ id, ts: id, from: 'me', text: String(id), ...(room ? { room } : {}) }) as ChatMessage
  const msgs = [m(1), m(2, quickRoomId('x')), m(3, 'team-1'), m(4, quickRoomId('x'))]
  const all = chatLines(msgs, undefined)
  assert.equal(all.length, 2)
  assert.ok(all.every((l) => l.kind === 'message' || l.room === 'team-1'))
  assert.deepEqual(chatLines(msgs, quickRoomId('x')).map((l) => (l.kind === 'message' ? l.message.id : 0)), [2, 4])
})

test('세션 파일 삭제: Claude·Codex 기록 폴더 안 파일만 지우고, 없으면 오류 없이 missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-home-'))
  try {
    const claudeDir = path.join(home, '.claude', 'projects', '-Users-me-work')
    fs.mkdirSync(claudeDir, { recursive: true })
    const claudeFile = path.join(claudeDir, 'sess-1.jsonl')
    fs.writeFileSync(claudeFile, '{}\n')
    const codexDir = path.join(home, '.codex', 'sessions', '2026', '11', '26')
    fs.mkdirSync(codexDir, { recursive: true })
    const codexFile = path.join(codexDir, 'rollout-2026-11-26T10-00-00-thread-9.jsonl')
    fs.writeFileSync(codexFile, '{}\n')
    // 다른 세션 파일은 남는다
    const other = path.join(claudeDir, 'sess-2.jsonl')
    fs.writeFileSync(other, '{}\n')
    // Claude 세션 옆 같은 이름 폴더(도우미·도구 결과)도 함께 지운다
    const side = path.join(claudeDir, 'sess-1', 'subagents')
    fs.mkdirSync(side, { recursive: true })
    fs.writeFileSync(path.join(side, 'a.jsonl'), '{}\n')

    assert.equal(deleteSessionFile('claude', 'sess-1', home), 'deleted')
    assert.equal(fs.existsSync(path.join(claudeDir, 'sess-1')), false)
    assert.equal(fs.existsSync(claudeFile), false)
    assert.equal(fs.existsSync(other), true)
    assert.equal(deleteSessionFile('codex', 'thread-9', home), 'deleted')
    assert.equal(fs.existsSync(codexFile), false)
    // 없는 세션·경로를 흉내 낸 id는 지우지 않는다
    assert.equal(deleteSessionFile('claude', 'missing', home), 'missing')
    assert.equal(deleteSessionFile('claude', '../sess-2', home), 'missing')
    assert.equal(deleteSessionFile('claude', '', home), 'missing')
    assert.equal(fs.existsSync(other), true)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('세션 파일 삭제: 기록 폴더 안 하위 폴더가 바깥을 가리키는 연결이면 지우지 않는다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-home-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-outside-'))
  try {
    const victim = path.join(outside, 'sess-x.jsonl')
    fs.writeFileSync(victim, '{}\n')
    fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true })
    fs.symlinkSync(outside, path.join(home, '.claude', 'projects', 'linked'))
    assert.equal(deleteSessionFile('claude', 'sess-x', home), 'missing')
    assert.equal(fs.existsSync(victim), true)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

test('세션 파일 삭제: 옆 폴더를 못 지우면 failed, 기록 파일이 먼저 지워졌어도 다시 지우면 옆 폴더까지 지운다', { skip: process.getuid?.() === 0 }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-home-'))
  const dir = path.join(home, '.claude', 'projects', '-p')
  const side = path.join(dir, 'sess-1')
  const locked = path.join(side, 'subagents')
  try {
    fs.mkdirSync(locked, { recursive: true })
    fs.writeFileSync(path.join(dir, 'sess-1.jsonl'), '{}\n')
    fs.writeFileSync(path.join(locked, 'a.jsonl'), '{}\n')
    fs.chmodSync(locked, 0o500) // 안쪽 파일을 못 지우게
    assert.equal(deleteSessionFile('claude', 'sess-1', home), 'failed')
    fs.chmodSync(locked, 0o700)
    assert.equal(deleteSessionFile('claude', 'sess-1', home), 'deleted')
    assert.equal(fs.existsSync(side), false)
    assert.equal(deleteSessionFile('claude', 'sess-1', home), 'missing')
  } finally {
    if (fs.existsSync(locked)) fs.chmodSync(locked, 0o700)
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('세션 파일 삭제: 프로젝트 폴더를 못 열면 없는 것으로 치지 않고 failed, 권한을 되돌리면 지운다', { skip: process.getuid?.() === 0 }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-home-'))
  const dir = path.join(home, '.claude', 'projects', '-p')
  try {
    fs.mkdirSync(path.join(dir, 'sess-1'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'sess-1.jsonl'), '{}\n')
    fs.chmodSync(dir, 0o000)
    assert.equal(deleteSessionFile('claude', 'sess-1', home), 'failed')
    fs.chmodSync(dir, 0o700)
    assert.equal(deleteSessionFile('claude', 'sess-1', home), 'deleted')
    assert.equal(fs.existsSync(path.join(dir, 'sess-1')), false)
    assert.equal(fs.existsSync(path.join(dir, 'sess-1.jsonl')), false)
  } finally {
    if (fs.existsSync(dir)) fs.chmodSync(dir, 0o700)
    fs.rmSync(home, { recursive: true, force: true })
  }
})
