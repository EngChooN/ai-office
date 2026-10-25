// 사무실 레벨표(LEVEL_TABLE 20행)·층 데이터·보정·회의 층 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFloors,
  clampFloor,
  companyLevelOf,
  LEVEL_TABLE,
  MAX_FLOORS,
  MAX_LEVEL,
  MEETING_ROOM_OF_LEVEL,
  meetingFloor,
  meetingRoomOf,
  nextMeetingRoomLevel,
  officeOf,
  OFFICE_LEVELS,
  staffFloor,
  teamFloor,
  teamFloors,
} from '../src/shared/officeLevel.ts'
import { COMPANY_LEVELS, companyFromXp } from '../src/shared/types.ts'
import { isoLevelOf, roomOf } from '../src/shared/iso/levels.ts'
import { boxOf } from '../src/shared/iso/grid.ts'
import { ACHIEVEMENTS, SHOP_ITEMS } from '../src/shared/economy.ts'

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)

test('레벨표 20행 — 이름·층·회의실 표는 모두 같은 길이로 계산된다', () => {
  assert.equal(MAX_LEVEL, 20)
  assert.equal(COMPANY_LEVELS.length, MAX_LEVEL)
  assert.equal(OFFICE_LEVELS.length, MAX_LEVEL)
  assert.equal(MEETING_ROOM_OF_LEVEL.length, MAX_LEVEL)
  assert.equal(COMPANY_LEVELS[9].title, '3층 오피스 빌딩')
  assert.equal(COMPANY_LEVELS[19].title, '캠퍼스')
})

test('경험치 문턱은 커지기만 하고 Lv.20은 46만', () => {
  for (let i = 1; i < MAX_LEVEL; i++) assert.ok(LEVEL_TABLE[i].xp > LEVEL_TABLE[i - 1].xp, `Lv.${i + 1}`)
  assert.equal(LEVEL_TABLE[0].xp, 0)
  assert.equal(LEVEL_TABLE[19].xp, 460_000)
})

test('층수: Lv.6·10·14·18에서 하나씩 늘어 최대 5층', () => {
  assert.deepEqual(
    LEVELS.map((lv) => officeOf(lv).floors),
    [1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5],
  )
  assert.equal(MAX_FLOORS, 5)
})

test('칸 크기: Lv.1 8×8에서 줄지 않고 넓어져 Lv.20 24×24', () => {
  // 칸 크기는 1층 돌출부·테라스를 뺀 상자(boxOf)의 크기
  const sizes = LEVELS.map((lv) => boxOf(roomOf(lv, 1)).cols)
  assert.equal(sizes[0], 8)
  assert.equal(sizes[19], 24)
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1] && sizes[i] - sizes[i - 1] <= 1, `Lv.${i + 1}`)
  for (const lv of LEVELS) assert.equal(boxOf(roomOf(lv, 1)).rows, boxOf(roomOf(lv, 1)).cols)
})

test('재질 단계 M1~M5: Lv.3·6·10·14에서 바뀌고 내려가지 않는다', () => {
  assert.deepEqual(
    LEVELS.map((lv) => LEVEL_TABLE[lv - 1].material),
    [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5],
  )
})

test('외관: 건물 단계 E1~E7은 줄지 않고, 층이 늘 때 새 단계가 열린다', () => {
  const stages = LEVELS.map((lv) => officeOf(lv).exterior)
  assert.deepEqual(stages, [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 7])
  // 같은 건물 단계 안에서는 꾸밈이 쌓이기만 한다
  for (let i = 1; i < MAX_LEVEL; i++) {
    const [prev, cur] = [LEVEL_TABLE[i - 1], LEVEL_TABLE[i]]
    if (prev.exterior === cur.exterior) for (const f of prev.features) assert.ok(cur.features.includes(f), `Lv.${i + 1} ${f}`)
  }
})

