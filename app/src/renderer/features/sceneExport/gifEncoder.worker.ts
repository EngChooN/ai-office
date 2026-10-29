// GIF 인코더 (Web Worker) — 녹화하면서 프레임을 바로바로 색 번호로 바꿔 쓰고, 끝나면 마무리만 한다 (gif-export-tech.md 2장)
// - 팔레트는 첫 프레임으로 한 번만 만든다 (프레임마다 만들면 느리고 깜빡인다)
// - 앞 장면과 같은 픽셀은 투명 번호로 바꾼다 — 안 바뀐 곳이 많아 압축이 크게 줄어든다 (14MB → 0.6MB)
// - 한도를 넘으면 들고 있던 색 번호 프레임으로 초당 장수 → 폭 순으로 낮춰 다시 쓴다 (녹화를 다시 하지 않는다)
import { applyPalette, GIFEncoder, quantize } from 'gifenc'

export type GifIn =
  | { type: 'start'; width: number; height: number; maxBytes: number }
  /** rgba: 프레임마다 따로 만든 버퍼 (큰 버퍼 하나를 나눠 넘기면 수십 배 느려진다 — 2-2) */
  | { type: 'frame'; rgba: ArrayBuffer; ms: number }
  | { type: 'finish' }

export type GifOut =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; data: ArrayBuffer; width: number; height: number; fps: number; frames: number; isShrunk: boolean; isOverLimit: boolean }
  | { type: 'error'; message: string }

type Rgb = [number, number, number]
interface Frame {
  index: Uint8Array
  ms: number
}

/** 한도를 넘었을 때 차례로 시도할 설정 (beta-launch.md 6-1: 초당 15장 → 10장, 폭 800 → 640) */
const SHRINK_STEPS = [
  { fps: 10, scale: 1 },
  { fps: 10, scale: 0.8 },
]

/** 색 번호 프레임을 차례로 받아 GIF로 쓴다. 프레임 길이는 다음 프레임 시각을 알아야 정해지므로 한 장 늦게 쓴다 */
class GifWriter {
  private enc = GIFEncoder()
  private prev: Uint8Array | null = null
  private pending: Frame | null = null
  private count = 0

  constructor(
    private width: number,
    private height: number,
    private palette: Rgb[],
    private transparentIndex: number,
  ) {}

  push(frame: Frame) {
    if (this.pending) this.write(this.pending, frame.ms)
    this.pending = frame
  }

  finish(lastDelayMs: number) {
    if (this.pending) this.write(this.pending, this.pending.ms + lastDelayMs)
    this.pending = null
    this.enc.finish()
    return { bytes: this.enc.bytes(), frames: this.count }
  }

  private write(f: Frame, nextMs: number) {
    // 1/100초 단위로 반올림한 시각끼리 빼서, 반올림 오차가 쌓여 전체 길이가 늘지 않게
    const delay = Math.max(1, Math.round(nextMs / 10) - Math.round(f.ms / 10)) * 10
    const isFirst = this.prev === null
    let pixels = f.index
    if (this.prev) {
      pixels = new Uint8Array(f.index)
      const prev = this.prev
      for (let i = 0; i < pixels.length; i++) if (pixels[i] === prev[i]) pixels[i] = this.transparentIndex
    }
    this.enc.writeFrame(pixels, this.width, this.height, {
      palette: isFirst ? this.palette : undefined,
      delay,
      transparent: !isFirst,
      transparentIndex: this.transparentIndex,
      // 앞 장면을 지우지 않고 그 위에 덮는다 (투명 = 앞 장면 그대로)
      dispose: 1,
    })
    this.prev = f.index
    this.count++
  }
}

/** 시간 격자(초당 fps장)마다 가장 가까운 프레임을 고른다 */
function pickFrames(frames: Frame[], fps: number): Frame[] {
  const step = 1000 / fps
  const end = frames[frames.length - 1].ms
  const out: Frame[] = []
  let j = 0
  for (let t = 0; t <= end + 1; t += step) {
    while (j + 1 < frames.length && Math.abs(frames[j + 1].ms - t) <= Math.abs(frames[j].ms - t)) j++
    out.push({ index: frames[j].index, ms: t })
  }
  return out
}

/** 색 번호 그림을 가장 가까운 픽셀로 줄인다 (팔레트는 그대로) */
function scaleIndex(src: Uint8Array, w: number, h: number, w2: number, h2: number) {
  const out = new Uint8Array(w2 * h2)
  for (let y = 0; y < h2; y++) {
    const row = Math.min(h - 1, Math.floor(((y + 0.5) * h) / h2)) * w
    for (let x = 0; x < w2; x++) out[y * w2 + x] = src[row + Math.min(w - 1, Math.floor(((x + 0.5) * w) / w2))]
  }
  return out
}

const ctx = self as unknown as { postMessage(msg: GifOut, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<GifIn>) => void) | null }

let width = 0
let height = 0
let maxBytes = 0
let colors: Rgb[] = []
let transparentIndex = 0
let frames: Frame[] = []
let stream: GifWriter | null = null

const post = (msg: GifOut, transfer?: Transferable[]) => ctx.postMessage(msg, transfer)

function addFrame(rgba: Uint8Array, ms: number) {
  if (!stream) {
    // 255색 + 투명 1칸
    colors = quantize(rgba, 255) as Rgb[]
    transparentIndex = colors.length
    stream = new GifWriter(width, height, [...colors, [0, 0, 0]], transparentIndex)
  }
  const frame = { index: applyPalette(rgba, colors), ms }
  frames.push(frame)
  stream.push(frame)
}

function encode(list: Frame[], w: number, h: number, fps: number, onProgress: (ratio: number) => void) {
  const writer = new GifWriter(w, h, [...colors, [0, 0, 0]], transparentIndex)
  list.forEach((f, i) => {
    writer.push(f)
    if (i % 10 === 0) onProgress(i / list.length)
  })
  return writer.finish(1000 / fps)
}

function finish() {
  if (!stream || frames.length === 0) return post({ type: 'error', message: 'noFrame' })
  const nativeFps = frames.length > 1 ? Math.round((1000 * (frames.length - 1)) / frames[frames.length - 1].ms) : 15
  let best = { ...stream.finish(1000 / nativeFps), width, height, fps: nativeFps }
  let isShrunk = false
  for (const [n, s] of SHRINK_STEPS.entries()) {
    if (best.bytes.byteLength <= maxBytes) break
    const w = Math.round((width * s.scale) / 2) * 2
    const h = Math.round((height * s.scale) / 2) * 2
    const picked = pickFrames(frames, s.fps).map((f) => (s.scale === 1 ? f : { index: scaleIndex(f.index, width, height, w, h), ms: f.ms }))
    const r = encode(picked, w, h, s.fps, (ratio) => post({ type: 'progress', ratio: (n + ratio) / SHRINK_STEPS.length }))
    if (r.bytes.byteLength >= best.bytes.byteLength) continue
    best = { ...r, width: w, height: h, fps: s.fps }
    isShrunk = true
  }
  const data = best.bytes.slice().buffer
  post({ type: 'done', data, width: best.width, height: best.height, fps: best.fps, frames: best.frames, isShrunk, isOverLimit: best.bytes.byteLength > maxBytes }, [data])
  frames = []
  stream = null
}

ctx.onmessage = (e) => {
  const msg = e.data
  try {
    if (msg.type === 'start') {
      ;({ width, height, maxBytes } = msg)
      frames = []
      stream = null
    } else if (msg.type === 'frame') addFrame(new Uint8Array(msg.rgba), msg.ms)
    else if (msg.type === 'finish') finish()
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
