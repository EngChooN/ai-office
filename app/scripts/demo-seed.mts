// 소개 사이트 스크린샷용: 빈 데이터 폴더의 office.db에 가상 회사(demoData.ts)를 넣는다 — 실제 데이터 폴더에는 쓰지 말 것
// 1) CLAUDE_OFFICE_USER_DATA=<빈 폴더> pnpm start 로 한 번 켜서 office.db를 만들고 끈다
// 2) node scripts/demo-seed.mts <그 폴더> <ko|en|ja|zh>
// 3) 같은 환경 변수로 다시 켠다 (외부 세션이 섞이지 않게 HOME도 빈 폴더로 주면 좋다)
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { DEMO_CHAT, DEMO_DECOR, DEMO_FEED, DEMO_LAB, DEMO_MEETING, DEMO_STAFF, DEMO_SURFACES, DEMO_TASKS, DEMO_TEAMS, DEMO_TOKENS_PER_DAY } from '../src/renderer/mobile/preview/demoData.ts'

const [dir, lang] = process.argv.slice(2) as [string, 'ko' | 'en' | 'ja' | 'zh']
if (!dir || !['ko', 'en', 'ja', 'zh'].includes(lang)) throw new Error('사용법: node scripts/demo-seed.mts <데이터 폴더> <ko|en|ja|zh>')

const db = new DatabaseSync(path.join(dir, 'office.db'))
const now = Date.now()
const min = 60_000
const nameOf = (id: string) => DEMO_STAFF.find((s) => s.id === id)!.name[lang]

for (const table of ['staff', 'team', 'lab', 'task', 'meeting', 'chat', 'log', 'usage', 'schedule']) db.exec(`DELETE FROM ${table}`)

DEMO_STAFF.forEach((s, i) =>
  db
    .prepare('INSERT INTO staff (id, name, role, avatar, model, cwd, system_prompt, approval_mode, session_id, desk_index, hired_at, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)')
    .run(s.id, s.name[lang], s.role[lang], s.avatar, 'default', DEMO_LAB.cwd, '', 'ask', i, now - 30 * 86_400_000, s.teamId),
)
for (const t of DEMO_TEAMS) db.prepare('INSERT INTO team (id, name, color, lead_id, created_at) VALUES (?, ?, ?, ?, ?)').run(t.id, t.name[lang], t.color, t.leadId, now)
db.prepare('INSERT INTO lab (id, data, created_at) VALUES (?, ?, ?)').run(
  DEMO_LAB.id,
  JSON.stringify({ id: DEMO_LAB.id, name: DEMO_LAB.name[lang], color: DEMO_LAB.color, goal: DEMO_LAB.goal[lang], cwd: DEMO_LAB.cwd, leadId: DEMO_LAB.leadId, memberIds: DEMO_STAFF.map((s) => s.id) }),
  now,
)
for (const t of DEMO_TASKS) {
  const plan = t.plan
    ? { spec: t.plan.spec[lang], subtasks: t.plan.subtasks.map((p) => ({ title: p.title[lang], detail: '', assigneeId: p.assigneeId, assigneeName: nameOf(p.assigneeId) })), status: 'waiting', feedback: '', isAggregating: false, proposedAt: now - t.ago * min }
    : null
  db.prepare('INSERT INTO task (id, title, detail, status, assignee_id, team_id, result, created_at, updated_at, lab_id, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    t.id, t.title[lang], '', t.status, t.assigneeId, t.teamId, t.result?.[lang] ?? '', now - (t.ago + 60) * min, now - t.ago * min, DEMO_LAB.id, plan ? JSON.stringify(plan) : null,
  )
}
const m = DEMO_MEETING
db.prepare('INSERT INTO meeting (id, data, created_at) VALUES (?, ?, ?)').run(
  m.id,
  JSON.stringify({
    id: m.id, topic: m.topic[lang], participantIds: m.participantIds, rounds: 2, status: 'waiting', summary: '', createdAt: now - 25 * min,
    messages: m.lines.map((l) => ({ staffId: l.from, name: nameOf(l.from), text: l.text[lang], ts: now - l.ago * min })),
    decisions: [{ id: 'dd1', askedBy: m.decision.askedBy, askedByName: nameOf(m.decision.askedBy), question: m.decision.question[lang], options: m.decision.options[lang], answer: null, ts: now - 10 * min }],
  }),
  now - 25 * min,
)
for (const c of DEMO_CHAT) db.prepare('INSERT INTO chat (ts, sender, text) VALUES (?, ?, ?)').run(now - c.ago * min, c.from, c.text[lang])

for (const f of DEMO_FEED) db.prepare('INSERT INTO log (staff_id, ts, type, text) VALUES (?, ?, ?, ?)').run(f.from, now - f.ago * min, f.type, f.text[lang])
// 토큰 사용량: 지난 7일 하루 한 번씩 (오늘 몫은 몇 분 전) — 대시보드·급여 명세서가 비지 않게
for (const [id, perDay] of Object.entries(DEMO_TOKENS_PER_DAY))
  for (let d = 0; d < 7; d++) {
    const tokens = Math.round(perDay * (0.7 + ((d * 37 + id.charCodeAt(1)) % 7) / 10))
    db.prepare('INSERT INTO usage (staff_id, ts, cost_usd, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?)').run(id, d === 0 ? now - 5 * min : now - d * 86_400_000, tokens / 250_000, Math.round(tokens * 0.92), Math.round(tokens * 0.08))
  }

// 꾸미기: 칸 배치를 통째로 바꾸고, 산 개수는 놓은 만큼 이상으로 맞춘다 (라운지 기본 가구는 지급 uid를 그대로 써서 다시 지급되지 않게)
const shopRaw = (db.prepare("SELECT value FROM setting WHERE key = 'shop'").get() as { value: string } | undefined)?.value
const shop = shopRaw ? JSON.parse(shopRaw) : { owned: {}, surfaces: {}, placed: [], gear: {}, schema: 2 }
const ZONE_UID: Record<string, string> = { 'zone-low-table,1,8': 'zone:lounge:1', 'lv-studio-sofa,1,9': 'zone:lounge:2' }
shop.grid = DEMO_DECOR.map(([itemId, gx, gy, rot = 0], i) => ({ uid: ZONE_UID[`${itemId},${gx},${gy}`] ?? `demo:${i}`, itemId, floor: 1, gx, gy, rot }))
const placed: Record<string, number> = {}
for (const g of shop.grid) placed[g.itemId] = (placed[g.itemId] ?? 0) + 1
for (const [id, n] of Object.entries(placed)) shop.owned[id] = Math.max(shop.owned[id] ?? 0, n)
shop.surfaces = DEMO_SURFACES
for (const id of Object.values(DEMO_SURFACES.work)) shop.owned[id] = Math.max(shop.owned[id] ?? 0, 1)
db.prepare("INSERT INTO setting (key, value) VALUES ('shop', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(shop))

const raw = (db.prepare("SELECT value FROM setting WHERE key = 'settings'").get() as { value: string } | undefined)?.value
const settings = { ...(raw ? JSON.parse(raw) : {}), isOnboarded: true, isFullAccessNoticeSeen: true, language: lang }
db.prepare("INSERT INTO setting (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(settings))
console.log(`채웠어요: ${dir} (${lang}) — 직원 ${DEMO_STAFF.length}명`)
