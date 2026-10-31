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
  /** 앞 토막에서 파이프(`|`)로 표준입력을 받는지 (sqlite3·인터프리터가 파이프로 받은 글을 실행할 수 있다) */
  piped: boolean
  /** 따옴표·이스케이프로 글자 그대로 남긴 `$(`·백틱이 있었는지 (변수에 담았다가 산술 평가로 실행되는 우회 판정용) */
  literalSubst?: boolean
  /** tokens와 같은 순서: 작은따옴표·`$'…'` 안 글자를 \u0001로 가린 낱말 (그 안의 글은 산술 평가가 되지 않는다) */
  plain?: string[]
}

/** `((` 다음 위치부터 짝이 맞는 `))`까지가 산술식이면 끝 위치와 안쪽 글. `) )`처럼 붙지 않으면 명령 치환 속 서브셸이다(bash도 그렇게 되돌린다) */
function scanArith(src: string, from: number): { end: number; body: string } | null {
  let depth = 0
  for (let j = from; j < src.length; j++) {
    const c = src[j]
    if (c === '(') depth++
    else if (c === ')') {
      if (depth > 0) depth--
      else return src[j + 1] === ')' && isArithBody(src.slice(from, j)) ? { end: j + 2, body: src.slice(from, j) } : null
    }
  }
  return null
}
/** 낱말 두 개가 공백으로만 이어진 글(git push)은 산술식이 아니다 — 명령으로 다시 본다 (fail closed) */
const isArithBody = (body: string) => !/[A-Za-z0-9_]\s+[A-Za-z0-9_]/.test(body)
/** 산술식 안에 든 `$(…)`·백틱 안쪽 글 */
function arithInners(body: string): string[] {
  const out: string[] = []
  for (let j = 0; j < body.length; j++) {
    if (body[j] === '`') {
      const e = body.indexOf('`', j + 1)
      const end = e < 0 ? body.length : e
      out.push(body.slice(j + 1, end))
      j = end
    } else if (body[j] === '$' && body[j + 1] === '(') {
      if (body[j + 2] === '(') {
        const a = scanArith(body, j + 3)
        if (a) {
          out.push(...arithInners(a.body))
          j = a.end - 1
          continue
        }
      }
      let d = 0
      let k = j + 1
      do {
        if (body[k] === '(') d++
        else if (body[k] === ')') d--
        k++
      } while (k < body.length && d > 0)
      out.push(body.slice(j + 2, d === 0 ? k - 1 : k))
      j = k - 1
    }
  }
  return out
}

