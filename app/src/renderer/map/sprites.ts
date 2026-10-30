// 픽셀 스프라이트를 코드로 그린다 (밝은 탑다운 오피스 톤). 이미지 생성 에셋으로 바꿀 때는
// 같은 텍스처 키(sit-*, stand-*, desk-*, ...)로 PNG를 로드하면 씬 코드는 그대로 쓸 수 있다.

import { artPerson, artPersonBust, isoLook, toCanvas } from './iso/isoArt'
import { decodeLook, HAIR_COLORS, PANTS, SKINS, TOP_COLORS, type Look } from '@shared/look'

export const PIXEL = 2

// ── 캐릭터 (16×24, 외곽선 있음) ─────────────────────────
// 방향: down(정면) · up(뒷모습) · side(오른쪽 옆모습, 왼쪽은 좌우 반전)

type Pose = 'idle' | 'type1' | 'type2' | 'hand' | 'hand2' | 'blink' | 'back' | 'phone' | 'stretch' | 'nap'
type Dir = 'down' | 'up' | 'side'
export const DIRS: Dir[] = ['down', 'up', 'side']
const CHAR_W = 16
/** 앉은 모습은 허리(20행)까지만 그린다 — 아래는 책상·소파·의자가 가린다 */
const CHAR_H = 20

const HEAD: Record<Dir, string[]> = {
  down: [
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhHHhhhho...',
    '..ohhHhhhhhhho..',
    '..ohhhhhhhhhho..',
    '..ohssssssssho..',
    '..ossessssesso..',
    '..ossessssesso..',
    '..orssssssssro..',
    '..ossssmmsssso..',
    '...ossssssso....',
    '....oossssoo....',
  ],
  up: [
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '..ohhhhhhhhhho..',
    '..ohhhHHhhhhho..',
    '..ohhhhhhhhhho..',
    '..ohhhhhhhhhho..',
    '..ohhhhhhhhhho..',
    '..oshhhhhhhhso..',
    '...ohhhhhhhho...',
    '....ossssssoo...',
    '.....oossoo.....',
  ],
  side: [
    '.....ooooooo....',
    '....ohhhhhhho...',
    '...ohhHHhhhhho..',
    '...ohhhhhhhhho..',
    '...ohhhhhhssso..',
    '...ohhhhhsssso..',
    '...ohhhhsssesso.',
    '...ohhhssssesso.',
    '...ohhssssssrso.',
    '....ohsssssmsso.',
    '.....ossssssoo..',
    '......oosssoo...',
  ],
}
const BODY: Record<Dir, string[]> = {
  down: ['...occcwwccco...', '..occccwwcccCo..', '..occcccccccCo..', '.ocoocccccccoCo.', '.ocoocccccccoCo.', '.osoocccccccoso.', '..oopppppppppoo.', '...oppppppppo...'],
  up: ['...occccccco....', '..occccccccCo...', '..occcccccccCo..', '.ocoocccccccoCo.', '.ocoocccccccoCo.', '.osoocccccccoso.', '..oopppppppppoo.', '...oppppppppo...'],
  side: ['.....occccco....', '....occccccco...', '....ocCccccco...', '....ocCccccco...', '....ocCccccco...', '....ocsccccco...', '....oppppppppo..', '.....oppppppo...'],
}
type Px = [number, number, string]
const row = (y: number, x0: number, x1: number, key: string): Px[] => Array.from({ length: x1 - x0 + 1 }, (_, i): Px => [x0 + i, y, key])
const col = (x: number, y0: number, y1: number, key: string): Px[] => Array.from({ length: y1 - y0 + 1 }, (_, i): Px => [x, y0 + i, key])

