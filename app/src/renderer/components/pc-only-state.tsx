import { t } from '@shared/i18n'

/** 휴대폰에서 PC 전용 설정 자리: 버튼 대신 지금 상태와 "PC에서 바꿀 수 있어요" 한 줄 (docs/specs/android-pc-layout.md 91행) */
export function PcOnlyState({ isOn }: { isOn?: boolean }) {
  return (
    <p className="text-muted-foreground text-xs">
      {isOn !== undefined && <span className={isOn ? 'text-status-working' : undefined}>● {isOn ? t('pcOnly.on') : t('pcOnly.off')} · </span>}
      {t('pcOnly.hint')}
    </p>
  )
}
