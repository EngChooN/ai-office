/** Phaser 게임에서 쓰는 부분만 — 테스트가 Phaser 없이 가짜로 넣을 수 있게 */
export interface RenderHost {
  loop: { running: boolean }
  events: { once(event: string, fn: () => void): unknown }
  step(time: number, delta: number): void
}

/**
 * 다음 그리기가 끝나면 fn을 부른다. 루프가 자고 있으면(창 숨김·가림 절전) 그 자리에서 한 장만 그린다 —
 * 기다리기만 하면 창이 다시 보일 때까지 신호가 오지 않아 사무실 안으로 못 들어간다. 루프는 그대로 재워 둔다.
 * loop.tick()은 빠르기 제한(미니 뷰 빈도)이 걸려 있으면 그리기를 건너뛸 수 있어 game.step을 직접 부른다
 */
export function afterNextRender(game: RenderHost, postRenderEvent: string, fn: () => void, now = performance.now()) {
  game.events.once(postRenderEvent, fn)
  if (!game.loop.running) game.step(now, 0)
}