/** 머리 모양 (HAIR_STYLES 순서). 기본 머리 위에 덧칠한다 */
const HAIR_EXTRA: Record<Dir, Px[][]> = {
  down: [
    [],
    [
      [1, 5, 'o'],
      [2, 5, 'h'],
      [1, 6, 'o'],
      [2, 6, 'h'],
      [1, 7, 'o'],
      [2, 7, 'h'],
      [1, 8, 'o'],
      [2, 8, 'h'],
      [1, 9, 'o'],
      [2, 9, 'h'],
      [14, 5, 'o'],
      [13, 5, 'h'],
      [14, 6, 'o'],
      [13, 6, 'h'],
      [14, 7, 'o'],
      [13, 7, 'h'],
      [14, 8, 'o'],
      [13, 8, 'h'],
      [14, 9, 'o'],
      [13, 9, 'h'],
    ],
    [
      [3, 5, 'h'],
      [4, 5, 'h'],
      [5, 5, 'h'],
      [6, 5, 'h'],
      [9, 5, 'h'],
      [10, 5, 'h'],
      [11, 5, 'h'],
      [12, 5, 'h'],
    ],
    // 포니테일: 오른쪽 뒤로 묶은 머리가 살짝 보인다
    [...col(13, 5, 8, 'h'), ...col(14, 4, 8, 'o'), [13, 9, 'o'], [13, 4, 'y']],
    // 삐죽 머리
    [
      [5, 0, 'h'],
      [7, 0, 'h'],
      [9, 0, 'h'],
      [4, 0, 'o'],
      [11, 0, 'o'],
      [3, 1, 'o'],
      [12, 1, 'o'],
    ],
    // 풍성한 머리: 양옆으로 부푼다
    [
      [4, 0, 'o'],
      [11, 0, 'o'],
      [3, 1, 'o'],
      [4, 1, 'h'],
      [11, 1, 'h'],
      [12, 1, 'o'],
      [2, 2, 'o'],
      [3, 2, 'h'],
      [12, 2, 'h'],
      [13, 2, 'o'],
      ...[3, 4, 5, 6, 7, 8].flatMap((y): Px[] => [
        [0, y, 'o'],
        [1, y, 'h'],
        [2, y, 'h'],
        [13, y, 'h'],
        [14, y, 'h'],
        [15, y, 'o'],
      ]),
      [1, 2, 'o'],
      [14, 2, 'o'],
      [1, 9, 'o'],
      [2, 9, 'o'],
      [13, 9, 'o'],
      [14, 9, 'o'],
    ],
    // 옆 가르마: 한쪽으로 쓸어 넘긴 앞머리
    [...row(5, 3, 8, 'h'), [3, 6, 'h'], [4, 6, 'h']],
    // 짧게 민 머리: 이마가 넓어진다
    row(4, 4, 11, 's'),
  ],
  up: [
    [],
    [
      [3, 9, 'h'],
      [4, 9, 'h'],
      [11, 9, 'h'],
      [12, 9, 'h'],
      [3, 10, 'h'],
      [4, 10, 'h'],
      [11, 10, 'h'],
      [12, 10, 'h'],
      [2, 9, 'o'],
      [2, 10, 'o'],
      [13, 9, 'o'],
      [13, 10, 'o'],
      [3, 11, 'o'],
      [4, 11, 'o'],
      [11, 11, 'o'],
      [12, 11, 'o'],
    ],
    [],
    [...col(7, 10, 12, 'h'), ...col(8, 10, 12, 'H'), ...col(6, 10, 12, 'o'), ...col(9, 10, 12, 'o'), [7, 13, 'o'], [8, 13, 'o'], [7, 9, 'y'], [8, 9, 'y']],
    [
      [5, 0, 'h'],
      [7, 0, 'h'],
      [9, 0, 'h'],
      [4, 0, 'o'],
      [11, 0, 'o'],
      [3, 1, 'o'],
      [12, 1, 'o'],
    ],
    [
      [4, 0, 'o'],
      [11, 0, 'o'],
      [3, 1, 'o'],
      [4, 1, 'h'],
      [11, 1, 'h'],
      [12, 1, 'o'],
      [2, 2, 'o'],
      [3, 2, 'h'],
      [12, 2, 'h'],
      [13, 2, 'o'],
      ...[3, 4, 5, 6, 7, 8].flatMap((y): Px[] => [
        [0, y, 'o'],
        [1, y, 'h'],
        [2, y, 'h'],
        [13, y, 'h'],
        [14, y, 'h'],
        [15, y, 'o'],
      ]),
      [1, 2, 'o'],
      [14, 2, 'o'],
      [1, 9, 'o'],
      [2, 9, 'o'],
      [13, 9, 'o'],
      [14, 9, 'o'],
    ],
    [],
    [],
  ],
  side: [
    [],
    [
      [3, 9, 'o'],
      [4, 9, 'h'],
      [4, 10, 'h'],
      [4, 11, 'o'],
      [5, 10, 'o'],
      [3, 10, 'o'],
    ],
    [
      [9, 4, 'h'],
      [10, 4, 'h'],
      [11, 4, 'h'],
      [12, 4, 'h'],
    ],
    [...col(3, 5, 7, 'h'), ...col(2, 5, 7, 'h'), ...col(1, 5, 7, 'o'), [2, 4, 'o'], [2, 8, 'o'], [3, 4, 'y']],
    [
      [5, 0, 'h'],
      [7, 0, 'h'],
      [9, 0, 'h'],
      [4, 0, 'o'],
      [11, 0, 'o'],
    ],
    [[4, 0, 'o'], [3, 1, 'o'], [4, 1, 'h'], ...col(3, 2, 7, 'h'), ...col(2, 2, 7, 'o'), [3, 8, 'o']],
    [
      [10, 4, 'h'],
      [11, 4, 'h'],
      [12, 4, 'h'],
      [9, 5, 'h'],
      [10, 5, 'h'],
    ],
    [
      [8, 4, 's'],
      [9, 4, 's'],
    ],
  ],
}

