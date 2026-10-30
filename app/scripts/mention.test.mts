// 단체방 멘션 해석·응답자 선정 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mentionTargets, mentionToken, parseMentions, pickResponder, type ResponderCandidate } from '../src/shared/mention.ts'

const hired = [
  { id: 'kim', name: '김철수', teamId: 'dev' },
  { id: 'lee', name: '이영희', teamId: 'dev' },
  { id: 'park', name: '박디자', teamId: 'design' },
  { id: 'gae', name: '개발', teamId: null },
]
const teams = [
  { id: 'dev', name: '개발팀', color: '#111', kind: 'hired' as const },
  { id: 'design', name: '디자인 팀', color: '#222', kind: 'hired' as const },
  { id: 'empty', name: '빈팀', color: '#333', kind: 'hired' as const },
  { id: 'proj:x', name: '외부', color: '#444', kind: 'project' as const },
]
const labs = [{ id: 'office', name: '오피스랩', color: '#555', memberIds: ['kim', 'park', 'ghost', 'kim'] }]
const targets = mentionTargets(hired, teams, labs)
const names = (text: string) => parseMentions(text, targets).matched.map((t) => t.name)

test('대상 목록: 전체·고용 팀·랩·직원, 외부 프로젝트 팀은 빼고 빈 팀은 남긴다', () => {
  assert.deepEqual(targets.map((t) => t.key), ['all', 'team:dev', 'team:design', 'team:empty', 'lab:office', 'staff:kim', 'staff:lee', 'staff:park', 'staff:gae'])
  assert.deepEqual(targets.find((t) => t.key === 'lab:office')!.memberIds, ['kim', 'park'])
})

test('멘션이 없거나 없는 이름이면 matched가 비어 있다', () => {
  assert.deepEqual(names('오늘 회의 몇 시죠?'), [])
  assert.deepEqual(names('@없는사람 이거 봐 줘'), [])
})

test('직원 한 명: 예전처럼 그 직원만, 본문에서 멘션을 뺀다', () => {
  const r = parseMentions('@김철수 PR 봐 줘', targets)
  assert.deepEqual(r.recipientIds, ['kim'])
  assert.equal(r.body, 'PR 봐 줘')
})

test('팀 멘션은 구성원 전원, 공백 있는 팀 이름도 잡는다', () => {
  assert.deepEqual(parseMentions('@개발팀 배포 준비', targets).recipientIds, ['kim', 'lee'])
  assert.deepEqual(parseMentions('@디자인 팀 시안 공유', targets).recipientIds, ['park'])
})

test('긴 이름 우선: "@개발팀"은 직원 "개발"로 잡히지 않는다', () => {
  assert.deepEqual(names('@개발팀 확인'), ['개발팀'])
  assert.deepEqual(names('@개발 확인'), ['개발'])
})

test('겹치는 멘션은 중복 없이 합치고 중복 인원을 센다', () => {
  const r = parseMentions('@개발팀 @김철수 @오피스랩 같이 봐요', targets)
  assert.deepEqual([...r.recipientIds].sort(), ['kim', 'lee', 'park'])
  assert.equal(r.duplicates, 2)
  assert.equal(r.body, '같이 봐요')
})

test('@전체는 고용 직원 전원, 빈 팀은 구성원 0명으로 잡힌다', () => {
  assert.equal(parseMentions('@전체 공지', targets).recipientIds.length, 4)
  const empty = parseMentions('@빈팀 안녕', targets)
  assert.deepEqual(empty.matched.map((t) => t.memberIds), [[]])
  assert.deepEqual(empty.recipientIds, [])
})

const cand = (id: string, role: string, status: ResponderCandidate['status'] = 'idle', isOverBudget = false, isLead = false): ResponderCandidate => ({ id, role, status, isOverBudget, isLead })

test('응답자: 직무 낱말이 맞는 직원', () => {
  const c = [cand('fe', '프론트엔드 개발자'), cand('qa', 'QA'), cand('pm', '기획자'), cand('lead', '팀장')]
  assert.equal(pickResponder('버튼 프론트엔드 버그 고쳐 줘', c), 'fe')
  assert.equal(pickResponder('qa 체크리스트 만들어 줘', c), 'qa')
  assert.equal(pickResponder('다음 분기 기획 정리', c), 'pm')
})

