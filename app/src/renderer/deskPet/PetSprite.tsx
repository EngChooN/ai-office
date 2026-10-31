import { SparklesIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// 임시 도트 그림 — 확정 시안(docs/design/desktop-secretary/sprites/)이 나오면 이 컴포넌트만 바꾼다.
// 바깥에서는 크기·상태·눈 감기만 넘긴다 (배지·말풍선·끌기는 PetCharacter가 맡는다)

export type PetPose = 'idle' | 'approval' | 'working' | 'thinking'

// 16×16 도트: . 빈칸, o 외곽선, s 피부, h 머리카락, b 옷, e 눈
const BODY = [
  '................',
  '.....oooooo.....',
  '....ohhhhhho....',
  '...ohhhhhhhho...',
  '...ohssssssho...',
  '...ossessesso...',
  '...ossessesso...',
  '...osssssssso...',
  '....osssssso....',
  '.....oooooo.....',
  '....obbbbbbo....',
  '...obbbbbbbbo...',
  '...obbbbbbbbo...',
  '...obboooobbo...',
  '....oo....oo....',
  '................',
]

const COLORS: Record<string, string> = {
  o: '#2b2233',
  h: '#5b4636',
  s: '#ffd9b8',
  b: 'var(--primary)',
  e: '#2b2233',
}

export function PetSprite({ size, pose, isBlinking }: { size: number; pose: PetPose; isBlinking: boolean }) {
  const rects: React.ReactNode[] = []
  BODY.forEach((row, y) =>
    [...row].forEach((c, x) => {
      // 눈 감기: 눈 두 줄 중 위 줄을 피부로, 아래 줄을 선으로
      const color = isBlinking && c === 'e' ? (y === 5 ? COLORS.s : COLORS.o) : COLORS[c]
      if (color) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />)
    }),
  )
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" aria-hidden className={cn(pose === 'thinking' && 'opacity-90')}>
        {rects}
      </svg>
      {/* 비서 표식: 머리 옆 반짝임 */}
      <SparklesIcon className="text-primary absolute top-0 -right-1 size-3" aria-hidden />
    </span>
  )
}
