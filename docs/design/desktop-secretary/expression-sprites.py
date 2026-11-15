"""바탕화면 비서 표정 그림 만들기 (Pillow 필요: python3 -m pip install pillow)

원본  app/src/renderer/deskPet/sprites/body-idle.png (60×94, 앱이 쓰는 확정본)
결과  docs/design/desktop-secretary/sprites/expressions/
  face-{이름}.png          표정 6종 (60×94, 원본과 같은 캔버스·위치, 얼굴 밖 픽셀은 원본 그대로)
  face-{이름}-blink.png    오래 유지되는 표정(생각 중·집중·졸림)의 눈 감은 프레임
  preview-{112,160}@2x.png 평소·표정·눈 감은 프레임을 앱 크기(높이 112·160px, 폭 = 높이 × 72/112)의 2배로 늘어놓은 그림

얼굴은 원본 위에 아래 글자 그림을 덮어 그린다. 글자 하나가 픽셀 하나이고, '.'은 원본 픽셀을 그대로 둔다.
  - 눈: 왼쪽 눈(x 17~21, y 28~38) 기준으로 그리고, 오른쪽 눈(x 33~37)에는 좌우를 뒤집어 그린다.
  - 입: x 25~29, y 40~43
그린 뒤 app-sprites.py --check 로 얼굴 영역(FACE) 밖 픽셀이 원본과 같은지 검사한다.

실행: /path/to/python3 docs/design/desktop-secretary/expression-sprites.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'app/src/renderer/deskPet/sprites/body-idle.png'
OUT = ROOT / 'docs/design/desktop-secretary/sprites/expressions'
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

COLORS = {
    's': (0xfd, 0xd9, 0xb2),  # 피부 (원본 얼굴 바탕색)
    'h': (0xd5, 0xbd, 0xa3),  # 눈 밑 그늘 (원본 y 38)
    'D': (0x1b, 0x1e, 0x34),  # 눈 감은 선 (body-blink 과 같은 색)
    'K': (0x05, 0x08, 0x1e),  # 눈동자 진한 부분
    'P': (0x2a, 0x2e, 0x46),  # 눈동자 아래 부분
    'W': (0xff, 0xff, 0xff),  # 눈 반짝임
    'B': (0x5a, 0x34, 0x18),  # 눈썹
    'M': (0x7b, 0x34, 0x34),  # 입 선
    'R': (0xe8, 0x60, 0x6a),  # 입 안
}
EYE_LEFT, EYE_RIGHT, EYE_TOP = 17, 33, 28  # 눈 그림 왼쪽 위 (오른쪽 눈은 뒤집어 그린다)
MOUTH_LEFT, MOUTH_TOP = 25, 40

# 눈 그림: 11줄(y 28~38) × 5칸. 위 두 줄은 눈썹 자리(x 20·21은 머리카락 위)
EYES = {
    'closed': [  # body-blink 과 같은 감은 눈
        '.....', '.....', 'sssss', 'sssss', 'sssss', 'sssss', 'sssss', 'DDDDD', 'DDDDD', 'sssss', '.....',
    ],
    'surprised': [  # 동그랗게 뜬 눈 + 반짝임 두 개
        '.....', '.....', '.....', '.WW..', '.WW..', '.....', '...W.', '.....', '.....', '.....', '.....',
    ],
    'thinking': [  # 위를 올려다보는 눈 (아래를 줄이고 반짝임은 위쪽)
        '.....', '.....', '.....', '...W.', '.....', '.....', '.....', 'hhhhh', 'sssss', 'sssss', 'sssss',
    ],
    'happy': [  # 웃어서 감긴 ^ 눈
        '.....', '.....', 'sssss', 'sssss', 'sssss', 'sDDDs', 'DDsDD', 'DsssD', 'sssss', 'sssss', 'sssss',
    ],
    'worried': [  # 안쪽이 올라간 눈썹 + 반짝임
        '...BB', 'BBB..', '.....', '.W...', '.....', '.....', '.....', '.....', '.....', '.....', '.....',
    ],
    'sleepy': [  # 반쯤 감긴 눈 (위는 눈꺼풀, 아래 눈동자만 보임)
        '.....', '.....', 'sssss', 'sssss', 'sssss', 'sssss', 'DDDDD', '.....', '.....', '.....', '.....',
    ],
    'focused': [  # 안쪽이 내려간 눈썹 + 위가 비스듬한 눈
        'BB...', '..BBB', '.....', '...ss', '....s', '.....', '.....', '.....', '.....', '.....', '.....',
    ],
}
# 입 그림: 4줄(y 40~43) × 5칸
MOUTHS = {
    'none': ['.....', '.....', '.....', '.....'],
    'o': ['.....', '..M..', '.MRM.', '..M..'],
    'side': ['.....', '.....', '...MM', '.....'],
    'smile': ['.....', 'MMMMM', 'MRRRM', '.MMM.'],
    'frown': ['.....', '.MMM.', 'M...M', '.....'],
    'small': ['.....', '.....', '..MM.', '.....'],
    'flat': ['.....', '.....', '.MMM.', '.....'],
}
# 이름: (한국어 이름, 눈, 입, 눈 감은 프레임 필요 여부)
FACES = {
    'surprised': ('놀람', 'surprised', 'o', False),
    'thinking': ('생각 중', 'thinking', 'side', True),
    'happy': ('기쁨', 'happy', 'smile', False),
    'worried': ('걱정', 'worried', 'frown', False),
    'sleepy': ('졸림', 'sleepy', 'small', True),
    'focused': ('집중', 'focused', 'flat', True),
}


def paint(im, art, left, top, mirror=False):
    p = im.load()
    for dy, row in enumerate(art):
        for dx, ch in enumerate(row[::-1] if mirror else row):
            if ch != '.':
                p[left + dx, top + dy] = COLORS[ch] + (255,)


def face(base, eyes, mouth='none'):
    im = base.copy()
    paint(im, EYES[eyes], EYE_LEFT, EYE_TOP)
    paint(im, EYES[eyes], EYE_RIGHT, EYE_TOP, mirror=True)
    paint(im, MOUTHS[mouth], MOUTH_LEFT, MOUTH_TOP)
    return im


def make():
    base = Image.open(SRC).convert('RGBA')
    OUT.mkdir(parents=True, exist_ok=True)
    frames = [('평소', base)]
    for name, (label, eyes, mouth, blink) in FACES.items():
        im = face(base, eyes, mouth)
        im.save(OUT / f'face-{name}.png', optimize=True)
        frames.append((label, im))
        if blink:
            closed = face(im, 'closed')  # 표정 위에 감은 눈만 덧그린다 (눈썹·입은 그대로)
            closed.save(OUT / f'face-{name}-blink.png', optimize=True)
            frames.append((f'{label}\n눈 감음', closed))
    for size in (112, 160):
        preview(frames, size).save(OUT / f'preview-{size}@2x.png', optimize=True)
    print('만듦', len(frames) - 1, '장 →', OUT.relative_to(ROOT))


def preview(frames, size, dpr=2):
    """앱 크기 그대로(높이 size, 폭 size×72/112) 2배로 늘어놓은 그림. 위는 그림 전체, 아래는 얼굴 확대"""
    w, h = round(size * 72 / 112) * dpr, size * dpr
    gap, label_h = 16 * dpr, 34 * dpr
    zoom = 6 * dpr  # 얼굴 확대 배율 (원본 1픽셀 = 화면 6px)
    crop = (12, 25, 43, 47)
    zw, zh = (crop[2] - crop[0]) * zoom, (crop[3] - crop[1]) * zoom
    cell = max(w, zw)
    sheet = Image.new('RGBA', (gap + len(frames) * (cell + gap), gap + h + gap + zh + label_h + gap), (245, 246, 248, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 11 * dpr)
    for i, (label, im) in enumerate(frames):
        x = gap + i * (cell + gap)
        sheet.alpha_composite(im.resize((w, h), Image.NEAREST), (x + (cell - w) // 2, gap))
        sheet.alpha_composite(im.crop(crop).resize((zw, zh), Image.NEAREST), (x + (cell - zw) // 2, gap + h + gap))
        draw.multiline_text((x + cell / 2, gap + h + gap + zh + 6 * dpr), label, font=font, fill=(30, 32, 36), anchor='ma', align='center')
    return sheet


if __name__ == '__main__':
    make()
