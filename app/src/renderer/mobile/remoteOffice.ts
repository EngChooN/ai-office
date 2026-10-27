// 원격 OfficeApi 어댑터: window.office와 같은 모양을 셸 메시지(POST /v2/call 등)로 만든다
// 메서드는 OFFICE_METHODS 목록으로 전부 자동 연결한다 — OfficeApi에 메서드가 생기면 따로 손대지 않아도 폰에서 불린다
// PC 전용 동작(pc_only)은 화면 코드를 고치지 않고 여기서 대신한다 (경로 입력·휴대폰에 저장·"PC에서 열어 주세요" 안내)
// DOM·React를 쓰지 않는다 — 시트·안내·확인창은 handlers로 받는다 (scripts/mobile.test.mts)
// 회사 레벨 11 이상(아이소 사무실)은 ready features 'iso-office'로 알리고, 셸이 그 값을 /v2/call·/v2/events 헤더로 싣는다.
// PC가 아는지는 연결될 때마다 hello로 확인한다 — 예전 PC(404·능력 없음)면 칸 배치를 보내지 않는다 (docs/specs/office-iso-tech.md 4-3절)

import { OFFICE_EVENTS, OFFICE_METHODS, type OfficeEvent, type OfficeMethod } from '../../shared/officeApiShape.ts'
import type { Attachment, OfficeApi, UploadFile } from '../../shared/types.ts'
import type { Bridge, BridgeError } from './bridge.ts'
import { t } from '../../shared/i18n/index.ts'

/** 원격 호출 실패 — 데스크톱 IPC가 던지는 자리(Promise reject)와 같아서 화면의 오류 처리가 그대로 동작한다 */
export class RemoteCallError extends Error {
  status: number
  code: string
  method: string
  alternative?: string
  reason?: string

  constructor(method: string, e: BridgeError) {
    super(e.message || e.code)
    this.name = 'RemoteCallError'
    this.status = e.status
    this.code = e.code
    this.method = method
    if (e.alternative) this.alternative = e.alternative
    if (e.reason) this.reason = e.reason
  }
}

export interface RemoteHandlers {
  /** 경로 입력 시트 (pickFolder·pickFiles 대신). 취소면 null */
  enterPath(kind: 'folder' | 'files'): Promise<string | string[] | null>
  /** 화면 아래 한 줄 안내 ("PC에서 열어 주세요" 등) */
  notice(message: string): void
  /** 연결이 끊기는 설정 변경 확인 (셸이 window.confirm을 네이티브 창으로 보여 준다) */
  confirm(message: string): boolean | Promise<boolean>
  /** PC 알림 클릭(focus)을 화면에 넘길지 — 폰 배치에서는 화면이 갑자기 바뀌지 않게 넘기지 않는다 */
  shouldDeliverFocus?(): boolean
  /** PC가 아이소 사무실을 아는지 판정됐을 때 (hello 응답·칸 배치 404) — true면 hello 전에 줄어 온 스냅샷을 다시 읽는다 */
  pcChecked?(isoOffice: boolean): void
}

/** PC 전용 동작 안내 문구 (docs/specs/android-pc-layout.md 6절) */
export const PC_ONLY_TEXT = {
  generic: 'PC에서 열어 주세요. 휴대폰에서는 할 수 없는 기능이에요.',
  resumeInTerminal: '터미널은 PC에서 열어 주세요.',
  openCodexLogin: 'Codex 로그인은 PC에서 해 주세요. PC 화면의 AI Office 설정에서 연결할 수 있어요.',
  openClaudeLogin: 'Claude 로그인은 PC에서 해 주세요. PC 화면의 AI Office 첫 실행 안내를 따라 주세요.',
  remoteQr: '연결 QR은 PC 화면에서만 볼 수 있어요.',
  saved: '휴대폰의 다운로드 폴더에 저장했어요.',
} as const

/** 화면이 그릴 수 있다고 PC에 알리는 능력 (ready features → 셸이 헤더 X-Office-Capabilities로) */
export const SCREEN_CAPABILITIES = ['iso-office'] as const
/** PC가 예전 버전이라 칸 배치를 못 할 때 */
export const pcUpdateText = () => t('shell.pcUpdate')
/** 칸 배치 메서드 — 예전 PC(iso-office 모름)에는 보내지 않는다 */
const GRID_METHODS = new Set<OfficeMethod>(['placeGridItem', 'moveGridItem', 'setGridItemOn', 'stowAllGrid', 'restoreGridItems', 'moveSeatSet'])

