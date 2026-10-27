// 결과물 갤러리·데모데이: 링크·요약 다듬기, 필터, 데모데이 시각 판정과 짧은 요약 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoEntries, demoSummary, extractLinks, filterGallery, isDemoDue, summarize, DEMO_LINES_MAX, cleanSpeech, demoCoverImages, demoImages, demoPresentInput, GALLERY_IMAGES_MAX, galleryBody, GALLERY_BODY_MAX, type DemoDayConfig, type GalleryEntry } from '../src/shared/gallery.ts'
import { setLang } from '../src/shared/i18n/index.ts'

setLang('ko')

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 9, 30, 17, 5).getTime() // 금요일 17:05
const entry = (id: string, over: Partial<GalleryEntry> = {}): GalleryEntry => ({ id, title: id, staffId: 's1', staffName: '김개발', teamId: null, labId: null, summary: '', links: [], images: [], files: [], finishedAt: NOW - DAY, ...over })

test('링크: http(s)만, 끝 문장부호·괄호 빼고 중복 없이', () => {
  assert.deepEqual(extractLinks('배포 https://a.dev/x. 그리고 (https://b.io/y) 다시 https://a.dev/x, file:///z'), ['https://a.dev/x', 'https://b.io/y'])
})

test('요약: 코드 블록·머리 기호 빼고 길면 자른다', () => {
  assert.equal(summarize('# 결과\n\n\n```\nnpm test\n```\n끝났어요'), '결과\n\n끝났어요')
  assert.equal(summarize('가'.repeat(10), 4), '가가가가…')
})

test('필터: 기간·직원·랩, 최근 순', () => {
  const list = [entry('old', { finishedAt: NOW - 10 * DAY }), entry('a', { finishedAt: NOW - DAY, labId: 'L' }), entry('b', { finishedAt: NOW - 2 * DAY, staffId: 's2' })]
  assert.deepEqual(filterGallery(list, { period: 'week' }, NOW).map((e) => e.id), ['a', 'b'])
  assert.deepEqual(filterGallery(list, { period: 'month', staffId: 's1' }, NOW).map((e) => e.id), ['a', 'old'])
  assert.deepEqual(filterGallery(list, { period: 'all', labId: 'L' }, NOW).map((e) => e.id), ['a'])
})

test('데모데이 시각: 꺼짐·다른 요일·시각 전·오늘 이미 열었으면 아니다', () => {
  const cfg: DemoDayConfig = { isEnabled: true, weekday: 5, time: '17:00' }
  const fri = new Date(NOW)
  assert.equal(isDemoDue(cfg, null, fri), true)
  assert.equal(isDemoDue({ ...cfg, isEnabled: false }, null, fri), false)
  assert.equal(isDemoDue({ ...cfg, weekday: 4 }, null, fri), false)
  assert.equal(isDemoDue({ ...cfg, time: '17:30' }, null, fri), false)
  assert.equal(isDemoDue(cfg, '2026-10-30', fri), false)
  assert.equal(isDemoDue(cfg, '2026-10-23', fri), true)
})

test('데모데이 대상: 지난번 이후 끝낸 것만 (처음이면 7일), 오래된 순', () => {
  const list = [entry('new', { finishedAt: NOW - DAY }), entry('mid', { finishedAt: NOW - 3 * DAY }), entry('old', { finishedAt: NOW - 9 * DAY })]
  assert.deepEqual(demoEntries(list, null, NOW).map((e) => e.id), ['mid', 'new'])
  assert.deepEqual(demoEntries(list, NOW - 2 * DAY, NOW).map((e) => e.id), ['new'])
})

test('데모데이 요약: 직원당 한 줄, 제목 3개까지, 사람 수 상한', () => {
  const list = [...['가', '나', '다', '라'].map((x) => entry(x)), entry('마', { staffId: 's2', staffName: '박디자' })]
  assert.equal(demoSummary(list), '데모데이 — 결과물 5건 · 직원 2명\n- 김개발: 가, 나, 다 외 1건\n- 박디자: 마')
  const many = Array.from({ length: DEMO_LINES_MAX + 2 }, (_, i) => entry(`t${i}`, { staffId: `p${i}`, staffName: `직원${i}` }))
  const lines = demoSummary(many).split('\n')
  assert.equal(lines.length, DEMO_LINES_MAX + 2)
  assert.equal(lines.at(-1), '그 밖에 2명')
})

const img = (id: string) => ({ id, name: `${id}.png`, path: `/x/${id}.png`, mime: 'image/png', size: 1 })
const withImg = (id: string, staffId: string, at: number, ids: string[]): GalleryEntry => ({ id, title: `t${id}`, staffId, staffName: staffId, teamId: null, labId: null, summary: `보고 ${id}`, links: [], images: ids.map(img), files: [], finishedAt: at })

test('demoImages: 최근 업무부터, 중복 없이 최대 GALLERY_IMAGES_MAX장', () => {
  const out = demoImages([withImg('a', 's', 1, ['i1', 'i2', 'i3']), withImg('b', 's', 2, ['i3', 'i4', 'i5'])])
  assert.deepEqual(out.map((x) => x.id), ['i3', 'i4', 'i5', 'i1'])
  assert.equal(out.length, GALLERY_IMAGES_MAX)
  assert.deepEqual(demoImages([withImg('a', 's', 1, [])]), [])
})

