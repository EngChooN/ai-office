import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AttachButton, DraftAttachments, useDraftAttachments } from '@/components/attachments'
import { useManualLabelOf } from '@/components/slash-menu'
import { useOffice } from '@/store'
import { t } from '@shared/i18n'
import { PACK_LIMITS } from '@shared/staffPack'
import { ColorChoice, LeadNote, PeoplePicker, WorkplaceChoice } from './OrgCreateDialog'
import { RefDocsEditor } from './RefDocsEditor'
import { RunCard } from './RunCard'
import { groupColor, groupId, groupLeadId, groupManuals, groupMembers, groupName, groupRefDocs, groupText, saveGroupPeople, TEAM_DESC_MAX, type OrgGroup } from './orgGroup'

/** 카드 ⋯ 메뉴·버튼이 여는 대화상자 종류 */
export type OrgDialogKind = 'info' | 'people' | 'refDocs' | 'workplace' | 'work'

export function OrgGroupDialog({ kind, group, onClose }: { kind: OrgDialogKind; group: OrgGroup; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {kind === 'info' && <InfoForm group={group} onClose={onClose} />}
        {kind === 'people' && <PeopleForm group={group} onClose={onClose} />}
        {kind === 'refDocs' && <RefDocsForm group={group} />}
        {kind === 'workplace' && group.kind === 'project' && <WorkplaceForm group={group} onClose={onClose} />}
        {kind === 'work' && <WorkForm group={group} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** 이름·색·하는 일(팀)/목표(프로젝트) */
function InfoForm({ group, onClose }: { group: OrgGroup; onClose: () => void }) {
  const [name, setName] = useState(groupName(group))
  const [color, setColor] = useState(groupColor(group))
  const [text, setText] = useState(groupText(group))
  const handleSave = async () => {
    if (!name.trim()) return
    if (group.kind === 'team') await window.office.updateTeam(group.team.id, { name: name.trim(), color, description: text.trim() })
    else await window.office.updateLab(group.lab.id, { name: name.trim(), color, goal: text.trim() })
    onClose()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('orgCard.info.title')}</DialogTitle>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('orgCard.create.name')}
        <Input value={name} maxLength={PACK_LIMITS.nameMax} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t(group.kind === 'team' ? 'orgCard.create.what' : 'orgCard.goal')}
        <Input value={text} maxLength={group.kind === 'team' ? TEAM_DESC_MAX : PACK_LIMITS.descMax} onChange={(e) => setText(e.target.value)} placeholder={t(group.kind === 'team' ? 'orgCard.create.whatPlaceholder' : 'orgCard.create.goalPlaceholder')} />
      </label>
      <div className="flex items-center gap-2 text-sm font-medium">
        {t('orgCard.create.color')}
        <ColorChoice color={color} onChange={setColor} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void handleSave()} disabled={!name.trim()}>
          {t('orgCard.save')}
        </Button>
      </DialogFooter>
    </>
  )
}

/** 사람 바꾸기 — 만들기 3단계와 같은 고르기 칸 */
function PeopleForm({ group, onClose }: { group: OrgGroup; onClose: () => void }) {
  const hired = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const [picked, setPicked] = useState(() => groupMembers(group, hired).map((s) => s.id))
  const [leadId, setLeadId] = useState(groupLeadId(group))
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    setPicked(next)
    if (!next.includes(leadId ?? '')) setLeadId(next[0] ?? null)
  }
  const handleSave = async () => {
    await saveGroupPeople(group, hired, picked, leadId)
    onClose()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {groupName(group)} · {t('orgCard.menu.members')}
        </DialogTitle>
        <DialogDescription>{t('orgCard.create.pickedN', { n: picked.length })}</DialogDescription>
      </DialogHeader>
      <PeoplePicker staff={hired} teams={teams} kind={group.kind} picked={picked} leadId={leadId} onToggle={toggle} onLead={setLeadId} currentTeamId={group.kind === 'team' ? group.team.id : undefined} />
      <LeadNote staff={hired} picked={picked} leadId={leadId} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void handleSave()} disabled={group.kind === 'project' && picked.length === 0}>
          {t('orgCard.save')}
        </Button>
      </DialogFooter>
    </>
  )
}

