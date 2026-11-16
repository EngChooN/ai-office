// 화면을 처음 열 때 한 번만 뜨는 짧은 힌트 (handoff onboarding-shorten ②)
// 띄울지는 shared/firstHints.ts 규칙, 본 기록은 앱 설정(seenHints·isHintsOff) — 뜨는 순간 본 것으로 저장하고, 화면에서는 닫을 때까지 둔다
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { hasDoneFirstTask } from '@/lib/firstTaskDone'
import { shouldShowHint, type FirstHintId } from '@shared/firstHints'
import { DONE_STEP } from '@shared/tutorial'
import { t, type TKey } from '@shared/i18n'
import { useTourTarget } from './CoachTour'
import { placeTip, TIP_MARGIN, type TipSide } from './coachTip'
import { IS_REMOTE_SCREEN } from '@/shell'

const HINT_W = 236
const HINT_H_GUESS = 110
// 휴대폰·원격 화면에는 연습이 없어 회의 힌트에서 '? › 회의 열기' 연습 안내를 뺀다
const TEXT: Record<FirstHintId, TKey> = { hire: 'firstHint.hire', board: 'firstHint.board', meeting: IS_REMOTE_SCREEN ? 'firstHint.meeting.remote' : 'firstHint.meeting', chat: 'firstHint.chat', inbox: 'firstHint.inbox' }

/** 이 힌트를 지금 띄워도 되는지 (다른 힌트·연습·둘러보기·첫 실행 안내가 떠 있으면 기다린다) */
function useCanShow(id: FirstHintId, isOn: boolean) {
  return useOffice((s) => {
    if (!isOn) return false
    const tut = s.tutorial
    const isBusy = Boolean(tut?.scenario) || s.isCoachTourOpen || (s.activeHint !== null && s.activeHint !== id)
    const hasPracticedTask = Boolean(tut?.completed.includes('task')) || (tut?.scenario === 'task' && tut.step === DONE_STEP)
    return shouldShowHint(id, { isOnboarded: s.settings.isOnboarded, seenHints: s.settings.seenHints, isHintsOff: s.settings.isHintsOff, hasPracticedTask: hasPracticedTask || hasDoneFirstTask(), isBusy })
  })
}

/**
 * 처음 한 번 힌트. inline이면 그 자리(창 안 칸 아래)에 한 줄 상자로, 아니면 target(data-tour) 옆에 떠 있는 말풍선으로 (폰은 화면 아래 한 줄).
 * isOn: 화면이 정한 추가 조건 (예: 진짜 결재가 왔을 때만)
 */
export function FirstHint({ id, target, sides, inline = false, isOn = true }: { id: FirstHintId; target?: string; sides?: readonly TipSide[]; inline?: boolean; isOn?: boolean }) {
  const canShow = useCanShow(id, isOn)
  const [isShowing, setIsShowing] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // 띄우는 순간 본 것으로 저장한다 (바깥을 누르거나 다른 화면으로 가도 다시 안 뜬다)
  useEffect(() => {
    if (!canShow || isShowing) return
    // 떠 있는 말풍선은 다른 창(업데이트 소식·레벨업 등)이 열려 있으면 기다린다
    if (!inline && document.querySelector('[role="dialog"]')) return
    const s = useOffice.getState()
    s.setActiveHint(id)
    setIsShowing(true)
    void window.office.updateSettings({ seenHints: [...new Set([...s.settings.seenHints, id])] })
  }, [canShow, isShowing, inline, id])

  const close = () => {
    setIsShowing(false)
    if (useOffice.getState().activeHint === id) useOffice.getState().setActiveHint(null)
  }
  // 화면을 떠나면 자리를 비운다
  useEffect(
    () => () => {
      if (useOffice.getState().activeHint === id) useOffice.getState().setActiveHint(null)
    },
    [id],
  )
  // 바깥을 누르면 닫는다 (본 것으로 이미 저장됐다)
  useEffect(() => {
    if (!isShowing) return
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 떠 있는 동안만
  }, [isShowing])

  if (!isShowing) return null
  const turnOff = () => {
    void window.office.updateSettings({ isHintsOff: true })
    close()
  }
  const body = (
    <>
      <span className="text-[11px] opacity-70">{t('firstHint.badge')}</span>
      <p className="text-[13px] leading-snug">{t(TEXT[id])}</p>
      <div className="flex items-center justify-end gap-3 text-xs">
        <button type="button" className="opacity-70 hover:opacity-100" onClick={turnOff}>
          {t('firstHint.allOff')}
        </button>
        <button type="button" className="font-bold" onClick={close}>
          {t('firstHint.ok')}
        </button>
      </div>
    </>
  )
  if (inline)
    return (
      <div ref={boxRef} role="note" data-first-hint={id} className="first-hint bg-foreground text-background flex flex-col gap-1 rounded-xl px-3 py-2.5">
        {body}
      </div>
    )
  return <FloatingHint id={id} target={target} sides={sides} boxRef={boxRef}>{body}</FloatingHint>
}

function FloatingHint({ id, target, sides, boxRef, children }: { id: FirstHintId; target?: string; sides?: readonly TipSide[]; boxRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  const rect = useTourTarget(target ?? null)
  const [boxH, setBoxH] = useState(HINT_H_GUESS)
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      setBoxH(el.offsetHeight)
      setView({ w: window.innerWidth, h: window.innerHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [boxRef])
  // 대상 옆 (못 찾으면 화면 아래 가운데). 폰은 언제나 화면 아래 한 줄 (phone: 변형이 자리 변수보다 뒤에 와서 이긴다)
  const place = rect ? placeTip(rect, boxH, view.w, view.h, sides, HINT_W) : null
  return (
    <div
      ref={boxRef}
      role="note"
      data-first-hint={id}
      className={cn(
        'first-hint bg-foreground text-background fixed z-[80] flex flex-col gap-1 rounded-xl px-3 py-2.5 shadow-xl',
        place ? 'top-(--tip-top) left-(--tip-left) w-(--tip-w)' : 'bottom-4 left-1/2 w-[min(360px,calc(100vw-24px))] -translate-x-1/2',
        'phone:top-auto phone:bottom-20 phone:left-1/2 phone:w-[min(360px,calc(100vw-24px))] phone:-translate-x-1/2',
      )}
      style={place ? ({ '--tip-top': `${place.top}px`, '--tip-left': `${place.left}px`, '--tip-w': `${place.width}px`, maxHeight: view.h - TIP_MARGIN * 2 } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
