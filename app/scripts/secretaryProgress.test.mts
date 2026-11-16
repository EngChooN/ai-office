// 비서가 상한에 걸려 멈춤: 어디까지 했는지 · [이어서 하기] 줄지 · 누를 수 있는지 · 이어 하기 프롬프트 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { LANGS, t } from '../src/shared/i18n/index.ts'
import { addStep, canOfferResume, isResumable, markResumeUsed, MAX_RESUMES, mergeSteps, nextResume, parseResume, progressText, resumePrompt, startsWork, stopNotice, toolKind, type SecretaryResume } from '../src/shared/secretaryProgress.ts'

test('도구 이름 → 진행 종류', () => {
  assert.equal(toolKind('mcp__secretary__propose'), 'card')
  assert.equal(toolKind('mcp__secretary__propose_edit'), 'card')
  assert.equal(toolKind('mcp__secretary__arrange_office'), 'card')
  assert.equal(toolKind('mcp__secretary__read_guide'), 'guide')
  assert.equal(toolKind('mcp__secretary__read_manual'), 'guide')
  assert.equal(toolKind('WebSearch'), 'web')
  assert.equal(toolKind('WebFetch'), 'web')
  assert.equal(toolKind('mcp__secretary__overview'), 'look')
  assert.equal(toolKind('mcp__secretary__read'), 'look')
  assert.equal(toolKind('staff_detail'), 'look')
})

test('도구 수 세기·합치기 — 0인 종류는 남기지 않는다', () => {
  const a = addStep(addStep({}, 'look'), 'look')
  assert.deepEqual(a, { look: 2 })
  assert.deepEqual(mergeSteps(a, { card: 1 }), { look: 2, card: 1 })
  assert.deepEqual(mergeSteps({}, {}), {})
})

test('진행 줄: 한국어·영어, 한 일이 없으면 빈 글', () => {
  assert.equal(progressText({ look: 3, card: 1 }, 'ko'), '사무실 조회 3번 · 확인 카드 만들기 1번 했어요.')
  assert.equal(progressText({ web: 2 }, 'en'), 'searched the web 2×.')
  assert.equal(progressText({}, 'ko'), '')
})

test('이어 하기 정보: 앞 시도의 한 일·카드에 이어 붙이고 원래 질문을 지킨다', () => {
  const first = nextResume(null, '팀별로 정리해 줘', { look: 5 }, ['카드 A'])
  assert.deepEqual(first, { question: '팀별로 정리해 줘', steps: { look: 5 }, cards: ['카드 A'], round: 1 })
  const second = nextResume({ ...first, used: true }, '무시되는 글', { look: 2, card: 1 }, ['카드 B'])
  assert.deepEqual(second, { question: '팀별로 정리해 줘', steps: { look: 7, card: 1 }, cards: ['카드 A', '카드 B'], round: 2 })
})

test('버튼은 진전이 있고 이어 하기가 남았을 때만 (최대 2번)', () => {
  const r = (round: number): SecretaryResume => ({ question: 'q', steps: { look: 1 }, cards: [], round })
  assert.equal(MAX_RESUMES, 2)
  assert.equal(canOfferResume(r(1), 3), true)
  assert.equal(canOfferResume(r(2), 3), true)
  assert.equal(canOfferResume(r(3), 3), false)
  assert.equal(canOfferResume(r(1), 0), false, '도구를 한 번도 못 썼으면 같은 자리에서 돈만 쓰므로 버튼 없음')
})

test('멈춘 안내 글: 이어 하기 있음 / 다 씀 / 한 일 없음', () => {
  const r: SecretaryResume = { question: 'q', steps: { look: 2 }, cards: [], round: 1 }
  const done = progressText(r.steps)
  assert.equal(stopNotice(r, true), t('secretary.resume.stopped', { done }))
  assert.equal(stopNotice(r, false), t('secretary.resume.stoppedSplit', { done }))
  assert.equal(stopNotice({ ...r, steps: {} }, true), t('secretary.resume.stoppedPlain'))
})

test('누를 수 있는지: 안 눌렀고 그 뒤 새 질문이 없을 때만 (화면·PC 같은 판단)', () => {
  const resume: SecretaryResume = { question: 'q', steps: { look: 1 }, cards: [], round: 1 }
  const base = [
    { id: 1, role: 'me' },
    { id: 2, role: 'secretary' },
    { id: 3, role: 'notice', resume },
  ]
  assert.equal(isResumable(base, 3), true)
  assert.equal(isResumable([...base, { id: 4, role: 'secretary' }], 3), true, '비서 글(예: 아침 요약)이 뒤에 와도 그대로')
  assert.equal(isResumable([...base, { id: 4, role: 'me' }], 3), false, '새 질문을 하면 꺼진다')
  assert.equal(isResumable([base[0], base[1], { id: 3, role: 'notice', resume: { ...resume, used: true } }], 3), false, '한 번 누르면 끝')
  assert.equal(isResumable(base, 2), false, '안내가 아닌 메시지')
  assert.equal(isResumable(base, 99), false, '없는 메시지')
  assert.equal(isResumable([{ id: 3, role: 'notice' }], 3), false, '이어 하기 정보가 없는 안내')
})

