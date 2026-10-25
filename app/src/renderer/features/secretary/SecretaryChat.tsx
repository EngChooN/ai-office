import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from '@/components/markdown'
import { handleComposerKey, NEWLINE_HINT } from '@/lib/composerKeys'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { EMPTY_SECRETARY, formatTokens, type SecretaryMessage } from '@shared/types'
import { ConfirmCard } from './ConfirmCard'
import { EditCompareCard } from './EditCompareCard'
import { useSecretaryDraft } from './draft'
import { SecretaryFace } from './SecretaryFace'
import { fmtDate, t } from '@shared/i18n'

// 비서 대화: 단체방 말풍선·입력창과 같은 모양 (secretary-ui.md 2·3절). 비서 화면과 ⌘K 빠른 창이 함께 쓴다

export const useSecretary = () => useOffice((s) => s.secretary ?? EMPTY_SECRETARY)

const timeText = (ts: number) => fmtDate(ts, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 예시 질문 (완료 기준 ★ 질문에서) — 이름이 들어가는 칩은 이 사무실 직원으로 채운다 */
export function useExampleQuestions() {
  const staff = useOffice((s) => s.staff)
  const hired = staff.filter((s) => s.kind === 'hired')
  const qa = hired.find((s) => /QA|큐에이|테스트/i.test(s.role)) ?? hired[0]
  const designer = hired.find((s) => /디자/.test(s.role))
  return [
    t('secretary.ex.hire'),
    t('secretary.ex.status'),
    t('secretary.ex.approvals'),
    t('secretary.ex.overnight'),
    designer ? t('secretary.ex.designNamed', { name: designer.name }) : t('secretary.ex.design'),
    qa ? t('secretary.ex.guideNamed', { name: qa.name }) : t('secretary.ex.guide'),
  ]
}

export function ExampleChips({ className, onPick }: { className?: string; onPick?: () => void }) {
  const questions = useExampleQuestions()
  const { isBusy } = useSecretary()
  return (
    <div className={cn('flex gap-1.5', className)}>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          disabled={isBusy}
          onClick={() => {
            void window.office.secretaryAsk(q)
            onPick?.()
          }}
          className="hover:bg-accent shrink-0 rounded-full border px-2.5 py-1 text-xs disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  )
}

export const SecretaryBubble = memo(function SecretaryBubble({ message: m, onRetry }: { message: SecretaryMessage; onRetry?: () => void }) {
  if (m.role === 'notice')
    return (
      <div className="flex justify-center">
        <span className="bg-muted text-muted-foreground max-w-[90%] rounded-2xl px-3 py-1 text-xs whitespace-pre-wrap">{m.text}</span>
      </div>
    )
  if (m.role === 'me')
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="bg-primary text-primary-foreground selectable max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
        <span className="text-muted-foreground text-[10px]">{timeText(m.ts)}</span>
      </div>
    )
  return (
    <div className="flex gap-2">
      <SecretaryFace />
      <div className={cn('flex min-w-0 flex-col gap-0.5', m.card ? 'flex-1' : 'max-w-[75%]')}>
        <span className="text-muted-foreground text-xs">{t('secretary.name')}</span>
        {m.card ? (
          m.card.kind === 'edit' ? (
            <EditCompareCard card={m.card} />
          ) : (
            <ConfirmCard card={m.card} />
          )
        ) : (
          <div className="bg-card selectable min-w-0 rounded-2xl border px-3 py-2 text-sm">
            {m.isError ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-status-error text-xs">{m.text}</span>
                {onRetry && (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    {t('secretary.resend')}
                  </Button>
                )}
              </div>
            ) : (
              <Markdown>{m.text}</Markdown>
            )}
          </div>
        )}
        <span className="text-muted-foreground text-[10px]">
          {timeText(m.ts)}
          {m.tokens ? ` · ${t('secretary.replyTokens', { n: formatTokens(m.tokens) })}` : ''}
        </span>
      </div>
    </div>
  )
})

/** 대화 목록 (아래로 스크롤 고정). since를 주면 그 뒤 대화만 (빠른 창) */
export function SecretaryMessages({ since, className, empty }: { since?: number; className?: string; empty?: React.ReactNode }) {
  const { messages, isBusy, activity } = useSecretary()
  const shown = since ? messages.filter((m) => m.ts >= since) : messages
  const endRef = useRef<HTMLDivElement>(null)
  // 중괄호로 감싼다: 요즘 Chrome의 scrollIntoView는 Promise를 돌려줘서 그대로 돌려주면 React가 정리 함수로 부른다
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [shown.length, isBusy, shown.at(-1)?.card?.status])
  const lastMine = [...messages].reverse().find((m) => m.role === 'me')
  const retry = lastMine ? () => void window.office.secretaryAsk(lastMine.text) : undefined
  if (shown.length === 0 && !isBusy) return <>{empty}</>
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {shown.map((m) => (
        <SecretaryBubble key={m.id} message={m} onRetry={m.isError ? retry : undefined} />
      ))}
      {isBusy && (
        <div className="flex items-center gap-2">
          <SecretaryFace />
          <span className="text-muted-foreground animate-pulse text-xs">{activity || t('secretary.thinking')}</span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}

export function SecretaryComposer({ autoFocus, onSent }: { autoFocus?: boolean; onSent?: () => void }) {
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const prefill = useSecretaryDraft((s) => s.prefill)
  useEffect(() => {
    if (!prefill) return
    setDraft(prefill.text)
    ref.current?.focus()
  }, [prefill])
  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void window.office.secretaryAsk(text)
    onSent?.()
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => handleComposerKey(e, send, setDraft)
  return (
    <div className="flex items-end gap-2">
      <Textarea
        ref={ref}
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={t('secretary.placeholder', { hint: String(NEWLINE_HINT) })}
        className="field-sizing-content max-h-32 min-h-9 resize-none py-[7px]"
      />
      <Button size="icon" onClick={send} disabled={!draft.trim()} aria-label={t('secretary.send')}>
        <SendIcon />
      </Button>
    </div>
  )
}
