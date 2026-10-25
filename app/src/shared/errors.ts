// 처리 함수가 "입력이 잘못됐다"를 알릴 때 쓰는 오류 — 원격 v2는 이것을 500이 아니라 400 invalid_args로 돌려준다
export class InvalidArgsError extends Error {
  readonly code = 'invalid_args'
  constructor(message: string) {
    super(message)
    this.name = 'InvalidArgsError'
  }
}

export const isInvalidArgs = (e: unknown): e is InvalidArgsError => e instanceof Error && (e as { code?: unknown }).code === 'invalid_args'

// 칸 배치를 놓기 검사(canPlace)가 막았을 때 — 원격 v2는 422 blocked { reason }으로 돌려준다
export class BlockedError extends Error {
  readonly code = 'blocked'
  readonly reason: string
  constructor(reason: string, message = '그 자리에는 놓을 수 없어요') {
    super(message)
    this.name = 'BlockedError'
    this.reason = reason
  }
}

export const isBlocked = (e: unknown): e is BlockedError => e instanceof Error && (e as { code?: unknown }).code === 'blocked' && typeof (e as { reason?: unknown }).reason === 'string'
