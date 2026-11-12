// 연결 PC 목록 저장 (보는 쪽 기기의 userData/workspaces.json) — 이름·색·순서만. 열쇠·주소는 기존 짝 목록(peerId)이 가진다
// 이 PC의 DB·설정과 섞지 않는다: 파일 하나를 지우면 흔적이 없다

import { randomUUID } from 'node:crypto'
import { canAddWorkspace, cleanWorkspaceName, isWorkspaceColor, type Workspace, type WorkspaceAddResult, type WorkspaceColor } from '../../shared/workspace.ts'

export interface WorkspaceFile {
  read(): string | null
  write(text: string): void
}

export interface WorkspaceStore {
  list(): Workspace[]
  get(id: string): Workspace | undefined
  add(input: { peerId: string; name: string; color: WorkspaceColor }, fallbackName: string): WorkspaceAddResult
  update(id: string, patch: { name?: unknown; color?: unknown }): boolean
  remove(id: string): boolean
  touch(id: string, now: number): void
}

const parse = (text: string | null): Workspace[] => {
  if (!text) return []
  try {
    const raw = JSON.parse(text) as { workspaces?: unknown }
    if (!Array.isArray(raw.workspaces)) return []
    return raw.workspaces.filter(
      (w): w is Workspace => !!w && typeof w.id === 'string' && typeof w.peerId === 'string' && typeof w.name === 'string' && isWorkspaceColor(w.color) && typeof w.order === 'number' && typeof w.lastUsedAt === 'number',
    )
  } catch {
    // 깨진 파일은 빈 목록으로 (짝·열쇠는 그대로라 다시 추가하면 된다)
    return []
  }
}

export function createWorkspaceStore(file: WorkspaceFile, { now = Date.now, newId = randomUUID }: { now?: () => number; newId?: () => string } = {}): WorkspaceStore {
  let items = parse(file.read()).sort((a, b) => a.order - b.order)
  const save = () => file.write(JSON.stringify({ version: 1, workspaces: items }, null, 2))
  return {
    list: () => items.map((w) => ({ ...w })),
    get: (id) => {
      const w = items.find((x) => x.id === id)
      return w && { ...w }
    },
    add(input, fallbackName) {
      if (items.some((w) => w.peerId === input.peerId)) return { ok: false, code: 'duplicate' }
      if (!canAddWorkspace(items)) return { ok: false, code: 'full' }
      const workspace: Workspace = {
        id: newId(),
        peerId: input.peerId,
        name: cleanWorkspaceName(input.name, fallbackName),
        color: isWorkspaceColor(input.color) ? input.color : 'teal',
        order: items.reduce((m, w) => Math.max(m, w.order + 1), 0),
        lastUsedAt: now(),
      }
      items = [...items, workspace]
      save()
      return { ok: true, workspace: { ...workspace } }
    },
    update(id, patch) {
      const w = items.find((x) => x.id === id)
      if (!w) return false
      const next = { ...w, ...(patch.name !== undefined ? { name: cleanWorkspaceName(patch.name, w.name) } : {}), ...(isWorkspaceColor(patch.color) ? { color: patch.color } : {}) }
      items = items.map((x) => (x.id === id ? next : x))
      save()
      return true
    },
    remove(id) {
      if (!items.some((x) => x.id === id)) return false
      items = items.filter((x) => x.id !== id)
      save()
      return true
    },
    touch(id, at) {
      if (!items.some((x) => x.id === id)) return
      items = items.map((x) => (x.id === id ? { ...x, lastUsedAt: at } : x))
      save()
    },
  }
}
