import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useOffice } from '@/store'
import { cn } from '@/lib/utils'
import { isReducedMotion } from '@/lib/reducedMotion'
import { EMPTY_SECRETARY } from '@shared/types'
import { isDragMove, petApprovals, pickBubble, type PetBubble } from '@shared/deskPet'
import { t, trOr } from '@shared/i18n'
import { PetSprite, type PetPose } from './PetSprite'

// 캐릭터 창: 도트 캐릭터 + 결재 배지 + 말풍선 하나. 누르면 펼침 창, 끌면 옮기기 (이동 거리로 구분 — shared/deskPet.ts isDragMove)
// 투명한 곳은 클릭이 뒤 창으로 지나가고, 캐릭터·말풍선 위에서만 마우스를 받는다 (setInteractive)

const PET_PX = 72
/** 말풍선을 보여 주는 시간 (대답 중은 끝날 때까지) */
const BUBBLE_MS = 5000
const BUMP_MS = 240

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

  // 새 결재: 들어온 순간 한 번 튀어 오르고, 말풍선 차례가 오면 5초 보여 준다 (대답 중이면 끝난 뒤 한 번)
  const [newApproval, setNewApproval] = useState<{ count: number; title: string } | null>(null)
  const [isBump, setBump] = useState(false)
  const seenIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!isLoaded) return
    const ids = new Set(approvals.map((a) => a.id))
    const fresh = seenIds.current ? approvals.filter((a) => !seenIds.current!.has(a.id)) : []
    seenIds.current = ids
    if (!approvals.length) return setNewApproval(null)
    if (!fresh.length) return
    setNewApproval({ count: approvals.length, title: `${approvals[0].staffName} · ${trOr(approvals[0].summaryI18n, approvals[0].summary)}` })
    if (isReducedMotion()) return
    setBump(true)
    const timer = setTimeout(() => setBump(false), BUMP_MS)
    return () => clearTimeout(timer)
  }, [approvals, isLoaded])

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

  const isBlinking = useBlink()
  const drag = useDragOrClick()
  const pose: PetPose = secretary.isBusy ? 'thinking' : approvals.length ? 'approval' : workingCount ? 'working' : 'idle'

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-end overflow-hidden pb-1 select-none">
      <Bubble bubble={bubble} />
      <button
        type="button"
        aria-label={t('deskPet.character')}
        title={t('deskPet.character')}
        className={cn('relative mt-1 cursor-grab touch-none rounded-lg outline-none active:cursor-grabbing', isBump && '-translate-y-0.5', 'transition-transform duration-[120ms]')}
        onMouseEnter={() => pet().setInteractive(true)}
        onMouseLeave={() => !drag.isDown() && pet().setInteractive(false)}
        {...drag.handlers}
      >
        <PetSprite size={PET_PX} pose={pose} isBlinking={isBlinking} />
        {approvals.length > 0 && (
          <span className="bg-destructive absolute -top-1 -right-1 flex size-[18px] items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-white" aria-label={t('deskPet.badge', { n: approvals.length })}>
            !
          </span>
        )}
        {pose === 'working' && <span className="bg-primary absolute bottom-1 -left-1 size-2 animate-pulse rounded-full motion-reduce:animate-none" aria-hidden />}
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

function Bubble({ bubble }: { bubble: PetBubble }) {
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
        'bg-card text-card-foreground max-w-[240px] rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug shadow-md',
        bubble.kind === 'reply' && bubble.isError && 'border-destructive text-destructive',
      )}
    >
      <span className="line-clamp-2 break-words">{bubbleText(bubble)}</span>
    </button>
  )
}

/** 4~7초마다 120ms 눈 깜빡임 (움직임 줄이기면 깜빡이지 않는다) */
function useBlink() {
  const [isBlinking, setBlinking] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      timer = setTimeout(
        () => {
          if (isReducedMotion()) return next()
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
    return () => clearTimeout(timer)
  }, [])
  return isBlinking
}

/** 누른 채 기준 거리 넘게 움직이면 끌기(창 옮기기), 아니면 클릭(펼침 창 열고 닫기) */
function useDragOrClick() {
  const start = useRef<{ x: number; y: number; isDrag: boolean } | null>(null)
  const end = (e: PointerEvent<HTMLElement>, isCancel: boolean) => {
    const s = start.current
    start.current = null
    if (!s) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (s.isDrag) pet().dragEnd()
    else if (!isCancel) pet().togglePanel()
  }
  return {
    isDown: () => start.current !== null,
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
