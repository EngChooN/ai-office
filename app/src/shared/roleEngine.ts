import type { AiProvider } from './types.ts'

// 직무별 추천 엔진. 직접 만드는 일(코드 작성·기획·지휘)은 앱 기능을 다 쓰는 Claude,
// 남이 만든 결과를 따져 보거나 자료를 찾는 일(리뷰·QA·리서치)은 작성 쪽과 다른 시각인 GPT.
// 화면 문구(이유)는 i18n 키 engine.reason.<slug>로 둔다. 표에 없는 직무(자유 직무·직접 입력)는 추천하지 않는다.

export interface RoleEngine {
  provider: AiProvider
  /** i18n 키 engine.reason.<slug>의 slug */
  slug: string
}

/** 직무 이름(ROLE_PRESETS·마켓 직무, 한국어 원문) → 추천 엔진 */
export const ROLE_ENGINE: Readonly<Record<string, RoleEngine>> = {
  팀장: { provider: 'claude', slug: 'lead' },
  기획자: { provider: 'claude', slug: 'planner' },
  '프론트엔드 개발자': { provider: 'claude', slug: 'frontend' },
  '백엔드 개발자': { provider: 'claude', slug: 'backend' },
  '코드 리뷰어': { provider: 'codex', slug: 'reviewer' },
  QA: { provider: 'codex', slug: 'qa' },
  리서처: { provider: 'codex', slug: 'researcher' },
  디자이너: { provider: 'claude', slug: 'designer' },
  '고객 응대(CS)': { provider: 'claude', slug: 'cs' },
  마케터: { provider: 'claude', slug: 'marketer' },
}

/** 이 직무의 추천 엔진 (없으면 null) */
export const recommendedEngine = (role: string): RoleEngine | null => ROLE_ENGINE[role.trim()] ?? null
