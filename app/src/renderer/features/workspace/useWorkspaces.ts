import { useEffect, useState } from 'react'
import type { WorkspacesState, WorkspaceView } from '@shared/workspace'

/** 워크스페이스 목록·지금 보는 대상. 통로가 없는 화면(휴대폰)이면 null */
export function useWorkspaces(): WorkspacesState | null {
  const [state, setState] = useState<WorkspacesState | null>(null)
  useEffect(() => {
    const api = window.officeWorkspaces
    if (!api) return
    let isActive = true
    void api.state().then((s) => isActive && s && setState(s))
    const off = api.onChange(setState)
    return () => {
      isActive = false
      off()
    }
  }, [])
  return state
}

/** 지금 보는 원격 PC (이 PC 창이면 null) */
export const currentWorkspace = (s: WorkspacesState | null): WorkspaceView | null => (s && s.current !== 'self' ? (s.list.find((w) => w.id === s.current) ?? null) : null)

/** 이 PC 창이 추가·수정·삭제까지 할 수 있는지 (원격 창 통로에는 add가 없다) */
export const canManageWorkspaces = () => typeof window.officeWorkspaces?.add === 'function'
