import { useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { PlayIcon, PlusIcon, SquareIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Markdown } from '@/components/markdown'
import { AttachButton, AttachmentView, DraftAttachments, useDraftAttachments } from '@/components/attachments'
import { ArtifactCards } from '@/components/artifact-card'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { useOffice } from '@/store'
import { isAbsorbedOpen } from '@shared/planTasks'
import { t, type TKey } from '@shared/i18n'
import type { Task, TaskStatus } from '@shared/types'
import { PlanCard } from './PlanCard'
import { RunCard } from './RunCard'
import { useTutorialStep, useTutorialTaskId } from './Tutorial'
import { Avatar, PracticeBadge } from './StaffCard'
import { formatCost, formatTokens } from './status'
import { roleLabel } from '@shared/roleLabel'
import { AutonomyCheck, TaskAutonomy } from './Autonomy'

const COLUMNS: { status: TaskStatus; label: TKey; hint: TKey | null }[] = [
  {
    status: 'todo',
    label: 'board.col.todo',
    hint: 'board.col.todoHint',
  },
  { status: 'doing', label: 'board.col.doing', hint: 'board.col.doingHint' },
  { status: 'review', label: 'board.col.review', hint: 'board.col.reviewHint' },
  { status: 'done', label: 'board.col.done', hint: null },
]
const DRAG_TYPE = 'text/task-id'

/** 업무 보드(칸반): 카드를 직원에게 배정하면 지시가 나가고, 보고가 오면 검토로 넘어온다 */
export function BoardPage() {
  const tasks = useOffice((s) => s.tasks)
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [teamId, setTeamId] = useState('')
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
  const labs = useOffice((s) => s.labs)
  const [labId, setLabId] = useState('')
  /** 자율 진행(묻지 않고 끝까지)으로 만들기 */
  const [isAutonomous, setIsAutonomous] = useState(false)
  /** 보드 필터: 전체 또는 특정 랩 */
  const [labFilter, setLabFilter] = useState('')
  // 튜토리얼 '카드 만들기' 단계: 대본의 제목·설명을 미리 채운다
  const tutorialStep = useTutorialStep()
  useEffect(() => {
    if (tutorialStep !== 'a2') return
    setTitle((v) => v || t('tutorial.task.card.title'))
    setDetail((v) => v || t('tutorial.task.card.detail'))
  }, [tutorialStep])

  const draftFiles = useDraftAttachments()
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const attachments = await draftFiles.upload()
    draftFiles.clear()
    await window.office.createTask({
      title: title.trim(),
      detail: detail.trim(),
      teamId: teamId || null,
      labId: labId || null,
      attachments,
      ...(isAutonomous ? { isAutonomous: true } : {}),
    })
    setTitle('')
    setDetail('')
    setIsAutonomous(false)
  }
  const handleDrop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData(DRAG_TYPE)
    if (id) void window.office.updateTask(id, { status })
  }

  return (
    <Page title={t('board.title')} description={t('board.description')} className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="bg-card flex flex-col gap-2 rounded-xl border p-3">
        {/* 좁으면 팀·랩·추가 버튼이 다음 줄로 내려간다 */}
        <div className="flex flex-wrap gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('board.titlePlaceholder')} className="min-w-48 flex-1 basis-48" />
          <NativeSelect value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-36 shrink-0">
            <option value="">{t('board.noTeam')}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={labId} onChange={(e) => setLabId(e.target.value)} className="w-36 shrink-0">
            <option value="">{t('board.noLab')}</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" disabled={!title.trim()} data-tour="tut-add">
            <PlusIcon /> {t('board.add')}
          </Button>
        </div>
        <div className="flex items-start gap-2">
          <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} {...draftFiles.bind} placeholder={t('board.detailPlaceholder')} className="min-h-12" />
          <AttachButton onPick={draftFiles.add} />
        </div>
        <DraftAttachments files={draftFiles.files} onRemove={draftFiles.remove} />
        <AutonomyCheck checked={isAutonomous} onChange={setIsAutonomous} />
      </form>
      <ActiveRuns />
      {labs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[{ id: '', name: t('board.filterAll'), color: '' }, ...labs].map((l) => (
            <button key={l.id || 'all'} type="button" onClick={() => setLabFilter(l.id)} className={cn('rounded-full border px-2.5 py-0.5 text-xs', labFilter === l.id && 'border-primary bg-accent')}>
              {l.id && <span className="mr-1 inline-block size-2 rounded-full" style={{ background: l.color }} />}
              {l.name}
            </button>
          ))}
        </div>
      )}
      {/* 칸은 최소 240px을 지키고, 창이 좁으면 보드만 가로로 스크롤한다 */}
      {/* 휴대폰: 칸 하나가 화면을 거의 채우고 한 칸씩 넘긴다 */}
      <div className="phone:auto-cols-[calc(100%-24px)] phone:snap-x phone:snap-mandatory grid min-h-0 flex-1 auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1">
        {COLUMNS.map((col) => {
          // 기획에 묶인 카드는 기획 카드 상세에서만 보인다 (기획이 끝나면 함께 완료)
          const items = tasks
            .filter(
              (tk) =>
                tk.status === col.status &&
                (!labFilter || tk.labId === labFilter) &&
                !isAbsorbedOpen(
                  tk,
                  tasks.find((p) => p.id === tk.parentId),
                ),
            )
            .sort((a, b) => b.updatedAt - a.updatedAt)
          return (
            <section
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(col.status)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={handleDrop(col.status)}
              className={cn('bg-muted/40 phone:snap-start flex min-h-40 flex-col gap-2 overflow-hidden rounded-xl border p-2', dragOver === col.status && 'border-primary')}
            >
              <header className="flex items-baseline gap-2 px-1">
                <span className="text-sm font-semibold whitespace-nowrap">{t(col.label)}</span>
                <span className="text-muted-foreground text-xs">{items.length}</span>
                {col.status === 'todo' && items.some((tk) => tk.assigneeId) && (
                  <Button size="sm" variant="secondary" className="ml-auto h-6 px-2 text-[11px]" onClick={() => void window.office.startTasks(items.filter((tk) => tk.assigneeId).map((tk) => tk.id))}>
                    {t('board.startAll', { count: items.filter((tk) => tk.assigneeId).length })}
                  </Button>
                )}
              </header>
              {col.hint && <p className="text-muted-foreground px-1 text-[11px]">{t(col.hint)}</p>}
              {/* 카드가 많거나 길면 칸 안에서 스크롤한다 */}
              <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
                {items.map((tk) => (
                  <TaskCard key={tk.id} task={tk} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </Page>
  )
}

function TaskCard({ task }: { task: Task }) {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const team = useOffice((s) => s.teams.find((tm) => tm.id === task.teamId))
  const lab = useOffice((s) => s.labs.find((l) => l.id === task.labId))
  const assignee = staff.find((s) => s.id === task.assigneeId)
  const [isOpen, setIsOpen] = useState(false)
  // 튜토리얼 연습 카드면 누를 곳에 표시를 붙이고, 결과를 열면 엔진에 알린다
  const isTutorialTask = useTutorialTaskId() === task.id
  // 마지막 단계('검토 완료')는 보드 열의 버튼이라, 열어 둔 상세 창이 가리지 않게 닫는다
  const tutorialStepNow = useTutorialStep()
  useEffect(() => {
    if (isTutorialTask && tutorialStepNow === 'a7') setIsOpen(false)
  }, [isTutorialTask, tutorialStepNow])
  const openDetail = () => {
    setIsOpen(true)
    if (isTutorialTask && task.result) void window.office.tutorialAct({ type: 'resultOpened' })
  }
  const preview = task.result || task.detail
  const parent = useOffice((s) => s.tasks.find((x) => x.id === task.parentId))
  const children = useOffice(useShallow((s) => s.tasks.filter((x) => x.parentId === task.id)))
  const planLabel = planStatusLabel(task, children)
  const run = useOffice((s) => s.runs.find((r) => r.taskId === task.id && r.status !== 'stopped'))
  const allLabs = useOffice((s) => s.labs)
  const allTeams = useOffice((s) => s.teams)
  // 이 카드의 랩·팀에 교육된 프로세스 매뉴얼 (없으면 매뉴얼이 있는 아무 랩·팀)
  const processScopes = [
    ...allLabs
      .filter((l) => l.manuals?.length && (!task.labId || l.id === task.labId))
      .map((l) => ({
        kind: 'lab' as const,
        id: l.id,
        name: l.name,
        manuals: l.manuals!,
      })),
    ...allTeams
      .filter((tm) => tm.kind === 'hired' && tm.manuals?.length && (!task.teamId || tm.id === task.teamId))
      .map((tm) => ({
        kind: 'team' as const,
        id: tm.id,
        name: tm.name,
        manuals: tm.manuals!,
      })),
  ]
  const startProcess = (value: string) => {
    const [kind, id, manualName] = value.split('|')
    if (!manualName) return
    void window.office.startRun({
      manualName,
      scope: { kind: kind as 'lab' | 'team', id },
      input: `${task.title}${task.detail ? `\n${task.detail}` : ''}`,
      attachments: task.attachments,
      taskId: task.id,
    })
  }
  // 팀 카드면 그 팀원을 먼저 보여준다
  const candidates = [...staff].sort(
    (a, b) => Number(Boolean(lab?.memberIds.includes(b.id))) - Number(Boolean(lab?.memberIds.includes(a.id))) || Number(b.teamId === task.teamId) - Number(a.teamId === task.teamId),
  )

  return (
    <article draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, task.id)} className="bg-card flex min-w-0 shrink-0 cursor-grab flex-col gap-2 rounded-lg border p-3 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <button type="button" onClick={openDetail} className="min-w-0 flex-1 text-left font-medium break-words hover:underline">
          {task.title}
        </button>
        <button type="button" onClick={() => void window.office.deleteTask(task.id)} className="text-muted-foreground hover:text-foreground" aria-label={t('common.delete')}>
          <Trash2Icon className="size-3.5" />
        </button>
      </div>
      {(parent || planLabel) && (
        <div className="flex flex-wrap gap-1 text-[10px]">
          {parent && <span className="bg-muted text-muted-foreground max-w-full truncate rounded px-1.5">↳ {parent.title}</span>}
          {planLabel && <span className={cn('rounded px-1.5 font-semibold', task.plan?.status === 'waiting' ? 'bg-status-waiting text-background' : 'bg-primary/15 text-primary')}>{planLabel}</span>}
        </div>
      )}
      <TaskAutonomy task={task} />
      {(team || lab || task.isPractice) && (
        <div className="flex flex-wrap gap-1">
          {task.isPractice && <PracticeBadge className="w-fit" />}
          {team && (
            <span className="w-fit rounded px-1.5 text-[10px] font-semibold text-white" style={{ background: team.color }}>
              {team.name}
            </span>
          )}
          {lab && (
            <span className="w-fit rounded border px-1.5 text-[10px] font-semibold" style={{ borderColor: lab.color, color: lab.color }}>
              🧪 {lab.name}
            </span>
          )}
        </div>
      )}
      <AttachmentView attachments={task.attachments} size="sm" />
      <ArtifactCards artifacts={task.artifacts} />
      {preview && (
        // 카드에는 앞부분만, 누르면 상세 창에서 전체를 본다
        <button
          type="button"
          onClick={openDetail}
          data-tour={isTutorialTask && task.status === 'review' ? 'tut-result' : undefined}
          className={cn('relative max-h-24 overflow-hidden rounded p-2 text-left text-xs', task.result ? 'bg-muted' : 'text-muted-foreground border')}
        >
          <Markdown className="pointer-events-none">{preview}</Markdown>
          {task.result && <span className="from-muted pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t" />}
        </button>
      )}
      {task.usage && (
        <span className="text-muted-foreground text-[10px] tabular-nums">{t('board.card.usage', { tokens: formatTokens(task.usage.tokens), cost: formatCost(task.usage.costUsd) })}</span>
      )}
      <TaskDetail task={task} isOpen={isOpen} onOpenChange={setIsOpen} />
      {/* 휴대폰: 카드 끌어 옮기기가 터치에서 안 되니 칸을 골라 옮긴다 */}
      <NativeSelect
        value={task.status}
        onChange={(e) =>
          void window.office.updateTask(task.id, {
            status: e.target.value as TaskStatus,
          })
        }
        aria-label={t('board.moveColumn')}
        className="phone:block hidden h-7 text-xs"
      >
        {COLUMNS.map((c) => (
          <option key={c.status} value={c.status}>
            {t('board.columnOption', { column: t(c.label) })}
          </option>
        ))}
      </NativeSelect>
      {run ? (
        <RunCard run={run} isCompact />
      ) : task.status === 'todo' && processScopes.length > 0 ? (
        <>
          <NativeSelect value="" onChange={(e) => startProcess(e.target.value)} className="h-7 text-xs">
            <option value="">{t('board.runProcess')}</option>
            {processScopes.flatMap((sc) =>
              sc.manuals.map((m) => (
                <option key={`${sc.id}-${m}`} value={`${sc.kind}|${sc.id}|${m}`}>
                  {m} · {sc.name}
                </option>
              )),
            )}
          </NativeSelect>
          <TodoAssign task={task} candidates={candidates} />
        </>
      ) : task.status === 'todo' ? (
        <div className="flex items-center gap-1.5">
          {/* 담당 제안(회의에서 나온 카드)은 미리 채워져 있고, "시작"을 눌러야 지시가 나간다 */}
          <NativeSelect
            value={task.assigneeId ?? ''}
            onChange={(e) =>
              void window.office.updateTask(task.id, {
                assigneeId: e.target.value || null,
              })
            }
            className="h-7 min-w-0 flex-1 text-xs"
          >
            <option value="">{t('board.pickAssignee')}</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {roleLabel(s.role)}
              </option>
            ))}
          </NativeSelect>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!task.assigneeId}
            onClick={() => task.assigneeId && void window.office.assignTask(task.id, task.assigneeId)}
            data-tour={isTutorialTask ? 'tut-start' : undefined}
          >
            {t('board.start')}
          </Button>
        </div>
      ) : (
        assignee && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Avatar avatar={assignee.avatar} name={assignee.name} teamId={assignee.teamId} className="size-5" /> {assignee.name}
          </div>
        )
      )}
      {task.status === 'doing' && !run && task.plan?.status !== 'waiting' && (
        <div className="flex gap-1.5">
          {task.plan?.isPaused ? (
            <Button size="sm" className="h-7 flex-1 px-2 text-xs" onClick={() => void window.office.resumePlan(task.id)}>
              <PlayIcon /> {t('board.resume')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 px-2 text-xs"
              onClick={() =>
                window.confirm(task.plan?.status === 'approved' ? t('board.confirmStopPlan') : t('board.confirmStopTask')) &&
                void window.office.stopTask(task.id)
              }
            >
              <SquareIcon /> {task.plan?.status === 'approved' ? t('board.stopPlan') : t('board.stop')}
            </Button>
          )}
        </div>
      )}
      {task.status === 'review' && (
        <Button size="sm" variant="secondary" onClick={() => void window.office.updateTask(task.id, { status: 'done' })} data-tour={isTutorialTask ? 'tut-done' : undefined}>
          {t('board.reviewDone')}
        </Button>
      )}
    </article>
  )
}

