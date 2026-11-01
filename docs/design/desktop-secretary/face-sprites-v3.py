"""바탕화면 비서 표정 v3 시안: v2 A안을 기준으로 세 갈래 (앱 그림은 바꾸지 않는다)

A    v2 A안 그대로
A-1  또렷하게: 입 색을 진하게·크게, ∩ 눈 두껍게, 생각은 두 눈이 같은 쪽을 본다
A-2  반짝임: 눈에 옅은 빛 한 점(순백 아님), 기쁨은 눈 밑 볼 홍조
A-3  크게: 눈썹·입을 과장하고 생각·졸음은 두 눈을 다르게

결과  docs/design/desktop-secretary/review/expressions-v3-sheet.png (4배 + 1배, 얼굴 밖 동일성 검사)
실행  python3 docs/design/desktop-secretary/face-sprites-v3.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / 'app/src/renderer/deskPet/sprites'
OUT = ROOT / 'docs/design/desktop-secretary/review/expressions-v3-sheet.png'

EYE_L, EYE_R, TOP = 17, 33, 30  # 눈 칸 5×9 (30~38줄, 38줄은 밑 그림자). 0번 칸이 바깥쪽
MOUTH_X, MOUTH_Y = 25, 40       # 입 칸 5×3
FACE = (17, 30, 37, 42)

base = Image.open(SPRITES / 'body-idle.png').convert('RGBA')
bp = base.load()
C = {
    '.': bp[24, 34],
    'A': bp[17, 32], 'K': bp[19, 32], 'G': bp[21, 32],
    'B': bp[17, 35], 'N': bp[19, 35], 'H': bp[21, 35],
    'S': bp[18, 38],
    'W': (0x8e, 0x93, 0xb0, 254),  # 눈 빛 (옅은 남회색)
    'P': bp[16, 40],               # 볼 홍조 (기준 볼 색)
    'M': (0xd9, 0x8c, 0x82, 254),  # 옅은 입
    'm': (0xec, 0xb4, 0xa0, 254),
    'D': (0xb8, 0x62, 0x5c, 254),  # 진한 입
    'p': (0xe8, 0x8a, 0x86, 254),  # 입 안
}
LID = [bp[17 + i, 30] for i in range(5)]

# (이름, 왼쪽 눈, 오른쪽 눈(None이면 왼쪽을 좌우로 뒤집음 — 오른쪽 눈도 0번이 바깥쪽), 입)
SETS = {
    'A': [
        ('놀람', ['.....', 'AKKKG', 'AKKKG', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.'], None, ['..m..', '.mMm.', '..m..']),
        ('생각', ['LLLLL', 'AKKG.', 'AKKG.', 'BNNH.', 'BNNH.', '.....', '.....', '.....', 'SSSS.'], None, ['.....', '...Mm', '.....']),
        ('기쁨', ['.....', '.....', '.AKG.', 'AKGAK', 'AG.GK', 'S...S', '.....', '.....', '.....'], None, ['.....', 'mMMMm', '.mMm.']),
        ('걱정', ['...GG', 'AGG..', '.....', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '.mMm.', 'm...m']),
        ('집중', ['AG...', '..AKG', '.....', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '.mMm.', '.....']),
        ('졸음', ['.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '..M..', '.....']),
    ],
    'A-1': [
        ('놀람', ['.....', 'AKKKG', 'AKKKG', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.'], None, ['.mDm.', '.D.D.', '.mDm.']),
        ('생각', ['LLLLL', 'AKKG.', 'AKKG.', 'BNNH.', 'BNNH.', '.....', '.....', '.....', 'SSSS.'],
                 ['LLLLL', '.AKKG', '.AKKG', '.BNNH', '.BNNH', '.....', '.....', '.....', 'SSSS.'], ['.....', '...DD', '.....']),
        ('기쁨', ['.....', '.....', '.AKG.', 'AKKKG', 'AG.GK', 'S...S', '.....', '.....', '.....'], None, ['.....', 'DDDDD', '.DpD.']),
        ('걱정', ['...GG', 'AGG..', '.....', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '.DDD.', 'D...D']),
        ('집중', ['AG...', '..AKG', '.....', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '.DDD.', '.....']),
        ('졸음', ['.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '.mDm.', '.....']),
    ],
    'A-2': [
        ('놀람', ['.....', 'AKWKG', 'AKKKG', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.'], None, ['..m..', '.mMm.', '..m..']),
        ('생각', ['LLLLL', 'AWKG.', 'AKKG.', 'BNNH.', 'BNNH.', '.....', '.....', '.....', 'SSSS.'], None, ['.....', '...Mm', '.....']),
        ('기쁨', ['.....', '.....', '.AKG.', 'AKGAK', 'AG.GK', '.....', 'PP...', '.....', '.....'], None, ['.....', 'mMMMm', '.mMm.']),
        ('걱정', ['...GG', 'AGG..', '.....', 'AKWKG', 'BNNNH', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '.mMm.', 'm...m']),
        ('집중', ['AG...', '..AKG', '.....', 'AKKWG', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '.mMm.', '.....']),
        ('졸음', ['.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', '..M..', '.....']),
    ],
    'A-3': [
        ('놀람', ['.GGG.', '.....', 'AKKKG', 'AKWKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.'], None, ['..D..', '.DpD.', '..D..']),
        ('생각', ['GG...', '..GG.', 'AKKG.', 'AKKG.', 'BNNH.', 'BNNH.', '.....', '.....', 'SSSS.'],
                 ['.....', '.....', '.....', '.....', 'LLLLL', '.AKKG', '.BNNH', '.....', 'SSSS.'], ['.....', '...DD', '.....']),
        ('기쁨', ['.....', '.....', '.AKG.', 'AKKKG', 'AG.GK', '.....', 'PP...', '.....', '.....'], None, ['mDDDm', '.DpD.', '..D..']),
        ('걱정', ['...GG', '.GG..', 'G....', 'AKWKG', 'BNNNH', 'BNNNH', '.BNH.', '.....', 'SSSS.'], None, ['.....', '.D.D.', 'D.D.D']),
        ('집중', ['GG...', '..GGG', '.....', 'LLLLL', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], None, ['.....', 'DDDD.', '.....']),
        ('졸음', ['.....', '.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', '.....', 'SSSS.'],
                 ['.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], ['.....', '.mDm.', '..m..']),
    ],
}
DESC = {'A': '이전 A안', 'A-1': '또렷하게 (진한 입·굵은 선)', 'A-2': '반짝임 (눈 빛·볼 홍조)', 'A-3': '크게 (눈썹·입 과장, 짝눈)'}


def color(ch, i):
    return LID[i] if ch == 'L' else C[ch]


def paint(left, right, mouth):
    im = base.copy()
    p = im.load()
    right = right or left
    for y in range(9):
        for i in range(5):
            p[EYE_L + i, TOP + y] = color(left[y][i], i)
            p[EYE_R + 4 - i, TOP + y] = color(right[y][i], i)
    for y, row in enumerate(mouth):
        for x, ch in enumerate(row):
            if ch != '.':
                p[MOUTH_X + x, MOUTH_Y + y] = C[ch]
    return im


def outside_same(im):
    p = im.load()
    x0, y0, x1, y1 = FACE
    return all(p[x, y] == bp[x, y] for y in range(base.height) for x in range(base.width) if not (x0 <= x <= x1 and y0 <= y <= y1))


def main():
    font = lambda n: ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', n)
    f, fb = font(20), font(24)
    S = 5
    cw, ch = 29 * S, 22 * S  # 얼굴 부분만 5배 (13~41, 24~45)
    pad, head, lab, small = 18, 200, 34, base.height + 10
    cols = 7
    sheet = Image.new('RGB', (head + cols * (cw + pad) + pad, pad + len(SETS) * (ch + lab + small + pad)), (236, 238, 242))
    dr = ImageDraw.Draw(sheet)
    bad = []
    for r, (key, faces) in enumerate(SETS.items()):
        y = pad + r * (ch + lab + small + pad)
        dr.text((pad, y + 30), key, font=fb, fill=(30, 30, 40))
        dr.multiline_text((pad, y + 70), DESC[key].replace(' (', '\n('), font=font(16), fill=(90, 90, 100))
        items = [('평소', base)] + [(n, paint(l, rr, m)) for n, l, rr, m in faces]
        for c, (name, im) in enumerate(items):
            if not outside_same(im):
                bad.append(f'{key} {name}')
            x = head + c * (cw + pad)
            dr.rounded_rectangle([x - 4, y - 4, x + cw + 4, y + ch + lab + small], 10, fill=(255, 255, 255))
            big = im.crop((13, 24, 42, 46)).resize((cw, ch), Image.NEAREST)
            sheet.paste(big, (x, y), big)
            dr.text((x + cw / 2, y + ch + 18), name, font=f, fill=(30, 30, 40), anchor='mm')
            sheet.paste(im, (x + cw // 2 - base.width // 2, y + ch + lab), im)  # 1배 실제 크기
    sheet.save(OUT)
    print('저장', OUT.relative_to(ROOT))
    print('얼굴 밖 검사:', '통과' if not bad else f'실패 {bad}')


if __name__ == '__main__':
    main()
