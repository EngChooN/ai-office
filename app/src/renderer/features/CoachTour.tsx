import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOffice, useWorkMode, type View } from '@/store'
import { MOD_KEY, osText } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { menuTitle, navTourTarget } from './nav'
import { IS_MOBILE_SHELL } from '@/shell'
import { isVisibleBox, placeTip, TIP_MARGIN } from './coachTip'
import { t } from '@shared/i18n'
import type { TKey } from '@shared/i18n'

type Chapter = 'office' | 'work' | 'review' | 'company'

interface TourStep {
  /** 가리킬 data-tour (빈 값이면 설명 상자만 가운데) */
  target: string
  icon: string
  /** 메뉴 화면을 설명하는 단계: 제목은 실제 메뉴 이름(묶음 › 탭) */
  menu?: View
  /** 메뉴가 아닌 단계의 제목 번역 키 (렌더할 때 t()로 읽는다) */
  title?: TKey
  body: TKey
  /** 이 단계를 보여 주기 전에 열어 둘 화면 */
  view?: View
  /** 묶이는 장 (사무실 / 일 시키기 / 결재·결과 / 회사 운영) */
  chapter: Chapter
  /** 앱 창 밖(바탕화면)을 설명하는 단계 — 휴대폰 앱에서는 뺀다 */
  isDesktopOnly?: boolean
  /** 마지막 단계에 '직원 고용하기' 버튼을 붙인다 */
  hasHireButton?: boolean
}

const CHAPTERS: { id: Chapter; label: TKey }[] = [
  { id: 'office', label: 'coachTour.chapter.office' },
  { id: 'work', label: 'coachTour.chapter.work' },
  { id: 'review', label: 'coachTour.chapter.review' },
  { id: 'company', label: 'coachTour.chapter.company' },
]

/** 메뉴 화면 단계: 그 화면을 열어 위쪽 탭을 가리킨다 (navTourTarget: 탭이 없으면 사이드바 묶음으로). isOpening=false면 화면은 그대로 두고 메뉴만 가리킨다 */
const menuStep = (chapter: Chapter, menu: View, icon: string, body: TKey, isOpening = true): TourStep => ({
  chapter,
  menu,
  target: navTourTarget(menu),
  view: isOpening ? menu : undefined,
  icon,
  body,
})

/** 처음 보는 핵심 5단계: 사무실 → 고용 → 지시 → 결재 → 첫 고용. 나머지는 마지막에 '더 보기'를 눌렀을 때만 */
const CORE_STEPS: TourStep[] = [
  menuStep('office', 'map', '🏢', 'coachTour.map.body'),
  { chapter: 'office', target: 'hire', icon: '🧑‍💼', title: 'coachTour.hire.title', body: 'coachTour.hire.body' },
  menuStep('work', 'chat', '💬', 'coachTour.chat.body'),
  menuStep('review', 'inbox', '✅', 'coachTour.inbox.body', false),
]
const LAST_STEP: TourStep = { chapter: 'company', target: 'hire', icon: '🚀', title: 'coachTour.firstHire.title', body: 'coachTour.firstHire.body', hasHireButton: true }
/** '더 보기': 핵심 단계 뒤, 마지막 단계 앞에 이어진다 (장 순서대로) */
const MORE_STEPS: TourStep[] = [
  { chapter: 'office', target: 'hud', view: 'map', icon: '📈', title: 'coachTour.hud.title', body: 'coachTour.hud.body' },
  menuStep('office', 'secretary', '✨', 'coachTour.secretary.body'),
  { chapter: 'office', target: '', icon: '🧑‍💻', title: 'coachTour.deskPet.title', body: 'coachTour.deskPet.body', isDesktopOnly: true },
  menuStep('office', 'dashboard', '🗂️', 'coachTour.dashboard.body'),
  menuStep('office', 'org', '🧭', 'coachTour.org.body'),
  menuStep('work', 'board', '📋', 'coachTour.board.body'),
  menuStep('work', 'meeting', '🗣️', 'coachTour.meeting.body'),
  menuStep('work', 'manuals', '📘', 'coachTour.manuals.body'),
  menuStep('work', 'schedule', '⏰', 'coachTour.schedule.body'),
  menuStep('review', 'report', '📑', 'coachTour.report.body'),
  menuStep('review', 'payroll', '💳', 'coachTour.payroll.body'),
  menuStep('company', 'shop', '🛍️', 'coachTour.shop.body', false),
  menuStep('company', 'settings', '⚙️', 'coachTour.settings.body'),
  menuStep('company', 'updates', '📣', 'coachTour.updates.body'),
]
/** 업무 모드에서 숨긴 화면을 설명하는 단계 */
const GAME_TARGETS = new Set(['nav-map', 'hud', 'nav-shop'])

/** 보여 줄 단계: 핵심(또는 '더 보기'면 핵심+나머지를 장 순서대로) → 마지막 단계. 업무 모드·휴대폰에서 못 쓰는 단계는 뺀다 */
function tourSteps(isMore: boolean, isWorkMode: boolean): TourStep[] {
  const chapterOrder = (s: TourStep) => CHAPTERS.findIndex((c) => c.id === s.chapter)
  const body = isMore ? [...CORE_STEPS, ...MORE_STEPS].sort((a, b) => chapterOrder(a) - chapterOrder(b)) : CORE_STEPS
  return [...body, LAST_STEP].filter((s) => !(isWorkMode && GAME_TARGETS.has(s.target)) && !(IS_MOBILE_SHELL && s.isDesktopOnly))
}
const PAD = 6
/** 높이를 재기 전 첫 자리 계산에 쓰는 설명 상자 높이 */
const TIP_H_GUESS = 220

