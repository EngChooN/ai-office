import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { t } from '@shared/i18n'

type Props = {
  /** 그릴 내용 — 다시 시도할 때 새로 불러온 컴포넌트를 쓰도록 함수로 받는다 */
  children: () => ReactNode
  /** "다시 시도"를 누르면 먼저 부른다 (실패를 기억한 lazy 로더를 새로 만들기) */
  onRetry: () => void
  /** 안내 자리 모양 (기본: 그 칸을 채워 가운데) — 겹쳐 뜨는 화면은 같은 자리에 덮어 쓴다 */
  className?: string
  /** 있으면 "닫기"도 보인다 (겹쳐 뜨는 화면을 받지 못해 덮인 채 남지 않게) */
  onClose?: () => void
}

/** 늦게 불러오는 화면을 받지 못했을 때 앱 전체가 하얘지지 않게 그 자리만 "다시 시도" 안내로 바꾼다 */
export class LoadErrorBoundary extends Component<Props, { hasError: boolean; hasRetried: boolean }> {
  state = { hasError: false, hasRetried: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  // 크로미움은 한 번 실패한 import 주소를 기억해 로더를 새로 만들어도 또 실패할 수 있다 — 다시 시도해도 안 되면 창을 새로 불러온다
  // (사무실 상태는 main에 있어 다시 연결하면 그대로 돌아온다)
  retry = () => {
    if (this.state.hasRetried) return location.reload()
    this.props.onRetry()
    this.setState({ hasError: false, hasRetried: true })
  }

  render() {
    if (!this.state.hasError) return this.props.children()
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-3 p-6 text-sm', this.props.className)}>
        <p className="text-muted-foreground">{t('artifact.error')}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={this.retry}>
            {t('onboarding.firstTask.retry')}
          </Button>
          {this.props.onClose && (
            <Button size="sm" variant="ghost" onClick={this.props.onClose}>
              {t('common.close')}
            </Button>
          )}
        </div>
      </div>
    )
  }
}
