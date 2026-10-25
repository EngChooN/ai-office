// 회의 결정 저장·보정·문구 단위 테스트 (docs/specs/meeting-collab-sprint.md 3절 확인 시나리오) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decisionLines,
  decisionSections,
  decisionSectionsOf,
  withDecisionSections,
  decisionsContext,
  decisionView,
  pendingMeetingDecisions,
  parseDelegatedChoice,
  recordAnswer,
  recordDelegated,
  splitDecision,
} from '../src/shared/meetingDecisions.ts'
import type { MeetingDecision } from '../src/shared/types.ts'

const decision = (over: Partial<MeetingDecision> = {}): MeetingDecision => ({
  id: 'd1',
  askedBy: 's1',
  askedByName: '김기획',
  question: '이번 스프린트 범위는?',
  options: ['A', 'B'],
  answer: null,
  ts: 1,
  ...over,
})
const live = { status: 'running' as const }
const done = { status: 'done' as const }

// ── 완료 기준 1: 질문 원문 ──

test('줄 맨 앞의 [결정 요청]만 결정으로 잡고, 질문을 자르지 않고 원문 줄을 raw로 남긴다', () => {
  const r = splitDecision('범위가 넓어서 대표님 판단이 필요합니다.\n[결정 요청] 이번 스프린트에서 회의 흐름과 성장 시스템 중 무엇을 먼저 할까요? | 회의 흐름 | 성장 시스템')
  assert.equal(r.text, '범위가 넓어서 대표님 판단이 필요합니다.')
  assert.deepEqual(r.decision, {
    question: '이번 스프린트에서 회의 흐름과 성장 시스템 중 무엇을 먼저 할까요?',
    options: ['회의 흐름', '성장 시스템'],
    raw: '[결정 요청] 이번 스프린트에서 회의 흐름과 성장 시스템 중 무엇을 먼저 할까요? | 회의 흐름 | 성장 시스템',
  })
})

test('① 줄 중간의 표시는 결정이 아니다 — 발언이 그대로 남는다', () => {
  const text = '이 부분은 정해야 합니다. [결정 요청] 어느 쪽으로 갈까요? | A | B'
  assert.deepEqual(splitDecision(text), { text, decision: null })
})

test('③ 표시를 말로만 언급한 발언(실제 사례)은 결정으로 잡지 않고 발언으로 남긴다', () => {
  const text = '`[결정 요청]`과 [대표가 내린 결정]이 일반 발언과 시각적으로 구분되지 않아 놓치기 쉽습니다. 이 부분은 기존 System Color 토큰으로 강조 스타일을 잡는 안을 준비하겠습니다.'
  const r = splitDecision(text)
  assert.equal(r.decision, null)
  assert.equal(r.text, text)
})

test('③ 줄 맨 앞이어도 표시를 설명하는 평서문(선택지도 물음표도 없음)은 발언으로 남긴다', () => {
  const text = '[결정 요청] 표시가 다른 발언과 구분되지 않습니다.'
  assert.deepEqual(splitDecision(text), { text, decision: null })
  assert.equal(splitDecision('[결정 요청] 범위를 어디까지 잡을까요?').decision?.question, '범위를 어디까지 잡을까요?')
  // 물음표로 끝나도 표시에 조사가 붙어 있으면 언급이다
  const mention = '`[결정 요청]`과 `[대표가 내린 결정]`을 색으로 구분하면 어떨까요?'
  assert.deepEqual(splitDecision(mention), { text: mention, decision: null })
})

test('② 띄어 쓴 " | "로 나눈 줄이면 질문 안의 "A|B"는 살린다', () => {
  const r = splitDecision('[결정 요청] 저장 형식을 JSON|SQLite 중 무엇으로 할까요? | JSON | SQLite')
  assert.equal(r.decision?.question, '저장 형식을 JSON|SQLite 중 무엇으로 할까요?')
  assert.deepEqual(r.decision?.options, ['JSON', 'SQLite'])
})

