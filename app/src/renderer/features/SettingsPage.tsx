import { useEffect, useLayoutEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Page } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { IS_WINDOWS, osText, trayPlace } from '@/lib/platform'
import { NotOnWindows } from '@/components/not-on-windows'
import { PcOnlyState } from '@/components/pc-only-state'
import { IS_MOBILE_SHELL } from '@/shell'
import { RemoteSection } from './RemoteSection'
import { PROVIDER_SECTION_ID, ProviderSection } from './ProviderCards'
import { COMPANY_LEVELS, type DayNight, type HooksStatus, type Settings, type ThemeId } from '@shared/types'
import { UI_THEME_GROUPS, type UiMode } from '@shared/uiTheme'
import { PET_OPACITY_RANGE, PET_SIZE_RANGE, petOpacity, petSize } from '@shared/deskPet'
import { officeOf } from '@shared/officeLevel'
import { officeStage } from '@/map/officeStage'
import { ApprovalRulesList, AutoApproveSection } from './AutoApprove'
import { UpdateSection } from './AppUpdate'
import { updateActions } from '@/lib/update'
import { LANG_NAMES, LANGS, t, type LangSetting, type TKey } from '@shared/i18n'

const THEMES: { value: ThemeId; labelKey: TKey; swatch: string[] }[] = [
  { value: 'wood', labelKey: 'settingsPage.theme.wood', swatch: ['#e8e8ee', '#d8b48a', '#a9b4cc'] },
  { value: 'mint', labelKey: 'settingsPage.theme.mint', swatch: ['#e2f0ec', '#cfb894', '#9cc4bc'] },
  { value: 'pastel', labelKey: 'settingsPage.theme.pastel', swatch: ['#f4ecf2', '#e8c8a8', '#c8b8dc'] },
  { value: 'night', labelKey: 'settingsPage.theme.night', swatch: ['#3a3e52', '#6a5240', '#4a4a6a'] },
]
const DAY_NIGHT: { value: DayNight; labelKey: TKey }[] = [
  { value: 'auto', labelKey: 'settingsPage.dayNight.auto' },
  { value: 'day', labelKey: 'settingsPage.dayNight.day' },
  { value: 'night', labelKey: 'settingsPage.dayNight.night' },
]
const MAX_PLANTS = 6
const UI_MODES: { value: UiMode; labelKey: TKey }[] = [
  { value: 'system', labelKey: 'settingsPage.uiMode.system' },
  { value: 'light', labelKey: 'settingsPage.uiMode.light' },
  { value: 'dark', labelKey: 'settingsPage.uiMode.dark' },
]

type Category = 'general' | 'ai' | 'office' | 'connect'
const CATEGORIES: { id: Category; labelKey: TKey }[] = [
  { id: 'general', labelKey: 'settingsPage.cat.general' },
  { id: 'ai', labelKey: 'settingsPage.cat.ai' },
  { id: 'office', labelKey: 'settingsPage.cat.office' },
  { id: 'connect', labelKey: 'settingsPage.cat.connect' },
]
/** 바로가기로 여는 섹션 → 그 섹션이 있는 분류 */
const SECTION_CATEGORY: Record<string, Category> = { [PROVIDER_SECTION_ID]: 'ai' }

/** 다른 화면에서 설정의 특정 섹션을 열 때 — 분류를 바꾼 뒤 그 섹션으로 스크롤한다 (설정 화면이 열려 있지 않으면 다음에 열릴 때) */
let pendingSection: string | null = null
const sectionListeners = new Set<() => void>()
export function requestSettingsSection(id: string) {
  pendingSection = id
  for (const fn of sectionListeners) fn()
}

/** 개발 서버(http://localhost)로 띄운 개발 빌드인지 — 설치본은 file://로 열린다 */
const IS_DEV_BUILD = window.location.protocol === 'http:'

