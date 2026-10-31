import { useRef, useState } from 'react'
import { FileCode2Icon, FileTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArtifactViewer } from '@/components/artifact-viewer'
import { cn } from '@/lib/utils'
import { IS_MOBILE_SHELL } from '@/shell'
import type { ArtifactRef } from '@shared/types'
import { t } from '@shared/i18n'

/** 아티팩트 한 장: 종류 아이콘·제목·종류·버전·열기 (휴대폰은 열기 대신 PC 안내) */
export function ArtifactCard({ artifact: a, onOpen }: { artifact: ArtifactRef; onOpen: (button: HTMLButtonElement) => void }) {
  const Icon = a.kind === 'html' ? FileCode2Icon : FileTextIcon
  return (
    <div className="bg-muted flex w-80 max-w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={a.title}>
          {a.title}
        </p>
        <p className="text-muted-foreground truncate text-[11px]">
          {t(`artifact.kind.${a.kind}`)} · v{a.version}
          {IS_MOBILE_SHELL && ` · ${t('artifact.pcOnlyHint')}`}
        </p>
      </div>
      {IS_MOBILE_SHELL ? (
        <span className="text-muted-foreground shrink-0">{t('artifact.pcOnly')}</span>
      ) : (
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-xs" onClick={(e) => onOpen(e.currentTarget)}>
          {t('artifact.open')}
        </Button>
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
      {!IS_MOBILE_SHELL && <ArtifactViewer artifact={opened} returnFocusRef={openerRef} onClose={() => setOpened(null)} />}
    </div>
  )
}
