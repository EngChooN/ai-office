# 직원 얼굴 · 둥근 턱 시안

`app/src/renderer/map/iso/personArt.ts`를 읽어 **앞 얼굴(HEAD_F) 아래 3줄 · 수염(face 3) · 목 그늘만** 글자 치환한 사본으로 그린다. 앱 코드·demoStageScene은 건드리지 않는다.

| 시안 | 바꾼 곳 |
|---|---|
| A 현재 | 그대로 |
| B 모서리만 깎기 | 7줄 `.rsmrskkd.` · 8줄 `..sssk....` · 수염 왼쪽 1칸 안으로 |
| C U자 턱 | B + 8줄 `..ssskk...`(턱 넓힘) · 목 그늘 왼쪽 칸 제거 |
| D 동그란 얼굴 | B + 6줄 맨 왼쪽 칸도 비움(볼 아래부터 둥글게) |

뒤(↖)는 모든 시안에서 그대로(비교용). 반전(↘)은 앞 그림을 좌우 뒤집은 것.

## 다시 그리기
```
export PATH=$HOME/.nvm/versions/node/v24.22.2/bin:$PATH
node docs/design/face-round/render.mjs     # → grids.json (personArt.ts가 바뀌어 치환 실패하면 오류로 멈춤)
python3 docs/design/face-round/sheet.py    # → face-round-compare.png(머리~어깨 8배) · face-round-actual.png(1·2·3배)
```
