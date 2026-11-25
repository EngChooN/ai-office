import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import type { Staff } from '@shared/types'
import { t } from '@shared/i18n'
import { helperBadgeCount, helperElapsed, helperHeadline } from '@shared/helpers'
import { cn } from '@/lib/utils'
import { useNow } from '@/features/status'

type HelperStaff = Pick<Staff, 'provider' | 'equipment' | 'helpers'>

/** 도우미 아이콘: 겹친 두 사람 (시안 subagent-indicator-v1 <symbol id="helper">) */
export function HelperIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn('size-3.5 shrink-0', className)}>
      <circle cx="5.5" cy="5" r="2.6" fill="currentColor" opacity=".45" />
      <path d="M1 13.5c0-2.6 2-4.3 4.5-4.3" stroke="currentColor" strokeWidth="1.6" fill="none" opacity=".45" strokeLinecap="round" />
      <circle cx="10.5" cy="5.6" r="2.8" fill="currentColor" />
      <path d="M5.6 14.5c0-2.8 2.2-4.7 4.9-4.7s4.9 1.9 4.9 4.7" fill="currentColor" />
    </svg>
  )
}

/** 지금 도는 도우미 수 칩 — 카드는 '도우미 N', 좁은 목록 줄은 '×N'. 2명 미만·스위치 꺼짐이면 그리지 않는다 */
export function HelperChip({ staff, isShort = false, className }: { staff: HelperStaff; isShort?: boolean; className?: string }) {
  const n = helperBadgeCount(staff)
  if (!n) return null
  return (
    <span
      title={t('helpers.chipTitle', { n })}
      className={cn('bg-primary/14 border-primary/35 text-primary inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-semibold whitespace-nowrap', className)}
    >
      <HelperIcon />
      {t(isShort ? 'helpers.short' : 'helpers.chip', { n })}
    </span>
  )
}

/**
 * 머리말 상태 줄 뒤에 붙는 ' · 도우미 N명과 함께 ▾' 버튼 (기본 접힘 — 펼친 목록은 HelperList를 줄 아래에 둔다).
 * 상태 줄을 감싼 @container가 320px보다 좁으면 문구 대신 ×N.
 * isStandalone(따로 된 한 줄)이면 앞 점을 빼고, 줄 전체를 쓰니 200px까지 문구를 둔다
 */
export function HelpersToggle({ staff, isOpen, onToggle, isStandalone = false }: { staff: HelperStaff; isOpen: boolean; onToggle: () => void; isStandalone?: boolean }) {
  const head = helperHeadline(staff)
  if (!head) return null
  const label = head.kind === 'running' ? t('helpers.with', { n: head.n }) : t('helpers.allDone', { n: head.n })
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-label={`${label} — ${isOpen ? t('helpers.collapse') : t('helpers.expand')}`}
      onClick={onToggle}
      className={cn('focus-ring -my-1.5 inline-flex h-8 min-w-11 shrink items-center justify-center gap-1 overflow-hidden rounded-full px-1.5 text-xs font-semibold', head.kind === 'running' ? 'text-primary' : 'text-muted-foreground')}
    >
      {!isStandalone && (
        <span aria-hidden className="text-muted-foreground font-normal">
          ·
        </span>
      )}
      <HelperIcon />
      <span className={cn('hidden min-w-0 truncate', isStandalone ? '@[200px]:inline' : '@[320px]:inline')}>{label}</span>
      <span className={isStandalone ? '@[200px]:hidden' : '@[320px]:hidden'}>{head.kind === 'running' ? t('helpers.short', { n: head.n }) : <CheckIcon aria-hidden className="size-3" />}</span>
      <span aria-hidden className="text-muted-foreground text-[10px]">
        {isOpen ? '▴' : '▾'}
      </span>
    </button>
  )
}

/** 펼친 도우미 목록 — 머리말이 보일 때만(helperHeadline이 있을 때) 그린다 */
export function HelperPanel({ staff, isOpen, className }: { staff: HelperStaff; isOpen: boolean; className?: string }) {
  if (!isOpen || !helperHeadline(staff)) return null
  return <HelperList staff={staff} className={className} />
}

/** 머리말 펼침 상태 — 버튼과 목록이 다른 줄에 있어 부모가 들고 있는다 */
export const useHelpersOpen = () => {
  const [isOpen, setOpen] = useState(false)
  return { isOpen, toggle: () => setOpen((v) => !v) }
}

function HelperList({ staff, className }: { staff: HelperStaff; className?: string }) {
  const now = useNow(1000)
  const list = staff.helpers ?? []
  // 도는 도우미 먼저, 끝난 도우미는 아래 (번호는 띄운 순서)
  const rows = list.map((h, i) => ({ h, no: i + 1 })).sort((a, b) => Number(a.h.endedAt !== undefined) - Number(b.h.endedAt !== undefined))
  return (
    <ol aria-label={t('helpers.list')} className={cn('bg-primary/5 flex flex-col border-t px-3.5 py-2', className)}>
      {rows.map(({ h, no }) => {
        const isDone = h.endedAt !== undefined
        return (
          <li key={h.id} className="flex min-w-0 items-center gap-2 py-[5px] text-xs">
            <span className={cn('bg-primary/18 text-primary grid size-[22px] shrink-0 place-items-center rounded-[7px] text-[11px] font-bold', isDone && 'opacity-70')}>{isDone ? <CheckIcon aria-hidden className="size-3" strokeWidth={3} /> : no}</span>
            {!isDone && <span aria-hidden className="border-primary/30 border-t-primary size-2.5 shrink-0 animate-spin rounded-full border-2 motion-reduce:animate-none" />}
            <span className={cn('min-w-0 flex-1 truncate', isDone && 'opacity-70')} title={h.title}>
              {h.title}
            </span>
            {isDone ? <span className="text-status-working shrink-0 font-bold">{t('helpers.done')}</span> : <span className="text-muted-foreground shrink-0 tabular-nums">{helperElapsed(now - h.startedAt)}</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** 상태 줄이 따로 없는 곳(업무 상세·세로 폰 직원 패널)에 두는 한 줄 — 도우미를 쓸 때만 보인다 */
export function HelpersBar({ staff, className }: { staff: HelperStaff; className?: string }) {
  const { isOpen, toggle } = useHelpersOpen()
  if (!helperHeadline(staff)) return null
  return (
    <div className={cn('@container min-w-0 text-xs', className)}>
      <div className="flex min-w-0 items-center">
        <HelpersToggle staff={staff} isOpen={isOpen} onToggle={toggle} isStandalone />
      </div>
      <HelperPanel staff={staff} isOpen={isOpen} className="mt-1 rounded-lg border" />
    </div>
  )
}
