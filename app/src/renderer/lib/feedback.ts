import { APP_VERSION } from '@/lib/changelog'
import { t } from '@shared/i18n'

const FEEDBACK_ISSUE_URL = 'https://github.com/EngChooN/ai-office/issues/new'
const OS_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', android: 'Android' }

/** 앱 버전·OS만 채운 GitHub 이슈 작성 화면을 기본 브라우저로 연다 (개인정보는 넣지 않는다) */
export function openFeedbackIssue() {
  const { platform, osVersion } = window.office
  const os = [OS_NAMES[platform] ?? platform, osVersion].filter(Boolean).join(' ')
  const title = `[Feedback] v${APP_VERSION} · ${os}`
  const body = [t('settingsPage.guide.feedbackPrompt'), '', '', '---', `- App: AI Office v${APP_VERSION}`, `- OS: ${os}`, `- Platform: ${platform}`].join('\n')
  window.open(`${FEEDBACK_ISSUE_URL}?${new URLSearchParams({ title, body })}`)
}
