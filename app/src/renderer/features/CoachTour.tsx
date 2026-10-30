import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOffice, useWorkMode, type View } from '@/store'
import { MOD_KEY, osText } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { navTourTarget } from './nav'
import { t } from '@shared/i18n'
import type { TKey } from '@shared/i18n'

type Chapter = 'office' | 'work' | 'review' | 'company'

interface TourStep {
  target: string
  icon: string
  /** 제목·설명 번역 키 (렌더할 때 t()로 읽는다) */
  title: TKey
  body: TKey
  /** 이 단계를 보여 주기 전에 열어 둘 화면 */
  view?: View
  /** 묶이는 장 (사무실 / 일 시키기 / 결재·결과 / 회사 운영) */
  chapter: Chapter
}

const CHAPTERS: { id: Chapter; label: TKey }[] = [
  { id: 'office', label: 'coachTour.chapter.office' },
  { id: 'work', label: 'coachTour.chapter.work' },
  { id: 'review', label: 'coachTour.chapter.review' },
  { id: 'company', label: 'coachTour.chapter.company' },
]

// 묶음 안 화면은 그 화면을 열어 위쪽 탭을 가리킨다 (navTourTarget: 탭이 없으면 사이드바 묶음으로)
const STEPS: TourStep[] = [
  { chapter: 'office', target: 'nav-map', view: 'map', icon: '🏢', title: 'coachTour.map.title', body: 'coachTour.map.body' },
  { chapter: 'office', target: 'hud', view: 'map', icon: '📈', title: 'coachTour.hud.title', body: 'coachTour.hud.body' },
  { chapter: 'office', target: 'hire', icon: '🧑‍💼', title: 'coachTour.hire.title', body: 'coachTour.hire.body' },
  { chapter: 'office', target: navTourTarget('dashboard'), view: 'dashboard', icon: '🗂️', title: 'coachTour.dashboard.title', body: 'coachTour.dashboard.body' },
  { chapter: 'office', target: navTourTarget('org'), view: 'org', icon: '🧭', title: 'coachTour.org.title', body: 'coachTour.org.body' },
  { chapter: 'work', target: navTourTarget('board'), view: 'board', icon: '📋', title: 'coachTour.board.title', body: 'coachTour.board.body' },
  { chapter: 'work', target: navTourTarget('chat'), view: 'chat', icon: '💬', title: 'coachTour.chat.title', body: 'coachTour.chat.body' },
  { chapter: 'work', target: navTourTarget('meeting'), view: 'meeting', icon: '🗣️', title: 'coachTour.meeting.title', body: 'coachTour.meeting.body' },
  { chapter: 'work', target: navTourTarget('manuals'), view: 'manuals', icon: '📘', title: 'coachTour.manuals.title', body: 'coachTour.manuals.body' },
  { chapter: 'work', target: navTourTarget('schedule'), view: 'schedule', icon: '⏰', title: 'coachTour.schedule.title', body: 'coachTour.schedule.body' },
  { chapter: 'review', target: navTourTarget('inbox'), icon: '✅', title: 'coachTour.inbox.title', body: 'coachTour.inbox.body' },
  { chapter: 'review', target: navTourTarget('report'), view: 'report', icon: '📑', title: 'coachTour.report.title', body: 'coachTour.report.body' },
  { chapter: 'review', target: navTourTarget('payroll'), view: 'payroll', icon: '💳', title: 'coachTour.payroll.title', body: 'coachTour.payroll.body' },
  { chapter: 'company', target: navTourTarget('shop'), icon: '🛍️', title: 'coachTour.shop.title', body: 'coachTour.shop.body' },
  { chapter: 'company', target: navTourTarget('settings'), view: 'settings', icon: '⚙️', title: 'coachTour.settings.title', body: 'coachTour.settings.body' },
  { chapter: 'company', target: navTourTarget('updates'), view: 'updates', icon: '📣', title: 'coachTour.updates.title', body: 'coachTour.updates.body' },
  { chapter: 'company', target: 'hire', icon: '🚀', title: 'coachTour.firstHire.title', body: 'coachTour.firstHire.body' },
]
/** 업무 모드에서 숨긴 화면을 설명하는 단계 */
const GAME_TARGETS = new Set(['nav-map', 'hud', 'nav-shop'])
const PAD = 6
const TIP_W = 340
const TIP_GAP = 14

/** 'a|b'처럼 이은 후보 중 화면에 있는 첫 data-tour 대상 */
function findTourTarget(target: string): Element | null {
  for (const one of target.split('|')) {
    const el = document.querySelector(`[data-tour="${one}"]`)
    if (el) return el
  }
  return null
}

/** data-tour 대상의 화면 위치를 따라간다 (화면 전환·창 크기 변경) — 튜토리얼 안내 줄도 같이 쓴다. 대상이 없으면 null(설명 상자만 가운데) */
export function useTourTarget(target: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!target) return setRect(null)
    const update = () => setRect(findTourTarget(target)?.getBoundingClientRect() ?? null)
    update()
    const timer = setInterval(update, 300)
    window.addEventListener('resize', update)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', update)
    }
  }, [target])
  return rect
}