/** 옷 모양 (TOPS 순서). 기본 티셔츠 몸통 위에 덧칠한다. t=넥타이 */
const TOP_EXTRA: Record<Dir, Px[][]> = {
  down: [
    [],
    [[4, 12, 'C'], [11, 12, 'C'], [7, 12, 'C'], [8, 12, 'C'], [7, 13, 'C'], [8, 13, 'C'], ...col(6, 13, 14, 'w'), ...col(9, 13, 14, 'w'), ...row(16, 5, 10, 'C')],
    [[6, 12, 'w'], [9, 12, 'w'], ...col(7, 12, 15, 't'), ...col(8, 12, 14, 't')],
    [...col(7, 12, 17, 'w'), ...col(8, 12, 17, 'w'), ...col(6, 13, 17, 'C'), ...col(9, 13, 17, 'C'), [6, 14, 'k'], [6, 16, 'k']],
    [
      [6, 12, 'w'],
      [7, 12, 't'],
      [8, 12, 't'],
      [9, 12, 'w'],
      [6, 13, 'C'],
      [7, 13, 't'],
      [8, 13, 't'],
      [9, 13, 'C'],
      [7, 14, 't'],
      [8, 14, 't'],
      [8, 16, 'k'],
    ],
  ],
  up: [[], [...row(12, 5, 10, 'C'), ...row(13, 6, 9, 'C')], [], [], []],
  side: [
    [],
    [
      [5, 12, 'C'],
      [6, 12, 'C'],
      [5, 13, 'C'],
    ],
    [
      [10, 12, 'w'],
      [11, 13, 't'],
      [11, 14, 't'],
    ],
    col(11, 13, 17, 'w'),
    [
      [10, 12, 'w'],
      [11, 13, 'w'],
      [11, 14, 't'],
      [11, 15, 't'],
    ],
  ],
}

/** 얼굴 소품 (FACE_ITEMS 순서). 뒷모습엔 안 보인다 */
const FACE_EXTRA: Record<Dir, Px[][]> = {
  down: [
    [],
    [
      ...row(5, 4, 6, 'k'),
      ...row(5, 9, 11, 'k'),
      ...col(4, 6, 7, 'k'),
      ...col(6, 6, 7, 'k'),
      ...col(9, 6, 7, 'k'),
      ...col(11, 6, 7, 'k'),
      ...row(8, 4, 6, 'k'),
      ...row(8, 9, 11, 'k'),
      [7, 6, 'k'],
      [8, 6, 'k'],
    ],
    [...row(6, 4, 11, 'k'), ...row(7, 4, 6, 'k'), ...row(7, 9, 11, 'k'), [4, 6, 'w'], [9, 6, 'w']],
    [[3, 8, 'h'], [12, 8, 'h'], ...row(9, 3, 5, 'h'), ...row(9, 10, 12, 'h'), ...row(10, 4, 10, 'h'), ...row(11, 6, 9, 'h')],
    row(8, 6, 9, 'h'),
  ],
  up: [[], [], [], [], []],
  side: [
    [],
    [...row(5, 10, 12, 'k'), ...row(8, 10, 12, 'k'), ...col(10, 6, 7, 'k'), ...col(12, 6, 7, 'k'), ...row(6, 7, 9, 'k')],
    [...row(6, 7, 12, 'k'), ...row(7, 10, 12, 'k'), [10, 6, 'w']],
    [...row(9, 7, 10, 'h'), [12, 9, 'h'], [13, 9, 'h'], ...row(10, 6, 11, 'h'), ...row(11, 8, 10, 'h')],
    row(8, 10, 12, 'h'),
  ],
}

