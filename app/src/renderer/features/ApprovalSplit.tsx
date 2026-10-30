import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { t } from '@shared/i18n'

/** 결재·질문 칸 높이 (px) — null이면 내용만큼, 최대 패널의 절반 */
const APPROVAL_HEIGHT_KEY = 'office:approvalHeight'
const MIN_HEIGHT = 72
/** 탭 내용(data-split-rest)의 스크롤 칸이 최소한 이만큼은 남도록 (px) — 업무 기록 칸처럼 값을 적어 둔 탭은 그 값 */
const REST_RESERVE = 64
const KEY_STEP = 24

// 이 기기에서만 기억한다 (못 읽으면 내용만큼)
function readApprovalHeight() {
  try {
    const n = Number(localStorage.getItem(APPROVAL_HEIGHT_KEY))
    return n >= MIN_HEIGHT ? n : null
  } catch {
    return null
  }
}

function writeApprovalHeight(height: number | null) {
  try {
    if (height === null) localStorage.removeItem(APPROVAL_HEIGHT_KEY)
    else localStorage.setItem(APPROVAL_HEIGHT_KEY, String(Math.round(height)))
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

const isScroller = (style: CSSStyleDeclaration) => style.overflowY === 'auto' || style.overflowY === 'scroll'
const isOutOfFlow = (style: CSSStyleDeclaration) => style.position === 'absolute' || style.position === 'fixed'

/** 탭 내용(data-split-rest)이 잘리지 않고 줄어들 수 있는 최소 높이 — 스크롤 칸은 예약값만, 나머지(제목줄·하단 입력/버튼)는 지금 높이 그대로 */
function restMinHeight(rest: HTMLElement) {
  const reserve = Number(rest.dataset.splitRest) || REST_RESERVE
  const style = getComputedStyle(rest)
  if (isScroller(style)) return reserve
  let total = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
  let count = 0
  for (const el of rest.children) {
    const childStyle = getComputedStyle(el)
    if (isOutOfFlow(childStyle) || childStyle.display === 'none') continue
    total += isScroller(childStyle) || (parseFloat(childStyle.flexGrow) > 0 && childStyle.minHeight === '0px') ? reserve : el.getBoundingClientRect().height
    count++
  }
  return total + (parseFloat(style.rowGap) || 0) * Math.max(0, count - 1)
}

/** 결재·질문 칸이 쓸 수 있는 최대 높이 — 패널에서 다른 칸(헤더·손잡이·탭·입력칸 등)의 실제 높이와 탭 내용 최소 높이를 뺀 값 */
function measureMax(section: HTMLElement) {
  const panel = section.parentElement
  if (!panel) return null
  const rest = panel.querySelector<HTMLElement>(':scope > [data-split-rest]')
  let others = rest ? restMinHeight(rest) : 0
  for (const el of panel.children) {
    if (el === section || el === rest || isOutOfFlow(getComputedStyle(el))) continue
    others += el.getBoundingClientRect().height
  }
  return Math.max(MIN_HEIGHT, Math.floor(panel.clientHeight - others))
}

/** 결재·질문 칸의 높이와 접힘 — 새 결재가 오면 접어 둔 칸을 다시 편다.
 *  저장한 높이는 그대로 두고, 화면에 쓸 높이(shownHeight)만 지금 패널 크기에 맞춰 줄인다 (창을 키우면 다시 저장값대로) */
export function useApprovalSplit(count: number) {
  const ref = useRef<HTMLElement>(null)
  const [height, setHeight] = useState(readApprovalHeight)
  const [isFolded, setIsFolded] = useState(false)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)
  const [nowHeight, setNowHeight] = useState(MIN_HEIGHT)
  const prevCount = useRef(count)
  useEffect(() => {
    if (count > prevCount.current) setIsFolded(false)
    prevCount.current = count
  }, [count])
  // 패널·각 칸의 크기가 바뀔 때마다(창 크기, 입력칸 늘어남, 탭 전환) 상한을 다시 잰다
  const isShown = count > 0
  useEffect(() => {
    const section = ref.current
    const panel = section?.parentElement
    if (!section || !panel) return
    const update = () => {
      setMaxHeight(measureMax(section))
      setNowHeight(Math.round(section.getBoundingClientRect().height))
    }
    const resizeObserver = new ResizeObserver(update)
    // 탭이 바뀌면(칸이 들고 나면) 지켜볼 칸을 다시 고른다. 탭 내용 안의 고정 칸(변경 탭 하단 커밋 입력 등)도 지켜본다
    const mutationObserver = new MutationObserver(() => {
      observeAll()
      update()
    })
    const observeAll = () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      resizeObserver.observe(panel)
      mutationObserver.observe(panel, { childList: true })
      for (const el of panel.children) resizeObserver.observe(el)
      const rest = panel.querySelector(':scope > [data-split-rest]')
      if (!rest) return
      mutationObserver.observe(rest, { childList: true })
      for (const el of rest.children) resizeObserver.observe(el)
    }
    observeAll()
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [isShown])
  const clamp = (h: number) => {
    const max = ref.current ? measureMax(ref.current) : null
    return Math.max(MIN_HEIGHT, max === null ? h : Math.min(h, max))
  }
  const shownHeight = height === null ? null : Math.max(MIN_HEIGHT, maxHeight === null ? height : Math.min(height, maxHeight))
  const save = (h: number | null) => {
    setHeight(h)
    writeApprovalHeight(h)
  }
  return { ref, height, shownHeight, maxHeight, nowHeight, setHeight, isFolded, setIsFolded, clamp, save }
}

/** 결재·질문 칸과 업무 기록 칸 사이 손잡이 — 끌어서 높이 조절, 더블클릭하면 원래대로, ↑↓ 키로도 조절 */
export function ApprovalSplitHandle({
  targetRef,
  clamp,
  now,
  max,
  onChange,
  onCommit,
}: {
  targetRef: RefObject<HTMLElement | null>
  clamp: (h: number) => number
  /** 칸의 실제 높이와 허용 최대 높이 (px) — 보조 기기에 알려 준다 */
  now: number
  max: number | null
  onChange: (h: number) => void
  onCommit: (h: number | null) => void
}) {
  const current = () => targetRef.current?.getBoundingClientRect().height ?? MIN_HEIGHT
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = current()
    let latest = startHeight
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const handleMove = (ev: PointerEvent) => {
      latest = clamp(startHeight + ev.clientY - startY)
      onChange(latest)
    }
    const handleUp = () => {
      handle.removeEventListener('pointermove', handleMove)
      handle.removeEventListener('pointerup', handleUp)
      handle.removeEventListener('pointercancel', handleUp)
      onCommit(latest)
    }
    handle.addEventListener('pointermove', handleMove)
    handle.addEventListener('pointerup', handleUp)
    handle.addEventListener('pointercancel', handleUp)
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowUp' ? -KEY_STEP : e.key === 'ArrowDown' ? KEY_STEP : 0
    if (!step) return
    e.preventDefault()
    onCommit(clamp(current() + step))
  }
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('staffPanel.split.label')}
      aria-valuenow={now}
      aria-valuemin={MIN_HEIGHT}
      aria-valuemax={max ?? undefined}
      title={t('staffPanel.split.title')}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onCommit(null)}
      onKeyDown={handleKeyDown}
      // 폰은 직원 패널이 전체 화면으로 고정이라 높이 조절 손잡이를 두지 않는다 (PC 패널 폭 손잡이와 같이)
      className="group hover:bg-primary/40 active:bg-primary/60 focus-visible:bg-primary/40 phone:hidden relative h-1.5 shrink-0 cursor-row-resize touch-none border-b outline-none transition-colors"
    >
      <span className="bg-muted-foreground/40 group-hover:bg-primary absolute top-1/2 left-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full" />
    </div>
  )
}