test('② 붙여 쓴 "|"만 있어도 원문은 raw에 그대로 남는다', () => {
  const raw = '[결정 요청] 질문|가|나'
  const r = splitDecision(raw)
  assert.deepEqual(r.decision, { question: '질문', options: ['가', '나'], raw })
})

test('목록 기호·굵게·백틱으로 감싼 표시도 줄 맨 앞이면 인정하고, 질문 안 백틱은 지우지 않는다', () => {
  assert.equal(splitDecision('- **[결정 요청]** 범위는? | A | B').decision?.question, '범위는?')
  const r = splitDecision('`[결정 요청] `propose_plan`으로 넘길까요? | 예 | 아니오`')
  assert.equal(r.decision?.question, '`propose_plan`으로 넘길까요?')
  assert.deepEqual(r.decision?.options, ['예', '아니오'])
})

test('여러 줄 발언의 다른 줄은 그대로 두고, 표시가 여러 개면 마지막 것을 쓴다', () => {
  const r = splitDecision('첫 줄\n[결정 요청] 먼저 질문 | A\n가운데 줄\n[결정 요청] 나중 질문 | B | C')
  assert.equal(r.decision?.question, '나중 질문')
  assert.equal(r.text, '첫 줄\n[결정 요청] 먼저 질문 | A\n가운데 줄')
})

test('표시만 있고 질문이 비면 결정이 아니다', () => {
  assert.equal(splitDecision('말\n[결정 요청]  ').decision, null)
})

// ── 완료 기준 2: 유형·결정자·최종 선택 ──

test('대표가 답하면 직접 결정 — 결정자 대표, 최종 선택 = 답', () => {
  const d = decision()
  recordAnswer(d, 'B', false, 100)
  assert.deepEqual({ answer: d.answer, kind: d.kind, by: d.decidedById, name: d.decidedByName, choice: d.choice, at: d.decidedAt }, { answer: 'B', kind: 'direct', by: 'me', name: '대표', choice: 'B', at: 100 })
  assert.equal(decisionView(d, live).label, '직접 결정')
})

test('"알아서 정해"는 위임 — answer는 "" 그대로, 진행자가 정하면 결정자·선택·이유가 남는다', () => {
  const d = decision()
  recordAnswer(d, '', false, 100)
  assert.equal(d.answer, '')
  assert.equal(d.kind, 'delegated')
  assert.equal(decisionView(d, live).label, '위임 · 정하는 중')
  recordDelegated(d, { id: 'lead', name: '정리드' }, { choice: 'A', reason: '일정이 짧아서' }, 200)
  const v = decisionView(d, done)
  assert.deepEqual([v.state, v.choice, v.deciderName, v.reason, v.decidedAt, v.label], ['delegated', 'A', '정리드', '일정이 짧아서', 200, '위임 · 정리드'])
})

test('위임했지만 진행자가 정하지 못하면 "위임 · 아직 정하지 않음"', () => {
  const d = decision()
  recordAnswer(d, '', false, 100)
  assert.equal(decisionView(d, done).label, '위임 · 아직 정하지 않음')
})

test('회의 끝내기로 풀린 결정은 위임이 아니다', () => {
  const d = decision()
  recordAnswer(d, '', true, 100)
  assert.equal(d.answer, '')
  assert.equal(d.kind, undefined)
  assert.equal(d.endedByMeeting, true)
  assert.deepEqual([decisionView(d, done).state, decisionView(d, done).label], ['ended', '답하지 않음'])
})

