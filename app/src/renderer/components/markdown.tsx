import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { useOffice, type View } from '@/store'

// 직원 보고·일감 설명은 대부분 마크다운이라, 좁은 카드에서도 깨지지 않게 긴 경로·코드는 줄바꿈한다
// 한국어는 **"굵게"**에 처럼 조사가 바로 붙어 기본 규칙으론 굵게가 안 풀리므로 CJK 플러그인을 쓴다
const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-[1.15em] font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1 text-[1.08em] font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-2 mb-1 font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  a: ({ children, href }) =>
    // 화면 이동 링크 (비서 답의 [결재함 열기](#view=inbox)) — 앱 안에서 그 화면으로
    href?.startsWith(VIEW_LINK) ? (
      <button type="button" onClick={() => openView(href.slice(VIEW_LINK.length))} className="text-primary underline underline-offset-2">
        {children}
      </button>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
        {children}
      </a>
    ),
  blockquote: ({ children }) => <blockquote className="text-muted-foreground my-1.5 border-l-2 pl-3">{children}</blockquote>,
  hr: () => <hr className="my-3" />,
  pre: ({ children }) => <pre className="bg-background/60 my-1.5 overflow-x-auto rounded border p-2 text-[0.92em]">{children}</pre>,
  code: ({ children, className }) => <code className={cn('bg-background/60 rounded px-1 py-px font-mono text-[0.92em] [pre_&]:bg-transparent [pre_&]:p-0', className)}>{children}</code>,
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-[0.95em]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
  input: ({ checked }) => <input type="checkbox" checked={checked} readOnly className="mr-1 align-middle" />,
}

const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly]

const VIEW_LINK = '#view='
const VIEWS = new Set<View>(['secretary', 'map', 'dashboard', 'org', 'board', 'inbox', 'chat', 'meeting', 'manuals', 'knowledge', 'gallery', 'schedule', 'report', 'payroll', 'settings', 'updates', 'shop'])
function openView(view: string) {
  const s = useOffice.getState()
  // 직원 고용은 화면이 아니라 창이라 따로
  if (view === 'hire') return s.setHireOpen(true)
  if (!VIEWS.has(view as View)) return
  s.setQuickSecretaryOpen(false)
  s.setView(view as View)
}

/** 마크다운 본문 (GFM: 표·체크리스트·취소선). 파싱이 무거워 글이 같으면 다시 그리지 않는다 */
export const Markdown = memo(function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('selectable min-w-0 break-words [overflow-wrap:anywhere]', className)}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
})
