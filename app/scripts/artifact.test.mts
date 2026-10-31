import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { ARTIFACT_CSP, ARTIFACT_MAX_BYTES, artifactUrl, checkArtifactFile, markdownToHtml, parseArtifactUrl, withCspMeta } from '../src/shared/artifact.ts'
import { artifactVersions, findArtifactVersion, listArtifacts, readArtifactText, respondArtifact, saveArtifact, writeBrowserCopy } from '../src/main/artifactStore.ts'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'))
const owner = { staffId: 's1', staffName: '이디자', taskId: 't1' }
const write = (dir: string, name: string, body: string) => {
  const f = path.join(dir, name)
  fs.writeFileSync(f, body)
  return f
}

test('확장자·크기 거르기', () => {
  assert.deepEqual(checkArtifactFile('a.HTML', 10), { ok: true, kind: 'html' })
  assert.deepEqual(checkArtifactFile('a.htm', 10), { ok: true, kind: 'html' })
  assert.deepEqual(checkArtifactFile('/x/a.md', 10), { ok: true, kind: 'md' })
  for (const bad of ['a.js', 'a.svg', 'a.html.exe', 'a', 'a.txt']) assert.deepEqual(checkArtifactFile(bad, 10), { ok: false, reason: 'ext' })
  assert.deepEqual(checkArtifactFile('a.md', 0), { ok: false, reason: 'empty' })
  assert.equal(checkArtifactFile('a.md', ARTIFACT_MAX_BYTES).ok, true)
  assert.deepEqual(checkArtifactFile('a.md', ARTIFACT_MAX_BYTES + 1), { ok: false, reason: 'size' })
})

test('저장: 없는 파일·잘못된 확장자·큰 파일은 저장하지 않는다', () => {
  const root = tmp()
  const src = tmp()
  assert.deepEqual(saveArtifact(root, { title: 'x', source: path.join(src, 'none.html'), ...owner }), { ok: false, reason: 'missing' })
  assert.deepEqual(saveArtifact(root, { title: 'x', source: write(src, 'a.js', 'x'), ...owner }), { ok: false, reason: 'ext' })
  assert.deepEqual(saveArtifact(root, { title: 'x', source: write(src, 'big.html', 'a'.repeat(ARTIFACT_MAX_BYTES + 1)), ...owner }), { ok: false, reason: 'size' })
  assert.deepEqual(saveArtifact(root, { title: 'x', source: src, ...owner }), { ok: false, reason: 'missing' })
  assert.equal(listArtifacts(root).length, 0)
})

test('버전 올리기: 같은 파일·같은 제목은 새 버전, 내용이 같으면 그대로, 다른 직원·다른 제목은 새 아티팩트', () => {
  const root = tmp()
  const src = tmp()
  const f = write(src, 'dash.html', '<h1>1</h1>')
  const a = saveArtifact(root, { title: '대시보드', source: f, ...owner })
  assert.ok(a.ok)
  assert.equal(a.ok && a.ref.version, 1)
  const same = saveArtifact(root, { title: '대시보드', source: f, ...owner })
  assert.ok(same.ok && !same.isNewVersion && same.ref.version === 1)
  fs.writeFileSync(f, '<h1>2</h1>')
  const b = saveArtifact(root, { title: '이름이 바뀐 제목', source: f, ...owner })
  assert.ok(b.ok && b.isNewVersion && b.ref.version === 2 && b.ref.id === (a.ok ? a.ref.id : ''))
  const c = saveArtifact(root, { title: '이름이 바뀐 제목', source: write(src, 'other.html', '<p>x</p>'), ...owner })
  assert.ok(c.ok && c.ref.version === 3)
  const other = saveArtifact(root, { title: '이름이 바뀐 제목', source: f, ...owner, staffId: 's2' })
  assert.ok(other.ok && other.ref.version === 1 && other.ref.id !== (a.ok ? a.ref.id : ''))
  const id = a.ok ? a.ref.id : ''
  assert.deepEqual(artifactVersions(root, id).map((v) => v.version), [1, 2, 3])
  assert.equal(fs.readFileSync(findArtifactVersion(root, id, 1)!.file, 'utf8'), '<h1>1</h1>')
  assert.equal(findArtifactVersion(root, id)!.ref.version, 3)
  assert.equal(listArtifacts(root).length, 2)
})

