// 대기 메시지: 일하는 중에 직원 패널(휴대폰 포함)에서 보낸 지시를 앱이 들고 있다가 하던 일이 끝나면 하나씩 보낸다 (그때 기록에 넣는다)
// 엔진(Claude 입력 스트림)에 바로 넘기면 하던 일 중간에 섞여 들어가 취소·지금 보내기를 할 수 없어서 앱 쪽에 둔다

export interface WaitingMessage<O, A> {
  id: string
  text: string
  origin: O
  attachments: A[]
}

/** 패널 지시를 대기 메시지로 들고 있을까 — 일하는 중일 때만. 결재·질문을 기다리는 중(대표 말이 결재를 거둔다)·/명령(멈추기 같은 제어)·빈 글은 바로 전한다 */
export function shouldWait(a: { status: string; approvals: number; text: string; isSlash: boolean }) {
  return a.status === 'working' && a.approvals === 0 && !a.isSlash && a.text.trim() !== ''
}

export class WaitingMessages<O, A> {
  private lists = new Map<string, WaitingMessage<O, A>[]>()
  private readonly newId: () => string

  constructor(newId: () => string = () => crypto.randomUUID()) {
    this.newId = newId
  }

  list(staffId: string): readonly WaitingMessage<O, A>[] {
    return this.lists.get(staffId) ?? []
  }

  add(staffId: string, msg: Omit<WaitingMessage<O, A>, 'id'>) {
    const item = { id: this.newId(), ...msg }
    this.lists.set(staffId, [...this.list(staffId), item])
    return item
  }

  /** 하나를 꺼낸다 (지금 보내기·취소). 없으면 null */
  take(staffId: string, id: string) {
    const list = this.list(staffId)
    const msg = list.find((m) => m.id === id)
    if (!msg) return null
    this.set(staffId, list.filter((m) => m !== msg))
    return msg
  }

  /** 받은 순서대로 맨 앞 하나를 꺼낸다 (하던 일이 끝났을 때) */
  shift(staffId: string) {
    const [next, ...rest] = this.list(staffId)
    if (!next) return null
    this.set(staffId, rest)
    return next
  }

  clear(staffId: string) {
    this.lists.delete(staffId)
  }

  private set(staffId: string, list: WaitingMessage<O, A>[]) {
    if (list.length) this.lists.set(staffId, list)
    else this.lists.delete(staffId)
  }
}
