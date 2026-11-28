// 특별 테마 "크리스마스": 다른 테마에 새지 않게·다크 전용 토큰·창 배경·리본 버튼 대비·장식 클릭 통과·움직임 줄이기·첫 페인트 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DARK_ONLY_THEMES, UI_THEME_IDS, windowBg } from '../src/shared/uiTheme.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const XMAS = read('src/renderer/theme-christmas.css')
const SCOPE = "[data-theme='christmas']"
const DARK = `${SCOPE}[data-mode='dark']`
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const CSS = stripComments(XMAS)

/** 최상위 규칙을 [머리말, 본문]으로 (중첩 한 단계: @media 안 규칙은 recurse로) */
function rules(css: string): [string, string][] {
  const out: [string, string][] = []
  let depth = 0
  let start = 0
  let head = ''
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) {
        head = css.slice(start, i).trim()
        start = i + 1
      }
      depth++
    } else if (css[i] === '}') {
      depth--
      if (depth === 0) {
        out.push([head, css.slice(start, i)])
        start = i + 1
      }
    }
  }
  return out
}

/** 선택자 목록을 맨 바깥 쉼표로만 나눈다 (:is(...) 안 쉼표는 그대로) */
function splitSelectors(sel: string) {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of sel) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  parts.push(cur.trim())
  return parts
}

/** @media 안까지 펼친 일반 규칙 [선택자, 본문, 감싼 @media] */
function flatRules(css: string, media = ''): [string, string, string][] {
  return rules(css).flatMap(([head, body]): [string, string, string][] => {
    if (head.startsWith('@media')) return flatRules(body, head)
    if (head.startsWith('@')) return []
    return [[head, body, media]]
  })
}

function block(css: string, selector: string) {
  const hit = rules(css).find(([h]) => h === selector)
  assert.ok(hit, `${selector} 블록 없음`)
  return hit[1]
}
const token = (body: string, name: string) => new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\b`).exec(body)?.[1]

// ── 대비 (WCAG 2.1 상대 휘도, uiTheme.test.mts와 같은 공식) ──
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => ((v /= 255), v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

test('스코프: 모든 규칙이 [data-theme=christmas] 아래 (@keyframes·@font-face만 예외, @media 안까지)', () => {
  const check = (css: string, where: string) => {
    for (const [head, body] of rules(css)) {
      if (head.startsWith('@font-face') || /^@(-webkit-)?keyframes\b/.test(head)) continue
      if (head.startsWith('@media')) {
        check(body, head)
        continue
      }
      assert.ok(!head.startsWith('@'), `${where}: 모르는 @규칙 ${head}`)
      for (const sel of splitSelectors(head)) assert.ok(sel.startsWith(SCOPE), `${where}: "${sel}"가 크리스마스 밖에도 걸린다`)
    }
  }
  check(CSS, '최상위')
})

test('다크 전용: 크리스마스는 DARK_ONLY_THEMES에 있고 라이트 세트가 없다', () => {
  assert.ok(UI_THEME_IDS.includes('christmas'))
  assert.ok(DARK_ONLY_THEMES.includes('christmas'))
  assert.doesNotMatch(CSS, /data-mode='light'/)
})

test('토큰: 다크 세트가 필수 토큰을 #RRGGBB로 직접 정의한다', () => {
  const body = block(CSS, DARK)
  const REQUIRED = ['background', 'foreground', 'card', 'primary', 'primary-foreground', 'destructive', 'destructive-foreground', 'spark-from', 'grad-primary-end', 'accent-a', 'status-waiting']
  for (const k of REQUIRED) assert.ok(token(body, `--${k}`), `--${k}가 없거나 #RRGGBB가 아님`)
})

test('창 배경: windowBg(christmas)가 --background·--foreground와 같다', () => {
  const body = block(CSS, DARK)
  const bg = windowBg('christmas', 'dark')
  assert.deepEqual(bg, { background: '#101A15', symbol: '#F6F1E6' })
  assert.equal(token(body, '--background')?.toUpperCase(), bg.background)
  assert.equal(token(body, '--foreground')?.toUpperCase(), bg.symbol)
})

