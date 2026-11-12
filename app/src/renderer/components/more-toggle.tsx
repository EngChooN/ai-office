import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { t } from '@shared/i18n'
import { cn } from '@/lib/utils'

/** "자세히 설정 / 간단히 보기" 접기 버튼 — 접혀 있을 때만 무엇이 들어 있는지 한 줄 안내(hint)를 보여 준다. moreLabel: 접혀 있을 때 문구를 바꿀 때 */
export function MoreToggle({ open, onToggle, hint, moreLabel, size = 'sm', className }: { open: boolean; onToggle: () => void; hint?: string; moreLabel?: string; size?: 'sm' | 'xs'; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button type="button" onClick={onToggle} aria-expanded={open} className={cn('text-primary flex w-fit items-center gap-1 font-medium', size === 'sm' ? 'text-sm' : 'text-xs')}>
        {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
        {open ? t('guideHint.hire.less') : moreLabel ?? t('guideHint.hire.more')}
      </button>
      {!open && hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  )
}
