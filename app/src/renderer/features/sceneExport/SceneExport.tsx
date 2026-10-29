// 장면 내보내기 화면: 사무실 오른쪽 위 버튼·설정 창, 녹화 중 테두리, 맵 아래 완료·실패 안내 (gif-export-design.md 3장)
// 흐름(녹화·인코딩·저장)은 useSceneExport가 맡고, 여기는 보여 주기와 누르기만
import { useEffect, useRef, useState } from 'react'
import { AlertTriangleIcon, CameraIcon, CheckCircle2Icon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@shared/i18n'
import { useSceneExport, type ExportNotice } from './useSceneExport'

const NOTICE_MS = 8_000
const HUD_BUTTON = 'flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#1a1d28]/90 px-3 py-1.5 text-xs text-white shadow-lg'

const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

/** 저장 기능이 있는 PC 앱에서만 (모바일 빌드는 preload가 없다) */
export const canExportScene = () => typeof window.officeScene !== 'undefined'

/** [꾸미기] 왼쪽 버튼: 기본 → 설정 창, 녹화 중 → 남은 초·멈춤, 만드는 중 → 진행률 */
export function SceneExportButton() {
  const phase = useSceneExport((s) => s.phase)
  const secondsLeft = useSceneExport((s) => s.secondsLeft)
  const progress = useSceneExport((s) => s.progress)
  const stopGif = useSceneExport((s) => s.stopGif)
  const [isOpen, setIsOpen] = useState(false)
  // 녹화 중 건물 밖·다른 화면으로 가면 거기까지 찍은 것으로 끝낸다 (장면 가림·카메라 고정도 이때 풀린다)
  useEffect(() => () => useSceneExport.getState().stopGif(), [])

  if (phase === 'recording')
    return (
      <button type="button" onClick={stopGif} className={cn(HUD_BUTTON, 'border-destructive')}>
        <span className="bg-destructive size-2 animate-pulse rounded-full" />
        {t('export.recording', { n: secondsLeft })} · {t('export.stop')}
      </button>
    )
  if (phase === 'encoding')
    return (
      <div className={cn(HUD_BUTTON, 'cursor-default')} role="status">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
          <span className="bg-primary block h-full" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
        {t('export.encoding', { pct: Math.round(progress * 100) })}
      </div>
    )
  return (
    <div className="relative">
      <button type="button" onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen} className={HUD_BUTTON}>
        <CameraIcon className="size-3.5" /> {t('export.button')}
      </button>
      {isOpen && <ExportPopover onClose={() => setIsOpen(false)} />}
    </div>
  )
}

