// 비서의 확인 카드 (docs/specs/secretary.md 3·4절) — electron·SDK 없이 돌아가는 핵심. scripts/secretary.test.mts가 그대로 쓴다
// 비서 세션의 도구는 "제안 만들기"만 한다. 실제 실행은 대표가 카드에서 [실행]을 눌러 run()이 불릴 때뿐이다 (같은 officeHandlers 경로)

import type { OfficeMethod } from '../shared/officeApiShape.ts'
import { BATCH_ITEMS_MAX, BATCH_LABEL, BATCH_METHOD, CARD_STEPS_MAX, CARD_TTL_MS, cardRisk, cleanCompares, excludeMessage, isChangeMethod, isReadMethod, SECRETARY_SIGNATURES, SECRETARY_TOOLS } from '../shared/secretaryTools.ts'
import type { SecretaryBatchItem, SecretaryCard, SecretaryCompare, SecretaryRunOptions, SecretaryStep, SecretaryStepStatus } from '../shared/types.ts'
import path from 'node:path'
import { checkArgs, V2_METHODS } from './remote/v2.ts'
import { describeStep, maxRisk, stepRisk, type NameOf } from './secretaryDescribe.ts'

/** 첨삭 대상: 어떤 값을 다듬는지 (적용 직전 원문이 그대로인지 확인한다) */
export type EditTarget = { kind: 'staffPrompt'; staffId: string } | { kind: 'taskDetail'; taskId: string } | { kind: 'manualBody'; name: string; scope: string } | { kind: 'labGoal'; labId: string }

export interface DeskDeps {
  /** PC 화면과 같은 처리 함수 (officeHandlers) */
  call(method: OfficeMethod, args: unknown[]): unknown
  now(): number
  newId(): string
  /** 첨삭 대상의 지금 글 */
  currentText(target: EditTarget): Promise<string | null> | string | null
  /** 첨삭을 적용하는 호출 (대상 → 메서드·인자) */
  applyEdit(target: EditTarget, text: string): Promise<{ method: OfficeMethod; args: unknown[] }> | { method: OfficeMethod; args: unknown[] }
  /** id → 이름 (카드 본문은 앱이 실제 인자로 만든다 — describeStep) */
  nameOf?: NameOf
  /** 조회 도구가 읽어도 되는 폴더 (직원·랩 작업 폴더). 이 밖의 경로를 주는 조회는 거절 */
  allowedRoots?(): string[]
  /** 토큰 한도에 닿았는지 — 닿으면 AI를 부르는 조회는 쉰다 */
  isLimited?(): boolean
  /** 카드를 만들 때 미리 보는 주의할 점 (이름 겹침·대상 없음 등) */
  precheck?(steps: { method: OfficeMethod; args: unknown[] }[]): string[]
  /** 카드를 만들 때 앱이 붙이는 글 비교 (예: 매뉴얼 저장 → 지금 본문 ↔ 새 본문). 묶음 항목도 펼쳐서 준다. 그림처럼 오래 걸리는 것은 attachCompares로 */
  compareOf?(steps: { method: OfficeMethod; args: unknown[] }[]): SecretaryCompare[]
  /** 카드가 바뀌면 (저장·화면 갱신) */
  cardChanged(card: SecretaryCard): void
}

interface ProposeCall {
  method: string
  args?: unknown[]
  label?: string
  detail?: string
}

export interface ProposeInput {
  title?: string
  /** method가 "batch"인 단계는 items에 항목을 담는다 (BATCH_GUIDE) */
  steps: (ProposeCall & { items?: ProposeCall[] })[]
  warnings?: string[]
}

/** 끝난 카드 — 비교 그림을 지운다 (상태 스냅샷이 폰까지 가므로 크게 두지 않는다) */
const SETTLED: ReadonlySet<SecretaryCard['status']> = new Set(['done', 'cancelled', 'expired', 'replaced', 'stale'])
const dropImages = (card: SecretaryCard): SecretaryCard =>
  card.compares?.some((c) => c.kind === 'image' && c.before) ? { ...card, compares: card.compares.map((c) => (c.kind === 'image' ? { ...c, before: '', after: '' } : c)) } : card

