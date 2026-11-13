import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BuildingIcon, CheckIcon, CrownIcon, DownloadIcon, FileTextIcon, FolderOpenIcon, MoreHorizontalIcon, PaletteIcon, PlusIcon, PresentationIcon, Trash2Icon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/ui/page'
import { PopMenu, PopMenuItem } from '@/components/pop-menu'
import { cn } from '@/lib/utils'
import { useOffice, useViewLevel, useWorkMode } from '@/store'
import { officeOf, teamFloor } from '@shared/officeLevel'
import { labRoomId, roomTeams } from '@shared/chatRooms'
import { t } from '@shared/i18n'
import type { Staff, Team } from '@shared/types'
import { Avatar, StatusDot } from './StaffCard'
import { statusMetaOf } from './status'
import { roleLabel } from '@shared/roleLabel'
import { OrgCreateDialog } from './OrgCreateDialog'
import { OrgGroupDialog, type OrgDialogKind } from './OrgDialogs'
import { groupColor, groupId, groupLeadId, groupMembers, groupName, groupRefDocs, groupText, setGroupLead, type OrgGroup } from './orgGroup'

/** 팀 구성: 팀(늘 함께 일하는 부서)과 프로젝트(목표 하나로 여러 팀에서 모인 사람)를 카드로 보고, 3단계로 새로 만든다 */
export function OrgPage() {
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const externalTeams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'project')))
  const labs = useOffice((s) => s.labs)
  const staff = useOffice((s) => s.staff)
  const [creating, setCreating] = useState<{ kind?: OrgGroup['kind'] } | null>(null)
  const [newId, setNewId] = useState<string | null>(null)
  // 새로 만든 카드의 강조·'첫 일 시키기'는 잠시만
  useEffect(() => {
    if (!newId) return
    const timer = setTimeout(() => setNewId(null), 8000)
    return () => clearTimeout(timer)
  }, [newId])

  const hired = staff.filter((s) => s.kind === 'hired')
  const unassigned = hired.filter((s) => !s.teamId || !teams.some((tm) => tm.id === s.teamId))
  const groups: OrgGroup[] = [...teams.map((team) => ({ kind: 'team' as const, team })), ...labs.map((lab) => ({ kind: 'project' as const, lab }))]

  return (
    <Page
      title={t('org.title')}
      description={t('orgCard.desc')}
      actions={
        <Button size="sm" onClick={() => setCreating({})}>
          <PlusIcon /> {t('orgCard.new')}
        </Button>
      }
    >
      <SectionTitle>{t('orgCard.section.teams', { n: teams.length })}</SectionTitle>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {groups
          .filter((g) => g.kind === 'team')
          .map((g) => (
            <GroupCard key={groupId(g)} group={g} hired={hired} teams={teams} isNew={newId === groupId(g)} />
          ))}
        {unassigned.length > 0 && <UnassignedCard members={unassigned} teams={teams} />}
        <NewCard onClick={() => setCreating({ kind: 'team' })} />
      </div>

      <SectionTitle>{t('orgCard.section.projects', { n: labs.length })}</SectionTitle>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {groups
          .filter((g) => g.kind === 'project')
          .map((g) => (
            <GroupCard key={groupId(g)} group={g} hired={hired} teams={teams} isNew={newId === groupId(g)} />
          ))}
        <NewCard onClick={() => setCreating({ kind: 'project' })} />
      </div>

      {externalTeams.length > 0 && <ExternalStaff teams={externalTeams} staff={staff} />}

      {creating && <OrgCreateDialog initialKind={creating.kind} onClose={() => setCreating(null)} onCreated={setNewId} />}
    </Page>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-muted-foreground mt-6 mb-3 text-xs font-bold first:mt-0">{children}</h2>
}

function NewCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-muted-foreground hover:border-primary hover:text-foreground flex min-h-40 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-sm">
      <PlusIcon className="size-6" />
      <b className="text-foreground">{t('orgCard.new')}</b>
      {t('orgCard.newHint')}
    </button>
  )
}

