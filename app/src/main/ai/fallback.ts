import type { AiProvider } from '../../shared/types'
import { shouldFallback } from './aiSelect.ts'
import type { AiBackend, AskOptions, AskResult, SecretaryEvent, SecretaryRun, SecretaryRunOpts } from './types.ts'

/** 앞 공급자가 실패하면 다음 ready 공급자로 한 번 더 시도하는 백엔드 */
export class FallbackBackend implements AiBackend {
  private order: () => AiProvider[]
  private get: (p: AiProvider) => AiBackend

  constructor(order: () => AiProvider[], get: (p: AiProvider) => AiBackend) {
    this.order = order
    this.get = get
  }

  get provider() {
    return this.order()[0]
  }

  async ask(opts: AskOptions): Promise<AskResult> {
    const order = this.order()
    let err: unknown
    for (const p of order) {
      try {
        return await this.get(p).ask(p === 'claude' ? opts : { ...opts, model: undefined })
      } catch (e) {
        err = e
        if (!shouldFallback(e, opts.abortController?.signal.aborted ?? false)) break
      }
    }
    throw err
  }

  secretary(o: SecretaryRunOpts): SecretaryRun {
    const order = this.order()
    let current: SecretaryRun | null = null
    let closed = false
    const get = this.get
    async function* events(): AsyncGenerator<SecretaryEvent> {
      for (let i = 0; i < order.length && !closed; i++) {
        const run = get(order[i]).secretary(order[i] === 'claude' ? o : { ...o, model: undefined })
        current = run
        let started = false
        let failed = false
        try {
          for await (const e of run.events) {
            // 아무 말도 하기 전에 오류로 끝나면 다음 공급자로 (로그인 만료·실행 실패)
            if (!started && e.type === 'result' && e.subtype === 'error' && i < order.length - 1) {
              failed = true
              break
            }
            if (e.type !== 'result') started = true
            yield e
          }
        } catch (err) {
          if (started || i === order.length - 1 || closed) throw err
          failed = true
        }
        if (!failed) return
        run.close()
      }
    }
    return { events: events(), close: () => ((closed = true), current?.close()) }
  }
}