function RefDocsForm({ group }: { group: OrgGroup }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {groupName(group)} · {t('orgCard.menu.refDocs')}
        </DialogTitle>
      </DialogHeader>
      <RefDocsEditor
        target={{ kind: group.kind === 'team' ? 'team' : 'lab', id: groupId(group) }}
        docs={groupRefDocs(group)}
        audience={t(group.kind === 'team' ? 'org.refDocsAudience' : 'lab.refDocsAudience')}
        suggestFrom={group.kind === 'project' ? group.lab.cwd : null}
      />
    </>
  )
}

function WorkplaceForm({ group, onClose }: { group: Extract<OrgGroup, { kind: 'project' }>; onClose: () => void }) {
  const [cwd, setCwd] = useState(group.lab.cwd)
  const handleSave = async () => {
    await window.office.updateLab(group.lab.id, { cwd })
    onClose()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {group.lab.name} · {t('orgCard.workplace.title')}
        </DialogTitle>
      </DialogHeader>
      <WorkplaceChoice cwd={cwd} onChange={setCwd} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void handleSave()}>{t('orgCard.save')}</Button>
      </DialogFooter>
    </>
  )
}

/** 새 일감 첫 줄을 카드 제목으로 쓸 때 최대 길이 */
const TITLE_MAX = 60

/** 일 시키기: 매뉴얼 없이 리더에게 맡기거나(리더가 기획·분배), 교육한 프로세스 매뉴얼로 시작한다 */
function WorkForm({ group, onClose }: { group: OrgGroup; onClose: () => void }) {
  const id = groupId(group)
  const scopeKind = group.kind === 'team' ? 'team' : 'lab'
  const runs = useOffice(useShallow((s) => s.runs.filter((r) => r.scope.kind === scopeKind && r.scope.id === id).slice(0, 3)))
  const lead = useOffice((s) => s.staff.find((x) => x.id === groupLeadId(group)))
  const [manual, setManual] = useState('')
  const [input, setInput] = useState('')
  const files = useDraftAttachments()
  const labelOf = useManualLabelOf()
  const manuals = groupManuals(group)
  const selected = manual !== '' || !lead ? manual || manuals[0] || '' : ''

  const handleStart = async () => {
    const text = input.trim()
    if (!text) return
    const attachments = await files.upload()
    files.clear()
    if (selected) {
      await window.office.startRun({ manualName: selected, scope: { kind: scopeKind, id }, input: text, attachments })
    } else if (lead) {
      // 리더 흐름: 보드 카드를 만들어 리더에게 배정하면 리더가 기획 → 하위 업무 분배를 한다
      const task = await window.office.createTask({ title: text.split('\n')[0].slice(0, TITLE_MAX), detail: text, teamId: group.kind === 'team' ? id : null, labId: group.kind === 'project' ? id : null, attachments })
      await window.office.assignTask(task.id, lead.id)
    }
    setInput('')
    onClose()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{lead ? t('orgCard.work.title', { name: lead.name }) : t('orgCard.work.titleManual', { group: groupName(group) })}</DialogTitle>
        <DialogDescription>{t('orgCard.work.hint')}</DialogDescription>
      </DialogHeader>
      {manuals.length > 0 && (
        <NativeSelect value={selected} onChange={(e) => setManual(e.target.value)} className="h-8 text-sm">
          {lead && <option value="">{t('lab.work.noManual', { name: lead.name })}</option>}
          {manuals.map((m) => (
            <option key={m} value={m}>
              {labelOf(m)}
            </option>
          ))}
        </NativeSelect>
      )}
      <DraftAttachments files={files.files} onRemove={files.remove} />
      <div className="flex items-start gap-1">
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} {...files.bind} placeholder={t('lab.work.inputPlaceholder')} className="min-h-24" autoFocus />
        <AttachButton onPick={files.add} />
      </div>
      {runs.map((r) => (
        <RunCard key={r.id} run={r} isCompact />
      ))}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void handleStart()} disabled={!input.trim() || (!lead && !selected)}>
          {selected ? t('lab.work.startProcess') : t('orgCard.work.send')}
        </Button>
      </DialogFooter>
    </>
  )
}
