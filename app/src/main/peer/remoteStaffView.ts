// 원격 직원을 화면이 쓰는 Staff 모양으로 (설계서 2-2): 이 PC의 직원 전제(작업 폴더·세션·장비)는 비워 둔다
// 상태·말풍선·결재·remote 정보는 PeerManager.staffViews가 덮어쓴다

import type { Staff } from '../../shared/types'
import type { PeerStaffRecord } from './peerStore'

export function remoteStaffBase(rec: PeerStaffRecord, deskIndex: number, labIds: string[]): Staff {
  return {
    id: rec.id,
    kind: 'hired',
    name: rec.name,
    role: rec.role,
    avatar: rec.avatar,
    provider: rec.provider === 'codex' ? 'codex' : 'claude',
    model: rec.model,
    cwd: '',
    systemPrompt: '',
    approvalMode: 'ask',
    sessionId: null,
    teamId: null,
    labIds,
    equipment: { mcpServers: [], skills: [], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 },
    pid: null,
    status: 'idle',
    activity: '',
    approvals: [],
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    deskIndex,
    hiredAt: rec.addedAt,
    stats: { tasksDone: 0, toolCalls: 0, approvals: 0, xp: 0, level: 1, progress: 0 },
    meetingId: null,
    statusSince: rec.lastSeenAt ?? rec.addedAt,
    todayDone: 0,
  }
}
