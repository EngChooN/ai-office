import { Markdown } from '@/components/markdown'
import { Page } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { APP_VERSION, releasesFor, type ChangeKind, type Release } from '@/lib/changelog'
import { useLang } from '@/lib/i18n'
import { t, type TKey } from '@shared/i18n'

const KIND_STYLE: Record<ChangeKind, { labelKey: TKey | null; className: string }> = {
  feature: { labelKey: 'updates.kind.feature', className: 'text-status-working' },
  improve: { labelKey: 'updates.kind.improve', className: 'text-primary' },
  fix: { labelKey: 'updates.kind.fix', className: 'text-status-waiting' },
  other: { labelKey: null, className: 'text-muted-foreground' },
}

/** 한 버전의 새 기능·개선·버그 수정 */
export function ReleaseNotes({ release }: { release: Release }) {
  return (
    <div className="flex flex-col gap-4">
      {release.sections.map((sec, i) => {
        const { labelKey, className } = KIND_STYLE[sec.kind]
        const heading = labelKey ? t(labelKey) : sec.title
        return (
          <section key={i} className="flex flex-col gap-1">
            {heading && <h3 className={cn('text-xs font-semibold', className)}>{heading}</h3>}
            <Markdown className="text-sm">{sec.body}</Markdown>
          </section>
        )
      })}
    </div>
  )
}

/** 업데이트 소식: 버전별 변경 이력 (CHANGELOG.md) */
export function UpdatesPage() {
  const lang = useLang()
  return (
    <Page title={t('nav.updates')} description={t('updates.desc', { version: APP_VERSION })}>
      <div className="flex max-w-3xl flex-col gap-4">
        {releasesFor(lang).map((r) => (
          <article key={r.version} className={cn('bg-card flex flex-col gap-4 rounded-xl border p-5', r.version === APP_VERSION && 'border-primary')}>
            <header className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-bold">v{r.version}</h2>
              {r.version === APP_VERSION && <span className="bg-primary text-primary-foreground rounded px-1.5 text-[10px] font-semibold">{t('updates.current')}</span>}
              <span className="text-muted-foreground text-xs">{[r.date, r.note].filter(Boolean).join(' · ')}</span>
            </header>
            <ReleaseNotes release={r} />
          </article>
        ))}
      </div>
    </Page>
  )
}
