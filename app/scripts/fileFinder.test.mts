import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { canOpenName, checkOpen, FileRegistry, findInRoot, ID_MAX, ID_TTL_MS, isInside, isSecretName, usableRoot } from '../src/main/fileFinder.ts'

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-')))
const mk = (rel: string, body = 'x') => {
  const f = path.join(tmp, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, body)
  return f
}
const proj = path.join(tmp, 'proj')
mk('proj/report.pdf')
mk('proj/sub/Design-V2.PNG')
mk('proj/secretary-v2.png')
mk('proj/.env')
mk('proj/.hidden/a.pdf')
mk('proj/node_modules/m/readme.md')
mk('proj/key.PEM')
mk('proj/.ENV.local')
mk('proj/id_rsa')
mk('proj/run.sh')
mk('proj-evil/steal.pdf')
fs.mkdirSync(path.join(proj, 'x.pdf'))
fs.symlinkSync(path.join(tmp, 'proj-evil'), path.join(proj, 'link-out'))
fs.symlinkSync(path.join(tmp, 'proj-evil/steal.pdf'), path.join(proj, 'link.pdf'))

const names = (q: { words: string[] }) => findInRoot(proj, q).map((c) => path.relative(proj, c.path)).sort()

test('범위 판정: 형제 폴더(/proj-evil)·..·자기 자신은 밖', () => {
  assert.equal(isInside(proj, path.join(proj, 'a/b.pdf')), true)
  assert.equal(isInside(proj, path.join(tmp, 'proj-evil/steal.pdf')), false)
  assert.equal(isInside(proj, path.join(proj, '..', 'proj-evil', 'x')), false)
  assert.equal(isInside(proj, proj), false)
})
test('범위 판정: 유니코드 NFD 경로도 같은 폴더로 본다', () => {
  const nfc = '/데이터/프로젝트'.normalize('NFC')
  assert.equal(isInside(nfc, `${nfc.normalize('NFD')}/보고서.pdf`), true)
})
test('비밀 이름: 대문자 .ENV·.PEM·id_*·credentials·.npmrc를 거른다, secretary는 아니다', () => {
  for (const n of ['.ENV', '.env.local', 'KEY.PEM', 'a.p12', 'x.PFX', 'id_ed25519', 'credentials.json', '.npmrc', '.netrc', 'server.key']) assert.equal(isSecretName(n), true, n)
  for (const n of ['secretary-v2.png', 'report.pdf', 'environment.md']) assert.equal(isSecretName(n), false, n)
})
test('찾기: 숨김·비밀·node_modules·심볼릭 링크·밖 폴더는 나오지 않는다', () => {
  const all = names({ words: [] })
  assert.deepEqual(all, ['report.pdf', 'run.sh', 'secretary-v2.png', 'sub/Design-V2.PNG'])
  assert.ok(!all.some((p) => p.includes('steal') || p.includes('link') || p.includes('.env') || p.includes('node_modules') || p.includes('.hidden')))
})
test('찾기: 이름 낱말(대소문자 무시)·날짜로 좁힌다', () => {
  assert.deepEqual(names({ words: ['design', 'v2'] }), ['sub/Design-V2.PNG'])
  const future = Date.now() + 60_000
  assert.deepEqual(findInRoot(proj, { words: [], sinceMs: future }), [])
})
test('찾기: 결과 개수 한도', () => {
  for (let i = 0; i < 30; i++) mk(`many/f${i}.txt`)
  assert.equal(findInRoot(path.join(tmp, 'many'), { words: [] }).length, 20)
})
test('열기 허용 형식: 대문자 .PDF는 되고, 실행·html·svg·바로가기·매크로 문서는 안 된다', () => {
  for (const n of ['a.PDF', 'b.Docx', 'c.png', 'd.MP4']) assert.equal(canOpenName(n), true, n)
  for (const n of ['a.app', 'a.sh', 'a.COMMAND', 'a.exe', 'a.html', 'a.svg', 'a.webloc', 'a.url', 'a.scpt', 'a.jar', 'a.pkg', 'a.py', 'a.docm', 'a.xlsm', 'a.dmg', 'noext', '.env']) assert.equal(canOpenName(n), false, n)
})

