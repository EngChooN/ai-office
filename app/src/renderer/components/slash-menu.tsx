import { useEffect, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { slashAction, type StaffCommand } from '@shared/slashCommands'
import type { Manual } from '@shared/types'
import { t } from '@shared/i18n'

/** 자동완성 한 줄 — /명령, 또는 직원 채팅의 개인 매뉴얼·랩·팀 프로세스 */
export interface SlashItem {
  key: string
  label: string
  argumentHint?: string
  description: string
  /** 오른쪽 작은 꼬리표 (기본 명령·스킬·매뉴얼·프로세스 시작) */
  tag: string
  /** 묶음 제목 ('내 매뉴얼'·'Claude 명령') — 앞 줄과 다르면 그 위에 제목을 단다 */
  group?: string
}

/** 메뉴에 무엇을 보일지: '/'를 직접 치면 둘 다, 📘 매뉴얼·/ 명령 버튼이면 한쪽만 */
export type SlashMode = 'all' | 'manual' | 'command'

/** 명령 설명 — 앱 언어로 번역된 설명(main이 채움)이 있으면 그걸 먼저 */
export const commandDescription = (c: StaffCommand) => c.localizedDescription || c.description

/** /명령 → 자동완성 한 줄 */
export const commandItem = (c: StaffCommand): SlashItem => ({
  key: `cmd:${c.name}`,
  label: `/${c.name}`,
  argumentHint: c.argumentHint,
  description: commandDescription(c),
  tag: t(c.isBuiltin ? 'slashMenu.tag.builtin' : 'slashMenu.tag.custom'),
  group: t('slashMenu.group.command'),
})

/** 개인 매뉴얼 이름 → 자동완성 한 줄 */
export const manualItem = (name: string, description = ''): SlashItem => ({
  key: `manual:${name}`,
  label: `📘 ${name}`,
  description,
  tag: t('slashMenu.tag.manual'),
  group: t('slashMenu.group.manual'),
})

/** 매뉴얼실의 개인 매뉴얼 — 메뉴를 열 때 새로 불러온다. 스킬 목록에서 매뉴얼을 가려내는 기준(이름 대조)이 된다 */
export function usePersonalManuals(isOpen: boolean): Manual[] {
  const manuals = useOffice((s) => s.manuals)
  const refresh = useOffice((s) => s.refreshManuals)
  useEffect(() => {
    if (isOpen) void refresh()
  }, [isOpen, refresh])
  return manuals.filter((m) => m.kind === 'personal')
}

/**
 * 받는 직원들의 /명령 목록. 아직 없으면 메뉴를 열 때 한 번 불러온다(결과는 스냅샷으로 온다).
 * 여러 명이면 모두가 쓸 수 있는 명령만. 불러오는 중이면 null
 */
export function useStaffCommands(staffIds: string[], isOpen: boolean): StaffCommand[] | null {
  const all = useOffice((s) => s.staffCommands)
  const idsKey = staffIds.join(',')
  useEffect(() => {
    if (!isOpen) return
    for (const id of staffIds) if (!all?.[id]) void window.office.loadStaffCommands(id)
    // 열 때(또는 받는 사람이 바뀔 때)만 부른다 — 스냅샷이 올 때마다 다시 부르지 않게 all은 빼 둔다
  }, [isOpen, idsKey])
  const lists = staffIds.map((id) => all?.[id])
  if (lists.some((l) => !l)) return null
  const [first = [], ...rest] = lists as StaffCommand[][]
  return first.filter((c) => rest.every((l) => l.some((x) => x.name === c.name)))
}

/**
 * 입력창 키: ↑↓로 옮기고 Enter·Tab으로 고른다. Enter면 isEnter=true — 받는 쪽이 바로 보낼지 정한다(Tab·클릭은 채우기만).
 * 메뉴가 키를 썼으면 true (입력창은 보내기 등을 하지 않는다)
 */
export function useSlashKeys(count: number, query: string | null, onPick: (index: number, isEnter?: boolean) => void) {
  const [active, setActive] = useState(0)
  useEffect(() => setActive(0), [query])
  const current = Math.min(active, count - 1)
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query === null || count === 0 || e.nativeEvent.isComposing) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((current + (e.key === 'ArrowDown' ? 1 : count - 1)) % count)
      return true
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault()
      onPick(current, e.key === 'Enter')
      return true
    }
    return false
  }
  return { active: current, onKeyDown }
}

/** '/' 자동완성 목록. 앱에서 막힌 명령(/login 등)을 다 치면 목록 대신 안내를 보여 준다 */
export function SlashMenu({ query, items, active, onPick, note, emptyText, className }: { query: string; items: SlashItem[] | null; active: number; onPick: (index: number) => void; note?: string; emptyText?: string; className?: string }) {
  const action = slashAction(`/${query}`)
  const blocked = action.kind === 'blocked' ? action.name : null
  return (
    <div role="listbox" className={cn('bg-popover flex max-h-64 flex-col overflow-y-auto rounded-lg border p-1 text-xs shadow-lg', className)}>
      {note && <span className="text-muted-foreground px-2 pt-1 text-[10px]">{note}</span>}
      {blocked && <span className="text-status-waiting p-2">{t('slash.blocked', { name: blocked })}</span>}
      {items === null && <span className="text-muted-foreground p-2">{t('slashMenu.loading')}</span>}
      {items?.length === 0 && !blocked && <span className="text-muted-foreground p-2">{emptyText ?? t('slashMenu.empty')}</span>}
      {items?.map((item, i) => [
        item.group && item.group !== items[i - 1]?.group && (
          <span key={`group:${item.group}`} className="text-muted-foreground px-2 pt-1.5 pb-0.5 text-[10px] font-medium">
            {item.group}
          </span>
        ),
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected={i === active}
          // 누르는 동안 입력창 포커스를 뺏지 않는다 (고른 뒤 바로 이어 쓰게)
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(i)}
          ref={(el) => void (i === active && el?.scrollIntoView({ block: 'nearest' }))}
          className={cn('hover:bg-accent flex flex-col rounded px-2 py-1.5 text-left', i === active && 'bg-accent')}
        >
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{item.label}</span>
            {item.argumentHint && <span className="text-muted-foreground truncate font-mono text-[10px]">{item.argumentHint}</span>}
            <span className="text-muted-foreground ml-auto shrink-0 pl-2 text-[10px]">{item.tag}</span>
          </span>
          {item.description && <span className="text-muted-foreground truncate">{item.description}</span>}
        </button>,
      ])}
    </div>
  )
}
