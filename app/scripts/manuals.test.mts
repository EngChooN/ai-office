// 매뉴얼 개편: 이름 규칙 한 곳·표시 이름 저장·저장할 수 없는 이유·직원 팩 title·원격·비서·예시 템플릿 사전
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { MANUAL_NAME_RE, TITLE_MAX, cleanTitle, isValidManualName, manualLabel, resolveTitle, slugFromTitle, uniqueManualName } from '../src/shared/manualName.ts'
import { isDirty, manualProblems, stepHasExtras } from '../src/shared/manualForm.ts'
import { MANUAL_TEMPLATES, fromTemplate, templateKeys } from '../src/shared/manualTemplates.ts'
import { listManuals, saveManual } from '../src/main/manuals.ts'
import { buildPackText, validatePackObject, PACK_FORMAT, type PackKnown } from '../src/shared/staffPack.ts'
import { checkArgs, pickFields, V2_FIELDS, V2_METHODS } from '../src/main/remote/v2.ts'
import { compactManual } from '../src/main/secretaryCompact.ts'
import { SECRETARY_SIGNATURES } from '../src/shared/secretaryTools.ts'
import { DICT } from '../src/shared/i18n/dict/index.ts'
import { setLang } from '../src/shared/i18n/index.ts'
import type { Manual, ManualInput, ProcessStep } from '../src/shared/types.ts'

const LANGS = ['ko', 'en', 'ja', 'zh'] as const
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'manuals-'))
const input = (o: Partial<ManualInput> = {}): ManualInput => ({ name: '', title: '', description: '', kind: 'personal', scope: 'project', projectDir: proj, body: '', steps: [], ...o })
const step = (o: Partial<ProcessStep> = {}): ProcessStep => ({ id: 's1', title: '쓰기', role: '작성자', instruction: '써 주세요', needsMyCheck: false, onRevise: null, maxLoops: 2, ...o })
const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}

// ── 이름 규칙
test('한글뿐인 제목은 manual-무작위 6자, 규칙 통과', () => {
  const s = slugFromTitle('주간 보고', seq(0.123456789))
  assert.match(s, /^manual-[a-z0-9]{6}$/)
  assert.ok(isValidManualName(s))
})

test('영문이 충분하면 영문 부분을 쓴다', () => {
  assert.equal(slugFromTitle('PR Review 체크'), 'pr-review')
  assert.equal(slugFromTitle('Weekly Report!'), 'weekly-report')
})

test('영문 4자 미만·빈 값·기호만이면 무작위 이름', () => {
  for (const title of ['QA 점검', '', '!!! ???', 'ab']) assert.match(slugFromTitle(title, seq(0.5)), /^manual-[a-z0-9]{6}$/, title)
})

test('겹치면 -2·-3, 63자 이름에 붙여도 규칙 통과', () => {
  const taken = new Set(['weekly-report', 'weekly-report-2'])
  assert.equal(uniqueManualName('weekly-report', (n) => taken.has(n)), 'weekly-report-3')
  const long = 'a'.repeat(63)
  const next = uniqueManualName(long, (n) => n === long)
  assert.equal(next.length, 63)
  assert.ok(next.endsWith('-2') && isValidManualName(next))
})

test('무작위 이름은 난수를 바꿔 끼울 수 있고, 여러 번 만들어도 늘 규칙 통과', () => {
  assert.equal(slugFromTitle('보고', seq(0.25)), slugFromTitle('보고', seq(0.25)))
  for (let i = 0; i < 200; i++) assert.ok(isValidManualName(slugFromTitle('한글 제목')))
  // 0 같은 난수도 6자를 채운다
  assert.ok(isValidManualName(slugFromTitle('한글', () => 0)))
})

test('이름 규칙은 한 곳: main·직원 팩·화면에 정규식을 따로 두지 않는다', () => {
  const src = (f: string) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  for (const f of ['main/manuals.ts', 'shared/staffPack.ts', 'renderer/features/ManualsPage.tsx', 'renderer/features/ManualEditor.tsx', 'renderer/features/NewManualDialog.tsx']) assert.ok(!src(f).includes('[a-z0-9-]{1,62}'), f)
  for (const bad of ['Bad Name', 'a', 'x'.repeat(64), '보고서', '-lead']) assert.equal(MANUAL_NAME_RE.test(bad), false, bad)
})

