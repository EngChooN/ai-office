// 비밀값 가리기: 명령·요약에 섞인 토큰·비밀번호·인증 머리글을 화면·기록·휴대폰에 그대로 남기지 않는다
// (자동결재 "자동 처리됨" 목록·autoApproveLog, 비서 조회 결과·대신 답한 기록)

const MASK = '***'

type Rule = [RegExp, string | ((...m: string[]) => string)]

const RULES: Rule[] = [
  // Authorization: Bearer xxx / Authorization=xxx
  [/(authorization\s*[:=]\s*)(bearer\s+|basic\s+|token\s+)?[^\s'",;&]+/gi, `$1$2${MASK}`],
  // Bearer xxx (머리글 이름 없이)
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${MASK}`],
  // --token xxx / --password=xxx / -p xxx 는 너무 넓어 빼고 긴 옵션만
  [/(--(?:token|password|passwd|api-key|apikey|secret|auth)(?:=|\s+))[^\s'"]+/gi, `$1${MASK}`],
  // 잘 알려진 키 모양
  [/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/g, MASK],
  // https://user:pass@host (스킴은 낱말 묶음의 첫머리에서만 시작해 선형 시간 — 'ab-'·'a.' 반복에서 느려지지 않게)
  [/((?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${MASK}@`],
]

/** key·token 앞에 붙으면 비밀이 아닌 이름 (foreign_key·primaryKey·sortKey·cache_key·public_key·next_page_token …) */
const NON_SECRET_LEAD = new Set(['foreign', 'primary', 'sort', 'partition', 'cache', 'idempotency', 'public', 'page', 'next', 'cursor', 'order', 'group', 'shard', 'hash', 'row', 'index', 'composite', 'unique', 'lookup'])

/** 비밀을 뜻하는 이름인가: 끝이 token·secret·password·passwd·pwd·key·apikey (DB_PASSWORD·githubToken·x-api-key). monkey 처럼 낱말 안에 든 key나 foreign_key 같은 이름은 아니다 */
function isSecretName(k: string) {
  if (!(/(^|[_.-])(token|secret|password|passwd|pwd|key|apikey)$/i.test(k) || /[a-z0-9](Token|Secret|Password|Passwd|Pwd|Key|ApiKey)$/.test(k))) return false
  const words = k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
  const last = words[words.length - 1]
  return !((last === 'key' || last === 'token') && words.length > 1 && NON_SECRET_LEAD.has(words[words.length - 2]))
}

/** 이름 + 구분자 (name= · name: · "name": · \"name\":) — 값은 비밀 이름일 때만 따로 읽는다 (긴 글에서 이름마다 값 끝까지 훑지 않게, 선형 시간) */
const NAME_SEP = /(?<![A-Za-z0-9_.-])([A-Za-z][A-Za-z0-9_.-]*)(\\?["']?)(\s*[=:]\s*)/g
/** 값: 따옴표 짝·이스케이프를 맞춰 전체 (숫자·불리언 포함) */
const VALUE = /\\"(?:(?!\\").)*(?:\\")?|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|[^\s,;&}\]"']+/y

function maskAssignments(text: string) {
  const re = new RegExp(NAME_SEP.source, 'g')
  const valueRe = new RegExp(VALUE.source, 'y')
  let out = ''
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const [head, name, q, sep] = m
    if (!isSecretName(name)) continue // 값 쪽에 든 다른 이름(예: URL의 ?token=)은 이어서 찾는다
    valueRe.lastIndex = m.index + head.length
    const v = valueRe.exec(text)
    if (!v) continue
    const value = v[0]
    const quote = value.startsWith('\\"') ? '\\"' : /^["']/.test(value) ? value[0] : ''
    out += text.slice(last, m.index) + `${name}${q}${sep}${quote}${MASK}${quote}`
    last = re.lastIndex = m.index + head.length + value.length
  }
  return out + text.slice(last)
}

export function maskSecrets(text: string): string {
  return maskAssignments(RULES.reduce((t, [re, to]) => t.replace(re, to as string), text))
}
