// /명령어: 목록 추리기·보낸 글 판정·자동완성 거르기 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CLAUDE_MODEL_CHOICES, matchCommands, parseModelArg, needsTranslation, parseSlash, parseTranslations, pendingDescriptions, runsOnEnter, slashAction, toStaffCommands, type RawCommand } from '../src/shared/slashCommands.ts'

const cmd = (name: string, builtin = false, extra: Partial<RawCommand> = {}): RawCommand => ({ name, description: `${name} 설명`, argumentHint: '', builtin, ...extra })

const RAW: RawCommand[] = [
  cmd('compact', true, { argumentHint: '<instructions>' }),
  cmd('clear', true, { aliases: ['reset', 'new'] }),
  cmd('login', true),
  cmd('config', true, { aliases: ['settings'] }),
  cmd('statusline', true),
  cmd('review', true),
  cmd('my-skill'),
  cmd('deploy-notes', false, { description: '릴리스 노트 쓰기' }),
  cmd('config'), // 기본 명령과 이름이 겹치는 커스텀 — 실행되지 않으니 뺀다
  cmd('status'), // 같은 이름의 기본 명령 줄이 없으면 커스텀으로 쓸 수 있다
]

test('toStaffCommands: 막힌 기본 명령·터미널 전용·겹치는 커스텀을 빼고 기본 명령부터 정렬', () => {
  const list = toStaffCommands(RAW, ['review'])
  assert.deepEqual(
    list.map((c) => c.name),
    ['clear', 'compact', 'deploy-notes', 'my-skill', 'status'],
  )
  assert.equal(list.find((c) => c.name === 'compact')?.argumentHint, '<instructions>')
  assert.equal(list.find((c) => c.name === 'compact')?.isBuiltin, true)
  assert.equal(list.find((c) => c.name === 'my-skill')?.isBuiltin, false)
})

test('/goal: 목록에 남고 그대로 보내며, 조건을 써야 하니 Enter는 채우기만', () => {
  const raw = [cmd('goal', true)]
  const goal = toStaffCommands(raw).find((c) => c.name === 'goal')
  assert.equal(goal?.argumentHint, '<condition>')
  assert.equal(runsOnEnter(goal!), false)
  assert.deepEqual(slashAction('/goal 테스트가 모두 통과', raw), { kind: 'pass', name: 'goal' })
})

test('parseSlash: 명령 이름과 인자, 경로·빈 / 는 명령이 아니다', () => {
  assert.deepEqual(parseSlash('/compact 요약은 짧게'), { name: 'compact', args: '요약은 짧게' })
  assert.deepEqual(parseSlash('  /my-skill'), { name: 'my-skill', args: '' })
  assert.deepEqual(parseSlash('/plugin:cmd a\nb'), { name: 'plugin:cmd', args: 'a\nb' })
  for (const text of ['/Users/me/a.txt 봐줘', '/', '/ 띄어쓰기', '안녕 /compact', '//x', '/한글']) assert.equal(parseSlash(text), null, text)
})

test('slashAction: /clear(별칭 포함)는 새 대화, 막힌 기본 명령은 안내, 나머지는 그대로', () => {
  assert.deepEqual(slashAction('/clear'), { kind: 'clear' })
  assert.deepEqual(slashAction('/reset', RAW), { kind: 'clear' }, '별칭은 목록이 있을 때만 안다')
  assert.deepEqual(slashAction('/reset'), { kind: 'pass', name: 'reset' }, '목록이 없으면 그대로 보낸다')
  for (const name of ['login', 'logout', 'config', 'statusline']) assert.deepEqual(slashAction(`/${name}`), { kind: 'blocked', name }, name)
  assert.deepEqual(slashAction('/settings', RAW), { kind: 'blocked', name: 'settings' }, '막힌 기본 명령의 별칭')
  assert.deepEqual(slashAction('/config', RAW), { kind: 'blocked', name: 'config' }, '커스텀과 겹쳐도 기본 명령이 실행되므로 막는다')
  assert.deepEqual(slashAction('/status', RAW), { kind: 'pass', name: 'status' }, '기본 명령 줄이 없으면 커스텀 명령')
  assert.deepEqual(slashAction('/statusline', RAW), { kind: 'blocked', name: 'statusline' })
  assert.deepEqual(slashAction('/compact 짧게', RAW), { kind: 'pass', name: 'compact' })
  assert.deepEqual(slashAction('/my-skill', RAW), { kind: 'pass', name: 'my-skill' })
  assert.deepEqual(slashAction('/unknown-thing'), { kind: 'pass', name: 'unknown-thing' }, '모르는 이름도 그대로 보낸다')
  assert.deepEqual(slashAction('/Users/me 파일'), { kind: 'none' })
  assert.deepEqual(slashAction('평소 지시'), { kind: 'none' })
})

