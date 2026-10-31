import { SparklesIcon } from 'lucide-react'
import type { PetFace, PetLayout } from '@shared/deskPet'
import idleSrc from './sprites/body-idle.png'
import blinkSrc from './sprites/body-blink.png'
import surprisedSrc from './sprites/face-surprised.png'
import thinkingSrc from './sprites/face-thinking.png'
import thinkingBlinkSrc from './sprites/face-thinking-blink.png'
import happySrc from './sprites/face-happy.png'
import worriedSrc from './sprites/face-worried.png'
import worriedBlinkSrc from './sprites/face-worried-blink.png'
import sleepySrc from './sprites/face-sleepy.png'
import sleepyBlinkSrc from './sprites/face-sleepy-blink.png'
import focusedSrc from './sprites/face-focused.png'
import focusedBlinkSrc from './sprites/face-focused-blink.png'

// 확정 그림(docs/design/desktop-secretary/README.md '구현용 최종 에셋'): 몸통은 body-idle 한 장, 눈 감기만 body-blink.
// 원본(90×127)에서 투명 여백을 같은 영역으로 잘라 캐릭터만 남겼다 (60×94, docs/design/desktop-secretary/app-sprites.py) — 그래서 그림 크기가 곧 캐릭터 크기다.
// 표정(face-*)은 같은 그림에서 얼굴만 바꿨다 (face-sprites.py가 얼굴 밖 픽셀이 같은지 검사한다) — 표정이 바뀌어도 몸통이 흔들리지 않는다.
// 상태 표시(결재 배지·작업 점 등)는 PetCharacter가 몸통 위에 얹는다.
// 바깥에서는 표정·눈 감기·크기(petLayout)만 넘긴다 (머리 위 도트 말풍선·작업 표시·글자 말풍선·끌기는 PetCharacter가 맡는다)

/** 표정마다 뜬 눈·감은 눈 그림. 감은 눈이 없는 표정(놀람·기쁨 — 잠깐 나오거나 이미 눈을 감은 얼굴)은 깜빡이지 않는다 */
const FACES: Record<PetFace, { open: string; blink?: string }> = {
  idle: { open: idleSrc, blink: blinkSrc },
  surprised: { open: surprisedSrc },
  thinking: { open: thinkingSrc, blink: thinkingBlinkSrc },
  happy: { open: happySrc },
  worried: { open: worriedSrc, blink: worriedBlinkSrc },
  sleepy: { open: sleepySrc, blink: sleepyBlinkSrc },
  focused: { open: focusedSrc, blink: focusedBlinkSrc },
}
const ALL_SRC = Object.values(FACES).flatMap((f) => (f.blink ? [f.open, f.blink] : [f.open]))

export type PetPose = 'idle' | 'approval' | 'working' | 'thinking'

export function PetSprite({ face, isBlinking, layout }: { face: PetFace; isBlinking: boolean; layout: PetLayout }) {
  const { char, scale } = layout
  const px = (n: number) => Math.round(n * scale)
  const { open, blink } = FACES[face]
  const shown = isBlinking && blink ? blink : open
  return (
    <span className="relative block" style={char}>
      {/* 모든 그림을 겹쳐 두고 하나만 보인다 — 처음 표정이 바뀌거나 깜빡일 때 그림을 불러오느라 비는 일이 없게 */}
      {ALL_SRC.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          {...char}
          className="pointer-events-none absolute inset-0 [image-rendering:pixelated]"
          // 높이도 style로 — 기본 스타일(img height:auto)이 원본 비율로 높이를 다시 재지 않게
          style={{ ...char, visibility: src === shown ? 'visible' : 'hidden' }}
        />
      ))}
      {/* 비서 표식: 머리 옆 반짝임 (112px일 때 12px — 크기 설정에 맞춰 함께 커진다) */}
      <SparklesIcon className="text-primary absolute top-[30%]" style={{ right: -px(14), width: px(12), height: px(12) }} aria-hidden />
    </span>
  )
}