test('이어 하기 프롬프트: 원래 질문·한 일·만든 카드(다시 만들지 말 것)', () => {
  const p = resumePrompt({ question: '팀별로 정리해 줘', steps: { look: 4, card: 1 }, cards: ['오래된 카드 닫기'], round: 1 })
  assert.match(p, /팀별로 정리해 줘/)
  assert.match(p, /사무실 조회 4번 · 확인 카드 만들기 1번 했어요\./)
  assert.match(p, /"오래된 카드 닫기" — 같은 카드를 다시 만들지 않습니다/)
  assert.doesNotMatch(resumePrompt({ question: 'q', steps: { look: 1 }, cards: [], round: 1 }), /이미 만든 확인 카드/)
})

test('썼음 표시: 안 쓴 안내만 바꾸고, 실제 시작(답 글·도구)일 때만', () => {
  const resume: SecretaryResume = { question: 'q', steps: { look: 1 }, cards: [], round: 1 }
  const msgs = [{ id: 1, role: 'me' }, { id: 3, role: 'notice', resume }]
  const next = markResumeUsed(msgs, 3)
  assert.equal(next?.resume?.used, true)
  assert.equal(msgs[1].resume.used, undefined, '원본은 그대로')
  assert.equal(markResumeUsed([{ id: 3, role: 'notice', resume: { ...resume, used: true } }], 3), null, '이미 썼으면 그대로')
  assert.equal(markResumeUsed(msgs, 1), null, '이어 하기 정보 없는 메시지')
  assert.equal(markResumeUsed(msgs, 99), null, '지워진 안내')
  assert.equal(startsWork('text'), true)
  assert.equal(startsWork('tool'), true)
  assert.equal(startsWork('result'), false, '오류·한도 결과만 오면 시작 안 한 것 — 버튼을 남긴다')
})

test('비서: [이어서 하기]는 누를 때가 아니라 실제 시작 때 썼음 — 시작 전 실패·멈춤·지우기면 버튼이 남는다', () => {
  const src = fs.readFileSync(new URL('../src/main/secretary.ts', import.meta.url), 'utf8')
  const resume = src.slice(src.indexOf('  resume(noticeId: number)'), src.indexOf('  private resumeStarted()'))
  assert.doesNotMatch(resume, /used: true|updateSecretaryMessage/, 'resume()에서 바로 썼음으로 저장하지 않는다')
  assert.match(resume, /this\.pendingResumeId = noticeId/)
  assert.match(src, /if \(this\.pendingResumeId !== null && startsWork\(m\.type\)\) this\.resumeStarted\(\)/)
  const close = src.slice(src.indexOf('  private closeSession()'), src.indexOf('  private async next()'))
  assert.match(close, /this\.pendingResumeId = null/, '멈춤·대화 지우기면 기다리던 이어 하기를 버린다')
})

test('저장된 이어 하기 정보가 깨져도 읽기는 계속 (버튼만 빠짐)', () => {
  const r: SecretaryResume = { question: 'q', steps: { look: 2 }, cards: ['a'], round: 1, used: true }
  assert.deepEqual(parseResume(JSON.stringify(r)), r)
  assert.equal(parseResume('{"question":'), undefined, '깨진 JSON')
  assert.equal(parseResume('null'), undefined)
  assert.equal(parseResume('{"question":"q"}'), undefined, '모양이 다름')
  const db = fs.readFileSync(new URL('../src/main/db.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(db, /JSON\.parse\(r\.resume\)/, 'db.ts는 parseResume을 거친다')
})

test('이어 하기 프롬프트: 원 질문이 앞 대화에 이미 있으면 긴 질문은 앞부분만 가리킨다', () => {
  const long = '팀별로 이번 주에 끝난 일과 막힌 일을 나눠서 정리하고, 막힌 일마다 누가 도와줄 수 있는지도 같이 알려 줘'
  const r: SecretaryResume = { question: long, steps: { look: 1 }, cards: [], round: 1 }
  assert.match(resumePrompt(r), new RegExp(long))
  const p = resumePrompt(r, true)
  assert.doesNotMatch(p, new RegExp(long), '전체를 다시 싣지 않는다')
  assert.match(p, new RegExp(`앞 대화에 있는 "${long.slice(0, 40)}…"로 시작하는 질문`))
  assert.match(resumePrompt({ ...r, question: '짧은 질문' }, true), /이어서 하기\): 짧은 질문/, '짧으면 그대로')
})

test('새 문구는 4개 언어 모두 있다', () => {
  for (const key of ['secretary.resume.stopped', 'secretary.resume.stoppedSplit', 'secretary.resume.stoppedPlain', 'secretary.resume.button', 'secretary.resume.busy', 'secretary.resume.gone', 'secretary.resume.kind.look', 'secretary.resume.kind.card'] as const)
    for (const lang of LANGS) assert.ok(t(key, { done: 'x', n: 1 }, lang).length > 0, `${key} ${lang}`)
})

test('비서: 한도 24턴·$1, 글로 끝났으면 안내 없음, 멈춤은 addStopNotice로', () => {
  const src = fs.readFileSync(new URL('../src/main/secretary.ts', import.meta.url), 'utf8')
  assert.match(src, /const MAX_TURNS = 24\b/)
  assert.match(src, /const TURN_BUDGET_USD = 1\.0\b/)
  assert.match(src, /if \(!this\.endedWithText\) this\.addStopNotice\(\)/)
  assert.doesNotMatch(src, /나눠서 물어봐 주세요/, '안내 문구는 4개 언어 사전으로')
})