/** 묶음 단계의 상태: 실패가 하나라도 있으면 실패 · 모두 뺐으면 건너뜀 · 아니면 끝 */
function batchStatus(items: SecretaryBatchItem[]): SecretaryStepStatus {
  if (items.some((it) => it.status === 'failed')) return 'failed'
  return items.every((it) => it.isExcluded || it.status === 'skipped') ? 'skipped' : 'done'
}

export interface ProposeEditInput {
  target: EditTarget
  targetLabel: string
  original: string
  revised: string
  reasons?: string[]
}

/** 조회지만 AI를 한 번 부르는 것 (비용) */
const AI_READS = new Set<string>(['refreshPlanUsage', 'draftManual'])
const AI_READ_INTERVAL_MS = 10 * 60_000

const REF = /^\$(\d+)\.([A-Za-z_][\w.]*)$/
const TEXT_MAX = 200
const clip = (t: string, n = TEXT_MAX) => (t.length > n ? `${t.slice(0, n)}…` : t)

/** "$2.id" 같은 참조를 모두 찾는다 */
function refsIn(v: unknown, out: { step: number; path: string }[] = []) {
  if (typeof v === 'string') {
    const m = v.match(REF)
    if (m) out.push({ step: Number(m[1]), path: m[2] })
  } else if (Array.isArray(v)) v.forEach((x) => refsIn(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => refsIn(x, out))
  return out
}

/** 참조를 실행 결과로 바꾼다. 못 채우면 null */
function resolveRefs(v: unknown, results: (Record<string, string> | undefined)[]): unknown {
  if (typeof v === 'string') {
    const m = v.match(REF)
    if (!m) return v
    const value = results[Number(m[1]) - 1]?.[m[2]]
    if (value === undefined) throw new Error(`${m[1]}번 단계 결과가 없어요`)
    return value
  }
  if (Array.isArray(v)) return v.map((x) => resolveRefs(x, results))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveRefs(x, results)]))
  return v
}

/** 뒤 단계가 쓸 수 있게 결과에서 id·이름 같은 글자 값만 남긴다 */
function pickResult(r: unknown): Record<string, string> | undefined {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return undefined
  const out: Record<string, string> = {}
  for (const k of ['id', 'name', 'title', 'topic']) if (typeof (r as Record<string, unknown>)[k] === 'string') out[k] = (r as Record<string, string>)[k]
  return Object.keys(out).length ? out : undefined
}

// 카드에서 고칠 수 있는 글자 값 (이름 → 인자 안 자리)
type Slot = { index: number; field?: string }
const EDITABLE: Partial<Record<OfficeMethod, Record<string, Slot>>> = {
  hire: { 이름: { index: 0, field: 'name' }, 직무: { index: 0, field: 'role' }, '작업 폴더': { index: 0, field: 'cwd' } },
  createTeam: { 이름: { index: 0 } },
  createLab: { 이름: { index: 0, field: 'name' }, 목표: { index: 0, field: 'goal' } },
  createTask: { 제목: { index: 0, field: 'title' }, 설명: { index: 0, field: 'detail' } },
  startMeeting: { 주제: { index: 0, field: 'topic' } },
  sendChat: { 내용: { index: 0 } },
  instruct: { 지시: { index: 1 } },
}

function readSlot(args: unknown[], slot: Slot) {
  const v = slot.field ? (args[slot.index] as Record<string, unknown> | undefined)?.[slot.field] : args[slot.index]
  return typeof v === 'string' ? v : undefined
}

function writeSlot(args: unknown[], slot: Slot, value: string) {
  const next = [...args]
  if (!slot.field) next[slot.index] = value
  else next[slot.index] = { ...(next[slot.index] as Record<string, unknown>), [slot.field]: value }
  return next
}

