import { SparklesIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@shared/i18n'

/** 비서 얼굴: 직원이 아니라 아바타 대신 아이콘 원 하나 (secretary-ui.md 0절) */
export function SecretaryFace({ className }: { className?: string }) {
  return (
    <span className={cn('bg-primary/15 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-full', className)} aria-label={t('secretary.name')}>
      <SparklesIcon className="size-[55%]" />
    </span>
  )
}
