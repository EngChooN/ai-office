// 안드로이드 셸은 여러 PC가 같은 저장소(localStorage)를 쓴다. 셸이 주소에 `?pc=<이 PC>&pcs=<저장된 PC들>`을 실어 주면
// 다른 PC가 쓰던 화면 설정·읽음 표시는 지우고, 작성 중인 글(drafts:v1:<PC>)은 PC별로 남긴다 (A→B→A에서 A 글이 돌아온다)
// 데스크톱 빌드는 pc가 없어 아무것도 하지 않는다

export const OWNER_KEY = 'ai-office:webOwner'
export const LEGACY_KEY = 'ai-office:drafts:v1'
export const DRAFT_PREFIX = 'ai-office:drafts:v1:'

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export function ownerFromSearch(search: string): { pc: string; pcs: string[] } {
  const q = new URLSearchParams(search)
  const pc = q.get('pc') ?? ''
  const pcs = (q.get('pcs') ?? '').split(',').filter(Boolean)
  return { pc, pcs }
}

/** 이 PC의 글 보관 키 (pc가 없으면 데스크톱 키) */
export function draftKey(pc: string): string {
  return pc ? DRAFT_PREFIX + pc : LEGACY_KEY
}

/** 주인이 바뀌었으면 글 보관 키만 남기고 지운다. 저장되지 않은 PC의 글(연결 끊긴 PC)도 지운다 */
export function cleanForOwner(store: KeyStore, pc: string, pcs: string[]): void {
  if (!pc) return
  const keep = new Set(pcs.concat(pc))
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k) keys.push(k)
  }
  const owner = store.getItem(OWNER_KEY)
  const changed = owner !== pc
  // 이전 버전(PC 구분 없음)의 글: 처음 실행(주인 표시 없음)이면 이 PC 보관함으로 옮기고, 옮겨진 것을 확인한 뒤에만 지운다
  const legacy = store.getItem(LEGACY_KEY)
  if (legacy !== null) {
    const target = draftKey(pc)
    if (owner === null && store.getItem(target) === null) {
      try {
        store.setItem(target, legacy)
      } catch {
        /* 용량 초과 — 옮기지 못했으니 원본을 남긴다 */
      }
    }
    if (owner !== null || store.getItem(target) === legacy) store.removeItem(LEGACY_KEY)
  }
  for (const k of keys) {
    if (k === OWNER_KEY || k === LEGACY_KEY) continue
    if (k.startsWith(DRAFT_PREFIX)) {
      if (!keep.has(k.slice(DRAFT_PREFIX.length))) store.removeItem(k)
    } else if (changed) store.removeItem(k)
  }
  if (changed) store.setItem(OWNER_KEY, pc)
}

function run() {
  try {
    if (typeof localStorage === 'undefined' || typeof location === 'undefined') return
    const { pc, pcs } = ownerFromSearch(location.search)
    cleanForOwner(localStorage, pc, pcs)
  } catch {
    /* 저장소 사용 불가 — 그대로 진행 */
  }
}
run()
