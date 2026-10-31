import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OfficePetApi, PetAlign, PetOpenTarget } from './shared/deskPet'

// 바탕화면 비서 창(캐릭터·펼침 창) 전용 preload — 앱 창 preload보다 좁게 연다.
// 사무실 API는 읽기(snapshot·onSnapshot·자동결재 기록)와 비서에게 말하기만, 결재는 pet:decide(질문·이미 끝난 결재를 거르는 길)로만 간다

const view = new URLSearchParams(location.search).get('view') === 'panel' ? 'panel' : 'pet'

contextBridge.exposeInMainWorld('office', {
  platform: process.platform,
  snapshot: () => ipcRenderer.invoke('office:snapshot'),
  secretaryAsk: (text: string) => ipcRenderer.invoke('office:secretaryAsk', text),
  autoApproveLog: () => ipcRenderer.invoke('office:autoApproveLog'),
  onSnapshot: (cb: (payload: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on('office:onSnapshot', listener)
    return () => {
      ipcRenderer.off('office:onSnapshot', listener)
    }
  },
})

// 화면(React)이 뜨기 전에 온 값도 놓치지 않게 preload가 마지막 값을 들고 있다
let align: PetAlign = 'right'
const alignListeners = new Set<(a: PetAlign) => void>()
ipcRenderer.on('pet:align', (_e, a: PetAlign) => {
  align = a
  for (const cb of alignListeners) cb(a)
})

const pet: OfficePetApi = {
  view,
  setInteractive: (isOn) => ipcRenderer.send('pet:interactive', isOn),
  dragStart: () => ipcRenderer.send('pet:dragStart'),
  dragMove: (dx, dy) => ipcRenderer.send('pet:dragMove', dx, dy),
  dragEnd: () => ipcRenderer.send('pet:dragEnd'),
  togglePanel: () => ipcRenderer.send('pet:togglePanel'),
  closePanel: () => ipcRenderer.send('pet:closePanel'),
  openApp: (target: PetOpenTarget) => ipcRenderer.send('pet:openApp', target),
  decide: (approvalId, allow) => ipcRenderer.invoke('pet:decide', approvalId, allow),
  hide: () => ipcRenderer.send('pet:hide'),
  onPanelShown: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('pet:panelShown', listener)
    return () => {
      ipcRenderer.off('pet:panelShown', listener)
    }
  },
  onAlign: (cb) => {
    alignListeners.add(cb)
    cb(align)
    return () => {
      alignListeners.delete(cb)
    }
  },
}
contextBridge.exposeInMainWorld('officePet', pet)
