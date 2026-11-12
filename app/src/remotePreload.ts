// 원격 창(다른 PC 화면) 전용 통로 — 이 PC용 office:* 는 노출하지 않는다 (main/workspace, 설계 impl-design-decision.md)
// 화면 → 메인: officeRemoteBridge.postMessage(JSON 문자열) = ws:post · 메인 → 화면: setOnMessage로 받은 함수 = ws:msg (휴대폰 셸과 같은 계약, renderer/mobile/bridge.ts)
// "어느 PC인지"는 화면이 말하지 않는다 — 메인이 보낸 창으로 정한다

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OfficeWorkspacesApi, WorkspacesState } from './shared/workspace'

let onmessage: ((e: { data: string }) => void) | null = null
ipcRenderer.on('ws:msg', (_e, text: unknown) => {
  if (typeof text === 'string') onmessage?.({ data: text })
})

contextBridge.exposeInMainWorld('officeRemoteBridge', {
  postMessage: (text: string) => ipcRenderer.send('ws:post', String(text)),
  // contextBridge는 속성 대입을 넘기지 못해 함수로 받는다 (renderer/remote/install.ts가 감싼다)
  setOnMessage: (cb: ((e: { data: string }) => void) | null) => {
    onmessage = cb
  },
})

// 화면 틀(맥 신호등·윈도우 창 버튼 자리)을 맞추려고 이 PC의 OS만 알려 준다
contextBridge.exposeInMainWorld('officeRemoteShell', { platform: process.platform })

// 전환 드롭다운: 목록 보기·전환만 (추가·수정·삭제는 이 PC 창에서)
const workspaces: OfficeWorkspacesApi = {
  state: () => ipcRenderer.invoke('workspace:state'),
  switchTo: (target) => ipcRenderer.invoke('workspace:switchTo', target),
  onChange: (cb) => {
    const listener = (_e: IpcRendererEvent, state: WorkspacesState) => cb(state)
    ipcRenderer.on('workspace:onChange', listener)
    return () => {
      ipcRenderer.off('workspace:onChange', listener)
    }
  },
}
contextBridge.exposeInMainWorld('officeWorkspaces', workspaces)
