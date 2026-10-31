// 결과물 갤러리·데모데이 — 끝난 업무 카드를 모으고, 매주 정한 시간에 짧게 요약한다 (AI 호출 없음)
import type { ArtifactRef, Attachment, Meeting } from './types'
import { t } from './i18n/index.ts'
import { replaceArtifactRef } from './artifact.ts'

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
  /** 직원 보고 전체 (상세 창에 보여 준다 — 예전 항목엔 없어 summary로 대신한다) */
  body?: string
  /** 보고에 나온 주소 */
  links: string[]
  /** 그 업무를 하는 동안 직원이 올린 캡처·그림 */
  images: Attachment[]
  /** 그 업무를 하는 동안 직원이 올린 아티팩트 (같은 아티팩트는 최신 버전만, 예전 항목엔 없다) */
  artifacts?: ArtifactRef[]
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
/** 전체 본문 저장 상한 (글자) */
export const GALLERY_BODY_MAX = 20000
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

/** 보고 전체를 상한까지만 저장 (넘으면 …) */
export function galleryBody(text: string, max = GALLERY_BODY_MAX): string {
  const b = text.trim()
  return b.length > max ? `${b.slice(0, max).trimEnd()}…` : b
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

/** 발표장 대화창에 띄울 평문: 마크다운 기호를 걷고 한 줄에 한 덩어리 (저장된 기록은 그대로 두고 화면에서만 쓴다) */
export function plainSpeech(text: string): string {
  return text
    .split('\n')
    .flatMap((raw) => {
      const line = raw.trim()
      // 코드 울타리·가로줄·표 구분선은 통째로 뺀다
      if (/^(```|~~~)/.test(line) || /^([-*_]\s*){3,}$/.test(line) || /^\|?\s*:?-{3,}/.test(line)) return []
      const body = line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, '')
        .replace(/^\|(.*)\|$/, (_, cells: string) => cells.split('|').map((c) => c.trim()).filter(Boolean).join(' · '))
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.+?)\1/g, '$2')
        .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?![\w*])/g, '$1$2')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`+([^`]*)`+/g, '$1')
        .trim()
      return body ? [body] : []
    })
    .join('\n')
}

/** 대화창 폭에 맞춰 줄을 나눈다 — 띄어쓰기에서 끊고, 띄어쓰기 없이 길면 글자에서 끊는다. measure = 글자 폭 */
export function wrapSpeech(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  return text.split('\n').flatMap((para) => {
    const lines: string[] = []
    let line = ''
    for (const ch of para) {
      if (!line && ch === ' ') continue
      if (measure(line + ch) <= maxWidth || !line) {
        line += ch
        continue
      }
      const space = line.lastIndexOf(' ')
      if (ch !== ' ' && space > 0) {
        lines.push(line.slice(0, space))
        line = line.slice(space + 1) + ch
      } else {
        lines.push(line.trimEnd())
        line = ch === ' ' ? '' : ch
      }
    }
    if (line.trim()) lines.push(line.trimEnd())
    return lines
  })
}

/** 대화창 한 쪽의 글자 수 목록과 지금 시각으로 보일 쪽·글자 수를 정한다.
 *  발표 시간(durationMs)을 쪽 수로 나눠 저절로 넘기고(늦게 열어도 지난 만큼 넘어가 있다), 사용자가 넘긴 쪽(skip)이 더 앞서면 그 쪽을 그 시각부터 친다.
 *  한 쪽은 그 몫의 60% 안에 다 치도록 타자 속도를 올린다 */
export function speechPageAt(pageLengths: number[], o: { startedAt: number; durationMs: number; now: number; msPerChar: number; skip?: { page: number; at: number } | null }) {
  const count = Math.max(1, pageLengths.length)
  const slice = Math.max(1, o.durationMs) / count
  const autoPage = Math.min(count - 1, Math.max(0, Math.floor((o.now - o.startedAt) / slice)))
  // 넘긴 쪽에 시간이 따라와도 처음부터 다시 치지 않게, 둘 중 먼저 시작한 시각을 쓴다
  const isSkipped = !!o.skip && o.skip.page >= autoPage
  const page = isSkipped ? Math.min(count - 1, o.skip!.page) : autoPage
  const pageStart = isSkipped ? Math.min(o.skip!.at, o.startedAt + page * slice) : o.startedAt + page * slice
  const length = pageLengths[page] ?? 0
  const msPerChar = Math.min(o.msPerChar, (slice * 0.6) / Math.max(1, length))
  const shown = Math.min(length, Math.max(0, Math.floor((o.now - pageStart) / msPerChar)))
  return { page, shown, isLast: page === count - 1, typedAt: pageStart + length * msPerChar }
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

/** 앱을 켤 때 진행 중으로 남은 회의를 닫는다 — 데모데이는 '끝남'(진행 표시 제거), 일반 회의는 '실패'. 이미 끝난 회의는 그대로 돌려준다 */
export function settleStaleMeeting(m: Meeting, now: number): Meeting {
  if (m.status !== 'running' && m.status !== 'waiting') return m
  if (m.kind !== 'demo') return { ...m, status: 'failed' }
  return { ...m, status: 'done', ...(m.demo ? { demo: { ...m.demo, presenterId: null, phase: 'remark' as DemoPhase, slides: [], cardTitle: '', startedAt: now, durationMs: 0 } } : {}) }
}

/** 데모데이를 마무리할 때의 결과 — discard면 '중단'이고 총평도 버린다, wrapup이면 총평 없이 끝, 신호가 없으면 총평까지 */
export function demoOutcome<R>(stop: 'wrapup' | 'discard' | undefined, remark: R | null): { status: 'done' | 'stopped'; remark: R | null; isSaved: boolean } {
  if (stop === 'discard') return { status: 'stopped', remark: null, isSaved: false }
  return { status: 'done', remark: stop ? null : remark, isSaved: true }
}

/** 끝내기 신호(AbortController)가 오면 오래 걸리는 호출을 기다리지 않고 바로 거절로 빠져나온다 */
export function abortable<T>(p: Promise<T>, ac: AbortController): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => (ac.signal.aborted ? rej(new Error('aborted')) : ac.signal.addEventListener('abort', () => rej(new Error('aborted')), { once: true })))])
}

/** 갤러리 목록에 한 장을 넣는다 (같은 id는 덮어쓰고 맨 앞, 최대 개수를 넘는 옛 카드는 dropped로) */
export function mergeGalleryEntry(list: GalleryEntry[], entry: GalleryEntry, max: number): { kept: GalleryEntry[]; dropped: GalleryEntry[] } {
  const next = [entry, ...list.filter((e) => e.id !== entry.id)]
  return { kept: next.slice(0, max), dropped: next.slice(max) }
}

/** 다시 올린 결과물 참조(ref)를 이미 가진 갤러리 카드를 새 버전으로 바꾼다. 바뀐 카드마다 save를 부른다 */
export function bumpGalleryRefs(list: GalleryEntry[], ref: ArtifactRef, save: (e: GalleryEntry) => void): GalleryEntry[] {
  return list.map((e) => {
    const next = replaceArtifactRef(e.artifacts, ref)
    if (!next) return e
    const entry = { ...e, artifacts: next }
    save(entry)
    return entry
  })
}

export interface GalleryStoreIo {
  get: () => GalleryEntry[]
  set: (list: GalleryEntry[]) => void
  save: (e: GalleryEntry) => void
  remove: (id: string) => void
  emit: () => void
  max: number
}

/** 카드를 만들고(늦게 끝날 수 있음) → 저장 → 목록 반영 → 갱신 신호 순서로 처리한다. 신호는 저장이 끝난 뒤에만 나간다 */
export async function storeGalleryEntry(build: () => Promise<GalleryEntry>, io: GalleryStoreIo): Promise<void> {
  const entry = await build()
  io.save(entry)
  const { kept, dropped } = mergeGalleryEntry(io.get(), entry, io.max)
  for (const old of dropped) io.remove(old.id)
  io.set(kept)
  io.emit()
}
