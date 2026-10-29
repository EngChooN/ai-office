import * as React from 'react'
import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('bg-card text-card-foreground flex flex-col gap-4 rounded-[var(--radius-card)] border p-4 shadow-(--shadow-soft)', className)} {...props} />
}

export { Card }
