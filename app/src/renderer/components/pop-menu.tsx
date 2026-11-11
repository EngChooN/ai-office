import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * 버튼을 누르면 위(또는 아래)로 뜨는 작은 버튼 목록 — 분할 화면 입력칸의 ＋, 직원 패널의 ⋯.
 * 바깥을 누르거나 Esc(안드로이드 뒤로 가기도 Esc로 온다)로 닫는다. 안에는 기존 버튼·부품을 그대로 넣는다
 */
export function PopMenu({ icon, label, hasDot, opens = 'up', className, children }: { icon: ReactNode; label: string; hasDot?: boolean; opens?: 'up' | 'down'; className?: string; children: (close: () => void) => ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setIsOpen(false)
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
      <Button type="button" size="icon" variant="ghost" className="relative size-9" onClick={() => setIsOpen((v) => !v)} aria-label={label} title={label} aria-expanded={isOpen}>
        {icon}
        {hasDot && <span className="bg-primary absolute top-1.5 right-1.5 size-1.5 rounded-full" />}
      </Button>
      {isOpen && (
        // 안드로이드 뒤로 가기가 열린 대화상자처럼 찾아 Esc로 닫게 role·data-state를 단다
        <div role="dialog" data-state="open" aria-label={label} className={cn('bg-popover text-popover-foreground absolute left-0 z-50 flex max-h-[60vh] w-64 flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5 shadow-lg', opens === 'up' ? 'bottom-full mb-1' : 'top-full mt-1')}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

/** PopMenu 안의 한 줄 버튼 */
export function PopMenuItem({ icon, onClick, children, className }: { icon?: ReactNode; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('hover:bg-accent flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-sm [&_svg]:size-4 [&_svg]:shrink-0', className)}>
      {icon}
      {children}
    </button>
  )
}
