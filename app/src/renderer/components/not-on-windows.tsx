import { Badge } from '@/components/ui/badge'
import { IS_WINDOWS } from '@/lib/platform'
import { t } from '@shared/i18n'

/** 윈도우 1차 지원에서 아직 동작하지 않는 기능 표시 (맥에서는 아무것도 그리지 않는다) */
/** detail: 프로그램 이름처럼 본문에 두기 어려운 내용 — '자세히' 안에 접어 둔다 */
export function NotOnWindows({ reason, detail }: { reason: string; detail?: string }) {
  if (!IS_WINDOWS) return null
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline">{t('platform.notOnWindows')}</Badge>
      {reason}
      {detail && (
        <details className="w-full text-[11px]">
          <summary className="cursor-pointer">{t('common.more')}</summary>
          <p className="mt-1">{detail}</p>
        </details>
      )}
    </div>
  )
}
