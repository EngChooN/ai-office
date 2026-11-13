import { useMemo, type KeyboardEvent } from 'react'
import { useOffice } from '@/store'
import type { Staff, StaffStatus, Team, Lab } from '@shared/types'
import { chatRoomMembers, labRoomId, roomLabs, roomTeams, type ChatRoomInfo } from '@shared/chatRooms'
import { roomKey, roomsWithPendingApproval, unreadByRoom } from '@shared/chatUnread'
import { nextFocusIndex } from '@shared/chatRoomLayout'
import { isAwaitingTeam } from '@shared/delegation'
import { t } from '@shared/i18n'
import { usePendingMeetingDecisions } from './nav'

// 대화방 방 목록·구성원 계산 — 가로 방 탭·구성원 상태 줄(ChatPage), 왼쪽 방 목록(ChatSide), 접힌 띠(ChatRoomRail)가 같이 쓴다

/** 일하는 사람·확인이 필요한 사람을 앞에 */
export const STATUS_ORDER: Record<StaffStatus, number> = { working: 0, waiting: 1, error: 2, netWait: 3, idle: 4, offline: 5 }
/** 지시 요약 앞 머리말("[업무 보드] ", "[OO 랩] ")은 상태 줄에서 뺀다 */
export const stripHead = (text: string) => text.replace(/^\[[^\]]+\]\s*/, '')
/** 일하는 중이면 지금 하는 일 한 줄 (없으면 빈 글) */
export const doingOf = (s: Staff) => (s.status === 'working' ? stripHead(s.progress?.text ?? '') || s.activity : isAwaitingTeam(s) ? t('staffCard.now.awaitingTeam') : '')

/** 방 목록(팀·랩 방)과 방마다 안 읽은 수·기다리는 결재 */
export function useRoomList() {
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  const chat = useOffice((s) => s.chat)
  const chatSeen = useOffice((s) => s.chatSeen)
  const staff = useOffice((s) => s.staff)
  const unread = useMemo(() => (chatSeen ? unreadByRoom(chat, chatSeen) : {}), [chat, chatSeen])
  const pendingIds = useMemo(() => new Set(staff.flatMap((s) => s.approvals.map((a) => a.id))), [staff])
  const approvalRooms = useMemo(() => roomsWithPendingApproval(chat, pendingIds), [chat, pendingIds])
  return { teamRooms: roomTeams(teams), labRooms: roomLabs(labs), unread, approvalRooms }
}

export type RoomEntry = {
  /** 'all' | 팀 id | labRoomId */
  key: string
  label: string
  group: 'all' | 'team' | 'lab'
  /** 팀·랩 색 (전체 방은 없음 → var(--primary)) */
  color?: string
  isActive: boolean
  /** 지금 보고 있는 방은 0 (곧 읽음 처리) */
  unread: number
  hasApproval: boolean
  select: () => void
}

/**
 * 방 목록 한 벌 — 세로 목록(ChatSide)·56px 띠(ChatRoomRail)·가로 탭(RoomTabs)이 같은 안 읽음·결재 규칙으로 그리게 한다.
 * 회의실 화면에 놓인 목록에서는 어떤 방도 '보는 중'이 아니고, 방을 누르면 단체방으로 가서 그 방을 연다
 */
export function useRoomEntries(current: string | undefined, allLabel: string): RoomEntry[] {
  const openChatRoom = useOffice((s) => s.openChatRoom)
  const isChatView = useOffice((s) => s.view === 'chat')
  const { teamRooms, labRooms, unread, approvalRooms } = useRoomList()
  const entry = (key: string, label: string, group: RoomEntry['group'], room: string | null, color?: string): RoomEntry => {
    const isActive = isChatView && (current ?? null) === room
    const k = roomKey(room)
    return { key, label, group, color, isActive, unread: isActive ? 0 : (unread[k] ?? 0), hasApproval: approvalRooms.has(k), select: () => openChatRoom(room) }
  }
  return [
    entry('all', allLabel, 'all', null),
    ...teamRooms.map((tm) => entry(tm.id, tm.name, 'team', tm.id, tm.color)),
    ...labRooms.map((lb) => entry(labRoomId(lb.id), lb.name, 'lab', labRoomId(lb.id), lb.color)),
  ]
}

/** 방 목록 맨 아래 회의실 줄 (목록·띠 공용): 회의실 화면이면 선택됨, 대표 답을 기다리는 회의 결정 수 */
export function useMeetingEntry() {
  const setView = useOffice((s) => s.setView)
  const isActive = useOffice((s) => s.view === 'meeting')
  const pending = usePendingMeetingDecisions()
  return { isActive, pending, select: () => setView('meeting') }
}

/** 방 목록 ↑↓(Home·End) 키로 [data-room-item] 줄 사이 초점 이동 — Tab 순서는 그대로 두고 더하는 수단 */
export function roomArrowKeys(e: KeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-room-item]')]
  const next = nextFocusIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.key)
  if (next === null) return
  e.preventDefault()
  items[next].focus()
}

/** 안 읽은 수 배지 글자 (100 이상은 99+) */
export const unreadText = (count: number) => (count > 99 ? '99+' : String(count))

/** 이 방 구성원(전체 방은 일하는 중·확인 필요·오류·팀원 기다리는 리더만), 일하는 사람 먼저 */
export function useRoomPeople(room: ChatRoomInfo<Team, Lab> | undefined) {
  const staff = useOffice((s) => s.staff)
  return useMemo(() => {
    const hired = staff.filter((s) => s.kind === 'hired' && !s.isPractice)
    const list = room ? chatRoomMembers(room, hired) : hired.filter((s) => (s.status !== 'idle' || isAwaitingTeam(s)) && s.status !== 'offline')
    return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  }, [staff, room])
}
