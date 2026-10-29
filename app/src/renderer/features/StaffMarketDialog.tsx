import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { marketItems, type PackMarketItem } from '@shared/staffPack'
import type { AiProvider } from '@shared/types'
import { defaultProvider } from '@shared/engineModel'
import { recommendedEngine } from '@shared/roleEngine'
import { useProviders } from './ProviderCards'
import { engineReason, isBothReady, ProviderPicker } from './ProviderPicker'
import { showToast } from '@/lib/toast'
import { t } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'

/** 기본 제공 직원 목록. 목록은 화면에서 만들고, [채용]은 파일 가져오기와 같은 검증·채용 길을 탄다 (OfficeApi.hireMarket — 휴대폰도 원격으로).
 * 두 엔진이 다 준비됐을 때만 항목마다 엔진을 고르고(직무 추천 엔진이 기본), 하나만 준비됐으면 그 엔진으로 채용한다 */
export function StaffMarketDialog({ open, onOpenChange, onHired }: { open: boolean; onOpenChange: (open: boolean) => void; onHired: (staffId: string) => void }) {
  // 순수 데이터라 PC를 거치지 않는다. 언어를 바꿨을 수 있어 열 때마다 만든다
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 열 때 다시 만든다
  const items = useMemo(() => marketItems(), [open])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, AiProvider>>({})
  const providers = useProviders(open)
  const isBoth = isBothReady(providers.status)
  // 상태를 아직 모르면 엔진을 보내지 않는다 (main이 준비된 엔진으로 정한다)
  const engineOf = (item: PackMarketItem): AiProvider | undefined =>
    isBoth ? picked[item.id] ?? recommendedEngine(item.role)?.provider ?? defaultProvider(providers.status) : providers.status ? defaultProvider(providers.status) : undefined

  useEffect(() => {
    if (!open) return
    setPicked({})
  }, [open])

  const handleHire = async (item: PackMarketItem) => {
    setBusyId(item.id)
    try {
      const r = await window.office.hireMarket(item.id, engineOf(item))
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
                  <span className="text-muted-foreground text-xs font-normal">· {roleLabel(item.role)}</span>
                </span>
                <span className="text-muted-foreground text-xs">{item.desc}</span>
                {isBoth && (
                  <div className="mt-1 flex flex-col gap-1">
                    <ProviderPicker status={providers.status} value={engineOf(item) ?? 'claude'} onChange={(p) => setPicked((m) => ({ ...m, [item.id]: p }))} role={item.role} />
                    {engineReason(item.role) && <span className="text-muted-foreground text-[11px]">{engineReason(item.role)}</span>}
                  </div>
                )}
              </div>
              <Button type="button" size="sm" onClick={() => void handleHire(item)} disabled={busyId !== null}>
                {t('pack.market.hire')}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
