// 바깥 UI 화면 모드·색 테마: 기본값·저장값 정리·모드 해석·첫 페인트 스크립트 단위 테스트 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { DEFAULT_UI_MODE, DEFAULT_UI_THEME, resolveMode, sanitizeUi, UI_MODES, UI_THEME_CACHE_KEY, UI_THEME_GROUPS, UI_THEME_IDS, type UiMode } from '../src/shared/uiTheme.ts'
import { DEFAULT_SETTINGS, withSettingsDefaults } from '../src/shared/types.ts'
import { DICT } from '../src/shared/i18n/dict/index.ts'
import { LANGS } from '../src/shared/i18n/index.ts'

test('기본값: 기기 설정 따르기 + 라벤더', () => {
  assert.equal(DEFAULT_SETTINGS.uiMode, 'system')
  assert.equal(DEFAULT_SETTINGS.uiTheme, 'lavender')
})

test('옛 설정(칸 없음)은 기본값으로, 모르는 값도 기본값으로', () => {
  const old = withSettingsDefaults({ theme: 'mint' })
  assert.equal(old.uiMode, DEFAULT_UI_MODE)
  assert.equal(old.uiTheme, DEFAULT_UI_THEME)
  assert.equal(old.theme, 'mint')
  const bad = withSettingsDefaults({ uiMode: 'neon' as UiMode, uiTheme: 'gold' as never })
  assert.deepEqual([bad.uiMode, bad.uiTheme], ['system', 'lavender'])
  assert.deepEqual(sanitizeUi({ uiMode: 'dark', uiTheme: 'sage' }), { uiMode: 'dark', uiTheme: 'sage' })
  assert.deepEqual(sanitizeUi(null), { uiMode: 'system', uiTheme: 'lavender' })
})

test('resolveMode: 3모드 × 기기 다크 여부', () => {
  assert.equal(resolveMode('system', true), 'dark')
  assert.equal(resolveMode('system', false), 'light')
  for (const d of [true, false]) {
    assert.equal(resolveMode('light', d), 'light')
    assert.equal(resolveMode('dark', d), 'dark')
  }
})

test('테마 목록: id 중복 없음, 기본 테마 포함, 4개 언어 이름', () => {
  assert.equal(new Set(UI_THEME_IDS).size, UI_THEME_IDS.length)
  assert.ok(UI_THEME_IDS.includes(DEFAULT_UI_THEME))
  for (const th of UI_THEME_GROUPS.flatMap((g) => g.themes)) {
    const entry = DICT[th.labelKey] as Record<string, string>
    for (const l of LANGS) assert.ok(entry?.[l], `${th.labelKey} ${l}`)
  }
})

test('index.html 첫 페인트 스크립트가 resolveMode·sanitizeUi와 같은 답을 낸다', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const src = /<script id="ui-theme-boot">([\s\S]*?)<\/script>/.exec(html)?.[1]
  assert.ok(src)
  assert.ok(src.includes(UI_THEME_CACHE_KEY))
  // 스크립트 안 테마 목록이 UI_THEME_IDS와 같아야 한다
  assert.ok(src.includes(UI_THEME_IDS.join('|')))
  const run = (cached: string | null, prefersDark: boolean) => {
    const dataset: Record<string, string> = {}
    const env = {
      localStorage: { getItem: () => cached },
      window: { matchMedia: () => ({ matches: prefersDark }) },
      document: { documentElement: { dataset, style: {} as Record<string, string> } },
    }
    new Function('localStorage', 'window', 'document', src)(env.localStorage, env.window, env.document)
    return dataset
  }
  for (const mode of [...UI_MODES, 'weird']) {
    for (const theme of [...UI_THEME_IDS, 'weird']) {
      for (const dark of [true, false]) {
        const got = run(JSON.stringify({ mode, theme }), dark)
        const want = sanitizeUi({ uiMode: mode, uiTheme: theme })
        assert.deepEqual([got.mode, got.theme], [resolveMode(want.uiMode, dark), want.uiTheme], `${mode}/${theme}/${dark}`)
      }
    }
  }
  assert.deepEqual(run(null, true), { mode: 'dark', theme: 'lavender' })
  assert.deepEqual(run('{broken', false), { mode: 'light', theme: 'lavender' })
})

