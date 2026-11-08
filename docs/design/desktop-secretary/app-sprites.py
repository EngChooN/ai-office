"""바탕화면 비서 앱용 캐릭터 그림 만들기·검사 (Pillow 필요: python3 -m pip install pillow)

원본  docs/design/desktop-secretary/sprites/body-{idle,blink}.png (90×127, 이디자 확정본)
결과  app/src/renderer/deskPet/sprites/body-{idle,blink}.png

1. 두 장을 같은 영역(알파 128 초과 픽셀 기준 캐릭터 상자)으로 잘라 투명 여백을 없앤다.
2. 몸통과 떨어진 점(지운 반짝임의 흔적, 알파 1짜리 잡티)을 투명하게 지운다. 두 장에 같은 처리를 한다.
3. 검사: 두 장의 크기가 같고, 네 모서리가 투명하고, 몸통과 떨어진 점이 없고, 눈 영역 밖의 픽셀이 모두 같은지.
4. 표정 그림(sprites/expressions, expression-sprites.py로 만든 것)이 있으면 함께 검사한다.
   - face-{이름}.png: 위 기본 검사 + 평소 그림과 얼굴 영역(FACE) 밖 픽셀이 모두 같은지
   - face-{이름}-blink.png: 같은 표정과 눈 영역 밖이 같고, 눈 영역은 body-blink와 같은지

실행: python3 docs/design/desktop-secretary/app-sprites.py         (만들고 검사)
      python3 docs/design/desktop-secretary/app-sprites.py --check (검사만)
"""

import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'docs/design/desktop-secretary/sprites'
OUT = ROOT / 'app/src/renderer/deskPet/sprites'
EXPR = SRC / 'expressions'
NAMES = ('body-idle', 'body-blink')
# 눈 감기로 바뀌는 영역(잘라 낸 그림 기준, 끝 포함) — 이 밖은 두 장이 픽셀까지 같아야 한다
EYES = (17, 30, 37, 37)
# 표정으로 바뀌는 얼굴 영역(눈썹·눈·입, 끝 포함) — 이 밖은 평소 그림과 픽셀까지 같아야 한다
FACE = (17, 28, 37, 43)


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


def outside(a, b, box):
    """두 그림에서 다른 픽셀 좌표와, 그중 box(끝 포함) 밖에 있는 것"""
    pa, pb, (w, h) = a.load(), b.load(), a.size
    x0, y0, x1, y1 = box
    diff = [(x, y) for y in range(h) for x in range(w) if pa[x, y] != pb[x, y]]
    return diff, [q for q in diff if not (x0 <= q[0] <= x1 and y0 <= q[1] <= y1)]


def basic(n, im, size, errors):
    """크기가 같고, 네 모서리가 투명하고, 몸통과 떨어진 점이 없는지"""
    if im.size != size:
        errors.append(f'{n}: 크기 다름 {im.size} (기준 {size})')
        return False
    w, h = size
    p = im.load()
    if any(p[x, y][3] for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))):
        errors.append(f'{n}: 모서리가 투명하지 않음')
    stray = sum(1 for y in range(h) for x in range(w) if p[x, y][3]) - len(body_pixels(im))
    if stray:
        errors.append(f'{n}: 몸통과 떨어진 점 {stray}개')
    return True


def check_expressions(idle, blink, errors):
    files = sorted(EXPR.glob('face-*.png')) if EXPR.is_dir() else []
    if not files:
        print('표정 그림 없음 — 건너뜀')
        return
    x0, y0, x1, y1 = EYES
    pb = blink.load()
    for f in files:
        n, im = f.stem, Image.open(f).convert('RGBA')
        if not basic(n, im, idle.size, errors):
            continue
        if n.endswith('-blink'):
            base = EXPR / f'{n[:-len("-blink")]}.png'
            if not base.exists():
                errors.append(f'{n}: 짝이 되는 표정 그림 {base.name} 없음')
                continue
            diff, out = outside(Image.open(base).convert('RGBA'), im, EYES)
            p = im.load()
            eyes = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if p[x, y] != pb[x, y]]
            if eyes:
                errors.append(f'{n}: 눈 영역이 body-blink와 {len(eyes)}픽셀 다름 (예: {eyes[:3]})')
            area = '눈'
        else:
            diff, out = outside(idle, im, FACE)
            area = '얼굴'
        if not diff:
            errors.append(f'{n}: 비교 대상과 같은 그림')
        if out:
            errors.append(f'{n}: {area} 영역 밖 픽셀 {len(out)}개 다름 (예: {out[:3]})')
        print(f'{n}: 다른 픽셀 {len(diff)}개 ({area} 영역 안이어야 함)')


def check():
    idle, blink = (Image.open(OUT / f'{n}.png').convert('RGBA') for n in NAMES)
    errors = []
    for n, im in zip(NAMES, (idle, blink)):
        basic(n, im, idle.size, errors)
    w, h = idle.size
    diff, out = outside(idle, blink, EYES)
    if not diff:
        errors.append('눈 감기 그림이 평소 그림과 같음')
    if out:
        errors.append(f'눈 영역 밖 픽셀 {len(out)}개 다름 (예: {out[:3]})')
    print(f'크기 {w}×{h}, 다른 픽셀 {len(diff)}개 (모두 눈 영역 안이어야 함)')
    check_expressions(idle, blink, errors)
    for e in errors:
        print('실패:', e)
    print('통과' if not errors else '실패')
    return not errors


if __name__ == '__main__':
    if '--check' not in sys.argv:
        make()
    sys.exit(0 if check() else 1)
