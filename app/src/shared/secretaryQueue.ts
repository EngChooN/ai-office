// 비서에게 연달아 물을 때의 대기 줄 — electron 없음 (scripts/secretaryQueue.test.mts)
// 줄은 main(Secretary)이 하나만 갖고, 화면은 스냅샷의 queued(대기 중인 'me' 메시지 id, 순서대로)로 '차례 기다림 · n번째'를 그린다

/** 밀린 질문 한도 (답하는 중인 질문은 빼고) — 꽉 차면 질문을 받지 않고 입력창에 남긴다 */
export const QUEUE_MAX = 3

export interface QueuedAsk {
  /** 화면에 이미 보이는 'me' 메시지 id */
  msgId: number
  text: string
  /** 휴대폰(원격)에서 온 질문 — 원격 제한(①)을 그 질문의 답에도 건다 */
  remote: boolean
}

export type SecretaryAskResult = { ok: true } | { ok: false; reason: 'full' | 'rate' | 'empty' }

/** 대기 몇 번째인지 (1부터). 대기 중이 아니면 0 */
export const queuePosition = (queued: readonly number[], msgId: number) => queued.indexOf(msgId) + 1

/** 합친 질문 본문: 머리말 + "1. …" 줄. 머리말은 부르는 쪽 언어로 */
export const mergedText = (texts: readonly string[], intro: string) => [intro, ...texts.map((x, i) => `${i + 1}. ${x}`)].join('\n')

export class AskQueue {
  private items: QueuedAsk[] = []

  get size() {
    return this.items.length
  }

  get isFull() {
    return this.items.length >= QUEUE_MAX
  }

  ids(): number[] {
    return this.items.map((x) => x.msgId)
  }

  push(item: QueuedAsk) {
    this.items.push(item)
  }

  shift(): QueuedAsk | undefined {
    return this.items.shift()
  }

  /** 줄에서 뺀다. 이미 답을 시작했거나(줄에 없으면) false */
  cancel(msgId: number): boolean {
    const before = this.items.length
    this.items = this.items.filter((x) => x.msgId !== msgId)
    return this.items.length < before
  }

  /**
   * 대기 질문 2개 이상을 첫 질문 자리의 한 칸으로 합친다. 휴대폰 질문이 하나라도 있으면 합친 것도 휴대폰 질문 —
   * 원격 제한이 더 엄격한 쪽을 따른다 (PC 질문과 섞어 ①의 차단을 비켜 가지 못하게).
   * 돌려주는 값: 남는 칸(첫 질문 id)과 지울 메시지 id들. 합칠 게 없으면(이미 답을 시작해 1개 이하) null
   */
  merge(intro: string): { kept: QueuedAsk; removed: number[] } | null {
    if (this.items.length < 2) return null
    const [first, ...rest] = this.items
    const kept: QueuedAsk = { msgId: first.msgId, text: mergedText(this.items.map((x) => x.text), intro), remote: this.items.some((x) => x.remote) }
    this.items = [kept]
    return { kept, removed: rest.map((x) => x.msgId) }
  }

  clear() {
    this.items = []
  }
}
