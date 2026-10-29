// 직원·랩 파일 검증·내보내기·마켓·파일 입출력 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DICT } from '../src/shared/i18n/dict/index.ts'
import { setLang } from '../src/shared/i18n/index.ts'
import { BROWSER_EQUIPMENT } from '../src/shared/browserTools.ts'
import { AVATAR_LIMIT } from '../src/shared/look.ts'
import { READ_ONLY_BASH, RISKY_BASH } from '../src/shared/bashPolicy.ts'
import { PACK_FORMAT, PACK_LIMITS, PACK_MAX_BYTES, STAFF_MARKET, buildPackText, validatePackObject, validatePackText, type PackKnown } from '../src/shared/staffPack.ts'
import { readPackFile, writePackFile } from '../src/main/staffPackFile.ts'
import { fitEngineModel } from '../src/shared/engineModel.ts'
import { ROLE_ENGINE, recommendedEngine } from '../src/shared/roleEngine.ts'
import { ROLE_PRESETS } from '../src/shared/types.ts'

setLang('ko')

const known: PackKnown = { mcpServers: new Set([BROWSER_EQUIPMENT, 'github']), skills: new Set(['pdf-tools']) }

const staffEntry = (over: Record<string, unknown> = {}) => ({
  name: '민수',
  role: '백엔드 개발자',
  avatar: 42,
  model: 'sonnet',
  approvalMode: 'ask',
  systemPrompt: '서버 쪽 일을 맡습니다.',
  equipment: { mcpServers: ['github'], skills: ['pdf-tools'], allowedTools: ['Read'], disallowedTools: [], monthlyBudgetUsd: 5 },
  manuals: [{ name: 'release-note', description: '배포 기록 쓰기', body: '# 배포 기록\n1. 변경점을 적는다.' }],
  ...over,
})

const packOf = (staff: unknown[], extra: Record<string, unknown> = {}) => ({ format: PACK_FORMAT, version: 1, staff, ...extra })

const reasonOf = (raw: unknown) => {
  const r = validatePackObject(raw, known)
  assert.equal(r.ok, false, 'ok가 아니어야 해요')
  return r.ok ? '' : r.reason.key
}

test('정상 파일은 통과하고, 없는 장비만 빠진다', () => {
  const raw = packOf([staffEntry({ equipment: { mcpServers: ['github', 'no-such-mcp'], skills: ['pdf-tools', 'release-note', 'ghost-skill'], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 } })])
  const r = validatePackObject(raw, known)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.pack.staff[0].equipment.mcpServers, ['github'])
  // 파일에 든 매뉴얼은 같이 만들어지므로 장비로 인정한다
  assert.deepEqual(r.pack.staff[0].equipment.skills, ['pdf-tools', 'release-note'])
  assert.deepEqual(r.excluded.sort(), ['ghost-skill', 'no-such-mcp'])
})

test('skills가 all이면 그대로 두고, 빠진 필드는 기본값으로 채운다', () => {
  const r = validatePackObject(packOf([{ name: '지수', role: 'QA', avatar: 0, model: 'default' }]), known)
  assert.equal(r.ok, true)
  if (!r.ok) return
  const [s] = r.pack.staff
  assert.equal(s.approvalMode, 'ask')
  assert.equal(s.systemPrompt, '')
  assert.deepEqual(s.manuals, [])
  assert.deepEqual(s.equipment, { mcpServers: [], skills: [], allowedTools: [], disallowedTools: [RISKY_BASH], monthlyBudgetUsd: 0 })
  const all = validatePackObject(packOf([staffEntry({ equipment: { skills: 'all', mcpServers: [] } })]), known)
  assert.equal(all.ok && all.pack.staff[0].equipment.skills, 'all')
})

test('파일 크기 상한(1MB)을 넘으면 읽기 전에 거절한다', () => {
  const big = 'a'.repeat(PACK_MAX_BYTES + 1)
  const r = validatePackText(big, known)
  assert.deepEqual(r.ok ? null : r.reason, { key: 'pack.err.size' })
})

