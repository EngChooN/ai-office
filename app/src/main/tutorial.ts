// 첫 업무 튜토리얼 구동부 — shared/tutorial.ts의 대본(상태기계)을 실제 사무실 데이터로 옮긴다.
// AI를 부르지 않는다: 연습 직원은 세션이 없고, 기획안·결과·회의 발언은 대본 문구로 채운다.

import { t } from '../shared/i18n/index.ts'
import type { HireInput, Lab, Meeting, Task, Team } from '../shared/types'
import {
  endTutorial,
  enterEffects,
  IDLE_TUTORIAL,
  onEvent,
  remainingWait,
  skipStep,
  startScenario,
  tutorialSnapshot,
  type CastRole,
  type PracticeCast,
  type TutorialEffect,
  type TutorialEvent,
  type TutorialInput,
  type TutorialScenario,
  type TutorialSnapshot,
  type TutorialState,
  type Transition,
} from '../shared/tutorial.ts'
import * as db from './db'

/** office가 내어 주는 손잡이 — 연습 데이터는 모두 isPractice 표시를 달고 만든다 */
export interface TutorialPort {
  hirePractice(input: HireInput): string
  createPracticeTeam(name: string): Team
  createPracticeLab(input: Omit<Lab, 'id'>): Lab
  setTeamLead(teamId: string, leadId: string): void
  staffExists(id: string): boolean
  staffName(id: string): string
  task(id: string): Task | undefined
  saveTask(task: Task): void
  createPracticeTask(input: { title: string; detail: string; teamId: string; labId: string; meetingId?: string }): Task
  approvePlan(taskId: string): void
  meeting(id: string): Meeting | undefined
  saveMeeting(meeting: Meeting): void
  /** 말풍선 (빈 글이면 지우고 쉬는 상태로) */
  setBubble(staffId: string, text: string): void
  addFunds(amount: number, label: string, key: string): void
  hasPracticeData(): boolean
  clearPracticeData(): void
  changed(): void
}

/** 저장하는 진행 상태 — 대본 상태 + 이번 연습에서 만든 데이터 id */
interface Saved {
  state: TutorialState
  cast: PracticeCast | null
  taskId: string | null
  meetingId: string | null
  todoIds: string[]
}

const EMPTY: Saved = { state: IDLE_TUTORIAL, cast: null, taskId: null, meetingId: null, todoIds: [] }
/** 연습 직원 아바타 (기존 캐릭터 중 고정 3종) */
const CAST_AVATARS: Record<CastRole, number> = { lead: 5, designer: 18, dev: 13 }

export class Tutorial {
  private saved: Saved = EMPTY
  private timer: NodeJS.Timeout | null = null

  constructor(private port: TutorialPort) {}

  /** 앱을 켤 때: 저장된 단계를 이어 간다 (지금 단계에 들어올 때 한 일을 한 번 더 — 모두 여러 번 해도 같은 결과) */
  load() {
    const saved = db.loadTutorial<Saved>()
    this.saved = saved ? { ...EMPTY, ...saved, state: { ...IDLE_TUTORIAL, ...saved.state } } : EMPTY
    // 연습 회사가 사라졌으면(다른 경로로 지움) 진행도 접는다
    if (this.saved.cast && !this.port.staffExists(this.saved.cast.leadId)) this.saved = { ...EMPTY, state: endTutorial(this.saved.state) }
    this.run(enterEffects(this.saved.state))
    this.persist(this.saved)
    this.scheduleTimer()
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
  }

  snapshot(): TutorialSnapshot {
    const { state, cast, taskId, meetingId } = this.saved
    return tutorialSnapshot(state, { hasPractice: this.port.hasPracticeData(), cast, taskId, meetingId })
  }

  /** 시나리오 시작 — 연습 회사가 없으면 만든다. 앞 시나리오의 연습 카드는 정리할 때까지 남는다 */
  start(scenario: TutorialScenario) {
    if (scenario !== 'task' && scenario !== 'meeting') return
    const cast = this.ensureCast()
    this.saved = scenario === 'task' ? { ...this.saved, cast, taskId: null } : { ...this.saved, cast, meetingId: null, todoIds: [] }
    this.apply(startScenario(this.saved.state, scenario, Date.now()))
  }

