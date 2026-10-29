// 장면 내보내기 흐름: 녹화 시작·남은 초·프레임 찍기·인코더(Worker) 전달·저장·완료 안내.
// 버튼·안내 화면과 분리해 둔다 — 화면 시안이 바뀌어도 이 흐름은 그대로. 다른 화면으로 가도 계속 만들도록 모듈 상태(zustand)에 둔다
import { create } from 'zustand'
import { officeStage, type MapRecorder } from '@/map/officeStage'
import { GIF_MAX_BYTES, GIF_SECONDS, type SceneFileKind, type SceneSaveReason } from '@shared/sceneExport'
import { composeFrame, cropOf, GIF_SIZE, loadIcon, makeWatermark, pngSizeOf, type Rect, type Watermark } from './compose'
import type { GifIn, GifOut } from './gifEncoder.worker'
import GifWorker from './gifEncoder.worker.ts?worker&inline'

const GIF_FPS = 15
const PREFS_KEY = 'aiOffice.sceneExport'

type FailReason = SceneSaveReason | 'noFrame'

export type ExportNotice =
  | { kind: 'saved'; file: SceneFileKind; name: string; path: string; bytes: number; size: 'ok' | 'shrunk' | 'over' }
  /** data가 있으면 [다른 폴더 고르기]로 같은 결과를 다시 저장할 수 있다 */
  | { kind: 'failed'; file: SceneFileKind; reason: FailReason; data?: Uint8Array }

interface Prefs {
  fileKind: SceneFileKind
  isRedacting: boolean
}

interface SceneExportState extends Prefs {
  /** 사용자가 고른 저장 폴더 (화면 표시용, 경로는 main이 기억). null = 기본 사진/AI Office */
  folder: string | null
  phase: 'idle' | 'recording' | 'encoding'
  secondsLeft: number
  /** 만드는 중 진행률 0~1 */
  progress: number
  notice: ExportNotice | null
  /** 마지막 GIF 측정값 (녹화 끝 → 저장까지, QA용) */
  lastStats: { ms: number; bytes: number; frames: number; width: number; fps: number } | null
  setPrefs(p: Partial<Prefs>): void
  savePng(): Promise<void>
  startGif(): Promise<void>
  stopGif(): void
  pickFolder(): Promise<void>
  /** 실패한 결과를 다른 폴더에 다시 저장 */
  retryInOtherFolder(): Promise<void>
  openFolder(): void
  dismiss(): void
}

function loadPrefs(): Prefs {
  const base: Prefs = { fileKind: 'gif', isRedacting: true }
  try {
    const { fileKind, isRedacting } = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
    return { fileKind: fileKind === 'png' ? 'png' : base.fileKind, isRedacting: isRedacting ?? base.isRedacting }
  } catch {
    return base
  }
}

/** 지도를 한 번 더 그릴 때 한 장 받는다 (지도가 닫혀 있거나 장면이 멈춰 있으면 시간 안에 못 받음 → null) */
function nextFrame(timeoutMs = 1000): Promise<{ canvas: HTMLCanvasElement; map: { w: number; h: number } } | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off()
      resolve(null)
    }, timeoutMs)
    const off = officeStage.addRecorder((canvas, map) => {
      clearTimeout(timer)
      off()
      // WebGL 화면은 이 콜백이 끝나면 지워진다 — 지금 바로 2D 캔버스로 옮긴다
      const copy = Object.assign(document.createElement('canvas'), { width: map.w, height: map.h })
      copy.getContext('2d')!.drawImage(canvas, 0, 0, map.w, map.h, 0, 0, map.w, map.h)
      resolve({ canvas: copy, map })
    })
  })
}

const iconOrNull = () => loadIcon().catch(() => null)

/** 녹화 중 장면 설정 (말풍선 가림·카메라 고정)을 켜고 끈다 */
function setSceneExportMode(isOn: boolean, isRedacting: boolean) {
  officeStage.mainScene()?.setExportMode({ isRedacting: isOn && isRedacting, isCameraLocked: isOn })
}

interface Recording {
  worker: Worker
  off: () => void
  timer: number
  stoppedAt: number
}
let rec: Recording | null = null

