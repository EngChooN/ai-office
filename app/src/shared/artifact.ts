// 아티팩트: 직원이 만든 HTML·마크다운 결과물을 앱 안에서 안전하게 보여 주기 위한 규칙 (파일을 만지지 않는 순수 함수)
import type { ArtifactKind } from './types.ts'

export const ARTIFACT_SCHEME = 'office-artifact'
export const ARTIFACT_MAX_BYTES = 5 * 1024 * 1024
export const ARTIFACT_TITLE_MAX = 80

/** 외부 라이브러리는 이 세 곳에서만 불러온다 */
export const ARTIFACT_CDNS = ['https://cdnjs.cloudflare.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net']

/**
 * 전용 주소 응답에 붙이는 CSP. 인라인 script·style은 허용하고, 네트워크 전송(connect)·폼·페이지 안의 base는 막는다.
 * sandbox 지시문으로 iframe 속성과 상관없이 팝업·페이지 이동·다운로드·폼 제출을 막고 앱과 다른 출처로 가둔다.
 */
export const ARTIFACT_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${ARTIFACT_CDNS.join(' ')}`,
  `style-src 'unsafe-inline' ${ARTIFACT_CDNS.join(' ')}`,
  'img-src data: blob:',
  `font-src data: ${ARTIFACT_CDNS.join(' ')}`,
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  'sandbox allow-scripts',
].join('; ')

export function artifactKindOf(file: string): ArtifactKind | null {
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
  if (ext === '.html' || ext === '.htm') return 'html'
  if (ext === '.md') return 'md'
  return null
}

export type ArtifactCheck = { ok: true; kind: ArtifactKind } | { ok: false; reason: 'ext' | 'size' | 'empty' }

/** 올릴 수 있는 파일인지: 확장자(.html·.htm·.md)와 크기(5MB 이하, 빈 파일 아님) */
export function checkArtifactFile(name: string, size: number): ArtifactCheck {
  const kind = artifactKindOf(name)
  if (!kind) return { ok: false, reason: 'ext' }
  if (size <= 0) return { ok: false, reason: 'empty' }
  if (size > ARTIFACT_MAX_BYTES) return { ok: false, reason: 'size' }
  return { ok: true, kind }
}

export const cleanArtifactTitle = (title: string) => title.replace(/\s+/g, ' ').trim().slice(0, ARTIFACT_TITLE_MAX)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isSafeHref = (u: string) => /^(https?:|mailto:|#)/i.test(u.trim())

function inline(raw: string): string {
  const codes: string[] = []
  let s = raw.replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(`<code>${esc(c)}</code>`) - 1}\u0000`)
  s = esc(s)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => (/^data:image\//i.test(src.replace(/&amp;/g, '&')) ? `<img alt="${alt}" src="${src}">` : `[${alt}]`))
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => (isSafeHref(href.replace(/&amp;/g, '&')) ? `<a href="${href}" rel="noreferrer noopener">${text}</a>` : text))
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)])
}

const splitRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-')

/** 마크다운 → HTML 조각. 원문 속 HTML은 모두 글자로 바꾸고(스크립트 불가), 링크는 http(s)·mailto만 */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const para: string[] = []
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
    para.length = 0
  }
  while (i < lines.length) {
    const line = lines[i]
    const fence = /^\s*```(\w*)/.exec(line)
    if (fence) {
      flush()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      flush()
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      out.push('<hr>')
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush()
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]))
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    if (/^\s*>/.test(line)) {
      flush()
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${markdownToHtml(buf.join('\n'))}</blockquote>`)
      continue
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (li) {
      flush()
      const tag = /\d/.test(li[1]) ? 'ol' : 'ul'
      const items: string[] = []
      while (i < lines.length) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (!m) break
        items.push(`<li>${inline(m[2])}</li>`)
        i++
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }
    if (!line.trim()) flush()
    else para.push(line.trim())
    i++
  }
  flush()
  return out.join('\n')
}

const MD_STYLE =
  ':root{color-scheme:light dark}body{font:15px/1.7 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46rem;margin:0 auto;padding:1.5rem 1.25rem;word-break:break-word}' +
  'h1,h2,h3{line-height:1.3}pre{overflow:auto;padding:.75rem 1rem;border-radius:8px;background:rgba(127,127,127,.15)}code{font:13px ui-monospace,Menlo,Consolas,monospace;background:rgba(127,127,127,.15);padding:.1em .3em;border-radius:4px}pre code{background:none;padding:0}' +
  'table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid rgba(127,127,127,.4);padding:.35rem .7rem}blockquote{margin:1em 0;padding:.1rem 1rem;border-left:3px solid rgba(127,127,127,.5);opacity:.85}img{max-width:100%}hr{border:0;border-top:1px solid rgba(127,127,127,.4)}'

/** 응답 본문: html은 그대로, md는 HTML 문서로 바꿔서 */
export function artifactDocument(kind: ArtifactKind, text: string, title: string): string {
  if (kind === 'html') return text
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${MD_STYLE}</style></head><body>${markdownToHtml(text)}</body></html>`
}

/** 브라우저로 열 사본: 응답 머리글을 못 붙이니 같은 CSP를 meta로 넣는다 (sandbox는 meta로 못 쓰므로 뺀다) */
export function withCspMeta(html: string): string {
  const csp = ARTIFACT_CSP.split('; ').filter((d) => !d.startsWith('sandbox')).join('; ')
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  // 항상 맨 앞에 둔다 — <head>가 스크립트 뒤에 나오는 문서도 정책이 본문보다 먼저 적용된다 (doctype이 있으면 그 뒤)
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  const at = doctype ? doctype[0].length : 0
  return `${html.slice(0, at)}${meta}${html.slice(at)}`
}

/** 주소(office-artifact://<id>/<버전>)에서 id·버전 읽기 — 형식이 다르면 null (경로로 파일을 찾지 않는다) */
export function parseArtifactUrl(raw: string): { id: string; version: number } | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== `${ARTIFACT_SCHEME}:`) return null
  const m = /^\/(\d{1,6})\/?$/.exec(u.pathname)
  if (!m || !/^[a-f0-9-]{36}$/.test(u.hostname)) return null
  return { id: u.hostname, version: Number(m[1]) }
}

export const artifactUrl = (id: string, version: number) => `${ARTIFACT_SCHEME}://${id}/${version}`
