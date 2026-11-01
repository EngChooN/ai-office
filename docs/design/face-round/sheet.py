"""grids.json → 비교 그림 두 장.
face-round-compare.png : 시안(행) × 외모·방향(열), 머리 부분 8배 확대
face-round-actual.png  : 앱 실제 크기(1배)와 2배를 사무실 바닥색 위에 나란히
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, 'grids.json')))
BG = (236, 232, 222)
FLOOR = (206, 196, 176)
INK = (46, 42, 64)


def font(size):
    for p in ['/System/Library/Fonts/AppleSDGothicNeo.ttc', '/System/Library/Fonts/Supplemental/AppleGothic.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def sprite(cell, scale, y0=0, y1=None, grid=False):
    w, h, p = cell['w'], cell['h'], cell['p']
    y1 = h if y1 is None else y1
    im = Image.new('RGBA', (w * scale, (y1 - y0) * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(y0, y1):
        for x in range(w):
            c = p[y * w + x]
            if c:
                d.rectangle([x * scale, (y - y0) * scale, (x + 1) * scale - 1, (y - y0 + 1) * scale - 1], fill=rgb(c))
    if grid and scale >= 6:
        for x in range(w + 1):
            d.line([(x * scale, 0), (x * scale, im.height)], fill=(0, 0, 0, 22))
        for y in range(y1 - y0 + 1):
            d.line([(0, y * scale), (im.width, y * scale)], fill=(0, 0, 0, 22))
    return im


# ── 1) 확대 비교: 머리~어깨(0~15행) 8배 ──
Z = 8
HEAD = (0, 15)
cw = 16 * Z + 12
ch = (HEAD[1] - HEAD[0]) * Z
looks, dirs, vs = data['looks'], data['dirs'], data['variants']
cols = len(looks) * len(dirs)
LEFT, TOP = 250, 96
W = LEFT + cols * cw + 20
H = TOP + len(vs) * (ch + 34) + 20
im = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(im)
d.text((20, 16), '직원 얼굴 · 둥근 턱 시안 비교 (머리~어깨 8배, 서기)', fill=INK, font=font(26))
for li, lb in enumerate(looks):
    x = LEFT + li * len(dirs) * cw
    d.text((x + 4, 54), lb, fill=INK, font=font(17))
    for di, dn in enumerate(dirs):
        d.text((x + di * cw + 4, 76), dn, fill=(110, 104, 130), font=font(13))
    if li:
        d.line([(x - 6, 50), (x - 6, H - 10)], fill=(190, 184, 170), width=2)
for vi, v in enumerate(vs):
    y = TOP + vi * (ch + 34)
    d.text((20, y + 8), v['name'], fill=INK, font=font(19))
    # 설명 줄바꿈
    words, line, ly = v['note'], '', y + 38
    for ch_ in words:
        line += ch_
        if d.textlength(line, font=font(13)) > 215:
            d.text((20, ly), line, fill=(90, 86, 110), font=font(13)); ly += 18; line = ''
    if line:
        d.text((20, ly), line, fill=(90, 86, 110), font=font(13))
    for li in range(len(looks)):
        for di in range(len(dirs)):
            s = sprite(v['cells'][li][di], Z, *HEAD, grid=True)
            x = LEFT + (li * len(dirs) + di) * cw
            im.paste(s, (x, y), s)
    d.line([(20, y + ch + 16), (W - 20, y + ch + 16)], fill=(200, 194, 180))
im.save(os.path.join(HERE, 'face-round-compare.png'))

# ── 2) 실제 크기: 1배 · 2배 · 3배 (사무실 줌 범위), 바닥색 위 ──
SC = [1, 2, 3]
fw, fh = 16, 37
LEFT2 = 250
blockw = sum(fw * s + 6 for s in SC) + 14
W2 = LEFT2 + len(looks) * blockw + 20
rowh = fh * 3 + 40
H2 = 90 + len(vs) * rowh + 20
im2 = Image.new('RGB', (W2, H2), BG)
d2 = ImageDraw.Draw(im2)
d2.text((20, 16), '실제 크기 비교 — 앞(↙) 서기 · 1배 / 2배 / 3배', fill=INK, font=font(24))
for li, lb in enumerate(looks):
    d2.text((LEFT2 + li * blockw, 56), lb, fill=INK, font=font(15))
for vi, v in enumerate(vs):
    y = 90 + vi * rowh
    d2.rectangle([LEFT2 - 10, y - 6, W2 - 14, y + fh * 3 + 8], fill=FLOOR)
    d2.text((20, y + 40), v['name'], fill=INK, font=font(17))
    for li in range(len(looks)):
        x = LEFT2 + li * blockw
        for s in SC:
            sp = sprite(v['cells'][li][0], s)
            im2.paste(sp, (x, y + fh * 3 - fh * s), sp)
            x += fw * s + 6
im2.save(os.path.join(HERE, 'face-round-actual.png'))
print('saved face-round-compare.png', im.size, 'face-round-actual.png', im2.size)
