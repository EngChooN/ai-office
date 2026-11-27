import { useEffect, useMemo, useState } from 'react'
import { MessageSquareIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { useOffice } from '@/store'
import type { QuickChatStats } from '@shared/types'
import { quickRoomId } from '@shared/quickChat'
import { fmtDate, t } from '@shared/i18n'
import { engineName, quickTitleOf, TEMP_TEXT, useQuickChats } from './QuickChat'
import { formatCost, formatTokens } from './status'

// 빠른 대화 관리 창: 개수·대략 용량·빠른 대화 사용량(업무 수당과 따로) + 골라서 지우기 (docs/specs/quick-chat-feasibility.md 삭제·용량)

/** 대략 용량 (KB 아래는 1KB로, 못 찾은 0은 0KB) */
const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : n > 0 ? `${Math.max(1, Math.round(n / 1024))}KB` : '0KB')

export function QuickManageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const chats = useQuickChats()
  const chatRoom = useOffice((s) => s.chatRoom)
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const [stats, setStats] = useState<QuickChatStats | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  // 열 때마다 새로 잰다 (닫으면 고른 것도 비운다)
  useEffect(() => {
    if (!open) {
      setPicked(new Set())
      return
    }
    let isLive = true
    window.office
      .quickChatStats()
      .then((v) => isLive && setStats(v))
      .catch(() => isLive && setStats(null))
    return () => {
      isLive = false
    }
  }, [open])
  // 다른 곳에서 지워진 대화는 고른 목록에서 뺀다
  const ids = useMemo(() => new Set(chats.map((s) => s.id)), [chats])
  const selected = [...picked].filter((id) => ids.has(id))
  const isAll = chats.length > 0 && selected.length === chats.length
  const totalSize = chats.reduce((sum, s) => sum + (stats?.sizes[s.id] ?? 0), 0)
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const removePicked = async () => {
    if (!selected.length || !window.confirm(t('quick.manage.confirm', { count: selected.length }))) return
    setIsDeleting(true)
    let failed = 0
    for (const id of selected) {
      try {
        await window.office.deleteQuickChat(id)
        if (chatRoom === quickRoomId(id)) setChatRoom(null)
      } catch {
        failed += 1
      }
    }
    setIsDeleting(false)
    setPicked(new Set())
    if (failed) showToast(t('quick.deleteFailed'))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('quick.manage.title')}</DialogTitle>
          <DialogDescription>{t('quick.manage.summary', { count: chats.length, size: stats ? fmtSize(totalSize) : '…' })}</DialogDescription>
        </DialogHeader>
        <div className="bg-muted/60 flex flex-col gap-0.5 rounded-lg px-3 py-2">
          <span className="text-xs font-medium">{t('quick.manage.usage')}</span>
          <span className="text-sm tabular-nums">
            {stats
              ? t('quick.manage.usageValue', { cost: formatCost(stats.usage.costUsd), tokensIn: formatTokens(stats.usage.tokensIn), tokensOut: formatTokens(stats.usage.tokensOut) })
              : '…'}
          </span>
          <span className="text-muted-foreground text-[11px]">{t('quick.manage.usageHint')}</span>
        </div>
        <div className="flex flex-col">
          <label className="text-muted-foreground flex items-center gap-2 border-b px-1 pb-1.5 text-xs">
            <input type="checkbox" checked={isAll} disabled={!chats.length} onChange={() => setPicked(isAll ? new Set() : new Set(chats.map((s) => s.id)))} />
            {t('quick.manage.selectAll')}
          </label>
          <ul className="max-h-80 overflow-y-auto">
            {chats.map((s) => (
              <li key={s.id}>
                <label className={cn('hover:bg-accent/60 flex items-center gap-2 rounded-md px-1 py-1.5 text-sm', picked.has(s.id) && 'bg-accent/40')}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="min-w-0 flex-1 truncate">{quickTitleOf(s)}</span>
                  <span className={cn('shrink-0 text-[11px] font-medium', TEMP_TEXT)}>{engineName(s.provider)}</span>
                  <span className="text-muted-foreground w-12 shrink-0 text-right text-[11px] tabular-nums">{fmtDate(s.quickClosedAt ?? s.hiredAt, { month: 'numeric', day: 'numeric' })}</span>
                  <span className="text-muted-foreground w-14 shrink-0 text-right text-[11px] tabular-nums">{stats ? fmtSize(stats.sizes[s.id] ?? 0) : '…'}</span>
                  {/* 방 목록엔 최근 몇 개만 보이므로 오래된 대화는 여기서 연다 */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-7 shrink-0 p-0"
                    onClick={(e) => {
                      e.preventDefault()
                      setChatRoom(quickRoomId(s.id))
                      onOpenChange(false)
                    }}
                    title={t('quick.manage.open')}
                    aria-label={t('quick.manage.open')}
                  >
                    <MessageSquareIcon />
                  </Button>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          {/* 고른 게 없을 때 꺼진 붉은 단추는 다크 모드에서 글씨가 안 읽혀 테두리 단추로 둔다 */}
          <Button variant={selected.length ? 'destructive' : 'outline'} disabled={!selected.length || isDeleting} onClick={() => void removePicked()}>
            <Trash2Icon /> {t('quick.manage.delete', { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