/** 큰따옴표가 닫히는 위치 (안쪽 `$(…)`·백틱·이스케이프를 건너뛴다). 못 찾으면 -1 */
function dqEnd(src: string, from: number): number {
  for (let k = from + 1; k < src.length; k++) {
    const c = src[k]
    if (c === '\\') k++
    else if (c === '"') return k
    else if (c === '$' && src[k + 1] === '(') {
      const e = substEnd(src, k + 1)
      if (e < 0) return -1
      k = e
    } else if (c === '`') {
      const e = src.indexOf('`', k + 1)
      if (e < 0) return -1
      k = e
    }
  }
  return -1
}
/** `$'` 뒤 `from`부터 닫는 `'` 위치 (`\x` 쌍은 건너뛴다). 못 찾으면 -1 */
function ansiCEnd(src: string, from: number): number {
  for (let k = from; k < src.length; k++) {
    if (src[k] === '\\') k++
    else if (src[k] === "'") return k
  }
  return -1
}
/** `$(`의 `(` 위치에서 짝이 맞는 `)` 위치. 따옴표·이스케이프·백틱·heredoc 본문 속 괄호는 세지 않는다. 못 찾으면 -1 (호출한 쪽이 fail closed) */
function substEnd(src: string, open: number): number {
  let d = 0
  let pending: string[] = []
  for (let j = open; j < src.length; j++) {
    const c = src[j]
    if (c === '\\') j++
    else if (c === '$' && src[j + 1] === "'") {
      // ANSI-C 따옴표 $'…': 안에서는 \x 쌍을 건너뛴다 (\' 가 따옴표를 닫지 않는다)
      const e = ansiCEnd(src, j + 2)
      if (e < 0) return -1
      j = e
    } else if (c === "'") {
      const e = src.indexOf("'", j + 1)
      if (e < 0) return -1
      j = e
    } else if (c === '"') {
      j = dqEnd(src, j)
      if (j < 0) return -1
    } else if (c === '`') {
      const e = src.indexOf('`', j + 1)
      if (e < 0) return -1
      j = e
    } else if (c === '<' && src[j + 1] === '<' && src[j + 2] !== '<' && src[j - 1] !== '<') {
      const m = src.slice(j + 2).match(/^-?[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([A-Za-z0-9_.-]+))/)
      if (m) {
        pending.push(m[1] ?? m[2] ?? m[3])
        j += 1 + m[0].length
      }
    } else if (c === '\n' && pending.length) {
      let i = j + 1
      for (const w of pending) {
        while (i < src.length) {
          const eol = src.indexOf('\n', i)
          const line = src.slice(i, eol < 0 ? src.length : eol)
          i = eol < 0 ? src.length : eol + 1
          if (line.trim() === w) break
        }
      }
      pending = []
      j = i - 1
    } else if (c === '(') d++
    else if (c === ')') {
      d--
      if (d === 0) return j
    }
  }
  return -1
}

const MAX_DEPTH = 6

