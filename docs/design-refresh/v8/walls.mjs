// v8 확인용 — 파티션·가벽 이음(일자·ㄱ·ㅜ) + 새 소품. 실행: node walls.mjs 출력.png
import fs from 'node:fs'
import * as iso from '../../../app/src/renderer/map/iso/isoArt.ts'
import { Canvas, stage } from '../v7/scene.mjs'
const room = iso.artRoom(12, 10, iso.STAGE_FINISH[2])
const cv = new Canvas(room.cv.w, room.cv.h)
cv.blit(room.cv.px, room.cv.w, room.cv.h, 0, 0)
const st = stage(cv, room.o)
const items = []
const put = (itemId, gx, gy, rot = 0) => items.push({ uid: `${itemId}@${gx},${gy}`, itemId, gx, gy, rot })
// 낮은 패브릭: 2칸 + 2칸 일자, 끝에서 1칸으로 ㄱ자
put('partition-low-fabric', 0, 2, 0); put('partition-low-fabric', 2, 2, 0); put('partition-low-fabric-1', 3, 3, 1); put('partition-low-fabric', 3, 4, 1)
// 원목 가벽 ㄱ자 + 1칸
put('partition-wall-wood', 6, 0, 1); put('partition-wall-wood-1', 7, 2, 0); put('partition-wall-wood', 8, 2, 0)
// 벽돌 ㅜ자, 식물 일자, 유리 ㄱ
put('partition-wall-brick', 0, 6, 0); put('partition-wall-brick', 2, 6, 0); put('partition-wall-brick', 1, 7, 1)
put('partition-low-wood', 6, 6, 0); put('partition-low-wood', 8, 5, 1); put('partition-low-glass', 8, 7, 1)
put('partition-wall-green', 11, 4, 1); put('partition-wall-glass', 11, 6, 1)
// 소품
;['book-stack', 'box-pile', 'umbrella-stand', 'snack-basket', 'cork-board', 'mini-fridge'].forEach((id, i) => put(id, 4 + i, 9, 0))
const joins = iso.partitionJoins(items)
for (const it of items) st.put(joins.has(it.uid) ? { ...it, itemId: it.itemId + joins.get(it.uid) } : it)
st.flush()
fs.writeFileSync(process.argv[2] ?? 'walls.png', cv.scaled(3))
console.log([...joins].join('\n'))