  /** 화면이 보내는 진행 입력 */
  act(input: TutorialInput) {
    const now = Date.now()
    switch (input.type) {
      case 'skipStep':
        return this.apply(skipStep(this.saved.state, now))
      case 'showNow':
        return this.apply(onEvent(this.saved.state, { type: 'timer' }, now))
      case 'createTodos':
        if (!this.saved.meetingId) return
        this.run([{ kind: 'createTodos' }])
        this.persist(this.saved)
        return this.apply(onEvent(this.saved.state, { type: 'todosCreated' }, now))
      case 'end':
        this.run([{ kind: 'bubbles', lines: {} }])
        return this.persist({ ...this.saved, state: endTutorial(this.saved.state) })
      default:
        return this.apply(onEvent(this.saved.state, input, now))
    }
  }

  /**
   * office가 카드·회의를 처리하며 알려 준다. 이번 연습의 카드·회의일 때만 단계를 넘긴다 — 받아들였으면 true.
   * taskCreated(지금 단계가 카드 만들기면 그 카드를 연습 카드로) · taskStarted(연습 직원에게 맡김 — AI 대신 진행 중으로) · meetingStarted(연습 직원 회의)
   */
  notify(type: Exclude<TutorialEvent['type'], 'view'>, id: string): boolean {
    const now = Date.now()
    const tr = onEvent(this.saved.state, { type }, now)
    if (!tr) return false
    if (type === 'taskCreated') this.adoptTask(id)
    else if (type === 'meetingStarted') this.saved = { ...this.saved, meetingId: id }
    else if (id !== this.saved.taskId) return false
    if (type === 'taskStarted') this.startTask()
    this.apply(tr)
    return true
  }

  /** 연습 회사 정리 — 연습 표시가 붙은 랩·팀·직원·카드·회의를 모두 지운다 (해 본 시나리오 기록은 남긴다) */
  cleanup() {
    if (this.timer) clearTimeout(this.timer)
    this.port.clearPracticeData()
    this.persist({ ...EMPTY, state: endTutorial(this.saved.state) })
  }

  // ── 내부 ──────────────────────────────────────────────

  private apply(tr: Transition | null) {
    if (!tr) return
    this.saved = { ...this.saved, state: tr.state }
    // 효과가 만든 카드·회의 id까지 함께 저장한다
    this.run(tr.effects)
    this.persist(this.saved)
    this.scheduleTimer()
  }

  private persist(next: Saved) {
    this.saved = next
    db.saveTutorial(next)
    this.port.changed()
  }

  /** 대기 단계면 남은 시간 뒤에 저절로 넘긴다 (앱을 꺼 둔 사이 지났으면 바로) */
  private scheduleTimer() {
    if (this.timer) clearTimeout(this.timer)
    const wait = remainingWait(this.saved.state, Date.now())
    if (wait === null) return
    this.timer = setTimeout(() => this.apply(onEvent(this.saved.state, { type: 'timer' }, Date.now())), wait)
  }

  private ensureCast(): PracticeCast {
    const cast = this.saved.cast
    if (cast && this.port.staffExists(cast.leadId)) return cast
    const team = this.port.createPracticeTeam(t('tutorial.cast.team'))
    const hire = (role: CastRole, nameKey: Parameters<typeof t>[0], roleKey: Parameters<typeof t>[0]) =>
      this.port.hirePractice({ name: t(nameKey), role: t(roleKey), avatar: CAST_AVATARS[role], model: 'haiku', cwd: '', systemPrompt: '', approvalMode: 'ask', teamId: team.id })
    const leadId = hire('lead', 'tutorial.cast.lead', 'tutorial.cast.leadRole')
    const designerId = hire('designer', 'tutorial.cast.designer', 'tutorial.cast.designerRole')
    const devId = hire('dev', 'tutorial.cast.dev', 'tutorial.cast.devRole')
    this.port.setTeamLead(team.id, leadId)
    const lab = this.port.createPracticeLab({ name: t('tutorial.cast.lab'), color: team.color, goal: t('tutorial.cast.labGoal'), cwd: null, leadId, memberIds: [leadId, designerId, devId], isPractice: true })
    return { labId: lab.id, teamId: team.id, leadId, designerId, devId }
  }

