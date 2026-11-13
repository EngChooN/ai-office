// 대화방 메신저를 두 비서에 (④): sendChat 인자 순서·확인 카드의 받는 방·방식·답장 · chatHistory 방 이름 · 펫 방 보내기 'wait' · 펫 줄의 원본 참조 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { describeStep } from '../src/main/secretaryDescribe.ts'
import { compactChatHistory } from '../src/main/secretaryCompact.ts'
import { roomFeed } from '../src/shared/deskPet.ts'
import { SECRETARY_SIGNATURES } from '../src/shared/secretaryTools.ts'
import type { ChatMessage } from '../src/shared/types.ts'

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const names: Record<string, string> = { 'team-d': '디자인팀', 'lab-1': '오피스 랩', 'chat:42': '"시안 봐 주세요"' }
const nameOf = (id: string) => names[id] ?? null

test('sendChat 인자 모양은 실제 함수 순서 (text, attachments, room, mode, replyTo)', () => {
  assert.match(SECRETARY_SIGNATURES.sendChat ?? '', /^\(text, attachments: \[\][^,]*, room: [^]*mode: "wait"[^]*\|"now"[^]*replyTo\?/)
  assert.match(read('src/main/officeHandlers.ts'), /sendChat: async \(text: string, attachments\?: [^,]+, room\?: string, mode\?: string, replyTo\?: number\)/)
  assert.match(read('src/main/secretary.ts'), /'sendChat'/)
})

test('확인 카드: 받는 방(팀·프로젝트·전체·없어진 방) · 보내는 방식 · 답장할 글', () => {
  const team = describeStep('sendChat', ['안녕', [], 'team-d', 'wait'], nameOf)
  assert.match(team, /보낼 말: "안녕"/)
  assert.match(team, /받는 방: 디자인팀/)
  assert.match(team, /하던 일이 끝나면 전해요/)
  assert.match(describeStep('sendChat', ['x', [], 'lab:lab-1', 'now'], nameOf), /받는 방: 오피스 랩[\s\S]*지금 끼어들어/)
  assert.match(describeStep('sendChat', ['x'], nameOf), /받는 방: 전체 방[\s\S]*바로 보내요/)
  assert.match(describeStep('sendChat', ['x', [], null, 'wait'], nameOf), /받는 방: 전체 방/)
  assert.match(describeStep('sendChat', ['x', [], 'team-gone', 'wait'], nameOf), /없어진 방 — 전체 방으로 가요/)
  assert.match(describeStep('sendChat', ['x', [], 'team-d', 'wait', 42], nameOf), /답장할 글: "시안 봐 주세요"/)
  assert.match(describeStep('sendChat', ['x', [], 'team-d', 'wait', 7], nameOf), /답장할 글: #7/)
})

test('chatHistory 요약: 글마다 방 이름과 #번호', () => {
  const msgs = [
    { id: 1, from: 'me', text: '전체 공지', room: undefined },
    { id: 2, from: 's1', text: '디자인\n시안', room: 'team-d' },
  ] as ChatMessage[]
  const text = compactChatHistory(msgs, (room) => (room === 'team-d' ? '디자인팀' : '전체 방'), () => '김디자')
  assert.equal(text, '- [전체 방] #1 대표: 전체 공지\n- [디자인팀] #2 김디자: 디자인 시안')
})

test('펫 대화방 줄은 원본 ChatMessage를 싣는다 (답장·처리 상태·반응·첨부를 본 창과 같은 데이터로)', () => {
  const m = { id: 5, ts: 1, from: 'me', text: '부탁해요', room: 'team-d', replyTo: { id: 4, from: 's1', text: '시안' }, deliveries: [] } as unknown as ChatMessage
  const [row] = roomFeed([m], 'team-d', () => '김디자', 10)
  assert.equal(row.kind, 'message')
  assert.equal(row.kind === 'message' && row.chat, m)
})

test('펫: 방에 보낼 때 mode "wait", preload는 방·방식·답장을 버리지 않는다, 답장·처리 상태는 누르지 않는 표시용', () => {
  const panel = read('src/renderer/deskPet/PetPanel.tsx')
  assert.match(panel, /\.sendChat\(text, undefined, current\.room \|\| undefined, "wait"\)/)
  assert.match(panel, /<ReplyQuote[\s\S]*?isStatic/)
  assert.match(panel, /<DeliveryLine message=\{m\} isStatic \/>/)
  assert.match(read('src/petPreload.ts'), /ipcRenderer\.invoke\("office:sendChat", text, undefined, room, mode, replyTo\)/)
  const extras = read('src/renderer/features/ChatExtras.tsx')
  assert.match(extras, /if \(isStatic\) return <div className=\{cls\}>/)
  assert.match(extras, /!isStatic && \(/)
})
