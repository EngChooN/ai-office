# 바탕화면 비서 움직임 미리보기 (af3c9e2 · cd21917 기준)

**실제 앱 화면 아님.** 앱이 쓰는 값을 그대로 읽어 확정 그림에 적용해 그린 그림입니다 (`../motion-preview.py`).

- 키프레임: `app/src/renderer/index.css`의 `pet-breathe`·`pet-look`·`pet-hop`
- 시간: `app/src/shared/deskPet.ts`의 `PET_MOTION` (앱은 이 값을 CSS 변수로 넘긴다)
- 그림: `app/src/renderer/deskPet/sprites/body-idle.png`, 발밑 가운데 기준, 앱처럼 `steps(1, end)`로 끊음
- 레티나 화면처럼 2배(1 CSS px = 2화소)로 그림

| 파일 | 내용 |
| --- | --- |
| `motion-112@2x.png` | 기본 크기 112px — 숨쉬기·두리번·가끔 폴짝·결재 알림 프레임을 한 줄씩 |
| `motion-80@2x.png` | 가장 작은 크기 80px |
| `motion-160@2x.png` | 가장 큰 크기 160px |
| `breathe-112@2x.gif` | 숨쉬기 2.4초 되풀이 |
| `look-112@2x.gif` | 두리번 0.9초 (+ 1초 쉼) |
| `hop-112@2x.gif` | 가끔 폴짝 0.4초 (+ 1초 쉼) |
| `alert-112@2x.gif` | 결재 알림 폴짝 0.35초 × 2번 (+ 1초 쉼) |

그림에서 빨간 선은 기본 자세의 머리 높이, 회색 선은 바닥입니다.

**실제 화면과 다른 점**
- 눈 깜빡임, 머리 옆 반짝임 표식, 결재 '!' 배지, 말풍선은 그리지 않았습니다 (배지·말풍선은 앱에서도 움직이지 않습니다).
- GIF의 "1초 쉼"은 보기 편하라고 넣은 간격입니다. 실제로는 두리번·폴짝이 15~30초에 한 번, 결재 알림은 새 결재가 올 때만 나오고 그 사이에는 숨쉬기가 이어집니다.
- GIF는 10ms 단위라 프레임 시간이 최대 5ms씩 다를 수 있습니다.
- 기울이기(두리번)는 가장 가까운 화소로 그려 브라우저보다 테두리가 조금 더 거칠게 보일 수 있습니다.

다시 그리기: Pillow가 있는 파이썬으로 `python3 docs/design/desktop-secretary/motion-preview.py`