/**
 * 메뉴별 코치마크: 대상만 밝게 비추고 옆에 설명을 띄운다. 17단계를 4개 장으로 묶어 장마다 건너뛸 수 있다.
 * onClose(isFinished) — 끝까지 봤거나 마지막 장을 건너뛰면 true (다음에 시나리오 선택을 띄운다), 그만 보기면 false
 */
export function CoachTour({ isOpen, onClose }: { isOpen: boolean; onClose: (isFinished: boolean) => void }) {
  const setView = useOffice((s) => s.setView)
  const isWorkMode = useWorkMode()
  const steps = useMemo(() => (isWorkMode ? STEPS.filter((s) => !GAME_TARGETS.has(s.target)) : STEPS), [isWorkMode])
  const [index, setIndex] = useState(0)
  const step = steps[Math.min(index, steps.length - 1)]
  const rect = useTourTarget(isOpen ? step.target : null)

  useEffect(() => {
    if (isOpen) setIndex(0)
  }, [isOpen])

  useEffect(() => {
    if (isOpen && step.view) setView(step.view)
  }, [isOpen, step, setView])

  if (!isOpen) return null
  const isLast = index >= steps.length - 1
  const finish = () => {
    onClose(true)
    setView('map')
  }
  const next = () => (isLast ? finish() : setIndex(index + 1))
  // 지금 장의 단계들 (업무 모드에서 빠진 단계는 세지 않는다)
  const chapterNo = CHAPTERS.findIndex((c) => c.id === step.chapter)
  const inChapter = steps.filter((s) => s.chapter === step.chapter)
  const posInChapter = inChapter.indexOf(step)
  const skipChapter = () => {
    const nextIndex = steps.findIndex((s, i) => i > index && s.chapter !== step.chapter)
    if (nextIndex < 0) return finish()
    setIndex(nextIndex)
  }
  const chapters = CHAPTERS.filter((c) => steps.some((s) => s.chapter === c.id))

  // 설명 상자는 대상 오른쪽(공간이 없으면 왼쪽·아래)에 둔다
  const tip = (() => {
    if (!rect) return { left: window.innerWidth / 2 - TIP_W / 2, top: window.innerHeight / 2 - 80 }
    const right = rect.right + TIP_GAP
    if (right + TIP_W < window.innerWidth) return { left: right, top: Math.min(rect.top, window.innerHeight - 260) }
    if (rect.left - TIP_GAP - TIP_W > 0) return { left: rect.left - TIP_GAP - TIP_W, top: Math.min(rect.top, window.innerHeight - 260) }
    return { left: Math.max(12, rect.right - TIP_W), top: rect.bottom + TIP_GAP }
  })()

  return (
    <div className="fixed inset-0 z-[90]">
      {rect ? (
        <div
          className="border-primary pointer-events-none fixed rounded-lg border-2 transition-all duration-300"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px var(--overlay-bg)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-overlay" />
      )}
      <div className="bg-background fixed flex flex-col gap-3 rounded-xl border p-4 shadow-2xl transition-all duration-300" style={{ ...tip, width: TIP_W }}>
        {/* 장 표시: 지난 장·지금 장·남은 장을 막대로 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1">
            {chapters.map((c) => {
              const no = CHAPTERS.indexOf(c)
              return <span key={c.id} title={t(c.label)} className={cn('h-1 flex-1 rounded-full', no < chapterNo ? 'bg-primary/50' : no === chapterNo ? 'bg-primary' : 'bg-muted')} />
            })}
          </div>
          <div className="text-muted-foreground flex text-[11px]">
            <span className="font-semibold">{t('coachTour.chapterOf', { n: chapters.indexOf(CHAPTERS[chapterNo]) + 1, name: t(CHAPTERS[chapterNo].label) })}</span>
            <span className="ml-auto tabular-nums">
              {posInChapter + 1} / {inChapter.length}
            </span>
          </div>
        </div>
        <div className="font-semibold">
          {step.icon} {t(step.title)}
        </div>
        <p className="text-muted-foreground text-sm">{t(step.body, { modKey: MOD_KEY, trayPlace: osText(t('coachTour.trayPlace.mac'), t('coachTour.trayPlace.win')) })}</p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="px-2" onClick={() => onClose(false)}>
            {t('coachTour.stop')}
          </Button>
          <Button size="sm" variant="ghost" className="px-2" onClick={skipChapter}>
            {t('coachTour.skipChapter')}
          </Button>
          <div className="ml-auto flex gap-1.5">
            {index > 0 && (
              <Button size="sm" variant="outline" onClick={() => setIndex(index - 1)}>
                {t('coachTour.prev')}
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? t('coachTour.finish') : t('coachTour.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
