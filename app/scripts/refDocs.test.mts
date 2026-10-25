// 참고 문서 정규화·검사·합치기·상한·Read 허용 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isRefDocRead, mergeRefDocs, normalizeRefDocPath, REF_DOCS_PER_TARGET, REF_DOCS_TOTAL, refDocsPrompt, sanitizeRefDocs, splitRefDocPath, suggestRefDocs } from '../src/shared/refDocs.ts'

const HOME = '/Users/me'
const all = () => true

test('경로 정규화: ~ 펼치기, ./..·겹친 / 정리, 상대 경로는 null', () => {
  assert.equal(normalizeRefDocPath('~/flitto/CONTEXT.md', HOME), '/Users/me/flitto/CONTEXT.md')
  assert.equal(normalizeRefDocPath('  /a//b/./c/../SPEC.md ', HOME), '/a/b/SPEC.md')
  assert.equal(normalizeRefDocPath('/a/b/', HOME), '/a/b')
  assert.equal(normalizeRefDocPath('docs/SPEC.md', HOME), null)
  assert.equal(normalizeRefDocPath('~other/x.md', HOME), null)
  assert.equal(normalizeRefDocPath('/내 문서/규칙 문서.md', HOME), '/내 문서/규칙 문서.md')
})

test('저장 전 검사: 빈 값·상대 경로·중복(정규화 후)을 거부하고 순서는 유지', () => {
  const r = sanitizeRefDocs(['~/a.md', '', 'rel.md', '/Users/me/a.md', '/b.md'], HOME)
  assert.deepEqual(r.docs, ['/Users/me/a.md', '/b.md'])
  assert.deepEqual(
    r.rejected.map((x) => x.reason),
    ['empty', 'relative', 'duplicate'],
  )
})

test('저장 전 검사: 설정마다 5개 상한을 넘으면 뒤는 거부 (중복은 상한보다 먼저 거부)', () => {
  assert.equal(REF_DOCS_PER_TARGET, 5)
  const r = sanitizeRefDocs(['/d/0.md', '/d/1.md', '/d/0.md', '/d/2.md', '/d/3.md', '/d/4.md', '/d/5.md', '/d/6.md'], HOME)
  assert.deepEqual(r.docs, ['/d/0.md', '/d/1.md', '/d/2.md', '/d/3.md', '/d/4.md'])
  assert.deepEqual(r.rejected, [
    { input: '/d/0.md', reason: 'duplicate' },
    { input: '/d/5.md', reason: 'limit' },
    { input: '/d/6.md', reason: 'limit' },
  ])
})

test('합치기: 개인 → 팀 → 랩 순서, 같은 경로는 하나로 합치고 출처를 모두 적는다', () => {
  const r = mergeRefDocs(
    [
      { label: '개인', docs: ['/p.md', '/shared.md'] },
      { label: '팀 디자인', docs: ['/shared.md', '/t.md'] },
      { label: '랩 오피스', docs: ['/t.md', '/l.md'] },
    ],
    all,
  )
  assert.deepEqual(r.docs, [
    { path: '/p.md', sources: ['개인'] },
    { path: '/shared.md', sources: ['개인', '팀 디자인'] },
    { path: '/t.md', sources: ['팀 디자인', '랩 오피스'] },
    { path: '/l.md', sources: ['랩 오피스'] },
  ])
  assert.equal(r.omitted, 0)
})

test('합치기: 없는 파일은 빼서 missing으로 (여러 출처에 있어도 한 번)', () => {
  const r = mergeRefDocs(
    [
      { label: '개인', docs: ['/gone.md', '/ok.md'] },
      { label: '랩 A', docs: ['/gone.md'] },
    ],
    (p) => p !== '/gone.md',
  )
  assert.deepEqual(r.docs.map((d) => d.path), ['/ok.md'])
  assert.deepEqual(r.missing, ['/gone.md'])
})

test('합치기: 합계 15개를 넘으면 앞(개인 → 팀 → 랩)부터 남기고 생략 수를 센다', () => {
  const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `/${prefix}/${i}.md`)
  const r = mergeRefDocs(
    [
      { label: '개인', docs: many('p', 5) },
      { label: '팀 개발', docs: many('t', 5) },
      { label: '랩 A', docs: many('a', 5) },
      { label: '랩 B', docs: many('b', 5) },
    ],
    all,
  )
  assert.equal(r.docs.length, REF_DOCS_TOTAL)
  assert.equal(r.omitted, 5)
  assert.equal(r.docs[14].path, '/a/4.md')
  assert.ok(r.docs.every((d) => !d.path.startsWith('/b/')))
  assert.equal(mergeRefDocs([{ label: '개인', docs: many('p', 5) }], all, 3).omitted, 2)
})