/** 개발용: 사무실을 다른 레벨로 그려 본다. 회사 경험치·자금은 그대로다 */
function LevelPreview() {
  const company = useOffice((s) => s.company)
  const previewLevel = useOffice((s) => s.previewLevel)
  const setPreviewLevel = useOffice((s) => s.setPreviewLevel)
  return (
    <Section title={t('settingsPage.levelPreview.title')} description={t('settingsPage.levelPreview.desc', { level: company.level })}>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 20단계라 버튼 대신 선택 상자 */}
        <NativeSelect value={previewLevel ?? ''} onChange={(e) => setPreviewLevel(e.target.value ? Number(e.target.value) : null)} className="h-8 text-xs" aria-label={t('settingsPage.levelPreview.label')}>
          <option value="">{t('settingsPage.levelPreview.real', { level: company.level })}</option>
          {COMPANY_LEVELS.map((l, i) => (
            <option key={l.title} value={i + 1}>
              {t('settingsPage.levelPreview.option', { level: i + 1, title: l.title, floors: officeOf(i + 1).floors })}
            </option>
          ))}
        </NativeSelect>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPreviewLevel(null)} disabled={previewLevel === null}>
          {t('settingsPage.levelPreview.reset')}
        </Button>
      </div>
    </Section>
  )
}

const IX_PREVIEWS = ['handoff', 'review', 'help', 'celebrate', 'chat', 'coffee', 'wave'] as const

