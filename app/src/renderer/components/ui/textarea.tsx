import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted-foreground border-input flex min-h-16 w-full rounded-[var(--radius)] border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-(--focus-border) focus-visible:shadow-(--focus-ring) disabled:opacity-50 phone:text-base',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
