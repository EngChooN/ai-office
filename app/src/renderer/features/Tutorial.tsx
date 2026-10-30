// 첫 업무 튜토리얼 화면 — 시나리오 선택 · 단계 안내 줄(누를 곳 강조) · 축하 화면
// 진행은 main의 모의 진행 엔진(shared/tutorial.ts · main/tutorial.ts)이 정하고, 여기서는 스냅샷 tutorial을 그리고 입력만 보낸다.
import { useEffect, useState } from 'react'
import { CheckIcon, PresentationIcon, SkipForwardIcon, ClipboardListIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useOffice, type View } from '@/store'
import { formatWon } from '@shared/economy'
import { t, type TKey } from '@shared/i18n'
import { DONE_STEP, stepsOf, type TutorialScenario, type TutorialSnapshot, type TutorialView } from '@shared/tutorial'
import { useTourTarget } from './CoachTour'
import { navTourTarget } from './nav'

const PAD = 5
/** 튜토리얼 상태가 아직 없을 때의 빈 목록 — 선택자가 매번 새 배열을 돌려주면 zustand가 끝없이 다시 그린다 */
const NO_COMPLETED: TutorialScenario[] = []
const SCENARIO_LABEL: Record<TutorialScenario, TKey> = { task: 'tutorial.picker.task', meeting: 'tutorial.picker.meeting' }

/** 진행 중인 튜토리얼 (축하 화면 전까지) */
const isRunning = (tut: TutorialSnapshot | undefined): tut is TutorialSnapshot & { scenario: TutorialScenario; step: string } =>
  Boolean(tut?.scenario && tut.step && tut.step !== DONE_STEP)

/** 앱 화면 → 엔진이 아는 화면 */
const TUTORIAL_VIEW: Partial<Record<View, TutorialView>> = { map: 'office', board: 'board', inbox: 'inbox', meeting: 'meeting' }

/** 단계마다 눌러야 할 곳 (data-tour). 화면 열기 단계는 그 메뉴, 기다리는 단계는 없음 */
const STEP_TARGET: Record<string, string> = {
  a2: 'tut-add',
  a3: 'tut-start',
  a5: 'tut-approve',
  a6: 'tut-result',
  a7: 'tut-done',
  b2: 'tut-meeting-start',
  b3: 'tut-todos',
  b5: 'tut-finish',
}

function targetOf(tut: TutorialSnapshot): string | null {
  // 탭이 보이면 탭, 아니면 사이드바(폰은 아래 탭·더보기) 묶음을 가리킨다
  if (tut.until === 'view' && tut.view) return navTourTarget(tut.view === 'office' ? 'map' : tut.view)
  return (tut.step && STEP_TARGET[tut.step]) ?? null
}

/** 지금 튜토리얼이 이 카드·회의를 다루는지 — 화면이 누를 곳에 data-tour를 붙일 때 쓴다 */
export function useTutorialStep(): string | null {
  return useOffice((s) => (isRunning(s.tutorial) ? s.tutorial.step : null))
}
export const useTutorialTaskId = () => useOffice((s) => s.tutorial?.taskId ?? null)
export const useTutorialMeetingId = () => useOffice((s) => s.tutorial?.meetingId ?? null)

