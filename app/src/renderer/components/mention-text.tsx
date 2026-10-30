import { useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import type { Parent, Root, RootContent } from 'mdast'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { mentionSpans, type MentionTarget } from '@shared/mention'

// 단체방 @이름 강조 — 받는 사람을 고르는 규칙(mentionSpans)과 같아서 강조된 이름만 실제로 지시를 받는다.
// 굵기·여백을 바꾸면 입력칸 겹침 레이어와 글자 자리가 어긋나므로 배경·글자색만 바꾼다
const MENTION = 'rounded-[3px] bg-primary/15 text-primary dark:bg-primary/25'
/** 강조색 바탕의 말풍선(내가 보낸 말) 안에서는 뒤집어 칩처럼 */
const MENTION_ON_PRIMARY = 'rounded-[3px] bg-primary-foreground text-primary'

function highlight(text: string, targets: MentionTarget[], className: string): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const s of mentionSpans(text, targets)) {
    if (s.start > at) out.push(text.slice(at, s.start))
    out.push(
      <span key={s.start} className={className}>
        {text.slice(s.start, s.end)}
      </span>,
    )
    at = s.end
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

/** 글자 그대로의 말풍선 속 @이름 강조 */
export function MentionText({ text, targets, onPrimary = false }: { text: string; targets: MentionTarget[]; onPrimary?: boolean }) {
  return <>{highlight(text, targets, onPrimary ? MENTION_ON_PRIMARY : MENTION)}</>
}

/** 마크다운 말풍선 속 @이름 강조 (코드 블록·인라인 코드는 text 노드가 아니라 건드리지 않는다) */
export function remarkMentions(targets: MentionTarget[]) {
  const visit = (node: Parent) => {
    node.children = node.children.flatMap((child): RootContent[] => {
      if (child.type !== 'text') {
        if ('children' in child) visit(child)
        return [child]
      }
      const spans = mentionSpans(child.value, targets)
      if (spans.length === 0) return [child]
      const parts: RootContent[] = []
      let at = 0
      for (const s of spans) {
        if (s.start > at) parts.push({ type: 'text', value: child.value.slice(at, s.start) })
        parts.push({ type: 'text', value: child.value.slice(s.start, s.end), data: { hName: 'span', hProperties: { className: MENTION.split(' ') } } })
        at = s.end
      }
      if (at < child.value.length) parts.push({ type: 'text', value: child.value.slice(at) })
      return parts
    }) as typeof node.children
  }
  return () => (tree: Root) => visit(tree)
}

/**
 * @이름을 강조하는 입력칸: textarea 뒤에 같은 글을 같은 자리에 그린 레이어를 깔고, 멘션이 있을 때만 textarea 글자를 투명하게 한다.
 * 커서·선택·한글 조합은 textarea가 그대로 맡는다 (조합 중인 글자도 value로 들어와 레이어에 그려진다)
 */
export function MentionTextarea({ value, targets, className, onScroll, onCompositionStart, onCompositionEnd, ...props }: Omit<ComponentProps<typeof Textarea>, 'value'> & { value: string; targets: MentionTarget[] }) {
  // 한글 조합 중에는 textarea 글자를 그대로 보인다 — 조합 표시(밑줄·바탕)가 레이어 글자를 가리는 기기가 있다 (같은 자리라 겹쳐도 한 글자로 보인다)
  const [isComposing, setIsComposing] = useState(false)
  const backdrop = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const parts = useMemo(() => highlight(value, targets, MENTION), [value, targets])
  const hasMention = parts.some((p) => typeof p !== 'string')
  // 여러 줄로 넘쳐 스크롤되면 레이어도 같은 만큼 올린다 (글을 바꾸면 textarea가 커서 쪽으로 스크롤한다)
  const syncScroll = () => {
    if (backdrop.current && area.current) backdrop.current.scrollTop = area.current.scrollTop
  }
  useLayoutEffect(syncScroll)
  return (
    <div className="relative min-w-0 flex-1">
      {hasMention && (
        <div
          ref={backdrop}
          aria-hidden
          className="phone:text-base pointer-events-none absolute inset-0 overflow-y-auto rounded-[var(--radius)] border border-transparent px-3 py-[7px] text-sm break-words whitespace-pre-wrap [overflow-wrap:break-word]"
        >
          {parts}
          {/* 끝이 줄바꿈이면 빈 마지막 줄도 높이를 갖게 */}
          {'​'}
        </div>
      )}
      <Textarea
        ref={area}
        value={value}
        onScroll={(e) => {
          syncScroll()
          onScroll?.(e)
        }}
        onCompositionStart={(e) => {
          setIsComposing(true)
          onCompositionStart?.(e)
        }}
        onCompositionEnd={(e) => {
          setIsComposing(false)
          onCompositionEnd?.(e)
        }}
        className={cn('relative', hasMention && !isComposing && 'caret-foreground selection:bg-primary/25 text-transparent', className)}
        {...props}
      />
    </div>
  )
}