const entryOf = (p: string, root = proj) => ({ kind: 'file' as const, path: p, root, source: 'project' as const, name: path.basename(p), who: '', at: 0 })

test('열기 직전 확인: 정상 파일은 확정 경로로 통과', () => {
  const r = checkOpen(entryOf(path.join(proj, 'report.pdf')), 'open', [proj])
  assert.deepEqual(r, { ok: true, path: path.join(proj, 'report.pdf') })
})
test('열기 직전 확인: 찾은 뒤 사라지면 gone, 루트가 더는 허용이 아니면 outside', () => {
  const f = mk('proj/temp.pdf')
  fs.rmSync(f)
  assert.equal(checkOpen(entryOf(f), 'open', [proj]).ok, false)
  assert.deepEqual(checkOpen(entryOf(path.join(proj, 'report.pdf')), 'open', [path.join(tmp, 'other')]), { ok: false, reason: 'outside' })
})
test('열기 직전 확인: 찾은 뒤 밖을 가리키는 링크로 바뀌면 막는다', () => {
  const f = mk('proj/swap.pdf')
  const e = entryOf(f)
  fs.rmSync(f)
  fs.symlinkSync(path.join(tmp, 'proj-evil/steal.pdf'), f)
  assert.deepEqual(checkOpen(e, 'open', [proj]), { ok: false, reason: 'outside' })
  assert.deepEqual(checkOpen(e, 'reveal', [proj]), { ok: false, reason: 'outside' })
})
test('열기 직전 확인: x.pdf라는 이름의 폴더·실행 파일은 열기 불가(폴더 보기만)', () => {
  assert.deepEqual(checkOpen(entryOf(path.join(proj, 'x.pdf')), 'open', [proj]), { ok: false, reason: 'not_openable' })
  assert.equal(checkOpen(entryOf(path.join(proj, 'x.pdf')), 'reveal', [proj]).ok, true)
  assert.deepEqual(checkOpen(entryOf(path.join(proj, 'run.sh')), 'open', [proj]), { ok: false, reason: 'not_openable' })
  assert.equal(checkOpen(entryOf(path.join(proj, 'run.sh')), 'reveal', [proj]).ok, true)
})
test('열기 직전 확인: 비밀 이름은 열기·폴더 보기 모두 막는다', () => {
  assert.equal(checkOpen(entryOf(path.join(proj, '.env')), 'reveal', [proj]).ok, false)
  assert.equal(checkOpen(entryOf(path.join(proj, 'key.PEM')), 'open', [proj]).ok, false)
})

test('프로젝트 루트: 홈·앱 데이터 폴더·그것을 품은 폴더·루트(/)는 찾기 범위에서 뺀다', () => {
  const home = path.join(tmp, 'home')
  const userData = path.join(home, 'Library/AppData')
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(path.join(home, 'work'), { recursive: true })
  const danger = { home, userData }
  assert.equal(usableRoot(home, danger), null)
  assert.equal(usableRoot(userData, danger), null)
  assert.equal(usableRoot(tmp, danger), null)
  assert.equal(usableRoot('/', danger), null)
  assert.equal(usableRoot(path.join(home, 'work'), danger), path.join(home, 'work'))
  assert.equal(usableRoot(path.join(tmp, 'nope'), danger), null)
})

test('id: 찾기 결과에만 묶이고, 지어낸 id·만료된 id는 열리지 않으며 개수 한도가 있다', () => {
  let now = 1000
  const reg = new FileRegistry(() => now)
  const id = reg.register(entryOf(path.join(proj, 'report.pdf')))
  assert.match(id, /^ff_[0-9a-f]{18}$/)
  assert.ok(reg.get(id))
  assert.equal(reg.get('ff_000000000000000000'), null)
  now += ID_TTL_MS + 1
  assert.equal(reg.get(id), null)
  const first = reg.register(entryOf(path.join(proj, 'report.pdf')))
  for (let i = 0; i < ID_MAX; i++) reg.register(entryOf(path.join(proj, 'report.pdf')))
  assert.equal(reg.get(first), null)
})
