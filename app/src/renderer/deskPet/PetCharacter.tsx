import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type PointerEvent } from 'react'
import { useOffice } from '@/store'
import { cn } from '@/lib/utils'
import { EMPTY_SECRETARY } from '@shared/types'
import { BUBBLE_MAX, canPetMove, isDragMove, mergeAct, nextIdleDelay, petApprovals, petLayout, petMotionVars, pickBubble, pickIdleAct, type PetAct, type PetAlign, type PetBubble } from '@shared/deskPet'
import { t, trOr } from '@shared/i18n'
import { PetSprite, type PetPose } from './PetSprite'
import { PetBadge, type PetBadgeKind } from './PetBadge'

// 캐릭터 창: 캐릭터 그림(PetSprite) + 머리 위 도트 말풍선(PetBadge) + 글자 말풍선 하나. 누르면 펼침 창, 끌면 옮기기 (이동 거리로 구분 — shared/deskPet.ts isDragMove)
// 투명한 곳은 클릭이 뒤 창으로 지나가고, 캐릭터·말풍선 위에서만 마우스를 받는다 (setInteractive)
// 움직임(숨쉬기·가끔 동작·결재 알림)은 button 안쪽 그림 래퍼에만 준다 — 클릭 영역·말풍선·결재 배지는 제자리 (usePetMotion)

/** 말풍선을 보여 주는 시간 (대답 중은 끝날 때까지) */
const BUBBLE_MS = 5000

const pet = () => window.officePet!

