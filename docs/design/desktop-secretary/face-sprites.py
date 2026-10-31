"""바탕화면 비서 표정 그림 만들기·검사 (Pillow 필요: python3 -m pip install pillow)

기준  app/src/renderer/deskPet/sprites/body-idle.png (60×94, 확정본)
결과  app/src/renderer/deskPet/sprites/face-{표정}.png, face-{표정}-blink.png (눈 감은 그림이 있는 표정만)
      docs/design/desktop-secretary/expression-preview.png (표정별 4배 미리보기)

방향은 expression-concept.png(이디자 시안, 대표 확인). 기준 그림의 두 눈 칸(5×8)을 피부색으로 지운 뒤
눈·눈썹을 다시 그리고, 입 칸(5×3)에 입을 그린다. 그 밖의 픽셀은 기준 그림과 같아야 한다.

실행: python3 docs/design/desktop-secretary/face-sprites.py         (만들고 검사)
      python3 docs/design/desktop-secretary/face-sprites.py --check (검사만)
"""

import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / 'app/src/renderer/deskPet/sprites'
PREVIEW = ROOT / 'docs/design/desktop-secretary/expression-preview.png'

# 기준 그림 기준 좌표 (끝 포함). 눈은 왼쪽·오른쪽 각 5×8, 입은 얼굴 가운데 5×3
EYE_L, EYE_R, EYE_TOP = 17, 33, 30
MOUTH_X, MOUTH_Y = 25, 40
FACE = (17, 30, 37, 42)  # 바뀌어도 되는 영역 — 이 밖은 기준 그림과 픽셀까지 같아야 한다

COLORS = {
    '.': (0xfd, 0xd9, 0xb2, 255),  # 피부
    'k': (0x0a, 0x0d, 0x22, 255),  # 눈·눈썹 (기준 눈의 어두운 부분)
    'n': (0x2b, 0x2f, 0x46, 255),  # 눈 아래쪽 남색
    'w': (0xff, 0xff, 0xff, 255),  # 흰자·빛
    'r': (0x9a, 0x3b, 0x3b, 255),  # 입 선
    'p': (0xe8, 0x80, 0x80, 255),  # 입 안
}

# 왼쪽 눈 8줄 (오른쪽 눈은 좌우를 뒤집어 그린다 — 눈썹 기울기가 대칭이 되게). '_'는 기준 그림 그대로
CLOSED = ['.....', '.....', '.....', '.....', '.....', 'kkkkk', 'kkkkk', '.....']
FACES = {
    'surprised': {  # 놀람: 동그랗게 뜬 눈 + 'o' 입
        'eye': ['.kkk.', 'kkwkk', 'kkkkk', 'knnnk', 'knnnk', '.nnn.', '.....', '.....'],
        'blink': None,
        'mouth': ['.rrr.', '.rpr.', '.rrr.'],
    },
    'thinking': {  # 생각 중: 눈동자가 위 바깥쪽 + 한쪽으로 다문 입
        'eye': ['.....', '.kkkk', 'kwkkk', 'kwkkk', 'kwwnk', '.kkk.', '.....', '.....'],
        'blink': CLOSED,
        'mouth': ['.....', '..rr.', '.....'],
    },
    'happy': {  # 기쁨: ∩ 눈 + 벌린 웃는 입
        'eye': ['.....', '.....', '.kkk.', 'k...k', 'k...k', '.....', '.....', '.....'],
        'blink': None,
        'mouth': ['rrrrr', '.rpr.', '..r..'],
    },
    'worried': {  # 걱정: 안쪽이 올라간 눈썹 + 작은 눈 + 처진 입
        'eye': ['...kk', '.kk..', '.....', '.kkk.', '.kkk.', '.nnn.', '.....', '.....'],
        'blink': ['...kk', '.kk..', '.....', '.....', '.....', 'kkkkk', '.....', '.....'],
        'mouth': ['.....', '.rrr.', 'r...r'],
    },
    'sleepy': {  # 졸림: 반쯤 감은 눈 + 작게 벌린 입
        'eye': ['.....', '.....', '.....', '.....', 'kkkkk', 'knnnk', '.nnn.', '.....'],
        'blink': CLOSED,
        'mouth': ['.....', '..r..', '.....'],
    },
    'focused': {  # 집중: 안쪽이 내려간 눈썹 + 또렷한 눈 + 다문 입
        'eye': ['kk...', '..kkk', '.....', 'kkkkk', 'kkkkk', 'knnnk', 'knnnk', '.....'],
        'blink': ['kk...', '..kkk', '.....', '.....', '.....', 'kkkkk', 'kkkkk', '.....'],
        'mouth': ['.....', '.rrr.', '.....'],
    },
}


def paint(base, eye, mouth):
    im = base.copy()
    p = im.load()
    for y, row in enumerate(eye):
        for i, ch in enumerate(row):
            if ch != '_':
                p[EYE_L + i, EYE_TOP + y] = COLORS[ch]
                p[EYE_R + 4 - i, EYE_TOP + y] = COLORS[ch]
    for y, row in enumerate(mouth):
        for x, ch in enumerate(row):
            if ch != '.':
                p[MOUTH_X + x, MOUTH_Y + y] = COLORS[ch]
    return im


def outputs():
    for name, f in FACES.items():
        yield f'face-{name}', f['eye'], f['mouth']
        if f['blink']:
            yield f'face-{name}-blink', f['blink'], f['mouth']


def check(base):
    w, h = base.size
    bp = base.load()
    x0, y0, x1, y1 = FACE
    bad = []
    for name, _, _ in outputs():
        im = Image.open(SPRITES / f'{name}.png').convert('RGBA')
        if im.size != base.size:
            bad.append(f'{name}: 크기 {im.size}')
            continue
        p = im.load()
        diff = [(x, y) for y in range(h) for x in range(w)
                if not (x0 <= x <= x1 and y0 <= y <= y1) and p[x, y] != bp[x, y]]
        if diff:
            bad.append(f'{name}: 얼굴 밖 픽셀 {len(diff)}개 다름 (예: {diff[0]})')
    return bad


def main():
    base = Image.open(SPRITES / 'body-idle.png').convert('RGBA')
    if '--check' not in sys.argv:
        made = []
        for name, eye, mouth in outputs():
            im = paint(base, eye, mouth)
            im.save(SPRITES / f'{name}.png')
            made.append(im)
        # 미리보기: 기준 + 표정 6종, 4배 확대, 회색 바탕
        faces = [base] + [paint(base, f['eye'], f['mouth']) for f in FACES.values()]
        s, gap = 4, 16
        sheet = Image.new('RGBA', (len(faces) * (base.width * s + gap) + gap, base.height * s + gap * 2), (60, 60, 70, 255))
        for i, im in enumerate(faces):
            big = im.resize((im.width * s, im.height * s), Image.NEAREST)
            sheet.alpha_composite(big, (gap + i * (base.width * s + gap), gap))
        sheet.save(PREVIEW)
        print(f'{len(made)}장 만듦, 미리보기 {PREVIEW.relative_to(ROOT)}')
    bad = check(base)
    if bad:
        print('검사 실패:\n  ' + '\n  '.join(bad))
        sys.exit(1)
    print('검사 통과: 모든 표정 그림이 60×94이고 얼굴 밖 픽셀이 기준 그림과 같다')


if __name__ == '__main__':
    main()
