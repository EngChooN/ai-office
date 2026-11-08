/**
 * 키 이벤트의 키 이름 — 글자 하나면 소문자로, 그 밖(Enter·ArrowUp 등)은 그대로.
 * 윈도우 자동완성 같은 합성 keydown은 key가 비어(undefined) 올 수 있어 ''로 돌려준다 (e.key.toLowerCase()가 renderer TypeError를 내던 곳, #12)
 */
export function keyName(e: { key?: unknown }): string {
  const key = typeof e.key === 'string' ? e.key : ''
  return key.length === 1 ? key.toLowerCase() : key
}
