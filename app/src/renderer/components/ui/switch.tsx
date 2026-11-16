import * as React from 'react'
import { cn } from '@/lib/utils'

const trackClass = (checked: boolean) =>
  cn('inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-transparent transition-colors', checked ? 'bg-primary' : 'bg-input')
const Knob = ({ checked }: { checked: boolean }) => (
  <span className={cn('bg-background pointer-events-none block size-3 rounded-full shadow-sm transition-transform', checked ? 'translate-x-3.5' : 'translate-x-0.5')} />
)

/** 켜기/끄기 스위치 — 체크박스 대신 한 줄 목록 오른쪽 끝에 둔다 */
function Switch({ checked, onCheckedChange, className, ...props }: Omit<React.ComponentProps<'button'>, 'onChange'> & { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      onClick={() => onCheckedChange(!checked)}
      className={cn(trackClass(checked), 'focus-visible:ring-ring/50 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    >
      <Knob checked={checked} />
    </button>
  )
}

/** 스위치 모양만 — 줄 전체가 role="switch" 버튼인 곳에 넣는다 (버튼 안에 버튼을 두지 않게). 레트로 규칙이 data-slot·aria-checked로 같이 칠한다 */
function SwitchTrack({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span aria-hidden data-slot="switch" aria-checked={checked} className={cn(trackClass(checked), className)}>
      <Knob checked={checked} />
    </span>
  )
}

export { Switch, SwitchTrack }
