// 파일 복사본·변경 묶음(설계서 7절) 단위 시험: 금지 경로(pathPolicy)·충돌 판정표·제외 목록·한도·변경 목록 검증
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { validateChangeSet } from '../src/main/peer/sync/changeset.ts'
import { judge } from '../src/main/peer/sync/conflict.ts'
import { isExcluded, manifestRev, scanFolder, validateManifest } from '../src/main/peer/sync/manifest.ts'
import { checkPath, checkPaths, isSensitive, parentsSafe, resolveInside, rootAllowed } from '../src/main/peer/sync/pathPolicy.ts'
import type { WorkspaceRecord } from '../src/main/peer/sync/syncDb.ts'
import { SyncError, SYNC_LIMITS, type Manifest, type SyncEntry } from '../src/shared/peerSync.ts'
import DICT from '../src/shared/i18n/dict/peerSync.ts'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const SHA_C = 'c'.repeat(64)
const WS = '11111111-1111-4111-8111-111111111111'
const CS = '22222222-2222-4222-8222-222222222222'

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'peersync-'))

test('금지 경로: 폴더 밖·절대 경로·빈 구성요소·역슬래시·제어 문자는 거절', () => {
  for (const p of ['../x', 'a/../../x', 'a/..', '/etc/passwd', 'C:/x', 'a//b', 'a/', '', 'a\\b', 'a\u0000b', 'a\nb', '.', 'a/./b', '..\u200D/x', '.. /x', '...']) {
    assert.notEqual(checkPath(p), null, p)
  }
  assert.equal(checkPath('x'.repeat(256)), 'part_too_long')
  assert.equal(checkPath(('a/').repeat(600) + 'b'), 'too_long')
  assert.equal(checkPath(42), 'not_string')
})

test('금지 경로: .git 안은 대소문자·유니코드 무시 문자·끝 점·공백을 바꿔도 거절', () => {
  for (const p of ['.git/config', 'sub/.git/hooks/pre-commit', '.GIT/config', '.Git/HEAD', '.g\u200Dit/config', '.git./config', '.git /config', '\uFEFF.git/x', '.git']) {
    assert.equal(checkPath(p), 'git', p)
  }
  // .git 안이 아닌 비슷한 이름은 허용 (민감 경로로 따로 표시)
  for (const p of ['.gitignore', '.gitmodules', 'docs/.github/x.yml', 'my.git/x']) assert.equal(checkPath(p), null, p)
  assert.equal(isSensitive('.gitignore'), true)
})

test('금지 경로: NFC가 아닌 이름과 대소문자·정규화만 다른 중복은 거절', () => {
  assert.equal(checkPath('한글.txt'.normalize('NFD')), 'not_nfc')
  assert.deepEqual(checkPaths(['src/A.txt', 'src/a.txt']), { path: 'src/a.txt', problem: 'duplicate' })
  assert.equal(checkPaths(['src/a.txt', 'src/b.txt', '한글.txt']), null)
})

test('민감 경로: 실행·빌드 설정과 .claude·CI 폴더는 표시', () => {
  for (const p of ['.claude/settings.json', '.github/workflows/ci.yml', 'package.json', 'deploy.sh', 'Makefile', '.env.local', 'sub/Dockerfile', 'CLAUDE.md']) assert.equal(isSensitive(p), true, p)
  for (const p of ['src/index.ts', 'README.md', 'docs/package.md']) assert.equal(isSensitive(p), false, p)
})

test('resolveInside: 루트 밖으로 나가는 경로는 null', () => {
  assert.equal(resolveInside('/r/root', 'a/b.txt'), '/r/root/a/b.txt')
  assert.equal(resolveInside('/r/root', '../root2/x'), null)
  assert.equal(resolveInside('/r/root', '/etc/x'), null)
})