/** 머리 소품 (HEAD_ITEMS 순서). 모자는 옷 색을 따라간다 */
const HEAD_EXTRA: Record<Dir, Px[][]> = {
  down: [
    [],
    [
      ...row(0, 5, 10, 'k'),
      [4, 1, 'k'],
      [11, 1, 'k'],
      [3, 2, 'k'],
      [12, 2, 'k'],
      ...col(2, 3, 4, 'k'),
      ...col(13, 3, 4, 'k'),
      ...col(1, 5, 7, 'k'),
      ...col(2, 5, 7, 'k'),
      ...col(13, 5, 7, 'k'),
      ...col(14, 5, 7, 'k'),
      [2, 8, 'k'],
      [3, 9, 'k'],
      [4, 9, 'k'],
    ],
    [...row(1, 5, 10, 'c'), ...row(2, 4, 11, 'c'), ...row(3, 3, 12, 'c'), ...row(4, 2, 13, 'C'), [1, 4, 'o'], [14, 4, 'o']],
    [...row(1, 5, 10, 'c'), ...row(2, 4, 11, 'c'), ...row(3, 3, 12, 'c'), ...row(4, 3, 12, 'C')],
    [
      [11, 3, 'y'],
      [12, 3, 'y'],
      [12, 4, 'y'],
    ],
    [...row(0, 5, 10, 'c'), ...row(1, 3, 12, 'c'), [2, 1, 'o'], [13, 1, 'o'], ...row(2, 2, 13, 'C'), [1, 2, 'o'], [14, 2, 'o']],
  ],
  up: [
    [],
    [
      ...row(0, 5, 10, 'k'),
      [4, 1, 'k'],
      [11, 1, 'k'],
      [3, 2, 'k'],
      [12, 2, 'k'],
      ...col(2, 3, 4, 'k'),
      ...col(13, 3, 4, 'k'),
      ...col(1, 5, 7, 'k'),
      ...col(2, 5, 7, 'k'),
      ...col(13, 5, 7, 'k'),
      ...col(14, 5, 7, 'k'),
    ],
    [...row(1, 5, 10, 'c'), ...row(2, 4, 11, 'c'), ...row(3, 3, 12, 'c'), ...row(4, 3, 12, 'c'), ...row(5, 5, 10, 'C')],
    [...row(1, 5, 10, 'c'), ...row(2, 4, 11, 'c'), ...row(3, 3, 12, 'c'), ...row(4, 3, 12, 'C')],
    [
      [3, 3, 'y'],
      [4, 3, 'y'],
      [3, 4, 'y'],
    ],
    [...row(0, 5, 10, 'c'), ...row(1, 3, 12, 'c'), [2, 1, 'o'], [13, 1, 'o'], ...row(2, 2, 13, 'C'), [1, 2, 'o'], [14, 2, 'o']],
  ],
  side: [
    [],
    [...col(6, 0, 4, 'k'), ...col(5, 5, 7, 'k'), ...col(6, 5, 7, 'k'), [7, 8, 'k'], ...row(9, 8, 10, 'k')],
    [...row(1, 5, 11, 'c'), ...row(2, 4, 12, 'c'), ...row(3, 4, 12, 'c'), ...row(4, 9, 14, 'C'), [15, 4, 'o']],
    [...row(1, 5, 11, 'c'), ...row(2, 4, 12, 'c'), ...row(3, 4, 12, 'c'), ...row(4, 4, 12, 'C')],
    [
      [7, 3, 'y'],
      [8, 3, 'y'],
    ],
    [...row(0, 5, 11, 'c'), ...row(1, 4, 13, 'c'), [3, 1, 'o'], [14, 1, 'o'], ...row(2, 3, 14, 'C'), [2, 2, 'o'], [15, 2, 'o']],
  ],
}

const FIXED: Record<string, string> = { o: '#2a2230', e: '#2a2230', w: '#f4f4f8', r: '#f0a8a0', m: '#c2706a', M: '#7a2a2a', b: '#3a2a22', k: '#2a2a3a', l: '#8ad8ff', t: '#b8323a', y: '#f0c84a' }

function colorsOf(look: Look): Record<string, string> {
  const [h, H] = HAIR_COLORS[look.hairColor]
  const [c, C] = TOP_COLORS[look.topColor]
  return { ...FIXED, h, H, s: SKINS[look.skin], c, C, p: PANTS[look.pants] }
}