test('프롬프트: 경로는 백틱으로 감싸고 출처·생략 줄을 적는다, 문서가 없으면 빈 문자열', () => {
  assert.equal(refDocsPrompt({ docs: [], omitted: 0 }), '')
  const text = refDocsPrompt({ docs: [{ path: '/내 문서/규칙.md', sources: ['개인', '랩 A'] }], omitted: 2 })
  assert.match(text, /^작업 전에 아래 참고 문서를 먼저 읽고/)
  assert.ok(text.includes('- `/내 문서/규칙.md` (개인 · 랩 A)'))
  assert.ok(text.endsWith('- 외 2개 생략'))
})

test('Read 허용: 등록된 경로(정규화 후 일치)의 Read만', () => {
  const docs = new Set(['/Users/me/p/CONTEXT.md'])
  assert.equal(isRefDocRead('Read', { file_path: '/Users/me/p/CONTEXT.md' }, docs, HOME), true)
  assert.equal(isRefDocRead('Read', { file_path: '~/p/./CONTEXT.md' }, docs, HOME), true)
  assert.equal(isRefDocRead('Read', { file_path: '/Users/me/p/SECRET.md' }, docs, HOME), false)
  assert.equal(isRefDocRead('Edit', { file_path: '/Users/me/p/CONTEXT.md' }, docs, HOME), false)
  assert.equal(isRefDocRead('Read', {}, docs, HOME), false)
})

test('Read 허용: ..·상대 경로·끝 슬래시로 다른 파일이 걸리지 않는다', () => {
  const docs = new Set(['/Users/me/p/CONTEXT.md'])
  assert.equal(isRefDocRead('Read', { file_path: '/Users/me/p/CONTEXT.md/../.env' }, docs, HOME), false)
  // 글자로는 등록 경로로 접히지만 sub가 폴더 링크면 다른 파일이 열리므로 결재로 보낸다
  assert.equal(isRefDocRead('Read', { file_path: '/Users/me/p/sub/../CONTEXT.md' }, docs, HOME), false)
  assert.equal(isRefDocRead('Read', { file_path: '/Users/me/p/link/..' }, docs, HOME), false)
  assert.equal(isRefDocRead('Read', { file_path: 'p/CONTEXT.md' }, docs, HOME), false)
  assert.equal(isRefDocRead('Read', { file_path: '/Users/me/p/CONTEXT.md/' }, docs, HOME), true)
  assert.equal(isRefDocRead('Read', { file_path: '/Users/me/p/CONTEXT.md.bak' }, docs, HOME), false)
})

test('랩 추천: 프로젝트 폴더의 CLAUDE.md·CONTEXT.md·README.md 중 있고 아직 없는 것', () => {
  const exists = (p: string) => p !== '/proj/CLAUDE.md'
  assert.deepEqual(suggestRefDocs('/proj/', ['/proj/README.md'], exists), ['/proj/CONTEXT.md'])
  assert.deepEqual(suggestRefDocs(null, [], exists), [])
})

test('목록 표시: 파일 이름과 폴더로 나눈다', () => {
  assert.deepEqual(splitRefDocPath('/a/b/SPEC.md'), { name: 'SPEC.md', dir: '/a/b' })
  assert.deepEqual(splitRefDocPath('/x.md'), { name: 'x.md', dir: '/' })
})

// ── 윈도우 경로 (어느 OS에서 돌려도 입력 모양으로 판단한다) ─────
const WIN_HOME = 'C:\\Users\\me'

test('윈도우: 드라이브 경로를 절대 경로로 받고 \\로 통일, 드라이브 문자는 대문자', () => {
  assert.equal(normalizeRefDocPath('C:\\Users\\me\\p\\CONTEXT.md', WIN_HOME), 'C:\\Users\\me\\p\\CONTEXT.md')
  assert.equal(normalizeRefDocPath('c:/Users/me/p/CONTEXT.md', WIN_HOME), 'C:\\Users\\me\\p\\CONTEXT.md')
  assert.equal(normalizeRefDocPath('C:/Users/me/p/..\\SECRET.md', WIN_HOME), 'C:\\Users\\me\\SECRET.md')
  assert.equal(normalizeRefDocPath('D:\\a\\\\b\\.\\c\\', WIN_HOME), 'D:\\a\\b\\c')
  assert.equal(normalizeRefDocPath('C:\\내 문서\\규칙 문서.md', WIN_HOME), 'C:\\내 문서\\규칙 문서.md')
  assert.equal(normalizeRefDocPath('C:relative.md', WIN_HOME), null)
})