test('리본 주 버튼: --xmas-btn-fg가 --xmas-btn·--xmas-btn-hover 위에서 4.5:1 이상', () => {
  const body = block(CSS, DARK)
  const c = (k: string) => {
    const v = token(body, `--${k}`)
    assert.ok(v, `--${k}가 없거나 #RRGGBB가 아님`)
    return v
  }
  for (const bg of ['xmas-btn', 'xmas-btn-hover']) {
    const r = contrast(c('xmas-btn-fg'), c(bg))
    assert.ok(r >= 4.5, `xmas-btn-fg on ${bg} = ${r.toFixed(2)}`)
  }
})

test('장식: 전구·눈·카드 눈모자·버튼 리본이 클릭을 가로채지 않는다 (pointer-events: none)', () => {
  const all = flatRules(CSS).filter(([, , media]) => !media)
  const parts = all.flatMap(([head, body]) => splitSelectors(head).map((sel) => [sel, body] as const))
  const decorations: [string, (sel: string) => boolean][] = [
    ['body::before (전구)', (s) => /\bbody::before$/.test(s)],
    ['body::after (눈)', (s) => /\bbody::after$/.test(s)],
    ['카드 ::before (눈모자)', (s) => /card/i.test(s) && /::before$/.test(s)],
    ['버튼 ::after (리본)', (s) => /(button|btn|primary)/i.test(s) && /::after$/.test(s)],
  ]
  for (const [name, match] of decorations) {
    const hits = parts.filter(([sel]) => match(sel))
    assert.ok(hits.length > 0, `${name} 규칙 없음`)
    assert.ok(
      hits.some(([, body]) => /pointer-events:\s*none/.test(body)),
      `${name}: pointer-events: none 없음 (${hits.map(([s]) => s).join(' | ')})`,
    )
  }
})

test('움직임 줄이기: 눈은 animation: none, 전구는 정지 이미지로', () => {
  const media = rules(CSS).filter(([h]) => h.startsWith('@media') && h.includes('prefers-reduced-motion: reduce'))
  assert.ok(media.length > 0, '움직임 줄이기 블록 없음')
  const inner = media.flatMap(([, body]) => flatRules(body))
  const of = (re: RegExp) => inner.filter(([head]) => splitSelectors(head).some((s) => re.test(s)))
  const snow = of(/\bbody::after$/)
  assert.ok(snow.some(([, body]) => /animation:\s*none/.test(body)), '눈(body::after)에 animation: none 없음')
  const lights = of(/\bbody::before$/)
  assert.ok(lights.length > 0, '움직임 줄이기 블록에 전구(body::before) 규칙 없음')
  assert.ok(lights.some(([, body]) => /background(-image)?\s*:/.test(body)), '전구(body::before)를 정지 이미지로 바꾸는 background 없음')
})

test('첫 페인트: index·remote 스크립트가 christmas를 받고 모드 설정과 상관없이 다크로', () => {
  for (const file of ['index.html', 'remote.html']) {
    const src = /<script id="ui-theme-boot">([\s\S]*?)<\/script>/.exec(read(file))?.[1]
    assert.ok(src, `${file}: ui-theme-boot 스크립트 없음`)
    assert.match(src, /christmas/, `${file}: 테마 목록에 christmas 없음`)
    for (const mode of ['light', 'dark', 'system']) {
      for (const prefersDark of [true, false]) {
        const dataset: Record<string, string> = {}
        const env = {
          localStorage: { getItem: () => JSON.stringify({ mode, theme: 'christmas' }) },
          window: { matchMedia: () => ({ matches: prefersDark }) },
          document: { documentElement: { dataset, style: {} as Record<string, string> } },
        }
        new Function('localStorage', 'window', 'document', src)(env.localStorage, env.window, env.document)
        assert.deepEqual([dataset.theme, dataset.mode], ['christmas', 'dark'], `${file} ${mode}/${prefersDark}`)
      }
    }
  }
})

test('불러오기: main.tsx가 theme-christmas.css를 import한다', () => {
  assert.match(read('src/renderer/main.tsx'), /import\s+['"]\.\/theme-christmas\.css['"]/)
})