/** 개발용: 직원 상호작용 7종을 지도에서 바로 실행해 본다 (쿨다운 무시, 업무·저장에는 영향 없음) */
function InteractionPreview() {
  const setView = useOffice((s) => s.setView)
  const [isMissing, setMissing] = useState(false)
  const run = (kind: (typeof IX_PREVIEWS)[number]) => {
    setView('map')
    // 지도 장면이 깨어난 뒤 실행한다
    setTimeout(() => setMissing(!officeStage.mainScene()?.previewInteraction(kind)), 400)
  }
  return (
    <Section title={t('settingsPage.ixPreview.title')} description={t('settingsPage.ixPreview.desc')}>
      <div className="flex flex-wrap items-center gap-1.5">
        {IX_PREVIEWS.map((kind) => (
          <Button key={kind} size="sm" variant="outline" className="h-8 text-xs" onClick={() => run(kind)}>
            {t(`settingsPage.ixPreview.${kind}`)}
          </Button>
        ))}
      </div>
      {isMissing && <p className="text-muted-foreground text-xs">{t('settingsPage.ixPreview.missing')}</p>}
    </Section>
  )
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-card flex max-w-3xl scroll-mt-4 flex-col gap-3 rounded-xl border p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** 설정·꾸미기: 왼쪽 분류(일반·AI·업무·사무실·연결) → 오른쪽엔 고른 분류의 항목만 */
export function SettingsPage() {
  const settings = useOffice((s) => s.settings)
  const [hooks, setHooks] = useState<HooksStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const update = (patch: Partial<Settings>) => void window.office.updateSettings(patch)
  const requestTour = useOffice((s) => s.requestTour)
  const hasPractice = useOffice((s) => Boolean(s.tutorial?.hasPractice))
  const [category, setCategory] = useState<Category>('general')
  const [scrollTo, setScrollTo] = useState<string | null>(null)

  // 바로가기(requestSettingsSection): 그 섹션의 분류로 바꾸고, 그려진 뒤 스크롤
  useEffect(() => {
    const take = () => {
      if (!pendingSection) return
      const id = pendingSection
      pendingSection = null
      setCategory(SECTION_CATEGORY[id] ?? 'general')
      setScrollTo(id)
    }
    take()
    sectionListeners.add(take)
    return () => void sectionListeners.delete(take)
  }, [])
  useLayoutEffect(() => {
    if (!scrollTo) return
    document.getElementById(scrollTo)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setScrollTo(null)
  }, [scrollTo, category])

  useEffect(() => {
    void window.office.hooksStatus().then(setHooks)
  }, [])

  const handleHooks = async () => {
    if (!hooks) return
    setIsBusy(true)
    setHooks(await window.office.setHooksInstalled(!hooks.installed))
    setIsBusy(false)
  }

  const handleAskHook = async () => {
    if (!hooks) return
    setIsBusy(true)
    setHooks(await window.office.setAskHookInstalled(!hooks.isAskInstalled))
    setIsBusy(false)
  }

  return (
    <Page title={t('nav.settings')} className="phone:flex-col narrow:flex-col narrow:gap-4 flex gap-6">
      {/* 슬랙·디스코드처럼 왼쪽 분류 → 오른쪽엔 고른 분류만. 폰·좁은 본문은 위쪽 가로 탭(넘치면 가로로 밀어 본다) */}
      <nav className="phone:static phone:w-auto phone:flex-row phone:overflow-x-auto narrow:static narrow:w-auto narrow:max-w-full narrow:flex-row narrow:overflow-x-auto narrow:p-1 narrow:-m-1 sticky top-0 flex w-40 shrink-0 flex-col gap-1 self-start" aria-label={t('nav.settings')}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            aria-current={category === c.id ? 'page' : undefined}
            className={cn('text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-full px-3 py-1.5 text-left text-sm whitespace-nowrap', category === c.id && 'bg-accent text-foreground font-semibold')}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </nav>
      {/* h-fit: 스크롤 영역 높이로 늘어나면 카드가 열 밖으로 넘쳐 아래 여백이 스크롤 끝에 안 잡힌다 */}
      <div className="flex h-fit min-w-0 flex-1 flex-col gap-4">
        {category === 'general' && (
          <>
            <Section title={t('settings.language.title')} description={t('settings.language.desc')}>
              <NativeSelect value={settings.language} onChange={(e) => update({ language: e.target.value as LangSetting })} className="h-8 w-full max-w-56 text-xs" aria-label={t('settings.language.label')}>
                <option value="auto">{t('settings.language.auto')}</option>
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {LANG_NAMES[l]}
                  </option>
                ))}
              </NativeSelect>
            </Section>
            <Section title={t('settingsPage.uiMode.title')} description={t('settingsPage.uiMode.desc')}>
              <div className="bg-muted flex w-fit max-w-full flex-wrap gap-1 rounded-[1.25rem] p-1" role="radiogroup" aria-label={t('settingsPage.uiMode.title')}>
                {UI_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={settings.uiMode === m.value}
                    disabled={IS_MOBILE_SHELL}
                    onClick={() => update({ uiMode: m.value })}
                    className={cn('text-muted-foreground focus-ring rounded-full px-4 py-1.5 text-xs whitespace-nowrap disabled:opacity-60', settings.uiMode === m.value && 'bg-card text-foreground font-semibold shadow-sm')}
                  >
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
              {/* 원격은 uiMode·uiTheme를 받지 않는다(main/remote/v2.ts) → 휴대폰에선 지금 값만 보여 준다 */}
              {IS_MOBILE_SHELL && <PcOnlyState />}
            </Section>
            <Section title={t('settingsPage.uiTheme.title')} description={t('settingsPage.uiTheme.desc')}>
              {UI_THEME_GROUPS.map((g) => (
                <div key={g.id} className="flex flex-col gap-2">
                  {/* 묶음이 하나면 제목 없이 */}
                  {UI_THEME_GROUPS.length > 1 && g.titleKey && <h3 className="text-sm font-semibold">{t(g.titleKey)}</h3>}
                  <div className="phone:grid-cols-2 narrow:grid-cols-2 @max-xs/page:grid-cols-1 grid grid-cols-3 gap-3" role="radiogroup" aria-label={t('settingsPage.uiTheme.title')}>
                    {g.themes.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={settings.uiTheme === theme.id}
                        disabled={IS_MOBILE_SHELL}
                        onClick={() => update({ uiTheme: theme.id })}
                        className={cn('enabled:hover:bg-accent/50 focus-ring flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left disabled:opacity-60', settings.uiTheme === theme.id && 'border-ring ring-ring ring-2')}
                      >
                        <span className="size-10 shrink-0 rounded-full border border-black/10" style={{ background: `linear-gradient(135deg, ${theme.swatchFrom}, ${theme.swatchTo})` }} />
                        <span className="truncate text-sm font-medium">{t(theme.labelKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {IS_MOBILE_SHELL && <PcOnlyState />}
            </Section>
            {/* 개발 실행에서는 등록되지 않는다 (설치본만 로그인 항목에 들어간다) */}
            <Section title={t('settingsPage.login.title')} description={t('settingsPage.login.desc')}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.launchAtLogin} onChange={(e) => update({ launchAtLogin: e.target.checked })} /> {t('settingsPage.login.toggle')}
              </label>
            </Section>
            {updateActions.isAvailable && (
              <Section title={t('update.section.title')} description={t('update.section.desc')}>
                <UpdateSection />
              </Section>
            )}
            <Section title={t('settingsPage.guide.title')} description={t('settingsPage.guide.desc')}>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => update({ isOnboarded: false })}>
                  {t('settingsPage.guide.onboarding')}
                </Button>
                <Button variant="outline" size="sm" onClick={requestTour}>
                  {t('settingsPage.guide.tour')}
                </Button>
                {hasPractice && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void window.office.tutorialCleanup()}>
                    {t('tutorial.done.cleanup')}
                  </Button>
                )}
              </div>
            </Section>
          </>
        )}
        {category === 'ai' && (
          <>
            <Section id={PROVIDER_SECTION_ID} title={t('provider.section.title')} description={t('provider.section.desc')}>
              <ProviderSection />
            </Section>
            <Section title={t('settingsPage.workMode.title')} description={t('settingsPage.workMode.desc')}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.isWorkMode} onChange={(e) => update({ isWorkMode: e.target.checked })} /> {t('settingsPage.workMode.toggle')}
              </label>
            </Section>
            <Section title={t('settingsPage.autoApprove.title')} description={t('settingsPage.autoApprove.desc')}>
              <AutoApproveSection />
            </Section>
            <Section title={t('rule.title')} description={t('rule.desc')}>
              <ApprovalRulesList />
            </Section>
            <Section title={t('settingsPage.staffCapture.title')} description={t('settingsPage.staffCapture.desc')}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.isStaffCaptureOn} onChange={(e) => update({ isStaffCaptureOn: e.target.checked })} /> {t('settingsPage.staffCapture.toggle')}
              </label>
            </Section>
            <Section title={t('settingsPage.secretaryWeb.title')} description={t('settingsPage.secretaryWeb.desc')}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.isSecretaryWebOn} onChange={(e) => update({ isSecretaryWebOn: e.target.checked })} /> {t('settingsPage.secretaryWeb.toggle')}
              </label>
            </Section>
            <Section title={t('settingsPage.hooks.title')} description={t('settingsPage.hooks.desc')}>
              <NotOnWindows reason={t('settingsPage.notOnWindows')} />
              {IS_MOBILE_SHELL ? (
                <PcOnlyState isOn={hooks?.installed} />
              ) : (
                <Button onClick={handleHooks} disabled={!hooks || isBusy || IS_WINDOWS} variant={hooks?.installed ? 'outline' : 'default'} className="w-fit">
                  {hooks?.installed ? t('settingsPage.hooks.off') : t('settingsPage.hooks.on')}
                </Button>
              )}
            </Section>
            <Section title={t('settingsPage.askHook.title')} description={t('settingsPage.askHook.desc')}>
              <NotOnWindows reason={t('settingsPage.notOnWindows')} />
              {IS_MOBILE_SHELL ? (
                <PcOnlyState isOn={hooks?.isAskInstalled} />
              ) : (
                <Button onClick={handleAskHook} disabled={!hooks || isBusy || IS_WINDOWS} variant={hooks?.isAskInstalled ? 'outline' : 'default'} className="w-fit">
                  {hooks?.isAskInstalled ? t('settingsPage.askHook.off') : t('settingsPage.askHook.on')}
                </Button>
              )}
            </Section>
          </>
        )}
        {category === 'office' && (
          <>
            <Section title={t('settingsPage.theme.title')}>
              <div className="flex flex-wrap gap-3">
                {THEMES.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => update({ theme: theme.value })}
                    className={cn('flex flex-col gap-2 rounded-lg border-2 p-2', settings.theme === theme.value ? 'border-primary' : 'border-transparent bg-muted/40')}
                  >
                    <div className="flex overflow-hidden rounded">
                      {theme.swatch.map((c) => (
                        <span key={c} className="h-8 w-8" style={{ background: c }} />
                      ))}
                    </div>
                    <span className="text-xs">{t(theme.labelKey)}</span>
                  </button>
                ))}
              </div>
            </Section>
            <Section title={t('settingsPage.dayNight.title')}>
              <div className="flex gap-2">
                {DAY_NIGHT.map((d) => (
                  <button key={d.value} type="button" onClick={() => update({ dayNight: d.value })} className={cn('rounded-md border px-3 py-1 text-xs', settings.dayNight === d.value && 'border-primary bg-accent')}>
                    {t(d.labelKey)}
                  </button>
                ))}
              </div>
            </Section>
            <Section title={t('settingsPage.props.title')}>
              <label className="flex items-center gap-3 text-sm">
                {t('settingsPage.props.plants', { n: settings.plants })}
                <input type="range" min={0} max={MAX_PLANTS} value={settings.plants} onChange={(e) => update({ plants: Number(e.target.value) })} className="w-full max-w-48" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.isChatterOn} onChange={(e) => update({ isChatterOn: e.target.checked })} /> {t('settingsPage.props.chatter')}
              </label>
            </Section>
            {IS_DEV_BUILD && <LevelPreview />}
            {IS_DEV_BUILD && <InteractionPreview />}
            <Section title={t('settingsPage.layout.title')} description={t('settingsPage.layout.desc')}>
              <Button variant="outline" size="sm" className="w-fit" onClick={() => update({ layout: {} })} disabled={Object.keys(settings.layout).length === 0}>
                {t('settingsPage.layout.reset')}
              </Button>
            </Section>
            <Section title={t('settingsPage.workHours.title')} description={t('settingsPage.workHours.desc')}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.workHours.isEnabled} onChange={(e) => update({ workHours: { ...settings.workHours, isEnabled: e.target.checked } })} /> {t('settingsPage.workHours.toggle')}
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Input type="time" value={settings.workHours.start} onChange={(e) => update({ workHours: { ...settings.workHours, start: e.target.value } })} className="w-28" disabled={!settings.workHours.isEnabled} />
                ~
                <Input type="time" value={settings.workHours.end} onChange={(e) => update({ workHours: { ...settings.workHours, end: e.target.value } })} className="w-28" disabled={!settings.workHours.isEnabled} />
              </div>
            </Section>
          </>
        )}
        {category === 'connect' && (
          <>
            <Section title={t('settingsPage.remote.title')} description={t('settingsPage.remote.desc')}>
              <RemoteSection />
            </Section>
            <Section title={trayPlace()} description={osText(t('settingsPage.tray.desc.mac'), t('settingsPage.tray.desc.win'))}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.isTrayOn} onChange={(e) => update({ isTrayOn: e.target.checked })} /> {t('settingsPage.tray.toggle', { place: trayPlace() })}
              </label>
            </Section>
            {!IS_MOBILE_SHELL && (
              <Section title={t('deskPet.setting')} description={t('deskPet.settingHint')}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={settings.isDeskPetOn} onChange={(e) => update({ isDeskPetOn: e.target.checked })} /> {t('deskPet.setting')}
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{t('deskPet.size')}</span>
                  <input type="range" min={PET_SIZE_RANGE.min} max={PET_SIZE_RANGE.max} step={PET_SIZE_RANGE.step} value={petSize(settings.deskPetSize)} onChange={(e) => update({ deskPetSize: Number(e.target.value) })} className="w-full max-w-48" />
                  <span className="text-muted-foreground w-14 tabular-nums">{petSize(settings.deskPetSize)}px</span>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{t('deskPet.opacity')}</span>
                  <input type="range" min={PET_OPACITY_RANGE.min} max={PET_OPACITY_RANGE.max} step={PET_OPACITY_RANGE.step} value={petOpacity(settings.deskPetOpacity)} onChange={(e) => update({ deskPetOpacity: Number(e.target.value) })} className="w-full max-w-48" />
                  <span className="text-muted-foreground w-14 tabular-nums">{petOpacity(settings.deskPetOpacity)}%</span>
                </label>
                {window.officeDeskPet && (
                  <div className="flex items-center gap-3 text-sm">
                    <Button size="sm" variant="outline" onClick={() => void window.officeDeskPet?.summon()}>
                      {t('deskPet.summon')}
                    </Button>
                    <span className="text-muted-foreground text-xs">{t('deskPet.summonHint')}</span>
                  </div>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
