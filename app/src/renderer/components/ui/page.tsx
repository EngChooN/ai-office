import * as React from 'react'
import { cn } from '@/lib/utils'

/** 사이드바 각 화면의 공통 틀 */
function Page({ title, description, actions, className, children }: { title: string; description?: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {/* 가로 폰: 제목·버튼을 한 줄로, 설명은 숨긴다 */}
      <div className="phone:flex-col phone:items-stretch phone:gap-2 phone:px-4 phone:py-3 short:flex-row short:items-center short:py-1.5 typing:hidden flex items-end gap-4 border-b px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="short:text-base short:truncate text-lg font-semibold">{title}</h1>
          {description && <p className="text-muted-foreground short:hidden text-xs">{description}</p>}
        </div>
        {actions}
      </div>
      <div className={cn('phone:p-4 min-h-0 flex-1 overflow-y-auto p-6', className)}>{children}</div>
    </div>
  )
}

export { Page }
