// 비서: 매뉴얼 본문 읽기·비교 카드 · 직원 관리(지침 점검·예약 업무·참고 문서·장비)
// secretaryCompact·secretaryCore는 electron 없이 돌아서 가짜 처리 함수로 그대로 확인한다

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { compactManual, compactOverview, compactStaffDetail, compareSteps, MANUAL_BODY_MAX } from '../src/main/secretaryCompact.ts'
import { SecretaryDesk, type DeskDeps } from '../src/main/secretaryCore.ts'
import { cleanCompares, SECRETARY_SIGNATURES, SECRETARY_TOOLS } from '../src/shared/secretaryTools.ts'
import type { Manual, OfficeSnapshot, ProcessStep } from '../src/shared/types.ts'

const NOW = 1_800_000_000_000

const flowDraft = () => {
  const doc = fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/specs/secretary-feature-flow-draft.md'), 'utf8')
  const json = doc.match(/```office-process\n([\s\S]*?)\n```/)?.[1]
  assert.ok(json, '김기획 초안에 office-process 블록이 있다')
  return { steps: JSON.parse(json) as ProcessStep[], body: doc.match(/````markdown\n([\s\S]*?)\n````/)?.[1] ?? '' }
}

const manual = (name: string, body: string, steps: ProcessStep[] = []): Manual => ({ name, description: `${name} 설명`, kind: 'process', scope: 'user', projectDir: null, path: `/home/me/.claude/skills/${name}/SKILL.md`, body, steps })

const snap = () =>
  ({
    staff: [
      {
        id: 's1', kind: 'hired', name: '오큐에이', role: 'QA', teamId: null, status: 'idle', statusSince: NOW, activity: '', approvals: [], todayDone: 0, costUsd: 0, cwd: '/w', cwdSource: 'own', model: 'default', approvalMode: 'ask',
        systemPrompt: '버그를 찾는다', refDocs: ['/w/docs/spec.md'],
        equipment: { mcpServers: ['figma'], skills: 'all', allowedTools: ['Read'], disallowedTools: ['Bash(rm:*)'], monthlyBudgetUsd: 20 },
      },
    ],
    teams: [], labs: [], tasks: [],
    schedules: [{ id: 'sc1', staffId: 's1', label: '아침 점검', time: '09:00', weekdays: [1, 2, 3, 4, 5], instruction: '어제 변경을 확인', enabled: true, lastRunDate: null }],
  }) as unknown as OfficeSnapshot

function desk(over: Partial<DeskDeps> = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  let n = 0
  const d = new SecretaryDesk({ call: (method, args) => void calls.push({ method, args }), now: () => NOW, newId: () => `c${++n}`, currentText: () => '', applyEdit: () => ({ method: 'updateStaff', args: [] }), cardChanged: () => {}, ...over })
  return { d, calls }
}

