import { dialog, shell } from 'electron'
import type { AutoApprovePlan } from '../shared/autoApprove'
import type { DemoReaction } from '../shared/gallery'
import type { KnowledgeInput } from '../shared/knowledge'
import type { Zone } from '../shared/economy'
import type { GridItem, SeatSetPart } from '../shared/iso/furniture'
import type { OfficeMethod } from '../shared/officeApiShape'
import type { TutorialInput, TutorialScenario } from '../shared/tutorial'
import { HOOK_PORT, type Attachment, type RemoteMode } from '../shared/types'
import { listAgentTemplates } from './agents'
import { findById, saveUploads } from './attachments'
import { askHookInstalled, hooksInstalled, setAskHookInstalled, setHooksInstalled } from './external'
import type { Office } from './office'
import type { RemoteService } from './remote/service.ts'
import type { Secretary } from './secretary'
import { claudeStatus, openClaudeLogin, openCodexLogin, providerStatus } from './setup'
import { hireMarket } from './staffPack'

// OfficeApi 메서드 하나 = 처리 함수 하나. PC 화면(IPC)과 휴대폰(원격 v2 /v2/call)이 이 표를 함께 쓴다 — 같은 코드 경로
// 키는 OfficeMethod와 정확히 같아야 한다 (빠지거나 남으면 tsc 오류)

export type OfficeHandlers = { [K in OfficeMethod]: (...args: never[]) => unknown }

