import { HeartIcon } from 'lucide-react'
import { t } from '@shared/i18n'

const DONATE_URL = 'https://fairy.hada.io/'

/** 사이드바 '후원하기' — 대표의 후원 페이지를 기본 브라우저로 연다 (앱 창의 setWindowOpenHandler가 https 주소를 밖으로 넘긴다) */
export function DonateButton() {
  return (
    <button
      type="button"
      onClick={() => window.open(DONATE_URL)}
      className="text-muted-foreground hover:bg-accent/60 hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs"
    >
      <HeartIcon className="size-3.5 shrink-0 text-rose-500" />
      <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={t('sidebar.donate')}>
        {t('sidebar.donate')}
      </span>
    </button>
  )
}