test('demoCoverImages: 직원마다 한 장씩 돌려 가며 max장', () => {
  const list = [withImg('a', 'k', 1, ['k1', 'k2', 'k3']), withImg('b', 'p', 2, ['p1']), withImg('c', 'q', 3, [])]
  assert.deepEqual(demoCoverImages(list, 3).map((x) => x.id), ['k1', 'p1', 'k2'])
  assert.deepEqual(demoCoverImages([withImg('c', 'q', 3, [])]), [])
})

test('demoPresentInput: 최근 업무 순, 보고는 200자까지', () => {
  const long = { ...withImg('a', 's', 1, []), summary: 'x'.repeat(500) }
  const out = demoPresentInput([long, withImg('b', 's', 2, [])])
  assert.ok(out.startsWith('1. tb'))
  assert.ok(out.split('\n')[1].length < 230)
})

test('cleanSpeech: 코드 블록·따옴표 제거, 비면 null, 길면 자름', () => {
  assert.equal(cleanSpeech('```\n"안녕하세요"\n```'), '안녕하세요')
  assert.equal(cleanSpeech('  '), null)
  assert.equal(cleanSpeech('가'.repeat(10), 5), '가가가가가…')
})

test('plainSpeech: 마크다운 기호를 걷고 목록은 줄 단위로', async () => {
  const { plainSpeech } = await import('../src/shared/gallery.ts')
  assert.equal(plainSpeech('## 결과\n\n**로그인** 화면을 `고쳤어요`.\n- 첫째\n* [x] 둘째\n---\n[문서](http://a.b) 참고'), '결과\n로그인 화면을 고쳤어요.\n첫째\n둘째\n문서 참고')
  assert.equal(plainSpeech('| 항목 | 값 |\n|---|---|\n| 속도 | 2배 |'), '항목 · 값\n속도 · 2배')
  assert.equal(plainSpeech('> _강조_ 와 snake_case_name 그대로'), '강조 와 snake_case_name 그대로')
  assert.equal(plainSpeech('```ts\nconst a = 1\n```'), 'const a = 1')
})

test('wrapSpeech: 띄어쓰기에서 끊고, 없으면 글자에서 끊는다', async () => {
  const { wrapSpeech } = await import('../src/shared/gallery.ts')
  const len = (s: string) => s.length
  assert.deepEqual(wrapSpeech('가나 다라 마바', 5, len), ['가나 다라', '마바'])
  assert.deepEqual(wrapSpeech('가나다라마바사', 3, len), ['가나다', '라마바', '사'])
  assert.deepEqual(wrapSpeech('첫 줄\n둘째', 10, len), ['첫 줄', '둘째'])
})

test('speechPageAt: 시간으로 저절로 넘기고, 사용자가 넘긴 쪽은 그때부터 친다', async () => {
  const { speechPageAt } = await import('../src/shared/gallery.ts')
  const base = { startedAt: 0, durationMs: 9_000, msPerChar: 45 }
  // 세 쪽이면 3초씩 — 늦게 열어도 지난 만큼 넘어가 있다
  assert.equal(speechPageAt([10, 10, 10], { ...base, now: 0 }).page, 0)
  assert.deepEqual(speechPageAt([10, 10, 10], { ...base, now: 3_100 }), { page: 1, shown: 2, isLast: false, typedAt: 3_450 })
  assert.equal(speechPageAt([10, 10, 10], { ...base, now: 99_000 }).isLast, true)
  // 1초에 둘째 쪽으로 넘기면 그 시각부터 치고, 시간이 그 쪽에 따라와도 다시 치지 않는다
  const skip = { page: 1, at: 1_000 }
  assert.deepEqual(speechPageAt([10, 10, 10], { ...base, now: 1_090, skip }).shown, 2)
  assert.equal(speechPageAt([10, 10, 10], { ...base, now: 3_100, skip }).shown, 10)
  // 쪽 몫이 짧으면 몫의 60% 안에 다 치도록 빨라진다
  assert.ok(speechPageAt([200], { ...base, durationMs: 3_000, now: 1_800 }).shown === 200)
})

test('demoPhaseMs: 발표는 글자 수에 맞춰 늘고 상한·하한이 있다', async () => {
  const g = await import('../src/shared/gallery.ts')
  assert.equal(g.demoPhaseMs('present', ''), g.DEMO_PRESENT_MIN_MS)
  assert.ok(g.demoPhaseMs('present', '가'.repeat(100)) > g.demoPhaseMs('present', '가'.repeat(80)))
  assert.equal(g.demoPhaseMs('present', '가'.repeat(5000)), g.DEMO_PRESENT_MAX_MS)
  assert.equal(g.demoPhaseMs('enter'), g.DEMO_ENTER_MS)
  assert.equal(g.demoPhaseMs('clap'), g.DEMO_CLAP_MS)
})

test('addPraise: 박수·MVP만 세고 한마디는 그대로', async () => {
  const { addPraise } = await import('../src/shared/gallery.ts')
  let p = addPraise(undefined, 'clap')
  p = addPraise(addPraise(p, 'clap'), 'mvp')
  assert.deepEqual(p, { claps: 2, mvps: 1 })
  assert.deepEqual(addPraise(p, 'comment'), p)
})

test('galleryBody: 상한까지만 저장, 짧으면 그대로', () => {
  assert.equal(galleryBody('  안녕  '), '안녕')
  assert.equal(galleryBody('가'.repeat(GALLERY_BODY_MAX + 5)).length, GALLERY_BODY_MAX + 1)
  assert.equal(galleryBody('가나다라', 2), '가나…')
})

test('예전 항목(body 없음)도 그대로 다룬다', () => {
  const old = entry('o', { summary: '요약' })
  assert.equal(old.body, undefined)
})
