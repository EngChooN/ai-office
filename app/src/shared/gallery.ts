// 결과물 갤러리·데모데이 — 끝난 업무 카드를 모으고, 매주 정한 시간에 짧게 요약한다 (AI 호출 없음)
import type { Attachment } from './types'
import { t } from './i18n/index.ts'

/** 끝난 업무 한 장 (업무 카드가 "검토"로 넘어갈 때 앱이 만든다 — 같은 카드를 다시 끝내면 덮어쓴다) */
export interface GalleryEntry {
  /** = 업무 카드 id */
  id: string
  title: string
  staffId: string
  staffName: string
  teamId: string | null
  labId: string | null
  /** 직원 보고 앞부분 */
  summary: string
  /** 보고에 나온 주소 */
  links: string[]
  /** 그 업무를 하는 동안 직원이 올린 캡처·그림 */
  images: Attachment[]
  /** 작업 폴더에서 바뀐 파일 (git으로 볼 수 있을 때만) */
  files: GalleryFile[]
  finishedAt: number
}

export interface GalleryFile {
  path: string
  added: number
  removed: number
}

/** 데모데이: 매주 이 요일·시각에 회의실에서 결과물을 돌아가며 보여 주고 단체방에 요약을 올린다 */
export interface DemoDayConfig {
  isEnabled: boolean
  /** 0=일 ~ 6=토 */
  weekday: number
  /** HH:MM */
  time: string
  /** 직원이 AI로 짧게 직접 발표 (꺼지면 정해진 문장 — 토큰 0). 기본 켬 */
  isAi: boolean
}

export type GalleryPeriod = 'week' | 'month' | 'all'

export const GALLERY_MAX = 300
export const GALLERY_SUMMARY_MAX = 400
export const GALLERY_LINKS_MAX = 5
export const GALLERY_IMAGES_MAX = 4
export const GALLERY_FILES_MAX = 30
/** 데모데이 단체방 요약에 적는 업무 수 (넘으면 "외 n건") — 짧게 */
export const DEMO_LINES_MAX = 8
/** 단체방 요약에 붙이는 대표 사진 수 */
export const DEMO_COVER_MAX = 4
/** AI 발표에 넘기는 업무 수·업무당 보고 길이 — 입력을 작게 */
export const DEMO_PROMPT_ITEMS_MAX = 5
const DEMO_PROMPT_SUMMARY_MAX = 200
export const DEMO_SPEECH_MAX = 400
const DAY = 24 * 60 * 60 * 1000
export const PERIOD_MS: Record<GalleryPeriod, number> = { week: 7 * DAY, month: 30 * DAY, all: Infinity }

/** 보고 글에서 http(s) 주소만 골라낸다 (중복·끝 문장부호 제거) */
export function extractLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'`)\]]+/g) ?? []
  const clean = found.map((u) => u.replace(/[.,;:!?。、，]+$/, ''))
  return [...new Set(clean)].slice(0, GALLERY_LINKS_MAX)
}

/** 보고 앞부분을 한 덩어리로 (마크다운 머리·코드 블록은 빼고 줄은 살린다) */
export function summarize(text: string, max = GALLERY_SUMMARY_MAX): string {
  const body = text
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trimEnd())
    .filter((l, i, arr) => l.trim() !== '' || (i > 0 && arr[i - 1].trim() !== ''))
    .join('\n')
    .trim()
  return body.length > max ? `${body.slice(0, max).trimEnd()}…` : body
}

export interface GalleryFilter {
  staffId?: string
  labId?: string
  period: GalleryPeriod
}

