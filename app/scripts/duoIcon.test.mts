// 듀오톤 아이콘 20종: 데이터 무결성·이모지 → 아이콘 바꾸기·화면 코드에 이모지가 다시 생기지 않게 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { DUO_ICON_DATA } from '../src/renderer/components/duo-icon-data.ts'
import { DUO_NAMES, EMOJI_TO_ICON, splitEdgeIcon, splitLeadingIcon, stripIconEmoji } from '../src/shared/iconText.ts'

const root = new URL('../', import.meta.url).pathname
const src = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

test('20종이 모두 그림을 가지고, 이모지 대응표는 20종 이름만 가리킨다', () => {
  assert.equal(DUO_NAMES.length, 20)
  assert.deepEqual(Object.keys(DUO_ICON_DATA).sort(), [...DUO_NAMES].sort())
  for (const name of DUO_NAMES) {
    const parts = DUO_ICON_DATA[name]
    assert.ok(parts.length >= 2, name)
    // 반복(화살표 두 개)만 닫힌 모양이 없어 선만 — 시안 그대로
    assert.equal(parts.some((p) => p.fill), name !== 'repeat', `${name}: 채울 닫힌 모양`)
    for (const p of parts) if (p.t === 'path') assert.match(p.d, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/, `${name}: ${p.d}`)
  }
  for (const v of Object.values(EMOJI_TO_ICON)) assert.ok((DUO_NAMES as readonly string[]).includes(v), v)
  // 디자인 전달 문서의 대체표 대표값
  assert.equal(EMOJI_TO_ICON['✅'], 'done')
  assert.equal(EMOJI_TO_ICON['⚠'], 'warn')
  assert.equal(EMOJI_TO_ICON['🤖'], 'ai')
  assert.equal(EMOJI_TO_ICON['🔧'], 'bug')
})

test('맨 앞 이모지 하나만 아이콘으로 (변형 선택자·공백 없음 허용, 20종 밖·중간은 그대로)', () => {
  assert.deepEqual(splitLeadingIcon('✅ 승인'), { icon: 'done', rest: '승인' })
  assert.deepEqual(splitLeadingIcon('🤖자동결재'), { icon: 'ai', rest: '자동결재' })
  assert.deepEqual(splitLeadingIcon('⚠️ 경고'), { icon: 'warn', rest: '경고' })
  assert.deepEqual(splitLeadingIcon('🗂️ "기획" 올림'), { icon: 'plan', rest: '"기획" 올림' })
  assert.deepEqual(splitLeadingIcon('안녕 ✅'), { rest: '안녕 ✅' })
  assert.deepEqual(splitLeadingIcon('🔍 찾기'), { rest: '🔍 찾기' })
  assert.deepEqual(splitLeadingIcon(''), { rest: '' })
})

test('사전 문구 맨 끝 이모지도 아이콘으로 (맨 앞이 먼저)', () => {
  assert.deepEqual(splitEdgeIcon('결재할 건이 없어요. 🎉'), { icon: 'party', rest: '결재할 건이 없어요.', isEnd: true })
  assert.deepEqual(splitEdgeIcon('🎉 해냈어요 🎉'), { icon: 'party', rest: '해냈어요 🎉' })
  assert.equal(stripIconEmoji('🔁 매뉴얼 단계대로 진행…'), '매뉴얼 단계대로 진행…')
  assert.equal(stripIconEmoji('🖱️ 컴퓨터'), '🖱️ 컴퓨터')
})

test('16px 미만은 채움 없이 선만, 채움 색은 CSS 변수 두 개(라이트 .42 / 다크 .6)', () => {
  const icon = src('src/renderer/components/duo-icon.tsx')
  assert.match(icon, /DUO_FILL_MIN_SIZE = 16/)
  assert.match(icon, /size >= DUO_FILL_MIN_SIZE &&/)
  assert.match(icon, /translate\(1\.6 1\.8\)/)
  assert.match(icon, /strokeWidth=\{2\.15\}/)
  const css = src('src/renderer/index.css')
  assert.match(css, /--duo-fill: var\(--ring\);/)
  assert.match(css, /--duo-fill-opacity: \.42;/)
  assert.match(css, /\[data-mode='dark'\] \{[^}]*--duo-fill-opacity: \.6;/)
})

// 화면 코드(renderer)에 20종 이모지를 글자로 다시 쓰지 않는다 — 아래는 데이터로 남겨 IconText가 그릴 때 바꾸는 자리, 또는 범위 밖
const ALLOWED: Record<string, string> = {
  'components/slash-menu.tsx': '매뉴얼 항목 label — 목록이 IconText로 그림',
  'features/CoachTour.tsx': '단계 icon 데이터 — IconText로 그림 (20종 밖 이모지도 섞여 있음)',
  'features/Onboarding.tsx': '카드 icon 데이터 — IconText로 그림',
  'features/Dashboard.tsx': '묶음 앞 표시 데이터 — IconText로 그림',
  'features/ShopPage.tsx': '거래 내역 표시 데이터 — IconText로 그림 (상점 데이터는 범위 밖)',
  'features/ReviewTab.tsx': '결과 글 앞머리 — IconText로 그림',
  'features/StaffPanel.tsx': '프로세스 매뉴얼 항목 label — 목록이 IconText로 그림',
  'features/McpSection.tsx': '장비 이름 앞머리 — IconText로 그림',
  'features/LevelUp.tsx': '레벨업 축하 꽃가루(게임 연출) — 범위 밖',
}
const SKIP = /\/(map|deskPet|preview)\//
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))

test('화면 코드에 20종 이모지가 허용 목록 밖에 남지 않는다 (사무실 지도·바탕화면 비서·미리보기는 범위 밖)', () => {
  const emojis = Object.keys(EMOJI_TO_ICON)
  const dir = path.join(root, 'src/renderer')
  const found: string[] = []
  for (const f of walk(dir)) {
    const rel = path.relative(dir, f)
    if (SKIP.test(`/${rel}`) || !/\.tsx?$/.test(f) || rel.startsWith('components/duo-icon')) continue
    fs.readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/^\s*\*.*$/, '')
        if (emojis.some((e) => code.includes(e)) && !ALLOWED[rel]) found.push(`${rel}:${i + 1}`)
      })
  }
  assert.deepEqual(found, [])
})

test('저장된 채팅·기록은 고치지 않고 보여 줄 때 바꾼다 (내 말풍선·알림 알약·직원 기록)', () => {
  const chat = src('src/renderer/features/ChatPage.tsx')
  assert.match(chat, /<IconText text=\{m\.text\}/)
  assert.match(chat, /splitLeadingIcon\(text\)/)
  assert.match(src('src/renderer/features/StaffPanel.tsx'), /<IconText text=\{trOr\(l\.textI18n, l\.text\)\}/)
})
