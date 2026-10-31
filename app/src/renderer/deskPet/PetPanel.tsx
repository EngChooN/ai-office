import { useEffect, useMemo, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { SecretaryComposer } from '@/features/secretary/SecretaryChat'
import { SecretaryFace } from '@/features/secretary/SecretaryFace'
import { EMPTY_SECRETARY } from '@shared/types'
import { petApprovals, type PetApproval, type PetOpenTarget } from '@shared/deskPet'
import { t, trOr } from '@shared/i18n'

// 펼침 창: 최근 비서 대화 · 입력창 · 결재 대기 목록 · 앱에서 열기 (docs/design/desktop-secretary/README.md "작은 창")
// 바꾸는 일(확인 카드)은 여기서 실행하지 않고 앱의 비서 화면으로 넘긴다. 결재 승인·반려는 여기서 바로 (질문은 앱에서)

const pet = () => window.officePet!
const open = (target: PetOpenTarget) => pet().openApp(target)
const RECENT_MAX = 20
/** 이미 처리됨 표시를 남겨 두는 시간 */
const SETTLED_MS = 4000

const titleOf = (a: PetApproval) => `${a.staffName} · ${trOr(a.summaryI18n, a.summary)}`

export function PetPanel() {
  const secretary = useOffice((s) => s.secretary ?? EMPTY_SECRETARY)
  const isAuto = useOffice((s) => s.autoApprove.isActive)
  const staff = useOffice((s) => s.staff)
  const approvals = useMemo(() => petApprovals(staff), [staff])
  const messages = secretary.messages.slice(-RECENT_MAX)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = pet().onPanelShown(() => document.querySelector<HTMLTextAreaElement>('textarea')?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pet().closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  // 새 말이 오면 맨 아래로
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, secretary.isBusy])

  return (
    <div className="bg-background text-foreground flex h-screen flex-col gap-4 p-4 text-[13px]">
      <header className="flex items-center gap-2 [-webkit-app-region:drag]">
        <SecretaryFace className="size-7" />
        <h1 className="flex-1 text-[15px] font-semibold">{t('secretary.name')}</h1>
        <Button size="icon" variant="ghost" className="[-webkit-app-region:no-drag]" aria-label={t('deskPet.close')} onClick={() => pet().closePanel()}>
          <XIcon />
        </Button>
      </header>

      <section aria-label={t('deskPet.recent')} className="flex min-h-24 flex-1 flex-col gap-2">
        <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && <p className="text-muted-foreground">{t('deskPet.empty')}</p>}
          {messages.map((m) => (
            <div key={m.id} className={cn('max-w-[90%] rounded-xl px-3 py-2', m.role === 'me' ? 'bg-primary text-primary-foreground self-end' : 'bg-muted self-start', m.isError && 'text-destructive')}>
              {m.role === 'me' ? <p className="break-words whitespace-pre-wrap">{m.text}</p> : <Markdown>{m.text}</Markdown>}
              {m.card && (
                <div className="mt-2 flex flex-col items-start gap-1.5 border-t pt-2">
                  <span className="text-muted-foreground text-xs">{t('deskPet.cardInApp')}</span>
                  <Button size="sm" variant="outline" onClick={() => open({ kind: 'secretary' })}>
                    {t('deskPet.openApp')}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {secretary.isBusy && <p className="text-muted-foreground self-start">{secretary.activity || t('deskPet.thinking')}</p>}
        </div>
        <SecretaryComposer />
      </section>

      <ApprovalList approvals={approvals} isAuto={isAuto} />

      <Button variant="outline" className="h-9" onClick={() => open({ kind: 'secretary' })}>
        {t('deskPet.openApp')}
      </Button>
    </div>
  )
}

type ItemState = { kind: 'busy' } | { kind: 'already' } | { kind: 'error' }

function ApprovalList({ approvals, isAuto }: { approvals: PetApproval[]; isAuto: boolean }) {
  const [states, setStates] = useState<Record<string, ItemState>>({})
  // 다른 곳(앱·휴대폰·자동결재)에서 처리돼 목록에서 빠진 항목은 잠시 "이미 처리됨"으로 남긴다
  const [gone, setGone] = useState<PetApproval[]>([])
  const [announce, setAnnounce] = useState('')
  const prev = useRef<PetApproval[]>([])
  const mine = useRef(new Set<string>())
  useEffect(() => {
    const ids = new Set(approvals.map((a) => a.id))
    const vanished = prev.current.filter((a) => !ids.has(a.id) && !mine.current.has(a.id))
    prev.current = approvals
    if (!vanished.length) return
    setGone((g) => [...g, ...vanished])
    const timer = setTimeout(() => setGone((g) => g.filter((a) => !vanished.includes(a))), SETTLED_MS)
    return () => clearTimeout(timer)
  }, [approvals])

  const decide = async (a: PetApproval, allow: boolean) => {
    setStates((s) => ({ ...s, [a.id]: { kind: 'busy' } }))
    try {
      const result = await pet().decide(a.id, allow)
      if (result === 'done') {
        mine.current.add(a.id)
        setAnnounce(t(allow ? 'deskPet.approved' : 'deskPet.rejected', { title: titleOf(a) }))
        setStates(({ [a.id]: _, ...rest }) => rest)
      } else if (result === 'busy') {
        // 같은 결재를 이미 처리하는 중 — 결과는 스냅샷으로 온다
      } else {
        setStates((s) => ({ ...s, [a.id]: { kind: 'already' } }))
        setAnnounce(t('deskPet.already'))
      }
    } catch {
      setStates((s) => ({ ...s, [a.id]: { kind: 'error' } }))
      setAnnounce(t('deskPet.failed'))
    }
  }

  const shown = [...approvals, ...gone.filter((g) => !approvals.some((a) => a.id === g.id))]
  return (
    <section aria-labelledby="pet-approvals" className="flex max-h-[45%] min-h-0 flex-col gap-2">
      <h2 id="pet-approvals" className="flex items-center gap-2 text-[14px] font-semibold">
        {t('deskPet.pending', { n: approvals.length })}
        {isAuto && (
          <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-normal" title={t('deskPet.autoOnHint')}>
            {t('deskPet.autoOn')}
          </span>
        )}
      </h2>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {shown.length === 0 && <p className="text-muted-foreground">{t('deskPet.none')}</p>}
        {shown.map((a) => {
          const isGone = !approvals.some((x) => x.id === a.id)
          const state: ItemState | undefined = isGone ? { kind: 'already' } : states[a.id]
          const title = titleOf(a)
          return (
            <div key={a.id} className="bg-card flex flex-col gap-2 rounded-xl border p-3">
              <p className="line-clamp-2 break-words" title={title}>
                {title}
              </p>
              {state?.kind === 'already' ? (
                <span className="text-muted-foreground text-xs font-medium">{t('deskPet.already')}</span>
              ) : a.questions?.length ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground flex-1 text-xs">{t('deskPet.question')}</span>
                  <Button size="sm" variant="outline" className="min-w-11" aria-label={t('deskPet.openOf', { title })} onClick={() => open({ kind: 'staff', staffId: a.staffId })}>
                    {t('deskPet.openApp')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" className="min-w-11" disabled={state?.kind === 'busy'} aria-label={t('deskPet.approveOf', { title })} onClick={() => void decide(a, true)}>
                    {state?.kind === 'busy' ? t('deskPet.busy') : t('deskPet.approve')}
                  </Button>
                  <Button size="sm" variant="outline" className="min-w-11" disabled={state?.kind === 'busy'} aria-label={t('deskPet.rejectOf', { title })} onClick={() => void decide(a, false)}>
                    {t('deskPet.reject')}
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto min-w-11" aria-label={t('deskPet.openOf', { title })} onClick={() => open({ kind: 'staff', staffId: a.staffId })}>
                    {t('deskPet.openApp')}
                  </Button>
                  {state?.kind === 'error' && <p className="text-destructive w-full text-xs">{t('deskPet.failed')}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </section>
  )
}
