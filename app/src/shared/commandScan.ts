// 셸 명령을 낱말로 나눠(따옴표·이스케이프 처리) 판정하는 한 곳.
// 위험 명령 금지 훅(bashPolicy)과 자동결재(autoApprove)가 같은 분해·판정을 쓴다 — 정규식 한 줄만 보던 구멍(git -C . push 등)을 막는다
// 괄호·중괄호·치환·제어문 안쪽도 다시 토막으로 풀어 본다 (Round 2 A1 — ( ) { } $(…) `…` 안의 명령을 놓치지 않게)

/** 셸 연산자·괄호로 나눈 한 토막 */
export interface Segment {
  /** 따옴표를 벗긴 낱말들 (명령 치환 `$(…)`·변수 `$x`는 글자 그대로 남겨 둔다 — 명령 자리 판정용) */
  tokens: string[]
  /** 이 토막의 원문 (치환·변수·입력 리다이렉트 판정용) */
  raw: string
  /** `$(…)`나 백틱이 있었는지 */
  hasSubst: boolean
}

const MAX_DEPTH = 6

/** 명령을 토막으로 나눈다. 따옴표 안의 연산자·공백은 나누지 않고, `( ) { }`로 끊으며, `$(…)`·백틱 안쪽은 풀어서 토막을 더한다 */
export function lexSegments(command: string, depth = 0): Segment[] {
  const segments: Segment[] = []
  /** 치환 안쪽 글(나중에 다시 토막으로 푼다) */
  const inners: string[] = []
  let tokens: string[] = []
  let cur = ''
  let curHas = false
  let hasSubst = false
  let segStart = 0
  const n = command.length
  let i = 0
  const flushToken = () => {
    if (curHas) tokens.push(cur)
    cur = ''
    curHas = false
  }
  const flushSegment = (end: number) => {
    flushToken()
    const raw = command.slice(segStart, end)
    if (tokens.length || raw.trim()) segments.push({ tokens, raw, hasSubst })
    tokens = []
    hasSubst = false
  }
  // `$(` 뒤부터 짝이 맞는 `)`까지: 글자 그대로 토큰에 붙이고(명령 자리 판정용), 안쪽은 따로 모아 다시 분해한다
  // 큰따옴표 안이든 밖이든 같은 함수로 처리한다 (Round 3 — "$(git push)" 안쪽도 풀어서 판정)
  const captureSubst = () => {
    hasSubst = true
    curHas = true
    cur += command[i++] // '$'
    const innerStart = i + 1 // 여는 '(' 다음
    let depthP = 0
    do {
      const c = command[i]
      if (c === '(') depthP++
      else if (c === ')') depthP--
      cur += c
      i++
    } while (i < n && depthP > 0)
    inners.push(command.slice(innerStart, i - 1))
  }
  while (i < n) {
    const ch = command[i]
    if (ch === '\\') {
      if (i + 1 < n) {
        cur += command[i + 1]
        curHas = true
        i += 2
        continue
      }
      i++
      continue
    }
    if (ch === "'") {
      i++
      curHas = true
      while (i < n && command[i] !== "'") cur += command[i++]
      if (i < n) i++
      continue
    }
    if (ch === '"') {
      i++
      curHas = true
      while (i < n && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < n) {
          cur += command[i + 1]
          i += 2
          continue
        }
        if (command[i] === '$' && command[i + 1] === '(') {
          captureSubst()
          continue
        }
        if (command[i] === '`') {
          i++
          hasSubst = true
          const s = i
          while (i < n && command[i] !== '`') cur += command[i++]
          inners.push(command.slice(s, i))
          if (i < n) i++
          continue
        }
        cur += command[i++]
      }
      if (i < n) i++
      continue
    }
    if (ch === '$' && command[i + 1] === '(') {
      captureSubst()
      continue
    }
    if (ch === '`') {
      i++
      hasSubst = true
      curHas = true
      const s = i
      while (i < n && command[i] !== '`') cur += command[i++]
      inners.push(command.slice(s, i))
      if (i < n) i++
      continue
    }
    // 연산자·괄호: 토막을 끊는다. ( ) 는 늘 끊고, { } 는 낱말 첫머리일 때만 (${VAR}·brace 확장과 구분)
    if (ch === '&' || ch === '|' || ch === ';' || ch === '\n' || ch === '(' || ch === ')' || ((ch === '{' || ch === '}') && !curHas)) {
      const two = command.slice(i, i + 2)
      flushSegment(i)
      i += two === '&&' || two === '||' ? 2 : 1
      segStart = i
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      flushToken()
      i++
      continue
    }
    cur += ch
    curHas = true
    i++
  }
  flushSegment(n)
  // 치환 안쪽을 다시 토막으로 풀어 더한다 (A1 — echo $(git push)·`rm -rf x` 안의 명령도 본다)
  if (depth < MAX_DEPTH) for (const inner of inners) if (inner.trim()) segments.push(...lexSegments(inner, depth + 1))
  return segments
}