function ExportPopover({ onClose }: { onClose: () => void }) {
  const fileKind = useSceneExport((s) => s.fileKind)
  const isRedacting = useSceneExport((s) => s.isRedacting)
  const folder = useSceneExport((s) => s.folder)
  const setPrefs = useSceneExport((s) => s.setPrefs)
  const pickFolder = useSceneExport((s) => s.pickFolder)
  const ref = useRef<HTMLDivElement>(null)

  // 바깥을 누르거나 Esc면 닫는다
  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const handleGo = () => {
    onClose()
    const st = useSceneExport.getState()
    void (fileKind === 'png' ? st.savePng() : st.startGif())
  }

  return (
    <div ref={ref} role="dialog" aria-label={t('export.title')} className="absolute top-full right-0 z-20 mt-2 flex w-80 flex-col gap-3 rounded-lg border border-white/10 bg-[#1a1d28]/95 p-3 text-xs text-white shadow-lg">
      <div className="font-semibold">{t('export.title')}</div>
      <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-md border border-white/10 p-0.5">
        {(['png', 'gif'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={fileKind === k}
            onClick={() => setPrefs({ fileKind: k })}
            className={cn('rounded px-2 py-1.5', fileKind === k ? 'bg-primary text-primary-foreground' : 'hover:bg-white/10')}
          >
            {t(k === 'png' ? 'export.kind.png' : 'export.kind.gif')}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={isRedacting} onChange={(e) => setPrefs({ isRedacting: e.target.checked })} className="accent-primary" />
        {t('export.hideBubbles')}
      </label>
      <div className="flex items-center justify-between gap-2 text-white/70">
        <span className="truncate" title={folder ?? undefined}>
          {t('export.folder')}: {folder ?? t('export.folderDefault')}
        </span>
        <button type="button" onClick={() => void pickFolder()} className="shrink-0 rounded px-1.5 py-0.5 text-white underline-offset-2 hover:underline">
          {t('export.change')}
        </button>
      </div>
      {fileKind === 'gif' && <p className="text-[11px] text-white/60">{t('export.recordNote')}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 hover:bg-white/10">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={handleGo} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 font-semibold">
          {fileKind === 'png' ? t('common.save') : t('export.start')}
        </button>
      </div>
    </div>
  )
}

/** 녹화 중 맵 둘레 빨간 테두리 (DOM이라 결과물에는 안 찍힌다) */
export function RecordingFrame() {
  const isRecording = useSceneExport((s) => s.phase === 'recording')
  if (!isRecording) return null
  return <div aria-hidden className="border-destructive pointer-events-none absolute inset-0 border-2" />
}

const REASON_TEXT = {
  noPermission: () => t('export.err.noPermission'),
  diskFull: () => t('export.err.diskFull'),
  noFrame: () => t('export.err.noFrame'),
  unknown: () => t('export.err.unknown'),
} satisfies Record<Extract<ExportNotice, { kind: 'failed' }>['reason'], () => string>

function noticeTitle(n: ExportNotice) {
  if (n.kind === 'failed') return t('export.failed')
  if (n.size === 'shrunk') return t('export.doneShrunk')
  if (n.size === 'over') return t('export.doneOver')
  return t(n.file === 'gif' ? 'export.done.gif' : 'export.done.png')
}

/** 맵 아래 가운데 완료·실패 안내 — 8초 뒤 사라지고, 마우스를 올리고 있으면 남는다 */
export function SceneExportNotice() {
  const notice = useSceneExport((s) => s.notice)
  const dismiss = useSceneExport((s) => s.dismiss)
  const openFolder = useSceneExport((s) => s.openFolder)
  const retry = useSceneExport((s) => s.retryInOtherFolder)
  const [isHover, setIsHover] = useState(false)

  useEffect(() => {
    if (!notice || isHover) return
    const timer = setTimeout(dismiss, NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice, isHover, dismiss])

  if (!notice) return null
  const isOk = notice.kind === 'saved'
  const detail = isOk ? `${notice.name} · ${fmtBytes(notice.bytes)}` : REASON_TEXT[notice.reason]()
  return (
    <div
      role="status"
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      className="absolute bottom-14 left-1/2 z-20 flex w-[min(500px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 rounded-lg border border-white/10 bg-[#1a1d28]/95 px-3 py-2 text-xs text-white shadow-lg"
    >
      {isOk && notice.size === 'ok' ? <CheckCircle2Icon className="text-status-working size-4 shrink-0" /> : <AlertTriangleIcon className={cn('size-4 shrink-0', isOk ? 'text-status-waiting' : 'text-destructive')} />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{noticeTitle(notice)}</div>
        <div className="truncate text-white/60">{detail}</div>
      </div>
      {isOk && (
        <button type="button" onClick={openFolder} className="shrink-0 rounded-md border border-white/15 px-2 py-1 hover:bg-white/10">
          {t('export.openFolder')}
        </button>
      )}
      {!isOk && notice.data && (
        <button type="button" onClick={() => void retry()} className="shrink-0 rounded-md border border-white/15 px-2 py-1 hover:bg-white/10">
          {t('export.pickOther')}
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label={t('common.close')} className="shrink-0 rounded p-1 text-white/60 hover:bg-white/10 hover:text-white">
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}
