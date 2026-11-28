import { t } from '../../shared/i18n/index.ts'

/** 지시 끝에 붙이는 언어 알림 표식 — 기록(transcript)을 읽어 화면에 보일 때 떼어 낸다 */
export const LANG_TURN_OPEN = '<language-reminder>'
const LANG_TURN_CLOSE = '</language-reminder>'
const LANG_TURN_RE = /\s*<language-reminder>[\s\S]*?<\/language-reminder>\s*$/

/** 시스템 프롬프트 맨 끝에 한 번 더 — 앞쪽 규칙(staff.language)을 긴 문서가 밀어내도 끝에서 다시 상기 */
export const withLanguageTail = (prompt: string) => `${prompt}\n\n${t('staff.languageTurn')}`

/**
 * 직원 지시 한 건 끝에 앱 언어 한 줄을 붙인다. Claude·Codex 모두 이 한 곳을 지나므로
 * 위임·도움 요청·단체방·이어 하기·새 대화 넘기기·자동 점검 지시가 같은 규칙을 받고, 앱 언어를 바꾼 뒤 열린 대화도 바로 따른다.
 * /명령은 인자가 깨지므로 건드리지 않는다.
 */
export function withLanguageTurn(text: string): string {
  if (text.trimStart().startsWith('/')) return text
  return `${text}\n\n${LANG_TURN_OPEN}${t('staff.languageTurn')}${LANG_TURN_CLOSE}`
}

export const stripLanguageTurn = (text: string) => text.replace(LANG_TURN_RE, '')