function paintRows(ctx: CanvasRenderingContext2D, rows: string[], colors: Record<string, string>, y0: number) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x * PIXEL, (y0 + y) * PIXEL, PIXEL, PIXEL)
    }
  })
}

function paintPx(ctx: CanvasRenderingContext2D, px: Px[], colors: Record<string, string>) {
  for (const [x, y, key] of px) {
    if (key === '.') {
      ctx.clearRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL)
      continue
    }
    ctx.fillStyle = colors[key]
    ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL)
  }
}

function newCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w * PIXEL
  canvas.height = h * PIXEL
  return { canvas, ctx: canvas.getContext('2d')! }
}

// 칠하는 순서: 몸 → 옷 → 머리 → 머리 소품 → 자세(팔·눈 감기) → 얼굴 소품
// 팔은 헤드셋 앞에, 안경은 감은 눈 위에 오도록 한다
function drawFigure(avatar: number, dir: Dir, height: number, legs: string[] | null, extra: Px[]) {
  const look = decodeLook(avatar)
  const colors = colorsOf(look)
  const { canvas, ctx } = newCanvas(CHAR_W, height)
  paintRows(ctx, HEAD[dir], colors, 0)
  paintRows(ctx, BODY[dir], colors, HEAD[dir].length)
  if (legs) paintRows(ctx, legs, colors, HEAD[dir].length + BODY[dir].length)
  paintPx(ctx, TOP_EXTRA[dir][look.top], colors)
  paintPx(ctx, HAIR_EXTRA[dir][look.hairStyle], colors)
  paintPx(ctx, HEAD_EXTRA[dir][look.head], colors)
  paintPx(ctx, extra, colors)
  paintPx(ctx, FACE_EXTRA[dir][look.face], colors)
  return canvas
}

const EYES_CLOSED: Record<Dir, Px[]> = {
  down: [
    [5, 6, 's'],
    [10, 6, 's'],
    [5, 7, 'o'],
    [10, 7, 'o'],
  ],
  side: [
    [11, 6, 's'],
    [11, 7, 'o'],
  ],
  up: [],
}
/** 팔을 머리 옆으로 든 자세. wave=true면 손을 한 칸 더 기울여 흔드는 느낌 */
function raisedArm(wave: boolean): Px[] {
  const hx = wave ? 15 : 14
  return [
    [13, 15, '.'],
    [14, 15, '.'],
    [13, 16, '.'],
    [14, 16, '.'],
    [13, 17, '.'],
    [14, 17, '.'],
    [12, 15, 'o'],
    [12, 16, 'o'],
    [12, 17, 'o'],
    [hx, 4, 'o'],
    [hx, 5, 's'],
    [hx, 6, 's'],
    [15, 7, 'o'],
    [14, 7, 's'],
    [15, 8, 'o'],
    [14, 8, 'c'],
    [15, 9, 'o'],
    [14, 9, 'c'],
    [15, 10, 'o'],
    [14, 10, 'c'],
    [15, 11, 'o'],
    [14, 11, 'c'],
    [15, 12, 'o'],
    [14, 12, 'c'],
    [14, 13, 'c'],
    [15, 13, 'o'],
  ]
}

/** 앉은 모습 (책상·소파·회의 자리). back = 등을 보이고 앉은 모습 */
/** 양팔을 머리 위로 쭉 — 기지개 */
const STRETCH: Px[] = [
  [1, 15, '.'],
  [2, 15, '.'],
  [1, 16, '.'],
  [2, 16, '.'],
  [1, 17, '.'],
  [2, 17, '.'],
  [3, 15, 'o'],
  [3, 16, 'o'],
  [3, 17, 'o'],
  [13, 15, '.'],
  [14, 15, '.'],
  [13, 16, '.'],
  [14, 16, '.'],
  [13, 17, '.'],
  [14, 17, '.'],
  [12, 15, 'o'],
  [12, 16, 'o'],
  [12, 17, 'o'],
  ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].flatMap((y): Px[] => [
    [0, y, 'o'],
    [1, y, y < 6 ? 's' : 'c'],
    [15, y, 'o'],
    [14, y, y < 6 ? 's' : 'c'],
  ]),
  [1, 2, 'o'],
  [14, 2, 'o'],
]
/** 가슴 앞에서 폰을 본다 (화면 빛이 얼굴 아래로) */
const PHONE: Px[] = [
  [2, 17, 'c'],
  [13, 17, 'c'],
  [6, 15, 's'],
  [9, 15, 's'],
  [7, 14, 'k'],
  [8, 14, 'k'],
  [7, 15, 'l'],
  [8, 15, 'k'],
  [7, 16, 'k'],
  [8, 16, 'k'],
]

