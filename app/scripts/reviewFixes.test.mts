// 한리뷰 버그 수정(1·2·4·5·7) 재현 테스트 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { autoApprove, commandWaits } from '../src/shared/autoApprove.ts'
import { findRiskyCommand } from '../src/shared/bashPolicy.ts'
import { maskSecrets } from '../src/shared/redact.ts'
import { listManuals, saveManual, validateSteps } from '../src/main/manuals.ts'

const tmpDirs: string[] = []
const mkTmp = (prefix: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
})

test('래퍼 옵션 값을 명령으로 오인하지 않는다', () => {
  for (const c of ['env -u UNUSED git push', 'nice -n 5 git push', 'timeout -s KILL 5 git push', 'stdbuf -o L git push', 'xargs -n 1 git push', 'env -C /tmp git push', 'env --unset FOO git push', 'timeout -k 3 10 git push'])
    assert.equal(commandWaits(c), true, c)
  assert.equal(commandWaits('env -S "git push"'), true)
  assert.equal(commandWaits('env -u FOO ls'), false)
  assert.equal(commandWaits('nice -n 5 ls'), false)
})

test('윈도우 역슬래시 위험 경로도 대기', () => {
  assert.equal(autoApprove('Write', { file_path: 'C:\\Users\\x\\.ssh\\config', content: 'a' }), 'wait')
  assert.equal(autoApprove('Edit', { file_path: 'C:\\repo\\.github\\workflows\\ci.yml', new_string: 'a' }), 'wait')
  assert.equal(autoApprove('Write', { file_path: 'C:\\repo\\a.ts', content: 'a' }), 'allow')
})

test('JSON 형태 비밀값 가리기', () => {
  assert.ok(!maskSecrets('{"password":"hunter2"}').includes('hunter2'))
  assert.ok(!maskSecrets('{"api_key": "abcd1234"}').includes('abcd1234'))
  assert.ok(!maskSecrets(JSON.stringify(JSON.stringify({ token: 'zzz999' }))).includes('zzz999'))
  assert.equal(maskSecrets('{"name":"x"}'), '{"name":"x"}')
})

test('단계 JSON 검증', () => {
  assert.ok(validateSteps({}))
  assert.ok(validateSteps([{ id: 'a' }]))
  assert.equal(validateSteps([{ id: 'a', title: 't', role: 'r', instruction: 'i' }]), null)
})

test('우회 사례: BSD env·긴 옵션·새 래퍼는 대기, 옵션 없는 일반 명령은 통과', () => {
  const waits = [
    'env -P /usr/bin git push', 'env -L u git push', 'env -U u git push',
    'xargs --delimiter x git push', 'xargs --arg-file f git push', 'xargs --eof=x git push', 'xargs --process-slot-var V git push',
    'time --output f git push', 'time --format x git push', 'stdbuf --output L git push',
    'doas -u root git push', 'caffeinate -t 5 git push', 'chrt -f 10 git push', 'taskset 0x1 git push', 'taskset -c 0,1 git push',
    'flock /tmp/l git push', 'gtimeout 5 git push', 'gstdbuf -o L git push', 'gnice -n 5 git push',
    'env --weird-opt git push', 'xargs -Z git push',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ['gtimeout 5 ls', 'flock /tmp/l ls', 'taskset -c 0 ls', 'xargs -n 1 ls', 'nice -5 ls']) assert.equal(commandWaits(c), false, c)
})

test('비밀값: 따옴표가 든 값·숫자 값·비슷한 키', () => {
  for (const [text, secret] of [
    ['{"password":"it\'s hunter2"}', 'hunter2'],
    ['{"token":"ab\\"cd efgh"}', 'efgh'],
    ['{"password":123456}', '123456'],
    ['{"api_key": true, "x":1}', 'true'],
  ] as const) assert.ok(!maskSecrets(text).includes(secret), text)
  assert.equal(maskSecrets('{"monkey":"a b"}'), '{"monkey":"a b"}')
})