test('심볼릭 링크: 부모 폴더 중 링크가 있으면 parentsSafe=false', async () => {
  const dir = await tmp()
  const outside = await tmp()
  await fs.mkdir(path.join(dir, 'real'))
  await fs.symlink(outside, path.join(dir, 'link'))
  assert.equal(await parentsSafe(dir, 'real/x.txt'), true)
  assert.equal(await parentsSafe(dir, 'new/deeper/x.txt'), true)
  assert.equal(await parentsSafe(dir, 'link/x.txt'), false)
  assert.equal(await parentsSafe(dir, 'link/sub/x.txt'), false)
})

test('루트 보호: 등록된 랩 폴더만, 홈·시스템 폴더·userData는 안 된다', async () => {
  const home = await tmp()
  const lab = path.join(home, 'lab')
  const userData = path.join(home, 'Library', 'AI Office')
  await fs.mkdir(lab)
  await fs.mkdir(userData, { recursive: true })
  const real = await fs.realpath(lab)
  assert.equal(await rootAllowed(lab, { registered: [lab], forbidden: [userData], home }), real)
  assert.equal(await rootAllowed(lab, { registered: [], home }), null, '등록 안 됨')
  assert.equal(await rootAllowed(home, { registered: [home], home }), null, '홈')
  assert.equal(await rootAllowed('/', { registered: ['/'], home }), null, '루트')
  assert.equal(await rootAllowed(userData, { registered: [userData], forbidden: [userData], home }), null, 'userData')
  assert.equal(await rootAllowed(path.join(home, 'Library'), { registered: [path.join(home, 'Library')], forbidden: [userData], home }), null, 'userData를 품은 폴더')
  // 링크 루트는 realpath로 풀어 등록된 폴더인지 본다
  const ln = path.join(home, 'lab-link')
  await fs.symlink(lab, ln)
  assert.equal(await rootAllowed(ln, { registered: [lab], home }), real)
  assert.equal(await rootAllowed(ln, { registered: [path.join(home, 'other')], home }), null)
})

test('충돌 판정표 (설계서 7-5)', () => {
  const rows: [Parameters<typeof judge>[0], string | undefined, Parameters<typeof judge>[2], string, string?][] = [
    [{ op: 'modify', sha256: SHA_B }, SHA_A, SHA_A, 'apply'],
    [{ op: 'modify', sha256: SHA_B }, SHA_A, SHA_B, 'same'],
    [{ op: 'modify', sha256: SHA_B }, SHA_A, SHA_C, 'conflict', 'changed_here'],
    [{ op: 'modify', sha256: SHA_B }, SHA_A, null, 'conflict', 'deleted_here'],
    [{ op: 'add', sha256: SHA_B }, undefined, null, 'apply'],
    [{ op: 'add', sha256: SHA_B }, undefined, SHA_B, 'same'],
    [{ op: 'add', sha256: SHA_B }, undefined, SHA_C, 'conflict', 'exists_here'],
    [{ op: 'delete' }, SHA_A, SHA_A, 'apply'],
    [{ op: 'delete' }, SHA_A, SHA_C, 'conflict', 'changed_here'],
    [{ op: 'delete' }, SHA_A, null, 'same'],
    [{ op: 'add', sha256: SHA_B }, undefined, 'not_a_file', 'conflict', 'not_a_file'],
  ]
  for (const [c, base, cur, verdict, reason] of rows) assert.deepEqual(judge(c, base, cur), reason ? { verdict, reason } : { verdict }, JSON.stringify([c, cur]))
})

test('기본 제외: .git·node_modules·비밀 파일은 빼고, 대표 제외는 더하기만', () => {
  for (const [p, dir] of [['.git', true], ['a/.GIT', true], ['node_modules', true], ['.env', false], ['.env.production', false], ['keys/server.pem', false], ['id_rsa', false], ['.npmrc', false], ['.ssh', true], ['.DS_Store', false], ['.git', false]] as const) assert.equal(isExcluded(p, dir), true, p)
  assert.equal(isExcluded('src/app.ts', false), false)
  assert.equal(isExcluded('data/big.csv', false, ['data']), true)
  assert.equal(isExcluded('raw', true, ['raw/']), true)
})