const STATUS_LABEL: Record<TaskStatus, TKey> = Object.fromEntries(COLUMNS.map((c) => [c.status, c.label])) as Record<TaskStatus, TKey>

/** 리드 기획안의 진행 단계 */
function planStatusLabel(task: Task, children: Task[]) {
  if (!task.plan) return ''
  if (task.plan.status === 'waiting') return t('board.plan.waiting')
  if (task.plan.status === 'revise') return t('board.plan.revise')
  if (task.plan.isPaused) return t('board.plan.paused')
  // 앞 회차 하위·묶은 카드는 빼고 이번 기획안의 하위 업무만 센다
  const steps = children.filter((c) => task.plan?.childIds?.includes(c.id))
  if (task.plan.isAggregating) return task.status === 'doing' ? t('board.plan.aggregating') : t('board.plan.progress', { done: steps.length, total: steps.length })
  return t('board.plan.progress', { done: steps.filter((c) => c.status === 'review' || c.status === 'done').length, total: steps.length })
}

/** 카드 상세: 설명·첨부·보고를 마크다운으로 크게 본다 */
function TaskDetail({ task, isOpen, onOpenChange }: { task: Task; isOpen: boolean; onOpenChange: (isOpen: boolean) => void }) {
  const staff = useOffice((s) => s.staff)
  const assignee = staff.find((x) => x.id === task.assigneeId)
  const children = useOffice(useShallow((s) => s.tasks.filter((x) => x.parentId === task.id)))
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{task.title}</DialogTitle>
          <DialogDescription>
            {t(STATUS_LABEL[task.status])}
            {assignee && ` · ${t('board.detail.assignee', { name: assignee.name })}`}
          </DialogDescription>
        </DialogHeader>
        {task.detail && (
          <section className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-xs font-semibold">{t('board.detail.description')}</h3>
            <Markdown className="text-sm">{task.detail}</Markdown>
          </section>
        )}
        <AttachmentView attachments={task.attachments} />
        <ArtifactCards artifacts={task.artifacts} />
        {task.plan && <PlanCard task={task} isCompact />}
        {children.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-xs font-semibold">{t('board.detail.subtasks')}</h3>
            {children.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                <span className="bg-muted rounded px-1.5 text-[10px]">{t(STATUS_LABEL[c.status])}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                {task.plan?.absorbedIds?.includes(c.id) && <span className="text-muted-foreground shrink-0 text-[10px]">{t('board.detail.absorbed')}</span>}
                <span className="text-muted-foreground">{staff.find((x) => x.id === c.assigneeId)?.name ?? t('board.detail.unassigned')}</span>
              </div>
            ))}
          </section>
        )}
        {task.result && (
          <section className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-xs font-semibold">{t('board.detail.report')}</h3>
            <Markdown className="bg-muted rounded-lg p-4 text-sm">{task.result}</Markdown>
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** 진행 중·확인 필요한 프로세스 */
function ActiveRuns() {
  const runs = useOffice(useShallow((s) => s.runs.filter((r) => r.status === 'running' || r.status === 'checking')))
  if (runs.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{t('board.activeRuns', { count: runs.length })}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {runs.map((r) => (
          <RunCard key={r.id} run={r} />
        ))}
      </div>
    </section>
  )
}

/** 할 일 카드의 담당자 고르기 + 시작 */
function TodoAssign({ task, candidates }: { task: Task; candidates: { id: string; name: string; role: string }[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <NativeSelect
        value={task.assigneeId ?? ''}
        onChange={(e) =>
          void window.office.updateTask(task.id, {
            assigneeId: e.target.value || null,
          })
        }
        className="h-7 min-w-0 flex-1 text-xs"
      >
        <option value="">{t('board.orAssignOne')}</option>
        {candidates.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {roleLabel(s.role)}
          </option>
        ))}
      </NativeSelect>
      <Button size="sm" className="h-7 px-2 text-xs" disabled={!task.assigneeId} onClick={() => task.assigneeId && void window.office.assignTask(task.id, task.assigneeId)}>
        {t('board.start')}
      </Button>
    </div>
  )
}