test('matchCommands: 이름 앞부분 → 이름 안 → 설명 순, 빈 검색은 전부', () => {
  const list = toStaffCommands(RAW)
  const names = (q: string) => matchCommands(list, q).map((c) => c.name)
  assert.deepEqual(names('/co'), ['compact'])
  assert.deepEqual(names('s'), ['status', 'deploy-notes', 'my-skill'], '앞부분 일치가 먼저')
  assert.deepEqual(names('릴리스'), ['deploy-notes'], '설명으로도 찾는다')
  assert.deepEqual(names('MY'), ['my-skill'], '대소문자 무시')
  assert.equal(names('').length, list.length)
  assert.equal(matchCommands(list, '', 2).length, 2)
})

test('needsTranslation: 이미 앱 언어 글자로 쓴 설명·빈 설명은 번역하지 않는다', () => {
  assert.equal(needsTranslation('Review a pull request', 'ko'), true)
  assert.equal(needsTranslation('릴리스 노트 쓰기', 'ko'), false)
  assert.equal(needsTranslation('릴리스 노트 쓰기', 'en'), true)
  assert.equal(needsTranslation('Review a pull request', 'en'), false)
  assert.equal(needsTranslation('レビューする', 'ja'), false)
  assert.equal(needsTranslation('漢字だけ', 'zh'), true) // 가나가 섞이면 일본어
  assert.equal(needsTranslation('审查代码', 'zh'), false)
  assert.equal(needsTranslation('', 'ko'), false)
  assert.equal(needsTranslation('--- 123', 'ja'), false)
})

test('pendingDescriptions: 기본 명령·캐시에 있는 설명·중복은 빼고, parseTranslations는 개수가 맞을 때만 쓴다', () => {
  const list = toStaffCommands([
    cmd('compact', true, { description: 'Clear history but keep a summary' }),
    cmd('a', false, { description: 'Write release notes' }),
    cmd('b', false, { description: 'Write release notes' }),
    cmd('c', false, { description: 'Deploy to staging' }),
    cmd('d', false, { description: '한국어 설명' }),
  ])
  const cached = new Set(['Deploy to staging'])
  assert.deepEqual(pendingDescriptions(list, 'ko', (text) => cached.has(text)), ['Write release notes'])
  const texts = ['Write release notes', 'Deploy']
  assert.deepEqual([...parseTranslations(texts, '```json\n["릴리스 노트 쓰기", "배포"]\n```')], [['Write release notes', '릴리스 노트 쓰기'], ['Deploy', '배포']])
  assert.equal(parseTranslations(texts, '["하나만"]').size, 0)
  assert.equal(parseTranslations(texts, 'sorry').size, 0)
})

test('runsOnEnter: 인자 안내가 없거나 선택 입력(optional·[ ])이면 바로 보내고, 꼭 넣을 인자가 있으면 채우기만', () => {
  const hint = (argumentHint: string) => runsOnEnter({ argumentHint })
  // 실제 SDK 안내: /compact·/clear
  assert.equal(hint('<optional custom summarization instructions>'), true)
  assert.equal(hint('[name]'), true)
  assert.equal(hint(''), true)
  assert.equal(hint('[<condition> | clear]'), true)
  assert.equal(hint('[prompt-audit [<path>]]'), true)
  assert.equal(hint('[interval] [prompt]'), true)
  assert.equal(hint('<path>'), false)
  assert.equal(hint('key=value'), false)
  assert.equal(hint('<task> [--dry-run]'), false)
})