test('윈도우: ~는 윈도우 홈으로, ~/와 ~\\ 둘 다', () => {
  assert.equal(normalizeRefDocPath('~/p/CONTEXT.md', WIN_HOME), 'C:\\Users\\me\\p\\CONTEXT.md')
  assert.equal(normalizeRefDocPath('~\\p\\CONTEXT.md', WIN_HOME), 'C:\\Users\\me\\p\\CONTEXT.md')
  // 맥 홈이면 ~\는 펼치지 않는다 (맥은 \가 파일 이름 글자)
  assert.equal(normalizeRefDocPath('~\\p.md', HOME), null)
})

test('맥 경로는 \\를 구분자로 보지 않는다', () => {
  assert.equal(normalizeRefDocPath('/a/x\\y.md', HOME), '/a/x\\y.md')
})

test('윈도우: 네트워크 폴더(\\\\서버)는 따로 거부한다', () => {
  assert.equal(normalizeRefDocPath('\\\\server\\share\\a.md', WIN_HOME), null)
  const r = sanitizeRefDocs(['\\\\server\\share\\a.md', 'rel.md'], WIN_HOME)
  assert.deepEqual(r.rejected.map((x) => x.reason), ['network', 'relative'])
})

test('윈도우: 대소문자만 다른 경로는 같은 문서 (등록 중복·합치기)', () => {
  const r = sanitizeRefDocs(['C:\\P\\CONTEXT.md', 'c:\\p\\context.md'], WIN_HOME)
  assert.deepEqual(r.docs, ['C:\\P\\CONTEXT.md'])
  assert.equal(r.rejected[0].reason, 'duplicate')
  const merged = mergeRefDocs([{ label: '개인', docs: ['C:\\P\\CONTEXT.md'] }, { label: '팀 A', docs: ['c:\\p\\context.md'] }], () => true)
  assert.deepEqual(merged.docs, [{ path: 'C:\\P\\CONTEXT.md', sources: ['개인', '팀 A'] }])
  // 맥은 대소문자를 그대로 구분한다
  assert.equal(sanitizeRefDocs(['/P/a.md', '/p/a.md'], HOME).docs.length, 2)
})

test('윈도우: 결재 없는 Read — 구분자·드라이브 대소문자 차이는 흡수, ..는 \\로 써도 결재', () => {
  const docs = new Set(['C:\\Users\\me\\p\\CONTEXT.md'])
  assert.equal(isRefDocRead('Read', { file_path: 'C:\\Users\\me\\p\\CONTEXT.md' }, docs, WIN_HOME), true)
  assert.equal(isRefDocRead('Read', { file_path: 'c:/users/me/p/context.md' }, docs, WIN_HOME), true)
  assert.equal(isRefDocRead('Read', { file_path: 'C:\\Users\\me\\p\\sub\\..\\CONTEXT.md' }, docs, WIN_HOME), false)
  assert.equal(isRefDocRead('Read', { file_path: 'C:/Users/me/p/..\\SECRET.md' }, docs, WIN_HOME), false)
  assert.equal(isRefDocRead('Read', { file_path: 'C:\\Users\\me\\p\\SECRET.md' }, docs, WIN_HOME), false)
})

test('윈도우: 추천 추가·이름/폴더 나누기도 같은 구분자 규칙', () => {
  const exists = (p: string) => p.endsWith('CLAUDE.md') || p.endsWith('README.md')
  assert.deepEqual(suggestRefDocs('C:\\proj\\', ['c:\\proj\\readme.md'], exists), ['C:\\proj\\CLAUDE.md'])
  assert.deepEqual(splitRefDocPath('C:\\Users\\me\\SPEC.md'), { name: 'SPEC.md', dir: 'C:\\Users\\me' })
  assert.deepEqual(splitRefDocPath('C:\\x.md'), { name: 'x.md', dir: 'C:\\' })
})
