// 워크스페이스 총괄: 목록·전환·원격 창 요청(ws:post)을 한곳에서. Electron·네트워크는 deps로 받는다 (scripts/workspace.test.mts)
// 원격 창이 "어느 PC인지"는 보낸 창 id로만 정한다. 쓰기 막기는 여기(gateCall)가 권위 있는 곳 — 화면의 버튼 비활성은 보조

import { canOpenWindow, gateCall, type WorkspaceAddResult, type WorkspaceColor, type WorkspacesState, type WorkspaceStatus, type WorkspaceTarget, type WorkspaceView } from '../../shared/workspace.ts'
import type { WorkspaceStore } from './workspaceStore.ts'
import type { WindowHub } from './workspaceWindows.ts'

/** 화면 보기 연결 (0단계 뒤 붙인다). 지금은 noLinks — 모두 '연결 중', 요청은 끊김 오류 */
export interface WorkspaceLinks {
  status(workspaceId: string): WorkspaceStatus
  /** 그 PC의 결재 대기 수 */
  pending(workspaceId: string): number
  /** 원격 창 요청을 저쪽 PC로 보낸다 (call·upload·download) */
  request(workspaceId: string, req: RemoteRequest): Promise<unknown>
  /** 워크스페이스가 생기고 없어질 때 (연결을 열고 닫는다) */
  sync(ids: string[]): void
}

export const noLinks: WorkspaceLinks = {
  status: () => 'connecting',
  pending: () => 0,
  request: () => Promise.reject({ status: 0, code: 'workspace_offline', message: '' }),
  sync: () => {},
}

export type RemoteRequest =
  | { type: 'call'; method: string; args: unknown[]; confirm?: boolean }
  | { type: 'upload'; name: string; mime: string; base64: string }
  | { type: 'download'; fileId: string; name: string }

export interface ServiceDeps {
  store: WorkspaceStore
  hub: WindowHub
  links: WorkspaceLinks
  /** 기존 짝 목록에 있는 PC인지와 그 이름 (없으면 null) */
  peerName(peerId: string): string | null
  /** 목록·상태가 바뀌었다고 창들에 알린다 (창마다 current가 다르다) */
  emit(senderId: number, state: WorkspacesState): void
  now?: () => number
}

const ID_MAX = 64

