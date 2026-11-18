import { HOOK_PORT } from '../shared/types.ts'

// 앱 밖 직원 알림 hook 명령 (electron·DB 없는 순수부 — scripts/externalPlatform.test.mts가 맥·윈도우를 번갈아 가정해 확인)

const HOOK_MARKER = `127.0.0.1:${HOOK_PORT}/hook`
const ASK_MARKER = `127.0.0.1:${HOOK_PORT}/ask`
/** hook 기본 제한(600초)보다 먼저 놓아 원래 창으로 돌려보낸다 */
const ASK_HOOK_TIMEOUT_S = 600
export const HOOK_COMMAND = `curl -s -m 1 -X POST -H 'content-type: application/json' --data-binary @- http://${HOOK_MARKER} >/dev/null 2>&1 || true`
/**
 * 고용 직원 세션(CLAUDE_OFFICE_HIRED=1)은 건너뛴다 — 사용자 설정을 읽는 고용 직원에게도 이 hook이 돌아서,
 * 다른 AI Office(설치본·개발 앱)가 포트를 잡고 있으면 그 앱이 외부 직원 질문으로 붙잡아 최대 9분 멈췄다 (QA: 대신 답하기 6분)
 * Claude 데스크톱 앱 세션도 건너뛴다 — 앱 자체 질문 UI를 쓰는데 이 hook이 질문을 사무실로 가져가 버렸다
 */
export const HIRED_ENV = 'CLAUDE_OFFICE_HIRED'
const DESKTOP_ENTRYPOINT = 'claude-desktop'
export const ASK_COMMAND = `[ -n "$${HIRED_ENV}" ] || [ "$CLAUDE_CODE_ENTRYPOINT" = "${DESKTOP_ENTRYPOINT}" ] || curl -s -m ${ASK_HOOK_TIMEOUT_S - 10} -X POST -H 'content-type: application/json' --data-binary @- http://${ASK_MARKER} 2>/dev/null || true`

// 윈도우는 Claude Code가 Git Bash로 hook을 돌리는 것으로 알고 있어(윈도우 실기기 확인 전) 셸 문법은 그대로 두고,
// PowerShell의 curl(= Invoke-WebRequest 별칭)과 헷갈리지 않게 curl.exe를 못 박는다. 맥 문자열은 위 상수 그대로
const forPlatform = (platform: NodeJS.Platform, mac: string) => (platform === 'win32' ? mac.replace(/(^|\|\| )curl /g, '$1curl.exe ') : mac)

/** 진행 알림 hook 명령 — 맥·리눅스는 HOOK_COMMAND 그대로 */
export const hookCommand = (platform: NodeJS.Platform = process.platform) => forPlatform(platform, HOOK_COMMAND)

/** 질문 받기 hook 명령 — 맥·리눅스는 ASK_COMMAND 그대로 */
export const askCommand = (platform: NodeJS.Platform = process.platform) => forPlatform(platform, ASK_COMMAND)
