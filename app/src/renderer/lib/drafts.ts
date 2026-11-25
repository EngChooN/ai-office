import { useCallback, useRef } from 'react'
import { create } from 'zustand'
import { draftKey, ownerFromSearch } from './webOwner.ts'

// 작성 중인 값을 키별로 들고 있는다 — 페이지 이동·직원 전환·언어 변경으로 입력칸이 다시 그려져도 남는다.
// 글(문자열)만 저장소에도 적어 앱을 껐다 켜도 남긴다. 첨부 파일·폼 객체는 메모리만 (앱을 끄면 사라진다)
// 키는 `화면:대상:칸` (예 `staff:<id>:draft`, `chat:<방id>:files`). 접두사로 한 번에 비운다
const useDrafts = create<Record<string, unknown>>(() => ({}))

// 셸이 준 PC 구분이 있으면 PC별 키 (webOwner.ts)
const STORE_KEY = draftKey(typeof location === 'undefined' ? '' : ownerFromSearch(location.search).pc)
// 안드로이드 셸(pc 있음)은 PC 전환·화면 종료 직전 입력을 잃지 않게 바로 저장한다 (같은 틱에 모아서)
const SAVE_DELAY_MS = typeof location !== 'undefined' && ownerFromSearch(location.search).pc ? 0 : 400
const MAX_TEXT = 200_000

type TextStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** 저장할 것만 고른다: 비어 있지 않은 글(문자열). 너무 긴 글은 저장소를 막지 않게 뺀다 */
export function persistable(state: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(state)) if (typeof v === 'string' && v && v.length <= MAX_TEXT) out[k] = v
  return out
}

function parseSaved(raw: string | null): Record<string, string> {
  try {
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return persistable(data as Record<string, unknown>)
  } catch {
    return {}
  }
}

function defaultStore(): TextStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let store: TextStore | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** 지금 글을 저장소에 적는다 (글이 없으면 항목을 지운다). 저장소가 막혀 있어도 입력은 계속된다 */
export function flushDrafts() {
  clearTimeout(timer)
  timer = undefined
  if (!store) return
  try {
    const text = persistable(useDrafts.getState())
    if (Object.keys(text).length) store.setItem(STORE_KEY, JSON.stringify(text))
    else store.removeItem(STORE_KEY)
  } catch {
    /* 용량 초과·사용 금지 — 메모리 보관만 계속 */
  }
}

/** 저장소를 붙이고 저장된 글을 불러온다. 이미 들고 있는 값이 있으면 그것을 우선한다 */
export function attachDraftStorage(next: TextStore | null) {
  store = next
  if (!store) return
  let raw: string | null = null
  try {
    raw = store.getItem(STORE_KEY)
  } catch {
    /* 읽기 실패 — 빈 상태로 시작 */
  }
  const saved = parseSaved(raw)
  if (Object.keys(saved).length) useDrafts.setState((s) => ({ ...saved, ...s }), true)
}

useDrafts.subscribe(() => {
  if (!store) return
  clearTimeout(timer)
  timer = setTimeout(flushDrafts, SAVE_DELAY_MS)
})
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushDrafts)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushDrafts())
}
attachDraftStorage(defaultStore())

type Next<T> = T | ((prev: T) => T)

/** 처음 값으로 돌아왔는지 (빈 글·빈 배열·처음과 같은 폼) — 그러면 항목을 지워 쌓이지 않게 한다 */
function isInitial(value: unknown, initial: unknown): boolean {
  if (Object.is(value, initial)) return true
  if (Array.isArray(value) && Array.isArray(initial)) return value.length === 0 && initial.length === 0
  if (value && initial && typeof value === 'object' && typeof initial === 'object') return JSON.stringify(value) === JSON.stringify(initial)
  return false
}

export function readDraft<T>(key: string, initial: T): T {
  const s = useDrafts.getState()
  return key in s ? (s[key] as T) : initial
}

export function writeDraft<T>(key: string, next: Next<T>, initial: T) {
  useDrafts.setState((s) => {
    const prev = (key in s ? s[key] : initial) as T
    const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
    if (!isInitial(value, initial)) return { ...s, [key]: value }
    if (!(key in s)) return s
    const { [key]: _, ...rest } = s
    return rest
  }, true)
}

/** 보내기·저장이 끝났거나 대상이 사라졌을 때: 접두사로 시작하는 칸을 모두 비운다 (예 'staff:abc:' → 글·첨부 함께) */
export function clearDraft(prefix: string) {
  useDrafts.setState((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(prefix))), true)
}

/** 대상이 사라진 칸을 비운다: `종류:<id>:` 중 id가 살아 있는 목록에 없는 것 (어디서 해고했든 — 패널·비서·다른 기기) */
export function pruneDrafts(kind: string, aliveIds: Iterable<string>) {
  const alive = new Set(aliveIds)
  const head = `${kind}:`
  useDrafts.setState((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(head) || alive.has(k.slice(head.length).split(':')[0]))), true)
}

/** 테스트용: 들고 있는 칸 수 */
export const draftCount = () => Object.keys(useDrafts.getState()).length

/** 보내기 실패 때 되돌릴 값: 그새 새로 쓴 게 있으면(빈 글·빈 목록·null이 아니면) 그대로 두고, 없으면 보냈던 값 */
export function keepNewer<T>(now: T, sent: T): T {
  if (typeof now === 'string') return now ? now : sent
  if (Array.isArray(now)) return now.length ? now : sent
  return now ?? sent
}

/** 저장이 끝났을 때 쓰는 갱신: 보낸 뒤로 칸이 그대로면 next로, 그새 고쳤으면(다른 페이지에 갔다 와서 새로 쓴 것 등) 그대로 둔다 */
export const ifUnchanged =
  <T,>(sent: T, next: T) =>
  (now: T): T =>
    Object.is(now, sent) || JSON.stringify(now) === JSON.stringify(sent) ? next : now

/** 처음 값은 키마다 처음 받은 것으로 고정한다 (객체 리터럴을 매번 새로 넘겨도 같은 참조 — 다시 그리기가 돌지 않게). 키가 바뀌면 새로 받는다 */
export function fixInitial<T>(fixed: { key: string; initial: T }, key: string, initial: T): { key: string; initial: T } {
  return fixed.key === key ? fixed : { key, initial }
}

/** 칸 값 고르기: 비어 있으면 고정된 처음 값을 그대로 돌려준다 (부를 때마다 같은 참조여야 구독이 끝없이 돌지 않는다) */
export const selectDraft =
  <T,>(key: string, init: T) =>
  (s: Record<string, unknown>): T =>
    key in s ? (s[key] as T) : init

/** 테스트용: 지금 보관 상태 */
export const draftState = () => useDrafts.getState()

/** useState 대신: 같은 키로 다시 그려지면 쓰던 값이 돌아온다 */
export function useDraft<T>(key: string, initial: T): [T, (next: Next<T>) => void] {
  const fixed = useRef({ key, initial })
  fixed.current = fixInitial(fixed.current, key, initial)
  const init = fixed.current.initial
  const value = useDrafts(selectDraft(key, init))
  const set = useCallback((next: Next<T>) => writeDraft(key, next, init), [key, init])
  return [value, set]
}