/** 엎드려 자기: 팔짱 낀 팔 위로 정수리가 내려온다 */
function drawNap(avatar: number) {
  const look = decodeLook(avatar)
  const colors = colorsOf(look)
  const { canvas, ctx } = newCanvas(CHAR_W, CHAR_H)
  const shift = (px: Px[]) => px.map(([x, y, k]): Px => [x, y + 6, k])
  paintRows(ctx, BODY.down, colors, HEAD.down.length)
  paintPx(ctx, TOP_EXTRA.down[look.top], colors)
  paintRows(ctx, ['.oocccccccccco..', 'occcccccccccccco', 'osscccccccccsso.'], colors, 15)
  paintRows(ctx, HEAD.up.slice(0, 10), colors, 6)
  paintPx(ctx, shift(HAIR_EXTRA.up[look.hairStyle]), colors)
  paintPx(ctx, shift(HEAD_EXTRA.up[look.head]), colors)
  return canvas
}

function drawCharacter(avatar: number, pose: Pose): HTMLCanvasElement {
  if (pose === 'back') return drawFigure(avatar, 'up', CHAR_H, null, [])
  if (pose === 'nap') return drawNap(avatar)
  const extra: Record<Exclude<Pose, 'back' | 'nap'>, Px[]> = {
    idle: [],
    type1: [
      [2, 16, 's'],
      [2, 17, 'c'],
      [13, 17, 's'],
    ],
    type2: [
      [2, 17, 's'],
      [13, 16, 's'],
      [13, 17, 'c'],
    ],
    hand: raisedArm(false),
    hand2: raisedArm(true),
    blink: EYES_CLOSED.down,
    phone: PHONE,
    stretch: [...STRETCH, ...EYES_CLOSED.down, [7, 9, 'M'], [8, 9, 'M']],
  }
  return drawFigure(avatar, 'down', CHAR_H, null, extra[pose])
}

/** 대시보드·패널용 아바타 — 사무실 지도와 같은 새 직원 그림. bust면 상반신만 (작은 목록용) */
const avatarCache = new Map<string, string>()
export function avatarUrl(avatar: number, bust = false): string {
  const key = `${avatar}:${bust ? 'b' : 'f'}`
  let url = avatarCache.get(key)
  if (!url) {
    const look = isoLook(avatar)
    url = toCanvas(bust ? artPersonBust(look) : artPerson('stand', 'front', look)).toDataURL()
    avatarCache.set(key, url)
  }
  return url
}

// ── 가구 ────────────────────────────────────────────────

type Box = (x: number, y: number, w: number, h: number, color: string) => void
export function furniture(w: number, h: number, draw: (box: Box) => void) {
  const { canvas, ctx } = newCanvas(w, h)
  draw((x, y, bw, bh, color) => {
    ctx.fillStyle = color
    ctx.fillRect(x * PIXEL, y * PIXEL, bw * PIXEL, bh * PIXEL)
  })
  return canvas
}

const OUT = '#2a2230'

const DESK_W = 34
const DESK_H = 16
/** 책상 (3/4 시점): 사람을 향한 모니터 뒷면·키보드·머그·서류 */
type Screen = 'off' | 'on1' | 'on2'
/** 상판 [윗면, 하이라이트, 앞모서리] · 앞판 [색, 윗줄] */
const DESK_PALETTES: Record<DeskStyle, { top: [string, string, string]; front: [string, string] } | null> = {
  default: null,
  'desk-white': { top: ['#eceef4', '#ffffff', '#b8bcc8'], front: ['#dcdfe8', '#c4c8d4'] },
  'desk-walnut': { top: ['#8a5a3a', '#a8714a', '#6e4428'], front: ['#7a4c30', '#5a3420'] },
  'desk-gaming': { top: ['#2a2a34', '#3a3a48', '#16161c'], front: ['#22222c', '#ff6ac8'] },
  'desk-glass': { top: ['#a8d4ee', '#e4f4ff', '#7aa8c8'], front: ['#c4e0f0', '#9ac4dc'] },
  'desk-executive': { top: ['#6e4428', '#8a5a3a', '#4a2c18'], front: ['#5a3420', '#c8a030'] },
  'desk-pastel': { top: ['#bfe8dc', '#dcf6ee', '#8ac8b4'], front: ['#a8dccc', '#8ac8b4'] },
  'desk-bamboo': { top: ['#d8c088', '#ecd8a4', '#b89c5c'], front: ['#c8ac70', '#a88c4c'] },
  'desk-standing': { top: ['#3a3f4a', '#5c6270', '#22252f'], front: ['#9aa0b0', '#5c6270'] },
  'desk-hologram': { top: ['#2a3a5a', '#6ae8ff', '#1c2440'], front: ['#1c2440', '#6ae8ff'] },
  'desk-gold': { top: ['#e8c040', '#fff0a0', '#b08a20'], front: ['#d8b040', '#fff0a0'] },
}

