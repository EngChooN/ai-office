import { useEffect, useState, type RefObject } from 'react'
import { ExternalLinkIcon, FolderOpenIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/select'
import type { ArtifactRef, ArtifactView } from '@shared/types'
import { fmtDate, t } from '@shared/i18n'

type Tab = 'live' | 'source'
type Load = { status: 'loading' } | { status: 'ready'; view: ArtifactView } | { status: 'missing' } | { status: 'error' }

/** 아티팩트 크게 보기: 실제 화면(격리 iframe)·원본 탭, 버전 고르기, 브라우저로 열기·파일 위치 열기 (PC 전용 — 휴대폰은 카드에서 막는다) */
export function ArtifactViewer({ artifact, returnFocusRef, onClose }: { artifact: ArtifactRef | null; returnFocusRef?: RefObject<HTMLElement | null>; onClose: () => void }) {
  // 트리거 없이 여는 창이라 Radix가 초점을 돌려주지 않는다 — 닫으면 열었던 버튼으로
  const handleCloseAutoFocus = (e: Event) => {
    const el = returnFocusRef?.current
    if (!el?.isConnected) return
    e.preventDefault()
    el.focus()
  }
  return (
    <Dialog open={Boolean(artifact)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col" onCloseAutoFocus={handleCloseAutoFocus}>
        {artifact && <ViewerBody key={artifact.id} artifact={artifact} />}
      </DialogContent>
    </Dialog>
  )
}

function ViewerBody({ artifact }: { artifact: ArtifactRef }) {
  const [tab, setTab] = useState<Tab>('live')
  // 처음엔 최신 버전 (undefined = 최신)
  const [version, setVersion] = useState<number | undefined>(undefined)
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  // 버전을 바꿀 때마다 다시 받아 iframe을 새 주소로 만든다
  useEffect(() => {
    let isCancelled = false
    setLoad({ status: 'loading' })
    window.office
      .artifactOpen(artifact.id, version)
      .then((view) => !isCancelled && setLoad(view ? { status: 'ready', view } : { status: 'missing' }))
      .catch(() => !isCancelled && setLoad({ status: 'error' }))
    return () => {
      isCancelled = true
    }
  }, [artifact.id, version])

  const [actionError, setActionError] = useState(false)
  // 열기·파일 위치 실패는 창을 닫지 않고 안에서 알린다
  const run = (act: () => Promise<unknown>) => {
    setActionError(false)
    act().catch(() => setActionError(true))
  }

  const view = load.status === 'ready' ? load.view : null
  const shownVersion = view?.version ?? version
  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate pr-6" title={view?.title ?? artifact.title}>
          {view?.title ?? artifact.title}
        </DialogTitle>
        <DialogDescription>
          {t(`artifact.kind.${artifact.kind}`)}
          {shownVersion !== undefined && ` · v${shownVersion}`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t('artifact.view')} className="flex gap-1">
          {(['live', 'source'] as const).map((k) => (
            <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? 'secondary' : 'ghost'} onClick={() => setTab(k)}>
              {t(`artifact.tab.${k}`)}
            </Button>
          ))}
        </div>
        {view && view.versions.length > 1 && (
          <NativeSelect aria-label={t('artifact.version')} className="h-8 text-xs" value={view.version} onChange={(e) => setVersion(Number(e.target.value))}>
            {[...view.versions].reverse().map((v) => (
              <option key={v.version} value={v.version}>
                {t('artifact.versionOption', {
                  version: v.version,
                  date: fmtDate(v.createdAt, {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  }),
                })}
              </option>
            ))}
          </NativeSelect>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!view} onClick={() => view && run(() => window.office.artifactOpenExternal(view.id, view.version))}>
            <ExternalLinkIcon /> {t('artifact.openExternal')}
          </Button>
          <Button size="sm" variant="outline" disabled={!view} onClick={() => view && run(() => window.office.artifactReveal(view.id, view.version))}>
            <FolderOpenIcon /> {t('artifact.reveal')}
          </Button>
        </div>
      </div>
      {actionError && (
        <p role="alert" className="text-destructive text-sm">
          {t('artifact.actionFailed')}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        {load.status !== 'ready' ? (
          <p className="text-muted-foreground p-4 text-sm">{t(load.status === 'loading' ? 'artifact.loading' : load.status === 'missing' ? 'artifact.missing' : 'artifact.error')}</p>
        ) : tab === 'live' ? (
          // allow-same-origin을 주지 않아 앱과 다른 출처로 갇힌다. 바탕은 칠하지 않는다 — 색 모드를 정하지 않은 html은 브라우저가 흰 캔버스를 깔고, md는 앱 라이트·다크를 따른다
          <iframe key={load.view.url} sandbox="allow-scripts" src={load.view.url} title={load.view.title} className="size-full" />
        ) : (
          <pre className="selectable bg-muted size-full overflow-auto p-3 font-mono text-xs break-words whitespace-pre-wrap">{load.view.source}</pre>
        )}
      </div>
    </>
  )
}
