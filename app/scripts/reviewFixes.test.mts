// 한리뷰 버그 수정(1·2·4·5·7) 재현 테스트 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { autoApprove, commandWaits, setInstalledNodeVersions } from '../src/shared/autoApprove.ts'
import { findRiskyCommand } from '../src/shared/bashPolicy.ts'
setInstalledNodeVersions(['v24.11.0', 'v24.1.0']) // 설치된 nvm 버전 흉내 (R9 에서 실제 폴더로도 확인한다)
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
    '> out.txt', 'npm test 2>&1', 'ls &> out', 'cat a >&2', 'echo $((1+2))', 'echo $(( $((1+2)) * 3 ))', 'command -v node',
    'sw_vers', 'xcrun simctl list devices', 'nvm use 20', 'nvm ls', 'ls # a comment', 'if [[ -f a && -d b ]]; then echo y; fi',
    'case $x in a|b) echo ab;; c) echo c;; esac', '((1+1))', 'python3 --version', 'node -v',
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
  for (const c of ['awk \'{print $1}\' a', "awk -F: '$1 > 0 || $2 {print}' a", 'sqlite3 a.db "select 1"', 'tar -tzf a.tgz', 'tar czf a.tgz src', 'man ls', 'man 1 ls', "sed -n '1,5p' a", "sed 's/a/b/g' a", 'npm run build', 'make build', 'python3 --version'])
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
  for (const c of ['(( 1+2 ))', '[[ 3 -gt 0 ]]', 'let 1+2', 'declare -a arr', 'export FOO=bar', "git commit -m 'use $(cmd) syntax'", 'echo $((1+2))', 'x=$((3<<2))', '(( 0x1f > 3 ))'])
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
  for (const c of ['export FOO=bar', 'read line', 'make -j 4 test', 'make build', 'npm pkg get name', 'npm config get registry', 'git clone a b', 'git clone -c color.ui=never a b', 'git clone --depth 1 a b'])
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

test('R6 .git 쓰기: 경로 정리(// /./ ..)·디렉터리 대상·ln -s .git·cd .git·--git-dir 는 기다린다', () => {
  const waits = [
    'echo hi >> .git//config', 'echo hi >> .git/./config', 'echo hi >> ./.git/./hooks/pre-commit', 'echo hi >> a/../.git/config', 'cp x .git', 'cp x .git/', 'mv x .git/HEAD', 'cp -t .git x',
    'ln -s .git g; echo hi >> g/config', 'ln -s ./.git g', 'cd .git && echo hi >> config', 'cd .git; tee -a config', 'pushd .git/', 'tee .git/x', 'touch .git/x',
    'git init --bare b; cp cfg b/config; git --git-dir=b st', 'git --git-dir=b st', 'git --git-dir b st', 'git --work-tree=w st', 'GIT_DIR=b git st', 'export GIT_WORK_TREE=w', 'git init --bare b', 'git clone --bare a b', 'git init --template=/tmp/t r',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ['cp .git/HEAD /tmp/x', 'cat .git/config', 'cp a b', 'echo x > .gitignore', 'cd .github', 'git init r', 'git -C sub st'])
    assert.equal(commandWaits(c), false, c)
})

test('R6 산술: 변수 이름이 낀 산술 문맥은 전부 기다리고, 숫자뿐이면 통과', () => {
  const pre = "x=$(printf '%s[%s(git push)]' a '$'); "
  const waits = [
    '((x++))', '((x+=1))', '((x=x))', '((i=x,x=1))', 'let x++', "let 'x+=1'", '((x--)); echo', 'for ((;x--;)); do :; done', '((x*=1))', 'echo $((x))', 'echo ${arr[x]}', 'echo $[x]', 'y=$((x))', ': $(( x ))',
    'for ((i=x;i<1;i++)); do :; done', 'for ((i=0;i<1;i+=x)); do :; done', '((i=x))', 'let i=x', 'declare -i y=x', 'test x -eq 1', '[ x -eq 1 ]', 'shift x', 'return x', 'arr[x]=1', 'echo ${s:x}', 'echo "${s: x}"',
    'for ((i=0;i<n;i++)); do :; done', '((i++))',
  ]
  for (const c of waits) assert.equal(commandWaits(pre + c), true, c)
  for (const c of ['((i++))', 'echo $((x))', 'echo ${arr[x]}']) assert.equal(commandWaits(c), true, c)
  for (const c of ['((1+2))', 'echo $((1+2))', 'echo $[1+2]', 'echo ${arr[0]}', 'echo ${arr[@]}', 'echo ${s:1:2}', 'echo ${s:-d}', '[ 1 -eq 1 ]', 'shift 2', 'exit $?', 'return 0'])
    assert.equal(commandWaits(c), false, c)
})

