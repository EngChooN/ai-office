// 특별 테마 "레트로": 다른 테마에 새지 않게·토큰 누락·첫 페인트 목록·글자 대비·글자 크기 대응표·움직임 줄이기·비상구 — npm test
// 설계: docs/design-refresh/special-theme/impl-plan.md 2절
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { DARK_ONLY_THEMES, resolveMode, sanitizeUi, themeMode, UI_MODES, UI_THEME_IDS, windowBg, WINDOW_BG } from '../src/shared/uiTheme.ts'
import { DEFAULT_LOG_FONT_SIZE, LOG_FONT_SIZES, logFontSizes, logFontStep, RETRO_LOG_FONT_SIZES, sanitizeLogFont } from '../src/renderer/lib/logFont.ts'

const root = new URL('../', import.meta.url).pathname
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const RETRO = read('src/renderer/theme-retro.css')
const BASE = read('src/renderer/index.css')
const SCOPE = "[data-theme='retro']"
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

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

function block(css: string, selector: string) {
  const hit = rules(stripComments(css)).find(([h]) => h === selector)
  assert.ok(hit, `${selector} 블록 없음`)
  return hit[1]
}
const tokenNames = (body: string) => new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
const token = (body: string, name: string) => new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\b`).exec(body)?.[1]

test('스코프: 모든 규칙이 [data-theme=retro] 아래 (글꼴 등록만 예외, @media 안까지)', () => {
  const check = (css: string, where: string) => {
    for (const [head, body] of rules(css)) {
      if (head.startsWith('@font-face')) continue
      if (head.startsWith('@media')) {
        check(body, head)
        continue
      }
      assert.ok(!head.startsWith('@'), `${where}: 모르는 @규칙 ${head}`)
      for (const sel of splitSelectors(head)) assert.ok(sel.startsWith(SCOPE), `${where}: "${sel}"가 레트로 밖에도 걸린다`)
    }
  }
  check(stripComments(RETRO), '최상위')
  // 글꼴 이름이 다른 테마 규칙에 쓰이지 않는다 (레트로를 고를 때만 내려받게)
  assert.doesNotMatch(BASE, /Galmuri/)
  // 키프레임 이름이 기존과 겹치지 않게 — 지금은 레트로 전용 움직임이 없다
  assert.doesNotMatch(RETRO, /@keyframes/)
})

const DARK = `${SCOPE}[data-mode='dark']`

test('다크 전용: 레트로를 고르면 모드 설정과 상관없이 다크, 다른 테마는 설정 그대로', () => {
  assert.deepEqual([...DARK_ONLY_THEMES], ['retro'])
  for (const mode of UI_MODES) {
    for (const dark of [true, false]) assert.equal(resolveMode(themeMode('retro', mode), dark), 'dark')
    assert.equal(themeMode('lavender', mode), mode)
  }
  // 라이트 세트를 만들지 않는다 (죽은 규칙 없게)
  assert.doesNotMatch(RETRO, /data-mode='light'/)
})

test('토큰 누락: 라벤더 세트의 토큰을 레트로 다크가 모두 직접 정의한다', () => {
  // 라벤더 다크는 :root와 같은 블록이라 이름은 라이트 세트에서 (두 세트의 토큰 이름은 같다)
  const lavender = tokenNames(block(BASE, "[data-theme='lavender'][data-mode='light']"))
  const retro = tokenNames(block(RETRO, DARK))
  for (const name of lavender) assert.ok(retro.has(name), `retro: ${name} 없음`)
})

test('테마 목록 동기화: 첫 페인트 스크립트(index·remote)에 레트로가 있다', () => {
  assert.ok(UI_THEME_IDS.includes('retro'))
  for (const file of ['index.html', 'remote.html']) assert.ok(read(file).includes(UI_THEME_IDS.join('|')), `${file} 테마 목록`)
})

test('창 배경: windowBg가 레트로 --background·--foreground와 같고, 다른 테마는 예전 값 그대로', () => {
  const body = block(RETRO, DARK)
  for (const mode of ['light', 'dark'] as const) {
    assert.equal(windowBg('retro', mode).background, token(body, '--background'))
    assert.equal(windowBg('retro', mode).symbol, token(body, '--foreground'))
    for (const id of UI_THEME_IDS.filter((x) => x !== 'retro')) assert.deepEqual(windowBg(id, mode), WINDOW_BG[mode])
  }
})

// ── 대비 (WCAG 2.1 상대 휘도) ──
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => ((v /= 255), v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

test('대비: 본문·보조·버튼·선택·경고 글자 4.5:1, 입력칸·버튼 경계 3:1 이상', () => {
  {
    const mode = 'dark'
    const body = block(RETRO, DARK)
    const c = (k: string) => {
      const v = token(body, `--${k}`)
      assert.ok(v, `${mode}: --${k}가 #RRGGBB가 아님`)
      return v
    }
    const text: [string, string][] = [
      ['foreground', 'background'],
      ['foreground', 'card'],
      ['foreground', 'surface-chrome'],
      ['foreground', 'surface-sidebar'],
      ['muted-foreground', 'card'],
      ['muted-foreground', 'background'],
      ['muted-foreground', 'muted'],
      ['primary-foreground', 'primary'],
      ['primary-foreground', 'retro-pri-hi'], // 주 버튼 hover
      ['destructive-foreground', 'destructive'],
      ['accent-foreground', 'accent'],
      ['foreground', 'retro-sel'], // 선택된 메뉴
      ['status-waiting', 'card'],
      ['status-error', 'card'],
      ['accent-a', 'card'],
      ['retro-code-fg', 'retro-code-bg'],
      ['retro-track-fg', 'retro-track'], // 스위치 OFF
      ['retro-on-fg', 'retro-on'], // 스위치 ON·체크 표시
    ]
    for (const [fg, bg] of text) assert.ok(contrast(c(fg), c(bg)) >= 4.5, `${mode}: ${fg} on ${bg} = ${contrast(c(fg), c(bg)).toFixed(2)}`)
    // 대기 숫자 배지(bg-status-waiting)는 레트로에서 노란 칸 + 진한 글자
    assert.ok(contrast(c('retro-wait-fg'), c('retro-wait')) >= 4.5, `${mode}: 대기 배지`)
    const edge: [string, string][] = [
      ['input', 'card'],
      ['input', 'background'],
      ['retro-out', 'primary'],
    ]
    for (const [a, b] of edge) assert.ok(contrast(c(a), c(b)) >= 3, `${mode}: ${a} vs ${b} = ${contrast(c(a), c(b)).toFixed(2)}`)
    // 스위치 손잡이(채움 또는 외곽선)가 꺼진·켜진 트랙 모두에서 3:1 이상으로 보인다
    for (const track of ['retro-track', 'retro-on']) {
      const best = Math.max(contrast(c('retro-knob'), c(track)), contrast(c('retro-out'), c(track)))
      assert.ok(best >= 3, `${mode}: 손잡이 vs ${track} = ${best.toFixed(2)}`)
    }
  }
})

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []))
}

