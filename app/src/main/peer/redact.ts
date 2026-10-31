// 다른 PC로 나가는 글(결과·결재 요약·진행 말풍선)에서 절대 경로와 토큰·비밀번호 같은 문자열을 가린다 (설계서 10절, 전송 경계에서 한 번)
// 보수적으로: 확실히 민감해 보이는 것만 가린다. 상대 경로·일반 문장은 그대로 둔다

const MASK = '‹가림›'

const RULES: [RegExp, string | ((m: string, ...g: string[]) => string)][] = [
  // 비밀 키=값 (password: xxx, token=xxx, "api_key":"xxx", password="공백 든 값")
  [/((?:pass(?:word|wd)?|secret|token|api[_-]?key|access[_-]?key|auth(?:orization)?|credential)s?["']?\s*[:=]\s*)("(?:[^"\\\n]|\\.)+"|'(?:[^'\\\n]|\\.)+'|["']?[^\s"',;]{4,})/gi, (_m, k: string) => `${k}${MASK}`],
  // Authorization: Bearer xxx
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, (_m, k: string) => `${k} ${MASK}`],
  // 알려진 토큰 모양
  [/\bsk-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, MASK],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  // 연결 URL 안의 비밀번호 (scheme://user:pass@host)
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi, (_m, head: string) => `${head}:${MASK}@`],
  // 절대 경로: /Users/…·/home/…·/var/…·/private/…·/Volumes/…·/tmp/…·~/…·C:\… → 마지막 이름만 남긴다
  [/(?:^|(?<=[\s"'`(=:,]))(?:\/(?:Users|home|var|private|Volumes|tmp|opt|etc|mnt|root|srv|usr)\/[^\s"'`)<>|,;]+|~\/[^\s"'`)<>|,;]+|[A-Za-z]:\\[^\s"'`)<>|,;]+)/g, (m: string) => {
    const base = m.split(/[\\/]/).filter(Boolean).pop() ?? ''
    return `…/${base}`
  }],
  // 그 밖의 절대 경로 (/data/internal/a.txt): 두 단계 이상일 때만. URL(//)·and/or·상대 경로는 앞 경계에서 걸러진다
  [/(?:^|(?<=[\s"'`(=:,]))\/(?!\/)[^\s/"'`)<>|,;]+\/[^\s"'`)<>|,;]+/g, (m: string) => `…/${m.split('/').filter(Boolean).pop() ?? ''}`],
  // 길고 무작위로 보이는 문자열 (base64/hex 32자 이상)
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}(?=$|[\s"',.;)])/g, MASK],
  [/\b[0-9a-f]{32,}\b/gi, MASK],
]

export function redactPeerText(text: string): string {
  let out = text
  for (const [re, to] of RULES) out = out.replace(re, to as string)
  return out
}

/** 객체 안의 모든 문자열을 가린다 (결재 summaryI18n·questions 같은 모양을 모르는 값) */
export function redactPeerDeep<T>(v: T, depth = 0): T {
  if (typeof v === 'string') return redactPeerText(v) as T
  if (depth > 6 || v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map((x) => redactPeerDeep(x, depth + 1)) as T
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, redactPeerDeep(x, depth + 1)])) as T
}
