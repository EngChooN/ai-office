import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PackMarketItem } from '@shared/staffPack'
import { showToast } from '@/lib/toast'
import { t } from '@shared/i18n'

/** 기본 제공 직원 목록. [채용]은 파일 가져오기와 같은 검증·채용 길을 탄다 (main의 pack:hireMarket) */
export function StaffMarketDialog({ open, onOpenChange, onHired }: { open: boolean; onOpenChange: (open: boolean) => void; onHired: (staffId: string) => void }) {
  const [items, setItems] = useState<PackMarketItem[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (open) void window.officePack?.market().then(setItems)
  }, [open])

  const handleHire = async (id: string) => {
    const pack = window.officePack
    if (!pack) return
    setBusyId(id)
    try {
      const r = await pack.hireMarket(id)
      if (r.ok) showToast(r.message)
      else window.alert(r.message)
      if (r.ok) {
        onOpenChange(false)
        if (r.staffIds[0]) onHired(r.staffIds[0])
      }
    } catch {
      window.alert(t('pack.err.hire'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pack.market.title')}</DialogTitle>
          <DialogDescription>{t('pack.market.hint')}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {item.name}
                  <span className="text-muted-foreground text-xs font-normal">· {item.role}</span>
                </span>
                <span className="text-muted-foreground text-xs">{item.desc}</span>
              </div>
              <Button type="button" size="sm" onClick={() => void handleHire(item.id)} disabled={busyId !== null}>
                {t('pack.market.hire')}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