test('회의실 정원은 줄지 않는다: 8 → 10 → 12 → 14 → 16 → 강당 20', () => {
  const caps = LEVELS.map((lv) => meetingRoomOf(lv).capacity)
  assert.deepEqual(caps, [8, 8, 10, 10, 12, 12, 12, 14, 14, 16, 16, 16, 16, 16, 16, 20, 20, 20, 20, 20])
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i] >= caps[i - 1])
  assert.deepEqual([...new Set(LEVELS.map((lv) => meetingRoomOf(lv).tier))], ['folding', 'wood', 'oak', 'walnut', 'board', 'hall'])
  assert.equal(isoLevelOf(16).meetingCapacity, 20)
})

test('회의실이 다음으로 커지는 레벨', () => {
  assert.equal(nextMeetingRoomLevel(1), 3)
  assert.equal(nextMeetingRoomLevel(9), 10)
  assert.equal(nextMeetingRoomLevel(10), 16)
  assert.equal(nextMeetingRoomLevel(16), null)
})

test('표 밖 레벨: 1 미만은 Lv.1, 넘치면 Lv.20', () => {
  assert.equal(officeOf(0), officeOf(1))
  assert.equal(officeOf(-3), officeOf(1))
  assert.equal(officeOf(Number.NaN), officeOf(1))
  assert.equal(officeOf(99), officeOf(20))
  assert.deepEqual(roomOf(99, 1), roomOf(20, 1))
  assert.equal(meetingRoomOf(0).capacity, 8)
  assert.equal(meetingRoomOf(99).capacity, 20)
})

test('회사 레벨: 경험치로 계산하고, 한 번 오른 레벨 아래로 내려가지 않는다', () => {
  assert.equal(companyLevelOf(0), 1)
  assert.equal(companyLevelOf(26_192), 10)
  assert.equal(companyLevelOf(9_000), 8)
  assert.equal(companyLevelOf(9_000, 10), 10)
  assert.equal(companyLevelOf(999_999), 20)
  assert.equal(companyLevelOf(0, 99), 20)
  const c = companyFromXp(9_000, 10)
  assert.equal(c.level, 10)
  assert.equal(c.title, '3층 오피스 빌딩')
  assert.equal(c.progress, 0)
  assert.equal(companyFromXp(460_000).progress, 1)
})

test('상점 minLevel은 같은 경험치 기준으로 옮겨 Lv.8을 넘지 않는다 (다시 잠기는 물건 없음, 새 레벨 전용 가구는 빼고)', () => {
  for (const item of SHOP_ITEMS.filter((i) => i.category !== 'level')) assert.ok(item.minLevel >= 1 && item.minLevel <= 8, `${item.id} ${item.minLevel}`)
  assert.equal(SHOP_ITEMS.find((i) => i.id === 'wall-galaxy')?.minLevel, 8)
})

test('업적: 레벨 5·8·10은 그대로, 15·20 추가', () => {
  const levels = ACHIEVEMENTS.filter((a) => a.metric === 'level').map((a) => [a.id, a.target])
  assert.deepEqual(levels, [
    ['level5', 5],
    ['level8', 8],
    ['level10', 10],
    ['level15', 15],
    ['level20', 20],
  ])
})

test('보던 층 보정: 이 레벨에 없는 층이면 1층', () => {
  assert.equal(clampFloor(2, 8), 2)
  assert.equal(clampFloor(2, 5), 1)
  assert.equal(clampFloor(3, 9), 1)
  assert.equal(clampFloor(3, 10), 3)
  assert.equal(clampFloor(undefined, 10), 1)
  assert.equal(clampFloor(0, 10), 1)
  assert.equal(clampFloor(1.5, 10), 1)
})

const teams = [
  { id: 'design', kind: 'hired' as const, floor: 2 },
  { id: 'dev', kind: 'hired' as const, floor: 1 },
  { id: 'old', kind: 'hired' as const },
  { id: 'proj', kind: 'project' as const, floor: 2 },
]

