// 상점 벽지·바닥재를 칸 사무실 방에 덮기 (office-iso-art.md 11절 · 대표님 결정 "덮어쓰기 유지") — pnpm test
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { artMeetingRoom, artRoom, artSurfaceThumb, finishKey, finishOf, SURFACE_ART_IDS, withSurfaces, type Cv } from '../src/renderer/map/iso/isoArt.ts'
import { SHOP_ITEMS } from '../src/shared/economy.ts'

const hash = (cv: Cv) => createHash('sha1').update(cv.px).digest('hex')

test('상점 벽지 15·바닥재 14 모두 그림이 있다 (economy.ts 품목과 같다)', () => {
  const ids = (c: string) => SHOP_ITEMS.filter((i) => i.category === c).map((i) => i.id).sort()
  assert.deepEqual([...SURFACE_ART_IDS.wallpaper].sort(), ids('wallpaper'))
  assert.deepEqual([...SURFACE_ART_IDS.floor].sort(), ids('floor'))
  assert.equal(SURFACE_ART_IDS.wallpaper.length, 15)
  assert.equal(SURFACE_ART_IDS.floor.length, 14)
})

test('미리보기 29장은 모두 다른 그림이다', () => {
  const all = [...SURFACE_ART_IDS.wallpaper, ...SURFACE_ART_IDS.floor]
  assert.equal(new Set(all.map((id) => hash(artSurfaceThumb(id)))).size, all.length)
})

test('고르지 않았으면 레벨 기본 마감 그대로 (처음 열 때 굽는 방이 같다)', () => {
  for (let L = 1; L <= 20; L++) {
    for (const s of [undefined, {}, { lounge: { floor: 'floor-grass' } }, { work: { floor: 'floor-없음' } }]) {
      const { finish, meetingFloor } = withSurfaces(finishOf(L), s, 5)
      assert.equal(finishKey(finish), finishKey(finishOf(L)), `Lv.${L}`)
      assert.equal(meetingFloor, null)
    }
  }
})

test('업무 구역 벽지·바닥재는 방 전체에, 회의실 벽지는 회의실이 기댄 벽 구간에', () => {
  const s = { work: { floor: 'floor-checker', wallpaper: 'wall-polka' }, meeting: { floor: 'floor-marble', wallpaper: 'wall-navy' } }
  const { finish, meetingFloor } = withSurfaces(finishOf(8), s, 6)
  assert.equal(finish.floor, 'floor-checker')
  assert.equal(finish.wall, 'wall-polka')
  assert.equal(finish.windows, finishOf(8).windows)
  assert.deepEqual(finish.meetingWall, { mat: 'wall-navy', from: 6 })
  assert.equal(meetingFloor, 'floor-marble')
  // 회의실이 없으면(meetingFrom null) 회의실 벽지는 쓰지 않는다
  assert.equal(withSurfaces(finishOf(8), s, null).finish.meetingWall, undefined)
  // 업무 벽지와 같으면 구간을 따로 두지 않는다
  assert.equal(withSurfaces(finishOf(8), { work: { wallpaper: 'wall-navy' }, meeting: { wallpaper: 'wall-navy' } }, 6).finish.meetingWall, undefined)
})

test('통유리 단계 위의 벽지는 창을 달고, 유리 벽지는 창·몰딩을 뗀다', () => {
  assert.equal(finishOf(15).wall, 'glass')
  assert.equal(withSurfaces(finishOf(15), { work: { wallpaper: 'wall-cream' } }).finish.windows, 6)
  const glass = withSurfaces(finishOf(5), { work: { wallpaper: 'wall-glass' } }).finish
  assert.equal(glass.windows, 0)
  assert.equal(glass.molding, undefined)
})

test('덮으면 방 그림이 바뀌고, 해제하면 레벨 기본 그림으로 돌아간다', () => {
  const base = hash(artRoom(6, 6, finishOf(4)).cv)
  const on = withSurfaces(finishOf(4), { work: { floor: 'floor-grass', wallpaper: 'wall-forest' } }).finish
  assert.notEqual(hash(artRoom(6, 6, on).cv), base)
  const off = withSurfaces(finishOf(4), { work: {} }).finish
  assert.equal(hash(artRoom(6, 6, off).cv), base)
  // 회의실 벽지만 골라도 방 그림이 바뀐다 (회의실이 기댄 벽 구간)
  const seg = withSurfaces(finishOf(4), { meeting: { wallpaper: 'wall-xmas' } }, 3).finish
  assert.notEqual(hash(artRoom(6, 6, seg).cv), base)
  // 회의실 바닥재는 회의실 바닥 조각에만
  const floorOf = (f: Parameters<typeof artMeetingRoom>[3]) => hash(artMeetingRoom(3, 3, 1, f).find((p) => p.kind === 'floor')!.cv)
  assert.notEqual(floorOf('floor-gold'), floorOf(null))
})