export function createOfficeHandlers(office: Office, remoteApi: () => RemoteService, secretary: () => Secretary): OfficeHandlers {
  return {
    snapshot: () => office.snapshot(),
    remoteStatus: () => remoteApi().status(),
    setRemoteEnabled: (isEnabled: boolean, port?: number) => (isEnabled ? remoteApi().enable(port) : remoteApi().disable()),
    regenerateRemoteQr: () => remoteApi().regenerate(),
    remoteQr: () => remoteApi().qr(),
    setRemoteHost: (host: string) => remoteApi().setHost(host),
    setRemoteLanOnly: (isLanOnly: boolean) => remoteApi().setLanOnly(isLanOnly),
    dismissRemoteLanNotice: () => remoteApi().dismissLanNotice(),
    setRemoteMode: (mode: RemoteMode) => remoteApi().setMode(mode),
    refreshRemoteTailscale: () => remoteApi().refreshTailscale(),
    dismissRemoteTsNotice: () => remoteApi().dismissTsNotice(),
    hire: (input: Parameters<Office['hire']>[0]) => office.hire(input),
    hireMarket: (id: string, provider?: unknown) => hireMarket(office, id, provider ?? undefined),
    fire: (id: string) => office.fire(id),
    updateStaff: (id: string, patch: Parameters<Office['updateStaff']>[1]) => office.updateStaff(id, patch),
    instruct: (id: string, text: string, attachments?: Parameters<Office['instruct']>[3]) => office.instruct(id, text, { kind: 'user' }, attachments ?? [], '', true),
    saveAttachments: (files: Parameters<typeof saveUploads>[0]) => saveUploads(files),
    openAttachment: async (id: string) => {
      const file = findById(id)
      if (file) await shell.openPath(file)
    },
    interrupt: (id: string, text?: string, attachments?: Attachment[]) => office.interrupt(id, text, attachments),
    resumeInTerminal: (id: string) => office.resumeInTerminal(id),
    changeEngine: (id: string, provider: Parameters<Office['changeEngine']>[1]) => office.changeEngine(id, provider),
    decide: (approvalId: string, allow: boolean) => office.decide(approvalId, allow),
    getRecord: (id: string) => office.getRecord(id),
    listAgentTemplates: (cwd: string) => listAgentTemplates(cwd),
    pickFolder: async () => {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return r.canceled ? null : r.filePaths[0]
    },
    pickFiles: async () => {
      const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
      return r.canceled ? [] : r.filePaths
    },
    missingFiles: (paths: string[]) => office.missingFiles(paths),
    setRefDocs: (target: Parameters<Office['setRefDocs']>[0], docs: string[]) => office.setRefDocs(target, docs),
    hooksStatus: () => ({ installed: hooksInstalled(), isAskInstalled: askHookInstalled(), port: HOOK_PORT }),
    setHooksInstalled: (installed: boolean) => ({ installed: setHooksInstalled(installed), isAskInstalled: askHookInstalled(), port: HOOK_PORT }),
    setAskHookInstalled: (installed: boolean) => ({ installed: hooksInstalled(), isAskInstalled: setAskHookInstalled(installed), port: HOOK_PORT }),
    createTeam: (name: string, color: string) => office.createTeam(name, color),
    updateTeam: (id: string, patch: Parameters<Office['updateTeam']>[1]) => office.updateTeam(id, patch),
    deleteTeam: (id: string) => office.deleteTeam(id),
    mergeTeams: (fromId: string, intoId: string) => office.mergeTeams(fromId, intoId),
    moveStaff: (id: string, move: Parameters<Office['moveStaff']>[1]) => office.moveStaff(id, move),
    createTask: (input: Parameters<Office['createTask']>[0]) => {
      const task = office.createTask(input)
      // 튜토리얼 '카드 만들기' 단계면 사용자가 만든 이 카드를 연습 카드로 삼는다
      office.tutorial.notify('taskCreated', task.id)
      return task
    },
    tutorialStart: (scenario: TutorialScenario) => office.tutorial.start(scenario),
    tutorialAct: (input: TutorialInput) => office.tutorial.act(input),
    tutorialCleanup: () => office.tutorial.cleanup(),
    updateTask: (id: string, patch: Parameters<Office['updateTask']>[1]) => office.updateTask(id, patch),
    assignTask: (taskId: string, staffId: string) => office.assignTask(taskId, staffId),
    deleteTask: (id: string) => office.deleteTask(id),
    mergeTasks: (keepId: string, mergeIds: string[]) => office.mergeTasks(keepId, mergeIds),
    boardCleanupPlan: () => office.boardCleanupPlan(),
    startMeeting: (input: Parameters<Office['startMeeting']>[0]) => office.startMeeting(input),
    answerMeetingDecision: (meetingId: string, decisionId: string, answer: string) => office.answerMeetingDecision(meetingId, decisionId, answer),
    endMeeting: (meetingId: string, mode: 'wrapup' | 'discard') => office.endMeeting(meetingId, mode),
    stopTask: (taskId: string) => office.stopTask(taskId),
    resumePlan: (taskId: string) => office.resumePlan(taskId),
    reviewPlan: (taskId: string, isApproved: boolean, feedback: string) => office.reviewPlan(taskId, isApproved, feedback),
    answerQuestion: (approvalId: string, answers: Record<string, string>) => office.answerQuestion(approvalId, answers),
    autoApproveStatus: () => office.autoApproveStatus(),
    setAutoApprove: (plan: AutoApprovePlan) => office.setAutoApprove(plan),
    autoApproveLog: () => office.autoApproveLog(),
    approveAlways: (approvalId: string) => office.approveAlways(approvalId),
    approvalRules: () => office.approvalRules(),
    deleteApprovalRule: (ruleId: string) => office.deleteApprovalRule(ruleId),
    knowledgeList: () => office.knowledgeList(),
    saveKnowledge: (input: KnowledgeInput) => office.saveKnowledge(input),
    deleteKnowledge: (id: string) => office.deleteKnowledge(id),
    galleryList: () => office.galleryList(),
    deleteGalleryEntry: (id: string) => office.deleteGalleryEntry(id),
    runDemoDayNow: () => office.runDemoDayNow(),
    demoReact: (meetingId: string, staffId: string, kind: DemoReaction, text?: string) => office.demoReact(meetingId, staffId, kind, text),
    refreshPlanUsage: () => office.refreshPlanUsage(),
    ledger: () => office.ledger(),
    buyItem: (itemId: string) => office.buyItem(itemId),
    applySurface: (zone: Zone, slot: 'wallpaper' | 'floor', itemId: string | null) => office.applySurface(zone, slot, itemId),
    placeItem: (itemId: string, x?: number, y?: number) => office.placeItem(itemId, x, y),
    moveItem: (uid: string, x: number, y: number) => office.moveItem(uid, x, y),
    storeItem: (uid: string) => office.storeItem(uid),
    placeGridItem: (itemId: string, floor: number, gx: number, gy: number, rot: number) => office.placeGridItem(itemId, floor, gx, gy, rot),
    moveGridItem: (uid: string, floor: number, gx: number, gy: number, rot: number) => office.moveGridItem(uid, floor, gx, gy, rot),
    setGridItemOn: (uid: string, isOn: boolean) => office.setGridItemOn(uid, isOn),
    stowAllGrid: (floor: number, keepSeats: boolean) => office.stowAllGrid(floor, keepSeats),
    restoreGridItems: (items: GridItem[]) => office.restoreGridItems(items),
    moveSeatSet: (floor: number, parts: SeatSetPart[]) => office.moveSeatSet(floor, parts),
    setGear: (staffId: string, slot: 'desk' | 'chair', itemId: string | null) => office.setGear(staffId, slot, itemId),
    missions: () => office.missions(),
    claimMission: (key: string) => office.claimMission(key),
    startTasks: (ids: string[]) => office.startTasks(ids),
    saveSchedule: (s: Parameters<Office['saveSchedule']>[0]) => office.saveSchedule(s),
    deleteSchedule: (id: string) => office.deleteSchedule(id),
    runScheduleNow: (id: string) => office.runScheduleNow(id),
    releasePlanHold: () => office.releasePlanHold(),
    chatHistory: () => office.chatHistory(),
    sendChat: (text: string, attachments?: Parameters<Office['sendChat']>[1], room?: string) => office.sendChat(text, attachments ?? [], room ?? undefined),
    timeline: (since: number) => office.timeline(since),
    staffActivity: (id: string) => office.staffActivity(id),
    dailyReport: (date: number) => office.dailyReport(date),
    payslip: (month: string) => office.payslip(month),
    updateSettings: (patch: Parameters<Office['updateSettings']>[0]) => office.updateSettings(patch),
    createLab: (input: Parameters<Office['createLab']>[0]) => office.createLab(input),
    claudeStatus: () => claudeStatus(),
    providerStatus: () => providerStatus(),
    listManuals: () => office.listManuals(),
    saveManual: (input: Parameters<Office['saveManual']>[0], prev?: string) => office.saveManual(input, prev),
    deleteManual: (file: string) => office.deleteManual(file),
    draftManual: (staffId: string, request: string, kind: Parameters<Office['draftManual']>[2]) => office.draftManual(staffId, request, kind),
    trainStaff: (name: string, ids: string[]) => office.trainStaff(name, ids),
    trainGroups: (name: string, labIds: string[], teamIds: string[]) => office.trainGroups(name, labIds, teamIds),
    startRun: (input: Parameters<Office['startRun']>[0]) => office.startRun(input),
    reviewRun: (id: string, approve: boolean, feedback: string) => office.reviewRun(id, approve, feedback),
    stopRun: (id: string) => office.stopRun(id),
    openClaudeLogin: () => openClaudeLogin(),
    openCodexLogin: () => openCodexLogin(),
    forkExternal: (id: string, text: string, attachments?: Parameters<Office['forkExternal']>[2]) => office.forkExternal(id, text, attachments ?? []),
    updateLab: (id: string, patch: Parameters<Office['updateLab']>[1]) => office.updateLab(id, patch),
    deleteLab: (id: string) => office.deleteLab(id),
    fireExternal: (id: string) => office.fireExternal(id),
    recruitExternal: (id: string, input: Parameters<Office['recruitExternal']>[1]) => office.recruitExternal(id, input),
    equipmentCatalog: (cwd: string) => office.equipmentCatalog(cwd),
    refreshEquipment: (cwd: string) => office.refreshEquipment(cwd),
    customMcpList: () => office.customMcpList(),
    saveCustomMcp: (input: Parameters<Office['saveCustomMcp']>[0], prevName?: string) => office.saveCustomMcp(input, prevName),
    deleteCustomMcp: (name: string) => office.deleteCustomMcp(name),
    loadStaffCommands: (staffId: string) => office.loadStaffCommands(staffId),
    setEquipment: (id: string, eq: Parameters<Office['setEquipment']>[1]) => office.setEquipment(id, eq),
    workChanges: (id: string) => office.workChanges(id),
    suggestCommitMessage: (id: string) => office.suggestCommitMessage(id),
    commitChanges: (id: string, message: string) => office.commitChanges(id, message),
    workRevertInfo: (id: string) => office.workRevertInfo(id),
    revertWork: (id: string) => office.revertWork(id),
    pushAndCreatePr: (id: string, title: string, body: string) => office.pushAndCreatePr(id, title, body),
    // 비서: 실행(secretaryRun)은 대표가 카드에서 누른 것 — 카드 안의 단계는 이 표의 다른 처리 함수로 돈다
    secretaryAsk: (text: string) => secretary().ask(text),
    secretaryRun: (cardId: string, options?: Parameters<Secretary['run']>[1]) => secretary().run(cardId, options ?? {}),
    secretaryCancel: (cardId: string) => secretary().cancel(cardId),
    secretaryClear: () => secretary().clear(),
  }
}