function editableOf(method: OfficeMethod, args: unknown[]) {
  const slots = EDITABLE[method]
  if (!slots) return undefined
  const out: Record<string, string> = {}
  for (const [name, slot] of Object.entries(slots)) {
    const v = readSlot(args, slot)
    // 앞 단계 참조는 고칠 값이 아니다
    if (v !== undefined && !REF.test(v)) out[name] = v
  }
  return Object.keys(out).length ? out : undefined
}

export class SecretaryDesk {
  private deps: DeskDeps
  private cards = new Map<string, SecretaryCard>()
  private editTargets = new Map<string, EditTarget>()
  private aiReadAt = new Map<string, number>()

  constructor(deps: DeskDeps) {
    this.deps = deps
  }

  /** 저장해 둔 카드를 다시 올린다 (앱을 다시 켰을 때 — 실행 중이던 카드는 실패로) */
  restore(card: SecretaryCard, target?: EditTarget) {
    const stopped = '앱이 꺼져서 끝까지 못 했어요'
    const c =
      card.status === 'running'
        ? {
            ...card,
            status: 'failed' as const,
            steps: card.steps.map((s) =>
              s.status === 'running' ? { ...s, status: 'failed' as const, error: stopped, ...(s.items ? { items: s.items.map((it) => (it.status === 'running' ? { ...it, status: 'failed' as const, error: stopped } : it)) } : {}) } : s,
            ),
          }
        : card
    this.cards.set(c.id, c)
    if (target) this.editTargets.set(c.id, target)
  }

  get(cardId: string) {
    return this.cards.get(cardId)
  }

  editTargetOf(cardId: string) {
    return this.editTargets.get(cardId)
  }

  /** 조회 도구: 조회 메서드만 바로 부른다. 바꾸는 메서드·제외 메서드는 거절 */
  async read(method: string, args: unknown[] = []): Promise<unknown> {
    if (!isReadMethod(method)) throw new Error(isChangeMethod(method) ? `"${method}"는 바꾸는 일이라 바로 할 수 없어요. propose로 확인 카드를 만들어 주세요.` : excludeMessage(method))
    const bad = checkArgs(V2_METHODS[method].args, args)
    if (bad) throw new Error(`${bad}의 값이 맞지 않아요. 인자 모양: ${method}${SECRETARY_SIGNATURES[method] ?? ''}`)
    // 폴더를 받는 조회는 직원·랩 작업 폴더 안만 (모델이 고른 아무 경로나 읽지 않게 — 한리뷰 M2)
    const paths = method === 'listAgentTemplates' || method === 'equipmentCatalog' ? [args[0]] : method === 'missingFiles' ? (args[0] as unknown[]) : []
    if (paths.length) {
      const roots = (this.deps.allowedRoots?.() ?? []).filter(Boolean).map((r) => path.resolve(r))
      const outside = paths.find((p) => typeof p !== 'string' || !path.isAbsolute(p) || !roots.some((r) => path.resolve(p) === r || path.resolve(p).startsWith(r + path.sep)))
      if (outside !== undefined) throw new Error('직원·랩 작업 폴더 안의 경로만 볼 수 있어요')
    }
    // AI를 한 번 부르는 조회는 한도 안에서, 10분에 한 번만 (비용 — 한리뷰 M1)
    if (AI_READS.has(method)) {
      if (this.deps.isLimited?.()) throw new Error('토큰 한도에 닿아 지금은 쉬어요')
      const last = this.aiReadAt.get(method) ?? -Infinity
      if (this.deps.now() - last < AI_READ_INTERVAL_MS) throw new Error('조금 전에 했어요. 10분 뒤에 다시 할 수 있어요')
      this.aiReadAt.set(method, this.deps.now())
    }
    return await this.deps.call(method, args)
  }

  /** 단계의 본문·위험도·고칠 값 — 실제 인자로 (고친 뒤에도 다시 만든다) */
  private stepView(method: OfficeMethod, args: unknown[]) {
    const { risk, reason } = stepRisk(method, args)
    return { detail: describeStep(method, args, this.deps.nameOf ?? (() => null)), risk, ...(reason ? { riskReason: reason } : {}), editable: editableOf(method, args) }
  }

