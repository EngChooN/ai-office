import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GaugeIcon, ZapIcon } from 'lucide-react'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { t, type TKey } from '@shared/i18n'
import { EFFORT_LEVELS, type EffortChoice, type Staff } from '@shared/types'

// 생각 깊이·빠른 모드: 직원마다 고른다 (직원 패널 아래 줄, 대화 기억 옆). 일하는 중에 바꿔도 대화를 끊지 않고 다음 단계부터 적용된다
// 설명 말풍선은 대화 기억과 같이 직접 그린다 (선택 칸 위에서 기본 title 툴팁이 잘 안 뜬다)

const CHOICES: EffortChoice[] = ['default', ...EFFORT_LEVELS]

/** 마우스를 올리거나 초점이 가면 위에 설명 말풍선을 띄운다 */
function useHint() {
  const ref = useRef<HTMLLabelElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const show = () => setAnchor(ref.current?.getBoundingClientRect() ?? null)
  const hide = () => setAnchor(null)
  const bind = { ref, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide }
  const bubble = (body: ReactNode) =>
    anchor &&
    createPortal(
      <div
        role="tooltip"
        className="bg-popover text-popover-foreground pointer-events-none fixed z-50 w-64 rounded-lg border p-3 text-xs leading-relaxed shadow-lg"
        style={{ right: Math.max(8, window.innerWidth - anchor.right), bottom: window.innerHeight - anchor.top + 6 }}
      >
        {body}
      </div>,
      document.body,
    )
  return { bind, bubble, hide }
}

export function EffortSelect({ staff }: { staff: Staff }) {
  const value: EffortChoice = staff.effort ?? 'default'
  const hint = useHint()
  return (
    <label {...hint.bind} className="text-muted-foreground flex shrink-0 cursor-help items-center gap-1 text-xs whitespace-nowrap">
      <GaugeIcon className="size-3.5" />
      <span>{t('tuning.effort.label')}</span>
      <NativeSelect
        value={value}
        onChange={(e) => {
          hint.hide()
          void window.office.updateStaff(staff.id, { effort: e.target.value as EffortChoice })
        }}
        className="h-7 bg-[position:right_0.4rem_center] pr-6 pl-2 text-xs"
        aria-label={t('tuning.effort.label')}
      >
        {CHOICES.map((e) => (
          <option key={e} value={e}>
            {t(`tuning.effort.${e}` as TKey)}
          </option>
        ))}
      </NativeSelect>
      {hint.bubble(<p>{t('tuning.effort.hint')}</p>)}
    </label>
  )
}

export function FastToggle({ staff }: { staff: Staff }) {
  const isOn = staff.fast === true
  const hint = useHint()
  return (
    <label {...hint.bind} className={cn('flex shrink-0 cursor-pointer items-center gap-1 text-xs whitespace-nowrap', isOn ? 'text-primary font-medium' : 'text-muted-foreground')}>
      <input type="checkbox" checked={isOn} onChange={(e) => void window.office.updateStaff(staff.id, { fast: e.target.checked })} />
      <ZapIcon className="size-3.5" />
      <span>{t('tuning.fast.label')}</span>
      {hint.bubble(<p>{t('tuning.fast.hint')}</p>)}
    </label>
  )
}