export function PetCharacter() {
  const staff = useOffice((s) => s.staff)
  const secretary = useOffice((s) => s.secretary ?? EMPTY_SECRETARY)
  const approvals = useMemo(() => petApprovals(staff), [staff])
  const workingCount = staff.filter((s) => s.kind === 'hired' && s.status === 'working').length
  const isLoaded = useOffice((s) => s.isLoaded)

  // 방금 끝난 비서 답 — 대답 중이 끝나면 마지막 비서 말을 5초
  const [reply, setReply] = useState<{ text: string; isError: boolean } | null>(null)
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !secretary.isBusy) {
      const last = [...secretary.messages].reverse().find((m) => m.role === 'secretary')
      if (last) setReply({ text: last.text, isError: Boolean(last.isError) })
    }
    wasBusy.current = secretary.isBusy
  }, [secretary.isBusy, secretary.messages])

  const drag = useDragOrClick()
  const motion = usePetMotion(drag.isDragging)
  // 새 결재: 들어온 순간 폴짝 두 번(결재 알림), 말풍선 차례가 오면 5초 보여 준다 (대답 중이면 끝난 뒤 한 번)
  const [newApproval, setNewApproval] = useState<{ count: number; title: string } | null>(null)
  const seenIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!isLoaded) return
    const ids = new Set(approvals.map((a) => a.id))
    // 처음 받은 스냅샷(앱 재시작·캐릭터 켜기)에 이미 대기 중인 결재가 있으면 그 제목도 한 번 보여 준다 (튀어 오르기는 새로 온 결재만)
    const isFirst = !seenIds.current
    const fresh = isFirst ? approvals : approvals.filter((a) => !seenIds.current!.has(a.id))
    seenIds.current = ids
    if (!approvals.length) return setNewApproval(null)
    if (!fresh.length) return
    setNewApproval({ count: approvals.length, title: `${approvals[0].staffName} · ${trOr(approvals[0].summaryI18n, approvals[0].summary)}` })
    if (!isFirst) motion.play('alert')
  }, [approvals, isLoaded, motion.play])

  // 직원 업무: 일하는 인원이 바뀌면 5초
  const [isWorkShown, setWorkShown] = useState(false)
  useEffect(() => {
    setWorkShown(workingCount > 0)
  }, [workingCount])

  const bubble = pickBubble({ isBusy: secretary.isBusy, reply, newApproval, workingCount, isWorkShown })
  // 보여 준 말풍선은 5초 뒤 접는다 (대답 중은 끝날 때까지). 내용이 바뀌면 5초를 새로 센다
  const kind = bubble?.kind
  const bubbleKey = bubble ? `${bubble.kind}:${bubbleText(bubble)}` : ''
  useEffect(() => {
    if (!kind || kind === 'thinking') return
    const timer = setTimeout(() => {
      if (kind === 'reply') setReply(null)
      else if (kind === 'approval') setNewApproval(null)
      else setWorkShown(false)
    }, BUBBLE_MS)
    return () => clearTimeout(timer)
  }, [kind, bubbleKey])

  const isBlinking = useBlink(motion.isMoving, motion.isActing)
  const pose: PetPose = secretary.isBusy ? 'thinking' : approvals.length ? 'approval' : workingCount ? 'working' : 'idle'
  // 크기는 설정값으로 바로 바뀐다 (창 크기는 main이 같은 스냅샷으로 맞춘다). 캐릭터는 가까운 화면 가장자리 쪽에 선다
  const size = useOffice((s) => s.settings.deskPetSize)
  const layout = petLayout(size)
  const align = useAlign()
  const px = (n: number) => Math.round(n * layout.scale)
  // 생각 중은 글자 말풍선 대신 머리 위 도트 '…'. 결재 대기 '!'는 글자 말풍선(답·새 결재 제목·업무)이 떠 있는 동안 접어 둔다 — 머리 위에 두 개가 겹쳐 쌓이지 않게
  // 생각 중이 결재보다 먼저 — 방금 말을 건 비서가 듣고 있다는 걸 보여 준다 (캐릭터 자세 pose와 같은 순서)
  const isTextBubble = bubble !== null && bubble.kind !== 'thinking'
  const badge: PetBadgeKind | null = secretary.isBusy ? 'thinking' : approvals.length && !isTextBubble ? 'approval' : null

  return (
    <div className={cn('flex h-screen w-screen flex-col justify-end overflow-hidden pb-1 select-none', align === 'left' ? 'items-start' : 'items-end')} style={{ paddingInline: layout.pad }}>
      <Bubble bubble={isTextBubble ? bubble : null} maxWidth={Math.min(BUBBLE_MAX, layout.window.width - layout.pad * 2)} />
      <button
        type="button"
        aria-label={t('deskPet.character')}
        title={t('deskPet.character')}
        className="relative mt-3 cursor-grab touch-none rounded-lg outline-none active:cursor-grabbing"
        onMouseEnter={() => pet().setInteractive(true)}
        onMouseLeave={() => !drag.isDown() && pet().setInteractive(false)}
        {...drag.handlers}
      >
        <span
          className="pet-motion pointer-events-none"
          data-act={motion.act ?? undefined}
          data-held={motion.isMoving ? undefined : ''}
          style={{ '--pet-scale': layout.scale, ...petMotionVars() } as React.CSSProperties}
          onAnimationEnd={motion.onAnimationEnd}
        >
          <PetSprite isBlinking={isBlinking} layout={layout} />
        </span>
        {badge && <PetBadge kind={badge} layout={layout} label={badge === 'thinking' ? t('deskPet.thinking') : t('deskPet.badge', { n: approvals.length })} />}
        {pose === 'working' && <span className="bg-primary absolute bottom-[12%] animate-pulse rounded-full motion-reduce:animate-none" style={{ left: -px(12), width: px(8), height: px(8) }} aria-hidden />}
      </button>
      {/* 상태 변화는 화면 읽기 프로그램에 알린다 (색·모양만으로 구별하지 않게) */}
      <span className="sr-only" aria-live="polite">
        {bubble ? bubbleText(bubble) : ''}
      </span>
    </div>
  )
}

function bubbleText(b: NonNullable<PetBubble>) {
  switch (b.kind) {
    case 'thinking':
      return t('deskPet.thinking')
    case 'reply':
      return b.text
    case 'approval':
      return t('deskPet.approvalBubble', { n: b.count, title: b.title })
    case 'working':
      return t('deskPet.working', { n: b.count })
  }
}

/** 캐릭터가 창의 어느 쪽에 서는지 (main이 옮길 때마다 알려 준다) */
function useAlign() {
  const [align, setAlign] = useState<PetAlign>('right')
  useEffect(() => pet().onAlign(setAlign), [])
  return align
}

function Bubble({ bubble, maxWidth }: { bubble: PetBubble; maxWidth: number }) {
  if (!bubble) return null
  return (
    <button
      type="button"
      aria-hidden
      tabIndex={-1}
      onMouseEnter={() => pet().setInteractive(true)}
      onMouseLeave={() => pet().setInteractive(false)}
      onClick={() => pet().togglePanel()}
      className={cn(
        'bg-card text-card-foreground rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug shadow-md',
        bubble.kind === 'reply' && bubble.isError && 'border-destructive text-destructive',
      )}
      style={{ maxWidth }}
    >
      <span className="line-clamp-2 break-words">{bubbleText(bubble)}</span>
    </button>
  )
}

