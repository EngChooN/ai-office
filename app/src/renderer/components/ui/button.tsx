import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] text-sm font-medium transition-[color,background-color,box-shadow,opacity] duration-(--transition-fast) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:shadow-(--focus-ring) phone:min-h-10",
  {
    variants: {
      variant: {
        // 같은 보라 계열 바탕 위에선 옅은 바깥 링이 잘 안 보여 안쪽에 밝은 선을 한 줄 더한다
        default: 'bg-primary bg-[image:var(--grad-primary)] text-primary-foreground shadow-(--shadow-primary) hover:bg-[image:var(--grad-primary-hover)] focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--primary-foreground)_75%,transparent),var(--focus-ring)]',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-(--destructive-hover)',
        outline: 'border bg-transparent hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 gap-1.5 px-3',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