  /** 사용자가 만든 카드를 이번 연습 카드로 (연습 표시·연습 팀·랩) */
  private adoptTask(taskId: string) {
    const task = this.port.task(taskId)
    const cast = this.saved.cast
    if (!task || !cast) return
    this.port.saveTask({ ...task, teamId: cast.teamId, labId: cast.labId, isPractice: true })
    this.saved = { ...this.saved, taskId }
  }

  /** 이번 연습 카드 (없으면 대본 제목으로 만든다 — 카드 만들기를 건너뛴 경우) */
  private ensureTask(): Task | null {
    const cast = this.saved.cast
    if (!cast) return null
    const found = this.saved.taskId ? this.port.task(this.saved.taskId) : undefined
    if (found) return found
    const task = this.port.createPracticeTask({ title: t('tutorial.task.card.title'), detail: t('tutorial.task.card.detail'), teamId: cast.teamId, labId: cast.labId })
    this.saved = { ...this.saved, taskId: task.id }
    return task
  }

  /** 리드에게 맡긴 것으로 — AI에게 보내지 않고 진행 중 칸으로만 */
  private startTask() {
    const task = this.ensureTask()
    if (!task || !this.saved.cast) return
    this.port.saveTask({ ...task, assigneeId: this.saved.cast.leadId, status: 'doing', updatedAt: Date.now() })
  }

  private run(effects: TutorialEffect[]) {
    for (const effect of effects) this.runOne(effect)
  }

  private runOne(effect: TutorialEffect) {
    const cast = this.saved.cast
    if (!cast) return
    const now = Date.now()
    switch (effect.kind) {
      case 'createTask':
        this.ensureTask()
        return
      case 'startTask':
        this.startTask()
        return
      case 'proposePlan': {
        const task = this.ensureTask()
        if (!task || task.plan) return
        this.port.saveTask({ ...task, assigneeId: cast.leadId, status: 'doing', plan: this.practicePlan(cast, now), updatedAt: now })
        return
      }
      case 'approvePlan':
        if (this.saved.taskId) this.port.approvePlan(this.saved.taskId)
        return
      case 'work':
        this.work(effect.phase, now)
        return
      case 'finishTask': {
        const task = this.ensureTask()
        if (task) this.port.saveTask({ ...task, status: 'done', updatedAt: now })
        return
      }
      case 'startMeeting':
        this.ensureMeeting(cast, now)
        return
      case 'talk': {
        const meeting = this.ensureMeeting(cast, now)
        const lines = this.meetingLines(cast).slice(0, effect.count)
        this.port.saveMeeting({ ...meeting, status: 'running', messages: lines.map((l, i) => ({ ...l, ts: meeting.createdAt + (i + 1) * 1000 })) })
        return
      }
      case 'wrapMeeting': {
        const meeting = this.ensureMeeting(cast, now)
        const decisions = [t('tutorial.meeting.decision1'), t('tutorial.meeting.decision2')]
        const summary = [t('tutorial.meeting.wrap.bubble'), `${t('tutorial.label.decisions')}:`, ...decisions.map((d) => `- ${d}`)].join('\n')
        const lines = this.meetingLines(cast)
        this.port.saveMeeting({ ...meeting, status: 'done', summary, messages: lines.map((l, i) => ({ ...l, ts: meeting.createdAt + (i + 1) * 1000 })) })
        return
      }
      case 'createTodos': {
        if (!this.saved.meetingId || this.saved.todoIds.some((id) => this.port.task(id))) return
        const todos = [
          { title: t('tutorial.meeting.todo1'), detail: t('tutorial.meeting.decision1') },
          { title: t('tutorial.meeting.todo2'), detail: t('tutorial.meeting.decision2') },
        ]
        const todoIds = todos.map((todo) => this.port.createPracticeTask({ ...todo, teamId: cast.teamId, labId: cast.labId, meetingId: this.saved.meetingId! }).id)
        this.saved = { ...this.saved, todoIds }
        return
      }
      case 'bubbles':
        for (const role of ['lead', 'designer', 'dev'] as const) {
          const key = effect.lines[role]
          this.port.setBubble(cast[`${role}Id`], key ? t(key) : '')
        }
        return
      case 'complete':
        if (effect.amount > 0) this.port.addFunds(effect.amount, t('tutorial.reward.label', { name: t(effect.scenario === 'task' ? 'tutorial.picker.task' : 'tutorial.picker.meeting') }), `tutorial:${effect.scenario}`)
        return
    }
  }

