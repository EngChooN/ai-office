import { AsyncLocalStorage } from 'node:async_hooks'
import type { LogType } from '../shared/types'

// 원격(휴대폰)에서 부른 동작인지: v2 /v2/call은 이 안에서 처리 함수를 부르고, Office.log가 기록 앞에 표시를 붙인다
// v1은 처리 함수에 표시를 직접 넘긴다 (Office.remotePort)

/** 원격에서 온 지시·결정 기록 표시 */
export const REMOTE_MARK = '📱 원격'

const store = new AsyncLocalStorage<true>()

/** 지금 처리 중인 동작이 원격(휴대폰)에서 부른 것인지 */
export const isRemoteCall = () => store.getStore() === true

export const runAsRemote = <T>(fn: () => T): T => store.run(true, fn)

/**
 * 표시를 붙일 기록: 대표가 한 동작(지시·결재·답변)만. 원격 호출 안에서 시작된 직원 세션이 남기는 도구·답변·상태 기록은
 * 같은 비동기 흐름을 이어받지만 직원이 한 일이라 붙이지 않는다
 */
const MARKED: ReadonlySet<LogType> = new Set(['instruction', 'approval'])

export function remoteMarked(type: LogType, text: string) {
  return store.getStore() && MARKED.has(type) && !text.startsWith(REMOTE_MARK) ? `${REMOTE_MARK} ${text}` : text
}
