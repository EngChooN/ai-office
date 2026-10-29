import * as React from 'react'
import { cn } from '@/lib/utils'

/** 네이티브 select를 shadcn 톤으로 감싼 것 (Radix Select 대신 가볍게)
 *  기본 화살표는 둥근 테두리 끝에 붙어서 숨기고, 꺾쇠(--select-chevron)를 안쪽으로 들여 그린다 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn('border-input bg-background h-9 appearance-none rounded-[var(--radius)] border bg-[image:var(--select-chevron)] bg-[length:0.875rem] bg-[position:right_0.75rem_center] bg-no-repeat pr-8 pl-3 text-sm outline-none focus-visible:border-(--focus-border) focus-visible:shadow-(--focus-ring) phone:min-h-10 phone:text-base', className)}
      {...props}
    />
  )
}

export { NativeSelect }