test('폴더 훑기: 링크·큰 파일은 건너뜀으로 남기고, 제외 목록을 돌려준다', async () => {
  const dir = await tmp()
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello')
  await fs.writeFile(path.join(dir, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 })
  await fs.mkdir(path.join(dir, '.git'))
  await fs.writeFile(path.join(dir, '.git', 'config'), 'x')
  await fs.writeFile(path.join(dir, '.env'), 'SECRET=1')
  await fs.symlink('/etc/hosts', path.join(dir, 'hosts'))
  const fh = await fs.open(path.join(dir, 'big.bin'), 'w')
  await fh.truncate(SYNC_LIMITS.fileMax + 1)
  await fh.close()
  const r = await scanFolder(dir, { limits: { maxFiles: 10, maxBytes: 1e6, code: 'workspace_too_large' } })
  assert.deepEqual(r.entries.map((e) => [e.path, e.exec]), [['a.txt', false], ['run.sh', true]])
  assert.deepEqual(r.skipped, [{ path: 'big.bin', reason: 'too_large' }, { path: 'hosts', reason: 'symlink' }])
  assert.deepEqual(r.excluded.sort(), ['.env', '.git'])
})

test('한도: 복사본 파일 수·총량을 넘으면 workspace_too_large', async () => {
  const dir = await tmp()
  for (let i = 0; i < 5; i++) await fs.writeFile(path.join(dir, `f${i}.txt`), 'x'.repeat(100))
  await assert.rejects(scanFolder(dir, { limits: { maxFiles: 4, maxBytes: 1e6, code: 'workspace_too_large' } }), (e: unknown) => e instanceof SyncError && e.code === 'workspace_too_large')
  await assert.rejects(scanFolder(dir, { limits: { maxFiles: 100, maxBytes: 350, code: 'workspace_too_large' } }), (e: unknown) => e instanceof SyncError && e.code === 'workspace_too_large')
})

const entry = (p: string, sha = SHA_A, size = 1): SyncEntry => ({ path: p, size, sha256: sha, exec: false })
const manifestOf = (entries: SyncEntry[]): Manifest => ({ workspaceId: WS, rootName: 'lab', createdAt: 1, rev: manifestRev(entries), entries })

test('목록 검사(B컴): 금지 경로·한도·rev 불일치·파일/폴더 겹침은 거절', () => {
  assert.equal(validateManifest(manifestOf([entry('a.txt'), entry('src/b.txt')])), null)
  assert.equal(validateManifest(manifestOf([entry('../x')])), 'path:dot_part')
  assert.equal(validateManifest(manifestOf([entry('.git/config')])), 'path:git')
  assert.equal(validateManifest(manifestOf([entry('A.txt'), entry('a.txt')])), 'path:duplicate')
  assert.equal(validateManifest(manifestOf([entry('a'), entry('a/b')])), 'path:file_as_dir')
  assert.equal(validateManifest(manifestOf([entry('big', SHA_A, SYNC_LIMITS.fileMax + 1)])), 'entry')
  assert.equal(validateManifest(manifestOf(Array.from({ length: 26 }, (_, i) => entry(`f${i}`, SHA_A, SYNC_LIMITS.fileMax)))), 'too_large')
  assert.equal(validateManifest(manifestOf(Array.from({ length: SYNC_LIMITS.workspaceFiles + 1 }, (_, i) => entry(`f${i}`)))), 'too_many_files')
  assert.equal(validateManifest({ ...manifestOf([entry('a.txt')]), rev: SHA_B }), 'rev')
})

const wsRecord = (entries: SyncEntry[]): WorkspaceRecord => ({ id: WS, side: 'a', root: '/r', manifest: manifestOf(entries), state: 'pushed', bytes: 0, createdAt: 1 })
const csOf = (ws: WorkspaceRecord, changes: unknown[], over: Record<string, unknown> = {}) => ({ changesetId: CS, workspaceId: WS, baseRev: ws.manifest.rev, jobId: 'job', changes, skipped: [], ...over })
const rejected = (why?: RegExp) => (e: unknown) => e instanceof SyncError && e.code === 'changes_rejected' && (!why || why.test(e.detail ?? ''))

