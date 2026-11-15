"""바탕화면 비서 캐릭터 움직임 미리보기 그리기 (Pillow 필요: python3 -m pip install pillow)

실제 앱 화면을 녹화한 것이 아니다. 앱이 쓰는 값을 그대로 읽어 확정 그림에 적용해 그린다.
  - 키프레임: app/src/renderer/index.css 의 @keyframes pet-breathe·pet-look·pet-hop
  - 시간:     app/src/shared/deskPet.ts 의 PET_MOTION (CSS 변수 petMotionVars로 넘어가는 값)
  - 그림:     app/src/renderer/deskPet/sprites/body-idle.png (눈 깜빡임·반짝임 표식·결재 배지는 그리지 않는다)
  - 크기:     shared/deskPet.ts petLayout 과 같은 계산 (높이 = 크기, 폭 = 높이 × 72/112), 기준점은 발밑 가운데
  - 앱과 같이 steps(1, end)로 끊어서, 키프레임 사이를 섞지 않고 다음 키프레임까지 그대로 둔다
  - 레티나 화면처럼 2배(1 CSS px = 2 화소)로 그린다

결과  docs/design/desktop-secretary/motion/
  motion-{80,112,160}@2x.png  동작별(숨쉬기·두리번·가끔 폴짝·결재 알림) 프레임을 한 줄씩 이어 붙인 그림
  {breathe,look,hop,alert}-112@2x.gif  동작별 실제 시간대로 움직이는 그림 (한 번 하는 동작은 뒤에 1초 쉬고 되풀이)

실행: /path/to/python3 docs/design/desktop-secretary/motion-preview.py
"""

import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
CSS = ROOT / 'app/src/renderer/index.css'
TS = ROOT / 'app/src/shared/deskPet.ts'
SPRITE = ROOT / 'app/src/renderer/deskPet/sprites/body-idle.png'
OUT = ROOT / 'docs/design/desktop-secretary/motion'
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
DPR = 2
DEFAULT = 112
BG, GROUND, GUIDE, INK, SUB = (245, 246, 248), (150, 156, 166), (230, 92, 92), (30, 32, 36), (110, 116, 126)


def pet_motion():
    """PET_MOTION의 숫자 값들"""
    body = re.search(r'export const PET_MOTION = \{([^}]*)\}', TS.read_text()).group(1)
    return {k: int(v.replace('_', '')) for k, v in re.findall(r'(\w+):\s*([\d_]+)', body)}


def keyframes(name):
    """@keyframes 이름 → [(0~1 위치, [(함수, 값)])] (100%가 없으면 기본 자세로 채운다)"""
    css = CSS.read_text()
    start = css.index(f'@keyframes {name} {{')
    depth, i = 0, start
    while True:
        if css[i] == '{':
            depth += 1
        elif css[i] == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1
    frames = []
    for pct, decl in re.findall(r'([\d.]+)%\s*\{\s*transform:\s*([^;]+);', css[start:i]):
        ops = []
        for fn, arg in re.findall(r'(translateY|scaleY|rotate)\(((?:[^()]|\([^()]*(?:\([^()]*\))?[^()]*\))*)\)', decl):
            if fn == 'translateY':
                ops.append((fn, float(re.search(r'(-?[\d.]+)px', arg).group(1))))  # × --pet-scale
            elif fn == 'rotate':
                ops.append((fn, float(arg.replace('deg', ''))))
            else:
                ops.append((fn, float(arg)))
        frames.append((float(pct) / 100, ops))
    if frames[-1][0] < 1:
        frames.append((1.0, []))
    return frames


def layout(size):
    scale = size / DEFAULT
    return scale, round(size * 72 / DEFAULT), size


def render(ops, size, pad=8):
    """한 자세를 그린 칸 (발밑 가운데가 기준점, 바닥선 포함). 위아래 여유는 가장 높이 뛰는 폴짝에 맞춘다"""
    scale, w, h = layout(size)
    top = pad + 8 * scale  # 폴짝 최고 5px × 배율보다 넉넉히
    cw, ch = round((w + pad * 2) * DPR), round((h + top + pad) * DPR)
    cell = Image.new('RGBA', (cw, ch), BG + (255,))
    src = Image.open(SPRITE).convert('RGBA').resize((w * DPR, h * DPR), Image.NEAREST)
    ox, oy = cw / 2, (top + h) * DPR  # 발밑 가운데 (transform-origin: 50% 100%)
    # CSS transform 목록은 오른쪽부터 점에 적용된다: M = f1 · f2 · ...  → 역행렬로 원본 화소를 찾는다
    import math
    a, b, c, d, e, f = 1, 0, 0, 1, 0, 0  # x' = a x + c y + e, y' = b x + d y + f (기준점 기준)
    for fn, v in ops:
        if fn == 'translateY':
            m = (1, 0, 0, 1, 0, v * scale * DPR)
        elif fn == 'scaleY':
            m = (1, 0, 0, v, 0, 0)
        else:
            r = math.radians(v)
            m = (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0)
        a, b, c, d, e, f = (a * m[0] + c * m[1], b * m[0] + d * m[1], a * m[2] + c * m[3], b * m[2] + d * m[3], a * m[4] + c * m[5] + e, b * m[4] + d * m[5] + f)
    det = a * d - b * c
    ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
    # 출력 화소(X,Y) → 기준점 기준 좌표 → 역변환 → 그림 좌표 (그림의 발밑 가운데 = (w*DPR/2, h*DPR))
    px, py = -ox, -oy
    sx, sy = src.width / 2, src.height
    coeffs = (
        ia, ic, ia * (px - e) + ic * (py - f) + sx,
        ib, id_, ib * (px - e) + id_ * (py - f) + sy,
    )
    moved = src.transform((cw, ch), Image.AFFINE, coeffs, resample=Image.NEAREST)
    draw = ImageDraw.Draw(cell)
    # 기본 자세의 머리 높이 안내선 (1px 들썩임이 보이게)
    head = oy - h * DPR
    draw.line([(0, head), (cw, head)], fill=GUIDE + (255,), width=1)
    cell.alpha_composite(moved)
    draw.line([(0, oy), (cw, oy)], fill=GROUND + (255,), width=1)
    return cell


