// 방향별 theme-<이름>.css 생성기 — 색 변수 + 컴포넌트 모양만 바꾼다 (레이아웃 속성은 건드리지 않는다)
import fs from 'node:fs'
const OUT = '/Users/pc-2311001/flitto/poc/claude-office/docs/design-refresh/v3'

const D = [
  {
    key: 'cream',
    title: '크림 테라코타',
    radius: '14px',
    font: { w: 500, head: 650 },
    light: {
      bg: '#F8F3EA', fg: '#33291F', card: '#FFFFFF', muted: '#EFE7DA', mfg: '#75654F', accent: '#F1E6D6', border: '#E4D8C5', input: '#D8CAB4',
      primary: '#C9551F', pfg: '#FFFFFF', secondary: '#EFE7DA', sidebar: '#F2EADC', chrome: '#FBF7F0',
      hud: 'rgba(255,252,246,.94)', hudfg: '#33291F', hudborder: '#E4D8C5', glow: '#E2703A',
    },
    dark: {
      bg: '#1A1917', fg: '#F2EBE0', card: '#272421', muted: '#302C28', mfg: '#B3A898', accent: '#352F29', border: '#3A352F', input: '#46403A',
      primary: '#F08A4B', pfg: '#2A1608', secondary: '#302C28', sidebar: '#151413', chrome: '#1F1D1A',
      hud: 'rgba(39,36,33,.94)', hudfg: '#F2EBE0', hudborder: '#3A352F', glow: '#F08A4B',
    },
    shadow: { l: '0 6px 18px -6px rgba(120,80,40,.22), 0 1px 2px rgba(120,80,40,.10)', d: '0 8px 22px -8px rgba(0,0,0,.6)' },
    btnShape: '999px', // 기본 버튼은 알약
    borderW: '1px',
    extra: (m) => `
/* AI 느낌: 비서 버튼과 입력창에 따뜻한 숨쉬는 빛 */
header [data-slot=button].border { border-color: color-mix(in oklab, ${m.glow} 55%, var(--border)); animation: v3-breathe 3.6s ease-in-out infinite; }
[role=dialog] textarea:focus-visible { box-shadow: 0 0 0 4px color-mix(in oklab, ${m.glow} 22%, transparent); border-color: ${m.glow}; }
@keyframes v3-breathe { 0%,100% { box-shadow: 0 0 0 0 color-mix(in oklab, ${m.glow} 0%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in oklab, ${m.glow} 20%, transparent); } }
nav > button.bg-accent { box-shadow: inset 3px 0 0 ${m.glow}; }
`,
  },
  {
    key: 'blue',
    title: '블루 프로',
    radius: '8px',
    font: { w: 500, head: 600 },
    light: {
      bg: '#EEF1F6', fg: '#1B2230', card: '#FFFFFF', muted: '#E3E8F0', mfg: '#556176', accent: '#E1E8F6', border: '#D3DAE6', input: '#C3CCDB',
      primary: '#2F6BFF', pfg: '#FFFFFF', secondary: '#E3E8F0', sidebar: '#E8ECF3', chrome: '#F8FAFD',
      hud: 'rgba(255,255,255,.95)', hudfg: '#1B2230', hudborder: '#D3DAE6', glow: '#2F6BFF',
    },
    dark: {
      bg: '#0D1117', fg: '#E6EBF4', card: '#171D27', muted: '#1F2733', mfg: '#93A0B5', accent: '#1E2A3F', border: '#263040', input: '#2F3A4D',
      primary: '#5B8CFF', pfg: '#0A1530', secondary: '#1F2733', sidebar: '#0A0E14', chrome: '#10151D',
      hud: 'rgba(23,29,39,.95)', hudfg: '#E6EBF4', hudborder: '#263040', glow: '#5B8CFF',
    },
    shadow: { l: '0 1px 2px rgba(27,34,48,.06)', d: '0 1px 2px rgba(0,0,0,.4)' },
    btnShape: '8px',
    borderW: '1px',
    extra: (m) => `
/* AI 느낌: 도구 콘솔처럼 — 숫자는 고정폭, 진행 줄은 얇은 그라데이션, 포커스는 선명한 링 */
main [class*="1a1d28"] { font-variant-numeric: tabular-nums; }
main [class*="1a1d28"] .h-1\\.5, main [class*="1a1d28"] [class*="h-1"] { height: 3px; }
[role=dialog] { border-top: 2px solid ${m.glow}; }
[role=dialog] textarea { font-family: ui-monospace, 'SF Mono', Menlo, 'Apple SD Gothic Neo', monospace; font-size: 13px; }
[role=dialog] textarea:focus-visible { box-shadow: 0 0 0 3px color-mix(in oklab, ${m.glow} 28%, transparent); border-color: ${m.glow}; }
header [data-slot=button].border .text-muted-foreground { font-family: ui-monospace, 'SF Mono', Menlo, monospace; border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
nav > button.bg-accent { box-shadow: inset 2px 0 0 ${m.glow}; border-radius: 0 6px 6px 0; }
`,
  },
  {
    key: 'lavender',
    title: '라벤더 소프트',
    radius: '18px',
    font: { w: 500, head: 600 },
    light: {
      bg: '#F6F5FB', fg: '#221F33', card: '#FFFFFF', muted: '#ECEAF6', mfg: '#66627F', accent: '#E9E6FA', border: '#DEDAF0', input: '#CFCAE6',
      primary: '#6C5CE7', pfg: '#FFFFFF', secondary: '#ECEAF6', sidebar: '#EFEDF8', chrome: '#FBFAFF',
      hud: 'rgba(255,255,255,.92)', hudfg: '#221F33', hudborder: '#DEDAF0', glow: '#8B7BFF',
    },
    dark: {
      bg: '#14131C', fg: '#EDEBF8', card: '#201F2D', muted: '#292739', mfg: '#A7A3C4', accent: '#302D47', border: '#34314A', input: '#413E5C',
      primary: '#9B8CFF', pfg: '#1A1240', secondary: '#292739', sidebar: '#100F17', chrome: '#181723',
      hud: 'rgba(32,31,45,.92)', hudfg: '#EDEBF8', hudborder: '#34314A', glow: '#9B8CFF',
    },
    shadow: { l: '0 10px 28px -10px rgba(108,92,231,.28)', d: '0 10px 28px -10px rgba(0,0,0,.6)' },
    btnShape: '999px',
    borderW: '1px',
    extra: (m) => `
/* AI 느낌: 반짝이(sparkle) 그라데이션 — 주요 버튼, 비서 버튼, 활성 메뉴 */
[data-slot=button].bg-primary { background-image: linear-gradient(135deg, ${m.primary}, color-mix(in oklab, ${m.primary} 55%, #FF7AC6)); border: 0; box-shadow: 0 6px 16px -6px color-mix(in oklab, ${m.primary} 70%, transparent); }
header [data-slot=button].border { border-color: transparent; background: linear-gradient(var(--card), var(--card)) padding-box, linear-gradient(135deg, ${m.glow}, #FF7AC6) border-box; }
nav > button.bg-accent { background-image: linear-gradient(90deg, color-mix(in oklab, ${m.glow} 22%, transparent), transparent); border-radius: 999px; }
nav > button { border-radius: 999px; }
[role=dialog] { background-image: radial-gradient(120% 60% at 50% -10%, color-mix(in oklab, ${m.glow} 16%, transparent), transparent 70%); }
[role=dialog] textarea:focus-visible { box-shadow: 0 0 0 4px color-mix(in oklab, ${m.glow} 24%, transparent); border-color: ${m.glow}; }
`,
  },
  {
    key: 'forest',
    title: '포레스트 세이지',
    radius: '10px',
    font: { w: 500, head: 600 },
    light: {
      bg: '#F0F4EE', fg: '#1D2A22', card: '#FFFFFF', muted: '#E3EBE1', mfg: '#53665A', accent: '#DCEAD9', border: '#D0DDCD', input: '#BDCDBA',
      primary: '#1B7F53', pfg: '#FFFFFF', secondary: '#E3EBE1', sidebar: '#E7EEE4', chrome: '#F7FAF5',
      hud: 'rgba(250,253,248,.94)', hudfg: '#1D2A22', hudborder: '#D0DDCD', glow: '#2FBF86',
    },
    dark: {
      bg: '#0F1613', fg: '#E4EFE8', card: '#17211C', muted: '#1E2B24', mfg: '#93AB9C', accent: '#1F3329', border: '#26362D', input: '#31443A',
      primary: '#3DD598', pfg: '#04251A', secondary: '#1E2B24', sidebar: '#0B110E', chrome: '#121B16',
      hud: 'rgba(23,33,28,.94)', hudfg: '#E4EFE8', hudborder: '#26362D', glow: '#3DD598',
    },
    shadow: { l: '0 4px 14px -4px rgba(27,80,55,.18)', d: '0 4px 16px -4px rgba(0,0,0,.55)' },
    btnShape: '10px',
    borderW: '1px',
    extra: (m) => `
/* AI 느낌: 터미널 같은 차분함 — 상태 점이 깜빡이고, 활성 메뉴는 초록 막대, 입력창은 > 프롬프트 느낌 */
nav > button.bg-accent { box-shadow: inset 3px 0 0 ${m.glow}; border-radius: 4px 10px 10px 4px; }
header [data-slot=button].border::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: ${m.glow}; margin-right: 6px; animation: v3-blink 1.8s ease-in-out infinite; }
@keyframes v3-blink { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
[role=dialog] textarea { border-left: 3px solid ${m.glow}; }
[role=dialog] textarea:focus-visible { box-shadow: 0 0 0 3px color-mix(in oklab, ${m.glow} 25%, transparent); }
main [class*="1a1d28"] { border-left: 3px solid ${m.glow}; }
`,
  },
  {
    key: 'graphite',
    title: '그래파이트 라임',
    radius: '5px',
    font: { w: 600, head: 700 },
    light: {
      bg: '#F4F4F0', fg: '#14140F', card: '#FFFFFF', muted: '#E8E8E1', mfg: '#55554B', accent: '#E9E9E0', border: '#14140F', input: '#14140F',
      primary: '#C8F031', pfg: '#14140F', secondary: '#E8E8E1', sidebar: '#EDEDE6', chrome: '#FAFAF6',
      hud: 'rgba(255,255,255,.97)', hudfg: '#14140F', hudborder: '#14140F', glow: '#C8F031',
    },
    dark: {
      bg: '#0C0C0A', fg: '#F2F2EA', card: '#161613', muted: '#1F1F1B', mfg: '#A3A398', accent: '#25251F', border: '#3A3A32', input: '#4A4A41',
      primary: '#C8F031', pfg: '#11140A', secondary: '#1F1F1B', sidebar: '#090908', chrome: '#11110E',
      hud: 'rgba(22,22,19,.96)', hudfg: '#F2F2EA', hudborder: '#4A4A41', glow: '#C8F031',
    },
    shadow: { l: '3px 3px 0 #14140F', d: '3px 3px 0 rgba(200,240,49,.35)' },
    btnShape: '5px',
    borderW: '1.5px',
    extra: (m, mode) => `
/* AI 느낌: 하드 그림자 + 고정폭 라벨 — 카드·버튼이 스티커처럼 떠 있고, 활성 메뉴는 라임 하이라이트 */
${mode === 'light' ? '.text-primary { color: #14140F; font-weight: 800; background: linear-gradient(transparent 62%, #C8F031 62%); }' : ''}
nav > button.bg-accent { background: ${m.glow}; color: #14140F; font-weight: 700; box-shadow: ${mode === 'light' ? '2px 2px 0 #14140F' : '2px 2px 0 rgba(200,240,49,.3)'}; }
nav > button.bg-accent svg { color: #14140F; }
nav > button { font-weight: 600; }
header [data-slot=button].border .text-muted-foreground, main [class*="1a1d28"].font-mono, main [class*="1a1d28"] .font-mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: -0.01em; }
[role=dialog] textarea { font-family: ui-monospace, 'SF Mono', Menlo, 'Apple SD Gothic Neo', monospace; font-size: 13px; border-width: 1.5px; }
[role=dialog] textarea:focus-visible { box-shadow: 3px 3px 0 ${m.glow}; border-color: ${mode === 'light' ? '#14140F' : m.glow}; }
[role=dialog] button.rounded-full { border-radius: 5px; font-family: ui-monospace, 'SF Mono', Menlo, 'Apple SD Gothic Neo', monospace; font-size: 12px; }
`,
  },
]