/** 머리 오른쪽 한 마디: 문제 → 확인 기다림 → 일하는 중 → 모두 쉬는 중 */
function busyText(members: Staff[]): { text: string; className: string } {
  const count = (pred: (s: Staff) => boolean) => members.filter(pred).length
  const problem = count((s) => s.status === 'error')
  if (problem) return { text: t('orgCard.problem', { n: problem }), className: 'text-status-error' }
  const waiting = count((s) => s.status === 'waiting' && s.approvals.length > 0)
  if (waiting) return { text: t('orgCard.waiting', { n: waiting }), className: 'text-status-waiting' }
  const working = count((s) => s.status === 'working' || Boolean(s.awaitingTeam))
  if (working) return { text: t('orgCard.busy', { n: working }), className: 'text-status-working' }
  return { text: members.length ? t('orgCard.resting') : t('orgCard.nobody'), className: 'text-muted-foreground' }
}

function GroupCard({ group, hired, teams, isNew }: { group: OrgGroup; hired: Staff[]; teams: Team[]; isNew: boolean }) {
  const openChatRoom = useOffice((s) => s.openChatRoom)
  const setView = useOffice((s) => s.setView)
  const setMeetingPreset = useOffice((s) => s.setMeetingPreset)
  const [dialog, setDialog] = useState<OrgDialogKind | null>(null)
  const members = groupMembers(group, hired)
  const leadId = groupLeadId(group)
  const lead = members.find((m) => m.id === leadId)
  const color = groupColor(group)
  const text = groupText(group)
  const busy = busyText(members)
  const room = group.kind === 'team' ? (roomTeams([group.team]).length > 0 ? group.team.id : null) : group.lab.isPractice ? null : labRoomId(group.lab.id)
  const canWork = Boolean(lead) || (group.kind === 'team' ? group.team.manuals : group.lab.manuals)?.length

  return (
    <div className={cn('bg-card flex flex-col gap-3 overflow-hidden rounded-xl border pb-3', isNew && 'ring-primary ring-2 transition-shadow')} style={{ borderTop: `4px solid ${color}` }}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <b className="min-w-0 truncate">{groupName(group)}</b>
        <span className="text-muted-foreground shrink-0 rounded border px-1.5 text-[11px]">{t(group.kind === 'team' ? 'orgCard.kind.team' : 'orgCard.kind.project')}</span>
        <span className={cn('ml-auto shrink-0 text-xs', busy.className)}>{busy.text}</span>
      </div>

      <div className="px-4 text-sm">
        {text ? (
          group.kind === 'project' ? (
            <p>
              <span className="text-muted-foreground mr-1.5 text-xs font-semibold">{t('orgCard.goal')}</span>
              {text}
            </p>
          ) : (
            <p>{text}</p>
          )
        ) : (
          <p className="text-muted-foreground text-xs">
            {t(group.kind === 'team' ? 'orgCard.whatEmpty' : 'orgCard.goalEmpty')}{' '}
            <button type="button" className="text-primary font-semibold" onClick={() => setDialog('info')}>
              {t('orgCard.write')}
            </button>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1 px-3">
        {members.map((m) => (
          <Face key={m.id} staff={m} group={group} isLead={m.id === leadId} teams={teams} />
        ))}
        {members.length === 0 && <p className="text-muted-foreground px-1 text-xs">{t('orgCard.nobody')}</p>}
      </div>

      {isNew && lead && (
        <div className="px-4">
          <Button size="sm" variant="outline" className="border-primary text-primary w-full" onClick={() => setDialog('work')}>
            {t('orgCard.firstWork')}
          </Button>
        </div>
      )}

      <div className="mt-auto flex items-center gap-1.5 px-4">
        <Button size="sm" onClick={() => setDialog('work')} disabled={!canWork} title={canWork ? undefined : t('orgCard.workNoLead')}>
          {t('orgCard.work')}
        </Button>
        {room && (
          <Button size="sm" variant="outline" onClick={() => openChatRoom(room)}>
            {t('orgCard.chat')}
          </Button>
        )}
        <PopMenu icon={<MoreHorizontalIcon />} label={t('orgCard.moreMenu')} opens="down" className="ml-auto" buttonClassName="size-8">
          {(close) => {
            const act = (fn: () => void) => () => (close(), fn())
            return (
              <>
                <PopMenuItem icon={<PaletteIcon />} onClick={act(() => setDialog('info'))}>
                  {t('orgCard.menu.info')}
                </PopMenuItem>
                <PopMenuItem icon={<UsersIcon />} onClick={act(() => setDialog('people'))}>
                  {t('orgCard.menu.members')}
                </PopMenuItem>
                <PopMenuItem icon={<FileTextIcon />} onClick={act(() => setDialog('refDocs'))}>
                  {groupRefDocs(group).length ? t('orgCard.menu.refDocsN', { n: groupRefDocs(group).length }) : t('orgCard.menu.refDocs')}
                </PopMenuItem>
                {group.kind === 'project' && (
                  <PopMenuItem icon={<FolderOpenIcon />} onClick={act(() => setDialog('workplace'))}>
                    {t('orgCard.menu.workplace')}
                  </PopMenuItem>
                )}
                {group.kind === 'team' && <FloorItems team={group.team} teams={teams} close={close} />}
                <PopMenuItem
                  icon={<PresentationIcon />}
                  onClick={act(() => {
                    setMeetingPreset({ topic: t(group.kind === 'team' ? 'orgCard.meetingTopic' : 'lab.meetingTopic', { name: groupName(group) }), participantIds: members.map((m) => m.id) })
                    setView('meeting')
                  })}
                >
                  {t('orgCard.menu.meeting')}
                </PopMenuItem>
                {group.kind === 'project' && window.officePack && (
                  <PopMenuItem icon={<DownloadIcon />} onClick={act(() => void exportLab(group.lab.id))}>
                    {t('orgCard.menu.export')}
                  </PopMenuItem>
                )}
                <PopMenuItem icon={<Trash2Icon />} className="text-destructive" onClick={act(() => removeGroup(group))}>
                  {t(group.kind === 'team' ? 'orgCard.menu.deleteTeam' : 'orgCard.menu.endProject')}
                </PopMenuItem>
              </>
            )
          }}
        </PopMenu>
      </div>

      {dialog && <OrgGroupDialog kind={dialog} group={group} onClose={() => setDialog(null)} />}
    </div>
  )
}

async function exportLab(labId: string) {
  try {
    const r = await window.officePack?.exportLab(labId)
    if (r) window.alert(r.message)
  } catch {
    window.alert(t('pack.err.write'))
  }
}

function removeGroup(group: OrgGroup) {
  if (group.kind === 'team') {
    if (window.confirm(t('org.deleteTeam.confirm', { name: group.team.name }))) void window.office.deleteTeam(group.team.id)
  } else if (window.confirm(t('orgCard.endProject.confirm', { name: group.lab.name }))) void window.office.deleteLab(group.lab.id)
}

/** 사무실이 2층 이상이면 ⋯ 메뉴에 층 고르기 (업무 모드에선 사무실이 없으니 숨긴다) */
function FloorItems({ team, teams, close }: { team: Team; teams: Team[]; close: () => void }) {
  const level = useViewLevel()
  const isWorkMode = useWorkMode()
  const staff = useOffice((s) => s.staff)
  const { floors } = officeOf(level)
  if (floors < 2 || isWorkMode) return null
  const current = teamFloor(team, level, teams, staff)
  return (
    <>
      {Array.from({ length: floors }, (_, i) => i + 1).map((f) => (
        <PopMenuItem
          key={f}
          icon={f === current ? <CheckIcon /> : <BuildingIcon />}
          className={cn(f === current && 'font-semibold')}
          onClick={() => {
            close()
            if (f !== current) void window.office.updateTeam(team.id, { floor: f })
          }}
        >
          {t('orgCard.menu.floor', { n: f })}
        </PopMenuItem>
      ))}
    </>
  )
}

/** 얼굴 하나: 리더 왕관·상태 점, 프로젝트는 아래에 출신 팀. 누르면 작은 메뉴 */
function Face({ staff, group, isLead, teams }: { staff: Staff; group: OrgGroup | null; isLead: boolean; teams: Team[] }) {
  const select = useOffice((s) => s.select)
  const meta = statusMetaOf(staff)
  const home = teams.find((tm) => tm.id === staff.teamId)
  return (
    <PopMenu
      opens="down"
      label={staff.name}
      buttonClassName="h-auto w-16 flex-col gap-0.5 rounded-lg px-1 py-1.5 font-normal"
      icon={
        <>
          <span className="relative">
            <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} className="size-10" />
            {isLead && <CrownIcon className="text-status-waiting fill-status-waiting absolute -top-1.5 -left-1 size-3.5! drop-shadow" aria-label={t('orgCard.face.lead')} />}
            <span className={cn('ring-card absolute right-0 bottom-0 size-2.5 rounded-full ring-2', meta.dot, staff.status === 'working' && 'animate-pulse')} title={meta.label} />
          </span>
          <span className="w-full truncate text-center text-xs">{staff.name}</span>
          {group?.kind === 'project' && home && (
            <span className="w-full truncate text-center text-[10px]" style={{ color: home.color }}>
              {home.name}
            </span>
          )}
        </>
      }
    >
      {(close) => {
        const act = (fn: () => void) => () => (close(), fn())
        return (
          <>
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs">
                <b>{staff.name}</b> · {roleLabel(staff.role)}
              </span>
              <StatusDot staff={staff} />
            </div>
            <PopMenuItem onClick={act(() => select(staff.id))}>{t('orgCard.face.view')}</PopMenuItem>
            {group && (
              <PopMenuItem icon={<CrownIcon />} onClick={act(() => void setGroupLead(group, isLead ? null : staff.id))}>
                {t(isLead ? 'orgCard.face.unsetLead' : 'orgCard.face.makeLead')}
              </PopMenuItem>
            )}
            <div className="text-muted-foreground px-2.5 pt-1.5 text-[11px] font-semibold">{t('orgCard.face.moveHeader')}</div>
            {teams
              .filter((tm) => tm.id !== staff.teamId)
              .map((tm) => (
                <PopMenuItem key={tm.id} icon={<span className="size-2.5! rounded-full" style={{ background: tm.color }} />} onClick={act(() => void window.office.updateStaff(staff.id, { teamId: tm.id }))}>
                  {t('orgCard.face.moveTo', { team: tm.name })}
                </PopMenuItem>
              ))}
            {staff.teamId && teams.some((tm) => tm.id === staff.teamId) && (
              <PopMenuItem onClick={act(() => void window.office.updateStaff(staff.id, { teamId: null }))}>{t('orgCard.face.noTeam')}</PopMenuItem>
            )}
            {group?.kind === 'project' && (
              <PopMenuItem
                className="text-destructive"
                onClick={act(() => {
                  const memberIds = group.lab.memberIds.filter((id) => id !== staff.id)
                  void window.office.updateLab(group.lab.id, { memberIds, leadId: group.lab.leadId === staff.id ? null : group.lab.leadId })
                })}
              >
                {t('orgCard.face.removeFromProject')}
              </PopMenuItem>
            )}
          </>
        )
      }}
    </PopMenu>
  )
}

/** 팀이 없는 고용 직원 — 얼굴을 눌러 팀으로 옮긴다 */
function UnassignedCard({ members, teams }: { members: Staff[]; teams: Team[] }) {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border border-dashed p-4 pt-3">
      <div className="flex items-center gap-2">
        <b>{t('org.unassigned')}</b>
        <span className="text-muted-foreground ml-auto text-xs">{t('org.memberCount', { n: members.length })}</span>
      </div>
      <p className="text-muted-foreground text-xs">{t('orgCard.unassignedHint')}</p>
      <div className="-mx-1 flex flex-wrap gap-1">
        {members.map((m) => (
          <Face key={m.id} staff={m} group={null} isLead={false} teams={teams} />
        ))}
      </div>
    </div>
  )
}

/** 다른 창(외부 세션)에서 일하는 직원 — 보기만, 눌러서 펼친다 */
function ExternalStaff({ teams, staff }: { teams: Team[]; staff: Staff[] }) {
  const select = useOffice((s) => s.select)
  const [isOpen, setIsOpen] = useState(false)
  const summary = teams.map((tm) => t('orgCard.externalGroup', { name: tm.name, n: staff.filter((s) => s.teamId === tm.id).length })).join(' · ')
  return (
    <section className="mt-6">
      <button type="button" onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen} className="text-muted-foreground hover:text-foreground text-xs">
        {t('orgCard.external')} — {summary} {isOpen ? '⌃' : '›'}
      </button>
      {isOpen && (
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {teams.map((tm) => (
            <div key={tm.id} className="bg-card rounded-xl border p-4" style={{ borderTop: `4px solid ${tm.color}` }}>
              <b className="mb-2 block text-sm">{tm.name}</b>
              {staff
                .filter((s) => s.teamId === tm.id)
                .map((s) => (
                  <button key={s.id} type="button" onClick={() => select(s.id)} className="flex w-full items-center gap-2 py-1 text-left">
                    <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-8" />
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    <StatusDot staff={s} />
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