def segments(frames, dur, repeat=1):
    """steps(1, end): 키프레임마다 다음 키프레임까지 그대로 → [(시작 ms, 길이 ms, 자세)]"""
    out = []
    for n in range(repeat):
        for (p0, ops), (p1, _) in zip(frames, frames[1:]):
            if p1 > p0:
                out.append((n * dur + p0 * dur, (p1 - p0) * dur, ops))
    return out


def actions(m):
    return [
        ('숨쉬기', 'breathe', segments(keyframes('pet-breathe'), m['breatheMs']), f'{m["breatheMs"]}ms 되풀이', False),
        ('두리번', 'look', segments(keyframes('pet-look'), m['lookMs']), f'{m["lookMs"]}ms · 15~30초마다 가끔', True),
        ('가끔 폴짝', 'hop', segments(keyframes('pet-hop'), m['hopMs']), f'{m["hopMs"]}ms · 15~30초마다 가끔', True),
        ('결재 알림', 'alert', segments(keyframes('pet-hop'), m['alertHopMs'], m['alertHops']), f'{m["alertHopMs"]}ms × {m["alertHops"]}번 · 새 결재가 올 때', True),
    ]


def sheet(size, m):
    font = ImageFont.truetype(FONT, 13 * DPR)
    small = ImageFont.truetype(FONT, 10 * DPR)
    acts = actions(m)
    cells = [[(t, l, render(ops, size)) for t, l, ops in segs] for _, _, segs, _, _ in acts]
    cw, ch = cells[0][0][2].size
    label_w, gap, head_h, row_h = 190 * DPR, 6 * DPR, 52 * DPR, ch + 22 * DPR
    width = label_w + max(len(r) for r in cells) * (cw + gap)
    im = Image.new('RGB', (width, head_h + row_h * len(acts)), (255, 255, 255))
    draw = ImageDraw.Draw(im)
    draw.text((10 * DPR, 8 * DPR), f'바탕화면 비서 움직임 — {size}px (2배 확대)', font=font, fill=INK)
    draw.text((10 * DPR, 28 * DPR), '실제 앱 화면 아님: index.css 키프레임·PET_MOTION 값을 body-idle.png에 적용해 그린 그림. 빨간 선 = 기본 자세 머리 높이, 회색 선 = 바닥', font=small, fill=SUB)
    for r, ((name, _, _, note, _), row) in enumerate(zip(acts, cells)):
        y = head_h + r * row_h
        draw.text((10 * DPR, y + 8 * DPR), name, font=font, fill=INK)
        draw.text((10 * DPR, y + 28 * DPR), note, font=small, fill=SUB)
        for i, (t, length, cell) in enumerate(row):
            x = label_w + i * (cw + gap)
            im.paste(cell, (x, y))
            draw.text((x + 2 * DPR, y + ch + 3 * DPR), f'{round(t)}~{round(t + length)}ms', font=small, fill=SUB)
    return im


def gif(segs, size, path, rest):
    frames, durations = [], []
    # GIF는 10ms 단위라 끝 시각을 10ms에 맞춰 반올림해 나눈다 (87.5ms × 8 → 합계가 700ms 그대로)
    to10 = lambda ms: round(ms / 10) * 10
    for start, length, ops in segs:
        frames.append(render(ops, size).convert('RGB'))
        durations.append(to10(start + length) - to10(start))
    if rest:  # 한 번 하는 동작: 뒤에 1초 기본 자세로 쉬고 되풀이 (보기 편하게 넣은 간격)
        frames.append(render([], size).convert('RGB'))
        durations.append(1000)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=1)


def main():
    m = pet_motion()
    OUT.mkdir(exist_ok=True)
    for size in (80, DEFAULT, 160):
        sheet(size, m).save(OUT / f'motion-{size}@2x.png')
    for _, key, segs, _, rest in actions(m):
        gif(segs, DEFAULT, OUT / f'{key}-{DEFAULT}@2x.gif', rest)
    for p in sorted(OUT.iterdir()):
        print(p.relative_to(ROOT))


if __name__ == '__main__':
    main()
