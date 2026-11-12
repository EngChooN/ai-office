import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BookOpenIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Page } from '@/components/ui/page'
import { EmptyGuide } from '@/components/empty-guide'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { manualLabel } from '@shared/manualName'
import type { Manual, ManualInput } from '@shared/types'
import { t } from '@shared/i18n'
import { Avatar } from './StaffCard'
import { shortPath } from './status'
import { IS_REMOTE_SCREEN } from '@/shell'
import { DuoIcon, IconText } from '@/components/duo-icon'
import { ManualEditor } from './ManualEditor'
import { NewManualDialog } from './NewManualDialog'

/** 매뉴얼실: 업무 매뉴얼(스킬)을 만들고·고치고·쓸 수 있게 한다 */
export function ManualsPage() {
  const manuals = useOffice((s) => s.manuals)
  const refresh = useOffice((s) => s.refreshManuals)
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const labs = useOffice((s) => s.labs)
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const [isStarting, setIsStarting] = useState(false)
  const [editing, setEditing] = useState<{ input: ManualInput; previousPath?: string } | null>(null)
  const [training, setTraining] = useState<{ manual: Manual; isJustSaved?: boolean } | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 휴대폰에서는 랩 폴더에만 만들 수 있다 (PC가 다른 폴더를 막는다)
  const projectDirs = useMemo(() => [...new Set([...(IS_REMOTE_SCREEN ? [] : staff.map((s) => s.cwd)), ...labs.flatMap((l) => (l.cwd ? [l.cwd] : []))])], [staff, labs])
  const trainedCount = (m: Manual) =>
    m.kind === 'personal'
      ? staff.filter((s) => s.equipment.skills === 'all' || s.equipment.skills.includes(m.name)).length
      : labs.filter((l) => l.manuals?.includes(m.name)).length + teams.filter((tm) => tm.manuals?.includes(m.name)).length

  const handleDelete = async (m: Manual) => {
    if (!window.confirm(t('manuals.confirmDelete', { name: manualLabel(m), path: shortPath(m.path) }))) return
    await window.office.deleteManual(m.path)
    void refresh()
  }
  // 새로 만든 매뉴얼은 저장하자마자 누가 쓸지 고르게 한다 (고치기는 닫기만)
  const handleSaved = (saved: Manual) => {
    const isNew = !editing?.previousPath
    setEditing(null)
    void refresh()
    if (isNew) setTraining({ manual: saved, isJustSaved: true })
  }
  const startButton = (
    <Button size="sm" onClick={() => setIsStarting(true)}>
      <PlusIcon /> {t('manualStart.button')}
    </Button>
  )

  return (
    <Page title={t('manuals.title')} description={t('manuals.description')} actions={startButton}>
      {manuals.length === 0 ? (
        <EmptyGuide title={t('manuals.emptyGuide.title')} what={t('manuals.emptyGuide.what')} when={t('manuals.emptyGuide.when')}>
          <Button size="sm" onClick={() => setIsStarting(true)}>
            <SparklesIcon /> {t('manualStart.button')}
          </Button>
        </EmptyGuide>
      ) : (
        (['process', 'personal'] as const).map((kind) => (
          <section key={kind} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold"><IconText text={kind === 'process' ? t('manuals.section.process') : t('manuals.section.personal')} size={16} /></h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {manuals.filter((m) => m.kind === kind).length === 0 && <p className="text-muted-foreground text-sm">{t('manuals.empty')}</p>}
              {manuals
                .filter((m) => m.kind === kind)
                .map((m) => {
                  const count = trainedCount(m)
                  return (
                    <div key={m.path} className="bg-card flex flex-col gap-2 rounded-xl border p-4">
                      <div className="flex items-center gap-2">
                        <BookOpenIcon className="text-primary size-4 shrink-0" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cn('truncate text-sm font-semibold', !m.title && 'font-mono')}>{manualLabel(m)}</span>
                          {/* 표시 이름이 있으면 파일 이름은 작게 */}
                          {m.title && <span className="text-muted-foreground truncate font-mono text-[10px]">{m.name}</span>}
                        </span>
                        <span className="text-muted-foreground shrink-0 rounded border px-1.5 text-[10px]">{m.scope === 'user' ? t('manuals.scopeUser') : shortPath(m.projectDir ?? '')}</span>
                      </div>
                      <p className="text-muted-foreground line-clamp-3 text-xs">{m.description || t('manuals.noDescription')}</p>
                      {kind === 'process' && <p className="text-muted-foreground text-xs">{m.steps.map((s) => s.title).join(' → ') || t('manuals.noSteps')}</p>}
                      <div className="mt-auto flex items-center gap-1">
                        {/* 아무도 안 쓰면 눈에 띄게 */}
                        <Button size="sm" variant={count === 0 ? 'default' : 'outline'} onClick={() => setTraining({ manual: m })}>
                          <UsersIcon /> {count === 0 ? t('manuals.train.submit') : t('manuals.trainCount', { count })}
                        </Button>
                        {/* 전역 매뉴얼은 모든 프로젝트에 영향 — 고치기·지우기는 PC에서만 */}
                        {IS_REMOTE_SCREEN && m.scope === 'user' ? (
                          <span className="text-muted-foreground ml-auto text-[10px]">{t('manuals.userPcOnly')}</span>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" className="ml-auto size-8" onClick={() => setEditing({ input: { ...m, title: manualLabel(m) }, previousPath: m.path })} aria-label={t('manuals.edit')}>
                              <PencilIcon className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="size-8" onClick={() => void handleDelete(m)} aria-label={t('manuals.delete')}>
                              <Trash2Icon className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>
        ))
      )}
      {isStarting && <NewManualDialog projectDir={projectDirs[0] ?? null} onClose={() => setIsStarting(false)} onDone={(input) => (setIsStarting(false), setEditing({ input }))} />}
      {editing && <ManualEditor initial={editing.input} previousPath={editing.previousPath} projectDirs={projectDirs} onClose={() => setEditing(null)} onSaved={handleSaved} />}
      {training && <TrainDialog manual={training.manual} isJustSaved={training.isJustSaved} onClose={() => (setTraining(null), void refresh())} />}
    </Page>
  )
}

/** 쓸 수 있게 하기: 한 명이 하는 업무는 직원에게, 여러 명이 이어서 하는 업무는 랩·팀에. 기본 선택은 지금 쓰는 곳만(새 매뉴얼은 비어 있음) — 전원 기본 선택은 뜻하지 않게 권한을 넓힌다 */
function TrainDialog({ manual, isJustSaved, onClose }: { manual: Manual; isJustSaved?: boolean; onClose: () => void }) {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const labs = useOffice((s) => s.labs)
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const [staffIds, setStaffIds] = useState(() => staff.filter((s) => s.equipment.skills === 'all' || s.equipment.skills.includes(manual.name)).map((s) => s.id))
  const [labIds, setLabIds] = useState(() => labs.filter((l) => l.manuals?.includes(manual.name)).map((l) => l.id))
  const [teamIds, setTeamIds] = useState(() => teams.filter((tm) => tm.manuals?.includes(manual.name)).map((tm) => tm.id))
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const handleSave = async () => {
    if (manual.kind === 'personal') await window.office.trainStaff(manual.name, staffIds)
    else await window.office.trainGroups(manual.name, labIds, teamIds)
    onClose()
  }
  const selectAll = () => (manual.kind === 'personal' ? setStaffIds(staff.map((s) => s.id)) : (setLabIds(labs.map((l) => l.id)), setTeamIds(teams.map((tm) => tm.id))))
  const isEmpty = manual.kind === 'personal' ? staff.length === 0 : labs.length + teams.length === 0
  const chip = (isOn: boolean) => cn('flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs', isOn && 'border-primary bg-accent')

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle><IconText text={t('manuals.train.title', { name: manualLabel(manual) })} size={18} /></DialogTitle>
          <DialogDescription>{manual.kind === 'personal' ? t('manuals.train.descPersonal') : t('manuals.train.descProcess')}</DialogDescription>
        </DialogHeader>
        {isJustSaved && <p className="text-sm font-medium">{t('manuals.train.justSaved')}</p>}
        {isEmpty ? (
          <p className="text-muted-foreground text-sm">{manual.kind === 'personal' ? t('manuals.train.noStaff') : t('manuals.train.noGroups')}</p>
        ) : manual.kind === 'personal' ? (
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => (
              <button key={s.id} type="button" onClick={() => toggle(staffIds, setStaffIds, s.id)} className={chip(staffIds.includes(s.id))}>
                <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-5" /> {s.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {labs.map((l) => (
                <button key={l.id} type="button" onClick={() => toggle(labIds, setLabIds, l.id)} className={chip(labIds.includes(l.id))}>
                  <DuoIcon name="lab" size={13} className="mr-1" />{l.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {teams.map((tm) => (
                <button key={tm.id} type="button" onClick={() => toggle(teamIds, setTeamIds, tm.id)} className={chip(teamIds.includes(tm.id))}>
                  <span className="size-2 rounded-full" style={{ background: tm.color }} /> {tm.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          {!isEmpty && (
            <Button variant="outline" className="sm:mr-auto" onClick={selectAll}>
              {t('manuals.train.selectAll')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isEmpty}>
            {t('manuals.train.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