test('매뉴얼 읽기: 본문 전체와 프로세스 단계를 원문 그대로, 너무 길면 잘라 알린다', () => {
  const { steps, body } = flowDraft()
  const text = compactManual(manual('feature-flow', body, steps))
  assert.match(text, /경로\(previousPath·deleteManual에 쓰는 값\): \/home\/me\/\.claude\/skills\/feature-flow\/SKILL\.md/)
  assert.ok(text.includes(body), '본문이 줄지 않는다')
  assert.match(text, /### 프로세스 단계\n1\. \[size\] 크기 판정/)
  assert.match(text, /되돌림→구현\(최대 2번\)/)
  const long = compactManual(manual('긴것', 'x'.repeat(MANUAL_BODY_MAX + 500)))
  assert.match(long, /본문이 길어 20000자까지만/)
})

test('매뉴얼 통합: 새 매뉴얼 저장 + 원본 삭제를 한 카드로, 비교에는 원문↔통합본과 지울 본문이 보인다', () => {
  const { steps, body } = flowDraft()
  const olds = ['small', 'medium', 'large'].map((s) => manual(`feature-flow-${s}`, `${s} 본문`))
  const call = [
    { method: 'saveManual' as const, args: [{ name: 'feature-flow', description: '통합', kind: 'process', scope: 'user', projectDir: null, body, steps }] },
    ...olds.map((m) => ({ method: 'deleteManual' as const, args: [m.path] })),
  ]
  const compares = compareSteps(snap(), olds, call)
  assert.equal(compares.length, 4)
  assert.deepEqual(compares[0], { kind: 'text', label: '매뉴얼 feature-flow', before: '', after: body }, '새 매뉴얼은 원문이 없다')
  assert.deepEqual(compares[1], { kind: 'text', label: '지울 매뉴얼 feature-flow-small', before: 'small 본문', after: '' })

  const { d, calls } = desk({ compareOf: (st) => compareSteps(snap(), olds, st) })
  const r = d.propose({ title: '기능 흐름 매뉴얼 합치기', steps: call })
  assert.ok('card' in r, 'error' in r ? r.error : '')
  assert.equal(r.card.steps.length, 4, '한 카드 4단계 (상한 8 이내)')
  assert.equal(r.card.risk, 'danger', '지우기가 있으면 위험 등급')
  assert.equal(r.card.compares?.length, 4)
  assert.deepEqual(calls, [], '제안만 한다')
})

test('매뉴얼 고치기: previousPath가 있으면 그 매뉴얼이, 같은 이름·범위로 덮어쓰면 그 매뉴얼이 원문이다', () => {
  const m = manual('a', '옛 본문')
  const input = { name: 'a', description: '', kind: 'personal', scope: 'user', projectDir: null, body: '새 본문', steps: [] }
  assert.equal(compareSteps(snap(), [m], [{ method: 'saveManual', args: [input, m.path] }])[0].before, '옛 본문')
  assert.equal(compareSteps(snap(), [m], [{ method: 'saveManual', args: [input] }])[0].before, '옛 본문')
  assert.deepEqual(cleanCompares(compareSteps(snap(), [m], [{ method: 'saveManual', args: [{ ...input, body: '옛 본문' }, m.path] }])), [], '같은 글이면 비교를 붙이지 않는다')
  assert.deepEqual(compareSteps(snap(), [], [{ method: 'deleteManual', args: ['/없는/경로'] }]), [])
})

test('직원 업무 지침 점검: updateStaff 카드에 지금 지침↔고친 지침 비교가 붙는다 (권한 필드는 그대로)', () => {
  const [c] = compareSteps(snap(), [], [{ method: 'updateStaff', args: ['s1', { systemPrompt: '버그를 찾고 재현 절차를 적는다' }] }])
  assert.deepEqual(c, { kind: 'text', label: '오큐에이 업무 지침', before: '버그를 찾는다', after: '버그를 찾고 재현 절차를 적는다' })
  assert.deepEqual(compareSteps(snap(), [], [{ method: 'updateStaff', args: ['s1', { role: 'QA 리드' }] }]), [], '지침을 안 바꾸면 비교 없음')
  const text = compactStaffDetail(snap(), 's1', null, NOW)
  assert.match(text, /### 업무 지침 \(원문 그대로\)\n버그를 찾는다/)
})

test('직원 장비·참고 문서: 직원 상세에 지금 값이 나오고, 도구 권한은 넓히지 않았다', () => {
  const text = compactStaffDetail(snap(), 's1', null, NOW)
  assert.match(text, /연결 도구 figma · 스킬 전부 · 월 예산 \$20/)
  assert.match(text, /결재 없이 쓰는 도구: Read · 막는 도구: Bash\(rm:\*\)/)
  assert.match(text, /참고 문서: \/w\/docs\/spec\.md/)
  // 분류는 그대로: 장비는 주의, 나머지 직원 관리는 일반. 조회는 equipmentCatalog 하나
  assert.equal(SECRETARY_TOOLS.setEquipment.risk, 'caution')
  assert.equal(SECRETARY_TOOLS.setRefDocs.risk, 'normal')
  assert.equal(SECRETARY_TOOLS.saveSchedule.risk, 'normal')
  assert.equal(SECRETARY_TOOLS.deleteSchedule.risk, 'caution')
  assert.equal(SECRETARY_TOOLS.equipmentCatalog.kind, 'read')
  assert.match(SECRETARY_SIGNATURES.setEquipment ?? '', /allowedTools·disallowedTools는 그대로/)
  assert.match(SECRETARY_SIGNATURES.saveManual ?? '', /needsMyCheck/)
})

test('예약 업무: 목록 조회(없으면 추가 안내)와 저장·삭제는 확인 카드로만', () => {
  const list = compactOverview(snap(), 'schedules', NOW)
  assert.match(list, /\[sc1\] 아침 점검 · 오큐에이 · 09:00 · 월·화·수·목·금 · 켬 · 지시: 어제 변경을 확인/)
  assert.match(compactOverview({ ...snap(), schedules: [] }, 'schedules', NOW), /없어요\. 새로 만들려면 saveSchedule/)
  const { d, calls } = desk()
  const add = d.propose({ steps: [{ method: 'saveSchedule', args: [{ id: 'new-uuid', staffId: 's1', label: '저녁 정리', time: '18:00', weekdays: [1, 2, 3, 4, 5], instruction: '정리', enabled: true }] }] })
  assert.ok('card' in add, 'error' in add ? add.error : '')
  const del = d.propose({ steps: [{ method: 'deleteSchedule', args: ['sc1'] }] })
  assert.ok('card' in del)
  assert.equal(del.card.risk, 'caution')
  assert.deepEqual(calls, [])
})

test('참고 문서·장비 지급: 인자 모양을 검사하고 카드로만 실행한다', async () => {
  const { d, calls } = desk()
  assert.ok('error' in d.propose({ steps: [{ method: 'setRefDocs', args: ['s1', ['/a.md']] }] }), '대상은 { kind, id } 객체')
  const refs = d.propose({ steps: [{ method: 'setRefDocs', args: [{ kind: 'staff', id: 's1' }, ['/w/docs/spec.md', '/w/docs/api.md']] }] })
  assert.ok('card' in refs)
  const eq = d.propose({ steps: [{ method: 'setEquipment', args: ['s1', { mcpServers: ['figma', 'notion'], skills: 'all', allowedTools: ['Read'], disallowedTools: ['Bash(rm:*)'], monthlyBudgetUsd: 20 }] }] })
  assert.ok('card' in eq)
  assert.equal(eq.card.risk, 'caution')
  assert.deepEqual(calls, [])
  const done = await d.run(eq.card.id)
  assert.equal(done?.status, 'done')
  assert.deepEqual(calls.map((c) => c.method), ['setEquipment'])
})

test('4개 언어: 비교 카드 이름표가 모두 있다', async () => {
  const { t } = await import('../src/shared/i18n/index.ts')
  for (const lang of ['ko', 'en', 'ja', 'zh'] as const) {
    for (const key of ['secretary.compareLabel.manual', 'secretary.compareLabel.manualDelete', 'secretary.compareLabel.staffPrompt'] as const) {
      const text = t(key, { name: '이름' }, lang)
      assert.ok(text.includes('이름') && text !== key, `${lang} ${key}`)
    }
  }
})

test('updateStaff는 허용 필드만 반영한다 — 비서 카드에 결재 방식·장비가 섞여도 무시', async () => {
  const { pickStaffPatch } = await import('../src/main/staffPatch.ts')
  const input = { systemPrompt: '새 지침', approvalMode: 'acceptEdits', equipment: { allowedTools: ['Bash'] } } as unknown as Parameters<typeof pickStaffPatch>[0]
  assert.deepEqual(pickStaffPatch(input), { systemPrompt: '새 지침' })
  assert.deepEqual(pickStaffPatch({ teamId: null, cwd: '/w' }), { teamId: null, cwd: '/w' })
})
