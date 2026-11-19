/** 창이 보이는지 알려 주는 구독 (보이면 true). 끊는 함수를 돌려준다 */
export type ShownSource = (cb: (isShown: boolean) => void) => () => void

/**
 * 창이 보이는 동안만 fn을 ms마다 부른다. 숨기면 멈추고, 다시 보이면 바로 한 번 부른 뒤 다시 센다 (status.ts useNow와 같은 방식).
 * 데스크톱 창은 backgroundThrottling을 꺼 두어 숨겨도 document.hidden이 바뀌지 않는다 — main이 보내 주는 표시 신호(source)도 함께 본다.
 * 처음엔 보이는 것으로 시작한다 (첫 읽기는 부르는 쪽이 이미 한다). 멈추는 함수를 돌려준다
 */
export function everyWhileShown(fn: () => void, ms: number, source?: ShownSource): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let isSourceShown = true
  const isShown = () => !document.hidden && isSourceShown
  let wasShown = isShown()
  const start = () => {
    clearInterval(timer)
    timer = setInterval(fn, ms)
  }
  const update = () => {
    const now = isShown()
    if (now === wasShown) return
    wasShown = now
    if (!now) return clearInterval(timer)
    fn()
    start()
  }
  if (wasShown) start()
  document.addEventListener('visibilitychange', update)
  const offSource = source?.((v) => {
    isSourceShown = v
    update()
  })
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', update)
    offSource?.()
  }
}