export const useSceneExport = create<SceneExportState>((set, get) => {
  const persist = () => {
    const { fileKind, isRedacting } = get()
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fileKind, isRedacting }))
  }

  const saveFile = async (data: Uint8Array, file: SceneFileKind, size: 'ok' | 'shrunk' | 'over' = 'ok') => {
    const api = window.officeScene
    const r = api ? await api.save(data, file, get().folder ? 'picked' : 'default') : ({ ok: false, reason: 'unknown' } as const)
    set({ notice: r.ok ? { kind: 'saved', file, name: r.name, path: r.path, bytes: r.bytes, size } : { kind: 'failed', file, reason: r.reason, data } })
    return r.ok
  }

  const finishGif = (msg: Extract<GifOut, { type: 'done' }>) => {
    const startedSave = rec?.stoppedAt ?? performance.now()
    rec?.worker.terminate()
    rec = null
    const data = new Uint8Array(msg.data)
    void saveFile(data, 'gif', msg.isOverLimit ? 'over' : msg.isShrunk ? 'shrunk' : 'ok').then(() => {
      const stats = { ms: Math.round(performance.now() - startedSave), bytes: data.byteLength, frames: msg.frames, width: msg.width, fps: msg.fps }
      console.info('[scene] GIF 내보내기', stats)
      set({ phase: 'idle', progress: 0, lastStats: stats })
    })
  }

  const failGif = (reason: FailReason) => {
    rec?.off()
    rec?.worker.terminate()
    if (rec) clearInterval(rec.timer)
    rec = null
    setSceneExportMode(false, false)
    set({ phase: 'idle', progress: 0, notice: { kind: 'failed', file: 'gif', reason } })
  }

  return {
    ...loadPrefs(),
    folder: null,
    phase: 'idle',
    secondsLeft: 0,
    progress: 0,
    notice: null,
    lastStats: null,

    setPrefs(p) {
      set(p)
      persist()
    },

    async savePng() {
      if (get().phase !== 'idle') return
      set({ notice: null })
      const scene = officeStage.mainScene()
      const { isRedacting } = get()
      // 가림을 켠 뒤 한 번 더 그린 장면을 찍는다
      setSceneExportMode(true, isRedacting)
      const [frame, icon] = await Promise.all([nextFrame(), iconOrNull()])
      // 그 사이 GIF 녹화가 시작됐으면 그쪽 가림·카메라 고정을 풀지 않는다
      if (scene === officeStage.mainScene() && get().phase === 'idle') setSceneExportMode(false, false)
      if (!frame) return set({ notice: { kind: 'failed', file: 'png', reason: 'noFrame' } })
      const crop = cropOf(frame.map)
      const size = pngSizeOf(crop)
      const out = Object.assign(document.createElement('canvas'), { width: size.w, height: size.h })
      composeFrame(out.getContext('2d')!, frame.canvas, crop, makeWatermark(size.w, icon))
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
      if (!blob) return set({ notice: { kind: 'failed', file: 'png', reason: 'unknown' } })
      await saveFile(new Uint8Array(await blob.arrayBuffer()), 'png')
    },

    async startGif() {
      if (get().phase !== 'idle' || !officeStage.isMapLive) return
      set({ notice: null, phase: 'recording', secondsLeft: GIF_SECONDS, progress: 0 })
      const icon = await iconOrNull()
      if (get().phase !== 'recording') return
      const mark: Watermark = makeWatermark(GIF_SIZE.w, icon)
      const out = Object.assign(document.createElement('canvas'), { width: GIF_SIZE.w, height: GIF_SIZE.h })
      const octx = out.getContext('2d', { willReadFrequently: true })!
      let worker: Worker
      try {
        worker = new GifWorker()
      } catch (err) {
        console.warn('[scene] 인코더를 띄우지 못함', err)
        return failGif('unknown')
      }
      const send = (msg: GifIn, transfer?: Transferable[]) => worker.postMessage(msg, transfer ?? [])
      worker.onmessage = (e: MessageEvent<GifOut>) => {
        const msg = e.data
        if (msg.type === 'progress') set({ progress: msg.ratio })
        else if (msg.type === 'done') finishGif(msg)
        else failGif(msg.message === 'noFrame' ? 'noFrame' : 'unknown')
      }
      worker.onerror = () => failGif('unknown')
      send({ type: 'start', width: GIF_SIZE.w, height: GIF_SIZE.h, maxBytes: GIF_MAX_BYTES })

      setSceneExportMode(true, get().isRedacting)
      let startAt = 0
      let nextAt = 0
      let crop: Rect | null = null
      const step = 1000 / GIF_FPS
      const onRender: MapRecorder = (canvas, map) => {
        const now = performance.now()
        if (!startAt) startAt = now
        const ms = now - startAt
        // 지도는 화면 빠르기(60~120fps)로 그린다 — 초당 15장 격자에 닿은 프레임만 쓴다
        if (ms + 4 < nextAt || ms > GIF_SECONDS * 1000) return
        // 격자보다 조금 일찍 온 프레임도 그 칸으로 친다 (안 그러면 다음 칸이 그대로라 바로 다음 프레임도 찍힌다)
        nextAt = (Math.floor((ms + 4) / step) + 1) * step
        // 녹화 중 창 크기가 바뀌어도 처음 자른 비율 그대로 (지도보다 커지면 다시 잡는다)
        if (!crop || crop.x + crop.w > map.w || crop.y + crop.h > map.h) crop = cropOf(map)
        composeFrame(octx, canvas, crop, mark)
        const rgba = octx.getImageData(0, 0, GIF_SIZE.w, GIF_SIZE.h).data.buffer
        send({ type: 'frame', rgba, ms }, [rgba])
      }
      const off = officeStage.addRecorder(onRender)
      const startedAt = performance.now()
      const timer = window.setInterval(() => {
        const left = Math.max(0, GIF_SECONDS - Math.floor((performance.now() - startedAt) / 1000))
        if (left !== get().secondsLeft) set({ secondsLeft: left })
        if (performance.now() - startedAt >= GIF_SECONDS * 1000 + 50) get().stopGif()
      }, 200)
      rec = { worker, off, timer, stoppedAt: 0 }
    },

    stopGif() {
      if (!rec || get().phase !== 'recording') return
      rec.off()
      clearInterval(rec.timer)
      rec.stoppedAt = performance.now()
      setSceneExportMode(false, false)
      set({ phase: 'encoding', progress: 0 })
      rec.worker.postMessage({ type: 'finish' } satisfies GifIn)
    },

    async pickFolder() {
      const f = await window.officeScene?.pickFolder()
      if (f) set({ folder: f.dir })
    },

    async retryInOtherFolder() {
      const n = get().notice
      if (n?.kind !== 'failed' || !n.data) return
      const f = await window.officeScene?.pickFolder()
      if (!f) return
      set({ folder: f.dir })
      await saveFile(n.data, n.file)
    },

    openFolder() {
      const n = get().notice
      if (n?.kind === 'saved') void window.officeScene?.openFolder(n.path)
    },

    dismiss() {
      set({ notice: null })
    },
  }
})

// 지난 실행에서 고른 저장 폴더 표시 (경로는 main이 기억)
void window.officeScene?.folder().then((f) => {
  if (f.isPicked) useSceneExport.setState({ folder: f.dir })
})
