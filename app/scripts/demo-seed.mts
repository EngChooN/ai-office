// 소개 사이트 스크린샷용: 빈 데이터 폴더의 office.db에 가상 회사(demoData.ts)를 넣는다 — 실제 데이터 폴더에는 쓰지 말 것
// 1) CLAUDE_OFFICE_USER_DATA=<빈 폴더> pnpm start 로 한 번 켜서 office.db를 만들고 끈다
// 2) node scripts/demo-seed.mts <그 폴더> <ko|en|ja|zh>
// 3) 같은 데이터 폴더에 CLAUDE_OFFICE_DEMO=1을 더해 다시 켠다 (외부 세션이 섞이지 않게 HOME도 빈 폴더로)
//    CLAUDE_OFFICE_DEMO=1이면 demo-live.json의 결재 카드·직원 상태·Claude/GPT 사용률·터미널 세션이 채워진다 (main/demoLive.ts)
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {
  demoApprovalId, DEMO_CHAT, DEMO_DECOR, DEMO_EQUIPMENT, DEMO_EXTERNAL, DEMO_FEED, DEMO_LAB, DEMO_LIVE, DEMO_MEETING, DEMO_PLAN_USAGE, DEMO_SECRETARY, DEMO_STAFF, DEMO_SURFACES, DEMO_TASKS, DEMO_TEAMS, DEMO_TOKENS_PER_DAY,
} from '../src/renderer/mobile/preview/demoData.ts'
import { DEMO_LIVE_FILE, type DemoLiveFile } from '../src/main/demoLive.ts'
import type { SecretaryCard } from '../src/shared/types.ts'

const [dir, lang] = process.argv.slice(2) as [string, 'ko' | 'en' | 'ja' | 'zh']
if (!dir || !['ko', 'en', 'ja', 'zh'].includes(lang)) throw new Error('사용법: node scripts/demo-seed.mts <데이터 폴더> <ko|en|ja|zh>')

const db = new DatabaseSync(path.join(dir, 'office.db'))
const now = Date.now()
const min = 60_000
const nameOf = (id: string) => DEMO_STAFF.find((s) => s.id === id)!.name[lang]

for (const table of ['staff', 'team', 'lab', 'task', 'meeting', 'chat', 'log', 'usage', 'schedule']) db.exec(`DELETE FROM ${table}`)

DEMO_STAFF.forEach((s, i) =>
  db
    .prepare('INSERT INTO staff (id, name, role, avatar, model, cwd, system_prompt, approval_mode, session_id, desk_index, hired_at, team_id, provider, equipment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)')
    // 고용 순서 = 목록 순서 (GPT 직원은 나중에 뽑은 것처럼)
    .run(s.id, s.name[lang], s.role[lang], s.avatar, 'default', DEMO_LAB.cwd, '', 'ask', i, now - (30 - i) * 86_400_000, s.teamId, s.provider ?? 'claude', DEMO_EQUIPMENT[s.id] ? JSON.stringify({ mcpServers: DEMO_EQUIPMENT[s.id] }) : null),
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
for (const c of DEMO_CHAT)
  db.prepare('INSERT INTO chat (ts, sender, text, approval) VALUES (?, ?, ?, ?)').run(now - c.ago * min, c.from, c.text[lang], c.approvalOf ? JSON.stringify({ id: demoApprovalId(c.approvalOf) }) : null)

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

// 실시간 상태: 앱이 CLAUDE_OFFICE_DEMO=1일 때만 읽는다 (DB에는 넣지 않는다 — 진짜 세션이 아니라서)
const chatAgo = (staffId: string) => DEMO_CHAT.find((c) => c.approvalOf === staffId)?.ago ?? 4
const live: DemoLiveFile = {
  staff: Object.fromEntries(
    Object.entries(DEMO_LIVE).map(([id, l]) => {
      const a = l.approval
      const question = a?.options ? [{ question: a.summary[lang], header: '', multiSelect: false, options: a.options[lang].map((label) => ({ label, description: '' })) }] : undefined
      return [
        id,
        {
          status: l.status,
          // 앱의 '결재 대기: …'는 한국어로 고정이라, 다른 언어 캡처에 섞이지 않게 도구 이름·질문으로 (휴대폰 미리보기와 같다)
          activity: l.activity ?? (a ? a.summary[lang] : ''),
          ...(a ? { approval: { id: demoApprovalId(id), toolName: a.toolName, summary: a.summary[lang], input: a.input, questions: question, agoMin: chatAgo(id) } } : {}),
        },
      ]
    }),
  ),
  planUsage: DEMO_PLAN_USAGE,
  external: DEMO_EXTERNAL.map((e) => ({ sessionId: e.sessionId, cwd: e.cwd, name: e.name[lang], agoMin: e.agoMin })),
}
fs.writeFileSync(path.join(dir, DEMO_LIVE_FILE), JSON.stringify(live, null, 2))

// 비서 대화: 확인 카드는 만든 지 10분이 지나면 '만료'로 보여서, 촬영하는 동안 대기로 남게 만든 시각을 1시간 뒤로 둔다
db.exec('DELETE FROM secretary_message')
DEMO_SECRETARY.forEach((m, i) => {
  const c = m.card
  const card: SecretaryCard | null = c
    ? {
        id: `demo-sec-${i}`, kind: 'confirm', title: c.title[lang], risk: 'normal', warnings: [], status: 'pending', createdAt: now + 60 * min,
        steps: [{ method: 'mergeTasks', label: c.label[lang], detail: c.detail[lang], args: ['dk4', ['dk9']], status: 'pending' }],
        compares: [{ kind: 'text', label: c.compareLabel[lang], before: c.before[lang], after: c.after[lang] }],
      }
    : null
  db.prepare('INSERT INTO secretary_message (ts, role, text, card) VALUES (?, ?, ?, ?)').run(now - m.agoMin * min, m.role, m.text[lang], card ? JSON.stringify(card) : null)
})

const raw = (db.prepare("SELECT value FROM setting WHERE key = 'settings'").get() as { value: string } | undefined)?.value
// 데모데이(꾸미기 3 캡처): 결과가 있는 카드를 갤러리에 올린다. 발표는 AI 없이 정해진 문장으로 (빈 HOME이라 AI를 못 부른다)
db.exec("DELETE FROM gallery; DELETE FROM setting WHERE key = 'demoDayLast'")
DEMO_TASKS.filter((t) => t.result && t.assigneeId).forEach((t, i) => {
  const entry = { id: t.id, title: t.title[lang], staffId: t.assigneeId, staffName: nameOf(t.assigneeId!), teamId: t.teamId, labId: DEMO_LAB.id, summary: t.result![lang], body: t.result![lang], links: [], images: [], files: [], finishedAt: now - (90 - i * 10) * min }
  db.prepare('INSERT INTO gallery (id, data, finished_at) VALUES (?, ?, ?)').run(entry.id, JSON.stringify(entry), entry.finishedAt)
})
const settings = { ...(raw ? JSON.parse(raw) : {}), isOnboarded: true, isFullAccessNoticeSeen: true, language: lang, demoDay: { isEnabled: false, weekday: 5, time: '17:00', isAi: false } }
db.prepare("INSERT INTO setting (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(settings))
console.log(`채웠어요: ${dir} (${lang}) — 직원 ${DEMO_STAFF.length}명 (GPT ${DEMO_STAFF.filter((s) => s.provider === 'codex').length}명) · 켤 때 CLAUDE_OFFICE_DEMO=1`)