  /** 팀원 작업: 시작이면 하위 카드를 진행 중으로, 끝이면 하위는 완료·상위 카드는 결과와 함께 검토 칸으로 */
  private work(phase: 'start' | 'done', now: number) {
    const parent = this.ensureTask()
    if (!parent) return
    for (const id of parent.plan?.childIds ?? []) {
      const child = this.port.task(id)
      if (child) this.port.saveTask({ ...child, status: phase === 'start' ? 'doing' : 'done', updatedAt: now })
    }
    if (phase === 'done') this.port.saveTask({ ...parent, status: 'review', result: practiceResult(), updatedAt: now })
  }

  private practicePlan(cast: PracticeCast, now: number): Task['plan'] {
    const spec = [
      `## ${t('tutorial.task.plan.title')}`,
      `- ${t('tutorial.label.purpose')}: ${t('tutorial.task.plan.purpose')}`,
      `- ${t('tutorial.label.reqs')}: ${t('tutorial.task.plan.reqs')}`,
      `- ${t('tutorial.label.scope')}: ${t('tutorial.task.plan.scope')}`,
      `- ${t('tutorial.label.doneWhen')}: ${t('tutorial.task.plan.done')}`,
      `- ${t('tutorial.label.subtasks')}: ${t('tutorial.task.plan.subtasks')}`,
      '',
      `_${t('tutorial.task.plan.note')}_`,
    ].join('\n')
    const detail = t('tutorial.task.card.detail')
    return {
      spec,
      subtasks: [
        { title: t('tutorial.label.design'), detail, assigneeId: cast.designerId, assigneeName: this.port.staffName(cast.designerId) },
        { title: t('tutorial.label.build'), detail, assigneeId: cast.devId, assigneeName: this.port.staffName(cast.devId) },
      ],
      status: 'waiting',
      feedback: '',
      isAggregating: false,
      proposedAt: now,
    }
  }

  private ensureMeeting(cast: PracticeCast, now: number): Meeting {
    const found = this.saved.meetingId ? this.port.meeting(this.saved.meetingId) : undefined
    if (found) return found
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      topic: t('tutorial.meeting.topic'),
      participantIds: [cast.leadId, cast.designerId, cast.devId],
      rounds: 1,
      status: 'running',
      messages: [],
      summary: '',
      createdAt: now,
      isPractice: true,
    }
    this.port.saveMeeting(meeting)
    this.saved = { ...this.saved, meetingId: meeting.id }
    return meeting
  }

  private meetingLines(cast: PracticeCast) {
    const line = (staffId: string, key: Parameters<typeof t>[0]) => ({ staffId, name: this.port.staffName(staffId), text: t(key) })
    return [line(cast.leadId, 'tutorial.meeting.say.lead'), line(cast.designerId, 'tutorial.meeting.say.designer'), line(cast.devId, 'tutorial.meeting.say.dev')]
  }
}

function practiceResult() {
  return [
    `## ${t('tutorial.task.result.title')}`,
    t('tutorial.task.result.summary'),
    '',
    `- ${t('tutorial.label.changes')}: ${t('tutorial.task.result.changes')}`,
    `- ${t('tutorial.label.who')}: ${t('tutorial.task.result.who')}`,
    '',
    `_${t('tutorial.task.result.note')}_`,
  ].join('\n')
}