test('경로 탈출 방지: id·버전·주소 경로로 저장소 밖 파일을 읽을 수 없다', () => {
  const root = tmp()
  const outside = tmp()
  fs.mkdirSync(path.join(outside, '1'), { recursive: true })
  fs.writeFileSync(path.join(outside, 'meta.json'), JSON.stringify({ id: 'x', versions: [{ version: 1, name: 'a.html', size: 1, createdAt: 0, hash: '' }] }))
  const src = tmp()
  const ok = saveArtifact(root, { title: 't', source: write(src, 'a.html', 'ok'), ...owner })
  assert.ok(ok.ok)
  const id = ok.ok ? ok.ref.id : ''
  for (const bad of ['../' + path.basename(outside), path.relative(root, outside), '..', '.', '', `${id}/../${id}`, id + '/..']) {
    assert.equal(findArtifactVersion(root, bad), null)
    assert.deepEqual(artifactVersions(root, bad), [])
  }
  for (const v of [0, -1, 1.5, 99, NaN]) assert.equal(findArtifactVersion(root, id, v), null)
  // 주소에는 id(36자 hex)와 숫자 버전만 올 수 있다
  const bad = ['office-artifact://../2', `office-artifact://${id}/1/../../x`, `office-artifact://${id}/..%2F..%2Fmeta.json`, `office-artifact://${id}/1/meta.json`, `office-artifact://${id}/-1`, `office-artifact://${id}`, 'file:///etc/passwd', `https://${id}/1`]
  for (const u of bad) assert.equal(parseArtifactUrl(u), null, u)
  assert.deepEqual(parseArtifactUrl(artifactUrl(id, 3)), { id, version: 3 })
  for (const u of bad) assert.equal(respondArtifact(u, root).status, 404, u)
  // 이름이 경로처럼 들어와도 그 버전 폴더 안에만 저장된다
  const nasty = saveArtifact(root, { title: 't2', source: write(src, '..%2f..%2fevil.md', 'x'), ...owner })
  assert.ok(nasty.ok && fs.realpathSync(nasty.file).startsWith(fs.realpathSync(root) + path.sep))
})

test('CSP 헤더: 전용 주소 응답에 붙고 connect·외부 출처는 막는다', async () => {
  const root = tmp()
  const r = saveArtifact(root, { title: 't', source: write(tmp(), 'a.html', '<script>1</script>'), ...owner })
  assert.ok(r.ok)
  const res = respondArtifact(artifactUrl(r.ok ? r.ref.id : '', 1), root)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), ARTIFACT_CSP)
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  const csp = ARTIFACT_CSP
  assert.match(csp, /default-src 'none'/)
  assert.match(csp, /script-src 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com https:\/\/unpkg\.com https:\/\/cdn\.jsdelivr\.net(;|$)/)
  assert.match(csp, /style-src 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com https:\/\/unpkg\.com https:\/\/cdn\.jsdelivr\.net/)
  assert.match(csp, /img-src data: blob:(;|$)/)
  assert.match(csp, /connect-src 'none'/)
  assert.match(csp, /form-action 'none'/)
  assert.match(csp, /base-uri 'none'/)
  assert.match(csp, /sandbox allow-scripts(;|$)/)
  assert.doesNotMatch(csp, /allow-(popups|top-navigation|downloads|same-origin|forms)/)
  assert.doesNotMatch(csp, /\*/)
  assert.equal(await res.text(), '<script>1</script>')
  assert.match(withCspMeta('<html><head><title>x</title></head></html>'), /^<meta http-equiv="Content-Security-Policy" content="default-src 'none'/)
  assert.doesNotMatch(withCspMeta('<p>x</p>'), /sandbox/)
})
test('md는 HTML로 바꿔 내어 주고 원문 속 스크립트·위험한 링크는 글자가 된다', async () => {
  const root = tmp()
  const md = '# 제목\n\n- 가\n- **나**\n\n<script>alert(1)</script>\n\n[a](javascript:alert(1)) [b](https://x.dev)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\n<b>x</b>\n```'
  const r = saveArtifact(root, { title: 'md', source: write(tmp(), 'n.md', md), ...owner })
  assert.ok(r.ok)
  const res = respondArtifact(artifactUrl(r.ok ? r.ref.id : '', 1), root)
  const html = await res.text()
  assert.equal(res.headers.get('content-security-policy'), ARTIFACT_CSP)
  assert.match(html, /<h1>제목<\/h1>/)
  assert.match(html, /<ul><li>가<\/li><li><strong>나<\/strong><\/li><\/ul>/)
  assert.match(html, /<table>/)
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /href="javascript/)
  assert.match(html, /href="https:\/\/x\.dev"/)
  assert.match(html, /<pre><code>&lt;b&gt;x&lt;\/b&gt;<\/code><\/pre>/)
  assert.equal(markdownToHtml('![x](https://evil.test/a.png)'), '<p>[x]</p>')
})