const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
/** 명령 이름을 숨기는 앞말 (뒤의 진짜 명령을 본다) — timeout·xargs·watch 등 다른 명령을 실행하는 앞말 포함 (A2) */
const WRAPPERS = new Set(['env', 'nohup', 'nice', 'ionice', 'time', 'stdbuf', 'setsid', 'command', 'builtin', 'exec', 'timeout', 'xargs', 'watch'])
/** 제어문 키워드: 뒤가 명령 자리다 (A1) */
const CONTROL = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'for', 'until', 'case', 'esac', 'function', 'select', '!', '{', '}'])

/** 토막에서 환경 변수 대입·감싸는 앞말·제어문 키워드를 걷어내고 실제 명령과 인자를 고른다 */
export function resolveCommand(seg: Segment): { cmd: string | null; args: string[]; localScript: boolean } {
  const toks = seg.tokens.filter((t) => t !== '')
  let k = 0
  for (;;) {
    while (k < toks.length && ASSIGN.test(toks[k])) k++
    const name = k < toks.length ? base(toks[k]) : ''
    if (k < toks.length && CONTROL.has(toks[k])) {
      k++
      continue
    }
    if (name && WRAPPERS.has(name)) {
      k++
      // 옵션(-x)·시간·간격(5·5s 같은 숫자)은 건너뛴다 — timeout 5 git push, watch -n1 git push
      while (k < toks.length && (toks[k].startsWith('-') || /^\d+[smhd]?$/i.test(toks[k]))) k++
      continue
    }
    break
  }
  if (k >= toks.length) return { cmd: null, args: [], localScript: false }
  const raw = toks[k]
  const localScript = /^(\.\/|\.\.\/|~\/)/.test(raw) || (raw.includes('/') && !raw.startsWith('/'))
  return { cmd: raw, args: toks.slice(k + 1), localScript }
}

/** 경로를 떼고 명령 이름만 (예: /usr/bin/git → git). 명령 치환·변수는 그대로 둔다 */
export function base(cmd: string): string {
  if (cmd.includes('$(') || cmd.includes('`') || cmd.startsWith('$')) return cmd
  const parts = cmd.split('/')
  return parts[parts.length - 1]
}

/** git 전역 옵션(-C·-c·--git-dir 등)을 건너뛰고 하위 명령과 그 뒤 인자를 고른다 */
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'])
export function gitSubcommand(args: string[]): { sub: string | null; rest: string[] } {
  let i = 0
  while (i < args.length && args[i].startsWith('-')) {
    if (GIT_VALUE_OPTS.has(args[i])) i++ // 값을 다음 토큰으로 받는 옵션은 그 값도 건너뛴다
    i++
  }
  return { sub: args[i] ?? null, rest: args.slice(i + 1) }
}