test('응답자: 디자이너·고객 응대·마케터는 일 낱말로도 고른다', () => {
  const c = [cand('lead', '팀장', 'idle', false, true), cand('de', '디자이너'), cand('cs', '고객 응대(CS)'), cand('mk', '마케터')]
  assert.equal(pickResponder('설정 화면 디자인 시안 부탁해', c), 'de')
  assert.equal(pickResponder('어제 들어온 고객 문의에 답변 써 줘', c), 'cs')
  assert.equal(pickResponder('신규 기능 홍보 문구랑 광고 계획', c), 'mk')
})

test('응답자: 맞는 직무가 없으면 리드(leadId 기준, 직무 이름과 무관), 그다음 한가한 직원', () => {
  assert.equal(pickResponder('오늘 점심 뭐 먹지', [cand('fe', '프론트엔드 개발자'), cand('lead', '프론트엔드 리드', 'working', false, true)]), 'lead')
  assert.equal(pickResponder('오늘 점심 뭐 먹지', [cand('title', '팀장'), cand('lead', '리서처', 'working', false, true)]), 'lead')
  assert.equal(pickResponder('오늘 점심 뭐 먹지', [cand('a', '리서처', 'working'), cand('b', 'QA', 'idle')]), 'b')
})

test('응답자: 점수가 같으면 한가한 직원, 예산을 다 쓴 직원은 뺀다', () => {
  assert.equal(pickResponder('리뷰 부탁', [cand('r1', '코드 리뷰어', 'working'), cand('r2', '코드 리뷰어', 'idle')]), 'r2')
  assert.equal(pickResponder('리뷰 부탁', [cand('r1', '코드 리뷰어', 'idle', true), cand('x', 'QA')]), 'x')
  assert.equal(pickResponder('리뷰 부탁', [cand('r1', '코드 리뷰어', 'idle', true)]), null)
})

// 직원·팀·랩 이름이 모두 "디자인"인 경우
const clash = mentionTargets(
  [{ id: 'd', name: '디자인', teamId: null }, { id: 'p', name: '박디자', teamId: 'dt' }, { id: 'q', name: '최랩원', teamId: null }],
  [{ id: 'dt', name: '디자인', color: '#1', kind: 'hired' as const }],
  [{ id: 'dl', name: '디자인', color: '#2', memberIds: ['q'] }],
)
const pick = (key: string) => clash.find((t) => t.key === key)!

test('이름 충돌: 자동완성은 겹치는 대상에 종류를 붙이고, 안 겹치면 이름만 넣는다', () => {
  assert.equal(mentionToken(pick('staff:d'), clash), '@디자인(직원)')
  assert.equal(mentionToken(pick('team:dt'), clash), '@디자인(팀)')
  assert.equal(mentionToken(pick('lab:dl'), clash), '@디자인(랩)')
  assert.equal(mentionToken(pick('staff:p'), clash), '@박디자')
})

test('이름 충돌: 종류를 붙인 멘션은 고른 대상에게 간다', () => {
  assert.deepEqual(parseMentions('@디자인(팀) 시안 봐 주세요', clash).recipientIds, ['p'])
  assert.deepEqual(parseMentions('@디자인(랩) 회고', clash).recipientIds, ['q'])
  const both = parseMentions('@디자인(팀) @디자인(직원) 같이', clash)
  assert.deepEqual(both.matched.map((t) => t.key).sort(), ['staff:d', 'team:dt'])
  assert.equal(both.body, '같이')
})

test('이름 충돌: 종류 없는 "@디자인"은 직원 한 명만 (직원 → 팀 → 랩 순)', () => {
  const r = parseMentions('@디자인 확인', clash)
  assert.deepEqual(r.matched.map((t) => t.key), ['staff:d'])
})

test('멘션만 있으면 본문이 비어 있다 (main이 빈 지시를 막는 기준)', () => {
  assert.equal(parseMentions('@개발팀', targets).body, '')
  assert.equal(parseMentions('  @전체  @김철수 ', targets).body, '')
})
