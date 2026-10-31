import { MessageCircleMoreIcon, SparklesIcon } from 'lucide-react'
import type { PetLayout } from '@shared/deskPet'
import idleSrc from './sprites/body-idle.png'
import blinkSrc from './sprites/body-blink.png'

// 확정 그림(docs/design/desktop-secretary/README.md '구현용 최종 에셋'): 몸통은 body-idle 한 장, 눈 감기만 body-blink.
// 원본(90×127)에서 투명 여백을 같은 영역으로 잘라 캐릭터만 남겼다 (60×94, docs/design/desktop-secretary/app-sprites.py) — 그래서 그림 크기가 곧 캐릭터 크기다.
// 상태(생각 중 등)는 그림을 바꾸지 않고 몸통 위에 얹어서, 상태가 바뀌어도 몸통이 흔들리지 않게 한다.
// 바깥에서는 상태·눈 감기·크기(petLayout)만 넘긴다 (결재 배지·작업 표시·말풍선·끌기는 PetCharacter가 맡는다)

export type PetPose = 'idle' | 'approval' | 'working' | 'thinking'

export function PetSprite({ pose, isBlinking, layout }: { pose: PetPose; isBlinking: boolean; layout: PetLayout }) {
  const { char, scale } = layout
  const px = (n: number) => Math.round(n * scale)
  return (
    <span className="relative block" style={char}>
      {/* 두 장을 겹쳐 두고 눈 감기만 바꿔 보인다 — 처음 깜빡일 때 그림을 불러오느라 비는 일이 없게 */}
      {[idleSrc, blinkSrc].map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          {...char}
          className="pointer-events-none absolute inset-0 [image-rendering:pixelated]"
          // 높이도 style로 — 기본 스타일(img height:auto)이 원본 비율로 높이를 다시 재지 않게
          style={{ ...char, visibility: (i === 1) === isBlinking ? 'visible' : 'hidden' }}
        />
      ))}
      {/* 비서 표식: 머리 옆 반짝임 (112px일 때 12px — 크기 설정에 맞춰 함께 커진다) */}
      <SparklesIcon className="text-primary absolute top-[30%]" style={{ right: -px(14), width: px(12), height: px(12) }} aria-hidden />
      {pose === 'thinking' && <MessageCircleMoreIcon className="text-primary absolute top-0 fill-white" style={{ left: -px(16), width: px(16), height: px(16) }} aria-hidden />}
    </span>
  )
}
