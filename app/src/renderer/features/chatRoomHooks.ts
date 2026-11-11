import { useMemo } from 'react'
import { useOffice } from '@/store'
import type { Staff, StaffStatus, Team, Lab } from '@shared/types'
import { chatRoomMembers, roomLabs, roomTeams, type ChatRoomInfo } from '@shared/chatRooms'
import { roomsWithPendingApproval, unreadByRoom } from '@shared/chatUnread'

// 대화방 방 목록·구성원 계산 — 가로 방 탭·구성원 상태 줄(ChatPage)과 분할 화면 왼쪽 칸(ChatSide)이 같이 쓴다

/** 일하는 사람·확인이 필요한 사람을 앞에 */
export const STATUS_ORDER: Record<StaffStatus, number> = { working: 0, waiting: 1, error: 2, netWait: 3, idle: 4, offline: 5 }
/** 지시 요약 앞 머리말("[업무 보드] ", "[OO 랩] ")은 상태 줄에서 뺀다 */
export const stripHead = (text: string) => text.replace(/^\[[^\]]+\]\s*/, '')
/** 일하는 중이면 지금 하는 일 한 줄 (없으면 빈 글) */
export const doingOf = (s: Staff) => (s.status === 'working' ? stripHead(s.progress?.text ?? '') || s.activity : '')

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

/** 이 방 구성원(전체 방은 일하는 중·확인 필요·오류인 사람만), 일하는 사람 먼저 */
export function useRoomPeople(room: ChatRoomInfo<Team, Lab> | undefined) {
  const staff = useOffice((s) => s.staff)
  return useMemo(() => {
    const hired = staff.filter((s) => s.kind === 'hired' && !s.isPractice)
    const list = room ? chatRoomMembers(room, hired) : hired.filter((s) => s.status !== 'idle' && s.status !== 'offline')
    return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  }, [staff, room])
}