const vars = (m, d, mode) => `
  color-scheme: ${mode};
  --background: ${m.bg}; --foreground: ${m.fg};
  --card: ${m.card}; --card-foreground: ${m.fg};
  --popover: ${m.card}; --popover-foreground: ${m.fg};
  --primary: ${m.primary}; --primary-foreground: ${m.pfg};
  --secondary: ${m.secondary}; --secondary-foreground: ${m.fg};
  --muted: ${m.muted}; --muted-foreground: ${m.mfg};
  --accent: ${m.accent}; --accent-foreground: ${m.fg};
  --border: ${m.border}; --input: ${m.input}; --ring: ${m.glow};
  --radius: ${d.radius};
  --v3-chrome: ${m.chrome}; --v3-sidebar: ${m.sidebar};
  --v3-hud: ${m.hud}; --v3-hud-fg: ${m.hudfg}; --v3-hud-border: ${m.hudborder};
  --v3-shadow: ${mode === 'light' ? d.shadow.l : d.shadow.d};${mode === 'light' ? '\n  --status-working: #1C7C46; --status-waiting: #9A5B00; --status-idle: #6B6B62; --status-error: #C42B2B;' : ''}`

const common = (d, mode) => `
/* ── 공통 컴포넌트 모양 (레이아웃 속성은 건드리지 않는다) ── */
header { background: var(--v3-chrome); border-bottom: ${d.borderW} solid var(--border); }
nav { background: var(--v3-sidebar); border-right: ${d.borderW} solid var(--border); }
nav > button { transition: background-color .15s, color .15s; }
nav > button.bg-accent { font-weight: ${d.font.head}; }
body { font-weight: ${d.font.w === 500 ? 400 : 500}; }
[data-slot=button] { font-weight: ${d.font.w}; border-radius: ${d.btnShape}; }
[data-slot=button].bg-primary { box-shadow: var(--v3-shadow); ${d.key === 'graphite' ? `border: 1.5px solid ${mode === 'light' ? '#14140F' : '#C8F031'};` : ''} }
[data-slot=button].border { background-color: color-mix(in oklab, var(--card) 85%, transparent); border-width: ${d.borderW}; ${d.key === 'graphite' ? `border-color: ${mode === 'light' ? '#14140F' : 'var(--input)'}; box-shadow: var(--v3-shadow);` : ''} }
/* 지도 위에 얹힌 패널·버튼(HUD): 스튜디오 카드처럼 */
main [class*="1a1d28"] { background: var(--v3-hud) !important; color: var(--v3-hud-fg); border: ${d.borderW} solid var(--v3-hud-border) !important; border-radius: calc(var(--radius) + 2px) !important; box-shadow: var(--v3-shadow) !important; ${d.key === 'lavender' || d.key === 'cream' ? 'backdrop-filter: blur(10px);' : ''} }
main [class*="1a1d28"] .text-white, main [class*="1a1d28"].text-white, main button[class*="1a1d28"] { color: var(--v3-hud-fg) !important; }
main [class*="1a1d28"] [class*="text-white"], main [class*="1a1d28"] [class*="text-"][class*="/"] { color: var(--muted-foreground); }
main .hover\\:bg-white\\/10:hover { background: color-mix(in oklab, var(--v3-hud-fg) 10%, transparent) !important; }
main .absolute.bottom-3 button { color: var(--v3-hud-fg) !important; }
/* 대화상자·입력창·칩·배지 */
[role=dialog] { border: ${d.borderW} solid var(--border); border-radius: calc(var(--radius) + 6px); box-shadow: var(--v3-shadow), 0 24px 60px -20px rgba(0,0,0,.5); background-color: var(--card); }
[class*="bg-black/60"] { background: ${mode === 'light' ? 'rgba(30,24,40,.38)' : 'rgba(0,0,0,.62)'} !important; backdrop-filter: blur(2px); }
textarea, input { border-width: ${d.borderW}; border-radius: var(--radius); background-color: ${mode === 'light' ? 'var(--background)' : 'color-mix(in oklab, var(--background) 60%, var(--card))'}; transition: box-shadow .15s, border-color .15s; }
[role=dialog] button.rounded-full { border-width: ${d.borderW}; background: ${mode === 'light' ? 'var(--secondary)' : 'var(--muted)'}; font-weight: ${d.font.w}; }
[role=dialog] button.rounded-full:hover { background: var(--accent); }
header .bg-accent.rounded-full { background: var(--accent); border: ${d.borderW} solid var(--border); }
`

