import { useLayoutEffect, useRef, useState } from 'react'
import { PanelLeftCloseIcon, PinOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Lab, Team } from '@shared/types'
import type { ChatRoomInfo } from '@shared/chatRooms'
import { roomListMode, type RoomListMode, type RoomListPref } from '@shared/chatRoomLayout'
import { t } from '@shared/i18n'
import { ChatSide } from './ChatSide'
import { ChatRoomRail } from './ChatRoomRail'

// 데스크톱 '대화' 묶음의 왼쪽 방 목록 — 단체방(ChatPage)과 회의실(MeetingPage)이 같은 폭 판정·접힘 설정으로 그린다

const ROOM_LIST_KEY = 'office:chatRoomList'

/** 방 목록 모양(자동·고정·직접 접음)은 이 기기에서만 기억한다 — 기기마다 창 크기가 다르다 (못 읽으면 자동) */
function useRoomListPref() {
  const [pref, setPref] = useState<RoomListPref>(() => {
    try {
      const saved = localStorage.getItem(ROOM_LIST_KEY)
      return saved === 'open' || saved === 'rail' ? saved : 'auto'
    } catch {
      return 'auto'
    }
  })
  const save = (next: RoomListPref) => {
    setPref(next)
    try {
      localStorage.setItem(ROOM_LIST_KEY, next)
    } catch {
      // 저장 못 해도 이번 화면에서는 적용된다
    }
  }
  return [pref, save] as const
}

export type RoomListLayout = ReturnType<typeof useRoomListLayout>

/** '방 목록 + 내용' 행 폭을 재서 좁으면 56px 띠로 (사람이 고른 고정·직접 접음이 우선). rowRef는 그 행에 단다 */
export function useRoomListLayout() {
  const rowRef = useRef<HTMLDivElement>(null)
  const [rowWidth, setRowWidth] = useState(0)
  const [pref, setPref] = useRoomListPref()
  const [mode, setMode] = useState<RoomListMode>('list')
  useLayoutEffect(() => {
    const el = rowRef.current
    if (!el) return
    setRowWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setRowWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (rowWidth > 0) setMode((prev) => roomListMode(rowWidth, pref, prev))
  }, [rowWidth, pref])
  return { rowRef, rowWidth, mode, pref, setPref }
}

/** 펼친 방 목록(ChatSide) 또는 접힌 띠(ChatRoomRail). 폰 배치에서는 숨긴다 */
export function RoomListColumn({ room, layout }: { room: ChatRoomInfo<Team, Lab> | undefined; layout: RoomListLayout }) {
  const { mode, pref, setPref } = layout
  return (
    <div className="phone:hidden flex">
      {mode === 'list' ? (
        <ChatSide
          room={room}
          isDoingShown={false}
          isPinned={pref === 'open'}
          className="flex"
          headAction={
            <Button variant="ghost" className="size-7 p-0" onClick={() => setPref(pref === 'open' ? 'auto' : 'rail')} title={t(pref === 'open' ? 'chat.side.unpin' : 'chat.side.collapse')} aria-label={t(pref === 'open' ? 'chat.side.unpin' : 'chat.side.collapse')}>
              {pref === 'open' ? <PinOffIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
            </Button>
          }
        />
      ) : (
        <ChatRoomRail room={room} onPin={() => setPref('open')} />
      )}
    </div>
  )
}