test('CRLF SKILL.md 읽기와 잘못된 단계 표시, 이름 바꿀 때 원본 보존', () => {
  const dir = mkTmp('man-')
  const input = { name: 'my-man', description: 'd', kind: 'process' as const, scope: 'project' as const, projectDir: dir, body: 'b', steps: [] }
  const m = saveManual(input)
  fs.writeFileSync(m.path, fs.readFileSync(m.path, 'utf8').replace(/\n/g, '\r\n'))
  fs.writeFileSync(path.join(path.dirname(m.path), 'extra.txt'), 'x')
  const m2 = saveManual({ ...input, name: 'my-man2' }, m.path)
  assert.equal(m2.name, 'my-man2')
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/my-man2/extra.txt')))
  assert.ok(!fs.existsSync(m.path))
  const bad = path.join(dir, '.claude/skills/my-man2/SKILL.md')
  fs.writeFileSync(bad, '---\nname: my-man2\nkind: process\n---\n```office-process\n{"a":1}\n```\n')
  const found = listManuals([dir]).find((x) => x.name === 'my-man2')
  assert.ok(found?.error)
  assert.deepEqual(found?.steps, [])
})

test('같은 폴더를 가리키는 다른 경로(심볼릭 링크)면 방금 저장한 매뉴얼과 보조 파일을 지우지 않는다', () => {
  const dir = mkTmp('alias-')
  const input = { name: 'alias-man', description: 'd', kind: 'personal' as const, scope: 'project' as const, projectDir: dir, body: 'b', steps: [] }
  const m = saveManual(input)
  const extra = path.join(path.dirname(m.path), 'extra.txt')
  fs.writeFileSync(extra, 'keep')
  const link = mkTmp('alias-link-') + '/lnk'
  fs.symlinkSync(dir, link)
  // 링크로 만든 다른 문자열 경로(옛 코드는 문자열이 달라 폴더째 지웠다)
  const viaLink = path.join(link, '.claude/skills/alias-man/SKILL.md')
  assert.notEqual(viaLink, m.path)
  const again = saveManual(input, viaLink)
  assert.equal(again.name, 'alias-man')
  assert.ok(fs.existsSync(m.path))
  assert.equal(fs.readFileSync(extra, 'utf8'), 'keep')
})

test('새 매뉴얼을 기존 이름으로 만들면 오류 (previousPath 없음), 같은 매뉴얼을 고치는 것은 가능', () => {
  const dir = mkTmp('dup-')
  const input = { name: 'dup-man', description: 'd', kind: 'personal' as const, scope: 'project' as const, projectDir: dir, body: 'first', steps: [] }
  const m = saveManual(input)
  assert.throws(() => saveManual({ ...input, body: 'second' }))
  assert.match(fs.readFileSync(m.path, 'utf8'), /first/)
  saveManual({ ...input, body: 'edited' }, m.path)
  assert.match(fs.readFileSync(m.path, 'utf8'), /edited/)
})

test('이름을 바꿀 때 새 이름이 이미 있으면 오류, 원본·기존 파일 그대로', () => {
  const dir = mkTmp('clash-')
  const base = { description: 'd', kind: 'personal' as const, scope: 'project' as const, projectDir: dir, body: 'b', steps: [] }
  const a = saveManual({ ...base, name: 'man-a', body: 'A' })
  const b = saveManual({ ...base, name: 'man-b', body: 'B' })
  assert.throws(() => saveManual({ ...base, name: 'man-b', body: 'A2' }, a.path))
  assert.ok(fs.existsSync(a.path))
  assert.match(fs.readFileSync(b.path, 'utf8'), /\nB\n?$/)
})

test('단계 검증: maxLoops·onRevise 타입', () => {
  const ok = { id: 'a', title: 't', role: 'r', instruction: 'i' }
  assert.ok(validateSteps([{ ...ok, maxLoops: 'x' }]))
  assert.ok(validateSteps([{ ...ok, onRevise: 5 }]))
  assert.equal(validateSteps([{ ...ok, maxLoops: 2, onRevise: null }]), null)
})

test('윈도우 시작프로그램·PowerShell 프로필 쓰기는 대기', () => {
  for (const f of ['C:\\Users\\x\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\a.bat', 'C:\\Users\\x\\Documents\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1', 'C:\\Users\\x\\Documents\\PowerShell\\profile.ps1'])
    assert.equal(autoApprove('Write', { file_path: f, content: 'a' }), 'wait', f)
})

