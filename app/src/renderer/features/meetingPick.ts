import type { Lab, Staff, Team } from '@shared/types'

/** 회의 참석자를 한 번에 채우는 묶음 (팀 또는 랩) */
export interface PickGroup {
  key: string
  kind: 'team' | 'lab'
  name: string
  color: string
  memberIds: string[]
}

export type GroupState = 'off' | 'partial' | 'on'

/** 고용 직원이 한 명 이상 있는 고용 팀·랩만 묶음으로 만든다 (팀 먼저, 그다음 랩) */
export function buildGroups(hired: Staff[], teams: Team[], labs: Lab[]): PickGroup[] {
  const hiredIds = new Set(hired.map((s) => s.id))
  const groups: PickGroup[] = [
    ...teams.filter((t) => t.kind === 'hired').map((t) => ({ key: `team:${t.id}`, kind: 'team' as const, name: t.name, color: t.color, memberIds: hired.filter((s) => s.teamId === t.id).map((s) => s.id) })),
    ...labs.map((l) => ({ key: `lab:${l.id}`, kind: 'lab' as const, name: l.name, color: l.color, memberIds: [...new Set(l.memberIds)].filter((id) => hiredIds.has(id)) })),
  ]
  return groups.filter((g) => g.memberIds.length > 0)
}

/** 구성원이 max명보다 많은 묶음은 max명이 모두 그 구성원이면 'on' (더 넣을 수 없으니 다시 누르면 해제) */
export function groupState(group: PickGroup, picked: string[], max: number): { state: GroupState; selected: number } {
  const selected = group.memberIds.filter((id) => picked.includes(id)).length
  return { state: selected === 0 ? 'off' : selected >= Math.min(group.memberIds.length, max) ? 'on' : 'partial', selected }
}

/**
 * 묶음 칩 클릭: on이면 그 구성원을 빼고, 아니면 빠진 구성원을 남은 자리만큼 앞에서부터 채운다.
 * skipped = 자리가 없어 못 넣은 인원
 */
export function toggleGroup(picked: string[], group: PickGroup, max: number): { picked: string[]; added: number; skipped: number } {
  if (groupState(group, picked, max).state === 'on') return { picked: picked.filter((id) => !group.memberIds.includes(id)), added: 0, skipped: 0 }
  const missing = group.memberIds.filter((id) => !picked.includes(id))
  const toAdd = missing.slice(0, Math.max(0, max - picked.length))
  return { picked: [...picked, ...toAdd], added: toAdd.length, skipped: missing.length - toAdd.length }
}
