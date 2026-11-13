// 바탕화면 비서 결재 카드 ⋯ 메뉴(③): 자동 승인 판단 공유·main 확인 창·일 멈추기 · ⌘K 결재 요약 · 펼침 창 다시 칠하기 · 레트로 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { alwaysApproveConfirm, alwaysApproveOffer } from '../src/shared/approvalRules.ts'
import { canPetStopWork, InFlight, petApproveAlways, petStopWork } from '../src/shared/deskPet.ts'
import { compactOverview } from '../src/main/secretaryCompact.ts'
import { tk } from '../src/shared/i18n/index.ts'
import type { Approval, OfficeSnapshot, Staff } from '../src/shared/types.ts'

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const approval = (id: string, extra: Partial<Approval> = {}): Approval => ({ id, staffId: 's1', toolName: 'Read', summary: 'a.txt', createdAt: 1, ...extra })
const staffWith = (approvals: Approval[], kind: Staff['kind'] = 'hired') => [{ id: 's1', kind, name: '김직원', role: '개발', approvals } as unknown as Staff]
const RULE = { toolName: 'Read', patterns: [] }
const staffAt = (kind: Staff['kind'], status: Staff['status']) => [{ ...staffWith([], kind)[0], status }]

test('alwaysApproveOffer: 브라우저는 PC에서만, 규칙은 있을 때만, 명령 규칙은 휴대폰에서 없음', () => {
  assert.deepEqual(alwaysApproveOffer({ browserAutoOffer: true }, false), { kind: 'browser' })
  assert.equal(alwaysApproveOffer({ browserAutoOffer: true }, true), null)
  assert.equal(alwaysApproveOffer({}, false), null)
  assert.equal(alwaysApproveOffer({ alwaysRule: RULE }, false)?.kind, 'rule')
  assert.equal(alwaysApproveOffer({ alwaysRule: RULE }, true)?.kind, 'rule')
  assert.equal(alwaysApproveOffer({ alwaysRule: { toolName: 'Bash', patterns: ['npm test'] } }, true), null)
  assert.equal(alwaysApproveOffer({ alwaysRule: { toolName: 'Bash', patterns: ['npm test'] } }, false)?.kind, 'rule')
  assert.match(alwaysApproveConfirm({ kind: 'browser' }, '김직원'), /김직원/)
})

test('본 창 버튼도 같은 판단 함수를 쓴다 (복사하지 않는다)', () => {
  const src = read('src/renderer/features/AutoApprove.tsx')
  assert.match(src, /alwaysApproveOffer\(approval, IS_REMOTE_SCREEN\)/)
  assert.match(src, /alwaysApproveConfirm\(offer, staffName\)/)
})

test('펫 자동 승인: 확인 → 처리, 취소면 처리 안 함, 규칙 없으면 none, 질문·없는 결재는 거름, 확인 사이 처리되면 already', async () => {
  const calls: string[] = []
  let pending = [approval('a1', { alwaysRule: RULE })]
  let answer = true
  const deps = {
    staff: () => staffWith(pending),
    approveAlways: (id: string) => (calls.push(id), true),
    confirm: async (offer: { kind: string }, name: string) => (calls.push(`confirm:${offer.kind}:${name}`), answer),
    inFlight: new InFlight(),
  }
  assert.equal(await petApproveAlways(deps, 'a1'), 'done')
  assert.deepEqual(calls, ['confirm:rule:김직원', 'a1'])
  calls.length = 0
  answer = false
  assert.equal(await petApproveAlways(deps, 'a1'), 'cancelled')
  assert.deepEqual(calls, ['confirm:rule:김직원'])
  pending = [approval('a1')]
  assert.equal(await petApproveAlways(deps, 'a1'), 'none')
  pending = [approval('q1', { alwaysRule: RULE, questions: [{ question: '?', header: 'h', options: [], multiSelect: false }] })]
  assert.equal(await petApproveAlways(deps, 'q1'), 'question')
  assert.equal(await petApproveAlways(deps, 'zz'), 'already')
  // 확인 창이 떠 있는 사이 다른 곳(앱·휴대폰)에서 처리됨
  calls.length = 0
  pending = [approval('a1', { alwaysRule: RULE })]
  const racing = { ...deps, confirm: async () => ((pending = []), true) }
  assert.equal(await petApproveAlways(racing, 'a1'), 'already')
  assert.deepEqual(calls, [])
})

