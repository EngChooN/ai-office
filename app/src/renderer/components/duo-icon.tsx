import type { SVGProps } from 'react'
import { splitEdgeIcon, type DuoName } from '@shared/iconText'
import { cn } from '@/lib/utils'
import { DUO_ICON_DATA, type DuoPart } from './duo-icon-data'

/** 이 크기(px) 미만이면 채움이 뭉개져 선만 그린다 */
export const DUO_FILL_MIN_SIZE = 16
/** 채움을 오른쪽·아래로 살짝 어긋나게 (손으로 칠한 느낌) */
const FILL_OFFSET = 'translate(1.6 1.8)'

function Part({ p, isFill }: { p: DuoPart; isFill: boolean }) {
  const fill = isFill ? undefined : 'none'
  if (p.t === 'circle') return <circle cx={p.cx} cy={p.cy} r={p.r} fill={fill} />
  if (p.t === 'rect') return <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} fill={fill} />
  return <path d={p.d} fill={fill} />
}

/**
 * 이모지 대신 쓰는 듀오톤 아이콘 — 선은 글자색(currentColor), 닫힌 모양만 연보라(--duo-fill) 채움.
 * 글 옆 장식이면 label 없이(스크린리더가 건너뜀), 아이콘만으로 뜻을 전하면 label을 준다
 */
export function DuoIcon({ name, size = 16, label, className, ...rest }: { name: DuoName; size?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const parts = DUO_ICON_DATA[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block shrink-0 overflow-visible align-[-0.15em]', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {size >= DUO_FILL_MIN_SIZE && (
        <g data-duo-fill="" transform={FILL_OFFSET} strokeWidth={1.6} style={{ fill: 'var(--duo-fill)', stroke: 'var(--duo-fill)', opacity: 'var(--duo-fill-opacity)' }}>
          {parts.filter((p) => p.fill).map((p, i) => <Part key={i} p={p} isFill />)}
        </g>
      )}
      <g stroke="currentColor" strokeWidth={2.15}>
        {parts.map((p, i) => <Part key={i} p={p} isFill={false} />)}
      </g>
    </svg>
  )
}

/**
 * 글 맨 앞(없으면 맨 끝) 이모지가 20종이면 아이콘으로 바꿔 보여 준다 — 저장된 채팅·기록과 사전 문구가 그대로 쓴다.
 * 저장 문자열·사전은 바꾸지 않으므로 옛 기록과 OS 알림(이모지 그대로)도 같은 글을 쓴다
 */
export function IconText({ text, size = 15, className }: { text: string; size?: number; className?: string }) {
  const { icon, rest, isEnd } = splitEdgeIcon(text)
  if (!icon) return <>{text}</>
  const mark = <DuoIcon name={icon} size={size} className={cn(isEnd ? 'ml-1' : 'mr-1', className)} />
  return isEnd ? <>{rest}{mark}</> : <>{mark}{rest}</>
}
