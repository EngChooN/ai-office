// 화면 속 링크(직원 메시지의 주소 등)를 기본 브라우저로 넘겨도 되는지 (electron 없이 테스트한다)
// http·https만 연다 — file:·javascript:·앱 내부 스킴 등은 브라우저로 넘기지 않는다

/** 밖으로 열어도 되는 주소면 정리된 주소, 아니면 null */
export function externalUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.href : null
  } catch {
    return null
  }
}