/** 명령을 토막으로 나눈다. 따옴표 안의 연산자·공백은 나누지 않고, `( ) { }`로 끊으며, `$(…)`·백틱 안쪽은 풀어서 토막을 더한다 */
export function lexSegments(command: string, depth = 0): Segment[] {
  const segments: Segment[] = []
  /** 치환 안쪽 글(나중에 다시 토막으로 푼다) */
  const inners: string[] = []
  let tokens: string[] = []
  let plains: string[] = []
  /** 현재 낱말에서 작은따옴표로 감싼 글의 위치 범위 */
  let sqRanges: [number, number][] = []
  let cur = ''
  let curHas = false
  let hasSubst = false
  let literalSubst = false
  let unparsed = false
  let segStart = 0
  const heredocs: { word: string; quoted: boolean }[] = []
  /** 앞 토막이 `|`로 끝났는지 / case 안 개수 / 짝 없는 ( 개수 (case 패턴의 `)` 구분용) */
  let piped = false
  let inCase = 0
  let parenDepth = 0
  /** 열려 있는 ${…}·$[…]의 닫는 글자 */
  const closers: string[] = []
  const n = command.length
  let i = 0
  const flushToken = () => {
    if (curHas) {
      tokens.push(cur)
      let plain = ''
      let at = 0
      for (const [a, b] of sqRanges) {
        plain += cur.slice(at, a) + '\u0001'.repeat(b - a)
        at = b
      }
      plains.push(plain + cur.slice(at))
    }
    cur = ''
    curHas = false
    sqRanges = []
  }
  const flushSegment = (end: number, patternClose = false) => {
    flushToken()
    const raw = command.slice(segStart, end)
    let k = 0
    while (k < tokens.length && CONTROL.has(tokens[k]) && tokens[k] !== 'case') k++
    if (tokens[k] === 'case' && depth > 0) unparsed = true // 명령 치환 안의 case: 패턴의 `)`가 치환을 닫은 것으로 읽힌다
    if (tokens[k] === 'case') inCase++
    else if (tokens[k] === 'esac' && inCase > 0) inCase--
    // case 패턴(`a|b)`)은 명령이 아니다 — 짝 없는 `)`로 끝나는 토막만 버린다
    const isPattern = patternClose && inCase > 0
    if (!isPattern && (tokens.length || raw.trim())) {
      segments.push({ tokens, raw, hasSubst, piped, literalSubst, plain: plains })
      piped = false
    }
    tokens = []
    plains = []
    hasSubst = false
    literalSubst = false
  }
  /** 열린 [[ … ]] 조건식 안인가 */
  const inDoubleBracket = () => {
    const k = tokens.findIndex((t) => !CONTROL.has(t))
    return k >= 0 && tokens[k] === '[[' && !tokens.slice(k).includes(']]')
  }
  /** 토막 앞머리가 제어문 키워드뿐인가 (그 자리의 `((`는 산술 명령) */
  const atCommandStart = () => !curHas && tokens.every((t) => CONTROL.has(t))
  // `$(` 뒤부터 짝이 맞는 `)`까지: 글자 그대로 토큰에 붙이고(명령 자리 판정용), 안쪽은 따로 모아 다시 분해한다
  // 큰따옴표 안이든 밖이든 같은 함수로 처리한다 (Round 3 — "$(git push)" 안쪽도 풀어서 판정)
  const captureSubst = () => {
    hasSubst = true
    curHas = true
    if (command[i + 2] === '(') {
      // $(( … )) 산술 확장: 안쪽은 명령이 아니다 (그 속의 $(…)·백틱만 본다)
      const a = scanArith(command, i + 3)
      if (a) {
        cur += command.slice(i, a.end)
        i = a.end
        inners.push(...arithInners(a.body))
        return
      }
    }
    const open = i + 1
    const close = substEnd(command, open)
    if (close < 0) {
      // 짝이 안 맞거나 따옴표가 안 닫힘: 남은 글 전부를 안쪽으로 보고, 해석 불가 표식을 남겨 자동 승인이 기다리게 한다 (fail closed)
      cur += command.slice(i)
      inners.push(command.slice(open + 1))
      i = n
      unparsed = true
      return
    }
    cur += command.slice(i, close + 1)
    inners.push(command.slice(open + 1, close))
    i = close + 1
  }
  while (i < n) {
    const ch = command[i]
    if (ch === '\\') {
      // 줄 끝 \ 는 줄 잇기: git p\<줄바꿈>ush = git push
      // `\`+CRLF는 줄 잇기가 아니다 — bash·zsh는 LF에서 명령을 끝낸다
      if (command[i + 1] === '\n') {
        i += 2
        continue
      }
      if (i + 1 < n) {
        if (command[i + 1] === '$' || command[i + 1] === '`') literalSubst = true
        cur += command[i + 1]
        curHas = true
        i += 2
        continue
      }
      i++
      continue
    }
    if (ch === '$' && command[i + 1] === "'") {
      // ANSI-C 따옴표 $'…': \n \t \' \" \\ 만 풀고, 그 밖의 이스케이프(\x41·\101·\u…)는 무엇이 될지 몰라 해석 불가로 둔다 (fail closed)
      const e = ansiCEnd(command, i + 2)
      const body = command.slice(i + 2, e < 0 ? n : e)
      curHas = true
      if (e < 0 || /\\[^ntre'"\\]/.test(body)) unparsed = true
      if (/\$\(|`/.test(body)) literalSubst = true
      const c0 = cur.length
      cur += body.replace(/\\(.)/gs, (_m, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === 'e' ? '\x1b' : c))
      sqRanges.push([c0, cur.length])
      i = e < 0 ? n : e + 1
      continue
    }
    if (ch === "'") {
      i++
      curHas = true
      const q0 = i
      const c0 = cur.length
      while (i < n && command[i] !== "'") cur += command[i++]
      sqRanges.push([c0, cur.length])
      if (/\$\(|`/.test(command.slice(q0, i))) literalSubst = true
      if (i < n) i++
      continue
    }
    if (ch === '"') {
      i++
      curHas = true
      while (i < n && command[i] !== '"') {
        if (command[i] === '\\' && command[i + 1] === '\n') {
          i += 2
          continue
        }
        if (command[i] === '\\' && i + 1 < n) {
          if (command[i + 1] === '$' || command[i + 1] === '`') literalSubst = true
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
          while (i < n && command[i] !== '`') {
            if (command[i] === '\\' && command[i + 1] === '`') unparsed = true // 백틱 안의 이스케이프된 백틱 = 중첩 치환 (fail closed)
            cur += command[i++]
          }
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
      while (i < n && command[i] !== '`') {
        if (command[i] === '\\' && command[i + 1] === '`') unparsed = true
        cur += command[i++]
      }
      inners.push(command.slice(s, i))
      if (i < n) i++
      continue
    }
    // ${…}·$[…] 안의 공백·연산자는 낱말을 나누지 않는다 (${s: x}·${a[ x ]}·$[ x ]). 짝이 닫히지 않으면 아래에서 해석 불가로 둔다
    if (ch === '$' && (command[i + 1] === '{' || command[i + 1] === '[')) {
      closers.push(command[i + 1] === '{' ? '}' : ']')
      cur += ch + command[i + 1]
      curHas = true
      i += 2
      continue
    }
    if (closers.length) {
      const top = closers[closers.length - 1]
      if (ch === top) closers.pop()
      else if (ch === '[' && top === ']') closers.push(top) // ${…} 안의 { 는 중첩이 아니다 — 처음 나오는 }가 닫는다
      cur += ch
      curHas = true
      i++
      continue
    }
    // 주석: 낱말 첫머리의 # 부터 줄 끝까지는 명령이 아니다 (줄바꿈은 남겨 둔다)
    // (앞이 입력 처음이거나 공백·; & | ( ) 일 때만: `{#`·`}#`·`\r#`은 주석이 아니다)
    if (ch === '#' && !curHas && (i === 0 || ' \t\n;&|()'.includes(command[i - 1]))) {
      while (i < n && command[i] !== '\n') i++
      continue
    }
    // 산술 명령 ((…)) · for ((…)): 안쪽은 명령이 아니다 (그 속의 $(…)·백틱만 본다)
    if (ch === '(' && command[i + 1] === '(' && atCommandStart()) {
      const a = scanArith(command, i + 2)
      if (a) {
        inners.push(...arithInners(a.body))
        // 산술식의 변수 값은 평가될 때 a[$(…)] 로 명령을 실행할 수 있다 — 판정용으로 따로 남긴다
        segments.push({ tokens: ['((', a.body], raw: command.slice(i, a.end), hasSubst: false, piped: false })
        i = a.end
        continue
      }
    }
    // [[ … ]] 안의 && · || 는 토막을 끊지 않는다 (조건식의 일부)
    if (((ch === '&' && command[i + 1] === '&') || (ch === '|' && command[i + 1] === '|')) && inDoubleBracket() && cur !== ']]') {
      flushToken()
      tokens.push(command.slice(i, i + 2))
      plains.push(command.slice(i, i + 2))
      i += 2
      continue
    }
    // 리다이렉트의 & · | (2>&1 · &>file · >|file)는 연산자가 아니다
    if ((ch === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>')) || (ch === '|' && command[i - 1] === '>')) {
      cur += ch
      curHas = true
      i++
      continue
    }
    // heredoc: <<WORD · <<'WORD' · <<-WORD — 본문은 명령이 아니라 글이므로 건너뛴다 (따옴표 없는 WORD면 본문의 $(…)·`…`만 명령으로 본다)
    // bash가 읽는 그대로일 때만 건너뛴다: <<< 가 아니고, 낱말이 통째로 하나의 모양이며, 줄에 # (( $[ ${ [ 가 없을 때. 애매하면 본문도 명령으로 검사한다
    if (ch === '<' && command[i + 1] === '<' && command[i + 2] !== '<' && command[i - 1] !== '<') {
      const lineStart = command.lastIndexOf('\n', i - 1) + 1
      const eol = command.indexOf('\n', i)
      const line = command.slice(lineStart, eol < 0 ? n : eol)
      const hm = !/#|\(\(|\$\[|\$\{|\[/.test(line) && command.slice(i + 2).match(/^-?[ \t]*(?:'([^'\n]*)'|"([^"\n$`\\]*)"|\\?([A-Za-z0-9_.-]+))(?=[\s;&|()<>]|$)/)
      if (hm) heredocs.push({ word: hm[1] ?? hm[2] ?? hm[3], quoted: hm[3] === undefined })
    }
    if (ch === '\n' && heredocs.length) {
      flushSegment(i)
      i++
      segStart = i
      for (const h of heredocs.splice(0)) {
        const start = i
        while (i < n) {
          const eol = command.indexOf('\n', i)
          const end = eol < 0 ? n : eol
          const line = command.slice(i, end)
          i = eol < 0 ? n : eol + 1
          if (line.trim() === h.word) break
        }
        if (!h.quoted) for (const sub of command.slice(start, i).matchAll(/\$\(([^)]*)\)|`([^`]*)`/g)) inners.push(sub[1] ?? sub[2])
        segStart = i
      }
      continue
    }
    // 숫자 중괄호 범위 {1..3}은 낱말이다 (for i in {1..3})
    if (ch === '{' && !curHas) {
      const rm = /^\{-?\d+\.\.-?\d+(\.\.\d+)?\}/.exec(command.slice(i, i + 40))
      if (rm) {
        cur += rm[0]
        curHas = true
        i += rm[0].length
        continue
      }
    }
    // 연산자·괄호: 토막을 끊는다. ( ) 는 늘 끊고, { } 는 낱말 첫머리일 때만 (${VAR}·brace 확장과 구분)
    if (ch === '&' || ch === '|' || ch === ';' || ch === '\n' || ch === '(' || ch === ')' || ((ch === '{' || ch === '}') && !curHas)) {
      const two = command.slice(i, i + 2)
      if (ch === '(') parenDepth++
      let unmatchedClose = false
      if (ch === ')') {
        if (parenDepth > 0) parenDepth--
        else unmatchedClose = true
      }
      flushSegment(i, unmatchedClose)
      if (ch === '|' && two !== '||') piped = true
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
  if (closers.length) unparsed = true
  if (unparsed) segments.push({ tokens: ['$unterminated-substitution'], raw: '', hasSubst: true, piped: false })
  // 치환 안쪽을 다시 토막으로 풀어 더한다 (A1 — echo $(git push)·`rm -rf x` 안의 명령도 본다)
  if (depth < MAX_DEPTH) for (const inner of inners) if (inner.trim()) segments.push(...lexSegments(inner, depth + 1))
  return segments
}

const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/
/** 명령 앞의 리다이렉트 낱말 (`> out` · `2>&1` · `<<EOF` · `&>f`): 연산자만 있으면 다음 낱말(대상)도 건너뛴다 */
const REDIRECT = /^(?:\d*|&)(?:>>|>\||>&|<&|<>|<<<|<<-?|>|<|&>>|&>)/
const REDIRECT_ALONE = /^(?:\d*|&)(?:>>|>\||>&|<&|<>|<<<|<<-|<<|>|<|&>>|&>)$/
/** 래퍼별 옵션 목록: flags=값 없는 옵션, values=값을 다음 토큰으로 받는 옵션, opt=값이 붙어서만 오는 옵션, positional=옵션 뒤 건너뛸 자리 인자 수 */
type WrapperSpec = { flags: string[]; values: string[]; opt?: string[]; positional?: number; numeric?: boolean; valuesCancelPositional?: string[] }
const TIMEOUT: WrapperSpec = { flags: ['-v', '--verbose', '--foreground', '--preserve-status'], values: ['-s', '--signal', '-k', '--kill-after'], positional: 1 }
const STDBUF: WrapperSpec = { flags: [], values: ['-i', '-o', '-e', '--input', '--output', '--error'] }
const NICE: WrapperSpec = { flags: [], values: ['-n', '--adjustment'], numeric: true }
/** 명령 이름을 숨기는 앞말 (뒤의 진짜 명령을 본다) — 다른 명령을 실행하는 앞말 전부. 목록에 없는 옵션은 해석 불가로 사람 확인 (fail closed) */
const WRAPPER_SPECS: Record<string, WrapperSpec> = {
  env: { flags: ['-i', '-0', '-v', '-', '--ignore-environment', '--null', '--debug'], values: ['-u', '--unset', '-C', '--chdir', '-P', '-L', '-U'] },
  nohup: { flags: [], values: [] },
  nice: NICE,
  gnice: NICE,
  ionice: { flags: ['-t', '--ignore'], values: ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid', '--pgid', '--uid'] },
  time: { flags: ['-p', '-v', '-a', '-q', '--portability', '--verbose', '--append', '--quiet'], values: ['-f', '-o', '--format', '--output'] },
  stdbuf: STDBUF,
  gstdbuf: STDBUF,
  setsid: { flags: ['-c', '-f', '-w', '--ctty', '--fork', '--wait'], values: [] },
  command: { flags: ['-p'], values: [] },
  builtin: { flags: [], values: [] },
  exec: { flags: ['-c', '-l'], values: ['-a'] },
  timeout: TIMEOUT,
  gtimeout: TIMEOUT,
  xargs: {
    flags: ['-0', '-t', '-r', '-p', '-x', '-o', '--null', '--verbose', '--no-run-if-empty', '--interactive', '--exit', '--open-tty', '--show-limits'],
    values: ['-n', '-P', '-I', '-L', '-d', '-E', '-s', '-a', '-J', '-R', '-S', '--max-args', '--max-procs', '--max-chars', '--delimiter', '--arg-file', '--process-slot-var'],
    opt: ['-i', '-l', '-e', '--eof', '--replace', '--max-lines'],
  },
  watch: { flags: ['-b', '-c', '-d', '-e', '-g', '-p', '-q', '-t', '-w', '-x', '--beep', '--color', '--differences', '--errexit', '--chgexit', '--precise', '--no-title', '--no-wrap', '--exec'], values: ['-n', '--interval'] },
  doas: { flags: ['-n'], values: ['-u', '-C'] },
  caffeinate: { flags: ['-d', '-i', '-m', '-s', '-u'], values: ['-t', '-w'] },
  chrt: { flags: ['-a', '-b', '-f', '-i', '-o', '-r', '-d', '-R', '-v', '--all-tasks', '--batch', '--fifo', '--idle', '--other', '--rr', '--deadline', '--reset-on-fork', '--verbose'], values: ['-T', '-P', '-D'], positional: 1 },
  taskset: { flags: ['-a', '--all-tasks'], values: ['-c', '--cpu-list'], positional: 1, valuesCancelPositional: ['-c', '--cpu-list'] },
  flock: { flags: ['-s', '-x', '-u', '-n', '-o', '-F', '--shared', '--exclusive', '--unlock', '--nonblock', '--no-fork'], values: ['-w', '-E', '--timeout', '--conflict-exit-code'], positional: 1 },
}
const WRAPPERS = new Set(Object.keys(WRAPPER_SPECS))

/** 래퍼의 옵션·자리 인자를 건너뛴 다음 위치. 해석할 수 없으면 null */
function skipWrapperArgs(name: string, toks: string[], start: number): number | null {
  const spec = WRAPPER_SPECS[name]
  let k = start
  let positional = spec.positional ?? 0
  while (k < toks.length) {
    const t = toks[k]
    if (t === '--') {
      k++
      break
    }
    if (t === '-') {
      if (!spec.flags.includes('-')) break
      k++
      continue
    }
    if (!t.startsWith('-')) break
    if (spec.numeric && /^-\d+$/.test(t)) {
      k++
      continue
    }
    k++
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      const key = eq < 0 ? t : t.slice(0, eq)
      if (spec.values.includes(key)) {
        if (eq < 0) k++
        if (spec.valuesCancelPositional?.includes(key)) positional = 0
      } else if (!(spec.flags.includes(key) || spec.opt?.includes(key))) return null
      continue
    }
    // 짧은 옵션 묶음: -xn5 · -n 5 · -n5
    for (let c = 1; c < t.length; c++) {
      const o = `-${t[c]}`
      if (spec.values.includes(o)) {
        if (spec.valuesCancelPositional?.includes(o)) positional = 0
        if (c === t.length - 1) k++ // 값이 따로 온다
        break // 나머지는 붙은 값
      }
      if (spec.opt?.includes(o)) break
      if (!spec.flags.includes(o)) return null
    }
  }
  // 자리 인자(timeout의 시간, flock의 파일 등). 그 뒤에 또 옵션이 오면(flock /tmp/l -c "…") 해석하지 않는다
  const hadPositional = positional > 0
  for (; positional > 0 && k < toks.length; positional--) k++
  if (hadPositional && k < toks.length && toks[k].startsWith('-')) return null
  return k
}

/** 래퍼 뒤 명령을 해석할 수 없을 때 돌려주는 표식 — $ 로 시작해 자동 승인이 대기로 처리한다 */
const UNPARSEABLE = '$unparseable-wrapper'
/** 제어문 키워드: 뒤가 명령 자리다 (A1) */
const CONTROL = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'for', 'until', 'case', 'esac', 'function', 'select', '!', '{', '}'])

/** 토막에서 환경 변수 대입·감싸는 앞말·제어문 키워드를 걷어내고 실제 명령과 인자를 고른다 */
export function resolveCommand(seg: Segment): { cmd: string | null; args: string[]; localScript: boolean; via: string[]; assigns: string[] } {
  // 빈 인자('')도 자리를 차지한다 (옵션 값 위치가 밀리면 sed -e '' -e 'w …' 같은 판정이 어긋난다)
  const toks = seg.tokens
  let k = 0
  /** 거쳐 온 감싸는 앞말 (xargs 뒤 명령 제한용) */
  const via: string[] = []
  /** 명령 앞(래퍼 뒤 포함)의 `이름=값` 대입 */
  const assigns: string[] = []
  for (;;) {
    while (k < toks.length && ASSIGN.test(toks[k])) assigns.push(toks[k++])
    if (k < toks.length && REDIRECT.test(toks[k])) {
      k += REDIRECT_ALONE.test(toks[k]) ? 2 : 1
      continue
    }
    // for·select·case·function 머리줄은 낱말이 데이터다 (본문은 다음 토막에서 따로 본다)
    if (k < toks.length && ['for', 'select', 'case', 'function'].includes(toks[k])) return { cmd: null, args: [], localScript: false, via, assigns }
    const name = k < toks.length ? base(toks[k]) : ''
    if (k < toks.length && CONTROL.has(toks[k])) {
      k++
      continue
    }
    // command -v/-V 는 명령을 찾기만 한다
    if (name === 'command' && /^-[vV]$/.test(toks[k + 1] ?? '')) return { cmd: null, args: [], localScript: false, via, assigns }
    if (name && WRAPPERS.has(name)) {
      const next = skipWrapperArgs(name, toks, k + 1)
      if (next === null || (name === 'env' && toks.slice(k + 1, next).some((t) => /^-[A-Za-z]*S|^--split-string/.test(t)))) return { cmd: UNPARSEABLE, args: [], localScript: false, via, assigns }
      via.push(name)
      k = next
      continue
    }
    break
  }
  if (k >= toks.length) return { cmd: null, args: [], localScript: false, via, assigns }
  const raw = toks[k]
  const localScript = /^(\.\/|\.\.\/|~\/)/.test(raw) || (raw.includes('/') && !raw.startsWith('/'))
  return { cmd: raw, args: toks.slice(k + 1), localScript, via, assigns }
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