const OPENED = [
  'deep-research', 'dataviz', 'verify', 'debug', 'code-review', 'simplify', 'batch', 'schedule', 'claude-api', 'workflow-authoring', 'run',
  'run-skill-generator', 'plugin-authoring', 'design-sync', 'insights', 'recap', 'team-onboarding', 'skill-doctor', 'list-agents',
  'reload-skills', 'reload-plugins', 'autocompact', 'doctor', 'output-style',
]
const KEPT_BLOCKED = ['config', 'mcp', 'update-config', 'fewer-permission-prompts', 'auto-mode-setup', 'import', 'loop', 'proactive']
const BUILTIN_RAW = [...OPENED, ...KEPT_BLOCKED, 'model', 'effort', 'fast', 'advisor', 'color', 'usage'].map((n) => cmd(n, true))

test('열린 작업형·설정 명령 24개는 pass, 계속 막는 8개(loop·proactive 포함)는 blocked — 목록을 받기 전·후가 같다', () => {
  for (const raw of [[], BUILTIN_RAW]) {
    for (const n of OPENED) assert.deepEqual(slashAction(`/${n} 인자`, raw), { kind: 'pass', name: n }, `${n} raw=${raw.length}`)
    for (const n of KEPT_BLOCKED) assert.equal(slashAction(`/${n}`, raw).kind, 'blocked', `${n} raw=${raw.length}`)
  }
  // 열린 명령은 자동완성 목록에도 나오고, 막힌 8개와 터미널 전용(color·usage)은 빠진다
  const names = toStaffCommands(BUILTIN_RAW).map((c) => c.name)
  for (const n of OPENED) assert.ok(names.includes(n), n)
  for (const n of [...KEPT_BLOCKED, 'color', 'usage']) assert.ok(!names.includes(n), n)
})

test('matchCommands: 막힌 이름을 치면 고를 항목 없음 (/config → /autocompact 퍼지 매치로 오발송 방지)', () => {
  const list = toStaffCommands(BUILTIN_RAW)
  assert.ok(list.some((c) => c.name === 'autocompact'))
  for (const n of ['config', 'loop', 'proactive', 'mcp', 'import']) assert.deepEqual(matchCommands(list, n), [], n)
  assert.deepEqual(matchCommands(list, '/CONFIG'), [])
  // 막히지 않은 이름·일부만 친 글자는 그대로 거른다
  assert.ok(matchCommands(list, 'auto').some((c) => c.name === 'autocompact'))
  assert.ok(matchCommands(list, 'batch').some((c) => c.name === 'batch'))
  assert.ok(matchCommands(list, 'rev').length > 0)
})

test('별칭: /review는 code-review로, /checkup은 doctor로 판정한다', () => {
  const raw = [cmd('code-review', true, { aliases: ['review'] }), cmd('doctor', true, { aliases: ['checkup'] })]
  assert.deepEqual(slashAction('/review', raw), { kind: 'pass', name: 'code-review' })
  assert.deepEqual(slashAction('/checkup', raw), { kind: 'pass', name: 'doctor' })
})

test('setting: /model·/effort·/fast·/advisor는 앱 설정 처리 (목록 전·후 같음), Codex 직원은 막고 안내', () => {
  for (const raw of [[], BUILTIN_RAW]) {
    assert.deepEqual(slashAction('/model opus', raw), { kind: 'setting', name: 'model', args: 'opus' })
    assert.deepEqual(slashAction('/model', raw), { kind: 'setting', name: 'model', args: '' })
    for (const n of ['effort', 'fast', 'advisor'] as const) assert.deepEqual(slashAction(`/${n} high`, raw), { kind: 'setting', name: n, args: 'high' })
    assert.equal(slashAction('/model opus', raw, 'codex').kind, 'blocked')
  }
})

test('parseModelArg: 별칭(대소문자·공백 무시)만 받고 모르는 값은 null', () => {
  assert.deepEqual(CLAUDE_MODEL_CHOICES, ['default', 'opus', 'sonnet', 'haiku'])
  assert.equal(parseModelArg('opus'), 'opus')
  assert.equal(parseModelArg('  SoNNet '), 'sonnet')
  assert.equal(parseModelArg('Default'), 'default')
  for (const bad of ['', 'gpt-5', 'claude-opus-4-1', 'opus sonnet', 'opus[1m]']) assert.equal(parseModelArg(bad), null, bad)
})
