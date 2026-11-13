import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CheckIcon, FolderIcon, StarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { IS_REMOTE_SCREEN } from '@/shell'
import { t, type TKey } from '@shared/i18n'
import { PACK_LIMITS } from '@shared/staffPack'
import { TEAM_COLORS, type Staff, type Team } from '@shared/types'
import { Avatar } from './StaffCard'
import { shortPath } from './status'
import { nextColor, TEAM_DESC_MAX, type OrgGroup } from './orgGroup'

type Kind = OrgGroup['kind']
const STEPS: TKey[] = ['orgCard.create.step1', 'orgCard.create.step2', 'orgCard.create.step3']
const NAME_EXAMPLES: Record<Kind, TKey[]> = {
  team: ['orgCard.create.exTeam1', 'orgCard.create.exTeam2', 'orgCard.create.exTeam3'],
  project: ['orgCard.create.exProject1', 'orgCard.create.exProject2', 'orgCard.create.exProject3'],
}

/** 새로 만들기 3단계: ① 팀/프로젝트 고르기 ② 이름과 하는 일(목표·일하는 곳) ③ 함께할 직원과 리더. 만들면 새 카드 id를 돌려준다 */
export function OrgCreateDialog({ initialKind, onClose, onCreated }: { initialKind?: Kind; onClose: () => void; onCreated: (id: string) => void }) {
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const labs = useOffice((s) => s.labs)
  const hired = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const [step, setStep] = useState(initialKind ? 1 : 0)
  const [kind, setKind] = useState<Kind>(initialKind ?? 'team')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [cwd, setCwd] = useState<string | null>(null)
  const [color, setColor] = useState(() => nextColor([...teams.map((tm) => tm.color), ...labs.map((l) => l.color)]))
  const [isPickingColor, setIsPickingColor] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [leadId, setLeadId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // 팀 만들기는 여러 번 부른다 — 중간에 실패해 다시 누르면 이미 만든 팀을 이어 쓴다 (같은 이름 팀이 또 생기지 않게)
  const createdTeamId = useRef<string | null>(null)

  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    setPicked(next)
    // 처음 고른 사람을 리더 후보로 — 리더를 빼면 남은 첫 사람으로, ☆로 리더를 비웠으면 그대로 둔다
    if (leadId && !next.includes(leadId)) setLeadId(next[0] ?? null)
    else if (next.length === 1 && picked.length === 0) setLeadId(next[0])
  }
  const canCreate = name.trim() !== '' && (kind === 'team' || picked.length > 0) && !isSaving

  const handleCreate = async () => {
    if (!canCreate) return
    setIsSaving(true)
    setError('')
    try {
      const lead = leadId && picked.includes(leadId) ? leadId : null
      if (kind === 'project') {
        const lab = await window.office.createLab({ name: name.trim(), goal: text.trim(), cwd, leadId: lead, memberIds: picked, color })
        onCreated(lab.id)
      } else {
        const teamId = createdTeamId.current ?? (createdTeamId.current = (await window.office.createTeam(name.trim(), color)).id)
        for (const id of picked) await window.office.updateStaff(id, { teamId })
        await window.office.updateTeam(teamId, { leadId: lead, ...(text.trim() ? { description: text.trim() } : {}) })
        onCreated(teamId)
      }
      onClose()
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      setError(createdTeamId.current ? t('orgCard.create.failedPartial', { error }) : t('orgCard.create.failed', { error }))
      setIsSaving(false)
    }
  }

  const title = step === 0 ? t('orgCard.create.title') : t(kind === 'team' ? 'orgCard.create.titleTeam' : 'orgCard.create.titleProject')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <ol className="flex gap-1.5 text-xs">
            {STEPS.map((k, i) => (
              <li key={k} className={cn('rounded-full px-2.5 py-1', i === step ? 'bg-primary text-primary-foreground font-semibold' : i < step ? 'bg-accent text-foreground' : 'text-muted-foreground border')}>
                {i < step ? <CheckIcon className="mr-0.5 inline size-3" /> : `${i + 1}. `}
                {t(k)}
              </li>
            ))}
          </ol>
        </DialogHeader>

        {step === 0 && (
          <div className="flex flex-col gap-2">
            {(['team', 'project'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn('flex flex-col gap-1 rounded-xl border p-3 text-left text-sm', kind === k && 'border-primary bg-accent ring-primary/30 ring-2')}>
                <b className="text-base">{t(k === 'team' ? 'orgCard.kind.team' : 'orgCard.kind.project')}</b>
                <span>{t(k === 'team' ? 'orgCard.create.teamDesc' : 'orgCard.create.projectDesc')}</span>
                <span className="text-muted-foreground text-xs">{t(k === 'team' ? 'orgCard.create.teamEx' : 'orgCard.create.projectEx')}</span>
              </button>
            ))}
            <p className="text-muted-foreground text-xs">{t('orgCard.create.kindHint')}</p>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('orgCard.create.name')}
              <Input value={name} maxLength={PACK_LIMITS.nameMax} onChange={(e) => setName(e.target.value)} autoFocus />
              <span className="flex flex-wrap gap-1.5">
                {NAME_EXAMPLES[kind].map((k) => (
                  <button key={k} type="button" onClick={() => setName(t(k))} className="hover:bg-accent rounded-full border px-2.5 py-0.5 text-xs font-normal">
                    {t(k)}
                  </button>
                ))}
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>
                {t(kind === 'team' ? 'orgCard.create.what' : 'orgCard.goal')} <span className="text-muted-foreground font-normal">{t('orgCard.create.later')}</span>
              </span>
              <Input
                value={text}
                maxLength={kind === 'team' ? TEAM_DESC_MAX : PACK_LIMITS.descMax}
                onChange={(e) => setText(e.target.value)}
                placeholder={t(kind === 'team' ? 'orgCard.create.whatPlaceholder' : 'orgCard.create.goalPlaceholder')}
              />
            </label>
            {kind === 'project' && (
              <div className="flex flex-col gap-1.5 text-sm font-medium">
                <span>
                  {t('orgCard.create.workplace')} <span className="text-muted-foreground font-normal">{t('orgCard.create.optional')}</span>
                </span>
                <WorkplaceChoice cwd={cwd} onChange={setCwd} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t('orgCard.create.color')}</span>
              {isPickingColor ? (
                <ColorChoice color={color} onChange={(c) => (setColor(c), setIsPickingColor(false))} />
              ) : (
                <button type="button" onClick={() => setIsPickingColor(true)} className="flex items-center gap-2">
                  <span className="size-4 rounded-full" style={{ background: color, boxShadow: `0 0 0 2px var(--card), 0 0 0 3px ${color}` }} />
                  <span className="text-muted-foreground">{t('orgCard.create.colorAuto')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium">
              {t('orgCard.create.members')} <span className="text-muted-foreground font-normal">{t('orgCard.create.pickedN', { n: picked.length })}</span>
            </div>
            <PeoplePicker staff={hired} teams={teams} kind={kind} picked={picked} leadId={leadId} onToggle={toggle} onLead={(id) => setLeadId((cur) => (cur === id ? null : id))} />
            <LeadNote staff={hired} picked={picked} leadId={leadId} />
            {kind === 'project' && picked.length === 0 && hired.length > 0 && <p className="text-muted-foreground text-xs">{t('orgCard.create.projectNeedsPeople')}</p>}
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          {step === 0 ? (
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              {t('orgCard.create.prev')}
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !name.trim()}>
              {t('orgCard.create.next')}
            </Button>
          ) : (
            <Button onClick={() => void handleCreate()} disabled={!canCreate}>
              {t('orgCard.create.submit')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 색 고르기 (팀 색 8개) */
export function ColorChoice({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <span className="flex gap-1.5">
      {TEAM_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} className={cn('phone:size-8 size-6 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />
      ))}
    </span>
  )
}

/** 프로젝트 일하는 곳: 각자 일하던 곳(폴더 없음) 또는 한 폴더 (폴더 고르기는 PC에서만) */
export function WorkplaceChoice({ cwd, onChange }: { cwd: string | null; onChange: (cwd: string | null) => void }) {
  const handlePick = async () => {
    const dir = await window.office.pickFolder()
    if (dir) onChange(dir)
  }
  const chip = (isOn: boolean) => cn('rounded-full border px-2.5 py-1 text-xs font-normal', isOn && 'border-primary bg-accent font-semibold')
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(!cwd)} onClick={() => onChange(null)}>
          {t('orgCard.create.workplaceEach')}
        </button>
        {cwd && (
          <span className={cn(chip(true), 'flex items-center gap-1')}>
            <FolderIcon className="size-3.5" /> {shortPath(cwd)}
          </span>
        )}
        {!IS_REMOTE_SCREEN && (
          <button type="button" className={chip(false)} onClick={() => void handlePick()}>
            {t('orgCard.create.workplacePick')}
          </button>
        )}
      </div>
      <span className="text-muted-foreground text-xs font-normal">{t('orgCard.create.workplaceHint')}</span>
    </div>
  )
}

/**
 * 함께할 직원 고르기: 팀별로 묶은 얼굴 칩. 고른 사람에는 ☆이 붙고 눌러 리더 1명을 정한다.
 * 팀을 꾸릴 때 다른 팀 사람을 고르면 '{팀}에서 옮겨요'를 보여 준다 (currentTeamId = 지금 고치는 팀)
 */
export function PeoplePicker({
  staff,
  teams,
  kind,
  picked,
  leadId,
  onToggle,
  onLead,
  currentTeamId,
}: {
  staff: Staff[]
  teams: Team[]
  kind: Kind
  picked: string[]
  leadId: string | null
  onToggle: (id: string) => void
  onLead: (id: string) => void
  currentTeamId?: string
}) {
  if (staff.length === 0) return <p className="text-muted-foreground text-sm">{t('orgCard.create.noStaff')}</p>
  const groups = [...teams.map((tm) => ({ key: tm.id, label: tm.name, color: tm.color, members: staff.filter((s) => s.teamId === tm.id) })), { key: '', label: t('lab.noTeam'), color: '', members: staff.filter((s) => !teams.some((tm) => tm.id === s.teamId)) }].filter(
    (g) => g.members.length > 0,
  )
  return (
    <div className="flex max-h-72 flex-col gap-2.5 overflow-y-auto">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-semibold" style={g.color ? { color: g.color } : undefined}>
            {g.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {g.members.map((s) => {
              const isOn = picked.includes(s.id)
              const isLead = isOn && leadId === s.id
              const movesFrom = kind === 'team' && isOn && g.key && g.key !== currentTeamId ? g.label : ''
              return (
                <span key={s.id} className={cn('flex items-center rounded-full border text-xs', isOn && 'border-primary bg-accent')}>
                  <button type="button" onClick={() => onToggle(s.id)} aria-pressed={isOn} className="flex items-center gap-1 py-0.5 pr-2 pl-0.5">
                    <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-6" />
                    {s.name}
                    {movesFrom && <span className="text-muted-foreground">· {t('orgCard.create.moveFrom', { team: movesFrom })}</span>}
                  </button>
                  {isOn && (
                    <button type="button" onClick={() => onLead(s.id)} aria-pressed={isLead} aria-label={t('orgCard.create.setLead', { name: s.name })} title={t('orgCard.create.setLead', { name: s.name })} className="pr-2 pl-0.5">
                      <StarIcon className={cn('size-3.5', isLead ? 'fill-status-waiting text-status-waiting' : 'text-muted-foreground')} />
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 리더 안내 한 줄 — 없으면 막지 않고 알리기만 */
export function LeadNote({ staff, picked, leadId }: { staff: Staff[]; picked: string[]; leadId: string | null }) {
  if (picked.length === 0) return null
  const lead = leadId && picked.includes(leadId) ? staff.find((s) => s.id === leadId) : undefined
  return (
    <div className={cn('rounded-lg px-3 py-2 text-xs', lead ? 'bg-muted' : 'bg-status-waiting/10 text-status-waiting')}>
      {lead ? (
        <>
          <b>{t('orgCard.create.leadIs', { name: lead.name })}</b> <span className="text-muted-foreground">— {t('orgCard.create.leadHint')}</span>
        </>
      ) : (
        t('orgCard.create.noLead')
      )}
    </div>
  )
}