test('JSON이 아니면 파싱 실패, 빈 글도 실패', () => {
  assert.equal(validatePackText('{not json', known).ok, false)
  const r = validatePackText('{not json', known)
  assert.equal(!r.ok && r.reason.key, 'pack.err.parse')
  const empty = validatePackText('', known)
  assert.equal(!empty.ok && empty.reason.key, 'pack.err.parse')
})

test('형식 이름과 버전을 확인한다', () => {
  assert.equal(reasonOf({ format: 'other', version: 1, staff: [staffEntry()] }), 'pack.err.format')
  assert.equal(reasonOf({ format: PACK_FORMAT, version: 2, staff: [staffEntry()] }), 'pack.err.version')
  assert.equal(reasonOf(['not', 'object']), 'pack.err.shape')
})

test('직접 입력한 직무도 받고, 빈 직무·너무 긴 직무는 막는다', () => {
  const custom = validatePackObject(packOf([staffEntry({ role: ' 마법사 ' })]), known)
  assert.equal(custom.ok && custom.pack.staff[0].role, '마법사')
  assert.equal(reasonOf(packOf([staffEntry({ role: '  ' })])), 'pack.err.role')
  assert.equal(reasonOf(packOf([staffEntry({ role: 'ㄱ'.repeat(41) })])), 'pack.err.role')
  assert.equal(reasonOf(packOf([staffEntry({ role: 3 })])), 'pack.err.role')
})

test('모델은 앱이 아는 값만 허용한다', () => {
  assert.equal(reasonOf(packOf([staffEntry({ model: 'gpt-x' })])), 'pack.err.model')
})

test('아바타 번호는 정수이고 범위 안이어야 한다', () => {
  assert.equal(reasonOf(packOf([staffEntry({ avatar: -1 })])), 'pack.err.avatar')
  assert.equal(reasonOf(packOf([staffEntry({ avatar: 1.5 })])), 'pack.err.avatar')
  assert.equal(reasonOf(packOf([staffEntry({ avatar: AVATAR_LIMIT })])), 'pack.err.avatar')
  assert.equal(reasonOf(packOf([staffEntry({ avatar: '3' })])), 'pack.err.avatar')
})

test('경로 필드는 어디에 있어도 파일 전체를 거절한다', () => {
  assert.equal(reasonOf(packOf([staffEntry({ cwd: '/Users/someone/project' })])), 'pack.err.path')
  assert.equal(reasonOf(packOf([staffEntry({ refDocs: ['/a/b.md'] })])), 'pack.err.path')
  assert.equal(reasonOf(packOf([staffEntry({ manuals: [{ name: 'release-note', body: 'x', path: '/x/SKILL.md' }] })])), 'pack.err.path')
  assert.equal(reasonOf(packOf([staffEntry()], { lab: { name: '랩', color: '#e8925a', goal: '', leader: null, projectDir: '/tmp' } })), 'pack.err.path')
})

test('직원 수·이름·지침 길이 상한', () => {
  assert.equal(reasonOf(packOf([])), 'pack.err.staffCount')
  assert.equal(reasonOf(packOf(Array.from({ length: PACK_LIMITS.staff + 1 }, () => staffEntry()))), 'pack.err.staffCount')
  assert.equal(reasonOf(packOf([staffEntry({ name: '' })])), 'pack.err.staffName')
  assert.equal(reasonOf(packOf([staffEntry({ name: 'a'.repeat(PACK_LIMITS.nameMax + 1) })])), 'pack.err.staffName')
  assert.equal(reasonOf(packOf([staffEntry({ systemPrompt: 'a'.repeat(PACK_LIMITS.promptMax + 1) })])), 'pack.err.prompt')
})

