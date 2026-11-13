import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { MENU_WIDTH, menuPosition } from '@/lib/menuPosition'
import { cn } from '@/lib/utils'

/** 버튼을 누를 때 포커스를 빼앗지 않는다 — 입력칸 포커스가 빠지면 폰 키보드가 닫혀 분할 배치가 바뀐다. 선택 칸·체크 칸은 그대로 둔다 */
const keepFocus = (e: MouseEvent) => (e.target as HTMLElement).closest('button') && e.preventDefault()

/**
 * 버튼을 누르면 위(또는 아래)로 뜨는 작은 버튼 목록 — 분할 화면 입력칸의 ＋, 직원 패널의 ⋯.
 * 스크롤 상자·좁은 칸 안에서 잘리지 않게 body에 고정 위치로 띄운다. 창 크기가 바뀌면(키보드 등) 자리를 다시 잡는다.
 * 바깥을 누르거나 Esc(안드로이드 뒤로 가기도 Esc로 온다)로 닫는다. 안에는 기존 버튼·부품을 그대로 넣는다
 */
export function PopMenu({ icon, label, hasDot, opens = 'up', className, buttonClassName, children }: { icon: ReactNode; label: string; hasDot?: boolean; opens?: 'up' | 'down'; className?: string; /** 아이콘 대신 글자·얼굴을 담는 버튼(세로 폰 방 이름 ▾ 등) */ buttonClassName?: string; children: (close: () => void) => ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!isOpen) return setStyle(null)
    const place = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (rect) setStyle(menuPosition(rect, opens, { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [isOpen, opens])
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen])
  const close = () => setIsOpen(false)
  return (
    <div ref={ref} className={cn('relative shrink-0', className)}>
      <Button type="button" size="icon" variant="ghost" className={cn('relative size-9', buttonClassName)} onMouseDown={keepFocus} onClick={() => setIsOpen((v) => !v)} aria-label={label} title={label} aria-expanded={isOpen}>
        {icon}
        {hasDot && <span className="bg-primary absolute top-1.5 right-1.5 size-1.5 rounded-full" />}
      </Button>
      {isOpen &&
        style &&
        createPortal(
          // 안드로이드 뒤로 가기가 열린 대화상자처럼 찾아 Esc로 닫게 role·data-state를 단다
          <div ref={menuRef} role="dialog" data-state="open" aria-label={label} onMouseDown={keepFocus} style={{ ...style, width: MENU_WIDTH }} className="bg-popover text-popover-foreground fixed z-50 flex flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5 shadow-lg">
            {children(close)}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** PopMenu 안의 한 줄 버튼 */
export function PopMenuItem({ icon, onClick, children, className, title }: { icon?: ReactNode; onClick: () => void; children: ReactNode; className?: string; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className={cn('hover:bg-accent flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-sm [&_svg]:size-4 [&_svg]:shrink-0', className)}>
      {icon}
      {children}
    </button>
  )
}
