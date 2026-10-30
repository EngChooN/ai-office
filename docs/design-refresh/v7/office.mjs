// v7 확인용 — 방 + 기본 자리(장면과 같은 깊이 정렬) + 라운지 + 감정 말풍선. 실행: node office.mjs 출력.png
import fs from 'node:fs'
import * as iso from '../../../app/src/renderer/map/iso/isoArt.ts'
import * as em from '../../../app/src/renderer/map/iso/emoteArt.ts'
import { Canvas, stage, deskPair } from './scene.mjs'
const room = iso.artRoom(10, 8, iso.STAGE_FINISH[2])
const cv = new Canvas(room.cv.w, room.cv.h)
cv.blit(room.cv.px, room.cv.w, room.cv.h, 0, 0)
const st = stage(cv, room.o)
const put = (itemId, gx, gy, rot = 0) => { const it = { uid: itemId + gx + gy, itemId, gx, gy, rot }; st.put(it); return it }
// 기본 자리 두 줄 (의자 rot0 → 책상 앞, 앞줄은 뒤를 보고 앉는 rot2)
let n = 0
for (const gx of [1, 3]) { const [c, d] = deskPair('desk', 'chair', 0, gx, 1); st.put(c); st.put(d); st.sit(c, 0, n++, 'type') }
for (const gx of [1, 3]) { const [c, d] = deskPair('desk', 'chair', 2, gx, 5); st.put(c); st.put(d); st.sit(c, 0, n++, 'type') }
put('bookshelf', 6, 0); put('plant', 9, 0); put('coffee-machine', 8, 0)
put('rug-persian', 6, 4); const sofa = put('sofa-green', 6, 3); st.sit(sofa, 0, n++); st.sit(sofa, 1, n++)
put('zone-low-table', 7, 5); put('fern', 9, 6)
st.flush()
// 감정 말풍선 몇 개 (앉은 직원 머리 위 근사 위치)
const P = st.P
for (const [k, gx, gy, z] of [['done', 1.5, 1.5, 44], ['idea', 3.5, 1.5, 44], ['love', 6.5, 3.5, 46], ['note', 7.5, 3.5, 46]]) {
  const e = em.artEmote(k); const [x, y] = P(gx, gy, z); cv.blit(e.px, e.w, e.h, x - 6, y - e.h)
}
fs.writeFileSync(process.argv[2] ?? 'office-v7.png', cv.scaled(3))
console.log('ok')