test('심볼릭 링크: 원본 링크는 거절하고, 저장소 안의 링크가 밖을 가리키면 읽지 않는다', () => {
  const root = tmp()
  const src = tmp()
  const secret = write(src, 'secret.md', 'TOP SECRET')
  fs.symlinkSync(secret, path.join(src, 'link.md'))
  assert.deepEqual(saveArtifact(root, { title: 'x', source: path.join(src, 'link.md'), ...owner }), { ok: false, reason: 'missing' })

  const r = saveArtifact(root, { title: 'ok', source: write(src, 'a.md', 'hello'), ...owner })
  assert.ok(r.ok)
  const id = r.ok ? r.ref.id : ''
  // 버전 파일을 밖을 가리키는 링크로 바꿔치기
  const file = path.join(root, id, '1', 'a.md')
  fs.rmSync(file)
  fs.symlinkSync(secret, file)
  assert.equal(findArtifactVersion(root, id), null)
  assert.equal(respondArtifact(artifactUrl(id, 1), root).status, 404)
  // 버전 폴더 전체를 밖으로 가리키는 링크로
  const outside = tmp()
  fs.writeFileSync(path.join(outside, 'a.md'), 'TOP SECRET')
  fs.rmSync(path.join(root, id, '1'), { recursive: true })
  fs.symlinkSync(outside, path.join(root, id, '1'))
  assert.equal(findArtifactVersion(root, id), null)
  // meta.json이 밖을 가리키는 링크면 목록에서 빠진다
  const meta = path.join(root, id, 'meta.json')
  const copy = fs.readFileSync(meta)
  fs.rmSync(meta)
  fs.writeFileSync(path.join(outside, 'meta.json'), copy)
  fs.symlinkSync(path.join(outside, 'meta.json'), meta)
  assert.equal(listArtifacts(root).length, 0)
})

test('크기 초과: 저장소 안에서 커진 파일은 읽지 않는다', () => {
  const root = tmp()
  const src = tmp()
  const r = saveArtifact(root, { title: 'big', source: write(src, 'a.html', '<p>x</p>'), ...owner })
  assert.ok(r.ok)
  const id = r.ok ? r.ref.id : ''
  fs.writeFileSync(path.join(root, id, '1', 'a.html'), 'a'.repeat(ARTIFACT_MAX_BYTES + 1))
  assert.equal(findArtifactVersion(root, id)?.file !== undefined, true)
  assert.equal(readArtifactText(root, path.join(root, id, '1', 'a.html')), null)
  assert.equal(respondArtifact(artifactUrl(id, 1), root).status, 404)
})

test('CSP 사본: <head>가 스크립트 뒤에 나와도 정책이 가장 먼저 온다', () => {
  for (const html of ['<script>alert(1)</script><head></head>', '<script>1</script><HEAD><title>x</title></HEAD>', '<!doctype html><script>1</script><head>', '<html><body><script>1</script></body></html>']) {
    const out = withCspMeta(html)
    const m = out.indexOf('Content-Security-Policy')
    assert.ok(m >= 0)
    assert.ok(m < out.indexOf('<script'), out)
  }
  assert.ok(withCspMeta('<!doctype html><p>x').startsWith('<!doctype html><meta'))
})

test('브라우저 사본: 미리 만든 임시 폴더 링크를 따라가 외부 파일을 지우거나 덮어쓰지 않는다', () => {
  const base = tmp()
  const victimDir = tmp()
  const victim = path.join(victimDir, 'abc-v1.html')
  fs.writeFileSync(victim, 'KEEP')
  fs.symlinkSync(victimDir, path.join(base, 'ai-office-artifacts'))
  fs.symlinkSync(victim, path.join(base, 'abc-v1.html'))
  const copy = writeBrowserCopy(base, 'abc-v1.html', '<p>x</p>')
  assert.equal(fs.readFileSync(victim, 'utf8'), 'KEEP')
  assert.equal(fs.readFileSync(copy, 'utf8'), '<p>x</p>')
  assert.ok(fs.realpathSync(copy).startsWith(fs.realpathSync(base) + path.sep))
  assert.notEqual(path.dirname(copy), base)
  assert.equal(writeBrowserCopy(base, 'abc-v1.html', 'y') === copy, false)
})
