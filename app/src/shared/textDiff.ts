// 첨삭 비교 (비서): 줄 단위로 바뀐 덩어리를 찾고, 고른 덩어리만 반영한다. 덩어리 안에서는 낱말 단위로 강조
// 지침·기획 설명·매뉴얼처럼 수천 자 정도의 글을 가정한다 (LCS, 줄·낱말이 많으면 덩어리 하나로 본다)

export type DiffOp = { type: 'same' | 'del' | 'add'; text: string }

const LCS_CELLS_MAX = 4_000_000

function lcs<T>(a: T[], b: T[]): DiffOp[] | null {
  if (a.length * b.length > LCS_CELLS_MAX) return null
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', text: String(a[i]) })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ type: 'del', text: String(a[i++]) })
    else ops.push({ type: 'add', text: String(b[j++]) })
  }
  while (i < m) ops.push({ type: 'del', text: String(a[i++]) })
  while (j < n) ops.push({ type: 'add', text: String(b[j++]) })
  return ops
}

/** 덩어리: 바뀌지 않은 줄(same) 또는 바뀐 덩어리(change: 지운 줄 → 더한 줄) */
export type Hunk = { kind: 'same'; lines: string[] } | { kind: 'change'; id: number; del: string[]; add: string[] }

export function diffHunks(original: string, revised: string): Hunk[] {
  const a = original.split('\n')
  const b = revised.split('\n')
  const ops = lcs(a, b) ?? [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))]
  const hunks: Hunk[] = []
  let id = 0
  for (const op of ops) {
    const last = hunks.at(-1)
    if (op.type === 'same') {
      if (last?.kind === 'same') last.lines.push(op.text)
      else hunks.push({ kind: 'same', lines: [op.text] })
      continue
    }
    const change = last?.kind === 'change' ? last : (hunks[hunks.push({ kind: 'change', id: id++, del: [], add: [] }) - 1] as Extract<Hunk, { kind: 'change' }>)
    if (op.type === 'del') change.del.push(op.text)
    else change.add.push(op.text)
  }
  return hunks
}

/** 고른 덩어리만 수정본으로, 나머지는 원문 그대로 */
export function applyHunks(hunks: Hunk[], chosen: ReadonlySet<number>): string {
  return hunks.flatMap((h) => (h.kind === 'same' ? h.lines : chosen.has(h.id) ? h.add : h.del)).join('\n')
}

export const changeCount = (hunks: Hunk[]) => hunks.filter((h) => h.kind === 'change').length

/** 덩어리 안 낱말 강조: 띄어쓰기 단위 (공백도 남겨 그대로 다시 붙일 수 있게) */
export function diffWords(before: string, after: string): DiffOp[] {
  const split = (t: string) => t.split(/(\s+)/).filter((x) => x !== '')
  const ops = lcs(split(before), split(after)) ?? [
    { type: 'del', text: before },
    { type: 'add', text: after },
  ]
  // 같은 종류가 이어지면 붙인다
  return ops.reduce<DiffOp[]>((acc, op) => {
    const last = acc.at(-1)
    if (last && last.type === op.type) last.text += op.text
    else acc.push({ ...op })
    return acc
  }, [])
}