test('화면 이름: 표시 이름 → 없거나 빈칸이면 내부 이름', () => {
  assert.equal(manualLabel({ name: 'weekly', title: '주간 보고' }), '주간 보고')
  assert.equal(manualLabel({ name: 'weekly', title: '   ' }), 'weekly')
  assert.equal(manualLabel({ name: 'weekly' }), 'weekly')
})

// ── 저장 형식
test('표시 이름 저장·읽기 — 따옴표·콜론·줄바꿈도 한 줄로 안전하게', () => {
  const m = saveManual(input({ name: 'quote-test', title: '주간 "보고":\n정리', description: '설명', body: '본문' }))
  assert.equal(m.title, '주간 "보고": 정리')
  const raw = fs.readFileSync(m.path, 'utf8')
  assert.equal(raw.split('\n').filter((l) => l.startsWith('title:')).length, 1)
  assert.equal(listManuals([proj]).find((x) => x.name === 'quote-test')?.title, '주간 "보고": 정리')
})

test('옛 형식(title 없음·CRLF)도 그대로 읽힌다', () => {
  const dir = path.join(proj, '.claude', 'skills', 'old-crlf')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\r\nname: old-crlf\r\ndescription: "옛 매뉴얼"\r\nkind: process\r\n---\r\n본문\r\n')
  const m = listManuals([proj]).find((x) => x.name === 'old-crlf')!
  assert.equal(m.title, undefined)
  assert.equal(m.description, '옛 매뉴얼')
  assert.equal(m.kind, 'process')
  assert.equal(manualLabel(m), 'old-crlf')
})

test('표시 이름이 없으면 title 줄을 쓰지 않는다', () => {
  const m = saveManual(input({ name: 'no-title', title: undefined, description: '설명', body: '본문' }))
  assert.ok(!fs.readFileSync(m.path, 'utf8').includes('title:'))
})

test('너무 긴 표시 이름은 상한까지만', () => {
  const m = saveManual(input({ name: 'long-title', title: '가'.repeat(TITLE_MAX + 50), description: '설명', body: '본문' }))
  assert.equal(m.title?.length, TITLE_MAX)
  assert.equal(cleanTitle('  a \n b  '), 'a b')
})

test('고치기에서 표시 이름을 안 보내면 기존 값 유지, 빈 값이면 지운다', () => {
  assert.equal(resolveTitle('주간 보고', undefined), '주간 보고')
  assert.equal(resolveTitle('주간 보고', ''), '')
  assert.equal(resolveTitle('주간 보고', '월간 보고'), '월간 보고')
  assert.equal(resolveTitle(undefined, undefined), '')
})

test('직접 쓴 이름이 이미 있으면 덮어쓰지 않고 오류, 자동 이름은 -2', () => {
  saveManual(input({ name: 'dup-name', description: '설명', body: '본문' }))
  assert.throws(() => saveManual(input({ name: 'dup-name', description: '설명', body: '본문' })), /이미 있어요/)
  assert.equal(saveManual(input({ name: 'dup-name', autoName: true, description: '설명', body: '본문' })).name, 'dup-name-2')
})

// ── 저장할 수 없는 이유
test('빈 한 명 업무 양식 → 이름·언제 쓰나요·절차', () => {
  const p = manualProblems(input())
  assert.deepEqual(
    p.map((x) => [x.field, x.key]),
    [
      ['title', 'manuals.problem.title'],
      ['description', 'manuals.problem.description'],
      ['body', 'manuals.problem.body'],
    ],
  )
})

