import { Trash2Icon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/ui/page'
import { useOffice } from '@/store'
import { EMPTY_SECRETARY, formatTokens } from '@shared/types'
import { ExampleChips, SecretaryComposer, SecretaryMessages } from './SecretaryChat'
import { SecretaryFace } from './SecretaryFace'
import { t } from '@shared/i18n'

// 비서 화면 (secretary-ui.md 2절): 대화 · 확인 카드 · 첨삭 비교 · 예시 질문 칩 · 입력창

function Empty() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
      <SecretaryFace className="size-12" />
      <span className="font-semibold">{t('secretary.empty.title')}</span>
      <p className="text-muted-foreground text-xs">{t('secretary.empty.desc')}</p>
      <ExampleChips className="flex-wrap justify-center" />
    </div>
  )
}

export function SecretaryPage() {
  // 쓰는 값만 꺼낸다 — 스냅샷마다 비서 상태가 새 객체로 와도 값이 같으면 화면 틀을 다시 그리지 않는다 (대화 목록은 SecretaryMessages가 따로)
  const { usageTodayTokens, isLimited, hasMessages } = useOffice(
    useShallow((s) => {
      const sec = s.secretary ?? EMPTY_SECRETARY
      return { usageTodayTokens: sec.usageTodayTokens, isLimited: sec.isLimited, hasMessages: sec.messages.length > 0 }
    }),
  )
  const handleClear = () => {
    if (window.confirm(t('secretary.clearConfirm'))) void window.office.secretaryClear()
  }
  return (
    <Page
      title={t('secretary.name')}
      description={t('secretary.page.desc')}
      className="flex flex-col overflow-hidden p-0 phone:p-0"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">{t('secretary.todayTokens', { n: formatTokens(usageTodayTokens) })}</span>
          <Button size="sm" variant="ghost" onClick={handleClear} disabled={!hasMessages}>
            <Trash2Icon /> {t('secretary.clear')}
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 phone:px-4">
        <SecretaryMessages className="mx-auto max-w-3xl" empty={<Empty />} />
      </div>
      <div className="flex flex-col gap-2 border-t px-6 py-3 phone:px-4">
        {isLimited && <p className="text-status-waiting text-xs">{t('secretary.limited')}</p>}
        {hasMessages && <ExampleChips className="mx-auto w-full max-w-3xl overflow-x-auto [scrollbar-width:none]" />}
        <div className="mx-auto w-full max-w-3xl">
          <SecretaryComposer />
        </div>
      </div>
    </Page>
  )
}
