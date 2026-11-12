import type { ReactNode } from 'react'
import { IconText } from '@/components/duo-icon'
import { cn } from '@/lib/utils'

/** 빈 화면 안내 (결재함 모양 그대로): 제목 · 이게 뭔지 · 언제 생기는지 · 첫 행동 버튼(children) */
export function EmptyGuide({ title, what, when, children, className }: { title: string; what?: string; when?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('text-muted-foreground flex max-w-3xl flex-col items-start gap-2 text-sm', className)}>
      <p>
        <IconText text={title} size={16} />
      </p>
      {what && <p className="text-xs">{what}</p>}
      {when && <p className="text-xs">{when}</p>}
      {children}
    </div>
  )
}
