import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeftIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MoreToggle } from '@/components/more-toggle'
import { IconText } from '@/components/duo-icon'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { isValidManualName } from '@shared/manualName'
import { MANUAL_TEMPLATES, fromTemplate } from '@shared/manualTemplates'
import type { ManualInput, ManualKind } from '@shared/types'
import { t, tx } from '@shared/i18n'
import { KIND_LABEL, emptyInput, newStep } from './ManualEditor'

type Step = 'choose' | 'describe' | 'templates' | 'direct'

/** 새 매뉴얼 3갈래: 말로 설명(AI 초안) · 예시에서 고르기 · 직접 쓰기 — 어느 갈래든 채운 양식을 onDone으로 넘겨 편집 창에서 이어 간다 */
export function NewManualDialog({ projectDir, onClose, onDone }: { projectDir: string | null; onClose: () => void; onDone: (input: ManualInput) => void }) {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const [step, setStep] = useState<Step>('choose')
  const [kind, setKind] = useState<ManualKind>('personal')
  const [request, setRequest] = useState('')
  // '' = 앱이 알아서(기본 AI) — 직원이 없어도 초안을 만들 수 있다
  const [drafter, setDrafter] = useState('')
  const [isDrafterOpen, setIsDrafterOpen] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [error, setError] = useState('')
  // 초안을 만드는 중에 창을 닫으면, 결과가 와도 편집 창을 열지 않는다
  const isClosed = useRef(false)
  useEffect(() => () => void (isClosed.current = true), [])
  const close = () => {
    isClosed.current = true
    onClose()
  }

  const handleDraft = async () => {
    if (!request.trim() || isDrafting) return
    setIsDrafting(true)
    setError('')
    try {
      const d = await window.office.draftManual(drafter, request.trim(), kind)
      if (isClosed.current) return
      // AI가 준 영문 이름은 참고만 — 규칙에 맞으면 쓰고, 겹치면 저장할 때 -2를 붙인다
      onDone({ ...emptyInput(kind, projectDir), ...d, name: isValidManualName(d.name) ? d.name : '', autoName: true, title: d.title ?? '', steps: kind === 'process' ? d.steps.map((s, i) => ({ ...newStep(i), ...s })) : [] })
    } catch (e) {
      // 적은 문장은 지우지 않고 다시 시도할 수 있게 둔다
      if (!isClosed.current) setError(t('manuals.editor.draftFailed', { error: String(e).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, '') }))
    }
    if (!isClosed.current) setIsDrafting(false)
  }

  const kindChoice = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t('manualStart.kind.question')}</legend>
      {(['personal', 'process'] as const).map((k) => (
        <label key={k} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm', kind === k && 'border-primary bg-accent')}>
          <input type="radio" name="manual-kind" className="mt-1" checked={kind === k} onChange={() => setKind(k)} />
          <span className="flex flex-col">
            <span className="font-medium">{t(KIND_LABEL[k])}</span>
            <span className="text-muted-foreground text-xs">{k === 'personal' ? t('manualStart.kind.oneDesc') : t('manualStart.kind.manyDesc')}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )

  const choices: { id: Step; title: string; desc: string; badge?: string }[] = [
    { id: 'describe', title: t('manualStart.describe.title'), desc: t('manualStart.describe.desc'), badge: t('manualStart.describe.badge') },
    { id: 'templates', title: t('manualStart.template.title'), desc: t('manualStart.template.desc') },
    { id: 'direct', title: t('manualStart.direct.title'), desc: t('manualStart.direct.desc') },
  ]

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('manualStart.title')}</DialogTitle>
          <DialogDescription>{t('manualStart.hint')}</DialogDescription>
        </DialogHeader>

        {step === 'choose' && (
          <div className="flex flex-col gap-2">
            {choices.map((c) => (
              <button key={c.id} type="button" onClick={() => setStep(c.id)} className="hover:border-primary hover:bg-accent flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <IconText text={c.title} size={16} />
                  {c.badge && <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">{c.badge}</span>}
                </span>
                <span className="text-muted-foreground text-xs">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'describe' && (
          <div className="flex flex-col gap-4">
            {kindChoice}
            <div className="flex flex-col gap-1">
              <Label htmlFor="manual-request">{t('manualStart.describe.label')}</Label>
              <Textarea id="manual-request" value={request} onChange={(e) => setRequest(e.target.value)} placeholder={kind === 'process' ? t('manualStart.describe.placeholderMany') : t('manualStart.describe.placeholderOne')} className="min-h-20 text-sm" autoFocus />
            </div>
            {staff.length > 0 && (
              <>
                <MoreToggle open={isDrafterOpen} onToggle={() => setIsDrafterOpen((v) => !v)} hint={t('manualStart.describe.moreDesc')} />
                {isDrafterOpen && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="manual-drafter">{t('manualStart.describe.drafter')}</Label>
                    <NativeSelect id="manual-drafter" value={drafter} onChange={(e) => setDrafter(e.target.value)} className="w-56">
                      <option value="">{t('manualStart.describe.drafterAuto')}</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
              </>
            )}
            {error && <p className="text-status-error text-xs">{error}</p>}
          </div>
        )}

        {step === 'direct' && kindChoice}

        {step === 'templates' && (
          <div className="flex flex-col gap-4">
            {(['personal', 'process'] as const).map((k) => (
              <section key={k} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t(KIND_LABEL[k])}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                  {MANUAL_TEMPLATES.filter((d) => d.kind === k).map((d) => (
                    <button key={d.id} type="button" onClick={() => onDone(fromTemplate(d, projectDir))} className="hover:border-primary hover:bg-accent flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors">
                      <span className="text-sm font-medium">{tx(`manualTpl.${d.id}.title`, d.id)}</span>
                      <span className="text-muted-foreground line-clamp-2 text-xs">{tx(`manualTpl.${d.id}.desc`, '')}</span>
                      {d.steps && <span className="text-muted-foreground text-[10px]">{t('manualStart.template.stepsCount', { n: d.steps.length })}</span>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <DialogFooter>
          {step === 'choose' ? (
            <Button variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => (setStep('choose'), setError(''))} disabled={isDrafting}>
              <ArrowLeftIcon /> {t('manualStart.back')}
            </Button>
          )}
          {step === 'describe' && (
            <Button onClick={() => void handleDraft()} disabled={isDrafting || !request.trim()}>
              <SparklesIcon /> {isDrafting ? t('manualStart.describe.making') : t('manualStart.describe.make')}
            </Button>
          )}
          {step === 'direct' && <Button onClick={() => onDone(emptyInput(kind, projectDir))}>{t('manualStart.direct.start')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