test('변경 목록 검사(A컴): 경로 하나라도 금지면 묶음 전체 거절', () => {
  const ws = wsRecord([entry('a.txt'), entry('src/b.txt')])
  const ok = { op: 'modify', path: 'a.txt', size: 2, sha256: SHA_B, exec: false }
  assert.equal(validateChangeSet(csOf(ws, [ok]), ws, CS).changes.length, 1)
  for (const bad of ['../evil.sh', '/etc/passwd', '.git/hooks/pre-commit', 'src/.GIT/config', '.g\u200Dit/HEAD', 'a\\b']) {
    assert.throws(() => validateChangeSet(csOf(ws, [ok, { op: 'add', path: bad, size: 1, sha256: SHA_C, exec: false }]), ws, CS), rejected(/^path:/), bad)
  }
})

test('변경 목록 검사(A컴): base는 A컴 목록 값으로 덮고, 모르는 파일 수정·삭제와 있는 파일 추가는 거절', () => {
  const ws = wsRecord([entry('a.txt', SHA_A)])
  const v = validateChangeSet(csOf(ws, [{ op: 'modify', path: 'a.txt', size: 1, sha256: SHA_B, baseSha256: SHA_C, exec: false }]), ws, CS)
  assert.equal(v.changes[0].baseSha256, SHA_A, 'B컴이 준 base를 믿지 않는다')
  assert.throws(() => validateChangeSet(csOf(ws, [{ op: 'modify', path: 'zz.txt', size: 1, sha256: SHA_B, exec: false }]), ws, CS), rejected(/modify_unknown/))
  assert.throws(() => validateChangeSet(csOf(ws, [{ op: 'delete', path: 'zz.txt' }]), ws, CS), rejected(/delete_unknown/))
  assert.throws(() => validateChangeSet(csOf(ws, [{ op: 'add', path: 'A.TXT', size: 1, sha256: SHA_B, exec: false }]), ws, CS), rejected(/add_existing/))
  assert.throws(() => validateChangeSet(csOf(ws, [{ op: 'add', path: 'a.txt/x', size: 1, sha256: SHA_B, exec: false }]), ws, CS), rejected(/file_as_dir/))
  assert.throws(() => validateChangeSet(csOf(ws, [], { baseRev: SHA_C }), ws, CS), rejected(/base_rev/))
  assert.throws(() => validateChangeSet(csOf(ws, [], { workspaceId: CS }), ws, CS), rejected(/id/))
  assert.throws(() => validateChangeSet(csOf(ws, [{ op: 'chmod', path: 'b.txt', size: 1, sha256: SHA_B, exec: false }]), ws, CS), rejected(/op/))
})

test('한도(A컴): 파일 하나 20MB·묶음 2천 개·200MB를 넘으면 거절', () => {
  const ws = wsRecord([])
  const add = (p: string, size = 1) => ({ op: 'add', path: p, size, sha256: SHA_B, exec: false })
  assert.throws(() => validateChangeSet(csOf(ws, [add('big', SYNC_LIMITS.fileMax + 1)]), ws, CS), rejected(/file_too_large/))
  assert.throws(() => validateChangeSet(csOf(ws, Array.from({ length: SYNC_LIMITS.changesFiles + 1 }, (_, i) => add(`f${i}`))), ws, CS), rejected(/too_many_files/))
  assert.throws(() => validateChangeSet(csOf(ws, Array.from({ length: 11 }, (_, i) => add(`f${i}`, SYNC_LIMITS.fileMax))), ws, CS), rejected(/too_large/))
})

test('화면 문구: peerSync.* 는 4개 언어가 모두 있다', () => {
  for (const [k, v] of Object.entries(DICT)) for (const lang of ['ko', 'en', 'ja', 'zh'] as const) assert.ok((v as Record<string, string>)[lang]?.trim(), `${k}.${lang}`)
})
