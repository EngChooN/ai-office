import { ROLE_PRESETS } from './types.ts'
import { t, type TKey } from './i18n/index.ts'

/** 프리셋 직무(한국어 저장값) → 표시용 사전 키. 팀장 판정·외형·팩 검증이 한국어 값을 쓰므로 저장값은 바꾸지 않는다 */
const ROLE_KEY: Record<(typeof ROLE_PRESETS)[number], TKey> = {
  팀장: 'role.lead',
  '프론트엔드 개발자': 'role.frontend',
  '백엔드 개발자': 'role.backend',
  '코드 리뷰어': 'role.reviewer',
  QA: 'role.qa',
  기획자: 'role.planner',
  리서처: 'role.researcher',
  '자유 직무': 'role.free',
}

/** 직무 표시 이름: 프리셋과 똑같은 값만 번역하고, 직접 입력한 직무는 그대로 */
export function roleLabel(role: string): string {
  const key = (ROLE_KEY as Record<string, TKey>)[role]
  return key ? t(key) : role
}
