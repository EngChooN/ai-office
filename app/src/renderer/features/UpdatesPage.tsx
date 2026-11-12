import { useState, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { DuoIcon } from '@/components/duo-icon'
import { Markdown } from '@/components/markdown'
import { MoreToggle } from '@/components/more-toggle'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { APP_VERSION, releasesFor, type ChangeSection, type Release } from '@/lib/changelog'
import { useLang } from '@/lib/i18n'
import { notifiableVersion, updateActions, useUpdateStore } from '@/lib/update'
import { summaryItems } from '@shared/changelogParse'
import type { DuoName } from '@shared/iconText'
import { fmtDate, t, type TKey } from '@shared/i18n'
import { RELEASES_PAGE_URL } from '@shared/updateCheck'
import { InstallButton, InstallConfirm, InstallError } from './AppUpdate'

type DetailKind = 'feature' | 'improve' | 'fix'
const DETAIL_KINDS: DetailKind[] = ['feature', 'improve', 'fix']

const KIND_STYLE: Record<DetailKind, { icon: DuoName; badgeKey: TKey; color: string; textClass: string }> = {
  feature: { icon: 'new', badgeKey: 'updates.badge.feature', color: 'var(--status-working)', textClass: 'text-status-working' },
  improve: { icon: 'improve', badgeKey: 'updates.badge.improve', color: 'var(--primary)', textClass: 'text-primary' },
  fix: { icon: 'bug', badgeKey: 'updates.badge.fix', color: 'var(--status-waiting)', textClass: 'text-status-waiting' },
}
const isDetailKind = (kind: string | null): kind is DetailKind => DETAIL_KINDS.includes(kind as DetailKind)

/** 이전 새 버전이 이보다 많으면 나머지는 접는다 */
const INCLUDED_VISIBLE = 4

const countBullets = (body: string) => body.split('\n').filter((l) => /^[-*] /.test(l)).length

/** 상세(새 기능·개선·버그 수정) 종류별 항목 수 */
function kindCounts(release: Release): Record<DetailKind, number> {
  const counts = { feature: 0, improve: 0, fix: 0 }
  for (const s of release.sections) if (isDetailKind(s.kind)) counts[s.kind] += countBullets(s.body)
  return counts
}

/** "11월 12일" — 올해가 아니면 연도까지 */
function shortDate(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return fmtDate(d, isThisYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' })
}

/** 새 기능·개선·수정 배지 — 글자는 본문색(대비), 아이콘·배경만 종류 색 */
function KindBadge({ kind, count }: { kind: DetailKind; count?: number }) {
  const { icon, badgeKey, color, textClass } = KIND_STYLE[kind]
  return (
    <span className="text-card-foreground inline-flex h-[22px] min-w-[66px] shrink-0 items-center gap-1 rounded-md pr-[7px] pl-[5px] text-[11.5px] font-semibold" style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, var(--card))` }}>
      <DuoIcon name={icon} size={14} className={textClass} />
      {t(badgeKey)}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </span>
  )
}

/** 머리줄 오른쪽 종류별 개수 */
function KindCounts({ release }: { release: Release }) {
  const counts = kindCounts(release)
  return (
    <span className="text-muted-foreground flex items-center gap-2.5 text-xs">
      {DETAIL_KINDS.filter((k) => counts[k] > 0).map((k) => (
        <span key={k} className="inline-flex items-center gap-0.5" title={t(KIND_STYLE[k].badgeKey)}>
          <DuoIcon name={KIND_STYLE[k].icon} size={14} className={KIND_STYLE[k].textClass} label={t(KIND_STYLE[k].badgeKey)} />
          <span className="tabular-nums">{counts[k]}</span>
        </span>
      ))}
    </span>
  )
}

/** 상세 섹션 — 종류 배지에 개수를 붙여 제목으로. 제목 없는 본문(기기별 차이·옛 형식)은 회색 상자로 맨 아래 */
function DetailSections({ sections, isUntrusted }: { sections: ChangeSection[]; isUntrusted: boolean }) {
  const titled = sections.filter((s) => s.kind !== 'summary' && (isDetailKind(s.kind) || s.title))
  const notes = sections.filter((s) => s.kind === 'other' && !s.title)
  return (
    <div className="flex flex-col gap-4">
      {titled.map((sec, i) => (
        <section key={i} className="flex flex-col gap-1.5">
          {isDetailKind(sec.kind) ? <KindBadge kind={sec.kind} count={countBullets(sec.body)} /> : <h3 className="text-muted-foreground text-xs font-semibold">{sec.title}</h3>}
          <Markdown className="text-sm" isUntrusted={isUntrusted}>{sec.body}</Markdown>
        </section>
      ))}
      {notes.map((sec, i) => (
        <Markdown key={`n${i}`} className="bg-muted text-muted-foreground rounded-md p-3 text-xs" isUntrusted={isUntrusted}>
          {sec.body}
        </Markdown>
      ))}
    </div>
  )
}

/**
 * 한 버전의 바뀐 점 (업데이트 소식·새 소식 창이 같이 쓴다).
 * '한눈에 보기'가 있으면 그것만 펼치고 상세는 접는다. 없는 옛 버전은 상세를 그대로 보인다
 */
export function ReleaseNotes({ release, isUntrusted = false }: { release: Release; isUntrusted?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const summary = release.sections.find((s) => s.kind === 'summary')
  if (!summary) return <DetailSections sections={release.sections} isUntrusted={isUntrusted} />

  const deviceNote = release.sections.find((s) => s.kind === 'other' && !s.title)
  const details = release.sections.filter((s) => s.kind !== 'summary' && s !== deviceNote)
  const total = details.reduce((n, s) => n + countBullets(s.body), 0)
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-[7px]">
        {summaryItems(summary.body).map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-[22px]">
            {isDetailKind(item.kind) && <KindBadge kind={item.kind} />}
            <Markdown className="min-w-0 flex-1" isUntrusted={isUntrusted}>{item.text}</Markdown>
          </li>
        ))}
      </ul>
      {deviceNote && <Markdown className="text-muted-foreground text-xs" isUntrusted={isUntrusted}>{deviceNote.body}</Markdown>}
      {details.length > 0 && (
        <>
          <MoreToggle open={isOpen} onToggle={() => setIsOpen((v) => !v)} moreLabel={t('updates.showAll', { n: total })} className="[&>button]:min-h-8" />
          {isOpen && <DetailSections sections={details} isUntrusted={isUntrusted} />}
        </>
      )}
    </div>
  )
}

function ReleaseHeader({ release, chip }: { release: Release; chip?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="text-lg font-bold">v{release.version}</h2>
      {chip}
      <span className="text-muted-foreground text-xs">{[release.date && shortDate(release.date), release.note].filter(Boolean).join(' · ')}</span>
      <span className="ml-auto max-sm:ml-0 max-sm:basis-full">
        <KindCounts release={release} />
      </span>
    </header>
  )
}

/** 지난 버전 한 줄 — 누르면 그 자리에서 펼친다 */
function ReleaseRow({ release, isUntrusted = false }: { release: Release; isUntrusted?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="bg-card rounded-xl border">
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((v) => !v)} className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left">
        <span className="font-semibold">v{release.version}</span>
        <span className="text-muted-foreground text-xs">{release.date && shortDate(release.date)}</span>
        <span className="ml-auto flex items-center gap-2">
          <KindCounts release={release} />
          {isOpen ? <ChevronDownIcon className="text-muted-foreground size-4" /> : <ChevronRightIcon className="text-muted-foreground size-4" />}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <ReleaseNotes release={release} isUntrusted={isUntrusted} />
        </div>
      )}
    </div>
  )
}

function Chip({ children, isMuted = false }: { children: ReactNode; isMuted?: boolean }) {
  return <span className={cn('rounded px-1.5 text-[10px] font-semibold', isMuted ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground')}>{children}</span>
}

/**
 * 아직 설치하지 않은 새 버전 — 맨 위 카드 하나. 여러 버전이 밀렸으면 최신은 요약, 이전 것은 한 줄로 묶는다 (설치는 한 번에 최신으로).
 * [나중에]로 건너뛴 버전이면 점선·회색 칩으로 힘을 뺀다. 휴대폰 앱·오프라인·최신이면 그리지 않는다
 */
function NewVersionCard() {
  const status = useUpdateStore((s) => s.status)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isAllIncluded, setIsAllIncluded] = useState(false)
  const releases = status?.news?.releases.filter((r) => r.version !== APP_VERSION) ?? []
  if (status?.state !== 'available' || !status.latest || !releases.length) return null

  const [top, ...included] = releases
  const isSkipped = notifiableVersion(status) === null
  const visibleIncluded = isAllIncluded || included.length <= INCLUDED_VISIBLE + 1 ? included : included.slice(0, INCLUDED_VISIBLE)
  const chip = isSkipped ? t('updates.new.skippedChip') : included.length ? t('updates.new.chipMany', { n: releases.length }) : t('updates.new.chip')
  const hint = isSkipped ? t('updates.new.skippedHint') : included.length ? t('updates.new.hintMany') : t('updates.new.hint')
  return (
    <article
      className={cn(
        'bg-card flex flex-col gap-4 rounded-xl p-5 max-sm:p-3.5',
        isSkipped ? 'border-border border-[1.5px] border-dashed' : 'border-primary border-[1.5px] bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--primary)_7%,var(--card))_0,var(--card)_96px)]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip isMuted={isSkipped}>{chip}</Chip>
        <span className="text-muted-foreground">{hint}</span>
      </div>
      <ReleaseHeader release={top} />
      <ReleaseNotes release={top} isUntrusted />
      {included.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold">{t('updates.new.alsoIncluded')}</h3>
          {visibleIncluded.map((r) => (
            <ReleaseRow key={r.version} release={r} isUntrusted />
          ))}
          {visibleIncluded.length < included.length && (
            <MoreToggle open={false} onToggle={() => setIsAllIncluded(true)} moreLabel={t('updates.new.moreIncluded', { n: included.length - visibleIncluded.length })} />
          )}
        </div>
      )}
      {status.news?.isCut && (
        <a href={RELEASES_PAGE_URL} target="_blank" rel="noreferrer" className="text-primary w-fit text-xs underline underline-offset-2">
          {t('updates.new.moreOnGithub')}
        </a>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4 max-sm:flex-col max-sm:items-stretch">
        {status.canInstall ? (
          <InstallButton variant={isSkipped ? 'outline' : undefined} onClick={() => setIsConfirmOpen(true)} />
        ) : (
          <Button variant={isSkipped ? 'outline' : 'default'} className="w-fit" onClick={updateActions.download}>
            {t('update.download')}
          </Button>
        )}
        <span className="text-muted-foreground text-xs">{t('updates.new.installLine', { current: status.current, latest: status.latest.version })}</span>
      </div>
      <InstallError />
      <InstallConfirm version={status.latest.version} open={isConfirmOpen} onOpenChange={setIsConfirmOpen} />
    </article>
  )
}

/** 업데이트 소식: 설치 전 새 버전 → 지금 버전 → 지난 버전(한 줄씩) */
export function UpdatesPage() {
  const lang = useLang()
  const hasNew = useUpdateStore((s) => s.status?.state === 'available' && !!s.status.news?.releases.some((r) => r.version !== APP_VERSION))
  const all = releasesFor(lang)
  // 지금 버전까지(개발 중 미정 항목 포함)는 카드, 그 뒤는 한 줄
  const currentIndex = Math.max(0, all.findIndex((r) => r.version === APP_VERSION))
  const cards = all.slice(0, currentIndex + 1)
  const past = all.slice(currentIndex + 1)
  return (
    <Page title={t('nav.updates')} description={t('updates.desc', { version: APP_VERSION })}>
      <div className="flex max-w-3xl flex-col gap-3">
        <NewVersionCard />
        {cards.map((r) => {
          const isCurrent = r.version === APP_VERSION
          return (
            <article key={r.version} className={cn('bg-card flex flex-col gap-4 rounded-xl border p-5 max-sm:p-3.5', isCurrent && !hasNew && 'border-primary')}>
              <ReleaseHeader release={r} chip={isCurrent && <Chip>{t('updates.current')}</Chip>} />
              <ReleaseNotes release={r} />
            </article>
          )
        })}
        {past.length > 0 && (
          <>
            <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs font-semibold">
              {t('updates.past')}
              <span className="flex-1 border-t" />
            </div>
            {past.map((r) => (
              <ReleaseRow key={r.version} release={r} />
            ))}
          </>
        )}
      </div>
    </Page>
  )
}
