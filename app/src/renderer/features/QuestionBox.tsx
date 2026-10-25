import { useState } from 'react'
import { SendIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Approval } from '@shared/types'
import { t } from '@shared/i18n'

/** 결재·질문 대신 그 직원이 하던 일을 통째로 멈춘다 (업무 카드는 할 일로 돌아간다) */
export function StopWorkButton({ staffId, className }: { staffId: string; className?: string }) {
  const handleStop = () => {
    if (window.confirm(t('question.interruptConfirm'))) void window.office.interrupt(staffId)
  }
  return (
    <Button size="sm" variant="ghost" onClick={handleStop} className={cn('text-muted-foreground', className)}>
      <SquareIcon /> {t('question.interrupt')}
    </Button>
  )
}

/** 직원 질문(AskUserQuestion): 선택지를 고르거나 직접 적어 답한다 */
export function QuestionBox({ approval }: { approval: Approval }) {
  const questions = approval.questions ?? []
  // 외부 직원 질문은 넘기면 원래 창에 다시 뜬다
  const isExternal = approval.staffId.startsWith('ext:')
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})

  const toggle = (question: string, label: string, isMulti: boolean) =>
    setPicked((p) => {
      const cur = p[question] ?? []
      const next = isMulti ? (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]) : cur.includes(label) ? [] : [label]
      return { ...p, [question]: next }
    })
  // 직접 적은 답이 있으면 그것을, 아니면 고른 선택지를 쉼표로 묶어 보낸다
  const answerOf = (question: string) => custom[question]?.trim() || (picked[question] ?? []).join(', ')
  const isReady = questions.every((q) => answerOf(q.question))

  const handleSend = () => {
    if (!isReady) return
    void window.office.answerQuestion(approval.id, Object.fromEntries(questions.map((q) => [q.question, answerOf(q.question)])))
  }

  return (
    <div className="flex flex-col gap-3">
      {questions.map((q) => (
        <div key={q.question} className="flex flex-col gap-1.5">
          <div className="text-sm font-medium break-words">
            {q.header && <span className="bg-primary/15 text-primary mr-1.5 rounded px-1.5 text-[10px] font-semibold">{q.header}</span>}
            {q.question}
            {q.multiSelect && <span className="text-muted-foreground text-xs"> {t('question.multi')}</span>}
          </div>
          <div className="flex flex-col gap-1">
            {q.options.map((o) => {
              const isOn = (picked[q.question] ?? []).includes(o.label)
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => toggle(q.question, o.label, q.multiSelect)}
                  className={cn('rounded-lg border px-3 py-1.5 text-left text-xs', isOn ? 'border-primary bg-primary/10' : 'hover:bg-accent')}
                >
                  <div className="font-medium">{o.label}</div>
                  {o.description && <div className="text-muted-foreground">{o.description}</div>}
                </button>
              )
            })}
          </div>
          <Input
            value={custom[q.question] ?? ''}
            onChange={(e) => setCustom((c) => ({ ...c, [q.question]: e.target.value }))}
            placeholder={t('question.customPlaceholder')}
            className="h-8 text-xs"
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSend} disabled={!isReady}>
          <SendIcon /> {t('question.answer')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void window.office.decide(approval.id, false)}>
          {isExternal ? t('question.answerExternal') : t('question.skip')}
        </Button>
        {!isExternal && <StopWorkButton staffId={approval.staffId} className="ml-auto" />}
      </div>
    </div>
  )
}
