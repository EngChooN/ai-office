import { useState, type FormEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CrownIcon, DownloadIcon, FlaskConicalIcon, FolderOpenIcon, PresentationIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { TEAM_COLORS, type Lab, type Staff, type Team } from '@shared/types'
import { AttachButton, DraftAttachments, useDraftAttachments } from '@/components/attachments'
import { Textarea } from '@/components/ui/textarea'
import { t } from '@shared/i18n'
import { RefDocsEditor } from './RefDocsEditor'
import { RunCard } from './RunCard'
import { Avatar, LeadMark } from './StaffCard'
import { shortPath } from './status'
import { PACK_LIMITS } from '@shared/staffPack'

const LAB_COLORS = [...TEAM_COLORS].reverse()
/** 새 일감 첫 줄을 카드 제목으로 쓸 때 최대 길이 */
const TITLE_MAX = 60

/** 직원 고르기: 팀별로 묶어 보여 주고 여러 명을 고른다 (팀과 교차하는 랩 구성용) */
function MemberPicker({ staff, teams, picked, onToggle }: { staff: Staff[]; teams: Team[]; picked: string[]; onToggle: (id: string) => void }) {
  const groups = [...teams.map((tm) => ({ key: tm.id, label: tm.name, color: tm.color, members: staff.filter((s) => s.teamId === tm.id) })), { key: 'none', label: t('lab.noTeam'), color: '#8a8a9c', members: staff.filter((s) => !teams.some((tm) => tm.id === s.teamId)) }].filter(
    (g) => g.members.length > 0,
  )
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 truncate text-xs font-semibold" style={{ color: g.color }}>
            {g.label}
          </span>
          {g.members.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={cn('flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-xs', picked.includes(s.id) && 'border-primary bg-accent')}
            >
              <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-5" />
              {s.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 랩(프로젝트 팀): 여러 팀에서 한 명씩 뽑아 꾸리는 교차 조직 */
export function LabSection() {
  const labs = useOffice((s) => s.labs)
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [cwd, setCwd] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [leadId, setLeadId] = useState('')

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || picked.length === 0) return
    await window.office.createLab({ name: name.trim(), goal: goal.trim(), cwd, leadId: leadId || null, memberIds: picked, color: LAB_COLORS[labs.length % LAB_COLORS.length] })
    setIsCreating(false)
    setName('')
    setGoal('')
    setCwd(null)
    setPicked([])
    setLeadId('')
  }
  const handlePickFolder = async () => setCwd(await window.office.pickFolder())

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold">🧪 {t('lab.title')}</h2>
        <span className="text-muted-foreground text-xs">{t('lab.description')}</span>
        {!isCreating && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setIsCreating(true)} disabled={staff.length === 0}>
            <FlaskConicalIcon /> {t('lab.create')}
          </Button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="bg-card mb-4 flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex gap-2">
            <Input value={name} maxLength={PACK_LIMITS.nameMax} onChange={(e) => setName(e.target.value)} placeholder={t('lab.namePlaceholder')} className="max-w-xs" autoFocus />
            <Input value={goal} maxLength={PACK_LIMITS.descMax} onChange={(e) => setGoal(e.target.value)} placeholder={t('lab.goalPlaceholder')} />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Button type="button" size="sm" variant="outline" onClick={handlePickFolder}>
              <FolderOpenIcon /> {t('lab.projectFolder')}
            </Button>
            <span className="text-muted-foreground">{cwd ? shortPath(cwd) : t('lab.noFolder')}</span>
          </div>
          <MemberPicker staff={staff} teams={teams} picked={picked} onToggle={toggle} />
          <label className="flex items-center gap-2 text-xs">
            <CrownIcon className="size-3.5 text-status-waiting" /> {t('lab.labLead')}
            <NativeSelect value={leadId} onChange={(e) => setLeadId(e.target.value)} className="h-7 w-40 text-xs">
              <option value="">{t('lab.noLead')}</option>
              {picked.map((id) => (
                <option key={id} value={id}>
                  {staff.find((s) => s.id === id)?.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!name.trim() || picked.length === 0}>
              {t('lab.submitCreate')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {labs.length === 0 && !isCreating && <p className="text-muted-foreground text-sm">{t('lab.empty')}</p>}
        {labs.map((lab) => (
          <LabCard key={lab.id} lab={lab} staff={staff} teams={teams} />
        ))}
      </div>
    </section>
  )
}

function LabCard({ lab, staff, teams }: { lab: Lab; staff: Staff[]; teams: Team[] }) {
  const select = useOffice((s) => s.select)
  const setView = useOffice((s) => s.setView)
  const setMeetingPreset = useOffice((s) => s.setMeetingPreset)
  const [isEditing, setIsEditing] = useState(false)
  const members = lab.memberIds.map((id) => staff.find((s) => s.id === id)).filter((s): s is Staff => Boolean(s))

  const toggle = (id: string) => {
    const memberIds = lab.memberIds.includes(id) ? lab.memberIds.filter((x) => x !== id) : [...lab.memberIds, id]
    void window.office.updateLab(lab.id, { memberIds, leadId: memberIds.includes(lab.leadId ?? '') ? lab.leadId : null })
  }
  const handleMeeting = () => {
    setMeetingPreset({ topic: t('lab.meetingTopic', { name: lab.name }), participantIds: lab.memberIds })
    setView('meeting')
  }
  const handleExport = async () => {
    try {
      const r = await window.officePack?.exportLab(lab.id)
      if (r) window.alert(r.message)
    } catch {
      window.alert(t('pack.err.write'))
    }
  }
  const handleDelete = () => {
    if (window.confirm(t('lab.disbandConfirm', { name: lab.name }))) void window.office.deleteLab(lab.id)
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: `${lab.color}66` }}>
      <div className="flex items-center gap-2">
        <span className="rounded px-1.5 text-[11px] font-semibold text-white" style={{ background: lab.color }}>
          LAB
        </span>
        <span className="flex-1 truncate font-semibold">{lab.name}</span>
        {window.officePack && (
          <Button variant="ghost" size="icon" className="size-7" onClick={() => void handleExport()} aria-label={t('pack.lab.export')} title={t('pack.lab.export')}>
            <DownloadIcon className="size-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={handleMeeting} aria-label={t('lab.meetingAria')}>
          <PresentationIcon className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={handleDelete} aria-label={t('lab.disbandAria')}>
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      {lab.goal && <p className="text-muted-foreground text-xs">🎯 {lab.goal}</p>}
      {lab.cwd && <p className="text-muted-foreground text-xs">📁 {shortPath(lab.cwd)}</p>}
      <RefDocsEditor target={{ kind: 'lab', id: lab.id }} docs={lab.refDocs ?? []} audience={t('lab.refDocsAudience')} isCollapsible suggestFrom={lab.cwd} />
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <CrownIcon className="size-3.5 text-status-waiting" /> {t('lab.lead')}
        <NativeSelect value={lab.leadId ?? ''} onChange={(e) => void window.office.updateLab(lab.id, { leadId: e.target.value || null })} className="h-7 flex-1 text-xs">
          <option value="">{t('lab.noLead')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <div className="flex flex-col">
        {members.map((m) => {
          const team = teams.find((tm) => tm.id === m.teamId)
          return (
            <button key={m.id} type="button" onClick={() => select(m.id)} className="flex items-center gap-2 py-1 text-left">
              <Avatar avatar={m.avatar} name={m.name} teamId={m.teamId} className="size-7" />
              <span className="flex min-w-0 flex-1 items-center gap-1 text-sm">
                {lab.leadId === m.id && <LeadMark />}
                <span className="truncate">{m.name}</span>
              </span>
              {team && (
                <span className="rounded px-1.5 text-[10px] font-semibold text-white" style={{ background: team.color }}>
                  {team.name}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <LabWork lab={lab} />
      {isEditing ? (
        <div className="flex flex-col gap-2 border-t pt-2">
          <MemberPicker staff={staff} teams={teams} picked={lab.memberIds} onToggle={toggle} />
          <Button size="sm" variant="ghost" className="w-fit" onClick={() => setIsEditing(false)}>
            {t('lab.done')}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setIsEditing(true)}>
          {t('lab.editMembers')}
        </Button>
      )}
    </div>
  )
}

/** 랩의 새 일감: 매뉴얼 없이 리드에게 맡기거나(리드가 기획·분배), 교육된 프로세스 매뉴얼로 시작한다 */
function LabWork({ lab }: { lab: Lab }) {
  const runs = useOffice(useShallow((s) => s.runs.filter((r) => r.scope.kind === 'lab' && r.scope.id === lab.id).slice(0, 3)))
  const lead = useOffice((s) => s.staff.find((x) => x.id === lab.leadId))
  // 기본은 매뉴얼 없이 — 매뉴얼은 쓰고 싶을 때만 고른다
  const [manual, setManual] = useState('')
  const [input, setInput] = useState('')
  const files = useDraftAttachments()
  const manuals = lab.manuals ?? []
  if (!lead && manuals.length === 0) return <p className="text-muted-foreground border-t pt-2 text-xs">{t('lab.work.unavailable')}</p>
  const isManual = manual !== '' || !lead
  const selected = isManual ? manual || manuals[0] : ''

  const handleStart = async () => {
    const text = input.trim()
    if (!text) return
    const attachments = await files.upload()
    files.clear()
    if (selected) {
      await window.office.startRun({ manualName: selected, scope: { kind: 'lab', id: lab.id }, input: text, attachments })
    } else if (lead) {
      // 리드 흐름: 보드 카드를 만들어 리드에게 배정하면 리드가 기획 → 하위 업무 분배를 한다
      const task = await window.office.createTask({ title: text.split('\n')[0].slice(0, TITLE_MAX), detail: text, teamId: null, labId: lab.id, attachments })
      await window.office.assignTask(task.id, lead.id)
    }
    setInput('')
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      <div className="text-xs font-semibold">🔁 {t('lab.work.title')}</div>
      <NativeSelect value={selected} onChange={(e) => setManual(e.target.value)} className="h-7 text-xs">
        {lead && <option value="">{t('lab.work.noManual', { name: lead.name })}</option>}
        {manuals.map((m) => (
          <option key={m} value={m}>
            📘 {m}
          </option>
        ))}
      </NativeSelect>
      <DraftAttachments files={files.files} onRemove={files.remove} />
      <div className="flex items-start gap-1">
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} {...files.bind} placeholder={t('lab.work.inputPlaceholder')} className="min-h-14 text-xs" />
        <AttachButton onPick={files.add} />
      </div>
      <Button size="sm" className="w-fit" onClick={() => void handleStart()} disabled={!input.trim()}>
        {selected ? t('lab.work.startProcess') : t('lab.work.assignToLead', { name: lead?.name ?? '' })}
      </Button>
      {runs.map((r) => (
        <RunCard key={r.id} run={r} isCompact />
      ))}
    </div>
  )
}
