// 같은 저장 영역(session)에는 프로토콜 처리기를 한 번만 등록한다 (두 번 등록하면 electron이 오류를 낸다)

interface ProtocolHost {
  isProtocolHandled(scheme: string): boolean
  handle(scheme: string, handler: (req: Request) => Response | Promise<Response>): void
}

const done = new WeakMap<object, Set<string>>()

/** 새로 등록했으면 true, 이미 있어서 건너뛰었으면 false */
export function handleOnce(owner: object, protocol: ProtocolHost, scheme: string, handler: (req: Request) => Response | Promise<Response>): boolean {
  const seen = done.get(owner) ?? new Set<string>()
  done.set(owner, seen)
  if (seen.has(scheme) || protocol.isProtocolHandled(scheme)) return false
  protocol.handle(scheme, handler)
  seen.add(scheme)
  return true
}