test('여러 명 업무: 단계 0개, 2단계 지시 빔 → 칸은 0부터·문장은 1부터', () => {
  const base = { title: 't', description: 'd', kind: 'process' as const }
  assert.deepEqual(manualProblems(input({ ...base, steps: [] })).map((x) => x.field), ['steps'])
  const p = manualProblems(input({ ...base, steps: [step(), step({ id: 's2', instruction: ' ' })] }))
  assert.deepEqual(p, [{ field: 'step.1.instruction', key: 'manuals.problem.stepInstruction', vars: { n: 2 } }])
})

test('파일 이름: 비우면 문제 아님(자동), 형식이 틀리면 문제, 다 채우면 빈 목록', () => {
  const ok = input({ title: 't', description: 'd', body: 'b' })
  assert.deepEqual(manualProblems(ok), [])
  assert.deepEqual(manualProblems({ ...ok, name: 'Bad Name' }).map((x) => x.field), ['name'])
  assert.deepEqual(manualProblems({ ...ok, name: 'good-name' }), [])
})

test('고친 내용 있음: 같음 / 한 글자 / 단계만 다름', () => {
  const a = input({ title: 't', kind: 'process', steps: [step()] })
  assert.equal(isDirty({ ...a }, a), false)
  assert.equal(isDirty({ ...a, title: 'tt' }, a), true)
  assert.equal(isDirty({ ...a, steps: [step({ role: '리뷰어' })] }, a), true)
})

// ── 직원 팩
const known: PackKnown = { mcpServers: new Set(), skills: new Set() }
const exportStaff = (manuals: { name: string; title?: string; description: string; body: string }[]) => [
  { name: '영희', role: 'QA', avatar: 1, model: 'default' as const, approvalMode: 'ask' as const, systemPrompt: '', equipment: { mcpServers: [], skills: manuals.map((m) => m.name), allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 }, manuals },
]

test('직원 팩: title 왕복, 옛 팩(title 없음) 통과, 너무 긴 title 거절', () => {
  const built = buildPackText(exportStaff([{ name: 'weekly', title: '주간 보고', description: 'd', body: 'b' }]))
  assert.equal(built.ok, true)
  if (!built.ok) return
  const back = validatePackObject(JSON.parse(built.text), { mcpServers: new Set(), skills: new Set(['weekly']) })
  assert.equal(back.ok && back.pack.staff[0].manuals[0].title, '주간 보고')
  const old = buildPackText(exportStaff([{ name: 'weekly', description: 'd', body: 'b' }]))
  assert.equal(old.ok && 'title' in JSON.parse(old.text).staff[0].manuals[0], false)
  const raw = (title: string) => ({ format: PACK_FORMAT, version: 1, staff: [{ name: '영희', role: 'QA', avatar: 1, model: 'default', systemPrompt: '', equipment: { mcpServers: [], skills: [], disallowedTools: [], monthlyBudgetUsd: 0 }, manuals: [{ name: 'weekly', title, description: '', body: 'b' }] }] })
  assert.equal(validatePackObject(raw('가'.repeat(TITLE_MAX + 1)), known).ok, false)
})

test('직원 팩: 같은 이름 비교는 본문만 — 제목만 다르면 충돌 아님', () => {
  const two = (a: string, b: string, bodyB = 'b') => ({
    format: PACK_FORMAT,
    version: 1,
    staff: ['영희', '철수'].map((name, i) => ({ name, role: 'QA', avatar: 1, model: 'default', systemPrompt: '', equipment: { mcpServers: [], skills: [], disallowedTools: [], monthlyBudgetUsd: 0 }, manuals: [{ name: 'weekly', title: i ? b : a, description: '', body: i ? bodyB : 'b' }] })),
  })
  assert.equal(validatePackObject(two('주간', '週報'), known).ok, true)
  assert.equal(validatePackObject(two('주간', '주간', '다른 본문'), known).ok, false)
})

// ── 초안·원격·비서
test('원격: 초안 직원 ""(앱 기본 AI)이 통과하고, 저장은 title·autoName을 받고 모르는 칸은 버린다', () => {
  assert.equal(checkArgs(V2_METHODS.draftManual.args, ['', '주간 보고 정리', 'personal']), null)
  assert.ok(V2_FIELDS.saveManual?.[0].includes('title'))
  assert.ok(V2_FIELDS.saveManual?.[0].includes('autoName'))
  assert.deepEqual(pickFields('saveManual', [{ name: '', title: '주간', autoName: true, evil: 1 }]), [{ name: '', title: '주간', autoName: true }])
})

