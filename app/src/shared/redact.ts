// 비밀값 가리기: 명령·요약에 섞인 토큰·비밀번호·인증 머리글을 화면·기록·휴대폰에 그대로 남기지 않는다
// (자동결재 "자동 처리됨" 목록·autoApproveLog, 비서 조회 결과·대신 답한 기록)

const MASK = '***'

const RULES: [RegExp, string][] = [
  // Authorization: Bearer xxx / Authorization=xxx
  [/(authorization\s*[:=]\s*)(bearer\s+|basic\s+|token\s+)?[^\s'",;&]+/gi, `$1$2${MASK}`],
  // Bearer xxx (머리글 이름 없이)
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${MASK}`],
  // token=… password=… api_key: … (따옴표 안 값 포함)
  [/\b((?:access|refresh|id|auth|api|session|private|client)?[_-]?(?:token|key|secret|password|passwd|pwd|apikey))(\s*[=:]\s*)(["']?)[^\s"'&,;]+\3/gi, `$1$2$3${MASK}$3`],
  // --token xxx / --password=xxx / -p xxx 는 너무 넓어 빼고 긴 옵션만
  [/(--(?:token|password|passwd|api-key|apikey|secret|auth)(?:=|\s+))[^\s'"]+/gi, `$1${MASK}`],
  // 잘 알려진 키 모양
  [/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/g, MASK],
  // https://user:pass@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${MASK}@`],
]

export function maskSecrets(text: string): string {
  return RULES.reduce((t, [re, to]) => t.replace(re, to), text)
}