/** 4~7초마다 120ms 눈 깜빡임. 다른 움직임과 같이 멈춘다 — 움직임 줄이기·창이 안 보임·끄는 중이면 타이머를 걸지 않고 눈을 뜬 채로 둔다 (usePetMotion isMoving).
 * 다른 동작 중이면 다음 차례로 미룬다 */
function useBlink(isMoving: boolean, isActing: boolean) {
  const [isBlinking, setBlinking] = useState(false)
  const acting = useRef(isActing)
  acting.current = isActing
  useEffect(() => {
    if (!isMoving) return
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      timer = setTimeout(
        () => {
          if (acting.current) return next()
          setBlinking(true)
          timer = setTimeout(() => {
            setBlinking(false)
            next()
          }, 120)
        },
        4000 + Math.random() * 3000,
      )
    }
    next()
    return () => {
      clearTimeout(timer)
      setBlinking(false)
    }
  }, [isMoving])
  return isBlinking
}

/** 누른 채 기준 거리 넘게 움직이면 끌기(창 옮기기), 아니면 클릭(펼침 창 열고 닫기) */
function useDragOrClick() {
  const start = useRef<{ x: number; y: number; isDrag: boolean } | null>(null)
  // 끄는 동안 움직임을 멈추려고 화면에도 알린다 (start는 매 움직임마다 읽는 ref)
  const [isDragging, setDragging] = useState(false)
  const end = (e: PointerEvent<HTMLElement>, isCancel: boolean) => {
    const s = start.current
    start.current = null
    if (!s) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
    if (s.isDrag) pet().dragEnd()
    else if (!isCancel) pet().togglePanel()
  }
  return {
    isDown: () => start.current !== null,
    isDragging,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.screenX, y: e.screenY, isDrag: false }
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const s = start.current
        if (!s) return
        const dx = e.screenX - s.x
        const dy = e.screenY - s.y
        if (!s.isDrag && !isDragMove(dx, dy)) return
        if (!s.isDrag) {
          s.isDrag = true
          setDragging(true)
          pet().dragStart()
        }
        pet().dragMove(dx, dy)
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, false),
      onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true),
      // 키보드(Enter·Space)로 누르면 클릭과 같다 — 포인터 클릭은 위에서 처리하므로 detail 0(키보드)만
      onClick: (e: React.MouseEvent) => {
        if (e.detail === 0) pet().togglePanel()
      },
    },
  }
}

/** 캐릭터 움직임: 숨쉬기는 CSS가 되풀이하고, 가끔 동작은 15~30초마다 무작위로, 결재 알림은 play('alert')로.
 * 움직임 줄이기·창이 안 보임·끄는 중이면 모두 멈추고 무작위 타이머도 걸지 않는다 (shared/deskPet.ts canPetMove) */
function usePetMotion(isDragging: boolean) {
  const isReduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const isHidden = usePageHidden()
  const isMoving = canPetMove({ isReduced, isHidden, isDragging })
  const [act, setAct] = useState<PetAct | null>(null)
  const moving = useRef(isMoving)
  moving.current = isMoving

  const play = useCallback((next: PetAct) => {
    if (moving.current) setAct((cur) => mergeAct(cur, next))
  }, [])
  // 멈추면 하던 동작도 거둔다 (다시 움직일 때 반쯤 하던 동작이 이어지지 않게)
  useEffect(() => {
    if (!isMoving) setAct(null)
  }, [isMoving])
  // 가끔 동작: 움직일 수 있을 때만 타이머를 건다 (창이 안 보이면 타이머가 없다)
  useEffect(() => {
    if (!isMoving) return
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      timer = setTimeout(() => {
        play(pickIdleAct(Math.random()))
        next()
      }, nextIdleDelay(Math.random()))
    }
    next()
    return () => clearTimeout(timer)
  }, [isMoving, play])

  // 동작 하나가 끝나면 숨쉬기로 돌아간다 (안쪽 그림에서 올라온 이벤트는 거른다)
  const onAnimationEnd = (e: AnimationEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) setAct(null)
  }
  return { act, isActing: act !== null, isMoving, play, onAnimationEnd }
}

/** 창이 안 보이는지 (화면 잠금·가려짐 등 — 캐릭터를 끄면 창 자체가 없어진다) */
function usePageHidden() {
  const [isHidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return isHidden
}

function useMediaQuery(query: string) {
  const [isOn, setOn] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setOn(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return isOn
}
