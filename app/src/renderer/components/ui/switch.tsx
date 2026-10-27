import * as React from 'react'
import { cn } from '@/lib/utils'

/** 켜기/끄기 스위치 — 체크박스 대신 한 줄 목록 오른쪽 끝에 둔다 */
function Switch({ checked, onCheckedChange, className, ...props }: Omit<React.ComponentProps<'button'>, 'onChange'> & { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'focus-visible:ring-ring/50 inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className,
      )}
      {...props}
    >
      <span className={cn('bg-background pointer-events-none block size-3 rounded-full shadow-sm transition-transform', checked ? 'translate-x-3.5' : 'translate-x-0.5')} />
    </button>
  )
}

export { Switch }
