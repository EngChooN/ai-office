import { useRef, useState } from 'react'
import { FileCode2Icon, FileTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArtifactViewer, actionFailureKey } from '@/components/artifact-viewer'
import { cn } from '@/lib/utils'
import { CAN_OPEN_ARTIFACT, IS_REMOTE_SCREEN } from '@/shell'
import type { ArtifactRef } from '@shared/types'
import { t } from '@shared/i18n'

/** 아티팩트 한 장: 종류 아이콘·제목·종류·버전·열기 (휴대폰 셸은 열기 대신 PC 안내) */
export function ArtifactCard({ artifact: a, onOpen }: { artifact: ArtifactRef; onOpen: (button: HTMLButtonElement) => void }) {
  const Icon = a.kind === 'html' ? FileCode2Icon : FileTextIcon
  const [downloadError, setDownloadError] = useState<ReturnType<typeof actionFailureKey> | null>(null)
  // 원격 화면: 이 기기로 내려받는다 (원격 어댑터가 같은 메서드를 내려받기로 바꿔 둔다)
  const download = () => {
    setDownloadError(null)
    window.office.artifactOpenExternal(a.id, a.version).catch((e) => setDownloadError(actionFailureKey(e)))
  }
  return (
    <div className="bg-muted flex w-80 max-w-full min-w-0 flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={a.title}>
          {a.title}
        </p>
        <p className="text-muted-foreground truncate text-[11px]">
          {t(`artifact.kind.${a.kind}`)} · v{a.version}
          {!CAN_OPEN_ARTIFACT && ` · ${t('artifact.pcOnlyHint')}`}
        </p>
      </div>
      {!CAN_OPEN_ARTIFACT ? (
        <span className="text-muted-foreground shrink-0">{t('artifact.pcOnly')}</span>
      ) : (
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={(e) => onOpen(e.currentTarget)}>
            {IS_REMOTE_SCREEN ? t('artifact.preview') : t('artifact.open')}
          </Button>
          {IS_REMOTE_SCREEN && (
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={download}>
              {t('artifact.download')}
            </Button>
          )}
        </div>
      )}
      {downloadError && (
        <p role="alert" className="text-destructive basis-full text-[11px]">
          {t(downloadError)}
        </p>
      )}
    </div>
  )
}

/** 아티팩트 카드 묶음 — 크게 보기 창(열린 아티팩트) 상태를 여기서 갖는다 */
export function ArtifactCards({ artifacts, className }: { artifacts?: ArtifactRef[]; className?: string }) {
  const [opened, setOpened] = useState<ArtifactRef | null>(null)
  // 닫은 뒤 초점을 돌려줄 열기 버튼 (닫을 때 opened를 먼저 비우므로 따로 둔다)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  if (!artifacts?.length) return null
  return (
    // 갤러리·업무 카드처럼 눌리면 상세가 열리는 곳 안에 놓여도 카드·창(포털) 클릭이 바깥으로 새지 않게
    <div className={cn('flex flex-wrap gap-2', className)} onClick={(e) => e.stopPropagation()}>
      {artifacts.map((a) => (
        <ArtifactCard
          key={`${a.id}-${a.version}`}
          artifact={a}
          onOpen={(button) => {
            openerRef.current = button
            setOpened(a)
          }}
        />
      ))}
      {CAN_OPEN_ARTIFACT && <ArtifactViewer artifact={opened} returnFocusRef={openerRef} onClose={() => setOpened(null)} />}
    </div>
  )
}