  /** 확인 카드 만들기 — 실행하지 않는다 */
  propose(input: ProposeInput): { card: SecretaryCard } | { error: string } {
    const steps = input.steps ?? []
    if (steps.length === 0) return { error: '단계가 없어요' }
    if (steps.length > CARD_STEPS_MAX) return { error: `한 카드에는 ${CARD_STEPS_MAX}단계까지예요. 나눠서 제안해 주세요.` }
    const built: SecretaryStep[] = []
    for (const [i, s] of steps.entries()) {
      const no = i + 1
      if (s.method === BATCH_METHOD) {
        const r = this.buildBatch(no, s)
        if ('error' in r) return r
        built.push(r.step)
        continue
      }
      const r = this.buildCall(`${no}번`, s)
      if ('error' in r) return r
      for (const ref of refsIn(r.call.args)) {
        if (ref.step < 1 || ref.step >= no) return { error: `${no}번: 참조 $${ref.step}는 앞 단계만 가리킬 수 있어요` }
        if (built[ref.step - 1].items) return { error: `${no}번: 묶음 단계($${ref.step})는 참조할 수 없어요` }
      }
      built.push({ ...r.call, status: 'pending' })
    }
    // 주의할 점은 앱이 확인한 것만 (모델이 적은 말은 notes로 따로). 묶음은 항목으로 펼쳐서 본다
    const calls = built.flatMap((s) => s.items ?? [s]).map((s) => ({ method: s.method as OfficeMethod, args: s.args }))
    const warnings = [...new Set([...built.flatMap((s) => (s.items ?? [s]).flatMap((x) => (x.riskReason ? [x.riskReason] : []))), ...(this.deps.precheck?.(calls) ?? [])])].map((w) => clip(w))
    const notes = (input.warnings ?? []).map((w) => clip(w))
    const compares = cleanCompares(this.deps.compareOf?.(calls) ?? [])
    const card: SecretaryCard = {
      id: this.deps.newId(),
      kind: 'confirm',
      title: input.title ? clip(input.title, 80) : built.length === 1 ? '이걸 할까요?' : '이렇게 할까요?',
      steps: built,
      risk: maxRisk(built.map((s) => s.risk ?? 'normal')),
      warnings,
      ...(notes.length ? { notes } : {}),
      ...(compares.length ? { compares } : {}),
      status: 'pending',
      createdAt: this.deps.now(),
    }
    this.cards.set(card.id, card)
    this.deps.cardChanged(card)
    return { card }
  }

  /** 변경 호출 하나 — 메서드·인자 모양을 확인하고 본문은 앱이 실제 인자로 만든다 (모델 글은 note로만 — 한리뷰 H1) */
  private buildCall(where: string, s: ProposeCall): { call: Omit<SecretaryStep, 'status' | 'items'> } | { error: string } {
    if (!isChangeMethod(s.method)) return { error: `${where} ${isReadMethod(s.method) ? `"${s.method}": 조회는 카드 없이 read로 바로 하세요` : excludeMessage(s.method)}` }
    const args = Array.isArray(s.args) ? s.args : []
    const bad = checkArgs(V2_METHODS[s.method].args, args)
    if (bad) return { error: `${where} "${s.method}": ${bad}의 값이 맞지 않아요. 인자 모양: ${s.method}${SECRETARY_SIGNATURES[s.method] ?? ''}` }
    // 지시 문장 같은 값은 줄이지 않는다
    const note = [s.label, s.detail].map((x) => x?.trim()).filter(Boolean).join(' · ')
    return { call: { ...this.stepView(s.method, args), method: s.method, label: SECRETARY_TOOLS[s.method].label ?? s.method, args, ...(note ? { note: clip(note) } : {}) } }
  }

