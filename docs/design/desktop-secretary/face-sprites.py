"""바탕화면 비서 표정 그림 만들기·검사 (Pillow 필요: python3 -m pip install pillow)

기준  app/src/renderer/deskPet/sprites/body-idle.png (60×94, 확정본)
결과  app/src/renderer/deskPet/sprites/face-{표정}.png, face-{표정}-blink.png (눈 감은 그림이 있는 표정만)
      docs/design/desktop-secretary/expression-preview.png (표정별 4배 미리보기)

방향은 expression-concept.png(이디자 시안, 대표 확인). 기준 그림의 두 눈 칸(5×8)을 피부색으로 지운 뒤
눈·눈썹을 다시 그리고, 입 칸(5×3)에 입을 그린다. (v2: 아래 COLORS 위 설명 참고) 그 밖의 픽셀은 기준 그림과 같아야 한다.

실행: python3 docs/design/desktop-secretary/face-sprites.py         (만들고 검사)
      python3 docs/design/desktop-secretary/face-sprites.py --check (검사만)
"""

import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / 'app/src/renderer/deskPet/sprites'
PREVIEW = ROOT / 'docs/design/desktop-secretary/expression-preview.png'

# 기준 그림 기준 좌표 (끝 포함). 눈은 왼쪽·오른쪽 각 5×9 (38줄은 밑 그림자), 입은 얼굴 가운데 5×3
EYE_L, EYE_R, EYE_TOP = 17, 33, 30
MOUTH_X, MOUTH_Y = 25, 40
FACE = (17, 30, 37, 42)  # 바뀌어도 되는 영역 — 이 밖은 기준 그림과 픽셀까지 같아야 한다

# v2(2026-11-01, 대표 선택 A-1 '또렷하게'): v1의 1칸 선 눈·순백 빛점이 도트 그림과 어울리지 않아,
# 평소 눈의 실제 색(기준 그림에서 뽑음)과 2칸 이상 두께만 쓴다. 시안 비교는 face-sprites-v3.py
_base = Image.open(SPRITES / 'body-idle.png').convert('RGBA').load()
COLORS = {
    '.': _base[24, 34],                                          # 피부 (두 눈 사이)
    'A': _base[17, 32], 'K': _base[19, 32], 'G': _base[21, 32],  # 위 어두운 칸: 바깥·가운데·안쪽 회색 테두리
    'B': _base[17, 35], 'N': _base[19, 35], 'H': _base[21, 35],  # 아래 남색 칸
    'S': _base[18, 38],                                          # 밑 그림자
    'm': (0xec, 0xb4, 0xa0, 254),  # 입 가장자리 옅은 색
    'D': (0xb8, 0x62, 0x5c, 254),  # 입 선
    'p': (0xe8, 0x8a, 0x86, 254),  # 입 안
}
LID = [_base[17 + i, 30] for i in range(5)]  # 평소 위 눈꺼풀 줄 (칸마다 색이 다르다) — 'L'

# 왼쪽 눈 9줄, 0번 칸이 바깥쪽. 오른쪽 눈은 'eyeR'이 없으면 좌우를 뒤집어 그린다 (있으면 그것도 0번이 바깥쪽)
CLOSED = ['.....', '.....', '.....', '.....', '.....', 'AKKKG', 'AKKKG', '.....', 'SSSS.']
FACES = {
    'surprised': {  # 놀람: 위 눈꺼풀이 올라가 커진 눈 + 'o' 입
        'eye': ['.....', 'AKKKG', 'AKKKG', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.'],
        'blink': None,
        'mouth': ['.mDm.', '.D.D.', '.mDm.'],
    },
    'thinking': {  # 생각 중: 두 눈이 위·같은 쪽을 본다 + 한쪽으로 다문 입
        'eye': ['LLLLL', 'AKKG.', 'AKKG.', 'BNNH.', 'BNNH.', '.....', '.....', '.....', 'SSSS.'],
        'eyeR': ['LLLLL', '.AKKG', '.AKKG', '.BNNH', '.BNNH', '.....', '.....', '.....', 'SSSS.'],
        'blink': CLOSED,
        'mouth': ['.....', '...DD', '.....'],
    },
    'happy': {  # 기쁨: 두꺼운 ∩ 눈 + 벌린 웃는 입
        'eye': ['.....', '.....', '.AKG.', 'AKKKG', 'AG.GK', 'S...S', '.....', '.....', '.....'],
        'blink': None,
        'mouth': ['.....', 'DDDDD', '.DpD.'],
    },
    'worried': {  # 걱정: 안쪽이 올라간 눈썹 + 작은 눈 + 처진 입
        'eye': ['...GG', 'AGG..', '.....', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', '.....', 'SSSS.'],
        'blink': ['...GG', 'AGG..', '.....', '.....', '.....', 'AKKKG', 'AKKKG', '.....', 'SSSS.'],
        'mouth': ['.....', '.DDD.', 'D...D'],
    },
    'sleepy': {  # 졸림: 반쯤 감은 눈 + 작게 벌린 입
        'eye': ['.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'],
        'blink': CLOSED,
        'mouth': ['.....', '.mDm.', '.....'],
    },
    'focused': {  # 집중: 안쪽이 내려간 눈썹 + 또렷한 눈 + 다문 입
        'eye': ['AG...', '..AKG', '.....', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'],
        'blink': ['AG...', '..AKG', '.....', '.....', '.....', 'AKKKG', 'AKKKG', '.....', 'SSSS.'],
        'mouth': ['.....', '.DDD.', '.....'],
    },
}


def color(ch, i):
    return LID[i] if ch == 'L' else COLORS[ch]


def paint(base, eye, mouth, eye_r=None):
    im = base.copy()
    p = im.load()
    eye_r = eye_r or eye
    for y in range(len(eye)):
        for i in range(5):
            p[EYE_L + i, EYE_TOP + y] = color(eye[y][i], i)
            p[EYE_R + 4 - i, EYE_TOP + y] = color(eye_r[y][i], i)
    for y, row in enumerate(mouth):
        for x, ch in enumerate(row):
            if ch != '.':
                p[MOUTH_X + x, MOUTH_Y + y] = COLORS[ch]
    return im


def outputs():
    for name, f in FACES.items():
        yield f'face-{name}', f['eye'], f['mouth'], f.get('eyeR')
        if f['blink']:
            yield f'face-{name}-blink', f['blink'], f['mouth'], None


def check(base):
    w, h = base.size
    bp = base.load()
    x0, y0, x1, y1 = FACE
    bad = []
    for name, *_ in outputs():
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
        for name, eye, mouth, eye_r in outputs():
            im = paint(base, eye, mouth, eye_r)
            im.save(SPRITES / f'{name}.png')
            made.append(im)
        # 미리보기: 기준 + 표정 6종, 4배 확대, 회색 바탕
        faces = [base] + [paint(base, f['eye'], f['mouth'], f.get('eyeR')) for f in FACES.values()]
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