/** 연결이 끊기는 호출의 확인 문구 (배치안 7-2절) */
const CONFIRM_TEXT: Partial<Record<OfficeMethod, string>> = {
  regenerateRemoteQr: '이 휴대폰 연결이 바로 끊겨요.\n새 QR을 만들면 지금 연결된 휴대폰이 모두 끊겨요. 다시 쓰려면 PC 화면의 새 QR을 찍어야 해요.',
  setRemoteEnabled: '이 휴대폰 연결이 바로 끊겨요.\n원격 연결을 끄거나 포트를 바꾸면 이 휴대폰도 바로 끊기고, 다시 켜려면 PC 앞에서 켜야 해요.',
}

const EVENT_NAME: Record<OfficeEvent, string> = { onSnapshot: 'snapshot', onLog: 'log', onChat: 'chat', onFocus: 'focus', onRemoteStatus: 'remoteStatus' }

/** JSON으로 보낼 인자: 끝에 붙은 undefined는 빼고(PC가 남는 인자를 거절), 중간 undefined는 null */
export function normalizeArgs(args: unknown[]): unknown[] {
  let end = args.length
  while (end > 0 && args[end - 1] === undefined) end--
  return args.slice(0, end).map((a) => (a === undefined ? null : a))
}

/** 예전 PC 스냅샷 맞추기: 칸 배치(shop.grid)를 모르는 PC는 그 필드를 보내지 않는다 — 화면은 늘 배열로 읽으므로(서랍 개수·놓은 가구 목록) 빈 배열로 채운다 */
export function fillOldSnapshot<T>(snap: T): T {
  const shop = (snap as { shop?: { grid?: unknown } } | null)?.shop
  if (!shop || typeof shop !== 'object' || Array.isArray(shop.grid)) return snap
  return { ...snap, shop: { ...shop, grid: [] } }
}

export function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export interface RemoteSession {
  office: OfficeApi
  /** 셸이 resync(이벤트를 놓침)를 알리면 */
  onResync(cb: () => void): () => void
  /** PC가 아이소 사무실(칸 배치)을 아는지: null = 아직 확인 전 (연결될 때마다 hello로 다시 확인) */
  isoOffice(): boolean | null
}