  /** 묶음 단계 — 항목은 변경 메서드만, 앞 단계 참조 없이. 위험도는 항목 중 가장 높은 것 */
  private buildBatch(no: number, s: ProposeInput['steps'][number]): { step: SecretaryStep } | { error: string } {
    const list = s.items ?? []
    if (list.length === 0) return { error: `${no}번 묶음: 항목이 없어요` }
    if (list.length > BATCH_ITEMS_MAX) return { error: `${no}번 묶음: 항목은 ${BATCH_ITEMS_MAX}개까지예요. 나눠서 제안해 주세요.` }
    const items: SecretaryBatchItem[] = []
    for (const [j, it] of list.entries()) {
      const where = `${no}번 묶음의 ${j + 1}번 항목`
      if (it.method === BATCH_METHOD) return { error: `${where}: 묶음 안에 묶음을 넣을 수 없어요` }
      const r = this.buildCall(where, it)
      if ('error' in r) return r
      if (refsIn(r.call.args).length) return { error: `${where}: 묶음 항목은 앞 단계를 참조할 수 없어요` }
      // 위험한 일(해고·삭제 등)은 한 번에 여러 개 하지 않는다 — 하나씩 카드로 (권한을 넓히지 않게)
      if (r.call.risk === 'danger' || SECRETARY_TOOLS[it.method as OfficeMethod]?.risk === 'danger') return { error: `${where} "${it.method}": 위험한 일은 묶을 수 없어요. 따로 카드로 제안해 주세요.` }
      // 묶음 항목은 [고치기] 대상이 아니다 (빼기만)
      const { editable: _, ...call } = r.call
      items.push({ ...call, status: 'pending' })
    }
    const risk = maxRisk(items.map((it) => it.risk ?? 'normal'))
    const name = s.label?.trim()
    return {
      step: {
        method: BATCH_METHOD,
        label: name ? `${BATCH_LABEL} — ${clip(name, 60)}` : BATCH_LABEL,
        detail: `${items.length}개 항목`,
        args: [],
        status: 'pending',
        risk,
        ...(s.detail?.trim() ? { note: clip(s.detail.trim()) } : {}),
        items,
      },
    }
  }

  /** 오래 걸려 나중에 만든 비교 보기(전 ↔ 후 그림 등)를 아직 실행 전인 카드에 붙인다 */
  attachCompares(cardId: string, compares: SecretaryCompare[]): SecretaryCard | null {
    const card = this.cards.get(cardId)
    if (!card || card.status !== 'pending') return null
    const merged = cleanCompares([...(card.compares ?? []), ...compares])
    return this.update({ ...card, compares: merged })
  }

  /** 첨삭 비교 카드 — 적용은 [적용]을 눌렀을 때만 */
  async proposeEdit(input: ProposeEditInput): Promise<{ card: SecretaryCard } | { error: string }> {
    const current = await this.deps.currentText(input.target)
    if (current === null) return { error: '다듬을 대상을 찾지 못했어요' }
    if (current !== input.original) return { error: '원문이 지금 내용과 달라요. 조회한 그대로 original에 넣어 주세요.' }
    if (input.revised === input.original) return { error: '바뀐 곳이 없어요' }
    const { method, args } = await this.deps.applyEdit(input.target, input.revised)
    const card: SecretaryCard = {
      id: this.deps.newId(),
      kind: 'edit',
      title: `${clip(input.targetLabel, 60)} 다듬기`,
      steps: [{ method, label: `${SECRETARY_TOOLS[method].label ?? method} — ${clip(input.targetLabel, 60)}`, detail: '', args, status: 'pending' }],
      risk: 'normal',
      warnings: [],
      status: 'pending',
      createdAt: this.deps.now(),
      edit: { targetLabel: clip(input.targetLabel, 60), original: input.original, revised: input.revised, reasons: (input.reasons ?? []).slice(0, 3).map((r) => clip(r)) },
    }
    this.cards.set(card.id, card)
    this.editTargets.set(card.id, input.target)
    this.deps.cardChanged(card)
    return { card }
  }

  cancel(cardId: string) {
    const card = this.cards.get(cardId)
    if (!card || card.status !== 'pending') return
    this.update({ ...card, status: 'cancelled' })
  }

  private update(next: SecretaryCard) {
    const card = SETTLED.has(next.status) ? dropImages(next) : next
    this.cards.set(card.id, card)
    this.deps.cardChanged(card)
    return card
  }

