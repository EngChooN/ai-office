// 사무실 장면 내보내기 저장 (PC 전용 scene:* 채널). 렌더러에는 파일 권한을 주지 않고, 저장·폴더 열기만 여기서 한다.
// 저장 폴더는 렌더러가 보낸 경로를 쓰지 않는다 — 기본 폴더 또는 여기 대화창에서 사용자가 고른 폴더(main이 기억)만 쓴다
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { t } from '../shared/i18n/index.ts'
import { SCENE_FILE_MAX_BYTES, type SceneFileKind, type SceneFolder, type SceneSaveReason, type SceneSaveResult } from '../shared/sceneExport.ts'

const KINDS: readonly SceneFileKind[] = ['gif', 'png']

const defaultDir = () => path.join(app.getPath('pictures'), 'AI Office')

/** 사용자가 대화창으로 고른 폴더 — 다음 실행에도 쓰도록 userData에 적어 둔다 */
const prefsFile = () => path.join(app.getPath('userData'), 'scene-export.json')
let pickedDir: string | null | undefined

function loadPicked(): string | null {
  if (pickedDir !== undefined) return pickedDir
  try {
    const v = (JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) as { pickedDir?: unknown }).pickedDir
    pickedDir = typeof v === 'string' && path.isAbsolute(v) ? v : null
  } catch {
    pickedDir = null
  }
  return pickedDir
}

function setPicked(dir: string) {
  pickedDir = dir
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify({ pickedDir: dir }))
  } catch (err) {
    console.warn('[scene] 저장 폴더 기억 실패', err)
  }
}

const folderOf = (target: unknown): string => (target === 'picked' && loadPicked()) || defaultDir()

const pad = (n: number) => String(n).padStart(2, '0')

/** 파일 이름은 여기서만 만든다. 혹시라도 경로 조각이 섞이면 거절 */
const isPlainName = (name: string) => name === path.basename(name) && !name.includes('..') && !/[\\/]/.test(name)

/** ai-office-YYYYMMDD-HHmm — 같은 분에 또 저장하면 -2, -3 … */
function freeName(dir: string, kind: SceneFileKind) {
  const d = new Date()
  const base = `ai-office-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  for (let i = 1; i < 1000; i++) {
    const name = `${base}${i === 1 ? '' : `-${i}`}.${kind}`
    if (!fs.existsSync(path.join(dir, name))) return name
  }
  throw new Error('빈 파일 이름을 찾지 못함')
}

function reasonOf(err: unknown): SceneSaveReason {
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 'noPermission'
  if (code === 'ENOSPC') return 'diskFull'
  return 'unknown'
}

/** 이번 실행에서 저장한 파일 — 폴더 열기는 이 목록에 있는 것만 */
const saved = new Set<string>()

function save(data: unknown, kind: unknown, target: unknown): SceneSaveResult {
  if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > SCENE_FILE_MAX_BYTES) return { ok: false, reason: 'unknown' }
  if (!KINDS.includes(kind as SceneFileKind)) return { ok: false, reason: 'unknown' }
  const dir = folderOf(target)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const name = freeName(dir, kind as SceneFileKind)
    if (!isPlainName(name)) return { ok: false, reason: 'unknown' }
    const file = path.join(dir, name)
    fs.writeFileSync(file, data, { flag: 'wx' })
    saved.add(file)
    return { ok: true, path: file, name, bytes: data.byteLength }
  } catch (err) {
    console.warn('[scene] 저장 실패', err)
    return { ok: false, reason: reasonOf(err) }
  }
}

const currentFolder = (): SceneFolder => ({ dir: loadPicked() ?? defaultDir(), isPicked: loadPicked() !== null })

export function registerSceneExport(getWin: () => BrowserWindow | null) {
  ipcMain.handle('scene:save', (_e, data: unknown, kind: unknown, target: unknown) => save(data, kind, target))
  ipcMain.handle('scene:folder', () => currentFolder())
  ipcMain.handle('scene:openFolder', (_e, file: unknown) => {
    if (typeof file === 'string' && saved.has(file)) shell.showItemInFolder(file)
  })
  ipcMain.handle('scene:pickFolder', async (): Promise<SceneFolder | null> => {
    const win = getWin()
    const options = { title: t('export.pickFolder'), defaultPath: loadPicked() ?? defaultDir(), properties: ['openDirectory' as const, 'createDirectory' as const] }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const dir = r.canceled ? undefined : r.filePaths[0]
    if (!dir || !path.isAbsolute(dir)) return null
    setPicked(dir)
    return currentFolder()
  })
}
