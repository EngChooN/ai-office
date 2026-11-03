import { APP_VERSION } from '@/lib/changelog'
import { t } from '@shared/i18n'
import { fitIssueBody, formatErrorLog, type ErrorEntry } from '@shared/errorReport'

const FEEDBACK_ISSUE_URL = 'https://github.com/EngChooN/ai-office/issues/new'
const OS_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', android: 'Android' }

/** 피드백에 붙일 최근 오류 (PC 앱 창만 — 휴대폰은 officeErrors가 없어 빈 목록) */
export async function recentErrors(): Promise<ErrorEntry[]> {
  try {
    return (await window.officeErrors?.list()) ?? []
  } catch {
    return []
  }
}

/**
 * 앱 버전·OS(와 고르면 이미 가려진 최근 오류 기록)를 채운 GitHub 이슈 작성 화면을 기본 브라우저로 연다 (개인정보는 넣지 않는다).
 * 오류 기록이 길어 잘리면 전체 기록을 클립보드에 복사하고 본문에서 붙여 넣으라고 안내한다
 */
export async function openFeedbackIssue(errors: ErrorEntry[] = []) {
  const { platform, osVersion } = window.office
  const os = [OS_NAMES[platform] ?? platform, osVersion].filter(Boolean).join(' ')
  const title = `[Feedback] v${APP_VERSION} · ${os}`
  const base = [t('settingsPage.guide.feedbackPrompt'), '', '', '---', `- App: AI Office v${APP_VERSION}`, `- OS: ${os}`, `- Platform: ${platform}`].join('\n')
  const log = formatErrorLog(errors)
  let { body, isTruncated } = fitIssueBody(base, log, t('feedback.errors.truncatedCopied'))
  if (isTruncated && !(await copyText(log))) body = fitIssueBody(base, log, t('feedback.errors.truncated')).body
  window.open(`${FEEDBACK_ISSUE_URL}?${new URLSearchParams({ title, body })}`)
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
