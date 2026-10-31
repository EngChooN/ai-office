import { useEffect, useState } from 'react'
import { ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { MOD_KEY } from '@/lib/platform'
import { useOffice } from '@/store'
import { ExampleChips, SecretaryComposer, SecretaryMessages } from './SecretaryChat'
import { EMPTY_SECRETARY } from '@shared/types'
import { SecretaryFace } from './SecretaryFace'
import { t } from '@shared/i18n'

// ⌘K 빠른 창 (secretary-ui.md 4-6): 어느 화면에서나 묻는다. 조회·사용법은 여기서 끝나고,
// 바꾸는 일(확인 카드)은 작은 창에서 실행하지 않고 비서 화면으로 넘긴다 — 대화는 비서 화면과 같은 대화

export function QuickSecretary() {
  const isOpen = useOffice((s) => s.isQuickSecretaryOpen)
  const setOpen = useOffice((s) => s.setQuickSecretaryOpen)
  const setView = useOffice((s) => s.setView)
  const [since, setSince] = useState(0)
  useEffect(() => {
    if (isOpen) setSince(Date.now())
  }, [isOpen])
  // 참·거짓만 꺼낸다 (스냅샷마다 빠른 창 전체를 다시 그리지 않게)
  const hasCard = useOffice((s) => (s.secretary ?? EMPTY_SECRETARY).messages.some((m) => m.ts >= since && m.card))
  const goSecretary = () => {
    setOpen(false)
    setView('secretary')
  }
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-3">
        <DialogTitle className="flex items-center gap-2 text-base">
          <SecretaryFace className="size-7" /> {t('secretary.name')}
          <kbd className="text-muted-foreground ml-1 rounded border px-1 text-[10px] font-normal">{MOD_KEY}K</kbd>
        </DialogTitle>
        <DialogDescription className="sr-only">{t('secretary.askOrTell')}</DialogDescription>
        <SecretaryComposer autoFocus />
        {hasCard ? (
          <div className="bg-card flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <span className="flex-1">{t('secretary.quick.cardMade')}</span>
            <Button size="sm" variant="outline" onClick={goSecretary}>
              {t('secretary.quick.continue')} <ArrowRightIcon />
            </Button>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            <SecretaryMessages
              since={since}
              empty={
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-xs">{t('secretary.quick.faq')}</span>
                  <ExampleChips className="flex-wrap" />
                </div>
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
