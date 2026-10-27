import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Page } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { IS_WINDOWS, osText, trayPlace } from '@/lib/platform'
import { NotOnWindows } from '@/components/not-on-windows'
import { RemoteSection } from './RemoteSection'
import { ProviderSection } from './ProviderCards'
import { COMPANY_LEVELS, type DayNight, type HooksStatus, type Settings, type ThemeId } from '@shared/types'
import { officeOf } from '@shared/officeLevel'
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

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card flex max-w-3xl flex-col gap-3 rounded-xl border p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** 설정·꾸미기: 사무실 테마·낮밤·화분·수다 + 외부 직원 hooks 연결 */
export function SettingsPage() {
  const settings = useOffice((s) => s.settings)
  const [hooks, setHooks] = useState<HooksStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const update = (patch: Partial<Settings>) => void window.office.updateSettings(patch)
  const requestTour = useOffice((s) => s.requestTour)
  const hasPractice = useOffice((s) => Boolean(s.tutorial?.hasPractice))

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
    <Page title={t('nav.settings')} className="flex flex-col gap-4">
      <Section title={t('settings.language.title')} description={t('settings.language.desc')}>
        <NativeSelect value={settings.language} onChange={(e) => update({ language: e.target.value as LangSetting })} className="h-8 w-56 text-xs" aria-label={t('settings.language.label')}>
          <option value="auto">{t('settings.language.auto')}</option>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </NativeSelect>
      </Section>
      <Section title={t('provider.section.title')} description={t('provider.section.desc')}>
        <ProviderSection />
      </Section>
      <Section title={t('settingsPage.workMode.title')} description={t('settingsPage.workMode.desc')}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.isWorkMode} onChange={(e) => update({ isWorkMode: e.target.checked })} /> {t('settingsPage.workMode.toggle')}
        </label>
      </Section>
      <Section title={t('settingsPage.staffCapture.title')} description={t('settingsPage.staffCapture.desc')}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.isStaffCaptureOn} onChange={(e) => update({ isStaffCaptureOn: e.target.checked })} /> {t('settingsPage.staffCapture.toggle')}
        </label>
      </Section>
      <Section title={t('settingsPage.autoApprove.title')} description={t('settingsPage.autoApprove.desc')}>
        <AutoApproveSection />
      </Section>
      <Section title={t('rule.title')} description={t('rule.desc')}>
        <ApprovalRulesList />
      </Section>
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
          <input type="range" min={0} max={MAX_PLANTS} value={settings.plants} onChange={(e) => update({ plants: Number(e.target.value) })} className="w-48" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.isChatterOn} onChange={(e) => update({ isChatterOn: e.target.checked })} /> {t('settingsPage.props.chatter')}
        </label>
      </Section>
      <Section title={t('settingsPage.workHours.title')} description={t('settingsPage.workHours.desc')}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.workHours.isEnabled} onChange={(e) => update({ workHours: { ...settings.workHours, isEnabled: e.target.checked } })} /> {t('settingsPage.workHours.toggle')}
        </label>
        <div className="flex items-center gap-2 text-sm">
          <Input type="time" value={settings.workHours.start} onChange={(e) => update({ workHours: { ...settings.workHours, start: e.target.value } })} className="w-28" disabled={!settings.workHours.isEnabled} />
          ~
          <Input type="time" value={settings.workHours.end} onChange={(e) => update({ workHours: { ...settings.workHours, end: e.target.value } })} className="w-28" disabled={!settings.workHours.isEnabled} />
        </div>
      </Section>
      <Section
        title={trayPlace()}
        description={osText(t('settingsPage.tray.desc.mac'), t('settingsPage.tray.desc.win'))}
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.isTrayOn} onChange={(e) => update({ isTrayOn: e.target.checked })} /> {t('settingsPage.tray.toggle', { place: trayPlace() })}
        </label>
      </Section>
      {/* 개발 실행에서는 등록되지 않는다 (설치본만 로그인 항목에 들어간다) */}
      <Section title={t('settingsPage.login.title')} description={t('settingsPage.login.desc')}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.launchAtLogin} onChange={(e) => update({ launchAtLogin: e.target.checked })} /> {t('settingsPage.login.toggle')}
        </label>
      </Section>
      <Section title={t('settingsPage.remote.title')} description={t('settingsPage.remote.desc')}>
        <RemoteSection />
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
      <Section title={t('settingsPage.layout.title')} description={t('settingsPage.layout.desc')}>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => update({ layout: {} })} disabled={Object.keys(settings.layout).length === 0}>
          {t('settingsPage.layout.reset')}
        </Button>
      </Section>
      <Section
        title={t('settingsPage.hooks.title')}
        description={t('settingsPage.hooks.desc')}
      >
        <NotOnWindows reason={t('settingsPage.notOnWindows')} />
        <Button onClick={handleHooks} disabled={!hooks || isBusy || IS_WINDOWS} variant={hooks?.installed ? 'outline' : 'default'} className="w-fit">
          {hooks?.installed ? t('settingsPage.hooks.off') : t('settingsPage.hooks.on')}
        </Button>
      </Section>
      <Section
        title={t('settingsPage.askHook.title')}
        description={t('settingsPage.askHook.desc')}
      >
        <NotOnWindows reason={t('settingsPage.notOnWindows')} />
        <Button onClick={handleAskHook} disabled={!hooks || isBusy || IS_WINDOWS} variant={hooks?.isAskInstalled ? 'outline' : 'default'} className="w-fit">
          {hooks?.isAskInstalled ? t('settingsPage.askHook.off') : t('settingsPage.askHook.on')}
        </Button>
      </Section>
      {IS_DEV_BUILD && <LevelPreview />}
    </Page>
  )
}
