import { useState } from 'react'
import { CheckIcon, SendIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Approval } from '@shared/types'
import { collectAnswers, togglePick, type Custom, type Picked } from '@shared/questionAnswer'
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

/** 직원 질문(AskUserQuestion): 선택지를 고르거나 직접 적어 답한다.
 * 바탕화면 비서 펼침 창은 답하기·넘기기를 자기 통로(pet:answer·pet:skip)로 바꿔 끼우고, 하던 일 멈추기는 빼고 쓴다 (isCompact) */
export function QuestionBox({
  approval,
  onAnswer = (answers) => void window.office.answerQuestion(approval.id, answers),
  onSkip = () => void window.office.decide(approval.id, false),
  isCompact = false,
}: {
  approval: Approval
  onAnswer?: (answers: Record<string, string>) => void
  onSkip?: () => void
  isCompact?: boolean
}) {
  const questions = approval.questions ?? []
  // 외부 직원 질문은 넘기면 원래 창에 다시 뜬다
  const isExternal = approval.staffId.startsWith('ext:')
  const [picked, setPicked] = useState<Picked>({})
  const [custom, setCustom] = useState<Custom>({})

  const toggle = (question: string, label: string, isMulti: boolean) => setPicked((p) => togglePick(p, question, label, isMulti))
  const answers = collectAnswers(questions, picked, custom)

  const handleSend = () => {
    if (answers) onAnswer(answers)
  }

  return (
    <div className="flex flex-col gap-3">
      {questions.map((q) => (
        <div key={q.question} role="group" aria-label={q.question} className="flex flex-col gap-1.5">
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
                  aria-pressed={isOn}
                  onClick={() => toggle(q.question, o.label, q.multiSelect)}
                  className={cn(
                    'border text-left text-xs',
                    // 펼침 창: 고른 것을 색만이 아니라 체크·굵은 테두리·굵은 글씨로도 구분 (docs/design/desktop-secretary/panel-concepts D2)
                    isCompact ? cn('flex items-start gap-2 rounded-2xl px-3 py-2', isOn ? 'border-primary bg-accent ring-primary font-semibold ring-1' : 'border-input hover:bg-accent') : cn('rounded-lg px-3 py-1.5', isOn ? 'border-primary bg-primary/10' : 'hover:bg-accent'),
                  )}
                >
                  {isCompact && <CheckIcon aria-hidden className={cn('text-primary mt-px size-3.5 shrink-0', !isOn && 'invisible')} />}
                  <div className="min-w-0">
                    <div className={isCompact && isOn ? 'font-semibold' : 'font-medium'}>{o.label}</div>
                    {o.description && <div className="text-muted-foreground font-normal">{o.description}</div>}
                  </div>
                </button>
              )
            })}
          </div>
          <Input
            value={custom[q.question] ?? ''}
            onChange={(e) => setCustom((c) => ({ ...c, [q.question]: e.target.value }))}
            placeholder={t('question.customPlaceholder')}
            aria-label={t('question.customPlaceholder')}
            className="h-8 text-xs"
          />
        </div>
      ))}
      {/* 좁은 칸(말풍선·좁은 창·가로 폰)에서는 버튼이 다음 줄로 내려가 가로 스크롤이 생기지 않게 */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSend} disabled={!answers}>
          <SendIcon /> {t('question.answer')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip}>
          {isExternal ? t('question.answerExternal') : t('question.skip')}
        </Button>
        {!isExternal && !isCompact && <StopWorkButton staffId={approval.staffId} className="ml-auto" />}
      </div>
    </div>
  )
}
