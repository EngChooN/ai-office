// 연습 튜토리얼 화면 — 시나리오 선택 · 단계 안내 상자(누를 곳 강조) · 위 막대 칩 · 축하 화면
// 진행은 main의 모의 진행 엔진(shared/tutorial.ts · main/tutorial.ts)이 정하고, 여기서는 스냅샷 tutorial을 그리고 입력만 보낸다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CheckIcon, PresentationIcon, SkipForwardIcon, ClipboardListIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useOffice, type View } from '@/store'
import { formatWon } from '@shared/economy'
import { t, type TKey } from '@shared/i18n'
import { DONE_STEP, mainProgress, type TutorialScenario, type TutorialSnapshot, type TutorialView } from '@shared/tutorial'
import { useTourTarget } from './CoachTour'
import { placeTip, TIP_MARGIN, type TipSide } from './coachTip'
import { navTourTarget } from './nav'
import { hasDoneFirstTask } from '@/lib/firstTaskDone'
import { DuoIcon, IconText } from '@/components/duo-icon'

const PAD = 5
/** 높이를 재기 전 첫 자리 계산에 쓰는 안내 상자 높이 */
const TIP_H_GUESS = 150
/** 튜토리얼 상태가 아직 없을 때의 빈 목록 — 선택자가 매번 새 배열을 돌려주면 zustand가 끝없이 다시 그린다 */
const NO_COMPLETED: TutorialScenario[] = []

/** 진행 중인 튜토리얼 (축하 화면 전까지) */
const isRunning = (tut: TutorialSnapshot | undefined): tut is TutorialSnapshot & { scenario: TutorialScenario; step: string } =>
  Boolean(tut?.scenario && tut.step && tut.step !== DONE_STEP)

/** 앱 화면 → 엔진이 아는 화면 */
const TUTORIAL_VIEW: Partial<Record<View, TutorialView>> = { map: 'office', board: 'board', inbox: 'inbox', meeting: 'meeting' }

/** 단계마다 눌러야 할 곳 (data-tour). 화면 열기 단계는 그 메뉴, 기다리는 단계는 없음 */
const STEP_TARGET: Record<string, string> = {
  p1: 'hire',
  p2: 'tut-send',
  a5: 'tut-approve',
  p6: 'tut-report',
  b2: 'tut-meeting-start',
  b3: 'tut-todos',
  b5: 'tut-finish',
}
/** 안내 상자를 놓는 순서 — 지시 단계는 보내기 위(옆에 두면 입력칸을 가린다), 승인 단계는 버튼 아래(위·옆에 두면 기획안 글을 가린다) */
const STEP_SIDES: Record<string, readonly TipSide[]> = { p2: ['above', 'left'], a5: ['below', 'above', 'right', 'left'] }

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
/** 연습이 진행 중인지 (처음 힌트·업데이트 소식은 기다린다) */
export const useIsTutorialRunning = () => useOffice((s) => isRunning(s.tutorial))