export function filterGallery(entries: GalleryEntry[], f: GalleryFilter, now: number): GalleryEntry[] {
  const since = now - PERIOD_MS[f.period]
  return entries.filter((e) => e.finishedAt >= since && (!f.staffId || e.staffId === f.staffId) && (!f.labId || e.labId === f.labId)).sort((a, b) => b.finishedAt - a.finishedAt)
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 오늘이 데모데이 요일이고 시각이 지났으며 오늘 아직 안 열었으면 true */
export function isDemoDue(cfg: DemoDayConfig, lastRunDate: string | null, now: Date): boolean {
  if (!cfg.isEnabled || now.getDay() !== cfg.weekday) return false
  if (lastRunDate === dateKeyOf(now)) return false
  return `${pad(now.getHours())}:${pad(now.getMinutes())}` >= cfg.time
}

/** 이번 데모데이에 보여 줄 업무: 지난 데모데이 이후(없으면 7일), 오래된 순 */
export function demoEntries(entries: GalleryEntry[], lastRunAt: number | null, now: number): GalleryEntry[] {
  const since = lastRunAt ?? now - PERIOD_MS.week
  return entries.filter((e) => e.finishedAt > since && e.finishedAt <= now).sort((a, b) => a.finishedAt - b.finishedAt)
}

/** 직원별로 묶기 (처음 끝낸 순서대로) — 회의실 발표 순서 */
export function groupByStaff(entries: GalleryEntry[]): { staffId: string; staffName: string; items: GalleryEntry[] }[] {
  const groups = new Map<string, { staffId: string; staffName: string; items: GalleryEntry[] }>()
  for (const e of entries) {
    const g = groups.get(e.staffId) ?? { staffId: e.staffId, staffName: e.staffName, items: [] }
    g.items.push(e)
    groups.set(e.staffId, g)
  }
  return [...groups.values()]
}

/** 회의실 발표 한 마디 — 끝낸 업무 제목과 보고 첫 줄 (짧게) */
export function demoLine(items: GalleryEntry[]): string {
  return items
    .map((e) => {
      const first = e.summary.split('\n').find((l) => l.trim())?.trim() ?? ''
      const note = first && first !== e.title ? ` — ${first.length > 80 ? `${first.slice(0, 80)}…` : first}` : ''
      return `✨ ${e.title}${note}`
    })
    .join('\n')
}

/** 단체방에 올리는 데모데이 요약 — 직원당 한 줄, 제목만 (토큰을 쓰지 않고 읽기 쉽게 짧게) */
export function demoSummary(entries: GalleryEntry[]): string {
  const groups = groupByStaff(entries)
  const lines = [t('gallery.demo.head', { n: entries.length, people: groups.length })]
  for (const g of groups.slice(0, DEMO_LINES_MAX)) {
    const titles = g.items.slice(0, 3).map((e) => e.title)
    const more = g.items.length > 3 ? ` ${t('gallery.demo.more', { n: g.items.length - 3 })}` : ''
    lines.push(`- ${g.staffName}: ${titles.join(', ')}${more}`)
  }
  if (groups.length > DEMO_LINES_MAX) lines.push(t('gallery.demo.morePeople', { n: groups.length - DEMO_LINES_MAX }))
  return lines.join('\n')
}

/** 발표하는 직원의 작업물 사진 (중복 제외, 최근 업무 것부터 GALLERY_IMAGES_MAX장) */
export function demoImages(items: GalleryEntry[]): Attachment[] {
  const seen = new Set<string>()
  const out: Attachment[] = []
  for (const e of [...items].sort((a, b) => b.finishedAt - a.finishedAt)) {
    for (const img of e.images) {
      if (seen.has(img.id)) continue
      seen.add(img.id)
      out.push(img)
      if (out.length >= GALLERY_IMAGES_MAX) return out
    }
  }
  return out
}

/** 단체방 요약에 붙일 대표 사진 — 직원마다 한 장씩 돌려 가며 최대 max장 */
export function demoCoverImages(entries: GalleryEntry[], max = DEMO_COVER_MAX): Attachment[] {
  const lists = groupByStaff(entries).map((g) => demoImages(g.items))
  const out: Attachment[] = []
  for (let round = 0; out.length < max && lists.some((l) => l.length > round); round++) {
    for (const l of lists) if (l[round] && out.length < max) out.push(l[round])
  }
  return out
}

/** AI 발표 입력 — 갤러리 요약만 (제목·보고 앞부분·바뀐 파일 수), 가장 최근 업무부터 */
export function demoPresentInput(items: GalleryEntry[]): string {
  const recent = [...items].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, DEMO_PROMPT_ITEMS_MAX)
  return recent
    .map((e, i) => {
      const body = e.summary.replace(/\s+/g, ' ').trim().slice(0, DEMO_PROMPT_SUMMARY_MAX)
      const files = e.files.length ? ` (파일 ${e.files.length}개)` : ''
      return `${i + 1}. ${e.title}${files}${body ? `: ${body}` : ''}`
    })
    .join('\n')
}