for (const d of D) {
  let css = `/* AI Office 디자인 시안 v3 — 「${d.title}」(${d.key})
   색 변수 + 컴포넌트 모양만 덮어쓴다. 레이아웃·크기·배치는 그대로. 사무실(Phaser 캔버스) 색은 건드리지 않는다.
   쓰는 법: <html data-theme="light|dark"> 로 모드를 고른다 (실제 적용 때는 index.css의 :root / .dark 변수로 옮긴다) */\n`
  for (const mode of ['light', 'dark']) {
    const m = d[mode]
    css += `\n/* ===== ${mode} ===== */\nhtml[data-theme='${mode}'] {${vars(m, d, mode)}\n}\n`
    const pre = `html[data-theme='${mode}']`
    const body = (common(d, mode) + d.extra(m, mode)).split('\n').map((l) => {
      const i = l.indexOf(' {')
      if (!l.trim() || l.startsWith('/*') || l.startsWith('@keyframes') || i < 0) return l
      return l.slice(0, i).split(',').map((x) => `${pre} ${x.trim()}`).join(', ') + l.slice(i)
    }).join('\n')
    css += body + '\n'
  }
  fs.writeFileSync(`${OUT}/theme-${d.key}.css`, css)
  console.log('wrote', d.key, css.length)
}
fs.writeFileSync(`${OUT}/_dirs.json`, JSON.stringify(D.map((d) => ({ key: d.key, title: d.title }))))