test('모르는 명령·확장·줄 잇기·glob·git 설정·xargs·flock은 대기 (fail closed)', () => {
  const waits = [
    'xcrun git push', 'arch -arm64 git push', 'script -q /dev/null git push', 'sandbox-exec -p x git push', 'chroot / git push', 'su -c "git push"', 'runuser -u x git push',
    'firejail git push', 'parallel git push ::: a', 'entr git push', 'unbuffer git push', 'prlimit --nofile=5 git push', 'systemd-run git push',
    '{git,push}', 'git {push,}', 'git p{ush,}', 'g{it,} push',
    'git p\\\nush', 'git pu\\\nsh origin', '/usr/bin/gi? push', 'gi[t] push', '/usr/bin/g* push', 'git pu* origin',
    'git -c alias.x=push x', 'git -calias.x=push x', 'git --config-env=alias.x=Y x', 'git -c core.sshCommand=evil fetch',
    'xargs -I% git %', 'xargs git', "cat <<EOF\n$(git push)\nEOF", 'xargs npm run', 'flock /tmp/l -c "git push"', 'flock /tmp/l -n git push',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
})

test('평소 쓰는 안전한 명령은 계속 자동 승인', () => {
  const allows = [
    'ls -la', 'cat package.json', 'grep -rn foo src', 'git status', 'git diff HEAD', 'git log --oneline -5', 'git -C /tmp status', 'git -c color.ui=never diff', 'npm test', 'npm run build',
    'echo hi && pwd', 'ls *.ts', 'cat src/a.ts | head -5', 'mkdir -p a/b', 'sed -n 1,5p a.txt', 'cd app && npm test', 'timeout 5 ls', 'env -u FOO ls', 'xargs -n 1 echo',
    "git commit -m \"$(cat <<'EOF'\nmsg line\nEOF\n)\"", 'tsc --noEmit', 'node --version', 'make test', 'cargo build', 'go test ./...', '[ -f a ] && echo y', 'FOO=1 ls', 'find . -name "*.ts"',
  ]
  for (const c of allows) assert.equal(commandWaits(c), false, c)
  assert.equal(autoApprove('Bash', { command: 'ls' }), 'allow')
})

test('비밀 이름 앞뒤 붙은 키와 따옴표 든 일반 값 가리기, 보통 글은 그대로', () => {
  for (const [text, secret] of [
    ['DB_PASSWORD=abc123xyz', 'abc123xyz'], ['GITHUB_TOKEN=abcdef123456', 'abcdef123456'], ['export AWS_SECRET_ACCESS_KEY=AKxyz/12+3', 'AKxyz'],
    ['MYSQL_ROOT_PASSWORD: s3cr3t', 's3cr3t'], ['{"db_password":"s3cr3t"}', 's3cr3t'], ['{"githubToken":"abcdef"}', 'abcdef'],
    ['password="hunter 2" next', 'hunter'], ['password: "my secret pw"', 'secret'],
  ] as const) assert.ok(!maskSecrets(text).includes(secret), text)
  assert.equal(maskSecrets('password: "my secret pw" ok'), 'password: "***" ok')
  for (const t of ['tokenizer: fast keyboard=us', 'the monkey: banana split', 'turkey=1 name: bob', '{"keyword":"a b"}']) assert.equal(maskSecrets(t), t)
})

test('윈도우 System32 PowerShell 프로필도 대기', () => {
  assert.equal(autoApprove('Write', { file_path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1', content: 'a' }), 'wait')
})

// ── Round 4: 보안 재검토 ──────────────────────────────────────────

test('R4 heredoc 오인 건너뛰기 금지: 본문을 명령으로 검사', () => {
  const waits = [
    'cat <<< EOF\ngit push\nEOF', 'ls # <<X\ngit push\nX', '((a=1<<X))\ngit push\nX', 'echo $[1<<X]\ngit push\nX', 'echo ${x:-<<X}\ngit push\nX',
    'cat <<E"O"F\nEOF\ngit push\nE', 'cat <<E\\$F\ngit push\nE', 'cat <<<EOF\ngit push\nEOF', 'ls #<<X\ngit push\nX',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  assert.equal(findRiskyCommand('ls #<<X\nrm -rf ~/x\nX'), 'rm -r/-f')
  assert.equal(findRiskyCommand('cat <<<EOF\nrm -rf x\nEOF'), 'rm -r/-f')
  // 제대로 된 heredoc은 본문을 글로 본다
  assert.equal(commandWaits("cat <<'EOF'\ngit push\nEOF"), false)
  assert.equal(commandWaits('cat <<-EOF\n\tit\'s text\nEOF'), false)
})

test('R4 백슬래시+CRLF는 줄 잇기가 아니다', () => {
  assert.equal(commandWaits('ls \\\r\ngit push'), true)
  assert.equal(findRiskyCommand('ls \\\r\nrm -rf x'), 'rm -r/-f')
  assert.equal(commandWaits('git p\\\nush'), true) // LF는 여전히 줄 잇기
})

test('R4 주석·for·case·리다이렉트·산술은 오탐 없이 통과, 주석 속 따옴표로 숨기기는 대기', () => {
  const allows = [
    'for f in *.ts; do echo $f; done', 'for i in $(seq 3); do echo $i; done', 'while read l; do echo $l; done < a', 'case x in a) echo a;; esac',
    'for ((i=0;i<3;i++)); do echo $i; done', '> out.txt', 'npm test 2>&1', 'ls &> out', 'cat a >&2', 'echo $((1+2))', 'echo $(( $((1+2)) * 3 ))', 'command -v node',
    'sw_vers', 'xcrun simctl list devices', 'nvm use 20', 'nvm ls', 'ls # a comment', 'if [[ -f a && -d b ]]; then echo y; fi',
    'case $x in a|b) echo ab;; c) echo c;; esac', '((i++))', 'python3 --version', 'node -v',
  ]
  for (const c of allows) assert.equal(commandWaits(c), false, c)
  const waits = [
    "ls # it's\ngit push\n# '", 'ls # x\\\ngit push', 'case x in a) git push;; esac', 'for f in a; do git push; done', '((git push))', 'echo $((git push) )', 'echo $(( $(git push) ))',
    '((a=$(git push)))', '> out git push', 'xcrun simctl boot x', 'nvm exec 20 git push', 'defaults write a b c', 'claude -p x', 'codex exec x', 'code .',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
})

test('R4 git 설정: -c 안전 키만 허용, GIT_* 환경·rebase -x 등은 대기', () => {
  const waits = [
    'git -c diff.external=evil diff', "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.st GIT_CONFIG_VALUE_0='!git push' git st", 'GIT_SSH_COMMAND=evil git fetch', 'export GIT_CONFIG_COUNT=1\ngit st',
    'git rebase -x "git push" main', 'git rebase --exec "git push" main', 'git rebase -ix "git push" main', 'git submodule foreach git push', 'git config core.sshCommand evil', 'git config --global alias.st "!git push"',
    'git bisect run git push', 'git grep -O"git push" x', 'git clone --upload-pack="git push" a b', 'git -c core.pager=evil log', 'git -c credential.helper=x fetch',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ['git -c color.ui=never diff', 'git -c user.name=x log', 'git config user.name', 'git rebase main', 'git submodule status', 'git bisect start']) assert.equal(commandWaits(c), false, c)
})

test('R4 기존 우회 막기: trap·awk·sqlite3·tar·man·LESSOPEN·인터프리터 붙은 옵션·npm·make', () => {
  const waits = [
    "trap 'git push' EXIT", 'alias ls="git push"\nls', `awk 'BEGIN{system("git push")}'`, `awk 'BEGIN{"git push" | getline}'`, `awk '{print | "sh"}' a`,
    "sqlite3 a.db '.shell git push'", 'echo ".shell git push" | sqlite3 a.db', 'sqlite3 a.db <<EOF\n.shell git push\nEOF',
    'tar --use-compress-program="git push" -xf a', 'tar -I "git push" -xf a', 'tar xIf "git push" a', 'tar --to-command="git push" -x', 'man -P "git push" ls', 'man --pager="git push" ls',
    "LESSOPEN='|git push' less a", 'LESSCLOSE=x less a', "env LESSOPEN='|git push' less a", "python3 -c'import os'", "perl -e'system(1)'", "node --eval='1'", "node -p 'process.exit()'", "bash -x", "echo 'git push' | sh -s", 'echo x | python3 -v',
    'npm run-script deploy', 'npm explore foo -- git push', 'pnpm --filter x exec git push', 'npm create vite', 'make --eval="x:;git push" x', "make 'X=$(shell git push)'", 'sed -e "1e git push" a', "sed 's/a/git push/e' a",
    'rsync -e "git push" a b', "zip a.zip b -TT 'git push'", 'brew ruby -e 1',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ['awk \'{print $1}\' a', "awk -F: '$1 > 0 || $2 {print}' a", 'sqlite3 a.db "select 1"', 'tar -xzf a.tgz -C /tmp', 'tar czf a.tgz src', 'man ls', 'man 1 ls', "sed -n '1,5p' a", "sed 's/a/b/g' a", 'npm run build', 'make build', 'python3 --version'])
    assert.equal(commandWaits(c), false, c)
})

test('R4 비밀 이름 접두사: 비밀 아닌 key·token은 그대로, 긴 글도 빠르게', () => {
  for (const t of ['foreign_key=users_id', 'primaryKey: id', 'sortKey=name', 'partition_key: pk', 'cache_key=abc', '{"idempotency_key":"abc"}', 'public_key=ssh-rsa', 'next_page_token: abc123']) assert.equal(maskSecrets(t), t)
  assert.ok(!maskSecrets('api_key=abc123').includes('abc123'))
  assert.ok(!maskSecrets('https://x.com/a?token=abc123&b=1').includes('abc123'))
  const big = 'a:b'.repeat(40_000)
  const t0 = performance.now()
  maskSecrets(big)
  assert.ok(performance.now() - t0 < 100, `${performance.now() - t0}ms`)
  const t1 = performance.now()
  maskSecrets('x=y '.repeat(30_000))
  assert.ok(performance.now() - t1 < 100)
})

test('R5 # 주석은 입력 처음이나 공백·; & | ( ) 뒤에서만: {# }# \\r# 은 주석이 아니다', () => {
  for (const c of ['echo {#,x}; git push', 'ls {#}; git push', 'echo }#; git push', 'ls;}#;git push', 'ls \r#; git push', 'echo a#b; git push', 'echo a #b; git push']) assert.equal(commandWaits(c), c.includes(' #b') ? false : true, c)
  assert.equal(findRiskyCommand('echo {#,x}; rm -rf /tmp/x'), 'rm -r/-f')
  assert.equal(findRiskyCommand('echo }#; sudo ls'), 'sudo')
  assert.equal(findRiskyCommand('ls \r#; sudo ls'), 'sudo')
  for (const c of ['ls # list', 'echo hi # comment', 'ls;# x', 'ls #;git push', '# only comment']) assert.equal(commandWaits(c), false, c)
})

test('R5 명령 치환의 괄호는 따옴표를 알아본다: 따옴표 속 ) 가 치환을 끝내지 않고, 안 닫히면 기다린다', () => {
  for (const c of ['echo $(echo ")") ; git push\n# "', "echo $(echo ')') ; git push\n# '", 'echo $(echo ")") ; git push', 'echo "$(echo ")")"; git push', 'echo $(echo \\)) ; git push'])
    assert.equal(commandWaits(c), true, c)
  assert.equal(findRiskyCommand('echo $(echo ")") ; rm -rf /tmp/x'), 'rm -r/-f')
  assert.equal(findRiskyCommand("echo $(echo ')') ; rm -rf /tmp/x"), 'rm -r/-f')
  assert.equal(commandWaits('echo $(echo "unterminated'), true)
  for (const c of ['echo $(echo ")")', "echo $(echo ')')", 'echo "$(date)"', 'git commit -m "$(cat <<\'EOF\'\nit\'s done (ok\nEOF\n)"', 'echo $(ls "a b")']) assert.equal(commandWaits(c), false, c)
})

test('R5 산술·첨자 주입: declare·printf -v·((·let·[[ -eq 는 기다린다 (숫자 글자만 허용)', () => {
  const waits = [
    "declare 'a[$(git push)]=1'", "printf -v 'a[$(git push)]' x", "x='a[$(git push)]'; (( x ))", "x='a[$(git push)]'; [[ x -eq 1 ]]", "x='a[$(git push)]'; [[ $x -eq 1 ]]",
    "x='a[$(git push)]'; let x", 'x=a\\[\\$\\(git\\ push\\)\\]; (( x ))', "typeset 'a[`git push`]=1'", "export 'a[$(git push)]=1'", "local 'a[$(git push)]'", "readonly 'a[$(git push)]=1'",
    '(( x ))', '(( x + 1 ))', 'for ((i=0;i<n;i++)); do :; done', '[[ $n -gt 0 ]]', '[[ x -lt 3 ]]', 'declare -i q', "p='$(git push)'; x=\"a[$p]\"; (( x ))",
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ['(( 1+2 ))', '((i++))', 'for ((i=0;i<3;i++)); do echo $i; done', '[[ 3 -gt 0 ]]', 'let i++', 'let 1+2', 'declare -a arr', 'export FOO=bar', "git commit -m 'use $(cmd) syntax'", 'echo $((1+2))', 'x=$((a<<2))', '(( 0x1f > 3 ))'])
    assert.equal(commandWaits(c), false, c)
})

test('R5 git 설정 파일 직접 쓰기: .git/ 아래 리다이렉트·tee·cp 는 기다리고, 위험 키·안전 키 허용 목록을 따른다', () => {
  const waits = [
    'echo x > .git/config', 'echo x >> .git/hooks/pre-commit', "echo '[core]' | tee .git/config", 'cp a .git/hooks/pre-push', 'echo x >.git/info/exclude', 'echo x > repo/.git/config', 'cat a >> ~/.zshrc',
    "git config remote.origin.uploadpack 'git push'", 'git config remote.origin.receivepack x', 'git config remote.origin.vcs x', "git config submodule.a.update '!git push'", 'git config core.alternateRefsCommand x',
    'git config --global core.foo bar', 'git config foo.bar baz', 'git config --add remote.origin.url x', 'git config set core.sshCommand x', 'git config -e', 'git config --file .git/config alias.x "!git push"',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  const allows = [
    'cat .git/config', 'grep url .git/config', 'ls .git/hooks', 'echo x > out.txt', 'git config pull.rebase true', 'git config user.name x', 'git config --global init.defaultBranch main', 'git config color.ui auto', 'git config core.quotepath off',
    'git config --get remote.origin.url', 'git config --list', 'git config user.name', 'git config -l',
  ]
  for (const c of allows) assert.equal(commandWaits(c), false, c)
})

test('R5 변수 이름·PATH·clone·make -C·npm pkg', () => {
  const waits = [
    'read GIT_SSH_COMMAND <<< x; export GIT_SSH_COMMAND', 'printf -v GIT_SSH_COMMAND evil; export GIT_SSH_COMMAND', 'export GIT_SSH_COMMAND', 'export LD_PRELOAD', 'declare -x DYLD_INSERT_LIBRARIES', 'read PATH', 'export PATH',
    'PATH=/tmp/evil ls', 'PATH=/tmp/evil git status', 'env PATH=/tmp/evil ls', "git clone -u 'git push' a b", 'git clone --upload-pack=x a b', 'git clone -c core.sshCommand=x a b',
    'make -C dir deploy', 'make -j 4 deploy', 'make -C dir publish', 'npm pkg set scripts.x=evil', 'npm pkg delete scripts.test', 'npm config set script-shell evil', 'npm set script-shell evil',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ['export PATH="$PATH:/x"', 'export FOO=bar', 'read line', 'make -C dir build', 'make -j 4 test', 'make build', 'npm pkg get name', 'npm config get registry', 'git clone a b', 'git clone -c color.ui=never a b', 'git clone --depth 1 a b'])
    assert.equal(commandWaits(c), false, c)
})

test('R5 비밀 가리기 URL 규칙은 선형 시간: ab-·a. 반복 120KB가 100ms 안', () => {
  for (const unit of ['ab-', 'a.']) {
    const t0 = performance.now()
    maskSecrets(unit.repeat(40_000))
    assert.ok(performance.now() - t0 < 100, `${unit} ${performance.now() - t0}ms`)
  }
  assert.equal(maskSecrets('https://user:pass@host/x'), 'https://user:***@host/x')
  assert.equal(maskSecrets('x-ab://u:pw@h'), 'x-ab://u:***@h')
})
