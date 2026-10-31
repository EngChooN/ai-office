import { useEffect, useMemo, useRef, useState } from 'react'
import { EyeOffIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { SecretaryComposer } from '@/features/secretary/SecretaryChat'
import { SecretaryFace } from '@/features/secretary/SecretaryFace'
import { EMPTY_SECRETARY, type AutoHandled } from '@shared/types'
import { addSettled, petApprovals, pruneSettled, recentAuto, settleVanished, type PetApproval, type PetOpenTarget, type PetSettled, type PetSettledKind } from '@shared/deskPet'
import { toolDisplayName } from '@shared/computerTools'
import { maskSecrets } from '@shared/redact'
import { t, trOr } from '@shared/i18n'

// 펼침 창: 최근 비서 대화 · 입력창 · 결재 대기 목록 · 앱에서 열기 (docs/design/desktop-secretary/README.md "작은 창")
// 바꾸는 일(확인 카드)은 여기서 실행하지 않고 앱의 비서 화면으로 넘긴다. 결재 승인·반려는 여기서 바로 (질문은 앱에서)

const pet = () => window.officePet!
const open = (target: PetOpenTarget) => pet().openApp(target)
const RECENT_MAX = 20

const titleOf = (a: PetApproval) => `${a.staffName} · ${trOr(a.summaryI18n, a.summary)}`

export function PetPanel() {
  const secretary = useOffice((s) => s.secretary ?? EMPTY_SECRETARY)
  const isAuto = useOffice((s) => s.autoApprove.isActive)
  const autoLog = useAutoLog()
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
        <Button size="icon" variant="ghost" className="[-webkit-app-region:no-drag]" aria-label={t('deskPet.hide')} title={`${t('deskPet.hide')} — ${t('deskPet.hideHint')}`} onClick={() => pet().hide()}>
          <EyeOffIcon />
        </Button>
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

      <ApprovalList approvals={approvals} isAuto={isAuto} autoLog={autoLog} />

      <Button variant="outline" className="h-9" onClick={() => open({ kind: 'secretary' })}>
        {t('deskPet.openApp')}
      </Button>
    </div>
  )
}

/** 자동결재가 대신 처리한 기록 (결재함 "자동 처리됨"과 같은 기록 — autoApproveLog). 새 기록이 생기거나 켜고 끌 때 다시 읽는다 */
function useAutoLog() {
  const counts = useOffice((s) => s.autoApprove.counts)
  const isActive = useOffice((s) => s.autoApprove.isActive)
  const total = counts.edit + counts.command + counts.other + counts.answered + counts.waited
  const [log, setLog] = useState<AutoHandled[]>([])
  useEffect(() => {
    let isLive = true
    void window.office
      .autoApproveLog()
      .then((l) => isLive && setLog(l))
      .catch(() => {})
    return () => {
      isLive = false
    }
  }, [total, isActive])
  return log
}

/** 처리 중·실패는 아직 목록에 있는 결재에만 붙는다 (목록을 떠나면 settled가 맡는다) */
type ItemState = { kind: 'busy' } | { kind: 'error' }

const SETTLED_LABEL: Record<PetSettledKind, 'deskPet.didApprove' | 'deskPet.didReject' | 'deskPet.elsewhere'> = { approved: 'deskPet.didApprove', rejected: 'deskPet.didReject', elsewhere: 'deskPet.elsewhere' }

function autoLabel(h: AutoHandled) {
  return h.kind === 'answer' ? t('autoApprove.answered') : h.kind === 'skipped' ? t('autonomy.skipped') : h.kind === 'plan' ? t('autonomy.planApproved') : t('deskPet.autoApproved')
}

