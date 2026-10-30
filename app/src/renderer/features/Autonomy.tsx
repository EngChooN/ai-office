import { BotIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_MOBILE_SHELL } from '@/shell'
import { useOffice } from '@/store'
import { isTaskAutonomous } from '@shared/autonomy'
import { t } from '@shared/i18n'
import type { Task } from '@shared/types'

// 자율 진행(묻지 않고 끝까지) 화면 조각: 지시창·카드 만들기의 켜기 칸 · 업무 카드·직원 카드의 작은 표시
// 켜기는 PC에서만 (휴대폰 화면에서는 켜기 칸을 숨기고, 켜져 있는 카드는 끄기만)

/** 지시창·카드 만들기의 '자율 진행' 체크 + 짧은 설명. 휴대폰 화면에는 없다 */
export function AutonomyCheck({ checked, onChange, className }: { checked: boolean; onChange: (isOn: boolean) => void; className?: string }) {
  if (IS_MOBILE_SHELL) return null
  return (
    <label className={cn('text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs', className)} title={t('autonomy.hint')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <BotIcon className={cn('size-3.5', checked && 'text-status-working')} />
      <span className={cn(checked && 'text-status-working font-medium')}>{t('autonomy.label')}</span>
      <span className="truncate">· {t('autonomy.hint')}</span>
    </label>
  )
}

/** 작은 표시 "🤖 자율" — 직원 카드·업무 카드 */
export function AutonomyBadge({ className, onClick, title }: { className?: string; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <BotIcon className="size-3" />
      {t('autonomy.label')}
    </>
  )
  const cls = cn('border-status-working/60 text-status-working inline-flex w-fit items-center gap-0.5 rounded border px-1 text-[10px] font-semibold', className)
  if (!onClick) return <span className={cls} title={title ?? t('autonomy.badge')}>{body}</span>
  return (
    <button type="button" className={cn(cls, 'hover:bg-status-working/10')} title={title ?? t('autonomy.badge')} onClick={onClick}>
      {body}
    </button>
  )
}

/** 업무 카드의 자율 진행: 켜져 있으면 표시(직접 켠 카드면 눌러 끄기), 꺼져 있으면 끝나지 않은 카드에 켜기 칸 (PC만) */
export function TaskAutonomy({ task }: { task: Task }) {
  const tasks = useOffice((s) => s.tasks)
  const isOn = isTaskAutonomous(task, (id) => tasks.find((x) => x.id === id))
  const set = (isAutonomous: boolean) => void window.office.updateTask(task.id, { isAutonomous })
  if (isOn) {
    // 상위 기획 카드에서 물려받은 자율은 상위 카드에서 끈다
    if (!task.isAutonomous) return <AutonomyBadge />
    return <AutonomyBadge onClick={() => set(false)} title={`${t('autonomy.badge')} · ${t('autonomy.turnOff')}`} />
  }
  if (IS_MOBILE_SHELL || task.status === 'done' || task.isPractice) return null
  return (
    <label className="text-muted-foreground flex w-fit cursor-pointer items-center gap-1 text-[10px]" title={t('autonomy.hint')}>
      <input type="checkbox" className="size-3" checked={false} onChange={() => set(true)} />
      {t('autonomy.label')}
    </label>
  )
}
