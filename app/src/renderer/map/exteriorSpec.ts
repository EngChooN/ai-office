// 사무실 외관 단계 (김기획 레벨표 office-iso-levels.md 2-2절 · 이디자 office-iso-art.md 6절)
// 외관 그림(exteriorDiorama·iso/exteriorArt)은 레벨 숫자를 보지 않고 이 값(건물 단계 E1~E7 + 꾸밈 features)만 본다. 값은 shared/officeLevel.ts의 LEVEL_TABLE에 있다
import { levelRowOf, type ExteriorFeature, type ExteriorStage } from '@shared/officeLevel'


export type { ExteriorFeature, ExteriorStage } from '@shared/officeLevel'

export type ExteriorFeatures = Partial<Record<ExteriorFeature, boolean>>

export interface ExteriorSpec {
  stage: ExteriorStage
  features: ExteriorFeatures
}

/** 레벨의 외관 (1 미만은 Lv.1, 표보다 크면 마지막) — LEVEL_TABLE의 exterior·features */
export function exteriorSpecOf(level: number): ExteriorSpec {
  const row = levelRowOf(level)
  return { stage: row.exterior, features: Object.fromEntries(row.features.map((f) => [f, true])) }
}

/** 단계별 층수 (외관에 보이는 층) */
export const STAGE_FLOORS: Record<ExteriorStage, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 5 }

export const STAGE_NAMES: Record<ExteriorStage, string> = { 1: '차고', 2: '1층 상가', 3: '2층 벽돌 건물', 4: '3층 오피스', 5: '4층 유리 사옥', 6: '5층 타워', 7: '캠퍼스' }
