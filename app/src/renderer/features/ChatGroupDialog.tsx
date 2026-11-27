import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useOffice } from '@/store'
import { cn } from '@/lib/utils'
import { GROUP_NAME_MAX, groupRoomId, groupRoomMembers, roomLabs, roomTeams } from '@shared/chatRooms'
import { TEAM_COLORS } from '@shared/types'
import { t } from '@shared/i18n'
import { countsAsStaff } from '@shared/quickChat'
import { ColorChoice } from './OrgCreateDialog'

/**
 * 여러 팀·프로젝트 단체방 만들기: 팀·프로젝트를 둘 이상 골라 방 하나로 모은다.
 * 방은 대화를 모으는 곳일 뿐 직원의 권한·결재 규칙은 그대로라는 안내를 함께 보인다 (PC·휴대폰 같은 창)
 */
export function ChatGroupDialog() {
  const isOpen = useOffice((s) => s.isChatGroupDialogOpen)
  const setOpen = useOffice((s) => s.setChatGroupDialogOpen)
  if (!isOpen) return null
  return (
    <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
      <DialogContent className="max-w-lg">
        <GroupForm onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function GroupForm({ onClose }: { onClose: () => void }) {
  const allTeams = useOffice((s) => s.teams)
  const allLabs = useOffice((s) => s.labs)
  const staff = useOffice((s) => s.staff)
  const groupCount = useOffice((s) => s.chatGroups?.length ?? 0)
  const openChatRoom = useOffice((s) => s.openChatRoom)
  const teams = useMemo(() => roomTeams(allTeams), [allTeams])
  const labs = useMemo(() => roomLabs(allLabs), [allLabs])
  const hired = useMemo(() => staff.filter((s) => s.kind === 'hired' && countsAsStaff(s)), [staff])
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(TEAM_COLORS[groupCount % TEAM_COLORS.length])
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [labIds, setLabIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const picked = teamIds.length + labIds.length
  const people = groupRoomMembers({ teams: teams.filter((x) => teamIds.includes(x.id)), labs: labs.filter((x) => labIds.includes(x.id)) }, hired).length
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const handleCreate = async () => {
    setIsSaving(true)
    try {
      const group = await window.office.createChatGroup({ name: name.trim(), color, teamIds, labIds })
      openChatRoom(groupRoomId(group.id))
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const option = (id: string, label: string, dot: string, count: number, isOn: boolean, onToggle: () => void) => (
    <label key={id} className={cn('flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 text-sm', isOn ? 'border-primary bg-primary/10' : 'hover:bg-accent/60')}>
      <input type="checkbox" checked={isOn} onChange={onToggle} className="accent-primary size-4 shrink-0" />
      <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground shrink-0 text-xs">{t('chat.group.peopleCount', { count })}</span>
    </label>
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('chat.group.dialogTitle')}</DialogTitle>
        <DialogDescription>{t('chat.group.dialogHint')}</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">{t('chat.group.name')}</span>
          <Input value={name} maxLength={GROUP_NAME_MAX} placeholder={t('chat.group.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </label>
        <ColorChoice color={color} onChange={setColor} />
        {teams.length + labs.length < 2 ? (
          <p className="text-muted-foreground text-sm">{t('chat.group.notEnough')}</p>
        ) : (
          <>
            {teams.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs font-medium">{t('chat.room.groupTeams')}</span>
                <div className="phone:grid-cols-1 grid grid-cols-2 gap-1.5">
                  {teams.map((tm) => option(tm.id, tm.name, tm.color, groupRoomMembers({ teams: [tm], labs: [] }, hired).length, teamIds.includes(tm.id), () => toggle(teamIds, setTeamIds, tm.id)))}
                </div>
              </div>
            )}
            {labs.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs font-medium">{t('chat.room.groupLabs')}</span>
                <div className="phone:grid-cols-1 grid grid-cols-2 gap-1.5">
                  {labs.map((lb) => option(lb.id, lb.name, lb.color, groupRoomMembers({ teams: [], labs: [lb] }, hired).length, labIds.includes(lb.id), () => toggle(labIds, setLabIds, lb.id)))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <DialogFooter className="items-center">
        <span className="text-muted-foreground mr-auto text-xs">{picked < 2 ? t('chat.group.needTwo') : t('chat.group.picked', { count: picked, people })}</span>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void handleCreate()} disabled={picked < 2 || isSaving}>
          {t('chat.group.create')}
        </Button>
      </DialogFooter>
    </>
  )
}
