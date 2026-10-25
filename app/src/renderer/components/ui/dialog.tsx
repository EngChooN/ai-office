import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@shared/i18n'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <DialogPrimitive.Content
        className={cn(
          'bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border p-6 shadow-lg',
          // 휴대폰 앱(태블릿 배치): 키보드가 덮지 않게 키보드 위 영역의 가운데에
          'mobile:top-[calc((100%-var(--ime,0px))/2)] mobile:max-h-[calc(85dvh-var(--ime,0px))]',
          // 폰: 아래에서 올라오는 시트 (내용·버튼은 그대로), 키보드가 열리면 그 위로
          'phone:top-auto phone:bottom-[var(--ime,0px)] phone:left-0 phone:max-h-[calc(92dvh-var(--ime,0px))] phone:max-w-none phone:translate-x-0 phone:translate-y-0 phone:rounded-t-xl phone:rounded-b-none phone:border-x-0 phone:border-b-0 phone:p-4 phone:pb-6 phone:pr-[max(1rem,env(safe-area-inset-right))] phone:pl-[max(1rem,env(safe-area-inset-left))] short:max-h-[calc(96dvh-var(--ime,0px))] short:pb-4',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="phone:flex phone:size-10 phone:items-center phone:justify-center phone:top-2 phone:right-2 absolute top-4 right-4 rounded-xs opacity-70 hover:opacity-100">
          <XIcon className="size-4" />
          <span className="sr-only">{t('common.close')}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex justify-end gap-2', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
