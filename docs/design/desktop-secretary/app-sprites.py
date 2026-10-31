"""바탕화면 비서 앱용 캐릭터 그림 만들기·검사 (Pillow 필요: python3 -m pip install pillow)

원본  docs/design/desktop-secretary/sprites/body-{idle,blink}.png (90×127, 이디자 확정본)
결과  app/src/renderer/deskPet/sprites/body-{idle,blink}.png

1. 두 장을 같은 영역(알파 128 초과 픽셀 기준 캐릭터 상자)으로 잘라 투명 여백을 없앤다.
2. 몸통과 떨어진 점(지운 반짝임의 흔적, 알파 1짜리 잡티)을 투명하게 지운다. 두 장에 같은 처리를 한다.
3. 검사: 두 장의 크기가 같고, 네 모서리가 투명하고, 몸통과 떨어진 점이 없고, 눈 영역 밖의 픽셀이 모두 같은지.

실행: python3 docs/design/desktop-secretary/app-sprites.py         (만들고 검사)
      python3 docs/design/desktop-secretary/app-sprites.py --check (검사만)
"""

import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'docs/design/desktop-secretary/sprites'
OUT = ROOT / 'app/src/renderer/deskPet/sprites'
NAMES = ('body-idle', 'body-blink')
# 눈 감기로 바뀌는 영역(잘라 낸 그림 기준, 끝 포함) — 이 밖은 두 장이 픽셀까지 같아야 한다
EYES = (17, 30, 37, 37)


def body_pixels(im):
    """가장 큰 덩어리(몸통)에 속한 보이는 픽셀 좌표"""
    p, (w, h) = im.load(), im.size
    seen, best = set(), []
    for y in range(h):
        for x in range(w):
            if p[x, y][3] == 0 or (x, y) in seen:
                continue
            stack, part = [(x, y)], []
            seen.add((x, y))
            while stack:
                a, b = stack.pop()
                part.append((a, b))
                for q in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= q[0] < w and 0 <= q[1] < h and q not in seen and p[q][3] > 0:
                        seen.add(q)
                        stack.append(q)
            if len(part) > len(best):
                best = part
    return set(best)


def make():
    ims = [Image.open(SRC / f'{n}.png').convert('RGBA') for n in NAMES]
    boxes = [im.getchannel('A').point(lambda v: 255 if v > 128 else 0).getbbox() for im in ims]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    OUT.mkdir(parents=True, exist_ok=True)
    for n, im in zip(NAMES, ims):
        im = im.crop(box)
        keep, p = body_pixels(im), im.load()
        for y in range(im.size[1]):
            for x in range(im.size[0]):
                if (x, y) not in keep:
                    p[x, y] = (0, 0, 0, 0)
        im.save(OUT / f'{n}.png', optimize=True)
    print('만듦', box, '→', ims[0].crop(box).size)


def check():
    idle, blink = (Image.open(OUT / f'{n}.png').convert('RGBA') for n in NAMES)
    errors = []
    if idle.size != blink.size:
        errors.append(f'크기 다름 {idle.size} {blink.size}')
    w, h = idle.size
    for n, im in zip(NAMES, (idle, blink)):
        p = im.load()
        if any(p[x, y][3] for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))):
            errors.append(f'{n}: 모서리가 투명하지 않음')
        stray = sum(1 for y in range(h) for x in range(w) if p[x, y][3]) - len(body_pixels(im))
        if stray:
            errors.append(f'{n}: 몸통과 떨어진 점 {stray}개')
    a, b = idle.load(), blink.load()
    x0, y0, x1, y1 = EYES
    diff = [(x, y) for y in range(h) for x in range(w) if a[x, y] != b[x, y]]
    outside = [q for q in diff if not (x0 <= q[0] <= x1 and y0 <= q[1] <= y1)]
    if not diff:
        errors.append('눈 감기 그림이 평소 그림과 같음')
    if outside:
        errors.append(f'눈 영역 밖 픽셀 {len(outside)}개 다름 (예: {outside[:3]})')
    print(f'크기 {w}×{h}, 다른 픽셀 {len(diff)}개 (모두 눈 영역 안이어야 함)')
    for e in errors:
        print('실패:', e)
    print('통과' if not errors else '실패')
    return not errors


if __name__ == '__main__':
    if '--check' not in sys.argv:
        make()
    sys.exit(0 if check() else 1)
