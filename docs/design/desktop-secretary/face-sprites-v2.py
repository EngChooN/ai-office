"""바탕화면 비서 표정 v2 시안 (앱 그림은 바꾸지 않는다 — 대표가 고른 뒤 face-sprites.py에 옮긴다)

v1이 이질적이던 이유: 평소 눈은 4~5칸 두께의 블록에 부드러운 가장자리(회색 테두리·남색 아래쪽·밑 그림자)인데,
v1 표정은 1칸 가는 선·순백 빛점·진한 5칸 입이라 화풍이 달랐다.
v2는 평소 눈의 실제 픽셀 색(기준 그림에서 뽑음)과 2칸 이상 두께만 쓰고, 입은 3칸 이하·옅은 색으로 둔다.

결과  docs/design/desktop-secretary/review/expressions-v2-sheet.png (4배 + 1배 줄, 얼굴 밖 동일성 검사)
실행  python3 docs/design/desktop-secretary/face-sprites-v2.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / 'app/src/renderer/deskPet/sprites'
OUT = ROOT / 'docs/design/desktop-secretary/review/expressions-v2-sheet.png'

EYE_L, EYE_R, TOP = 17, 33, 30  # 눈 칸 5×9 (30~38줄, 38줄은 밑 그림자)
MOUTH_X, MOUTH_Y = 25, 40       # 입 칸 5×3 (가운데 27)
FACE = (17, 30, 37, 42)

base = Image.open(SPRITES / 'body-idle.png').convert('RGBA')
bp = base.load()
# 평소 왼쪽 눈에서 색을 뽑는다 (x 17~21, 0번이 바깥쪽·4번이 안쪽)
C = {
    '.': bp[24, 34],             # 피부 (두 눈 사이)
    'A': bp[17, 32], 'K': bp[19, 32], 'G': bp[21, 32],   # 위 어두운 칸: 바깥·가운데·안쪽 회색 테두리
    'B': bp[17, 35], 'N': bp[19, 35], 'H': bp[21, 35],   # 아래 남색 칸
    'S': bp[18, 38],             # 밑 그림자
    'M': (0xd9, 0x8c, 0x82, 254),  # 입 (볼 색보다 조금 진하게)
    'm': (0xec, 0xb4, 0xa0, 254),  # 입 가장자리 옅은 색
}
LID = [bp[17 + i, 30] for i in range(5)]  # 평소 위 눈꺼풀 줄 (칸마다 색이 다르다) — 'L'

IDLE = ['LLLLL', 'AKKKG', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.']
CLOSED = ['.....', '.....', '.....', '.....', '.....', 'AKKKG', 'AKKKG', '.....', 'SSSS.']

# 표정: 이름 → (안, 설명, 왼쪽 눈 9줄, 입 3줄). 오른쪽 눈은 좌우를 뒤집는다 ('look'은 두 눈을 같은 쪽으로 민다)
FACES = [
    ('surprised', 'A', '놀람: 위 눈꺼풀이 올라가 눈이 커짐',
     ['.....', 'AKKKG', 'AKKKG', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.'], ['..m..', '.mMm.', '..m..']),
    ('surprised', 'B', '놀람: 눈동자가 작아짐(동그란 점)',
     ['.....', '.....', '.AKG.', '.AKG.', '.BNH.', '.BNH.', '.....', '.....', 'SSSS.'], ['.....', '.MM..', '.MM..']),
    ('thinking', 'A', '생각: 눈동자를 위·한쪽으로',
     ['LLLLL', 'AKKG.', 'AKKG.', 'BNNH.', 'BNNH.', '.....', '.....', '.....', 'SSSS.'], ['.....', '...Mm', '.....']),
    ('thinking', 'B', '생각: 눈을 살짝 가늘게 + 위로',
     ['.....', 'LLLLL', 'AKKKG', 'AKKKG', 'BNNNH', '.....', '.....', '.....', 'SSSS.'], ['.....', '..MM.', '.....']),
    ('happy', 'A', '기쁨: 두꺼운 ∩ 눈',
     ['.....', '.....', '.AKG.', 'AKGAK', 'AG.GK', 'S...S', '.....', '.....', '.....'], ['.....', 'mMMMm', '.mMm.']),
    ('happy', 'B', '기쁨: 눈 아래가 볼에 밀려 올라감',
     ['LLLLL', 'AKKKG', 'AKKKG', 'BNNNH', 'SSSS.', '.....', '.....', '.....', '.....'], ['.....', '.M.M.', '..M..']),
    ('worried', 'A', '걱정: 안쪽 눈썹 올리고 눈 작게',
     ['...GG', 'AGG..', '.....', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], ['.....', '.mMm.', 'm...m']),
    ('worried', 'B', '걱정: 눈썹 없이 눈만 처지게',
     ['.....', '.....', 'LLLLL', 'AKKKG', 'BNNNH', 'BNNNH', '.BNH.', '.....', 'SSSS.'], ['.....', '.MMM.', '.....']),
    ('focused', 'A', '집중: 안쪽 눈썹 내리고 또렷한 눈',
     ['AG...', '..AKG', '.....', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], ['.....', '.mMm.', '.....']),
    ('focused', 'B', '집중: 위 눈꺼풀 내려 반쯤 일자',
     ['.....', '.....', 'AKKKG', 'AKKKG', 'BNNNH', 'BNNNH', 'BNNNH', 'BNNNH', 'SSSS.'], ['.....', '..M..', '.....']),
    ('sleepy', 'A', '졸음: 반쯤 감은 눈',
     ['.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', 'BNNNH', '.....', 'SSSS.'], ['.....', '..M..', '.....']),
    ('sleepy', 'B', '졸음: 거의 감은 눈 + 하품 입',
     ['.....', '.....', '.....', '.....', '.....', 'AKKKG', 'BNNNH', '.....', 'SSSS.'], ['..m..', '.mMm.', '..m..']),
]
LABEL = {'surprised': '놀람', 'thinking': '생각', 'happy': '기쁨', 'worried': '걱정', 'focused': '집중', 'sleepy': '졸음'}


def color(ch, i):
    return LID[i] if ch == 'L' else C[ch]


def paint(eye, mouth):
    im = base.copy()
    p = im.load()
    for y, row in enumerate(eye):
        for i, ch in enumerate(row):
            p[EYE_L + i, TOP + y] = color(ch, i)
            p[EYE_R + 4 - i, TOP + y] = color(ch, i)
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
    f = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 20)
    fs = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 15)
    S, W, H = 4, base.width * 4, base.height * 4
    pad, lab, small = 24, 70, base.height + 16
    rows = [[('평소 (기준)', '', base)] + [(f'{LABEL[n]} {v}안', d.split(': ')[1], paint(e, m)) for n, v, d, e, m in FACES if v == ver] for ver in 'AB']
    cols = 7
    sheet = Image.new('RGB', (pad + cols * (W + pad), pad + len(rows) * (H + lab + small + pad)), (236, 238, 242))
    dr = ImageDraw.Draw(sheet)
    bad = []
    for r, row in enumerate(rows):
        for c, (title, desc, im) in enumerate(row):
            if not outside_same(im):
                bad.append(title)
            x, y = pad + c * (W + pad), pad + r * (H + lab + small + pad)
            dr.rounded_rectangle([x - 6, y - 6, x + W + 6, y + H + lab + small], 12, fill=(255, 255, 255))
            big = im.resize((W, H), Image.NEAREST)
            sheet.paste(big, (x, y), big)
            dr.text((x + W / 2, y + H + 18), title, font=f, fill=(30, 30, 40), anchor='mm')
            dr.text((x + W / 2, y + H + 44), desc, font=fs, fill=(90, 90, 100), anchor='mm')
            sheet.paste(im, (x + W // 2 - base.width // 2, y + H + lab - 6), im)  # 1배 실제 크기
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print('저장', OUT.relative_to(ROOT))
    print('얼굴 밖 검사:', '통과' if not bad else f'실패 {bad}')


if __name__ == '__main__':
    main()