test('펫 일 멈추기: 고용 직원만, 확인을 거쳐서', async () => {
  const calls: string[] = []
  let ok = true
  const deps = (kind: Staff['kind'], status: Staff['status'] = 'working') => ({ staff: () => staffAt(kind, status), interrupt: (id: string) => void calls.push(id), confirm: async () => ok })
  assert.equal(await petStopWork(deps('hired'), 's1'), 'done')
  // 쉬는 직원은 확인 창도 띄우지 않는다
  let asked = 0
  assert.equal(await petStopWork({ ...deps('hired', 'idle'), confirm: async () => (asked++, true) }, 's1'), 'already')
  assert.equal(asked, 0)
  assert.equal(await petStopWork(deps('external'), 's1'), 'already')
  assert.equal(await petStopWork(deps('hired'), 'nobody'), 'already')
  ok = false
  assert.equal(await petStopWork(deps('hired'), 's1'), 'cancelled')
  assert.deepEqual(calls, ['s1'])
})

test('일 멈추기는 일하는 중(결재·인터넷 대기 포함)인 고용 직원만 — ⋯ 메뉴도 같은 판단으로 숨긴다', () => {
  for (const status of ['working', 'waiting', 'netWait'] as const) assert.equal(canPetStopWork(staffAt('hired', status), 's1'), true, status)
  for (const status of ['idle', 'offline', 'error'] as const) assert.equal(canPetStopWork(staffAt('hired', status), 's1'), false, status)
  assert.equal(canPetStopWork(staffAt('external', 'working'), 's1'), false)
  assert.equal(canPetStopWork(staffAt('hired', 'working'), 'nobody'), false)
  const src = read('src/renderer/deskPet/PetPanel.tsx')
  assert.match(src, /canPetStopWork\(s\.staff, a\.staffId\)/)
  assert.match(src, /\.\.\.\(canStop\s*\?\s*\[\s*\{\s*key: "stop"/)
})

test('펫 통로: 두 개만 열고, 펫 창이 보낸 것·글자 id만, 확인은 main 확인 창(dialog)', () => {
  const win = read('src/main/petWindow.ts')
  assert.match(win, /PET_HANDLERS = \['pet:decide', 'pet:answer', 'pet:skip', 'pet:approveAlways', 'pet:stopWork'\]/)
  for (const ch of ['pet:approveAlways', 'pet:stopWork']) assert.match(win, new RegExp(`ipcMain\\.handle\\('${ch}', \\(e, \\w+: unknown\\) => \\{\\n\\s+if \\(!this\\.isMine\\(e\\) \\|\\| typeof \\w+ !== 'string'\\) return 'already'`))
  assert.match(win, /dialog\.showMessageBox/)
  const preload = read('src/petPreload.ts')
  assert.match(preload, /ipcRenderer\.invoke\("pet:approveAlways", approvalId\)/)
  assert.match(preload, /ipcRenderer\.invoke\("pet:stopWork", staffId\)/)
  // 펼침 창 화면은 window.confirm을 쓰지 않는다
  assert.doesNotMatch(read('src/renderer/deskPet/PetPanel.tsx'), /window\.confirm/)
})

test('테마를 바꾸면 펼침 창 바탕도 다시 칠한다', () => {
  assert.match(read('src/main/index.ts'), /function paintWindowChrome\(\) \{\n\s+pet\.repaint\(\)/)
  assert.match(read('src/main/petWindow.ts'), /repaint\(\) \{\n\s+if \(this\.panel && !this\.panel\.isDestroyed\(\)\) this\.panel\.setBackgroundColor\(this\.deps\.background\(\)\)/)
})

test('⌘K 결재 요약: 효과 문장이 있으면 카드 제목과 같은 문장, 없으면 도구: 원문', () => {
  const withEffect = approval('e1', { toolName: 'Write', summary: '/tmp/x.ts', effectI18n: tk('approval.effect.fileWrite', { path: '/tmp/x.ts' }) })
  const plain = approval('p1', { toolName: 'Read', summary: 'a.txt' })
  const s = { ...staffWith([withEffect, plain])[0], status: 'waiting', statusSince: 0, activity: '', teamId: null, provider: 'claude', labIds: [] } as unknown as Staff
  const snap = { staff: [s], teams: [], labs: [], tasks: [], schedules: [], settings: {}, autoApprove: { isActive: false, counts: {} } } as unknown as OfficeSnapshot
  const text = compactOverview(snap, 'approvals')
  assert.match(text, /\[e1\] 김직원 · .*x\.ts.* \(Write\)/)
  assert.doesNotMatch(text, /\[e1\] 김직원 · Write: /)
  assert.match(text, /\[p1\] 김직원 · Read: a\.txt/)
})

test('레트로: 펼침 창 규칙도 [data-theme=retro] 아래에만', () => {
  const css = read('src/renderer/theme-retro.css')
  for (const sel of ['.pet-panel > header', '.pet-panel .pet-card', '.pet-panel .pet-bubble', '.pet-panel .pet-chip', '.pet-composer']) assert.ok(css.includes(`[data-theme='retro'] ${sel}`), sel)
})