  /** 대표가 [실행]·[적용]·[이어서 하기]를 눌렀을 때만 — 한 번만, 10분 안에, 위에서 아래로. 앞 단계가 실패하면 뒤는 건너뛴다 */
  async run(cardId: string, options: SecretaryRunOptions = {}): Promise<SecretaryCard | null> {
    const card = this.cards.get(cardId)
    if (!card) return null
    const isContinue = card.status === 'failed' && options.fromStep !== undefined
    if (card.status !== 'pending' && !isContinue) return card
    if (card.status === 'pending' && this.deps.now() - card.createdAt > CARD_TTL_MS) return this.update({ ...card, status: 'expired' })
    let steps = card.steps.map((s) => ({ ...s }))
    // 두 번 누르기 막기: 첫 await 전에 실행 중으로 바꾼다 (첨삭 카드도 — 한리뷰 낮음)
    this.update({ ...card, status: 'running' })

    // 첨삭: 그사이 원문이 바뀌었으면 멈춘다. 일부 적용이면 고른 글로
    let edit = card.edit
    if (card.kind === 'edit' && edit) {
      const target = this.editTargets.get(card.id)
      const current = target ? await this.deps.currentText(target) : null
      if (current !== edit.original) return this.update({ ...card, status: 'stale' })
      const text = typeof options.revised === 'string' && options.revised.trim() ? options.revised : edit.revised
      try {
        const applied = await this.deps.applyEdit(target!, text)
        steps = [{ ...steps[0], method: applied.method, args: applied.args }]
      } catch (e) {
        return this.update({ ...card, status: 'failed', steps: [{ ...steps[0], status: 'failed', error: clip(e instanceof Error ? e.message : String(e), 160) }] })
      }
      edit = { ...edit, revised: text, appliedOriginal: edit.original }
    }

    // [고치기]로 바꾼 값
    for (const [no, values] of Object.entries(options.edits ?? {})) {
      const step = steps[Number(no) - 1]
      const slots = step && EDITABLE[step.method as OfficeMethod]
      if (!step || !slots || step.status === 'done') continue
      for (const [name, value] of Object.entries(values)) {
        const slot = slots[name]
        if (slot && typeof value === 'string') step.args = writeSlot(step.args, slot, value.slice(0, 2000))
      }
      // 고친 값이 모양에 안 맞으면 실행하지 않고 원래대로
      if (checkArgs(V2_METHODS[step.method as OfficeMethod].args, step.args)) return this.update({ ...card })
      // 카드 본문·위험도도 고친 값으로 다시 (실행 결과 카드에 실제로 실행된 값이 남게)
      Object.assign(step, this.stepView(step.method as OfficeMethod, step.args))
    }

    // 묶음에서 뺀 항목 (처음 실행 때만 — 이어서 하기는 그때 뺀 대로)
    if (!isContinue)
      for (const [no, offs] of Object.entries(options.excluded ?? {})) {
        const step = steps[Number(no) - 1]
        if (!step?.items || !Array.isArray(offs)) continue
        const off = new Set(offs.map(Number))
        step.items = step.items.map((it, j) => (off.has(j + 1) ? { ...it, isExcluded: true } : it))
      }

    const start = isContinue ? Math.max(0, (options.fromStep ?? 1) - 1) : 0
    const reset = (s: SecretaryStep): SecretaryStep => ({
      ...s,
      status: 'pending',
      error: undefined,
      ...(s.items ? { items: s.items.map((it) => (it.status === 'done' || it.isExcluded ? it : { ...it, status: 'pending' as const, error: undefined })) } : {}),
    })
    // 두 번 누르기 막기: 기다리기 전에 실행 중으로 바꾼다
    let current = this.update({ ...card, edit, steps: steps.map((s, i) => (i >= start && s.status !== 'done' ? reset(s) : s)), status: 'running' })
    let isFailed = false
    for (let i = start; i < current.steps.length; i++) {
      const step = current.steps[i]
      if (step.status === 'done') continue
      const set = (patch: Partial<SecretaryStep>) => {
        current = this.update({ ...current, steps: current.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
      }
      if (isFailed) {
        set({ status: 'skipped' })
        continue
      }
      set({ status: 'running' })
      if (step.items) {
        const items = await this.runBatch(step.items, (next) => set({ items: next }))
        const status = batchStatus(items)
        isFailed = status === 'failed'
        set({ status, items, ...(isFailed ? { error: items.find((it) => it.status === 'failed')?.error } : {}) })
        continue
      }
      try {
        const args = resolveRefs(step.args, current.steps.map((s) => s.result)) as unknown[]
        const result = await this.deps.call(step.method as OfficeMethod, args)
        if (result === false) throw new Error('이미 처리됐거나 대상을 찾지 못했어요')
        set({ status: 'done', result: pickResult(result) })
      } catch (e) {
        isFailed = true
        set({ status: 'failed', error: clip(e instanceof Error ? e.message : String(e), 160) })
      }
    }
    return this.update({ ...current, status: isFailed ? 'failed' : 'done' })
  }

  /** 묶음 항목을 위에서 아래로 — 뺀 항목은 건너뛰고, 하나가 실패해도 나머지는 한다 (서로 기대지 않는 정리 작업이라) */
  private async runBatch(items: SecretaryBatchItem[], onChange: (items: SecretaryBatchItem[]) => void) {
    let list = items.map((it) => ({ ...it }))
    const set = (j: number, patch: Partial<SecretaryBatchItem>) => {
      list = list.map((it, k) => (k === j ? { ...it, ...patch } : it))
      onChange(list)
    }
    for (const [j, it] of list.entries()) {
      if (it.status === 'done') continue
      if (it.isExcluded) {
        set(j, { status: 'skipped' })
        continue
      }
      set(j, { status: 'running' })
      try {
        const result = await this.deps.call(it.method as OfficeMethod, it.args)
        if (result === false) throw new Error('이미 처리됐거나 대상을 찾지 못했어요')
        set(j, { status: 'done' })
      } catch (e) {
        set(j, { status: 'failed', error: clip(e instanceof Error ? e.message : String(e), 160) })
      }
    }
    return list
  }
}

// ── 호출 빈도 상한 (한리뷰 M1) ─────────────────────────────

/** 기간마다 몇 번까지 — 여러 창을 함께 건다 (예: 분당 6·시간당 60) */
export class RateWindow {
  private hits: number[] = []
  private limits: { ms: number; max: number }[]

  constructor(limits: { ms: number; max: number }[]) {
    this.limits = limits
  }

  /** 지금 한 번 더 해도 되면 기록하고 true */
  take(now: number) {
    const longest = Math.max(...this.limits.map((l) => l.ms))
    this.hits = this.hits.filter((t) => now - t < longest)
    if (this.limits.some((l) => this.hits.filter((t) => now - t < l.ms).length >= l.max)) return false
    this.hits.push(now)
    return true
  }
}

// ── 자동결재 중 대신 답하기 규칙 (한리뷰 H2): 코드가 먼저 거르고, 모델 답은 선택지 안에서만 ──

/**
 * 이 낱말이 질문·선택지에 있으면 모델을 부르지 않고 대표를 기다린다 (대표 결정이 필요한 종류).
 * 한국어는 낱말 조각, 영어는 단어 경계로 ("방법"이 "법"에, "product"가 "prod"에 걸리지 않게 — 한리뷰 Round 2 B2)
 */
const HOLD_KO = [
  '삭제', '지우', '지워', '제거', '초기화', '리셋', '덮어쓰', '파기', '폐기', '롤백', '되돌리', '배포', '릴리스', '출시', '푸시', '머지', '병합', '권한', '관리자', '결제', '구매', '환불',
  '비용', '요금', '예산', '송금', '외부', '전송', '발송', '업로드', '공개', '메일', '보안', '비밀', '토큰', '비밀번호', 'api 키', '키 값', '운영 서버', '운영 db', '운영 데이터', '프로덕션',
  '고객', '계약', '법률', '법적', '법무', '해지', '되돌릴 수 없',
]
const HOLD_EN = [
  'delete', 'remove', 'drop', 'truncate', 'reset', 'wipe', 'destroy', 'overwrite', 'rollback', 'force', 'deploy', 'release', 'publish', 'push', 'merge', 'prod', 'production',
  'permission', 'sudo', 'admin', 'payment', 'billing', 'upload', 'send', 'email', 'secret', 'token', 'password', 'credential', 'api key', 'chmod', 'chown',
]
const HOLD_EN_RE = new RegExp(`(^|[^a-z0-9_])(${HOLD_EN.map((w) => w.replace(/ /g, '\\s+')).join('|')})($|[^a-z0-9_])`, 'i')
const HOLD_CMD_RE = /\brm\s+-|--force\b/i

export interface AwayQuestion {
  question: string
  options: { label: string }[]
  multiSelect?: boolean
}

/** 코드 규칙: 위험한 낱말이 있으면 true (모델을 부르지 않고 둔다) */
export function mustHoldQuestion(q: AwayQuestion) {
  const text = [q.question, ...q.options.map((o) => o.label)].join(' ').toLowerCase()
  return HOLD_KO.some((w) => text.includes(w)) || HOLD_EN_RE.test(text) || HOLD_CMD_RE.test(text)
}

export type AwayDecision = { question: string; decision: 'answer' | 'hold'; answer?: string; basis?: string; reason: 'rule' | 'model' | 'not_option' | 'no_answer' }

/**
 * 모델 판정을 그대로 믿지 않는다: 규칙에 걸리면 둔다, 선택지가 있으면 답은 선택지 이름이어야 한다(여러 개 고르기는 쉼표로),
 * 선택지가 없으면(자유 질문) 답 길이를 제한한다
 */
export function decideAway(questions: AwayQuestion[], parsed: { question?: string; decision?: string; answer?: string; basis?: string }[], answerMax = 300): AwayDecision[] {
  return questions.map((q) => {
    if (mustHoldQuestion(q)) return { question: q.question, decision: 'hold', reason: 'rule' }
    const p = parsed.find((x) => x?.question === q.question)
    const answer = typeof p?.answer === 'string' ? p.answer.trim() : ''
    if (p?.decision !== 'answer' || !answer) return { question: q.question, decision: 'hold', reason: p?.decision === 'answer' ? 'no_answer' : 'model' }
    if (q.options.length) {
      const labels = new Set(q.options.map((o) => o.label))
      const picked = q.multiSelect ? answer.split(/\s*,\s*/) : [answer]
      if (!picked.every((a) => labels.has(a))) return { question: q.question, decision: 'hold', reason: 'not_option' }
    }
    return { question: q.question, decision: 'answer', answer: answer.slice(0, answerMax), basis: typeof p.basis === 'string' ? p.basis.slice(0, 200) : undefined, reason: 'model' }
  })
}

/**
 * 대신 답한 결과 → 직원에게 줄 답. 하나라도 답하지 못했으면 null = 대표를 기다린다 (결재함 질문으로 남는다).
 * 한 번 묻는 질문 묶음은 일부만 답할 수 없어서 통째로 기다린다 (리드 결정: 비서가 답하지 못한 질문은 아침까지)
 */
export function awayAnswers(decided: AwayDecision[]): Record<string, string> | null {
  if (decided.length === 0 || decided.some((d) => d.decision !== 'answer')) return null
  return Object.fromEntries(decided.map((d) => [d.question, d.answer!]))
}

/** 모델에게 줄 글: 믿을 수 없는 글(업무 카드·기획서·지시·질문)은 문서 구역으로 감싸고, 구역 안 지시는 따르지 않게 (구역 닫는 표시는 지운다) */
export function wrapDocument(name: string, body: string) {
  return `<문서 이름="${name.replace(/["<>]/g, '')}">\n${body.replace(/<\/?문서[^>]*>/g, '')}\n</문서>`
}