test('글자 크기: 화면 코드의 text-[Npx]가 모두 레트로 대응표에 있다', () => {
  const used = new Set<string>()
  for (const f of walk(path.join(root, 'src/renderer'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) used.add(m[1])
  assert.ok(used.size > 0)
  for (const n of used) assert.ok(RETRO.includes(`.text-\\[${n.replace('.', '\\.')}px\\]`), `text-[${n}px]가 theme-retro.css 대응표에 없음`)
})

test('테두리 없애기: 화면 코드의 border-*-0(변형 포함)을 레트로 2px 규칙 뒤에서 다시 0으로 둔다', () => {
  const used = new Set<string>()
  for (const f of walk(path.join(root, 'src/renderer'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?<![\w-])((?:[a-z]+:)*border-(?:[xytblr]-)?0)(?![\w.-])/g)) used.add(m[1])
  assert.ok(used.size > 0)
  const css = stripComments(RETRO)
  const twoPx = css.indexOf(`${SCOPE} .border {`)
  for (const cls of used) {
    const at = css.indexOf(`.${cls.replaceAll(':', '\\:')}`)
    assert.ok(at > twoPx, `${cls}가 theme-retro.css 2px 규칙 뒤에 없음 — 레트로에서 테두리가 되살아남`)
  }
})

test('윈도우 창 버튼: 상단 바는 간격 테마와 무관한 44px로 창 버튼 높이(44)와 같다', () => {
  assert.match(read('src/renderer/App.tsx'), /<header className="[^"]*\bh-\[44px\]/)
  const main = read('src/main/index.ts')
  assert.equal([...main.matchAll(/height: 44\b/g)].length, 2)
})

test('움직임: 누르면 내려가는 효과는 움직임 줄이기 설정에서 꺼진다', () => {
  const media = rules(stripComments(RETRO)).find(([h]) => h.includes('prefers-reduced-motion: reduce'))
  assert.ok(media, '움직임 줄이기 블록 없음')
  assert.match(media[1], /transform:\s*none/)
  for (const [head, body] of rules(stripComments(RETRO))) {
    if (head.startsWith('@')) continue
    assert.doesNotMatch(body, /\banimation\s*:/, `${head}: 움직임은 줄이기 블록과 함께`)
  }
})

test('비상구: 저장값 retro는 그대로, 목록에 없는 값은 기본 테마로', () => {
  assert.equal(sanitizeUi({ uiMode: 'dark', uiTheme: 'retro' }).uiTheme, 'retro')
  assert.equal(sanitizeUi({ uiMode: 'dark', uiTheme: 'retro2' }).uiTheme, 'lavender')
})

test('기록 글자 크기: 레트로는 3단계, 저장값은 바꾸지 않고 가까운 칸으로 읽는다', () => {
  assert.deepEqual(logFontSizes('retro'), RETRO_LOG_FONT_SIZES)
  assert.deepEqual(logFontSizes('lavender'), LOG_FONT_SIZES)
  // 일반 → 레트로
  assert.deepEqual([12, 13, 14, 16, 18].map((n) => RETRO_LOG_FONT_SIZES[logFontStep(n, RETRO_LOG_FONT_SIZES)]), [12, 12, 15, 15, 15])
  // 레트로에서 고른 값 → 일반 (같은 거리면 작은 쪽)
  assert.deepEqual([12, 15, 24].map((n) => LOG_FONT_SIZES[logFontStep(n, LOG_FONT_SIZES)]), [12, 14, 18])
  assert.equal(sanitizeLogFont(24), 24)
  assert.equal(sanitizeLogFont(NaN), DEFAULT_LOG_FONT_SIZE)
  assert.equal(sanitizeLogFont(99), DEFAULT_LOG_FONT_SIZE)
})

test('글꼴: 파일 3개와 라이선스 원문을 함께 싣고, CSS가 그 파일만 가리킨다', () => {
  const dir = path.join(root, 'src/renderer/fonts/galmuri')
  assert.deepEqual(fs.readdirSync(dir).sort(), ['Galmuri11-Bold.woff2', 'Galmuri11.woff2', 'Galmuri14.woff2', 'OFL.md'])
  assert.match(fs.readFileSync(path.join(dir, 'OFL.md'), 'utf8'), /SIL Open Font License, Version 1\.1/)
  for (const m of RETRO.matchAll(/url\('([^']+)'\)/g)) assert.ok(fs.existsSync(path.join(root, 'src/renderer', m[1])), m[1])
  // 일본어는 굵은 글꼴에 가나가 없어 보통 굵기로, 중국어는 영문·숫자만 도트로
  assert.match(block(RETRO, `${SCOPE}[data-lang='ja']`), /--retro-bold:\s*'Galmuri11',/)
  assert.match(block(RETRO, `${SCOPE}[data-lang='zh']`), /--retro-body:\s*'Galmuri11 Latin'/)
})
