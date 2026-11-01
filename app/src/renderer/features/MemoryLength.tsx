import { BrainIcon } from 'lucide-react'
import { NativeSelect } from '@/components/ui/select'
import { t, type TKey } from '@shared/i18n'
import type { MemoryLength, Staff } from '@shared/types'

// 대화 기억 길이: 대화가 얼마나 길어지면 새 대화로 넘길지 직원마다 고른다 (직원 패널 아래 줄)
// 마우스를 올리면 칸 전체 설명, 고른 항목 설명이 뜬다

const LENGTHS: MemoryLength[] = ['short', 'normal', 'long', 'full']

export function MemoryLengthSelect({ staff }: { staff: Staff }) {
  const value = staff.memory ?? 'normal'
  const hint = `${t('memory.hint')}\n\n${LENGTHS.map((m) => `· ${t(`memory.${m}` as TKey)} — ${t(`memory.${m}.hint` as TKey)}`).join('\n')}\n\n${t('memory.hintFoot')}`
  return (
    <label className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs whitespace-nowrap" title={hint}>
      <BrainIcon className="size-3.5" />
      <span>{t('memory.label')}</span>
      <NativeSelect
        value={value}
        onChange={(e) => void window.office.updateStaff(staff.id, { memory: e.target.value as MemoryLength })}
        className="h-7 bg-[position:right_0.4rem_center] pr-6 pl-2 text-xs"
        aria-label={t('memory.label')}
      >
        {LENGTHS.map((m) => (
          <option key={m} value={m} title={t(`memory.${m}.hint` as TKey)}>
            {t(`memory.${m}` as TKey)}
          </option>
        ))}
      </NativeSelect>
    </label>
  )
}
