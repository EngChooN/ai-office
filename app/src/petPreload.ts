import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  OfficePetApi,
  PetAlign,
  PetFlashFace,
  PetOpenTarget,
} from "./shared/deskPet";

// 바탕화면 비서 창(캐릭터·펼침 창) 전용 preload — 앱 창 preload보다 좁게 연다.
// 사무실 API는 읽기(snapshot·onSnapshot·자동결재 기록·직원 기록·단체방 글)와 말하기(비서·직원 지시·단체방 — 앱과 같은 office:* 처리 함수라 기록이 앱에도 남는다)만,
// 결재는 pet:decide, 질문은 pet:answer·pet:skip(이미 끝난 결재·맞지 않는 질문을 거르는 길)로만 간다

const view =
  new URLSearchParams(location.search).get("view") === "panel"
    ? "panel"
    : "pet";

contextBridge.exposeInMainWorld("office", {
  platform: process.platform,
  snapshot: () => ipcRenderer.invoke("office:snapshot"),
  secretaryAsk: (text: string) =>
    ipcRenderer.invoke("office:secretaryAsk", text),
  autoApproveLog: () => ipcRenderer.invoke("office:autoApproveLog"),
  getRecord: (staffId: string) =>
    ipcRenderer.invoke("office:getRecord", staffId),
  chatHistory: () => ipcRenderer.invoke("office:chatHistory"),
  // 첨부는 받지 않는다 (펼침 창은 글만 보낸다) — 앱 화면과 같은 인자 자리에 맞춘다
  instruct: (staffId: string, text: string) =>
    ipcRenderer.invoke("office:instruct", staffId, text),
  sendChat: (text: string, _attachments: unknown, room?: string) =>
    ipcRenderer.invoke("office:sendChat", text, undefined, room),
  onSnapshot: (cb: (payload: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on("office:onSnapshot", listener);
    return () => {
      ipcRenderer.off("office:onSnapshot", listener);
    };
  },
  onChat: (cb: (payload: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on("office:onChat", listener);
    return () => {
      ipcRenderer.off("office:onChat", listener);
    };
  },
});

// 화면(React)이 뜨기 전에 온 값도 놓치지 않게 preload가 마지막 값을 들고 있다
let align: PetAlign = "right";
const alignListeners = new Set<(a: PetAlign) => void>();
ipcRenderer.on("pet:align", (_e, a: PetAlign) => {
  align = a;
  for (const cb of alignListeners) cb(a);
});

const pet: OfficePetApi = {
  view,
  setInteractive: (isOn) => ipcRenderer.send("pet:interactive", isOn),
  dragStart: () => ipcRenderer.send("pet:dragStart"),
  dragMove: (dx, dy) => ipcRenderer.send("pet:dragMove", dx, dy),
  dragEnd: () => ipcRenderer.send("pet:dragEnd"),
  togglePanel: () => ipcRenderer.send("pet:togglePanel"),
  closePanel: () => ipcRenderer.send("pet:closePanel"),
  openApp: (target: PetOpenTarget) => ipcRenderer.send("pet:openApp", target),
  decide: (approvalId, allow) =>
    ipcRenderer.invoke("pet:decide", approvalId, allow),
  answer: (approvalId, answers) =>
    ipcRenderer.invoke("pet:answer", approvalId, answers),
  skip: (approvalId) => ipcRenderer.invoke("pet:skip", approvalId),
  hide: () => ipcRenderer.send("pet:hide"),
  onPanelVisible: (cb) => {
    const listener = (_e: IpcRendererEvent, isVisible: boolean) =>
      cb(isVisible);
    ipcRenderer.on("pet:panelVisible", listener);
    return () => {
      ipcRenderer.off("pet:panelVisible", listener);
    };
  },
  onPanelShown: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("pet:panelShown", listener);
    return () => {
      ipcRenderer.off("pet:panelShown", listener);
    };
  },
  onFace: (cb) => {
    const listener = (_e: IpcRendererEvent, face: PetFlashFace) => cb(face);
    ipcRenderer.on("pet:face", listener);
    return () => {
      ipcRenderer.off("pet:face", listener);
    };
  },
  onAlign: (cb) => {
    alignListeners.add(cb);
    cb(align);
    return () => {
      alignListeners.delete(cb);
    };
  },
};
contextBridge.exposeInMainWorld("officePet", pet);
