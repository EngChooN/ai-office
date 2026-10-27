import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { FileIcon, PaperclipIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { attachmentUrl, isImageAttachment, type Attachment } from '@shared/types'
import { t } from '@shared/i18n'

const FILE_MAX_BYTES = 20 * 1024 * 1024

/** 입력창에 붙일 파일 상태: 붙여넣기·끌어다 놓기·파일 선택 → 보낼 때 앱 첨부 폴더에 저장 */
export function useDraftAttachments() {
  const [files, setFiles] = useState<File[]>([])
  const add = (list: FileList | File[] | null) => {
    const picked = [...(list ?? [])].filter((f) => f.size <= FILE_MAX_BYTES)
    if (picked.length) setFiles((prev) => [...prev, ...picked])
  }
  const remove = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i))
  const clear = () => setFiles([])
  /** 보낼 때 호출: 파일을 main에 넘겨 저장하고 첨부 정보를 받는다 */
  const upload = async (): Promise<Attachment[]> => {
    if (files.length === 0) return []
    const payload = await Promise.all(files.map(async (f) => ({ name: f.name || `${t('attach.pastedImage')}.${f.type.split('/')[1] ?? 'png'}`, mime: f.type, data: await f.arrayBuffer() })))
    return window.office.saveAttachments(payload)
  }
  const bind = {
    onPaste: (e: ClipboardEvent) => {
      if (e.clipboardData.files.length) {
        e.preventDefault()
        add(e.clipboardData.files)
      }
    },
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      add(e.dataTransfer.files)
    },
  }
  return { files, add, remove, clear, upload, bind }
}

/** 클립 버튼: 파일 고르기 */
export function AttachButton({ onPick, className }: { onPick: (files: FileList | null) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => (onPick(e.target.files), (e.target.value = ''))} />
      <Button type="button" size="icon" variant="ghost" className={cn('size-8', className)} onClick={() => inputRef.current?.click()} aria-label={t('attach.attach')} title={t('attach.attachHint')}>
        <PaperclipIcon className="size-4" />
      </Button>
    </>
  )
}

/** 보내기 전 첨부 미리보기 */
export function DraftAttachments({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const urls = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls])
  if (files.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="bg-muted relative flex items-center gap-1.5 rounded-md border p-1 pr-6 text-xs">
          {urls[i] ? <img src={urls[i]!} alt="" className="size-10 rounded object-cover" /> : <FileIcon className="text-muted-foreground size-4" />}
          <span className="max-w-32 truncate">{f.name || t('attach.pastedImage')}</span>
          <button type="button" onClick={() => onRemove(i)} className="text-muted-foreground hover:text-foreground absolute top-1 right-1" aria-label={t('attach.remove')}>
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** 보낸·받은 첨부 보기: 이미지는 썸네일(누르면 크게), 파일은 누르면 기본 앱으로 연다 */
const THUMB_CLASS = { sm: 'size-12', md: 'max-h-40 max-w-56', lg: 'max-h-80 max-w-full' } as const

export function AttachmentView({ attachments, size = 'md' }: { attachments?: Attachment[]; size?: keyof typeof THUMB_CLASS }) {
  const [zoom, setZoom] = useState<Attachment | null>(null)
  if (!attachments?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) =>
        isImageAttachment(a) ? (
          <button key={a.id} type="button" onClick={() => setZoom(a)} className="overflow-hidden rounded-md border">
            <img src={attachmentUrl(a)} alt={a.name} className={cn('object-cover', THUMB_CLASS[size])} />
          </button>
        ) : (
          <button key={a.id} type="button" onClick={() => void window.office.openAttachment(a.id)} className="bg-muted flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <FileIcon className="size-3.5" />
            <span className="max-w-40 truncate">{a.name}</span>
          </button>
        ),
      )}
      <Dialog open={Boolean(zoom)} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="truncate text-sm">{zoom?.name}</DialogTitle>
          {zoom && <img src={attachmentUrl(zoom)} alt={zoom.name} className="max-h-[70vh] w-full object-contain" />}
          {zoom && (
            <Button size="sm" variant="outline" className="w-fit" onClick={() => void window.office.openAttachment(zoom.id)}>
              {t('attach.openDefault')}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
