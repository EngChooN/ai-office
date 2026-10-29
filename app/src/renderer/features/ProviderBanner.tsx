import { useEffect } from 'react'
import { SparklesIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOffice } from '@/store'
import { providerBannerAction } from '@/lib/providerBanner'
import { PROVIDER_SECTION_ID, useProviders } from './ProviderCards'
import { requestSettingsSection } from './SettingsPage'
import { t } from '@shared/i18n'

// 0.14.0 안내 띠 (한 번만): 업데이트한 사람에게 GPT(Codex) 직원도 쓸 수 있다고 알린다. 닫거나 누르면 다시 띄우지 않는다

export function ProviderBanner() {
  const isLoaded = useOffice((s) => s.isLoaded)
  const isOnboarded = useOffice((s) => s.settings.isOnboarded)
  const isSeen = useOffice((s) => s.settings.isProviderBannerSeen)
  const setView = useOffice((s) => s.setView)
  // 띄울 수도 있는 사람만 Codex 상태를 묻는다 (조회에 몇 초 걸린다)
  const { status } = useProviders(isLoaded && isOnboarded && !isSeen)
  const action = providerBannerAction({ isLoaded, isOnboarded, isSeen, codexState: status?.codex.state ?? null })

  const markSeen = () => void window.office.updateSettings({ isProviderBannerSeen: true })
  useEffect(() => {
    if (action === 'markSeen') void window.office.updateSettings({ isProviderBannerSeen: true })
  }, [action])
  if (action !== 'show') return null

  const handleOpen = () => {
    markSeen()
    setView('settings')
    // 설정의 'AI·업무' 분류로 바꾼 뒤 'AI 공급자' 칸으로
    requestSettingsSection(PROVIDER_SECTION_ID)
  }
  return (
    <div className="bg-accent/50 flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm">
      <SparklesIcon className="size-4 shrink-0" />
      <span>{t('provider.banner.text')}</span>
      <Button size="sm" className="ml-auto" onClick={handleOpen}>
        {t('provider.banner.open')}
      </Button>
      <Button size="icon" variant="ghost" className="size-8" onClick={markSeen} aria-label={t('common.close')} title={t('common.close')}>
        <XIcon />
      </Button>
    </div>
  )
}