export function drawDesk(screen: Screen, variant = 0, tier = 0, style: DeskStyle = 'default') {
  const palette = DESK_PALETTES[style]
  // 게이밍·임원 책상은 레벨과 상관없이 듀얼 모니터
  const hasDual = tier >= 1 || style === 'desk-gaming' || style === 'desk-executive'
  const glow = screen !== 'off'
  // 켜진 화면은 두 프레임을 번갈아 그려 깜빡이는 빛을 낸다
  const light = screen === 'on2' ? '#d8f4ff' : '#8ad8ff'
  return furniture(DESK_W, DESK_H, (box) => {
    box(3, 0, 12, 7, OUT)
    box(4, 1, 10, 5, '#4a4f5c')
    box(4, 1, 10, 1, '#5c6270')
    if (glow) {
      // 켜진 화면 빛이 모니터 테두리로 새어 나온다
      box(3, 0, 1, 7, light)
      box(14, 0, 1, 7, light)
      box(4, 0, 10, 1, '#bfeaff')
      box(2, 2, 1, 3, screen === 'on2' ? '#bfeaff60' : '#8ad8ff40')
      box(15, 2, 1, 3, screen === 'on2' ? '#bfeaff60' : '#8ad8ff40')
    }
    box(8, 6, 2, 2, '#3a3f4a')
    const top = palette?.top ?? (tier >= 3 ? ['#8a5a3a', '#a8714a', '#6e4428'] : ['#e2c29a', '#f0d6b4', '#b8956a'])
    box(0, 4, 34, 1, OUT)
    box(0, 5, 34, 5, top[0])
    box(1, 5, 32, 1, top[1])
    box(0, 10, 34, 1, top[2])
    box(0, 4, 1, 12, OUT)
    box(33, 4, 1, 12, OUT)
    box(1, 11, 32, 4, palette?.front[0] ?? (tier >= 3 ? '#7a4c30' : '#c9a47a'))
    box(1, 11, 32, 1, palette?.front[1] ?? (tier >= 3 ? '#5a3420' : '#a8845c'))
    // 게이밍 책상 앞판 RGB 줄
    if (style === 'desk-gaming') {
      box(1, 13, 11, 1, '#ff6ac8')
      box(12, 13, 11, 1, '#6ae8ff')
      box(23, 13, 10, 1, '#7ad87a')
    }
    box(0, 15, 34, 1, OUT)
    box(16, 6, 9, 2, '#d6d8e0')
    box(16, 6, 9, 1, '#f2f2f6')
    box(27, 6, 2, 2, '#d6d8e0')
    if (hasDual) {
      // 듀얼 모니터 (오른쪽)
      box(18, 0, 9, 6, OUT)
      box(19, 1, 7, 4, '#4a4f5c')
      if (glow) box(18, 0, 9, 1, '#bfeaff')
      box(22, 6, 1, 1, '#3a3f4a')
    }
    if (style === 'desk-hologram') {
      box(2, 0, 30, 4, '#6ae8ff60')
      box(4, 1, 26, 1, '#bfeaff')
    }
    if (style === 'desk-executive') {
      // 트리플 모니터 (왼쪽) + 금장
      box(0, 1, 4, 6, OUT)
      box(1, 2, 2, 4, '#4a4f5c')
      box(0, 10, 34, 1, '#c8a030')
    }
    if (tier >= 2) {
      // 명패
      box(12, 12, 10, 2, '#f0c84a')
      box(13, 12, 8, 1, '#ffe08a')
    }
    if (tier >= 3) {
      // 트로피
      box(1, 0, 3, 3, '#f0c84a')
      box(2, 3, 1, 2, '#f0c84a')
      box(1, 5, 3, 1, '#c8a030')
    }
    // 모니터 뒤 포스트잇
    box(12, 1, 2, 2, ['#ffe08a', '#f8a8c8', '#a8e0f8', '#c8f0a8'][variant % 4])
    if (variant === 0) {
      box(29, 2, 3, 3, '#f4f4f8')
      box(29, 2, 3, 1, '#7a4a2a')
      box(32, 3, 1, 1, '#f4f4f8')
    } else if (variant === 1) {
      // 작은 화분
      box(28, 0, 4, 3, '#4fa85a')
      box(29, 0, 2, 1, '#6fc878')
      box(28, 3, 4, 3, '#c96a4a')
    } else if (variant === 2) {
      // 책 더미
      box(27, 1, 6, 2, '#5a8ae8')
      box(28, 3, 5, 2, '#e8835a')
      box(27, 5, 6, 1, '#f0c84a')
    } else {
      // 스탠드 조명
      box(30, 0, 3, 1, OUT)
      box(29, 1, 4, 2, '#f0c84a')
      box(31, 3, 1, 3, OUT)
      box(29, 5, 4, 1, OUT)
    }
    box(2, 6, 4, 3, '#ffffff')
    box(3, 7, 2, 1, '#9aa0b0')
  })
}

