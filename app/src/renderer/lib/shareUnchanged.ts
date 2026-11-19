/**
 * 새로 받은 값에서 내용이 그대로인 부분은 이전 객체를 그대로 돌려준다 (구조 공유).
 * main은 현황을 매번 새 객체로 통째로 보내므로, 이렇게 해 두어야 memo·useShallow가 "안 바뀐 카드·직원"을 건너뛸 수 있다.
 * updatedAt 같은 한 칸만 믿지 않고 내용 전체를 비교한다 — 하나라도 다르면 그 객체(와 그 위 부모들)는 새 값이 된다.
 * 배열 안 객체는 id가 있으면 id로, 없으면 같은 자리끼리 비교한다 (카드 순서가 바뀌어도 카드 객체는 재사용)
 */
export function shareUnchanged<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T
  if (Array.isArray(prev) && Array.isArray(next)) return shareArray(prev, next) as T
  if (isPlainObject(prev) && isPlainObject(next)) return shareObject(prev, next) as T
  return next
}

function shareArray(prev: unknown[], next: unknown[]): unknown[] {
  const byId = new Map<unknown, unknown>()
  for (const p of prev) if (hasId(p)) byId.set(p.id, p)
  let isSame = prev.length === next.length
  const out = next.map((n, i) => {
    const shared = shareUnchanged(hasId(n) ? byId.get(n.id) : prev[i], n)
    if (shared !== prev[i]) isSame = false
    return shared
  })
  return isSame ? prev : out
}

function shareObject(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(next)
  let isSame = keys.length === Object.keys(prev).length
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    out[k] = shareUnchanged(prev[k], next[k])
    if (out[k] !== prev[k] || !(k in prev)) isSame = false
  }
  return isSame ? prev : out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function hasId(v: unknown): v is { id: unknown } {
  return isPlainObject(v) && (typeof v.id === 'string' || typeof v.id === 'number')
}
