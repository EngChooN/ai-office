import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@shared/i18n'

/** 바닥에서 이만큼 안이면 '바닥에 있다'로 본다 */
const NEAR_PX = 80

/**
 * 대화·기록 목록 스크롤: 바닥 근처에서 읽고 있을 때만 새 줄을 따라 내려가고, 위를 읽는 동안엔 그대로 두고 새 줄 수만 센다.
 * 새 줄 신호는 개수가 아니라 마지막 줄 키다 — 목록이 상한(500)에 닿으면 개수가 그대로라서.
 * resetKey가 바뀌면(처음 열기·대상 바꾸기·필터 바꾸기) 바닥으로 간다.
 * ref는 스크롤 상자, contentRef는 그 안의 내용 상자 (늦게 뜬 사진·마크다운으로 키가 늘면 바닥에 다시 붙인다)
 */
export function useStickToBottom<T>(items: readonly T[], keyOf: (item: T) => string, resetKey: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // 스크롤·크기 이벤트 사이에 바로 읽어야 해서 ref로 들고 있는다
  const isNearRef = useRef(true)
  // 부드럽게 내려가는 도중엔 아직 바닥이 아니어도 붙어 있는 것으로 본다
  const isGlidingRef = useRef(false)
  const [isNear, setIsNear] = useState(true)
  const [unread, setUnread] = useState(0)
  const lastKey = items.length ? keyOf(items[items.length - 1]) : ''
  const lastKeyRef = useRef(lastKey)
  lastKeyRef.current = lastKey
  /** 바닥에서 마지막으로 본 줄 */
  const seenKeyRef = useRef(lastKey)

  const markNear = (isNow: boolean) => {
    isNearRef.current = isNow
    setIsNear(isNow)
    if (!isNow) return
    seenKeyRef.current = lastKeyRef.current
    setUnread(0)
  }

  const scrollToBottom = (isSmooth = false) => {
    const el = ref.current
    isGlidingRef.current = isSmooth
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: isSmooth ? 'smooth' : 'auto' })
    markNear(true)
  }

  // 그리기 전에 옮겨야 위에서 바닥으로 튀는 게 안 보인다
  useLayoutEffect(() => {
    scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  useLayoutEffect(() => {
    if (lastKey === seenKeyRef.current) return
    if (isNearRef.current) return scrollToBottom()
    // 본 줄이 상한에 밀려 사라졌으면 남은 줄이 모두 새 줄
    const seenAt = items.findLastIndex((item) => keyOf(item) === seenKeyRef.current)
    setUnread(items.length - 1 - seenAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey])

  // 내용·상자 크기가 바뀌면 (사진이 뜨거나 창 폭이 바뀌면) 붙어 있을 때만 바닥으로 다시 맞춘다
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (isNearRef.current && !isGlidingRef.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [resetKey])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const isNow = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_PX
    if (isGlidingRef.current) {
      if (!isNow) return
      isGlidingRef.current = false
    }
    if (isNow !== isNearRef.current || (isNow && seenKeyRef.current !== lastKeyRef.current)) markNear(isNow)
  }

  return { ref, contentRef, onScroll, isNear, unread, scrollToBottom }
}

/** 바닥에서 떨어져 있을 때 목록 우하단에 뜨는 '맨 아래로' 버튼 (위를 읽는 동안 온 새 줄 수 배지) — 부모는 relative여야 한다 */
export function JumpToBottom({ isNear, unread, onClick }: { isNear: boolean; unread: number; onClick: () => void }) {
  if (isNear) return null
  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick} title={t('common.toBottom')} aria-label={t('common.toBottom')} className="absolute right-4 bottom-3 z-10 rounded-full border shadow-md">
      <ArrowDownIcon />
      {unread > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] leading-4 font-semibold tabular-nums">{t('common.newMessages', { count: unread > 99 ? '99+' : unread })}</span>}
    </Button>
  )
}