test('팀 층: 저장값을 쓰되 없는 층·외부 프로젝트 팀은 1층', () => {
  assert.equal(teamFloor(teams[0], 8), 2)
  assert.equal(teamFloor(teams[0], 5), 1)
  assert.equal(teamFloor(teams[2], 8), 1)
  assert.equal(teamFloor(teams[3], 8), 1)
  // 층을 정하지 않은 팀은 다른 팀을 보고 나눈다 (1층: dev + 외부 팀, 2층: design → 2층)
  assert.equal(teamFloor(teams[2], 8, teams), 2)
})

test('팀 층 나누기: 층을 정하지 않은 고용 팀을 LEVEL_TABLE 층수에 고르게', () => {
  const t = [
    { id: 'po', kind: 'hired' as const, floor: 1 },
    { id: 'be', kind: 'hired' as const, floor: 1 },
    { id: 'fe', kind: 'hired' as const },
    { id: 'design', kind: 'hired' as const },
    { id: 'qa', kind: 'hired' as const },
    { id: 'proj:x', kind: 'project' as const },
  ]
  // Lv.10 = 3층: 1층은 이미 셋(po·be·외부) → fe 2층, design 3층, qa 2층
  assert.deepEqual([...teamFloors(t, 10)], [['po', 1], ['be', 1], ['proj:x', 1], ['fe', 2], ['design', 3], ['qa', 2]])
  // Lv.5 = 1층이면 모두 1층
  assert.ok([...teamFloors(t, 5).values()].every((f) => f === 1))
  // 저장한 층이 이 레벨에 없으면 1층으로 센다 (저장값은 그대로)
  assert.equal(teamFloors([{ id: 'a', kind: 'hired', floor: 3 }, { id: 'b', kind: 'hired' }], 8).get('b'), 2)
  // 직원 층·층 데이터도 같은 결과
  assert.equal(staffFloor({ teamId: 'design' }, t, 10), 3)
  const floors = buildFloors(10, [{ id: 'k', teamId: 'fe' }, { id: 'l', teamId: 'design' }, { id: 'm', teamId: 'po' }], t, [])
  assert.deepEqual(floors.map((f) => f.staff.map((s) => s.id)), [['m'], ['k'], ['l']])
})

test('직원 층: 소속 팀 층, 무소속·없는 팀은 1층', () => {
  assert.equal(staffFloor({ teamId: 'design' }, teams, 8), 2)
  assert.equal(staffFloor({ teamId: null }, teams, 8), 1)
  assert.equal(staffFloor({ teamId: 'gone' }, teams, 8), 1)
})

test('회의 층: 참석자가 가장 많은 층, 같으면 낮은 층', () => {
  const floorOf = (id: string) => ({ a: 2, b: 2, c: 1, d: 3, e: 3 })[id] ?? 1
  assert.equal(meetingFloor(['a', 'b', 'c'], floorOf), 2)
  assert.equal(meetingFloor(['a', 'c'], floorOf), 1)
  assert.equal(meetingFloor(['a', 'b', 'd', 'e'], floorOf), 2)
  assert.equal(meetingFloor(['d', 'e', 'd'], floorOf), 3)
  assert.equal(meetingFloor([], floorOf), 1)
})

const staff = [
  { id: 'kim', teamId: 'design' },
  { id: 'lee', teamId: 'design' },
  { id: 'park', teamId: 'dev' },
  { id: 'ext', teamId: 'proj' },
  { id: 'solo', teamId: null },
]

