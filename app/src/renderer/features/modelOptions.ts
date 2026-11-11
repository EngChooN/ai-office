import type { ClaudeModel } from '@shared/types'
import type { TKey } from '@shared/i18n'

/**
 * 고용 창 카드 목록과 직원 패널 모델 고르기가 같이 쓰는 Claude 모델 순서·사용량 점·NEW 표시.
 * 순서가 두 곳에서 어긋나지 않게 이 한 곳만 고친다 (기본 행의 이름은 화면마다 문구가 달라 각 화면이 채운다)
 */
export interface ModelRow {
  value: ClaudeModel
  /** 화면 표기 — 번역하지 않는 고유 이름 (기본 행은 없음) */
  name?: string
  hintKey: TKey
  /** 사용량 점 5칸 중 채울 수 (많을수록 한도가 빨리 참). 기본 행은 0 = 점 없음 */
  dots: number
  isNew?: boolean
}

/** 사용량 점 칸 수 */
export const USAGE_DOTS = 5

// 점 개수는 임시값 — 페이블 실제 사용량 배율을 대표가 확인하면 여기만 바꾼다
export const CLAUDE_MODEL_ROWS: readonly ModelRow[] = [
  { value: 'default', hintKey: 'guideHint.model.default', dots: 0 },
  { value: 'fable', name: 'Fable', hintKey: 'guideHint.model.fable', dots: 5, isNew: true },
  { value: 'opus', name: 'Opus', hintKey: 'guideHint.model.opus', dots: 4 },
  { value: 'sonnet', name: 'Sonnet', hintKey: 'guideHint.model.sonnet', dots: 3 },
  { value: 'haiku', name: 'Haiku', hintKey: 'guideHint.model.haiku', dots: 1 },
]

/** Claude 모델 표기 이름 (모르는 값·Codex 모델 id는 그대로) */
export const claudeModelName = (model: string) => CLAUDE_MODEL_ROWS.find((r) => r.value === model)?.name ?? model

/** 글자로 그린 사용량 점 — 네이티브 목록(<option>)처럼 글자만 들어가는 자리용 */
export const usageDotsText = (dots: number) => (dots > 0 ? '●'.repeat(dots) + '○'.repeat(USAGE_DOTS - dots) : '')
