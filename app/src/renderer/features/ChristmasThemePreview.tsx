/**
 * 설정 '특별 테마' 카드의 크리스마스 미리보기 — 밤 전나무 바탕에 전구 줄, 눈 쌓인 카드, 금 리본 달린 빨간 버튼, 내리는 눈 몇 송이.
 * 크리스마스는 다크 전용이라 어느 테마·모드에서 봐도 다크 그림 한 가지다.
 * 색은 theme-christmas.css 토큰 값과 같다 (그 파일은 크리스마스일 때만 적용돼 여기서는 직접 적는다). RetroThemePreview와 같은 56×40 크기
 */
const c = { bg: '#101A15', card: '#1A2620', border: '#2E3D34', wire: '#556B5E', red: '#C8283E', gold: '#E6C77A', green: '#6FD39A', cream: '#FFF4DC', fg: '#F6F1E6', muted: '#B9C2B8' }

const BULBS: [number, string][] = [
  [4, '#FF5A6A'],
  [12, '#F2CF6E'],
  [20, c.green],
  [28, c.cream],
  [36, '#FF5A6A'],
  [44, '#F2CF6E'],
  [52, c.green],
]
const FLAKES: [number, number, number][] = [
  [6, 17, 0.9],
  [50, 14, 0.8],
  [47, 34, 0.7],
  [4, 33, 0.7],
]

export function ChristmasThemePreview() {
  return (
    <svg viewBox="0 0 56 40" width={56} height={40} aria-hidden className="shrink-0 rounded-md">
      <rect width={56} height={40} fill={c.bg} />
      {/* 전구 줄 */}
      <path d="M0 2 Q8 7 16 2 T32 2 T48 2 T64 2" fill="none" stroke={c.wire} strokeWidth={0.8} />
      {BULBS.map(([x, fill]) => (
        <ellipse key={x} cx={x} cy={5.2} rx={1.5} ry={2} fill={fill} />
      ))}
      {/* 눈 */}
      {FLAKES.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.85} />
      ))}
      {/* 카드 + 윗선 눈 쌓임 */}
      <rect x={10} y={13} width={36} height={22} rx={3} fill={c.card} stroke={c.border} strokeWidth={0.8} />
      <path d="M13 13.6 Q15 11 18 12.6 Q21 10.6 25 12.4 Q29 10.4 32 12.6 Q36 10.8 39 12.4 Q41 11.2 43 13.6 Z" fill="#FFFFFF" />
      {/* 글 두 줄 */}
      <rect x={14} y={17} width={18} height={1.6} rx={0.8} fill={c.fg} />
      <rect x={14} y={20.6} width={12} height={1.4} rx={0.7} fill={c.muted} />
      {/* 리본 달린 보내기 버튼 */}
      <rect x={14} y={26} width={16} height={6} rx={3} fill={c.red} stroke={c.gold} strokeWidth={0.6} />
      <path d="M22 25.6 C20 23 17.6 23.6 18.6 25.6 C19.2 26.4 20.8 26 22 25.6 Z M22 25.6 C24 23 26.4 23.6 25.4 25.6 C24.8 26.4 23.2 26 22 25.6 Z" fill={c.gold} />
    </svg>
  )
}
