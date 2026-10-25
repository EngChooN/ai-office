// 직원 실시간 미니 뷰: 사무실 지도에서 그 직원이 지금 움직이는 모습 (프로필·대시보드 카드)
// 그리기는 officeStage가 지도와 같은 장면에서 보조 카메라로 한다. 여기는 창이 화면에 보일 때만 등록한다
// 업무 모드면 칸째 숨긴다 (게임 요소를 숨기는 모드). 움직임 줄이기 설정이면 칸은 두고 정지 그림만 보여 준다

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { MINI_H, MINI_W, officeStage, type MiniHandle } from '@/map/officeStage'
import { avatarUrl } from '@/map/sprites'
import { useWorkMode } from '@/store'
import type { Staff } from '@shared/types'
import { t } from '@shared/i18n'

const stillQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
/** OS '움직임 줄이기' — 켜고 끄면 바로 따라간다 */
const usePrefersStill = () =>
  useSyncExternalStore(
    (onChange) => {
      stillQuery?.addEventListener('change', onChange)
      return () => stillQuery?.removeEventListener('change', onChange)
    },
    () => stillQuery?.matches ?? false,
  )

/** wrapperClassName: 창을 감싸는 칸 (업무 모드에서는 칸째 없앤다) */
/** isCompact: 대시보드 카드처럼 작은 창 (갱신을 낮추고 머리까지 보이게 조금 멀리서) */
export function LiveMiniView({ staff, className, wrapperClassName, isCompact = false }: { staff: Staff; className?: string; wrapperClassName?: string; isCompact?: boolean }) {
  const isWorkMode = useWorkMode()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<MiniHandle | null>(null)
  const [isLive, setIsLive] = useState(false)
  const staffIdRef = useRef(staff.id)
  staffIdRef.current = staff.id
  const isStill = usePrefersStill()

  // 화면에 보이는 동안만 그린다 (스크롤로 가려지거나 접힌 창은 칸을 돌려준다)
  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (isWorkMode || isStill || !box || !canvas || typeof IntersectionObserver === 'undefined') return
    const stop = () => {
      handleRef.current?.dispose()
      handleRef.current = null
      setIsLive(false)
    }
    // 창이 기본 비율보다 넓으면 그만큼 넓게 그린다 (늘려서 확대하지 않게)
    const aspectOf = () => box.clientWidth / Math.max(1, box.clientHeight)
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !handleRef.current) handleRef.current = officeStage.addView(staffIdRef.current, canvas, setIsLive, { isCompact, aspect: aspectOf() })
      else if (!entry.isIntersecting) stop()
    })
    observer.observe(box)
    const resizer = new ResizeObserver(() => handleRef.current?.setAspect(aspectOf()))
    resizer.observe(box)
    return () => {
      observer.disconnect()
      resizer.disconnect()
      stop()
    }
  }, [isWorkMode, isStill, isCompact])

  useEffect(() => handleRef.current?.setStaff(staff.id), [staff.id])

  if (isWorkMode) return null
  const view = (
    <div
      ref={boxRef}
      className={cn('relative w-full overflow-hidden rounded-lg border bg-[#1b1e25]', className)}
      style={{ aspectRatio: `${MINI_W} / ${MINI_H}` }}
      aria-label={isStill ? `${staff.name}` : t('liveMini.ariaLabel', { name: staff.name })}
      role="img"
    >
      {!isStill && <canvas ref={canvasRef} className={cn('absolute inset-0 size-full object-cover [image-rendering:pixelated]', !isLive && 'invisible')} />}
      {/* 움직임 줄이기·칸이 모자람·아직 사무실에 없음이면 정지 그림 */}
      {!isLive && <img src={avatarUrl(staff.avatar)} alt="" className="absolute inset-0 m-auto h-3/5 object-contain opacity-70 [image-rendering:pixelated]" />}
    </div>
  )
  return wrapperClassName ? <div className={wrapperClassName}>{view}</div> : view
}
