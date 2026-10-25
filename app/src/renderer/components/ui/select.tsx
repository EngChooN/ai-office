import * as React from 'react'
import { cn } from '@/lib/utils'

/** 네이티브 select를 shadcn 톤으로 감싼 것 (Radix Select 대신 가볍게) */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn('border-input bg-background h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 phone:min-h-10 phone:text-base', className)}
      {...props}
    />
  )
}

export { NativeSelect }