export function createRemoteOffice(bridge: Bridge, h: RemoteHandlers): RemoteSession {
  const call = async (method: OfficeMethod | 'hello', args: unknown[], confirm = false): Promise<unknown> => {
    try {
      return await bridge.request({ type: 'call', method, args: normalizeArgs(args), ...(confirm ? { confirm: true } : {}) })
    } catch (raw) {
      const e = raw as BridgeError
      if (e.code === 'confirm_required' && !confirm) {
        if (await h.confirm(CONFIRM_TEXT[method as OfficeMethod] ?? e.message)) return call(method, args, true)
        throw new RemoteCallError(method, { status: 0, code: 'confirm_cancelled', message: '취소했어요' })
      }
      // PC만 할 수 있는 기능을 서버가 막았으면(어댑터가 모르는 새 기능 포함) 안내를 띄운다
      if (e.code === 'pc_only') h.notice(PC_ONLY_TEXT.generic)
      throw new RemoteCallError(method, e)
    }
  }

  // PC가 iso-office를 아는지 (hello는 상태를 남기지 않는 확인용 — 능력 판정은 셸이 싣는 헤더로 요청마다)
  let isoOffice: boolean | null = null
  let helloSeq = 0
  const setIsoOffice = (v: boolean) => {
    isoOffice = v
    h.pcChecked?.(v)
  }
  const checkPc = async () => {
    const seq = ++helloSeq
    try {
      const r = (await call('hello', [{ capabilities: [...SCREEN_CAPABILITIES] }])) as { capabilities?: unknown } | null
      if (seq === helloSeq) setIsoOffice(Array.isArray(r?.capabilities) && r.capabilities.includes('iso-office'))
    } catch (raw) {
      // 예전 PC는 hello를 모른다(404 unknown_method). 연결 실패 같은 다른 오류는 판단을 미룬다
      if (seq === helloSeq && (raw as RemoteCallError).code === 'unknown_method') setIsoOffice(false)
    }
  }
  const gridCall = (method: OfficeMethod) => async (...args: unknown[]) => {
    const refuse = () => {
      h.notice(pcUpdateText())
      return new RemoteCallError(method, { status: 0, code: 'pc_update_required', message: pcUpdateText() })
    }
    if (isoOffice === false) throw refuse()
    try {
      return await call(method, args)
    } catch (e) {
      if ((e as RemoteCallError).code !== 'unknown_method') throw e
      setIsoOffice(false)
      throw refuse()
    }
  }

  // PC 전용 동작은 서버에 보내지 않고 같은 모양의 값을 돌려준다 (서버도 같은 것을 422 pc_only로 막는다)
  const overrides: Partial<Record<OfficeMethod, (...args: never[]) => Promise<unknown>>> = {
    saveAttachments: async (files: UploadFile[]) => {
      const saved: Attachment[] = []
      for (const f of files) {
        const a = (await bridge.request({ type: 'upload', name: f.name, mime: f.mime, base64: toBase64(f.data) }).catch((e: BridgeError) => {
          throw new RemoteCallError('saveAttachments', e)
        })) as Omit<Attachment, 'path'>
        // 폰에는 PC 경로가 오지 않는다 (화면은 id로만 그림을 부른다)
        saved.push({ ...a, path: '' })
      }
      return saved
    },
    openAttachment: async (id: string) => {
      await bridge.request({ type: 'download', fileId: id, name: '' }).catch((e: BridgeError) => {
        throw new RemoteCallError('openAttachment', e)
      })
      h.notice(PC_ONLY_TEXT.saved)
    },
    pickFolder: async () => {
      const v = await h.enterPath('folder')
      return typeof v === 'string' && v.trim() ? v.trim() : null
    },
    pickFiles: async () => {
      const v = await h.enterPath('files')
      return Array.isArray(v) ? v : []
    },
    // 기존 오류 문구 자리(resumeError)에 그대로 보인다
    resumeInTerminal: async () => PC_ONLY_TEXT.resumeInTerminal,
    openClaudeLogin: async () => h.notice(PC_ONLY_TEXT.openClaudeLogin),
    openCodexLogin: async () => {
      h.notice(PC_ONLY_TEXT.openCodexLogin)
      return ''
    },
    remoteQr: async () => {
      h.notice(PC_ONLY_TEXT.remoteQr)
      return null
    },
    ...Object.fromEntries([...GRID_METHODS].map((m) => [m, gridCall(m)])),
    snapshot: async (...args: unknown[]) => fillOldSnapshot(await call('snapshot', args)),
  }

  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const resyncs = new Set<() => void>()
  bridge.on((msg) => {
    // 연결될 때마다(처음·재연결) PC를 다시 확인한다 — 그사이 PC가 업데이트됐거나 다른 PC일 수 있다
    if (msg.type === 'connection' && msg.state === 'open') return void checkPc()
    if (msg.type === 'resync') {
      void checkPc()
      return resyncs.forEach((cb) => cb())
    }
    if (msg.type !== 'event') return
    if (msg.name === 'focus' && h.shouldDeliverFocus && !h.shouldDeliverFocus()) return
    const data = msg.name === 'snapshot' ? fillOldSnapshot(msg.data) : msg.data
    listeners.get(msg.name)?.forEach((cb) => cb(data))
  })
  const subscribe = (name: string) => (cb: (payload: unknown) => void) => {
    const set = listeners.get(name) ?? new Set()
    listeners.set(name, set)
    set.add(cb)
    return () => void set.delete(cb)
  }

  const office = {
    platform: 'android',
    ...Object.fromEntries(OFFICE_METHODS.map((m) => [m, overrides[m] ?? ((...args: unknown[]) => call(m, args))])),
    ...Object.fromEntries(OFFICE_EVENTS.map((e) => [e, subscribe(EVENT_NAME[e])])),
  } as unknown as OfficeApi

  return {
    office,
    onResync: (cb) => {
      resyncs.add(cb)
      return () => void resyncs.delete(cb)
    },
    isoOffice: () => isoOffice,
  }
}