/** AI 답에서 코드 블록·따옴표를 걷고 길이를 제한한다. 비면 null (호출한 쪽이 정해진 문장으로 대체) */
export function cleanSpeech(text: string, max = DEMO_SPEECH_MAX): string | null {
  const body = text.replace(/```\w*\n?|```/g, '').trim().replace(/^["“”']+|["“”']+$/g, '').trim()
  if (!body) return null
  return body.length > max ? `${body.slice(0, max).trimEnd()}…` : body
}

/** 발표장 진행 단계: 입장(연단으로 걸어 나옴) → 발표(타이핑) → 박수 → (마지막) 총평 */
export type DemoPhase = 'enter' | 'present' | 'clap' | 'remark'

/** 화면 연출용 진행 상태 — Meeting(kind demo).demo 에 담겨 스냅샷으로 간다 */
export interface DemoStage {
  presenterId: string | null
  phase: DemoPhase
  /** 스크린에 띄울 슬라이드 (작업물 사진) — 비면 cardTitle 카드를 보여 준다 */
  slides: Attachment[]
  cardTitle: string
  /** 몇 번째 발표자(1부터)와 전체 인원 */
  index: number
  total: number
  /** 이 단계가 시작된 시각과 길이 — 화면이 타이핑·박수 시간을 맞춘다 */
  startedAt: number
  durationMs: number
  /** 대표가 고른 오늘의 MVP (회의당 1명) */
  mvpId: string | null
}

export const DEMO_ENTER_MS = 1_500
export const DEMO_CLAP_MS = 2_500
export const DEMO_REMARK_MS = 4_000
export const DEMO_PRESENT_MIN_MS = 3_000
export const DEMO_PRESENT_MAX_MS = 14_000
const DEMO_TYPING_MS_PER_CHAR = 45

/** 발표 단계 길이 — 발표는 글자 수에 맞춰(타이핑 + 읽을 틈), 나머지는 고정 */
export function demoPhaseMs(phase: DemoPhase, text = ''): number {
  if (phase === 'enter') return DEMO_ENTER_MS
  if (phase === 'clap') return DEMO_CLAP_MS
  if (phase === 'remark') return DEMO_REMARK_MS
  return Math.min(DEMO_PRESENT_MAX_MS, Math.max(DEMO_PRESENT_MIN_MS, text.length * DEMO_TYPING_MS_PER_CHAR + 1_000))
}

/** 대표 반응 */
export type DemoReaction = 'clap' | 'mvp' | 'comment'
export const DEMO_REACTIONS: readonly DemoReaction[] = ['clap', 'mvp', 'comment']
export const DEMO_COMMENT_MAX = 300

/** 직원 칭찬 배지 (박수·MVP 누적) */
export interface Praise {
  claps: number
  mvps: number
}
export const NO_PRAISE: Praise = { claps: 0, mvps: 0 }

/** 반응을 칭찬 배지에 반영 (한마디는 배지가 아니라 지식 창고로 간다) */
export function addPraise(p: Praise | undefined, kind: DemoReaction): Praise {
  const cur = p ?? NO_PRAISE
  return kind === 'clap' ? { ...cur, claps: cur.claps + 1 } : kind === 'mvp' ? { ...cur, mvps: cur.mvps + 1 } : cur
}