// ── index.css 토큰 세트 검사 (gen.mjs와 같은 WCAG 공식) ──
// :root는 라벤더 다크 폴백과 같은 블록이라 세트가 값을 빼먹으면 다크 값이 라이트로 새어 든다 → 세트마다 직접 정의해야 한다
const CSS = fs.readFileSync(new URL('../src/renderer/index.css', import.meta.url), 'utf8')
const SETS = [...CSS.matchAll(/\[data-theme='(\w+)'\]\[data-mode='(light|dark)'\]\s*\{([^}]*)\}/g)].map(([, theme, mode, body]) => ({
  theme,
  mode,
  token: (k: string) => new RegExp(`--${k}:\\s*(#[0-9A-Fa-f]{6})\\b`).exec(body)?.[1],
}))
const REQUIRED = ['background', 'foreground', 'card', 'primary', 'primary-foreground', 'destructive', 'destructive-foreground', 'spark-from', 'grad-primary-end', 'accent-a', 'status-waiting']
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => ((v /= 255), v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** CSS color-mix(in srgb, a p, b) */
const mix = (a: string, b: string, p: number) => '#' + rgb(a).map((v, i) => Math.round(v * p + rgb(b)[i] * (1 - p)).toString(16).padStart(2, '0')).join('')
const HOVER_P = Number(/--destructive-hover:\s*color-mix\(in srgb, var\(--destructive\) (\d+)%/.exec(CSS)?.[1]) / 100

test('index.css: 모든 테마 × 라이트·다크 세트가 있고 필수 토큰을 직접 정의한다', () => {
  for (const id of UI_THEME_IDS) for (const mode of ['light', 'dark']) assert.ok(SETS.some((s) => s.theme === id && s.mode === mode), `${id}-${mode} 세트 없음`)
  for (const s of SETS) for (const k of REQUIRED) assert.ok(s.token(k), `${s.theme}-${s.mode}: --${k} 없음`)
  // hover 토큰: 모드별 섞는 색이 정의돼 있어야 한다
  assert.match(CSS, /\[data-mode='light'\]\s*\{[^}]*--hover-mix:\s*#000000/)
  assert.match(CSS, /:root\s*\{[^}]*--hover-mix:\s*#FFFFFF/)
  assert.ok(HOVER_P > 0 && HOVER_P < 1)
})

test('index.css: 주·위험 버튼 글자 대비가 평소·hover 모두 4.5:1 이상', () => {
  const MIN = 4.5
  for (const s of SETS) {
    const t = (k: string) => s.token(k)!
    const name = `${s.theme}-${s.mode}`
    const hoverMix = s.token('primary-hover-mix') ?? (s.mode === 'light' ? '#000000' : '#FFFFFF')
    const dangerMix = s.mode === 'light' ? '#000000' : '#FFFFFF'
    for (const end of [t('spark-from'), t('grad-primary-end')]) {
      assert.ok(contrast(t('primary-foreground'), end) >= MIN, `${name} 주 버튼 ${end}`)
      assert.ok(contrast(t('primary-foreground'), mix(end, hoverMix, HOVER_P)) >= MIN, `${name} 주 버튼 hover ${end}`)
    }
    assert.ok(contrast(t('destructive-foreground'), t('destructive')) >= MIN, `${name} 위험 버튼`)
    assert.ok(contrast(t('destructive-foreground'), mix(t('destructive'), dangerMix, HOVER_P)) >= MIN, `${name} 위험 버튼 hover`)
    for (const k of ['accent-a', 'status-waiting']) assert.ok(contrast(t(k), t('card')) >= MIN, `${name} ${k} on card`)
  }
})