test('장비 값: 예산 범위, 목록 개수 상한, 잘못된 형식', () => {
  const eq = (over: Record<string, unknown>) => ({ equipment: { mcpServers: [], skills: [], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0, ...over } })
  assert.equal(reasonOf(packOf([staffEntry(eq({ monthlyBudgetUsd: -1 }))])), 'pack.err.budget')
  assert.equal(reasonOf(packOf([staffEntry(eq({ monthlyBudgetUsd: PACK_LIMITS.budgetMax + 1 }))])), 'pack.err.budget')
  assert.equal(reasonOf(packOf([staffEntry(eq({ allowedTools: Array.from({ length: PACK_LIMITS.listItems + 1 }, (_, i) => `t${i}`) }))])), 'pack.err.equipment')
  assert.equal(reasonOf(packOf([staffEntry(eq({ skills: 'some' }))])), 'pack.err.equipment')
})

test('매뉴얼: 이름 규칙, 개수, 내용 길이, 같은 이름 내용 충돌', () => {
  const withManuals = (manuals: unknown[]) => packOf([staffEntry({ manuals })])
  assert.equal(reasonOf(withManuals([{ name: 'Bad Name', body: 'x' }])), 'pack.err.manualName')
  assert.equal(reasonOf(withManuals([{ name: 'a', body: 'x' }])), 'pack.err.manualName')
  assert.equal(reasonOf(withManuals([{ name: 'ok-name', body: '' }])), 'pack.err.manualBody')
  assert.equal(reasonOf(withManuals([{ name: 'ok-name', body: 'a'.repeat(PACK_LIMITS.manualBodyMax + 1) }])), 'pack.err.manualBody')
  assert.equal(reasonOf(withManuals(Array.from({ length: PACK_LIMITS.manualsPerStaff + 1 }, (_, i) => ({ name: `m-${i}`, body: 'x' })))), 'pack.err.manualCount')
  const conflict = packOf([staffEntry({ manuals: [{ name: 'same-one', body: 'A' }] }), staffEntry({ name: '영희', manuals: [{ name: 'same-one', body: 'B' }] })])
  const r = validatePackObject(conflict, known)
  assert.equal(!r.ok && r.reason.key, 'pack.err.manualConflict')
  const same = packOf([staffEntry({ manuals: [{ name: 'same-one', body: 'A' }] }), staffEntry({ name: '영희', manuals: [{ name: 'same-one', body: 'A' }] })])
  assert.equal(validatePackObject(same, known).ok, true)
})

test('랩: 색은 #rrggbb, 리드는 파일 안의 직원 번호', () => {
  const lab = (over: Record<string, unknown>) => packOf([staffEntry(), staffEntry({ name: '영희' })], { lab: { name: '신규 랩', color: '#4a7fe0', goal: '목표', leader: 0, ...over } })
  const ok = validatePackObject(lab({}), known)
  assert.equal(ok.ok, true)
  assert.equal(reasonOf(lab({ color: 'red' })), 'pack.err.lab')
  assert.equal(reasonOf(lab({ name: '' })), 'pack.err.lab')
  assert.equal(reasonOf(lab({ leader: 2 })), 'pack.err.leader')
  assert.equal(reasonOf(lab({ leader: 1.5 })), 'pack.err.leader')
  assert.equal(validatePackObject(lab({ leader: null }), known).ok, true)
})

test('예전 방식의 __proto__ 같은 키는 결과에 옮겨지지 않는다', () => {
  const r = validatePackText('{"format":"claude-office-pack","version":1,"__proto__":{"polluted":true},"staff":[{"name":"a","role":"QA","avatar":1,"model":"default"}]}', known)
  assert.equal(r.ok, true)
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  if (r.ok) assert.equal('polluted' in r.pack, false)
})

