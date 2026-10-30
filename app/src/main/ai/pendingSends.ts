/**
 * 세션에 보낸 지시 중 아직 결과(result)가 오지 않은 것.
 * Claude SDK는 입력 스트림을 바로 가져가므로 앱 쪽 inbox 길이로는 "아직 답하지 않은 지시"를 셀 수 없다 —
 * 일하는 중에 받은 지시가 0개로 보여, 그 지시의 결과를 '지시와 상관없는 결과'로 버리던 원인.
 * 보낼 때 붙인 uuid를 결과의 user_message_uuids로 지운다.
 */
export class PendingSends {
  private ids: string[] = []

  get count() {
    return this.ids.length
  }

  /** 맨 앞(처리 중) 지시 뒤에 줄 선 수 */
  get behind() {
    return Math.max(0, this.ids.length - 1)
  }

  add(id: string) {
    this.ids.push(id)
  }

  /**
   * 결과가 처리했다고 알려 준 지시를 지운다 (한 턴에 합쳐 처리한 지시는 모두).
   * 목록이 없으면(옛 CLI·로컬 명령) 가장 먼저 보낸 하나를 처리한 것으로 본다
   */
  settle(answered: readonly string[] | undefined) {
    if (answered?.length) this.ids = this.ids.filter((id) => !answered.includes(id))
    else this.ids.shift()
  }

  /** 세션을 닫거나 끊겼을 때: 아직 세션에 넘기지 않은 지시(keep)만 남긴다 — 넘긴 지시는 결과가 오지 않는다 */
  keepOnly(keep: readonly string[]) {
    this.ids = this.ids.filter((id) => keep.includes(id))
  }
}

/**
 * 턴이 끝났을 때 받은 일(origin)을 이번 결과 몫과 남길 몫으로 나눈다.
 * 아직 답하지 않은 지시가 pending개면 가장 나중에 받은 pending개는 다음 결과 몫이다 — 그래야 그 답이 지시가 온 방(팀·랩 방)에 올라간다
 */
export function splitFinished<T>(origins: readonly T[], pending: number) {
  const keep = pending > 0 ? origins.slice(-pending) : []
  return { done: origins.slice(0, origins.length - keep.length), keep }
}
