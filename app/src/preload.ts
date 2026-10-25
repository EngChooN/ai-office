import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OfficeApi } from './shared/types'
import { OFFICE_EVENTS, OFFICE_METHODS } from './shared/officeApiShape'
import type { OfficeUpdateApi, UpdateStatus } from './shared/updateCheck'

// 메서드는 office:<이름> invoke, on* 은 같은 이름 채널 구독으로 연결한다 (목록은 shared/officeApiShape — 원격 v2와 같은 목록)
const METHODS = OFFICE_METHODS
const EVENTS = OFFICE_EVENTS

const api = {
  platform: process.platform,
  ...Object.fromEntries(METHODS.map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(`office:${name}`, ...args)])),
  ...Object.fromEntries(
    EVENTS.map((name) => [
      name,
      (cb: (payload: unknown) => void) => {
        const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
        ipcRenderer.on(`office:${name}`, listener)
        return () => {
          ipcRenderer.off(`office:${name}`, listener)
        }
      },
    ]),
  ),
} as unknown as OfficeApi

contextBridge.exposeInMainWorld('office', api)

// 데스크톱 창 상태 (원격 v2와 상관없어 OfficeApi 밖에 둔다): 최소화·숨김이면 false
contextBridge.exposeInMainWorld('officeWindow', {
  onShown: (cb: (isShown: boolean) => void) => {
    const listener = (_e: IpcRendererEvent, isShown: boolean) => cb(isShown)
    ipcRenderer.on('window:shown', listener)
    return () => {
      ipcRenderer.off('window:shown', listener)
    }
  },
})

// 앱 업데이트 확인 (PC 앱 자신의 업데이트라 원격 v2와 상관없어 OfficeApi 밖에 둔다)
const update: OfficeUpdateApi = {
  status: () => ipcRenderer.invoke('update:status'),
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  skip: (version) => ipcRenderer.invoke('update:skip', version),
  onStatus: (cb) => {
    const listener = (_e: IpcRendererEvent, status: UpdateStatus) => cb(status)
    ipcRenderer.on('update:onStatus', listener)
    return () => {
      ipcRenderer.off('update:onStatus', listener)
    }
  },
}
contextBridge.exposeInMainWorld('officeUpdate', update)