test('내보내기: 버전 식별과 경로 없이 만들고, 큰 아바타 번호는 접는다', () => {
  const built = buildPackText(
    [
      {
        name: '철수',
        role: '코드 리뷰어',
        avatar: 4_000_000_000,
        model: 'opus',
        approvalMode: 'acceptEdits',
        systemPrompt: '리뷰만 합니다.',
        equipment: { mcpServers: ['github'], skills: 'all', allowedTools: [], disallowedTools: ['Bash'], monthlyBudgetUsd: 3 },
        manuals: [{ name: 'review-rules', description: '검토 기준', body: '검토 기준 본문' }],
      },
    ],
    { name: '품질 랩', color: '#58b07a', goal: '출시 품질', leader: 0 },
  )
  assert.equal(built.ok, true)
  if (!built.ok) return
  assert.equal(built.text.includes('cwd'), false)
  assert.equal(built.text.includes('refDocs'), false)
  const parsed = JSON.parse(built.text)
  assert.equal(parsed.format, PACK_FORMAT)
  assert.ok(parsed.staff[0].avatar < AVATAR_LIMIT)
  assert.equal(parsed.lab.leader, 0)
  // 내보낸 글은 다시 가져올 때 그대로 통과한다
  const again = validatePackText(built.text, { mcpServers: new Set(['github']), skills: new Set() })
  assert.equal(again.ok, true)
})

test('가져오기: 결재 설정은 따르지 않는다 — 허용 도구는 읽기 명령만, 결재 방식은 ask, 위험 명령 금지는 늘 켠다', () => {
  const raw = packOf([staffEntry({ approvalMode: 'acceptEdits', equipment: { allowedTools: ['Bash', 'Write', 'mcp__slack__send_message', READ_ONLY_BASH], disallowedTools: ['WebFetch'] } })])
  const r = validatePackObject(raw, known)
  assert.equal(r.ok, true)
  if (!r.ok) return
  const [s] = r.pack.staff
  assert.equal(s.approvalMode, 'ask')
  assert.deepEqual(s.equipment.allowedTools, [READ_ONLY_BASH])
  assert.deepEqual(s.equipment.disallowedTools, ['WebFetch', RISKY_BASH])
  // 알 수 없는 결재 방식도 거절하지 않고 ask로 맞춘다
  const odd = validatePackObject(packOf([staffEntry({ approvalMode: 'bypassPermissions' })]), known)
  assert.equal(odd.ok && odd.pack.staff[0].approvalMode, 'ask')
  // 내보낸 파일에는 결재 방식·허용 도구가 없다
  const built = buildPackText([{ name: '철수', role: 'QA', avatar: 1, model: 'default', approvalMode: 'acceptEdits', systemPrompt: '', equipment: { mcpServers: [], skills: [], allowedTools: ['Bash'], disallowedTools: [], monthlyBudgetUsd: 0 }, manuals: [] }])
  assert.equal(built.ok, true)
  if (!built.ok) return
  const parsed = JSON.parse(built.text)
  assert.equal('approvalMode' in parsed.staff[0], false)
  assert.equal('allowedTools' in parsed.staff[0].equipment, false)
})

test('내보내기: 1MB를 넘으면 이유를 돌려준다', () => {
  const body = 'x'.repeat(PACK_LIMITS.manualBodyMax)
  const manuals = Array.from({ length: PACK_LIMITS.manualsPerStaff }, (_, i) => ({ name: `m-${i}`, description: '', body }))
  const staff = Array.from({ length: 10 }, (_, i) => ({ name: `직원${i}`, role: 'QA', avatar: 1, model: 'default' as const, approvalMode: 'ask' as const, systemPrompt: '', equipment: { mcpServers: [], skills: [], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 }, manuals }))
  const built = buildPackText(staff)
  assert.equal(built.ok, false)
  assert.equal(!built.ok && built.reason.key, 'pack.err.exportTooBig')
})

