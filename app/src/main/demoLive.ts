// 소개 사이트 촬영용 실시간 상태 (scripts/demo-seed.mts가 데이터 폴더에 demo-live.json을 쓴다).
// CLAUDE_OFFICE_DEMO=1로 켰을 때만 읽는다 — 실제 세션이 없는 결재 카드·사용률·터미널 세션을 화면에 채운다. electron 없이 돈다
import fs from 'node:fs'
import path from 'node:path'
import type { Approval, PlanUsage, ProvidersStatus, StaffQuestion, StaffStatus } from '../shared/types'
import { ruleDraftFor } from '../shared/approvalRules.ts'

export const DEMO_ENV = 'CLAUDE_OFFICE_DEMO'
export const DEMO_LIVE_FILE = 'demo-live.json'

const MIN_MS = 60_000

/** demo-live.json — 글은 시드한 언어로, 시각은 앱을 켠 때 기준 몇 분 전·뒤 */
export interface DemoLiveFile {
  staff: Record<string, { status: StaffStatus; activity: string; approval?: { id: string; toolName: string; summary: string; input?: Record<string, unknown>; questions?: StaffQuestion[]; agoMin: number } }>
  planUsage: Record<'claude' | 'codex', { type: string; percent: number; resetsInMin: number }[]>
  external: { sessionId: string; cwd: string; name: string; agoMin: number }[]
}

export interface DemoLive {
  staff: Map<string, { status: StaffStatus; activity: string; approvals: Approval[] }>
  planUsage: PlanUsage[]
  codexUsage: PlanUsage[]
  external: { sessionId: string; cwd: string; name: string; startedAt: number }[]
}

/** 촬영용 공급자 상태: Claude·Codex 모두 로그인된 것으로 (빈 HOME이라 실제로는 Codex가 꺼져 고용 창의 GPT·베타가 안 보인다). 데모가 아니면 null */
export function demoProviders(env: NodeJS.ProcessEnv = process.env): ProvidersStatus | null {
  if (env[DEMO_ENV] !== '1') return null
  const ready = (authMethod: string, plan: string, models: string[]) => ({ state: 'ready' as const, account: 'you@example.com', authMethod, plan, models, defaultModel: models[0] ?? '', error: '' })
  return { claude: ready('claude.ai', 'max', []), codex: ready('chatgpt', 'plus', ['gpt-5.6-terra', 'gpt-5.6-luna']) }
}

/** 켜져 있지 않거나 파일이 없으면 null */
export function loadDemoLive(userDataDir: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): DemoLive | null {
  if (env[DEMO_ENV] !== '1') return null
  let raw: DemoLiveFile
  try {
    raw = JSON.parse(fs.readFileSync(path.join(userDataDir, DEMO_LIVE_FILE), 'utf8')) as DemoLiveFile
  } catch {
    return null
  }
  const usage = (list: DemoLiveFile['planUsage']['claude']): PlanUsage[] =>
    list.map((u) => ({ type: u.type, percent: u.percent, resetsAt: now + u.resetsInMin * MIN_MS, status: 'allowed', updatedAt: now - 2 * MIN_MS }))
  const staff = new Map(
    Object.entries(raw.staff).map(([id, s]) => {
      const a = s.approval
      const approvals: Approval[] = a
        ? [
            {
              id: a.id,
              staffId: id,
              toolName: a.toolName,
              summary: a.summary,
              createdAt: now - a.agoMin * MIN_MS,
              ...(a.questions ? { questions: a.questions } : {}),
              ...(!a.questions && a.input ? { alwaysRule: ruleDraftFor(a.toolName, a.input) ?? undefined } : {}),
            },
          ]
        : []
      return [id, { status: s.status, activity: s.activity, approvals }]
    }),
  )
  return {
    staff,
    planUsage: usage(raw.planUsage.claude),
    codexUsage: usage(raw.planUsage.codex),
    external: raw.external.map((e) => ({ sessionId: e.sessionId, cwd: e.cwd, name: e.name, startedAt: now - e.agoMin * MIN_MS })),
  }
}