function ApprovalList({ approvals, isAuto, autoLog }: { approvals: PetApproval[]; isAuto: boolean; autoLog: AutoHandled[] }) {
  const [states, setStates] = useState<Record<string, ItemState>>({})
  // 목록을 떠난 결재: 내가 처리(승인함·반려함) · 다른 곳에서 처리됨 — 항목마다 SETTLED_MS 뒤 빠진다
  const [settled, setSettled] = useState<PetSettled[]>([])
  const [announce, setAnnounce] = useState('')
  const prev = useRef<PetApproval[]>([])
  const busy = useRef(new Set<string>())
  useEffect(() => {
    const before = prev.current
    prev.current = approvals
    setSettled((l) => settleVanished(l, before, approvals, busy.current, Date.now()))
    // 목록에서 빠진 결재의 실패 표시는 버린다 (처리 중은 결과가 오면 지운다)
    setStates((st) => {
      const ids = new Set(approvals.map((a) => a.id))
      const kept = Object.entries(st).filter(([id, v]) => ids.has(id) || v.kind === 'busy')
      return kept.length === Object.keys(st).length ? st : Object.fromEntries(kept)
    })
  }, [approvals])
  // 가장 먼저 끝나는 항목에 맞춰 하나의 타이머로 정리한다 (창을 닫으면 타이머도 정리)
  useEffect(() => {
    if (!settled.length) return
    const wait = Math.max(0, Math.min(...settled.map((x) => x.until)) - Date.now())
    const timer = setTimeout(() => setSettled((l) => pruneSettled(l, Date.now())), wait)
    return () => clearTimeout(timer)
  }, [settled])

  const decide = async (a: PetApproval, allow: boolean) => {
    busy.current.add(a.id)
    setStates((s) => ({ ...s, [a.id]: { kind: 'busy' } }))
    const settle = (kind: PetSettledKind) => setSettled((l) => addSettled(l, a, kind, Date.now()))
    // 처리하는 동안 스냅샷에서 이미 빠졌으면(settleVanished가 건너뛴 경우) 여기서 남긴다
    const isGone = () => !prev.current.some((x) => x.id === a.id)
    try {
      const result = await pet().decide(a.id, allow)
      if (result === 'done') {
        settle(allow ? 'approved' : 'rejected')
        setAnnounce(t(allow ? 'deskPet.approved' : 'deskPet.rejected', { title: titleOf(a) }))
      } else if (result === 'busy') {
        // 같은 결재를 다른 곳(앱 등)에서 처리하는 중 — 결과는 스냅샷으로 온다
        if (isGone()) settle('elsewhere')
      } else {
        settle('elsewhere')
        setAnnounce(t('deskPet.already'))
      }
      setStates(({ [a.id]: _, ...rest }) => rest)
    } catch {
      if (isGone()) settle('elsewhere')
      setStates((s) => ({ ...s, [a.id]: { kind: 'error' } }))
      setAnnounce(t('deskPet.failed'))
    } finally {
      busy.current.delete(a.id)
    }
  }

  const settledOf = new Map(settled.map((x) => [x.approval.id, x]))
  const shown = [...approvals, ...settled.map((x) => x.approval).filter((g) => !approvals.some((a) => a.id === g.id))]
  const autos = recentAuto(autoLog, Date.now())
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
          const done = settledOf.get(a.id)
          const state: ItemState | undefined = states[a.id]
          const title = titleOf(a)
          return (
            <div key={a.id} className="bg-card flex flex-col gap-2 rounded-xl border p-3">
              <p className="line-clamp-2 break-words" title={title}>
                {title}
              </p>
              {done ? (
                <span className="text-muted-foreground text-xs font-medium">{t(SETTLED_LABEL[done.kind])}</span>
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
        {autos.length > 0 && (
          <div className="flex flex-col gap-1.5" aria-label={t('deskPet.autoList')}>
            <h3 className="text-muted-foreground text-xs font-semibold">{t('deskPet.autoList')}</h3>
            {autos.map((h) => (
              <div key={h.id} className="bg-muted/50 flex flex-col gap-0.5 rounded-lg border border-dashed px-3 py-2 text-xs">
                <span className="text-muted-foreground font-medium">{autoLabel(h)}</span>
                <span className="line-clamp-2 break-words">
                  {h.staffName} · {h.kind === 'answer' ? '' : `${toolDisplayName(h.toolName)} `}
                  {maskSecrets(trOr(h.summaryI18n, h.summary))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </section>
  )
}