test('R6 PATH·변수 이름 자리 치환·nameref 는 기다린다', () => {
  const waits = [
    'PATH=/tmp/evil:$PATH; git status', 'export PATH=/tmp/evil:$PATH; git status', 'PATH=.:$PATH; ls', 'PATH+=:/tmp/evil ls', 'export PATH+=:/x', 'env PATH=/x git status',
    "v=GIT_SSH_COMMAND; read $v <<< 'x'; export $v", 'v=GIT_SSH_COMMAND; export $v=x', 'export "$(echo GIT_SSH_COMMAND)=x"', "export GIT_SSH_COMM''AND=x", 'v=X; export $v=x', "v=A; printf -v $v x", 'unset $v', 'export {GIT_SSH_COMMAND,}=x',
    'declare -n r=GIT_SSH_COMMAND; r=x; export r', 'typeset -n r=PATH',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ['export FOO=$(git rev-parse HEAD)', 'export FOO="$HOME/x"', 'read -r line', 'local x=$(date)', 'printf -v out %s hi', 'printf "%s\n" $x'])
    assert.equal(commandWaits(c), false, c)
})

test("R6 $'…' ANSI-C 따옴표: \\' 가 따옴표를 닫지 않고, case 는 치환 안에서 기다린다", () => {
  const waits = [
    "echo $(echo $'\\')'; git push)", "echo $'\\'' ; git push ; echo '\n'", "echo $'\\'' ; git push", "git $'pu\\x73h'", "git $'push'", "echo $'\\x41'", "echo $'abc",
    'echo $(case a in a) git push;; esac)', 'echo `case a in a) git push;; esac`', 'echo "$(case a in a) git push;; esac)"',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  for (const c of ["echo $'a\\nb'", "echo $'it\\'s'", "echo $'\\''", "echo $'\\\\' hi", 'case x in a) echo a;; esac', 'echo $(echo case)'])
    assert.equal(commandWaits(c), false, c)
})

test('R7 쓰기 대상·bare 저장소·줄임 옵션·환경 변수·압축 풀기·설정 파일·산술 우회는 모두 기다린다', () => {
  const waits = [
 'echo x >> .gi?/config','d=.git; echo x >> $d/config','cd "$(echo .git)"','ln -s .gi? g','cd -','OLDPWD=x cd .','echo x > .git/[c]onfig','echo x > ~x/f','tee {.git,x}/config',
 'echo hi >> .GIT/config','cp x .GIT/','cd .GIT',
 "mkdir -p r/objects r/refs; echo 'ref: refs/heads/main' > r/HEAD; printf '[alias]' > r/config; git -C r st",'git --bare st','echo x > r/packed-refs','cp c r/config','tee r/objects/x',
 'git --upl=x st','git ls-remote --upload-p=x o','git init --templ=x r','git init --bar r','git clone --sep=x a b','git clone --mirr a b','git --git-d=b st','git --work-t=w st','git --config-e=a=b st','git --exec-path=/tmp/x st','git clone --conf=a=b x y',
 'HOME=/tmp/x git st','export HOME=/x','export XDG_CONFIG_HOME=/x','PS4=x ls','export PS4=$(x)','OLDPWD=x','npm_config_script_shell=x npm test','NPM_CONFIG_X=1 ls','SHELL=/x ls','ZDOTDIR=/x','path=(/tmp $path)','export cdpath=x','fpath=x','read HOME','typeset PATH=x',
 'echo `echo \\`git push\\``','echo "`echo \\`git push\\``"',
 'tar -xf a.tgz','tar xzf a.tgz','tar --extract -f a','tar -C /x -cf a b','tar -s,a,b, -cf x y','unzip a.zip','bsdtar -xf a','ditto -x a b','cpio -i < a','tar --ext -f a',
 'echo x > package.json','echo x >> Makefile','tee makefile','cp x GNUmakefile','echo x > .npmrc','echo x > .yarnrc.yml','echo x > pyproject.toml','echo x > setup.py','echo x > tox.ini','echo x > Justfile','sed -i s/a/b/ package.json',
 'cp x -t.git','cp x --target-directory=.git','mv x -t .git','install -t.git x','cp --target=.git x','cp -vt .git x',
 'x=$(printf "%s[%s(git push)]" a "$"); echo ${!x}','x=a; echo ${!x}','echo ${@:x}','echo ${*:x}','x=$(foo); echo ${@:x}','echo ${(e)x}',
 "x=$(printf '%s[%s(git push)]' a '$'); echo $((x))","x=$(printf '%s[%s(git push)]' a '$'); ((x++))","x=$(printf '%s[%s(git push)]' a '$'); for ((i=0;i<x;i++)); do :; done",
 'i=$(foo); echo $((i))','i=0; while [ $i -lt 3 ]; do i=$(foo); done; echo $((i))','read i; echo $((i*2))','echo $((i))','for i in 1 $x; do echo $((i)); done',
 'git push','i=0; i=$(date); echo $((i))','i=0; echo $((i+j))',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
})

test('R7 평소 명령·허용 PATH·안전한 산술·작은따옴표 속 대괄호는 계속 통과한다', () => {
  const allows = [
 'export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH" && npm test','export PATH="$PATH:/opt/homebrew/bin"','PATH=$PATH:./node_modules/.bin tsc','export PATH=/usr/local/bin:/usr/bin:/bin:$PATH',
 'echo $(($#+1))','echo $(($?+0))','echo $(($$+1))','echo $((${#arr[@]}-1))',
 
 "grep 'error[s]' log.txt","rg 'foo[A-Za-z]+' src","pytest -k 'test_a[x]'",'echo PATH=x',
 'read -p "$msg" ans',"echo $'\\e[31mred\\e[0m'",'git status','git diff','git log --oneline -5','git add -A','git commit -m "x"','npm test','npm run build','ls -la','cat a.txt','grep -rn foo src','for f in *.ts; do echo $f; done','echo $((1+2))','echo ${str:0:10}','echo ${1:-d}','exit $?','cd .github/workflows',
 'git rev-parse --git-dir','git rev-parse --show-toplevel','cd "$(git rev-parse --show-toplevel)"','cd ~','cd ~/proj','cd $HOME/x','cp a.txt b.txt','mv a b','echo hi > out.txt','echo hi > /dev/null 2>&1',"sed -n '1,$p' f",'sed -n 1,5p package.json','sed -i s/a/b/ src/a.ts','tar czf a.tgz src','tar -tzf a.tgz','zip a.zip b','printf "%s\\n" PATH',
 'git -C sub status','git log --exit-code','git diff --exit-code','git commit --amend --no-edit','echo ${arr[@]}','[ $? -eq 0 ]','cp -r src dist','mkdir -p out/refs-x','cat .git/HEAD','cp .git/HEAD /tmp/x',
 "x=$(printf '%s[%s(git push)]' a '$'); echo hi","x=$(printf '%s[%s(git push)]' a '$'); ((1+2))",
  ]
  for (const c of allows) assert.equal(commandWaits(c), false, c)
})

test('R8 PATH 폴더 앞붙이기·쓰기, 특수 변수 변조, 간접 참조 첨자, 출력 경로 옵션, git·패키지·make 우회는 기다린다', () => {
  const waits = [
    "mkdir -p node_modules/.bin && printf '#!/bin/sh\\ntouch pwn\\n' > node_modules/.bin/git && chmod +x node_modules/.bin/git && PATH=./node_modules/.bin:$PATH git status",
    'PATH=./node_modules/.bin:$PATH git status', 'export PATH=./node_modules/.bin:/usr/bin tsc', 'PATH=/x:./node_modules/.bin:$PATH ls',
    'echo x > node_modules/.bin/git', 'echo x > ~/.nvm/versions/node/v24.1.0/bin/git', 'echo x > $HOME/.nvm/versions/node/v99/bin/node', 'cp x node_modules/.bin/git', 'tee /usr/local/bin/git', 'ln -s x /opt/homebrew/bin/git',
    'chmod +x node_modules/.bin/git', 'touch /usr/bin/git', 'cd node_modules/.bin', 'cd ~/.nvm/versions/node/v24.1.0/bin',
    'unset RANDOM; RANDOM=$x; echo $((RANDOM))', 'unset SECONDS; SECONDS=$x; echo $((SECONDS))', 'unset LINENO; LINENO=$x; echo $((LINENO))', 'RANDOM=$x; echo $((RANDOM))', 'declare RANDOM=$x; echo $((RANDOM))', 'read RANDOM; echo $((RANDOM))',
    'x=a; echo ${!x[0]}', 'x=a; echo ${!x[1]}', 'x=a; echo ${!x[@]}',
    "sed -n 'w .git/config' f", "sed 's/a/b/w r/config' f", "sed -n '1w x' f", "sed -f s.sed f", "awk '{print > \".git/config\"}' f", "awk '{print >> \"x\"}' f", "awk '{print | \"sh\"}' f",
    'sort -o .git/config f', 'sort --output=r/config f', 'sort -ro r/HEAD f', 'uniq f .git/config', 'uniq -c f r/config',
    'curl -o .git/config https://x', 'curl --output r/HEAD https://x', 'curl -sSLo package.json https://x', 'curl -O https://x/config', 'wget -O .git/config https://x', 'wget -P .git/hooks https://x', 'wget https://x/Makefile',
    'base64 -o r/config f', 'base64 --output=.git/config f', 'split f .git/x', 'csplit f 3 -f .git/c', 'patch -p1 < x.diff', 'patch f x.diff',
    'git mv cfg r/config && git mv h r/HEAD && git -C r st', 'git mv a .git/config', 'git mv a package.json', 'git checkout-index --prefix=r/ -a', 'git archive -o .git/config HEAD', 'git archive --output=r/HEAD HEAD', 'git worktree add r', 'git format-patch -o r/refs/x HEAD', 'git bundle create r/config HEAD', 'git diff --output=r/config', 'git apply x.diff', 'git am x.patch', 'git submodule add u p',
    'npm test --script-shell=/tmp/x', 'npm --script-shell /tmp/x test', 'npm test --userconfig=x', 'npm run build --globalconfig x', 'npm --prefix /tmp/x test', 'npm test --node-options=--require=x', 'pnpm test --shell-emulator', 'yarn test --my-config=x', 'npm test --prefix=/tmp/x', 'npm test --prefix=../x', 'pnpm -C /x test', 'yarn --cwd ../x test', 'pnpm -C .git test', 'make -C node_modules/.bin',
    'make -f evil.mk', 'make -fevil.mk', 'make --file=evil.mk', 'make --makefile evil.mk', 'make --fi=x', 'MAKEFILES=evil.mk make build', 'make MAKEFILES=evil.mk build', 'make -C ../sub', 'make --directory=/sub', 'make -I inc', 'make --include-dir=inc', 'MAKEFLAGS=-fevil make', 'export MAKEFILES=x',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
})

test('R8 nvm 맨 앞 PATH·평소 명령·출력 경로가 일반인 명령은 계속 통과한다', () => {
  const allows = [
    'export PATH="$HOME/.nvm/versions/node/v24.1.0/bin:$PATH" && npm test', 'PATH=$HOME/.nvm/versions/node/v24.1.0/bin:$PATH git status', 'PATH=$PATH:./node_modules/.bin tsc', 'PATH=$PATH:./node_modules/.bin:/usr/bin tsc',
    'git status', 'git diff', 'git log', 'git add -A', 'git commit -m x', 'npm test', 'npm run build', 'ls', 'cat f', 'grep a f', 'for f in *.ts; do echo $f; done', 'echo $((1+2))',
    'echo ${str:0:10}', 'echo ${1:-d}', 'exit $?', 'cd .github/workflows', '[ $# -eq 0 ]', "grep 'error[s]' log.txt", 'echo PATH=x', 'read -p "$msg" ans', "echo $'\\e[31mred\\e[0m'",
    "sed -n '1,5p' f", 'sort f', 'sort -o out.txt f', 'uniq f', "awk '{print $1}' f", 'curl -s https://example.com', 'curl -o out.json https://example.com/x', 'git mv a b', 'make build', 'npm test -- --config jest.config.js', 'npm run build --silent', 'git archive -o out.tar HEAD', 'git diff --output=out.patch', 'chmod +x scripts/run.sh', 'wget https://example.com/a.tgz',
  ]
  for (const c of allows) assert.equal(commandWaits(c), false, c)
})

test('R9 첨자 대입·${…} 공백·빈 인자·sed/awk/curl 쓰기·PATH 폴더·git 복원·같은 줄 clone 우회는 기다린다', () => {
  const waits = [
    'x=$(echo YVskKHRvdWNoIHB3bild | base64 -d); i=1; declare i[0]=$x; [[ i -eq 1 ]]',
    'x=$(foo); i=1; declare i[0]=$x; echo $((i+1))', 'x=$(foo); i=1; typeset i[0]=$x; ((i>0))', 'x=$(foo); i=1; export i[0]=$x; let i++', 'x=$(foo); i=1; local i[0]=$x; echo ${a[i]}', 'x=$(foo); i=1; readonly i[0]=$x; echo $[i]', 'x=$(foo); i=1; i[0]=$x; echo $((i))',
    'echo ${s: x}', 'echo ${a[ x ]}', 'echo ${a[1+ x]}', 'set -- a b; echo ${@: x}', 'echo $[ x ]', 'echo ${x',
    "sed -n -e '' -e 'w .git/config' payload", "sed -n '/a/w r/config' f", "sed 's/a/b/w x' f", "sed -n '1,3w x' f", 'x=w; sed -n "$x .git/config" f', 'sed -n "`echo w` x" f', "sed -f s f", "sed -n '/[/p' f", "sed -n 'W x' f", "sed 's/a/b/gw x' f",
    "awk '{print $1 > \"x\"}' f", "awk '{print $1 | \"sh\"}' f", "awk '{printf \"%s\", $1 >> \"x\"}' f",
    "curl -o '#1' 'https://x/[a-b]'", "curl -w '%output{.git/config}x' https://x", 'curl -K cfg', 'curl --config cfg', 'curl --etag-save r/config https://x', 'curl --hsts x https://x', 'curl --alt-svc x https://x', 'curl -D x https://x', 'curl --dump-header x https://x', 'curl -c x https://x', 'curl --cookie-jar x https://x', 'curl --trace x https://x', 'curl --trace-ascii x https://x',
    'uniq -f 1 f .git/config', 'xxd -r f .git/config', 'xxd -r f r/HEAD', 'cp -r evil "$PWD"', 'cp -r evil "$(pwd)"', 'cp -r evil .', 'rsync -a evil/ "$PWD"',
    'export PATH="$HOME/.nvm/versions/node/v24.x/bin:$PATH"', 'export PATH="$HOME/.nvm/versions/node/v99.9.9/bin:$PATH"',
    'cp -r evil/bin ~/.nvm/versions/node/v24.11.0/', 'mv evil node_modules', 'cp -r evil/bin node_modules/', 'rsync -a evil/ ~/.nvm/versions/node/v24.11.0/', 'cp -r evil /usr/local/', 'mv evil /opt/homebrew', 'cp -r e ~/.nvm', 'git clone x node_modules/.bin', 'git clone x ~/.nvm/versions/node/v24.11.0/bin', 'echo x > ~/.nvm/versions/node/v24.11.0/bin/git',
    'cd /usr/local', 'cd ~/.nvm/versions/node/v24.11.0', 'cd node_modules', 'cd /usr', 'cd /opt/homebrew',
    'git checkout -- r/config', 'git checkout HEAD -- r/HEAD', 'git checkout main -- .git/hooks', 'git restore r/config', 'git restore --source=HEAD r/objects', 'git restore -s HEAD r/refs', 'git checkout-index -a', 'git update-index --add --cacheinfo 100644,abc,r/config', 'git update-index --add --cacheinfo 100644 abc r/HEAD', 'git update-index --cacheinfo 100644,abc,.git/config', 'git update-index --index-info', 'git update-index --add r/config', 'git read-tree HEAD', 'git apply p.diff', 'git am p.mbox', 'git mv x r/objects', 'git mv x r/refs', 'git mv x r/packed-refs',
    'git clone u r && git -C r st', 'git clone u r && cd r && npm test', 'git clone u r; cd r; make', 'git clone u && cd u && git st', 'git clone u r && npm --prefix r test', 'git clone u r && make -C r', 'git init r && git -C r st', 'cp -r evil r && cd r && npm test', 'git clone u r && pnpm -C r build', 'git clone u r && yarn --cwd r build',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
})

test('R9 sed·awk·curl 평소 명령, 상대 하위 폴더 옵션, 숫자 범위 반복, 실제 설치된 nvm 은 계속 통과한다', () => {
  const allows = [
    "sed -n '/warning/p' build.log", "sed 's/world/there/'", "sed -e 's/x/y/' -e 's/z/w/'", "sed 's|/usr/www|/var|'", "sed -E 's/(\\w+)/[\\1]/g'", "sed -n '1,5p' f", "sed 's/a/b/g;s/c/d/' f", "sed -n '$p' f", "sed '/x/d' f", "sed -n -e '' -e '1p' f", "sed -l 5 's/a/b/' f", "sed 's/[a-z]*/X/' f", "sed '/foo/{p;d}' f", "sed -i.bak 's/a/b/' src/a.ts", "sed '1i hello' f", "sed 's/a/b/w2' f x".replace('w2', 'g'),
    "awk '{printf \"%s -> %s\\n\", $1, $2}' f", "awk '{print $1}' f", "awk -F: '$1 > 0 || $2 {print}' a", "awk '{print \"a|b\"}' f", "awk '{print \"a>b\"}' f",
    'curl -s https://example.com', 'curl -o out.json https://example.com/x', 'curl -sSL https://example.com/a.sh',
    'sort f', 'uniq f', 'uniq -f 1 f', 'uniq -f 1 f out.txt', 'xxd f', 'xxd -r f out.bin',
    'npm --prefix app test', 'make -C app', 'make -C app build', 'make --directory=app', 'pnpm -C app build', 'yarn --cwd app build', 'npm --prefix packages/web run build',
    'for i in {1..3}; do echo $i; done', 'echo {1..3}',
    'git status', 'git diff', 'git log', 'git add -A', 'git commit -m x', 'git mv a b', 'git checkout main', 'git checkout -b feat', 'git checkout -- src/a.ts', 'git checkout HEAD -- src/a.ts', 'git restore .', 'git restore --staged src/a.ts', 'git restore -s HEAD src/a.ts', 'git update-index --refresh', 'git clone u r', 'git clone u r && cd app && npm test', 'git stash pop', 'git merge main',
    'cp -r a b', 'cd app', 'cd src', 'cd .github/workflows', 'cd ~', 'npm test', 'npm run build', 'make build', 'ls', 'cat f', 'grep a f',
    'for f in *.ts; do echo $f; done', 'echo ${str:0:10}', 'echo ${1:-d}', 'exit $?', 'echo ${s: 1}', 'echo ${a[1]}', 'echo $[1+2]', '[ $# -eq 0 ]', "grep 'error[s]' log.txt", 'echo PATH=x', 'read -p "$msg" ans', "echo $'\\e[31mred\\e[0m'",
    'PATH=$PATH:./node_modules/.bin tsc', 'declare a[0]=5',
  ]
  for (const c of allows) assert.equal(commandWaits(c), false, c)
  // 실제로 설치된 nvm 폴더는 맨 앞이어도 허용한다
  setInstalledNodeVersions(null)
  try {
    const dir = path.join(os.homedir(), '.nvm/versions/node')
    const v = fs.existsSync(dir) ? fs.readdirSync(dir).find((x) => x.startsWith('v24')) : undefined
    if (v) assert.equal(commandWaits(`export PATH="$HOME/.nvm/versions/node/${v}/bin:$PATH" && npm test`), false)
    assert.equal(commandWaits('export PATH="$HOME/.nvm/versions/node/v0.0.1/bin:$PATH"'), true)
  } finally {
    setInstalledNodeVersions(['v24.11.0', 'v24.1.0'])
  }
})

test('R10 ${…} 안의 {, 암묵 대입 변수, 따옴표로 글자가 된 $PATH, macOS sed -i/-I 접미사 우회를 막는다', () => {
  const waits = [
    // R1: ${x:-{} 는 처음 나오는 }가 닫는다 — 뒤 명령이 낱말에 삼켜지면 안 된다
    'echo ${x:-{}; bash -c "touch pwn1"; echo }', 'echo ${x:-{}\nbash -c "touch pwn1"\necho }', 'echo ${x:-{}; git %PUSH%; echo }'.replace('%PUSH%', 'pu' + 'sh'), 'echo ${x:-{{}; bash -c "touch p"; echo }}',
    // R2·R3: 셸이 스스로 값을 바꾸는 변수는 안전 변수가 아니다
    'REPLY=0; read < f; (( REPLY ))', 'REPLY=0; read < f; echo $((REPLY))', 'MAPFILE=0; mapfile < f; (( MAPFILE ))', 'MAPFILE=0; readarray < f; echo $((MAPFILE))',
    'a=0; read -a a < f; (( a[0] ))', 'OPTARG=0; getopts a: o -a; (( OPTARG ))', 'OPTIND=0; getopts a o; echo $((OPTIND))', 'REPLY=0; select x in a b; do (( REPLY )); done < f',
    'BASH_REMATCH=0; [[ $(<f) =~ .+ ]]; (( BASH_REMATCH ))', 'BASH_REMATCH=0; [[ $(<f) =~ .+ ]]; echo $((BASH_REMATCH))', 'x=0; [[ a =~ b ]]; y=$BASH_REMATCH; (( y ))',
    // R4: 따옴표·이스케이프로 글자 그대로인 $PATH
    "PATH='$PATH':./node_modules/.bin git status", 'PATH=\\$PATH:./node_modules/.bin git status', "PATH=$'$PATH':./node_modules/.bin git status", 'PATH="\\$PATH":./node_modules/.bin git status',
    "export PATH='$PATH':./node_modules/.bin; git status", 'PATH="~/.nvm/versions/node/v24.11.0/bin":$PATH git status',
    // sed -i·-I: BSD 는 바로 다음 낱말을 백업 접미사로 먹는다
    "sed -I '' -n 'w .git/config' payload", "sed -i '' -n 'w .git/hooks/pre-commit' payload", "sed -i 'p' -n 'w .git/hooks/x' payload", "sed -I 'p' -n 'w x' payload", "sed -i ../.git/x 's/a/b/' f", "sed -i.. 's/a/b/' f",
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  const allows = [
    "sed -i '' 's/a/b/' f.txt", "sed -i 's/a/b/' f.txt", "sed -n '/warning/p' f", "sed 's/world/there/' f", "sed -i.bak 's/a/b/' f.txt",
    'PATH=$PATH:./node_modules/.bin git status', 'PATH="$PATH":./node_modules/.bin git status', 'PATH="${PATH}":./node_modules/.bin git status',
    'echo ${x:-{} ; echo }', 'echo ${x:-${y}} done',
  ]
  for (const c of allows) assert.equal(commandWaits(c), false, c)
})

test('R11 산술 문맥에 변수 이름이 있으면 기다린다 (safeVars 제거): 값이 바뀌는 우회·옵션 묶음·래퍼', () => {
  const waits = [
    'x=1; echo "$(cat h)" >/dev/null; x=$_; ((x))', 'x=1; x=$OLDPWD; ((x))', 'x=1; read -dN x < f; (( x ))', 'x=1; read -pN x < f; (( x ))',
    'x=1; builtin declare x="$y"; (( x ))', 'x=1; command export x=$_; (( x ))', 'x=1; builtin read x < f; (( x ))',
    'for i in {1..3}; do i=$_; echo $((i*2)); done', 'for i in {1..3}; do echo $((i*2)); done', 'x=1; echo $((x+1))', 'n=5; echo ${s:n}', 'i=0; ((i++))', 'i=0; let i++',
    'for ((i=0;i<3;i++)); do i=$(cat f); done', 'for ((i=0;i<3;i++)); do echo $i; done', 'echo $((RANDOM%10))', 'i=0; while [ $i -lt 3 ]; do i=$((i+1)); done', '[[ $x -eq 1 ]]', 'shift $x',
    // PATH 접두와 같은 줄에서 node_modules/.bin 에 파일을 쓴 뒤 실행하는 연결
    'curl -o node_modules/.bin/git http://x; PATH=$PATH:./node_modules/.bin git status', 'git show HEAD:x > node_modules/.bin/git; PATH=$PATH:./node_modules/.bin git status',
    'base64 -d -o node_modules/.bin/git f; PATH=$PATH:./node_modules/.bin git status', 'cat f > node_modules/.bin/git && PATH=$PATH:./node_modules/.bin git status',
    'sort -o node_modules/.bin/git f; PATH=$PATH:./node_modules/.bin git status', 'git archive -o node_modules/.bin/g.tar HEAD; PATH=$PATH:./node_modules/.bin git status',
  ]
  for (const c of waits) assert.equal(commandWaits(c), true, c)
  const allows = ['while (( $# )); do shift; done', 'echo $((1+2)); (( 3 > 2 ))', 'echo $(($#+1))', 'exit $?', 'PATH=$PATH:./node_modules/.bin tsc', 'for i in {1..3}; do echo $i; done']
  for (const c of allows) assert.equal(commandWaits(c), false, c)
})

test('패키지 추가·전역 설치는 대표 확인, 이름 없는 설치는 자동 허용', () => {
  const wait = ['npm install lodash', 'npm i lodash', 'npm isntall lodash', 'npm add lodash', 'npm i -D vitest', 'npm i lodash@4', 'npm i ./local', 'npm i ../pkg', 'npm i git+https://github.com/a/b.git', 'npm i https://x.com/a.tgz', 'npm i github:a/b', 'yarn add react', 'yarn global add typescript', 'pnpm add zod', 'pnpm --filter web add x', 'pnpm -F web add x', 'npm --prefix app i x', 'npm i --prefix app x', 'bun add hono', 'bun a hono', 'npm i -g typescript', 'npm install --global typescript', 'npm i -g', 'npm update lodash', 'npm upgrade lodash', 'yarn upgrade react', 'pnpm update zod', 'npm i --registry https://r.example x', 'npm i -- lodash', 'npm install --save-dev --ignore-scripts evil']
  for (const c of wait) assert.equal(commandWaits(c), true, c)
  const ok = ['npm install', 'npm ci', 'pnpm install', 'yarn', 'yarn install', 'bun install', 'npm install --ignore-scripts', 'npm ci --no-audit', 'pnpm --filter web install', 'npm --prefix app install', 'npm i --registry https://r.example', 'npm i --omit dev', 'npm install --ignore-scripts && npm test']
  for (const c of ok) assert.equal(commandWaits(c), false, c)
})

test('설치 판정 리뷰 지적 6건: 우회 5종은 대표 확인, 옵션 값이 설치 낱말인 경우는 허용', () => {
  const wait = ['npm -- install lodash', 'CMD=install; npm "$CMD" lodash', 'npm $(echo install) lodash', 'npm upd lodash', 'npm upg lodash', 'pnpm add -w lodash', 'pnpm add --workspace lodash', 'npm install --g', 'npm install --location=global', 'npm install --location global typescript']
  for (const c of wait) assert.equal(commandWaits(c), true, c)
  const ok = ['npm --prefix install install', 'pnpm --filter install install']
  for (const c of ok) assert.equal(commandWaits(c), false, c)
})
