import { TEAM_COLORS, type Lab, type Staff, type Team } from '@shared/types'

/** 팀 구성 화면의 카드 한 장 = 팀 또는 프로젝트(저장은 Lab) */
export type OrgGroup = { kind: 'team'; team: Team } | { kind: 'project'; lab: Lab }

/** 팀 '하는 일' 최대 글자 수 */
export const TEAM_DESC_MAX = 80

export const groupId = (g: OrgGroup) => (g.kind === 'team' ? g.team.id : g.lab.id)
export const groupName = (g: OrgGroup) => (g.kind === 'team' ? g.team.name : g.lab.name)
export const groupColor = (g: OrgGroup) => (g.kind === 'team' ? g.team.color : g.lab.color)
export const groupLeadId = (g: OrgGroup) => (g.kind === 'team' ? g.team.leadId : g.lab.leadId)
/** 팀은 '하는 일', 프로젝트는 '목표' */
export const groupText = (g: OrgGroup) => (g.kind === 'team' ? (g.team.description ?? '') : g.lab.goal)
export const groupRefDocs = (g: OrgGroup) => (g.kind === 'team' ? g.team.refDocs : g.lab.refDocs) ?? []
export const groupManuals = (g: OrgGroup) => (g.kind === 'team' ? g.team.manuals : g.lab.manuals) ?? []

/** 카드에 보일 사람: 팀은 소속 고용 직원, 프로젝트는 멤버 순서대로 (리더가 맨 앞) */
export function groupMembers(g: OrgGroup, hired: Staff[]): Staff[] {
  const list = g.kind === 'team' ? hired.filter((s) => s.teamId === g.team.id) : g.lab.memberIds.map((id) => hired.find((s) => s.id === id)).filter((s): s is Staff => Boolean(s))
  const lead = groupLeadId(g)
  return [...list.filter((s) => s.id === lead), ...list.filter((s) => s.id !== lead)]
}

/** 아직 안 쓴 색을 먼저 고른다 (다 썼으면 차례대로) */
export function nextColor(used: string[]): string {
  return TEAM_COLORS.find((c) => !used.includes(c)) ?? TEAM_COLORS[used.length % TEAM_COLORS.length]
}

export function setGroupLead(g: OrgGroup, leadId: string | null) {
  return g.kind === 'team' ? window.office.updateTeam(g.team.id, { leadId }) : window.office.updateLab(g.lab.id, { leadId })
}

/**
 * 사람과 리더를 한꺼번에 바꾼다. 팀은 빠진 사람을 무소속으로, 들어온 사람을 이 팀으로 옮긴 뒤 리더를 정한다
 * (옮길 때 main이 이전 팀의 리더 자리를 비운다)
 */
export async function saveGroupPeople(g: OrgGroup, hired: Staff[], memberIds: string[], leadId: string | null) {
  const lead = leadId && memberIds.includes(leadId) ? leadId : null
  if (g.kind === 'project') return window.office.updateLab(g.lab.id, { memberIds, leadId: lead })
  const now = hired.filter((s) => s.teamId === g.team.id).map((s) => s.id)
  for (const id of now) if (!memberIds.includes(id)) await window.office.updateStaff(id, { teamId: null })
  for (const id of memberIds) if (!now.includes(id)) await window.office.updateStaff(id, { teamId: g.team.id })
  await window.office.updateTeam(g.team.id, { leadId: lead })
}
