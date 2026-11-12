import { t } from './i18n/index.ts'
import type { ReportStyle } from './types.ts'

/** 직원·비서 시스템 프롬프트에 한 번 넣는 보고 말투 규칙 (설정이 없으면 쉬운 말) */
export const reportStyleRule = (style: ReportStyle | undefined) => t(style === 'expert' ? 'staff.reportStyle.expert' : 'staff.reportStyle.easy')
