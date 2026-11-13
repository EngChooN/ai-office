/**
 * 설정 '특별 테마' 카드의 레트로 미리보기 — 바닥 타일 위 도트 창(귀퉁이 빠진 외곽선·딱 떨어지는 그림자) 안에
 * 직원 얼굴 한 칸·글 두 줄·받침 있는 버튼. 레트로는 다크 전용이라 어느 테마·모드에서 봐도 다크 그림 한 가지다.
 * 색은 theme-retro.css의 레트로 토큰 값과 같다 (그 파일은 레트로일 때만 적용돼 여기서는 직접 적는다). 28×20칸을 2배로 그린다
 */
const c = { tileA: '#1D1A2A', tileB: '#2B2840', out: '#0E0C16', card: '#343A52', drop: 'rgba(0,0,0,.6)', face: '#4A5068', fg: '#FAF5EC', muted: '#B9B6CC', pri: '#9B86D8', priLo: '#6A58A8', hi: '#4F5778' }

export function RetroThemePreview() {
  // [x, y, w, h, 색]
  const rects: [number, number, number, number, string][] = [
    [0, 0, 28, 20, c.tileA],
    ...[0, 8, 16, 24].flatMap((x) => [0, 8, 16].flatMap((y): [number, number, number, number, string][] => [[x, y, 4, 4, c.tileB], [x + 4, y + 4, 4, 4, c.tileB]])),
    // 창: 그림자 → 외곽선(귀퉁이 한 칸 빠짐) → 안쪽 + 밝은 줄
    [4, 4, 20, 14, c.drop],
    [3, 2, 18, 1, c.out],
    [3, 15, 18, 1, c.out],
    [2, 3, 1, 12, c.out],
    [21, 3, 1, 12, c.out],
    [3, 3, 18, 12, c.card],
    [3, 3, 18, 1, c.hi],
    // 직원 얼굴 한 칸: 하늘 바탕 + 머리카락·얼굴·눈
    [4, 4, 7, 7, c.out],
    [5, 5, 5, 5, c.face],
    [6, 6, 3, 1, c.out],
    [6, 7, 3, 3, '#F6C9A0'],
    [6, 8, 1, 1, c.out],
    [8, 8, 1, 1, c.out],
    // 글 두 줄
    [12, 5, 7, 1, c.fg],
    [12, 7, 5, 1, c.muted],
    // 버튼: 외곽선 + 받침
    [12, 10, 8, 4, c.out],
    [13, 11, 6, 1, c.pri],
    [13, 12, 6, 1, c.priLo],
    // 선택 표시 ▶
    [5, 12, 1, 3, c.fg],
    [6, 13, 1, 1, c.fg],
  ]
  return (
    <svg viewBox="0 0 28 20" width={56} height={40} shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {rects.map(([x, y, w, h, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} style={{ fill }} />
      ))}
    </svg>
  )
}
