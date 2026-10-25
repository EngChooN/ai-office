import type { KeyboardEvent } from 'react'
import { IS_TOUCH } from '@/shell'
import { IS_WINDOWS } from './platform'
import { t } from '@shared/i18n'

/** 문자열 안에 넣을 때(템플릿) 그때그때 현재 언어로 읽히게 한다 — 모듈이 한 번만 평가돼도 언어 변경이 반영된다 */
const lazy = (get: () => string) => ({ toString: get })

/** 입력창 줄바꿈 안내 문구 (휴대폰 앱: 화면 키보드에는 Shift·⌘가 없어 Enter가 줄바꿈, 보내기는 버튼) */
export const NEWLINE_HINT = lazy(() => t(IS_TOUCH ? 'composer.newlineTouch' : IS_WINDOWS ? 'composer.newlineWin' : 'composer.newlineMac'))
/** 단축키 안내 앞부분 (휴대폰 앱은 Enter 보내기·Esc가 없어 비운다) */
export const SEND_HINT = lazy(() => (IS_TOUCH ? '' : t('composer.send')))
export const STOP_HINT = lazy(() => (IS_TOUCH ? '' : t('composer.stop')))

/**
 * 지시·채팅 입력창 키: Enter는 보내기, ⌘+Enter(윈도우는 Ctrl+Enter)·Shift+Enter는 줄바꿈. 한글 조합 중 Enter는 무시한다.
 * ⌘+Enter는 브라우저가 줄을 넣어 주지 않아서 커서 자리에 직접 넣는다
 */
export function handleComposerKey(e: KeyboardEvent<HTMLTextAreaElement>, send: () => void, setValue: (value: string) => void) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  // 휴대폰 앱: Enter는 그대로 줄바꿈 (하드웨어 키보드 태블릿은 마우스·키보드가 있으니 PC 규칙)
  if (IS_TOUCH) return
  if (e.shiftKey) return
  e.preventDefault()
  const isNewline = IS_WINDOWS ? e.ctrlKey : e.metaKey
  if (!isNewline) return send()
  const el = e.currentTarget
  const { selectionStart: start, selectionEnd: end, value } = el
  setValue(`${value.slice(0, start)}\n${value.slice(end)}`)
  requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1))
}
