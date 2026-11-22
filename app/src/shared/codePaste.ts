// 붙여넣은 여러 줄 글이 코드인지 가려 ``` 로 감싼다 (#19 — 편집기에서 복사한 코드가 마크다운으로 깨지던 문제)
// 오탐이 더 나쁘다: 일반 글·목록·메모는 그대로 두고, 줄 대부분이 코드 모양일 때만 감싼다

/** 코드 줄 모양 — 하나라도 맞으면 코드 줄 */
const CODE_LINE = [
  /[;{}]\s*$/, // 문장 끝 ; { }
  /^\s*[}\])]/, // 닫는 괄호로 시작
  /[A-Za-z_$][\w$]*\([^()]*\)\s*[;:{]?\s*$/, // 함수 부르기·정의로 끝남 foo(a, b)
  /^\s*(?:import|export|const|let|var|function|def|class|return|public|private|protected|static|async|await|fn|func|struct|interface|enum|#include|#define)\b/,
  /^\s*(?:if|for|while|switch|catch)\s*\(/,
  /^\s*(?:if|elif|else|for|while|try|except|finally|with|def|class)\b[^\n]*:\s*$/, // 파이썬 블록
  /^\s*from\s+\S+\s+import\b/,
  /^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|JOIN|GROUP BY|ORDER BY)\b/,
  /^\s*<\/?[A-Za-z][\w-]*(?:\s[^>]*)?\/?>/, // HTML·JSX 태그
  /^\s*(?:\/\/|\/\*|\*\/|\*\s|#!)/, // 주석
  /^\s*"[^"\n]+"\s*:/, // JSON 키
  /(?:===|!==|&&|\|\||::|\+=|-=)/,
  /^\s*[A-Za-z_$][\w$.[\]'"]*\s*[+\-*/%]?=(?!=)\s*\S/, // 대입 a = 1
  /^(?:\t| {2,})\S.*[=(){}[\];<>]/, // 들여쓰기 + 기호
]

/** 사람 글 줄 — 목록·한중일 문장 끝(코드 주석 제외) */
const PROSE_LINE = [/^\s*(?:[-*+]|\d+[.)])\s+\S/, /[가-힣ぁ-んァ-ヶ一-龥][.!?。！？~)]?\s*$/]
const COMMENT = /^\s*(?:\/\/|\/\*|\*|#|--)/

const isCodeLine = (l: string) => CODE_LINE.some((re) => re.test(l))
const isProseLine = (l: string) => !COMMENT.test(l) && !isCodeLine(l) && PROSE_LINE.some((re) => re.test(l))

/** 세 줄 이상이고, 이미 ``` 가 없고, 코드 줄이 60% 이상·사람 글 줄이 20% 미만이면 코드 */
export function looksLikeCode(text: string): boolean {
  if (text.includes('```')) return false
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
  if (lines.length < 3) return false
  const code = lines.filter(isCodeLine).length
  const prose = lines.filter(isProseLine).length
  return code / lines.length >= 0.6 && prose / lines.length < 0.2
}

/** 커서 앞 글에 ``` 가 홀수 번 — 이미 코드 블록 안에 붙여넣는 중 */
export const isInsideFence = (before: string) => (before.match(/```/g)?.length ?? 0) % 2 === 1

/** 감싼 글: 앞 글이 줄 중간이면 줄을 바꿔 시작하고, 끝난 뒤 다음 줄에서 이어 쓰게 한다 */
export function fenceCode(text: string, before: string): string {
  const body = text.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '')
  const lead = before && !before.endsWith('\n') ? '\n' : ''
  return `${lead}\`\`\`\n${body}\n\`\`\`\n`
}
