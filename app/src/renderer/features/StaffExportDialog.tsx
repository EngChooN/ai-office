import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOffice } from '@/store'
import { t } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'

/** 직원 내보내기: 고용 직원을 여러 명 고르고 파일 하나로 저장한다 (main의 pack:exportStaff) */
export function StaffExportDialog({ open, onOpenChange, initialId }: { open: boolean; onOpenChange: (open: boolean) => void; initialId: string | null }) {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const [picked, setPicked] = useState<string[]>([])

  // 열 때마다 지금 보고 있는 직원부터 고른 상태로 시작한다
  useEffect(() => {
    if (open) setPicked(initialId ? [initialId] : [])
  }, [open, initialId])

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const handleSave = async () => {
    try {
      const r = await window.officePack?.exportStaff(picked)
      if (!r) return // 저장 대화상자를 취소했다
      window.alert(r.message)
      if (r.ok) onOpenChange(false)
    } catch {
      window.alert(t('pack.err.write'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pack.export.title')}</DialogTitle>
          <DialogDescription>{t('pack.export.hint')}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {staff.map((s) => (
            <li key={s.id}>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground text-xs">{roleLabel(s.role)}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter className="items-center">
          <span className="text-muted-foreground mr-auto text-xs">{t('pack.export.count', { count: picked.length })}</span>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={picked.length === 0}>
            {t('pack.export.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
