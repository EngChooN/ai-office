import { useState, type FormEvent } from 'react'
import { BuildingIcon, CrownIcon, MessagesSquareIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useOffice, useViewLevel, useWorkMode } from '@/store'
import { officeOf, teamFloor } from '@shared/officeLevel'
import { roomTeams } from '@shared/chatRooms'
import { TEAM_COLORS, type Staff, type Team } from '@shared/types'
import { LabSection } from './LabSection'
import { Avatar, StatusDot } from './StaffCard'
import { RefDocsEditor } from './RefDocsEditor'
import { t } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'

/** 조직도: 팀(부서)을 만들고 직원을 배치하고 팀장을 임명한다 */
export function OrgPage() {
  const teams = useOffice((s) => s.teams)
  const staff = useOffice((s) => s.staff)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(TEAM_COLORS[0])

  const hiredTeams = teams.filter((tm) => tm.kind === 'hired')
  const projectTeams = teams.filter((tm) => tm.kind === 'project')
  const hired = staff.filter((s) => s.kind === 'hired')
  const unassigned = hired.filter((s) => !s.teamId || !hiredTeams.some((tm) => tm.id === s.teamId))

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await window.office.createTeam(name.trim(), color)
    setName('')
    setColor(TEAM_COLORS[(hiredTeams.length + 1) % TEAM_COLORS.length])
  }

  return (
    <Page title={t('org.title')} description={t('org.desc')}>
      <form onSubmit={handleCreate} className="phone:flex-wrap narrow:flex-wrap mb-6 flex items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('org.newTeam.placeholder')} className="narrow:max-w-none narrow:basis-full max-w-xs min-w-40" />
        <div className="flex gap-1">
          {TEAM_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={cn('phone:size-8 size-6 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />
          ))}
        </div>
        <Button type="submit" size="sm" disabled={!name.trim()}>
          <PlusIcon /> {t('org.newTeam.create')}
        </Button>
      </form>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {hiredTeams.map((tm) => (
          <TeamCard key={tm.id} team={tm} members={hired.filter((s) => s.teamId === tm.id)} teams={hiredTeams} />
        ))}
        {unassigned.length > 0 && <TeamCard team={null} members={unassigned} teams={hiredTeams} />}
      </div>

      <LabSection />

      {projectTeams.length > 0 && (
        <>
          <h2 className="text-muted-foreground mt-8 mb-3 text-sm font-semibold">📁 {t('org.projects')}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {projectTeams.map((tm) => (
              <div key={tm.id} className="bg-card rounded-xl border p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <span className="size-3 rounded-full" style={{ background: tm.color }} />
                  {tm.name}
                </div>
                {staff
                  .filter((s) => s.teamId === tm.id)
                  .map((s) => (
                    <MemberRow key={s.id} staff={s} />
                  ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}

function MemberRow({ staff, children }: { staff: Staff; children?: React.ReactNode }) {
  const select = useOffice((s) => s.select)
  return (
    <div className="flex items-center gap-2 py-1">
      <button type="button" onClick={() => select(staff.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} className="size-8" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{staff.name}</div>
          <div className="text-muted-foreground truncate text-xs">{roleLabel(staff.role)}</div>
        </div>
      </button>
      <StatusDot staff={staff} />
      {children}
    </div>
  )
}

/** 사무실이 2층 이상이면 팀 자리가 있을 층을 고른다 (업무 모드에선 사무실이 없으니 숨긴다) */
function TeamFloor({ team, teams }: { team: Team; teams: Team[] }) {
  const level = useViewLevel()
  const isWorkMode = useWorkMode()
  // 사무실 장면과 같은 층을 보이려면 인원으로 나눈다 (teamFloors)
  const staff = useOffice((s) => s.staff)
  const { floors } = officeOf(level)
  if (floors < 2 || isWorkMode) return null
  return (
    <label className="text-muted-foreground flex items-center gap-2 text-xs">
      <BuildingIcon className="size-3.5" /> {t('org.floor')}
      <NativeSelect value={teamFloor(team, level, teams, staff)} onChange={(e) => void window.office.updateTeam(team.id, { floor: Number(e.target.value) })} className="h-7 flex-1 text-xs">
        {Array.from({ length: floors }, (_, i) => i + 1).map((f) => (
          <option key={f} value={f}>
            {t('org.floorN', { n: f })}
          </option>
        ))}
      </NativeSelect>
    </label>
  )
}

function TeamCard({ team, members, teams }: { team: Team | null; members: Staff[]; teams: Team[] }) {
  const lead = team ? members.find((m) => m.id === team.leadId) : undefined
  const handleLead = (id: string) => team && void window.office.updateTeam(team.id, { leadId: id || null })
  const handleMove = (staffId: string, teamId: string) => void window.office.updateStaff(staffId, { teamId: teamId || null })
  const openChatRoom = useOffice((s) => s.openChatRoom)
  const handleDelete = () => {
    if (team && window.confirm(t('org.deleteTeam.confirm', { name: team.name }))) void window.office.deleteTeam(team.id)
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-4" style={team ? { borderColor: `${team.color}66` } : undefined}>
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: team?.color ?? '#8a8a9c' }} />
        <span className="flex-1 font-semibold">{team?.name ?? t('org.unassigned')}</span>
        <span className="text-muted-foreground text-xs">{t('org.memberCount', { n: members.length })}</span>
        {team && roomTeams([team]).length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openChatRoom(team.id)}>
            <MessagesSquareIcon className="size-3.5" /> {t('org.team.openChat')}
          </Button>
        )}
        {team && (
          <Button variant="ghost" size="icon" className="size-7" onClick={handleDelete} aria-label={t('org.deleteTeam')}>
            <Trash2Icon className="size-3.5" />
          </Button>
        )}
      </div>
      {team && (
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <CrownIcon className="size-3.5 text-status-waiting" /> {t('org.lead')}
          <NativeSelect value={lead?.id ?? ''} onChange={(e) => handleLead(e.target.value)} className="h-7 flex-1 text-xs">
            <option value="">{t('org.lead.none')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {team && <TeamFloor team={team} teams={teams} />}
      <div className="flex flex-col">
        {members.length === 0 && <p className="text-muted-foreground py-2 text-xs">{t('org.noMembers')}</p>}
        {members.map((m) => (
          <MemberRow key={m.id} staff={m}>
            <NativeSelect value={team?.id ?? ''} onChange={(e) => handleMove(m.id, e.target.value)} className="h-7 w-24 text-xs" aria-label={t('org.moveTeam')}>
              <option value="">{t('org.unassigned')}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </NativeSelect>
          </MemberRow>
        ))}
      </div>
      {team && (
        <div className="border-t pt-2">
          <RefDocsEditor target={{ kind: 'team', id: team.id }} docs={team.refDocs ?? []} audience={t('org.refDocsAudience')} isCollapsible />
        </div>
      )}
    </div>
  )
}
