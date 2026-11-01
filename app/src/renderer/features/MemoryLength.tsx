import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrainIcon } from 'lucide-react'
import { NativeSelect } from '@/components/ui/select'
import { t, type TKey } from '@shared/i18n'
import type { MemoryLength, Staff } from '@shared/types'

// 대화 기억 길이: 대화가 얼마나 길어지면 새 대화로 넘길지 직원마다 고른다 (직원 패널 아래 줄)
// 마우스를 올리면 칸 위에 설명 말풍선이 뜬다. 브라우저 기본 title 툴팁은 선택 칸 위에서 잘 안 떠서 직접 그린다

const LENGTHS: MemoryLength[] = ['short', 'normal', 'long', 'full']

export function MemoryLengthSelect({ staff }: { staff: Staff }) {
  const value = staff.memory ?? 'normal'
  const ref = useRef<HTMLLabelElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const show = () => setAnchor(ref.current?.getBoundingClientRect() ?? null)
  const hide = () => setAnchor(null)
  return (
    <label
      ref={ref}
      className="text-muted-foreground ml-auto flex shrink-0 cursor-help items-center gap-1 text-xs whitespace-nowrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <BrainIcon className="size-3.5" />
      <span>{t('memory.label')}</span>
      <NativeSelect
        value={value}
        onChange={(e) => {
          hide()
          void window.office.updateStaff(staff.id, { memory: e.target.value as MemoryLength })
        }}
        className="h-7 bg-[position:right_0.4rem_center] pr-6 pl-2 text-xs"
        aria-label={t('memory.label')}
      >
        {LENGTHS.map((m) => (
          <option key={m} value={m}>
            {t(`memory.${m}` as TKey)}
          </option>
        ))}
      </NativeSelect>
      {anchor &&
        createPortal(
          <div
            role="tooltip"
            className="bg-popover text-popover-foreground pointer-events-none fixed z-50 w-72 rounded-lg border p-3 text-xs leading-relaxed shadow-lg"
            style={{ right: Math.max(8, window.innerWidth - anchor.right), bottom: window.innerHeight - anchor.top + 6 }}
          >
            <p>{t('memory.hint')}</p>
            <ul className="my-2 flex flex-col gap-1">
              {LENGTHS.map((m) => (
                <li key={m} className={m === value ? 'text-foreground font-medium' : undefined}>
                  <span className="font-semibold">{t(`memory.${m}` as TKey)}</span> — {t(`memory.${m}.hint` as TKey)}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">{t('memory.hintFoot')}</p>
          </div>,
          document.body,
        )}
    </label>
  )
}
