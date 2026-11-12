// 워크스페이스 창 묶음: 연결 PC마다 창 1개(필요할 때 만들고 닫지 않고 숨김). 전환 = 지금 창의 위치·크기를 다음 창이 이어받고 이전 창을 숨긴다
// 창 ↔ 워크스페이스 짝은 여기만 안다(webContents id → workspaceId) — 원격 창이 "어느 PC인지"를 스스로 말하지 않게
// Electron을 직접 부르지 않는다 (창은 deps가 만든다) — scripts/workspace.test.mts가 가짜 창으로 돌린다

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** 창 하나에 필요한 만큼만 (BrowserWindow를 감싼 것) */
export interface HubWindow {
  /** webContents id — IPC 보낸 창 확인용 */
  readonly senderId: number
  show(): void
  hide(): void
  focus(): void
  isDestroyed(): boolean
  isVisible(): boolean
  getBounds(): Bounds
  setBounds(b: Bounds): void
  send(channel: string, payload: unknown): void
  destroy(): void
}

export interface HubDeps {
  /** 이 PC 창 (닫혔으면 null) */
  local(): HubWindow | null
  /** 이 PC 창을 띄운다 (없으면 만든다) */
  showLocal(): void
  /** 원격 창을 숨긴 채로 만든다. 파티션은 창마다 따로 (이 PC의 localStorage와 섞이지 않게) */
  create(workspaceId: string, partition: string, onClosed: () => void): HubWindow
}

export const partitionOf = (workspaceId: string) => `persist:ws-${workspaceId}`

export function createWindowHub(deps: HubDeps) {
  const windows = new Map<string, HubWindow>()
  let current: 'self' | string = 'self'

  const alive = (w: HubWindow | null | undefined): w is HubWindow => !!w && !w.isDestroyed()
  /** 지금 앞에 있는 창 (원격이면 그 창, 아니면 이 PC 창) */
  const front = () => (current === 'self' ? deps.local() : windows.get(current)) ?? null

  const windowFor = (id: string) => {
    const w = windows.get(id)
    if (alive(w)) return w
    const created = deps.create(id, partitionOf(id), () => {
      if (windows.get(id) !== created) return
      windows.delete(id)
      // 보던 원격 창을 닫으면 이 PC 창으로 돌아간다
      if (current === id) {
        current = 'self'
        deps.showLocal()
      }
    })
    windows.set(id, created)
    return created
  }

  return {
    /** 보낸 창이 원격 창이면 그 워크스페이스 id */
    ownerOf(senderId: number): string | null {
      for (const [id, w] of windows) if (alive(w) && w.senderId === senderId) return id
      return null
    },
    isLocal(senderId: number) {
      const l = deps.local()
      return alive(l) && l.senderId === senderId
    },
    /** 이 PC 창의 webContents id (닫혔으면 null) */
    isLocalWindowId(): number | null {
      const l = deps.local()
      return alive(l) ? l.senderId : null
    },
    current: () => current,
    /** 전환: 다음 창이 지금 창의 위치·크기를 이어받고, 지금 창은 숨긴다 */
    switchTo(target: 'self' | string) {
      if (target === current && alive(front())) {
        front()!.show()
        front()!.focus()
        return
      }
      const prev = front()
      const bounds = alive(prev) && prev.isVisible() ? prev.getBounds() : null
      if (target === 'self') {
        deps.showLocal()
        const l = deps.local()
        if (alive(l) && bounds) l.setBounds(bounds)
      } else {
        const w = windowFor(target)
        if (bounds) w.setBounds(bounds)
        w.show()
        w.focus()
      }
      current = target
      if (alive(prev) && prev !== front()) prev.hide()
    },
    /** 트레이·알림·바탕화면 비서가 이 PC 창을 띄웠을 때 — 보던 원격 창을 숨기고 이 PC로 돌아온 것으로 친다 (겹쳐 뜨지 않게) */
    localShown() {
      if (current === 'self') return
      const w = windows.get(current)
      current = 'self'
      if (alive(w)) w.hide()
    },
    /** Dock·트레이로 다시 띄울 때 보던 원격 창이 있으면 그 창을 (없으면 false) */
    showCurrent(): boolean {
      if (current === 'self') return false
      const w = windows.get(current)
      if (!alive(w)) return false
      w.show()
      w.focus()
      return true
    },
    /** 워크스페이스를 지웠을 때 그 창을 닫는다 */
    close(id: string) {
      const w = windows.get(id)
      windows.delete(id)
      if (current === id) {
        current = 'self'
        deps.showLocal()
      }
      if (alive(w)) w.destroy()
    },
    /** 이 PC 창이 닫혔거나 앱을 끝낼 때 — 목록을 먼저 비워 닫힘 처리(onClosed)가 이 PC 창을 다시 띄우지 않게 한다 */
    closeAll() {
      const all = [...windows.values()]
      windows.clear()
      current = 'self'
      for (const w of all) if (alive(w)) w.destroy()
    },
    /** 열린 원격 창 (id, 창) */
    entries: () => [...windows].filter(([, w]) => alive(w)),
    window: (id: string) => {
      const w = windows.get(id)
      return alive(w) ? w : null
    },
  }
}

export type WindowHub = ReturnType<typeof createWindowHub>