const CHAIR_DARK = '#3a3f4a'

/** 빈 의자: 살짝 돌아가 있고 방석·기둥·바퀴까지 보인다 */
export function drawChairEmpty(style: ChairStyle = 'default') {
  const [CHAIR, CHAIR_LIGHT] = CHAIR_PALETTES[style]
  return furniture(20, 26, (box) => {
    box(5, 0, 10, 2, OUT)
    box(4, 1, 12, 10, OUT)
    box(5, 2, 10, 8, CHAIR)
    box(6, 3, 8, 2, CHAIR_LIGHT)
    box(2, 11, 16, 5, OUT)
    box(3, 12, 14, 3, CHAIR_LIGHT)
    box(3, 14, 14, 1, CHAIR)
    box(1, 12, 2, 3, OUT)
    box(17, 12, 2, 3, OUT)
    box(9, 16, 2, 5, CHAIR_DARK)
    box(3, 21, 14, 2, OUT)
    box(2, 23, 3, 2, OUT)
    box(9, 23, 2, 2, OUT)
    box(15, 23, 3, 2, OUT)
  })
}

// ── 탕비실·공용 구역·벽 소품 ─────────────────────────────

// ── 회사가 커지면 생기는 소품 ───────────────────────────

// ── 로비·옥상 (Lv.6~10) ───────────────────────────────

// ── 상점 가구 ─────────────────────────────────────────

// ── 상점 책상·의자 스타일 ─────────────────────────────

export type DeskStyle = 'default' | 'desk-white' | 'desk-walnut' | 'desk-gaming' | 'desk-glass' | 'desk-executive' | 'desk-pastel' | 'desk-bamboo' | 'desk-standing' | 'desk-hologram' | 'desk-gold'
export type ChairStyle = 'default' | 'chair-mesh' | 'chair-pink' | 'chair-gaming' | 'chair-leather' | 'chair-wood' | 'chair-ball' | 'chair-ergo' | 'chair-egg' | 'chair-neon' | 'chair-throne'

const CHAIR_PALETTES: Record<ChairStyle, [string, string, string]> = {
  default: ['#5c6474', '#7c8496', '#3a3f4a'],
  'chair-mesh': ['#9aa2b0', '#c4cad6', '#5c6474'],
  'chair-pink': ['#e89ab8', '#f8c4d8', '#a85a7a'],
  'chair-gaming': ['#c8303c', '#e8505a', '#8a1c24'],
  'chair-leather': ['#8a5a3a', '#a8714a', '#5a3420'],
  'chair-wood': ['#b8875a', '#d0a070', '#8a6038'],
  'chair-ball': ['#5ab4e8', '#8ad0f4', '#3a8ac8'],
  'chair-ergo': ['#3a3f4a', '#5ab47e', '#22252f'],
  'chair-egg': ['#f4f4f8', '#e8835a', '#c4c8d4'],
  'chair-neon': ['#1c1c24', '#6ae8ff', '#ff6ac8'],
  'chair-throne': ['#c8303c', '#f0c84a', '#8a1c24'],
}