/** 설정 › 안내 › 연습 튜토리얼 해 보기에서 띄우는 연습 고르기 */
export function TutorialPicker({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const completed = useOffice((s) => s.tutorial?.completed ?? NO_COMPLETED)
  const setView = useOffice((s) => s.setView)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  // 예전 첫 실행 안내에서 첫 업무를 실제로 맡겨 봤으면 '업무 맡기기' 연습은 이미 해 본 것으로 표시한다
  const isTaskDoneForReal = isOpen && hasDoneFirstTask()
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
              {o.id !== 'skip' && (completed.includes(o.id) || (o.id === 'task' && isTaskDoneForReal)) && (
                <span className="text-primary flex shrink-0 items-center gap-0.5 text-[11px] font-semibold [&_svg]:size-3.5">
                  <CheckIcon /> {t(completed.includes(o.id) ? 'tutorial.picker.tried' : 'tutorial.picker.triedForReal')}
                </span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 위 막대 칩: '연습 중 · AI 사용량 없음' · '연습 n / 전체' */
export function TutorialChip() {
  const tut = useOffice((s) => s.tutorial)
  if (!isRunning(tut)) return null
  const { n, total } = mainProgress(tut.scenario, tut.step)
  return (
    <div className="flex min-w-0 shrink items-center gap-1.5 text-[11px] [-webkit-app-region:no-drag]">
      <span className="bg-status-waiting/20 truncate rounded-full px-2 py-0.5 font-semibold">
        <DuoIcon name="lab" size={12} className="mr-1" />
        {t('tutorial.chip')}
      </span>
      <span className="bg-muted shrink-0 rounded-full px-2 py-0.5 tabular-nums">
        {t('tutorial.guide.label')} {n} / {total}
      </span>
    </div>
  )
}

/** 진행 중: 누를 곳을 밝게 비추고 옆에 안내 상자 (폰·대상 없는 단계는 화면 아래). 사용자가 연 화면을 엔진에 알린다 */
export function TutorialGuide() {
  const tut = useOffice((s) => s.tutorial)
  const view = useOffice((s) => s.view)
  const setMeetingPreset = useOffice((s) => s.setMeetingPreset)
  const running = isRunning(tut)
  const step = running ? tut.step : null
  const rect = useTourTarget(running ? targetOf(tut) : null)
  const now = useNow(running && tut.until === 'timer')
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipH, setTipH] = useState(TIP_H_GUESS)
  const [viewSize, setViewSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  // 화면을 열면(또는 그 화면에서 단계가 바뀌면) 알린다 — 엔진이 지금 단계와 맞을 때만 넘긴다
  const tutorialView = TUTORIAL_VIEW[view]
  useEffect(() => {
    if (step && tutorialView) void window.office.tutorialAct({ type: 'view', view: tutorialView })
  }, [step, tutorialView])

  // 단계에 들어올 때 보여 줄 화면: 사무실(P1·팀원 작업) · 단체방(지시 — 문장을 미리 채움 · 결과 보고). 회의 시작 단계는 주제·참석자를 미리 채운다
  const cast = running ? tut.cast : null
  const chatRoom = running ? tut.chatRoom : null
  useEffect(() => {
    if (!step) return
    const s = useOffice.getState()
    if (step === 'p1' || step === 'a5wait') s.setView('map')
    if (step === 'p2' && cast) {
      s.openChatRoom(null)
      s.setChatDraft(t('tutorial.task.p2.message', { lead: s.staff.find((x) => x.id === cast.leadId)?.name ?? '' }))
    }
    if (step === 'p6') s.openChatRoom(chatRoom || null)
    if (step === 'b2' && cast) setMeetingPreset({ topic: t('tutorial.meeting.topic'), participantIds: [cast.leadId, cast.designerId, cast.devId] })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 단계가 바뀔 때만
  }, [step])

  // Esc: 튜토리얼 끝내기 (다른 창 안에서 누른 Esc는 그 창만 닫는다)
  useEffect(() => {
    if (!running) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || document.activeElement?.closest('[role="dialog"]')) return
      void window.office.tutorialAct({ type: 'end' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running])

  useLayoutEffect(() => {
    const el = tipRef.current
    if (!running || !el) return
    const measure = () => {
      setTipH(el.offsetHeight)
      setViewSize({ w: window.innerWidth, h: window.innerHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [running])

  if (!running) return null
  const { n, total } = mainProgress(tut.scenario, tut.step)
  const act = (input: Parameters<typeof window.office.tutorialAct>[0]) => void window.office.tutorialAct(input)
  const left = tut.until === 'timer' && tut.waitMs !== null ? Math.max(0, Math.ceil((tut.waitMs - (now - tut.stepAt)) / 1000)) : null
  // 대상 옆에 둔다. 대상 없는 단계는 화면 아래 가운데, 폰은 언제나 아래 탭 위 (phone: 변형이 자리 변수보다 뒤에 와서 이긴다)
  const tip = rect ? placeTip(rect, tipH, viewSize.w, viewSize.h, STEP_SIDES[tut.step]) : null

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="border-primary pointer-events-none fixed z-[84] rounded-lg border-2 transition-all duration-300"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px var(--overlay-bg)' }}
        />
      )}
      <div
        ref={tipRef}
        data-tutorial-guide
        className={cn(
          'bg-background border-primary/40 fixed z-[85] flex flex-col gap-2 overflow-y-auto rounded-xl border p-3 shadow-2xl transition-all duration-300',
          tip ? 'top-(--tip-top) left-(--tip-left) w-(--tip-w)' : 'bottom-4 left-1/2 w-[min(400px,calc(100vw-24px))] -translate-x-1/2',
          'phone:top-auto phone:bottom-20 phone:left-1/2 phone:w-[min(400px,calc(100vw-24px))] phone:-translate-x-1/2',
        )}
        style={tip ? ({ '--tip-top': `${tip.top}px`, '--tip-left': `${tip.left}px`, '--tip-w': `${tip.width}px`, maxHeight: viewSize.h - TIP_MARGIN * 2 } as React.CSSProperties) : undefined}
      >
        <div className="flex items-center text-[11px]">
          <span className="text-primary font-semibold">{t('tutorial.guide.label')}</span>
          <span className="text-muted-foreground ml-auto tabular-nums">
            {n} / {total}
          </span>
        </div>
        {tut.hint && <p className="text-sm">{t(tut.hint)}</p>}
        {tut.note && <p className="text-muted-foreground -mt-1 text-xs">{t(tut.note)}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" className="text-muted-foreground px-2" onClick={() => act({ type: 'end' })}>
            {t('tutorial.common.end')}
          </Button>
          <div className="ml-auto flex gap-1.5">
            {tut.until === 'timer' ? (
              <Button size="sm" variant="outline" onClick={() => act({ type: 'showNow' })}>
                {t('tutorial.common.showNow')}
                {left !== null && <span className="text-muted-foreground tabular-nums">{t('tutorial.guide.wait', { sec: left })}</span>}
              </Button>
            ) : tut.until === 'ack' ? (
              <Button size="sm" onClick={() => act({ type: 'ack' })}>
                {t('tutorial.common.next')}
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
  const isOnboarded = useOffice((s) => s.settings.isOnboarded)
  const isOpen = Boolean(tut?.scenario && tut.step === DONE_STEP)
  // 첫 실행 안내 안의 연습은 안내의 끝 화면(첫 직원 추가)이 대신한다
  if (!tut?.scenario || !isOpen || !isOnboarded) return null
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
          <DialogTitle className="text-xl"><IconText text={t('tutorial.done.title')} size={20} /></DialogTitle>
          <DialogDescription>{t(scenario === 'task' ? 'tutorial.done.task' : 'tutorial.done.meeting')}</DialogDescription>
        </DialogHeader>
        {tut.reward > 0 && <div className="bg-accent mx-auto rounded-full px-3 py-1 text-sm font-semibold tabular-nums"><DuoIcon name="money" size={14} className="mr-1" />{t('tutorial.done.reward', { amount: formatWon(tut.reward) })}</div>}
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