test('옛 데이터는 읽을 때 보정한다 — 지어내지 않는다', () => {
  const pending = decisionView(decision(), live)
  assert.deepEqual([pending.state, pending.label], ['pending', '답 대기'])
  const unanswered = decisionView(decision(), { status: 'failed' })
  assert.deepEqual([unanswered.state, unanswered.label], ['unanswered', '답하지 않음'])
  const oldDirect = decisionView(decision({ answer: '회의 흐름' }), done)
  assert.deepEqual([oldDirect.state, oldDirect.choice, oldDirect.deciderName, oldDirect.decidedAt, oldDirect.isLegacy], ['direct', '회의 흐름', '대표', null, true])
  const oldDelegated = decisionView(decision({ answer: '' }), done)
  assert.deepEqual([oldDelegated.state, oldDelegated.choice, oldDelegated.deciderName, oldDelegated.label, oldDelegated.isLegacy], ['delegated', null, null, '위임 · 결정자 기록 없음', true])
})

test('위임 답 읽기: 표시 줄 → 선택·이유, 선택지는 글자 그대로, 표시가 없으면 첫 줄, 비면 null', () => {
  assert.deepEqual(parseDelegatedChoice('생각해 보면…\n[위임 결정] 회의 흐름 | 사용자 불편이 가장 큼', ['회의 흐름', '성장']), { choice: '회의 흐름', reason: '사용자 불편이 가장 큼' })
  assert.deepEqual(parseDelegatedChoice('`[위임 결정] json | 이유`', ['JSON', 'SQLite']), { choice: 'JSON', reason: '이유' })
  assert.deepEqual(parseDelegatedChoice('성장 시스템으로 갑니다', ['회의 흐름']), { choice: '성장 시스템으로 갑니다', reason: '' })
  assert.equal(parseDelegatedChoice('  \n ', ['A']), null)
})

// ── 완료 기준 3: 요약과 화면이 같은 데이터 ──

test('직접 1·위임 1·끝내기 1 회의 — 섹션별 문구가 화면 라벨과 같은 값으로, 저장 순서대로 나온다', () => {
  const direct = decision({ id: 'a', question: '최우선 영역은?' })
  recordAnswer(direct, '회의·협업 흐름', false, 1)
  const delegated = decision({ id: 'b', question: '요약을 기획안으로\n넘길 때는?', options: ['대표 확인 후', '자동'] })
  recordAnswer(delegated, '', false, 2)
  recordDelegated(delegated, { id: 'lead', name: '정리드' }, { choice: '대표 확인 후', reason: '승인 흐름 유지' }, 3)
  const ended = decision({ id: 'c', question: '라벨 색은?' })
  recordAnswer(ended, '', true, 4)
  const legacy = decision({ id: 'd', question: '옛 위임', answer: '' })
  const m = { status: 'done' as const, decisions: [direct, delegated, ended, legacy] }
  assert.deepEqual(decisionLines(m), {
    direct: ['- 최우선 영역은? → 회의·협업 흐름 (대표)'],
    delegated: ['- 요약을 기획안으로 넘길 때는? → 대표 확인 후 (위임: 정리드) — 승인 흐름 유지', '- 옛 위임 → (위임 · 결정자 기록 없음)'],
    open: ['- 라벨 색은? (회의를 끝내 답하지 않음)'],
  })
  // 화면 라벨의 결정자·선택과 같은 값
  const v = decisionView(delegated, m)
  assert.ok(decisionLines(m).delegated[0].includes(`${v.choice} (위임: ${v.deciderName})`))
})

test('발언 맥락에는 대기 중인 결정을 넣지 않고, 위임은 최종 선택값으로 들어간다', () => {
  const pending = decision({ id: 'p' })
  const delegated = decision({ id: 'q', question: '범위?' })
  recordAnswer(delegated, '', false, 1)
  recordDelegated(delegated, { id: 'lead', name: '정리드' }, { choice: 'A', reason: '' }, 2)
  const ctx = decisionsContext({ status: 'running', decisions: [pending, delegated] })
  assert.equal(ctx, '[위임 결정 — 대표가 맡겨 진행자가 정함]\n- 범위? → A (위임: 정리드)')
  assert.equal(decisionsContext({ status: 'running', decisions: [pending] }), '')
  assert.equal(decisionsContext({ status: 'running' }), '')
})