/** ws:post로 온 글을 요청으로 읽는다. 모양이 틀리면 null (버린다) */
export function parseRemotePost(text: unknown): (RemoteRequest & { id: string }) | { type: 'ready'; features: string[] } | null {
  if (typeof text !== 'string' || text.length > 40_000_000) return null
  let m: Record<string, unknown>
  try {
    m = JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  if (m.type === 'ready') return { type: 'ready', features: Array.isArray(m.features) ? m.features.filter((f): f is string => typeof f === 'string') : [] }
  if (typeof m.id !== 'string' || !m.id || m.id.length > ID_MAX) return null
  if (m.type === 'call' && typeof m.method === 'string' && Array.isArray(m.args)) return { type: 'call', id: m.id, method: m.method, args: m.args, ...(m.confirm === true ? { confirm: true } : {}) }
  if (m.type === 'upload' && typeof m.name === 'string' && typeof m.mime === 'string' && typeof m.base64 === 'string') return { type: 'upload', id: m.id, name: m.name, mime: m.mime, base64: m.base64 }
  if (m.type === 'download' && typeof m.fileId === 'string' && typeof m.name === 'string') return { type: 'download', id: m.id, fileId: m.fileId, name: m.name }
  return null
}

/** 요청 종류별로 막을지 정할 때 쓰는 이름 — 올리기는 쓰기, 내려받기는 읽기 */
const gateName = (req: RemoteRequest) => (req.type === 'call' ? req.method : req.type === 'download' ? 'snapshot' : 'saveAttachments')

export function createWorkspaceService(deps: ServiceDeps) {
  const now = deps.now ?? Date.now
  const { store, hub, links } = deps

  const views = (): WorkspaceView[] => store.list().map((w) => ({ ...w, status: links.status(w.id), pending: links.pending(w.id) }))
  const stateFor = (current: WorkspaceTarget): WorkspacesState => ({ list: views(), current })

  /** 이 PC 창·열린 원격 창 모두에 알린다 */
  const broadcast = () => {
    const local = hub.isLocalWindowId()
    if (local !== null) deps.emit(local, stateFor('self'))
    for (const [id, w] of hub.entries()) deps.emit(w.senderId, stateFor(id))
  }

  /** 보낸 창이 우리 창(이 PC 창·원격 창)이면 그 창이 보는 대상, 아니면 null */
  const targetOf = (senderId: number): WorkspaceTarget | null => (hub.isLocal(senderId) ? 'self' : hub.ownerOf(senderId))

  const reply = (workspaceId: string, msg: unknown) => hub.window(workspaceId)?.send('ws:msg', JSON.stringify(msg))

  return {
    state(senderId: number): WorkspacesState | null {
      const target = targetOf(senderId)
      return target === null ? null : stateFor(target)
    },
    /** 전환: 이 PC 창·원격 창 어디서든. 확인 전·옛 PC·허락 전이면 창을 열지 않는다 */
    switchTo(senderId: number, target: unknown): boolean {
      if (targetOf(senderId) === null || typeof target !== 'string') return false
      if (target !== 'self') {
        if (!store.get(target) || !canOpenWindow(links.status(target))) return false
        store.touch(target, now())
      }
      hub.switchTo(target)
      broadcast()
      return true
    },
    /** 추가·수정·삭제는 이 PC 창에서만 */
    add(senderId: number, input: { peerId?: unknown; name?: unknown; color?: unknown }): WorkspaceAddResult {
      if (!hub.isLocal(senderId) || typeof input?.peerId !== 'string') return { ok: false, code: 'unknown_peer' }
      const peerName = deps.peerName(input.peerId)
      if (peerName === null) return { ok: false, code: 'unknown_peer' }
      const r = store.add({ peerId: input.peerId, name: typeof input.name === 'string' ? input.name : '', color: input.color as WorkspaceColor }, peerName)
      if (r.ok) {
        links.sync(store.list().map((w) => w.id))
        broadcast()
      }
      return r
    },
    update(senderId: number, id: unknown, patch: { name?: unknown; color?: unknown }): boolean {
      if (!hub.isLocal(senderId) || typeof id !== 'string' || !patch || typeof patch !== 'object') return false
      const ok = store.update(id, patch)
      if (ok) broadcast()
      return ok
    },
    /** 목록에서만 뺀다 — 그 PC 사무실·짝 열쇠는 그대로 */
    remove(senderId: number, id: unknown): boolean {
      if (!hub.isLocal(senderId) || typeof id !== 'string') return false
      const ok = store.remove(id)
      if (!ok) return false
      hub.close(id)
      links.sync(store.list().map((w) => w.id))
      broadcast()
      return true
    },
    /** 원격 창 → 저쪽 PC 요청 (ws:post). 원격 창이 아니면 버린다 */
    async post(senderId: number, text: unknown): Promise<void> {
      const workspaceId = hub.ownerOf(senderId)
      if (workspaceId === null) return
      const req = parseRemotePost(text)
      if (!req || req.type === 'ready') return
      const { id, ...body } = req
      const gate = gateCall(gateName(body), links.status(workspaceId))
      if (!gate.ok) return void reply(workspaceId, { type: 'result', id, ok: false, error: { status: 0, code: gate.code, message: '' } })
      try {
        const result = await links.request(workspaceId, body)
        reply(workspaceId, { type: 'result', id, ok: true, result })
      } catch (e) {
        const err = (e && typeof e === 'object' ? e : {}) as { status?: unknown; code?: unknown; message?: unknown }
        reply(workspaceId, { type: 'result', id, ok: false, error: { status: Number(err.status) || 0, code: typeof err.code === 'string' ? err.code : 'app_error', message: typeof err.message === 'string' ? err.message : '' } })
      }
    },
    broadcast,
  }
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>
