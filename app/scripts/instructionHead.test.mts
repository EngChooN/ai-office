// 지시 글 화면용 나누기: 머리말·제목·보고 안내 줄 (순수 함수)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import staff from '../src/shared/i18n/dict/staff.ts'
import { splitInstruction } from '../src/shared/instructionHead.ts'

const LANGS = ['ko', 'en', 'ja', 'zh'] as const
const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? `{${k}}`)
// office.ts와 같은 방식으로 조립한다
const help = (l: (typeof LANGS)[number], from: string, text: string, extra: { leader?: boolean; cwd?: string } = {}) =>
  fill(staff['staff.msg.helpRequest'][l], { from, text }) +
  (extra.leader ? `\n${staff['staff.msg.helpLeaderOptions'][l]}` : '') +
  (extra.cwd ? `\n${fill(staff['staff.msg.sameFolder'][l], { from, cwd: extra.cwd })}` : '')
const delegated = (l: (typeof LANGS)[number], lead: string, instruction: string) => fill(staff['staff.msg.delegated'][l], { lead, instruction })
// StaffPanel.tsx와 같은 방식 (한국어 고정)
const manual = (name: string, body: string) => `[업무 매뉴얼: ${name}] "${name}" 스킬(매뉴얼)을 사용해서 처리해 주세요.${body ? `\n${body}` : ''}`

test('도움 요청: 4개 언어 모두 보낸 사람·제목·본문·보고 대상', () => {
  for (const l of LANGS) {
    const r = splitInstruction(help(l, '정리드', '[로그인 버그] 로그인 화면이 멈춰요.\n재현 순서는 아래와 같아요.'))
    assert.deepEqual(r, { source: { kind: 'help', name: '정리드' }, title: '로그인 버그', body: '로그인 화면이 멈춰요.\n재현 순서는 아래와 같아요.', reportTo: '정리드' }, l)
  }
})

test('도움 요청: 보고 줄 뒤에 리더 간 선택지·같은 폴더 안내가 붙어도 보고 줄만 빠진다', () => {
  for (const l of LANGS) {
    const r = splitInstruction(help(l, 'Alex Kim', '자료 정리', { leader: true, cwd: '/tmp/work' }))
    assert.equal(r.reportTo, 'Alex Kim', l)
    assert.equal(r.source?.name, 'Alex Kim', l)
    assert.equal(r.title, undefined, l)
    const lines = r.body.split('\n')
    assert.equal(lines[0], '자료 정리', l)
    assert.equal(lines[1], staff['staff.msg.helpLeaderOptions'][l], l)
    assert.equal(lines[2], fill(staff['staff.msg.sameFolder'][l], { from: 'Alex Kim', cwd: '/tmp/work' }), l)
    assert.equal(lines.length, 3, l)
  }
})

test('위임 지시: 4개 언어 모두, 보고 줄 없음', () => {
  for (const l of LANGS) {
    assert.deepEqual(splitInstruction(delegated(l, '박팀장', '[배너 교체] 메인 배너를 바꿔 주세요')), { source: { kind: 'delegated', name: '박팀장' }, title: '배너 교체', body: '메인 배너를 바꿔 주세요' }, l)
    assert.deepEqual(splitInstruction(delegated(l, '박팀장', '그냥 지시')), { source: { kind: 'delegated', name: '박팀장' }, body: '그냥 지시' }, l)
  }
})

test('매뉴얼 지시: 안내 문장은 빼고 매뉴얼 이름을 source로', () => {
  assert.deepEqual(splitInstruction(manual('feature-flow', '[검색 개선] 검색창을 고쳐 주세요')), { source: { kind: 'manual', name: 'feature-flow' }, title: '검색 개선', body: '검색창을 고쳐 주세요' })
  assert.deepEqual(splitInstruction(manual('fix-qa', '')), { source: { kind: 'manual', name: 'fix-qa' }, body: '' })
  assert.deepEqual(splitInstruction(manual('주간 보고', '여러 줄\n본문')), { source: { kind: 'manual', name: '주간 보고' }, body: '여러 줄\n본문' })
})

test('제목 아님: 다른 머리말·마크다운 링크·80자 초과·다음 줄', () => {
  const nested = delegated('ko', '정리드', manual('fix-qa', '버그 고치기'))
  const r = splitInstruction(nested)
  assert.equal(r.source?.kind, 'delegated')
  assert.equal(r.title, undefined)
  assert.equal(r.body, manual('fix-qa', '버그 고치기'))
  assert.equal(splitInstruction(delegated('en', 'Lee', '[Instruction from Kim] do it')).title, undefined, '다른 언어 머리말')

  const link = splitInstruction(delegated('ko', '정리드', '[문서](https://example.com) 읽어 주세요'))
  assert.equal(link.title, undefined)
  assert.equal(link.body, '[문서](https://example.com) 읽어 주세요')

  const long = 'x'.repeat(81)
  assert.equal(splitInstruction(delegated('ko', '정리드', `[${long}] 본문`)).title, undefined)
  assert.equal(splitInstruction(delegated('ko', '정리드', `[${'x'.repeat(80)}] 본문`)).title, 'x'.repeat(80))

  const nextLine = splitInstruction('[정리드의 지시]\n[제목] 본문')
  assert.equal(nextLine.title, undefined)
  assert.equal(nextLine.body, '[제목] 본문')
})

test('머리말이 없거나 맨 앞이 아니면 원문 그대로', () => {
  for (const s of ['로그인 고쳐 주세요', '[제목만] 대표가 쓴 지시', ` ${delegated('ko', 'A', 'x')}`, `메모\n${help('ko', 'A', 'x')}`, '', '[]', '[의 지시] 이름 없음']) {
    assert.deepEqual(splitInstruction(s), { body: s }, JSON.stringify(s))
  }
})

test('이상한 입력에도 던지지 않는다', () => {
  assert.deepEqual(splitInstruction(undefined as unknown as string), { body: '' })
  assert.deepEqual(splitInstruction(null as unknown as string), { body: '' })
  assert.deepEqual(splitInstruction(42 as unknown as string), { body: '42' })
  assert.deepEqual(splitInstruction('[업무 매뉴얼: a.b(c)*] "a.b(c)*" 스킬(매뉴얼)을 사용해서 처리해 주세요.\n본문'), { source: { kind: 'manual', name: 'a.b(c)*' }, body: '본문' })
  // 보고 줄이 한 줄 전체가 아니면 본문에 남긴다
  const inline = splitInstruction('[A의 도움 요청] 글 (끝나면 결과를 A에게 보고하세요) 뒤')
  assert.equal(inline.reportTo, undefined)
  assert.equal(inline.body, '글 (끝나면 결과를 A에게 보고하세요) 뒤')
})
