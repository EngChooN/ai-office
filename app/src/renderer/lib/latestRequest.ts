/**
 * 같은 조회를 겹쳐 보냈을 때 가장 마지막에 보낸 요청의 응답만 쓰게 한다 —
 * 먼저 보낸 느린 응답이 나중에 도착해 최신 결과를 덮지 않게.
 * isPending: 아직 끝나지 않은 요청이 하나라도 있는지 (주기적 조회는 이때 건너뛴다)
 */
export function createLatestRequest() {
  let seq = 0
  let pending = 0
  return {
    get isPending() {
      return pending > 0
    },
    async run<T>(request: () => Promise<T>): Promise<{ value: T; isLatest: boolean }> {
      const mine = ++seq
      pending++
      try {
        const value = await request()
        return { value, isLatest: mine === seq }
      } finally {
        pending--
      }
    },
  }
}