test('기본 직원 마켓 항목은 모두 검증을 통과하고 번역 키가 4개 언어로 있다', () => {
  assert.ok(STAFF_MARKET.length >= 5 && STAFF_MARKET.length <= 6)
  for (const tpl of STAFF_MARKET) {
    const r = validatePackObject(
      packOf([{ name: 'x', role: tpl.role, avatar: 7, model: tpl.model, approvalMode: tpl.approvalMode, systemPrompt: tpl.systemPrompt }]),
      known,
    )
    assert.equal(r.ok, true, `${tpl.id} 검증 실패`)
    for (const suffix of ['name', 'desc']) {
      const entry = (DICT as Record<string, { ko: string; en: string; ja: string; zh: string } | undefined>)[`pack.market.${tpl.id}.${suffix}`]
      assert.ok(entry, `${tpl.id}.${suffix} 번역 키가 없어요`)
      for (const lang of ['ko', 'en', 'ja', 'zh'] as const) assert.ok(entry[lang].trim() !== '', `${tpl.id}.${suffix} ${lang} 번역이 비었어요`)
    }
  }
})

test('직무 추천 엔진: 마켓 직무는 모두 추천이 있고, 이유 문구가 4개 언어로 있으며, 고른 엔진으로도 검증을 통과한다', () => {
  for (const role of Object.keys(ROLE_ENGINE)) assert.ok((ROLE_PRESETS as readonly string[]).includes(role), `${role}은 직무 목록에 없어요`)
  assert.equal(recommendedEngine('자유 직무'), null)
  for (const tpl of STAFF_MARKET) {
    const rec = recommendedEngine(tpl.role)
    assert.ok(rec, `${tpl.id} 추천 엔진이 없어요`)
    const entry = (DICT as Record<string, { ko: string; en: string; ja: string; zh: string } | undefined>)[`engine.reason.${rec.slug}`]
    assert.ok(entry, `engine.reason.${rec.slug} 번역 키가 없어요`)
    for (const lang of ['ko', 'en', 'ja', 'zh'] as const) assert.ok(entry[lang].trim() !== '')
    for (const provider of ['claude', 'codex'] as const) {
      const fit = fitEngineModel(provider, tpl.model)
      const r = validatePackObject(packOf([{ name: 'x', role: tpl.role, avatar: 7, provider: fit.provider, model: fit.model, approvalMode: tpl.approvalMode, systemPrompt: tpl.systemPrompt }]), known)
      assert.equal(r.ok, true, `${tpl.id} ${provider} 검증 실패`)
      if (r.ok) assert.equal(r.pack.staff[0].provider, provider)
    }
  }
})

test('파일 읽기·쓰기: 저장한 파일을 다시 읽어 검증하고, 크기 초과·없는 파일·없는 폴더를 구분한다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-pack-'))
  try {
    const built = buildPackText([{ name: '영희', role: 'QA', avatar: 3, model: 'haiku', approvalMode: 'ask', systemPrompt: '', equipment: { mcpServers: [], skills: [], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 }, manuals: [] }])
    assert.equal(built.ok, true)
    if (!built.ok) return
    const file = path.join(dir, 'saved.json')
    assert.equal(writePackFile(file, built.text), null)
    const read = readPackFile(file)
    assert.equal(read.ok, true)
    if (read.ok) assert.equal(validatePackText(read.text, known).ok, true)

    const huge = path.join(dir, 'huge.json')
    fs.writeFileSync(huge, 'a'.repeat(PACK_MAX_BYTES + 10))
    const big = readPackFile(huge)
    assert.equal(!big.ok && big.reason.key, 'pack.err.size')

    const missing = readPackFile(path.join(dir, 'nope.json'))
    assert.equal(!missing.ok && missing.reason.key, 'pack.err.read')

    const failedWrite = writePackFile(path.join(dir, 'no-folder', 'x.json'), '{}')
    assert.deepEqual(failedWrite, { key: 'pack.err.write' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('직접 입력한 직무의 직원도 내보낼 수 있다', () => {
  const built = buildPackText([{ name: '영희', role: '마법사', avatar: 1, model: 'default', approvalMode: 'acceptEdits', systemPrompt: '', equipment: { mcpServers: [], skills: [], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 }, manuals: [] }])
  assert.equal(built.ok, true)
})