test('비서: 매뉴얼 원문 보기에 표시 이름, 도구 안내에 title·직원 "" 안내', () => {
  const m: Manual = { name: 'weekly', title: '주간 보고', description: 'd', kind: 'personal', scope: 'user', projectDir: null, path: '/x/SKILL.md', body: 'b', steps: [] }
  assert.match(compactManual(m), /## weekly "주간 보고"/)
  assert.match(SECRETARY_SIGNATURES.saveManual ?? '', /title\?/)
  assert.match(SECRETARY_SIGNATURES.draftManual ?? '', /""/)
})

// ── 예시 템플릿·사전
test('예시 템플릿: 7개(한 명 3 + 여러 명 4), 필요한 사전 키가 4개 언어 모두 있다', () => {
  assert.equal(MANUAL_TEMPLATES.length, 7)
  assert.equal(MANUAL_TEMPLATES.filter((d) => d.kind === 'personal').length, 3)
  const dict = DICT as Record<string, Record<string, string>>
  const missing = MANUAL_TEMPLATES.flatMap(templateKeys).filter((k) => !dict[k] || LANGS.some((l) => !dict[k][l]?.trim()))
  assert.deepEqual(missing, [])
  // 템플릿에 없는 manualTpl 키도 남기지 않는다
  const used = new Set(MANUAL_TEMPLATES.flatMap(templateKeys))
  assert.deepEqual(Object.keys(dict).filter((k) => k.startsWith('manualTpl.') && !used.has(k)), [])
})

test('예시 템플릿을 고르면 언어마다 바로 저장할 수 있는 양식이 된다 (내 확인·되돌리기 위치 포함)', () => {
  for (const lang of LANGS) {
    setLang(lang)
    for (const d of MANUAL_TEMPLATES) {
      const f = fromTemplate(d, proj)
      assert.deepEqual(manualProblems(f), [], `${lang} ${d.id}`)
      assert.equal(f.autoName, true)
      assert.equal(f.steps[0]?.onRevise ?? null, null)
    }
  }
  setLang('ko')
  const pick = (id: string) => fromTemplate(MANUAL_TEMPLATES.find((d) => d.id === id)!, null)
  assert.deepEqual(pick('bugFix').steps.map((s) => [s.needsMyCheck, s.onRevise]), [[false, null], [false, null], [false, 's2'], [true, 's2']])
  assert.deepEqual(pick('contentPublish').steps.map((s) => [s.needsMyCheck, s.onRevise]), [[false, null], [false, 's1'], [true, 's1']])
  assert.equal(pick('contentPublish').scope, 'user')
  // 내 확인이 켜진 단계는 처음부터 펼친다
  assert.deepEqual(pick('bugFix').steps.map(stepHasExtras), [false, false, true, true])
})

test('예시 템플릿 담당은 흔한 직무명에 포함 매칭된다', () => {
  setLang('ko')
  const roles = MANUAL_TEMPLATES.flatMap((d) => fromTemplate(d, null).steps.map((s) => s.role))
  const staffRoles = ['작성자', '편집자', '코드 리뷰어', '기획자 (PM)', 'FE 개발자', 'QA 엔지니어']
  for (const r of new Set(roles)) assert.ok(staffRoles.some((sr) => sr.includes(r)), r)
})

test('이번에 바꾼 매뉴얼 화면 문구에 개발 용어(스킬·토큰)가 없다', () => {
  const banned = /스킬|토큰|\bskills?\b|\btokens?\b|スキル|トークン|技能|令牌/i
  const bad = Object.entries(DICT as Record<string, Record<string, string>>)
    .filter(([k]) => /^(manuals\.|manualStart\.|manualTpl\.)/.test(k))
    .flatMap(([k, v]) => LANGS.filter((l) => banned.test(v[l])).map((l) => `${k}.${l}`))
  assert.deepEqual(bad, [])
})