/** 코치마크가 끝나면 띄우는 "한 사이클 해 보기" 선택 */
export function TutorialPicker({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const completed = useOffice((s) => s.tutorial?.completed ?? NO_COMPLETED)
  const setView = useOffice((s) => s.setView)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const start = (scenario: TutorialScenario) => {
    onClose()
    void window.office.tutorialStart(scenario)
  }
  const skip = () => {
    onClose()
    setView('map')
    setHireOpen(true)
  }
  const options: { id: TutorialScenario | 'skip'; icon: React.ReactNode; title: TKey; desc: TKey; onClick: () => void }[] = [
    { id: 'task', icon: <ClipboardListIcon />, title: 'tutorial.picker.task', desc: 'tutorial.picker.taskDesc', onClick: () => start('task') },
    { id: 'meeting', icon: <PresentationIcon />, title: 'tutorial.picker.meeting', desc: 'tutorial.picker.meetingDesc', onClick: () => start('meeting') },
    { id: 'skip', icon: <SkipForwardIcon />, title: 'tutorial.picker.skip', desc: 'tutorial.picker.skipDesc', onClick: skip },
  ]
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tutorial.picker.title')}</DialogTitle>
          <DialogDescription>{t('tutorial.picker.desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={o.onClick}
              className={cn(
                'hover:border-primary hover:bg-accent flex items-center gap-3 rounded-lg border p-3 text-left transition-colors [&_svg]:size-5',
                o.id === 'skip' && 'text-muted-foreground border-dashed',
              )}
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', o.id === 'skip' ? 'bg-muted' : 'bg-primary/15 text-primary')}>{o.icon}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-foreground text-sm font-semibold">{t(o.title)}</span>
                <span className="text-muted-foreground text-xs">{t(o.desc)}</span>
              </span>
              {o.id !== 'skip' && completed.includes(o.id) && (
                <span className="text-primary flex shrink-0 items-center gap-0.5 text-[11px] font-semibold [&_svg]:size-3.5">
                  <CheckIcon /> {t('tutorial.picker.tried')}
                </span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 진행 중: 화면 아래 안내 한 줄 + 누를 곳 강조. 사용자가 연 화면을 엔진에 알린다 */
export function TutorialGuide() {
  const tut = useOffice((s) => s.tutorial)
  const view = useOffice((s) => s.view)
  const setMeetingPreset = useOffice((s) => s.setMeetingPreset)
  const running = isRunning(tut)
  const step = running ? tut.step : null
  const rect = useTourTarget(running ? targetOf(tut) : null)
  const now = useNow(running && tut.until === 'timer')

  // 화면을 열면(또는 그 화면에서 단계가 바뀌면) 알린다 — 엔진이 지금 단계와 맞을 때만 넘긴다
  const tutorialView = TUTORIAL_VIEW[view]
  useEffect(() => {
    if (step && tutorialView) void window.office.tutorialAct({ type: 'view', view: tutorialView })
  }, [step, tutorialView])

  // 회의 시작 단계: 주제와 연습 팀 참석자를 미리 채운다
  const cast = running ? tut.cast : null
  useEffect(() => {
    if (step === 'b2' && cast) setMeetingPreset({ topic: t('tutorial.meeting.topic'), participantIds: [cast.leadId, cast.designerId, cast.devId] })
  }, [step, cast, setMeetingPreset])

  if (!running) return null
  const steps = stepsOf(tut.scenario)
  const n = steps.findIndex((s) => s.id === tut.step) + 1
  const act = (input: Parameters<typeof window.office.tutorialAct>[0]) => void window.office.tutorialAct(input)
  const left = tut.until === 'timer' && tut.waitMs !== null ? Math.max(0, Math.ceil((tut.waitMs - (now - tut.stepAt)) / 1000)) : null

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="border-primary pointer-events-none fixed z-[84] animate-pulse rounded-lg border-2 transition-all duration-300"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 4px color-mix(in oklab, var(--primary) 25%, transparent)' }}
        />
      )}
      <div className="bg-background border-primary/40 phone:bottom-20 fixed bottom-4 left-1/2 z-[85] flex w-[min(560px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2 rounded-xl border p-3 shadow-2xl">
        <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
          <span className="whitespace-nowrap tabular-nums">{t('tutorial.guide.progress', { scenario: t(SCENARIO_LABEL[tut.scenario]), n, total: steps.length })}</span>
          <span className="flex flex-1 gap-0.5">
            {steps.map((s, i) => (
              <span key={s.id} className={cn('h-1 flex-1 rounded-full', i < n - 1 ? 'bg-primary/50' : i === n - 1 ? 'bg-primary' : 'bg-muted')} />
            ))}
          </span>
        </div>
        {tut.hint && <p className="text-sm font-medium">👉 {t(tut.hint)}</p>}
        {tut.note && <p className="text-muted-foreground -mt-1 text-xs">{t(tut.note)}</p>}
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="text-muted-foreground px-2" onClick={() => act({ type: 'end' })}>
            {t('tutorial.common.end')}
          </Button>
          <div className="ml-auto flex gap-1.5">
            {tut.until === 'timer' ? (
              <Button size="sm" variant="outline" onClick={() => act({ type: 'showNow' })}>
                {t('tutorial.common.showNow')}
                {left !== null && <span className="text-muted-foreground tabular-nums">{t('tutorial.guide.wait', { sec: left })}</span>}
              </Button>
            ) : tut.until === 'finish' ? (
              <Button size="sm" data-tour="tut-finish" onClick={() => act({ type: 'finish' })}>
                {t('tutorial.common.finish')}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => act({ type: 'skipStep' })}>
                {t('tutorial.common.skipStep')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/** 시나리오를 끝냈을 때: 축하·보상 + 진짜로 해 보기 / 다른 시나리오 / 연습 회사 정리 */
export function TutorialDone() {
  const tut = useOffice((s) => s.tutorial)
  const setView = useOffice((s) => s.setView)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const isOpen = Boolean(tut?.scenario && tut.step === DONE_STEP)
  if (!tut?.scenario || !isOpen) return null
  const scenario = tut.scenario
  const other: TutorialScenario = scenario === 'task' ? 'meeting' : 'task'
  const end = () => void window.office.tutorialAct({ type: 'end' })
  const goReal = () => {
    end()
    setView('map')
    setHireOpen(true)
  }
  return (
    <Dialog open onOpenChange={(open) => !open && end()}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="text-xl">{t('tutorial.done.title')}</DialogTitle>
          <DialogDescription>{t(scenario === 'task' ? 'tutorial.done.task' : 'tutorial.done.meeting')}</DialogDescription>
        </DialogHeader>
        {tut.reward > 0 && <div className="bg-accent mx-auto rounded-full px-3 py-1 text-sm font-semibold tabular-nums">💰 {t('tutorial.done.reward', { amount: formatWon(tut.reward) })}</div>}
        <div className="flex flex-col gap-2">
          <Button onClick={goReal}>{t('tutorial.done.real')}</Button>
          <Button variant="outline" onClick={() => void window.office.tutorialStart(other)}>
            {t('tutorial.done.other')}
            {tut.completed.includes(other) && <CheckIcon className="text-primary" />}
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => void window.office.tutorialCleanup()}>
            {t('tutorial.done.cleanup')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 기다리는 단계의 남은 초를 1초마다 다시 그린다 */
function useNow(isOn: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isOn) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isOn])
  return now
}