test('층 데이터: 층수만큼 만들고 팀·직원·회의를 나눈다 (층마다 회의실)', () => {
  const floors = buildFloors(8, staff, teams, [{ participantIds: ['kim', 'lee'] }, { participantIds: ['park', 'solo'] }])
  assert.deepEqual(
    floors.map((f) => f.floor),
    [1, 2],
  )
  assert.deepEqual(
    floors[0].teams.map((t) => t.id),
    ['dev', 'proj'],
  )
  // 층을 정하지 않은 old는 팀이 적은 2층으로
  assert.deepEqual(
    floors[1].teams.map((t) => t.id),
    ['design', 'old'],
  )
  assert.deepEqual(
    floors[0].staff.map((s) => s.id),
    ['park', 'ext', 'solo'],
  )
  assert.deepEqual(
    floors[1].staff.map((s) => s.id),
    ['kim', 'lee'],
  )
  assert.equal(floors[0].meetingRoom.meetings.length, 1)
  assert.deepEqual(floors[1].meetingRoom.meetings[0].participantIds, ['kim', 'lee'])
})

test('레벨이 내려가 층이 사라지면 그 층 팀·직원·회의는 1층으로 (저장값은 그대로)', () => {
  const floors = buildFloors(5, staff, teams, [{ participantIds: ['kim', 'lee'] }])
  assert.equal(floors.length, 1)
  assert.deepEqual(
    floors[0].staff.map((s) => s.id),
    ['kim', 'lee', 'park', 'ext', 'solo'],
  )
  assert.equal(floors[0].meetingRoom.meetings.length, 1)
  assert.equal(teams[0].floor, 2)
})

test('Lv.10은 3층까지, 빈 층에도 회의실 칸이 있다', () => {
  const floors = buildFloors(10, staff, teams, [])
  assert.equal(floors.length, 3)
  // 층을 정하지 않은 old는 비어 있던 3층으로 (직원은 없다)
  assert.deepEqual(floors[2], { floor: 3, teams: [teams[2]], staff: [], meetingRoom: { meetings: [] } })
})

test('층 자동 분산: 직원 수로 세어 큰 팀부터 사람이 적은 층에 (office-iso-spaces 1-4 S3 A)', () => {
  // 이 회사 (Lv.10 = 3층): PO 2·백엔드 1은 1층으로 정함, 무소속 1명, 나머지는 층을 정하지 않음
  const teams = [
    { id: 'fe', kind: 'hired' as const },
    { id: 'po', kind: 'hired' as const, floor: 1 },
    { id: 'design', kind: 'hired' as const },
    { id: 'be', kind: 'hired' as const, floor: 1 },
    { id: 'qa', kind: 'hired' as const },
    { id: 'app', kind: 'hired' as const },
  ]
  const heads: Record<string, number> = { fe: 4, po: 2, design: 1, be: 1, qa: 1, app: 2 }
  const staff = [...Object.entries(heads).flatMap(([teamId, n]) => Array.from({ length: n }, (_, i) => ({ id: `${teamId}${i}`, teamId }))), { id: 'solo', teamId: null }]
  const floors = teamFloors(teams, 10, staff)
  // 1층 4명(PO 2·백엔드 1·무소속 1) → 프론트엔드 4명 2층 → 앱 2명 3층 → 디자인·QA는 사람이 가장 적은 3층
  assert.deepEqual(Object.fromEntries(floors), { po: 1, be: 1, fe: 2, app: 3, design: 3, qa: 3 })
  const byFloor = buildFloors(10, staff, teams, []).map((f) => f.staff.length)
  assert.deepEqual(byFloor, [4, 4, 4])
  // 화면 곳곳의 층 표시도 같은 결과 (allStaff를 넘기면)
  assert.equal(staffFloor({ teamId: 'qa' }, teams, 10, undefined, staff), 3)
  assert.equal(teamFloor(teams[4], 10, teams, staff), 3)
  // 층을 정한 팀은 그대로, 1층짜리 레벨이면 모두 1층
  assert.ok([...teamFloors(teams, 5, staff).values()].every((f) => f === 1))
  // 빈 팀도 한 몫으로 센다 — 빈 팀끼리 한 층에 몰리지 않는다
  const empty = [{ id: 'x', kind: 'hired' as const }, { id: 'y', kind: 'hired' as const }, { id: 'z', kind: 'hired' as const }]
  assert.deepEqual([...teamFloors(empty, 10, []).values()], [1, 2, 3])
})