// ── T3: 기획안 초안의 결정 섹션 (고정) ──

const mixedMeeting = () => {
  const direct = decision({ id: 'a', question: '최우선 영역은?' })
  recordAnswer(direct, '회의·협업 흐름', false, 1)
  const delegated = decision({ id: 'b', question: '넘길 때는?' })
  recordAnswer(delegated, '', false, 2)
  recordDelegated(delegated, { id: 'lead', name: '정리드' }, { choice: '대표 확인 후', reason: '' }, 3)
  return { status: 'done' as const, decisions: [direct, delegated] }
}

test('결정 섹션은 세 개 모두 두고, 빈 섹션은 "없음"', () => {
  assert.equal(decisionSections({ status: 'done', decisions: [] }), '## 결정 사항(직접)\n- 없음\n\n## 위임 결정\n- 없음\n\n## 답하지 않음\n- 없음')
  assert.equal(
    decisionSections(mixedMeeting()),
    '## 결정 사항(직접)\n- 최우선 영역은? → 회의·협업 흐름 (대표)\n\n## 위임 결정\n- 넘길 때는? → 대표 확인 후 (위임: 정리드)\n\n## 답하지 않음\n- 없음',
  )
})

test('리드가 결정 섹션을 바꿔 올려도 원본으로 덮어쓴다 — 첫 섹션 자리에, 다른 섹션은 그대로', () => {
  const sections = decisionSections(mixedMeeting())
  const spec = [
    '# 구현 기획',
    '## 목적',
    '결정이 보이게',
    '### 결정 사항 (직접)',
    '- 최우선 영역은? → 성장 시스템 (대표)',
    '## 위임 결정',
    '- 넘길 때는? → 자동',
    '## 답하지 않음',
    '- 없음',
    '## 범위',
    '- 코드',
  ].join('\n')
  const out = withDecisionSections(spec, sections)
  assert.equal(out, `# 구현 기획\n## 목적\n결정이 보이게\n\n${sections}\n\n## 범위\n- 코드`)
  assert.ok(!out.includes('성장 시스템') && !out.includes('→ 자동'))
  // 다시 덮어써도 같다
  assert.equal(withDecisionSections(out, sections), out)
})

test('결정 섹션이 없으면 맨 위(첫 줄이 # 제목이면 그 아래)에 넣는다', () => {
  const sections = decisionSections(mixedMeeting())
  assert.equal(withDecisionSections('# 기획\n## 목적\nX', sections), `# 기획\n\n${sections}\n\n## 목적\nX`)
  assert.equal(withDecisionSections('## 목적\nX', sections), `${sections}\n\n## 목적\nX`)
})

test('카드 본문에서 결정 섹션만 뽑는다 (회의 기록이 지워졌을 때의 원본)', () => {
  const sections = decisionSections(mixedMeeting())
  assert.equal(decisionSectionsOf(`안내\n\n${sections}\n\n## 할 일 (담당 제안)\n1. A\n\n## 회의록\n결론: 진행`), sections)
  assert.equal(decisionSectionsOf('## 할 일\n1. A'), null)
})

test('답 대기 결정은 진행 중인 회의 것만 센다 — 결재함 목록과 메뉴 숫자가 같은 판정', () => {
  const q = (question: string) => ({ question, options: [], answer: null }) as never
  const live = { status: 'waiting', decisions: [q('계속할까요?')] } as never
  const failed = { status: 'failed', decisions: [q('앱을 다시 켜서 끊긴 회의')] } as never
  const done = { status: 'done', decisions: [{ question: '정함', options: [], answer: 'A' }] } as never
  assert.deepEqual(pendingMeetingDecisions([live, failed, done]).map((p) => p.decision.question), ['계속할까요?'])
})