/** 'a|b'처럼 이은 후보 중 화면에 보이는 첫 data-tour 대상 (가로 폰에서 숨은 PC 상단 바 같은 크기 0 요소는 건너뛴다) */
function findTourTarget(target: string): Element | null {
  for (const one of target.split('|')) {
    for (const el of document.querySelectorAll(`[data-tour="${one}"]`)) {
      if (isVisibleBox(el.getBoundingClientRect())) return el
    }
  }
  return null
}

/** data-tour 대상의 화면 위치를 따라간다 (화면 전환·창 크기 변경) — 튜토리얼 안내 줄도 같이 쓴다. 대상이 없으면 null(설명 상자만 가운데) */
export function useTourTarget(target: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!target) return setRect(null)
    // 자리가 그대로면 상태를 바꾸지 않는다 (300ms마다 설명 상자를 통째로 다시 그리지 않게)
    const update = () => {
      const next = findTourTarget(target)?.getBoundingClientRect() ?? null
      setRect((prev) => (prev && next && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next))
    }
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
 * 메뉴별 코치마크: 대상만 밝게 비추고 옆에 설명을 띄운다. 메뉴·비서·바탕화면 비서를 4개 장으로 묶어 장마다 건너뛸 수 있다.
 * onClose(isFinished) — 끝까지 봤거나 마지막 장을 건너뛰면 true (다음에 시나리오 선택을 띄운다), 그만 보기면 false
 */
export function CoachTour({ isOpen, onClose }: { isOpen: boolean; onClose: (isFinished: boolean) => void }) {
  const setView = useOffice((s) => s.setView)
  const isWorkMode = useWorkMode()
  const setHireOpen = useOffice((s) => s.setHireOpen)
  // '더 보기'를 누르면 핵심 단계 사이에 나머지를 끼워 장 순서대로 다시 늘어놓는다
  const [isMore, setIsMore] = useState(false)
  const steps = useMemo(() => tourSteps(isMore, isWorkMode), [isWorkMode, isMore])
  const [index, setIndex] = useState(0)
  const step = steps[Math.min(index, steps.length - 1)]
  const rect = useTourTarget(isOpen ? step.target : null)
  // 설명 상자 실제 높이 (글이 길거나 폭이 좁으면 커진다) — 화면 밖으로 나가지 않게 자리를 잡을 때 쓴다
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipH, setTipH] = useState(TIP_H_GUESS)
  const [view, setViewSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => {
    if (!isOpen) return
    setIndex(0)
    setIsMore(false)
  }, [isOpen])

  useLayoutEffect(() => {
    const el = tipRef.current
    if (!isOpen || !el) return
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
  }, [isOpen])

  // Esc: 그만 보기 (화면 전체를 덮으므로 키보드로도 빠져나갈 수 있게)
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      // 둘러보기 위에 뜬 다른 창(⌘K 비서 빠른 창 등)의 Esc는 그 창만 닫는다
      const isInOtherDialog = document.activeElement?.closest('[role="dialog"]:not([data-coach-tour])')
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || isInOtherDialog) return
      e.preventDefault()
      stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && step.view) setView(step.view)
  }, [isOpen, step, setView])

  // 그만 보기: 다시 보는 곳을 알려 준다
  function stop() {
    onClose(false)
    showToast(t('guideHint.replayToast'))
  }

  if (!isOpen) return null
  const isLast = index >= steps.length - 1
  const finish = () => {
    onClose(true)
    setView('map')
  }
  const next = () => (isLast ? finish() : setIndex(index + 1))
  // 마지막 단계에서 '더 보기': 나머지를 끼워 넣고, 핵심 단계 다음(처음 보는 단계)부터 이어 본다
  const showMore = () => {
    const seen = new Set(steps)
    setIsMore(true)
    setIndex(Math.max(0, tourSteps(true, isWorkMode).findIndex((s) => !seen.has(s))))
  }
  // 고용 창으로 바로: 연습 고르기는 띄우지 않는다 (설정 › 안내에서 언제든 할 수 있다)
  const hire = () => {
    onClose(false)
    setView('map')
    setHireOpen(true)
  }
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

  // 설명 상자는 대상 오른쪽(공간이 없으면 왼쪽·아래·위)에 두고, 언제나 화면 안에 들어오게 한다 (폰은 아래 탭 위로)
  const tip = placeTip(rect, tipH, view.w, view.h)

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
      <div
        ref={tipRef}
        data-coach-tour
        role="dialog"
        aria-modal
        className="bg-background fixed flex flex-col gap-3 overflow-y-auto rounded-xl border p-4 shadow-2xl transition-all duration-300"
        style={{ ...tip, maxHeight: view.h - TIP_MARGIN * 2 }}
      >
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
          {step.icon} {step.menu ? menuTitle(step.menu) : step.title && t(step.title)}
        </div>
        <p className="text-muted-foreground text-sm">{t(step.body, { modKey: MOD_KEY, trayPlace: osText(t('coachTour.trayPlace.mac'), t('coachTour.trayPlace.win')) })}</p>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" className="px-2" onClick={stop}>
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
            {isLast && !isMore && (
              <Button size="sm" variant="outline" onClick={showMore}>
                {t('coachTour.more')}
              </Button>
            )}
            {step.hasHireButton && (
              <Button size="sm" onClick={hire}>
                {t('coachTour.hireStaff')}
              </Button>
            )}
            <Button size="sm" variant={step.hasHireButton ? 'outline' : 'default'} onClick={next}>
              {isLast ? t('coachTour.finish') : t('coachTour.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
