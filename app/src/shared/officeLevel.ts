// 회사 레벨표 — 레벨 정보는 모두 이 표 한 곳에 둔다 (docs/specs/office-iso-tech.md 5절, 김기획 office-iso-levels.md 2절, 대표님 확정 10절)
// COMPANY_LEVELS(이름·경험치)·OFFICE_LEVELS(층·외관)·MEETING_ROOM_OF_LEVEL·칸 크기(iso/levels)·재질 단계(isoArt)·외관 꾸밈(exteriorSpec)은 여기서 계산한다

import type { Meeting, Staff, Team } from './types'
import { tx } from './i18n/index.ts'

/** 외관 건물 단계 E1~E7 (E7 캠퍼스는 다음 단계라 그림은 아직 E6) */
export type ExteriorStage = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * 외관 꾸밈. 레벨표의 -1·-2·-3 단계에서 하나씩 켜진다 (그림: renderer/map/iso/exteriorArt)
 * - E1: sign 손글씨 간판 · E2: awning 줄무늬 차양 · litSign 조명 간판
 * - E3: planters 화분·벤치 · canopy 입구 캐노피 · landscape 조경 · E4: pylon 옥외 간판 · parking 주차장 · garden 정원
 * - E5: logo 로고 사인 · fountain 분수 앞마당 · rooftop 옥상 정원 · E6: nightLights 야간 조명
 */
export type ExteriorFeature = 'sign' | 'awning' | 'litSign' | 'planters' | 'canopy' | 'landscape' | 'pylon' | 'parking' | 'garden' | 'logo' | 'fountain' | 'rooftop' | 'nightLights'

/** 바닥·벽 재질 단계 M1~M5 — 층이 느는 레벨(6·10·14·18)과 함께 바뀐다 (이디자 office-iso-art.md 6절. Lv.3에 M2) */
export type Material = 1 | 2 | 3 | 4 | 5

export interface LevelRow {
  /** 이 레벨이 되는 누적 경험치 */
  xp: number
  title: string
  /** 새로 열리는 구역 (레벨업 안내) */
  unlock: string
  floors: number
  exterior: ExteriorStage
  /** 그 레벨에 보이는 외관 꾸밈 전부 (누적) */
  features: readonly ExteriorFeature[]
  /** 한 층 바닥 칸 n×n (모든 층이 같다) */
  grid: number
  material: Material
  /** MEETING_ROOMS 순번 — 정원은 줄지 않는다 */
  meetingRoom: number
  /** 층 이동 고정 칸이 엘리베이터인지 (아니면 계단, 김기획 레벨표 2-2절) */
  elevator: boolean
}

const E3 = ['planters', 'canopy', 'landscape'] as const
const E4 = ['pylon', 'parking', 'garden'] as const
const E5 = ['logo', 'fountain', 'rooftop'] as const

export const LEVEL_TABLE: readonly LevelRow[] = [
  { xp: 0, title: '차고 창업', unlock: '업무 구역 — 기본 자리 4개', floors: 1, exterior: 1, features: [], grid: 8, material: 1, meetingRoom: 0, elevator: false },
  { xp: 100, title: '차고 사무실', unlock: '커피 코너', floors: 1, exterior: 1, features: ['sign'], grid: 9, material: 1, meetingRoom: 0, elevator: false },
  { xp: 300, title: '원룸 사무실', unlock: '트인 회의 테이블', floors: 1, exterior: 2, features: [], grid: 10, material: 2, meetingRoom: 1, elevator: false },
  { xp: 700, title: '작은 사무실', unlock: '화이트보드 벽·수납 코너', floors: 1, exterior: 2, features: ['awning'], grid: 11, material: 2, meetingRoom: 1, elevator: false },
  { xp: 1_500, title: '회의실 독립', unlock: '유리벽 회의실', floors: 1, exterior: 2, features: ['awning', 'litSign'], grid: 11, material: 2, meetingRoom: 2, elevator: false },
  { xp: 2_800, title: '2층 상가 입주', unlock: '2층과 계단', floors: 2, exterior: 3, features: [], grid: 12, material: 3, meetingRoom: 2, elevator: false },
  { xp: 4_800, title: '탕비실·휴게실', unlock: '탕비실·휴게실', floors: 2, exterior: 3, features: E3.slice(0, 1), grid: 13, material: 3, meetingRoom: 2, elevator: false },
  { xp: 8_000, title: '리셉션 로비', unlock: '리셉션 로비', floors: 2, exterior: 3, features: E3.slice(0, 2), grid: 14, material: 3, meetingRoom: 3, elevator: false },
  { xp: 12_500, title: '게임 존', unlock: '게임 존', floors: 2, exterior: 3, features: E3, grid: 15, material: 3, meetingRoom: 3, elevator: false },
  { xp: 20_000, title: '3층 오피스 빌딩', unlock: '3층과 엘리베이터', floors: 3, exterior: 4, features: [], grid: 16, material: 4, meetingRoom: 4, elevator: true },
  { xp: 28_000, title: '수면실·샤워실', unlock: '수면실·샤워실', floors: 3, exterior: 4, features: E4.slice(0, 1), grid: 16, material: 4, meetingRoom: 4, elevator: true },
  { xp: 39_000, title: '사내 도서관', unlock: '사내 도서관', floors: 3, exterior: 4, features: E4.slice(0, 2), grid: 17, material: 4, meetingRoom: 4, elevator: true },
  { xp: 54_000, title: '피트니스룸', unlock: '피트니스룸', floors: 3, exterior: 4, features: E4, grid: 18, material: 4, meetingRoom: 4, elevator: true },
  { xp: 74_000, title: '4층 유리 사옥', unlock: '4층과 카페 바', floors: 4, exterior: 5, features: [], grid: 19, material: 5, meetingRoom: 4, elevator: true },
  { xp: 100_000, title: '카페테리아', unlock: '카페테리아', floors: 4, exterior: 5, features: E5.slice(0, 1), grid: 20, material: 5, meetingRoom: 4, elevator: true },
  { xp: 135_000, title: '강당', unlock: '강당(회의실 20명)', floors: 4, exterior: 5, features: E5.slice(0, 2), grid: 21, material: 5, meetingRoom: 5, elevator: true },
  { xp: 185_000, title: '옥상 정원', unlock: '옥상 정원', floors: 4, exterior: 5, features: E5, grid: 21, material: 5, meetingRoom: 5, elevator: true },
  { xp: 250_000, title: '5층 타워', unlock: '5층과 스카이 라운지', floors: 5, exterior: 6, features: [], grid: 22, material: 5, meetingRoom: 5, elevator: true },
  { xp: 340_000, title: '트로피 홀', unlock: '트로피 홀', floors: 5, exterior: 6, features: ['nightLights'], grid: 23, material: 5, meetingRoom: 5, elevator: true },
  { xp: 460_000, title: '캠퍼스', unlock: '캠퍼스 광장·대표실', floors: 5, exterior: 7, features: ['nightLights'], grid: 24, material: 5, meetingRoom: 5, elevator: true },
]

export const MAX_LEVEL = LEVEL_TABLE.length
export const MAX_FLOORS = Math.max(...LEVEL_TABLE.map((r) => r.floors))

/** 레벨의 행 (1 미만은 Lv.1, 표보다 크면 마지막) */
export function levelRowOf(level: number): LevelRow {
  return LEVEL_TABLE[Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1)) - 1]
}

/** 회사 레벨 이름·경험치 문턱 (예전 이름 그대로) */
// title·unlock은 읽을 때 현재 언어로 (사전 키 level.<n> · level.<n>.unlock, 없으면 이 표의 한국어)
export const COMPANY_LEVELS = LEVEL_TABLE.map(({ xp, title, unlock }, i) => ({
  xp,
  get title() {
    return tx(`level.${i + 1}`, title)
  },
  get unlock() {
    return tx(`level.${i + 1}.unlock`, unlock)
  },
}))

export interface OfficeLevel {
  floors: number
  exterior: ExteriorStage
}

/** 층수·외관 단계 — 층은 Lv.6·10·14·18에서 하나씩 늘어 최대 5층 */
export const OFFICE_LEVELS: readonly OfficeLevel[] = LEVEL_TABLE.map(({ floors, exterior }) => ({ floors, exterior }))

/** 레벨 하나의 건물 구조. 층수가 필요하면 언제나 officeOf(level).floors */
export function officeOf(level: number): OfficeLevel {
  return OFFICE_LEVELS[LEVEL_TABLE.indexOf(levelRowOf(level))]
}

// ── 회의실 ──────────────────────────────────────────
// 회의실도 레벨에 따라 몇 단계로만 좋아진다: 테이블이 길어지고 앉을 수 있는 인원이 는다

/** 회의실 단계: 접이식 → 원목 → 오크 → 월넛 → 보드룸 → 강당 */
export type MeetingTier = 'folding' | 'wood' | 'oak' | 'walnut' | 'board' | 'hall'

export interface MeetingRoom {
  tier: MeetingTier
  /** 최대 참석 인원 (테이블 양쪽 줄에 반씩 앉는다) */
  capacity: number
}

const MEETING_ROOMS: readonly MeetingRoom[] = [
  { tier: 'folding', capacity: 8 }, // Lv.1~2
  { tier: 'wood', capacity: 10 }, // Lv.3~4
  { tier: 'oak', capacity: 12 }, // Lv.5~7
  { tier: 'walnut', capacity: 14 }, // Lv.8~9
  { tier: 'board', capacity: 16 }, // Lv.10~15 보드룸
  { tier: 'hall', capacity: 20 }, // Lv.16~20 강당
]
export const MEETING_ROOM_OF_LEVEL: readonly number[] = LEVEL_TABLE.map((r) => r.meetingRoom)

/** 레벨의 회의실 (최대 인원·디자인 단계). 인원 제한은 화면·본체 모두 이것만 쓴다 */
export function meetingRoomOf(level: number): MeetingRoom {
  return MEETING_ROOMS[levelRowOf(level).meetingRoom]
}

/** 회의실이 다음으로 커지는 레벨 (이미 가장 크면 null) */
export function nextMeetingRoomLevel(level: number): number | null {
  const now = meetingRoomOf(level).capacity
  for (let lv = Math.max(1, Math.floor(level) || 1) + 1; lv <= MAX_LEVEL; lv++) if (meetingRoomOf(lv).capacity > now) return lv
  return null
}

/** 경험치 → 회사 레벨. 한 번 오른 레벨은 내려가지 않는다(levelMax = 지금까지 오른 최고 레벨, office-iso-tech.md 5-3절) */
export function companyLevelOf(xp: number, levelMax = 1) {
  let level = 1
  for (let i = 0; i < MAX_LEVEL; i++) if (xp >= LEVEL_TABLE[i].xp) level = i + 1
  return Math.max(level, Math.min(MAX_LEVEL, Math.floor(levelMax) || 1))
}

/** 예전 10단계 레벨 문턱 (A1 이전 COMPANY_LEVELS) — 개편 첫날 옮길 소품 고르기·개편 안내에서 예전 레벨을 셀 때만 쓴다 */
const LEGACY_LEVEL_XP = [0, 150, 400, 800, 1_300, 2_000, 3_000, 4_500, 6_500, 9_000]

/** 회사 경험치 → 예전 10단계 레벨 */
export const legacyLevelOfXp = (xp: number) => LEGACY_LEVEL_XP.filter((t) => xp >= t).length

// ── 층 데이터 ──────────────────────────────────────────
// 어느 층에 어떤 팀·직원·회의가 있는지. 장면·미니맵·층 버튼·조직도가 같은 결과를 쓴다
// 저장된 팀 층(team.floor)은 고치지 않고 그릴 때만 보정한다 — 레벨이 다시 오르면 원래 층으로 돌아간다

type FloorTeam = Pick<Team, 'id' | 'kind' | 'floor'>
type FloorStaff = Pick<Staff, 'id' | 'teamId'>

export interface FloorData<S extends FloorStaff = Staff, T extends FloorTeam = Team, M extends Pick<Meeting, 'participantIds'> = Meeting> {
  /** 1부터 */
  floor: number
  /** 이 층에 자리 구역을 둘 팀 (1층에는 외부 프로젝트 팀도) */
  teams: T[]
  /** 이 층에 자리가 있는 직원 (무소속·외부 직원은 1층) */
  staff: S[]
  /** 층마다 회의실이 하나 있다. 여기서 열리는 진행 중 회의 */
  meetingRoom: { meetings: M[] }
}

/** 보고 있던 층·팀 층 보정: 이 레벨에 없는 층이면 1층 */
export function clampFloor(floor: number | undefined, level: number) {
  return floor !== undefined && Number.isInteger(floor) && floor >= 1 && floor <= officeOf(level).floors ? floor : 1
}

/**
 * 팀마다 그려질 층. 저장한 층(team.floor)이 있으면 그 층(이 레벨에 없으면 1층), 외부 프로젝트 팀은 1층
 * 층을 정하지 않은 고용 팀은 이 레벨의 층(LEVEL_TABLE floors)에 나눈다 (office-iso-spaces.md 1-4절 S3 A):
 * 인원이 많은 팀부터, 지금 사람이 가장 적은 층으로(같으면 낮은 층). 팀은 쪼개지 않는다.
 * staff를 주면 사람 수로 센다(무소속·외부 직원은 1층 몫). 주지 않으면 팀 하나를 한 명으로 센다(1층은 외부 팀이 있으면 한 몫 더).
 * 모든 층이 같은 크기라 "사람이 적은 층" = "자리가 남는 층"이다. 나눈 층은 저장하지 않는다 — 조직도에서 고르면 그때 저장
 */
export function teamFloors(teams: Pick<Team, 'id' | 'kind' | 'floor'>[], level: number, staff?: readonly Pick<Staff, 'teamId'>[]) {
  const floors = officeOf(level).floors
  const out = new Map<string, number>()
  const load = Array.from({ length: floors + 1 }, () => 0)
  const heads = new Map<string, number>()
  if (staff) {
    const known = new Set(teams.filter((t) => t.kind === 'hired').map((t) => t.id))
    for (const s of staff) {
      if (s.teamId && known.has(s.teamId)) heads.set(s.teamId, (heads.get(s.teamId) ?? 0) + 1)
      else load[1]++
    }
  } else if (teams.some((t) => t.kind !== 'hired')) load[1]++
  // 빈 팀도 한 몫으로 센다 — 0이면 빈 팀이 모두 한 층에 몰린다
  const weightOf = (id: string) => Math.max(1, heads.get(id) ?? 0)
  const free: Pick<Team, 'id'>[] = []
  for (const t of teams) {
    if (t.kind !== 'hired') out.set(t.id, 1)
    else if (t.floor != null) {
      out.set(t.id, clampFloor(t.floor, level))
      load[out.get(t.id)!] += weightOf(t.id)
    } else free.push(t)
  }
  // 정렬은 안정적이라 인원이 같으면 팀 순서 그대로
  free.sort((a, b) => weightOf(b.id) - weightOf(a.id))
  for (const t of free) {
    let best = 1
    for (let f = 2; f <= floors; f++) if (load[f] < load[best]) best = f
    out.set(t.id, best)
    load[best] += weightOf(t.id)
  }
  return out
}

/** 팀이 실제로 그려질 층 (teamFloors). teams를 주지 않으면 이 팀만 보고 정한다. 장면과 같은 층을 보이려면 staff도 넘긴다 */
export function teamFloor(team: FloorTeam, level: number, teams: FloorTeam[] = [team], staff?: readonly Pick<Staff, 'teamId'>[]) {
  return teamFloors(teams.includes(team) ? teams : [...teams, team], level, staff).get(team.id) ?? 1
}

/** 직원이 자리 잡을 층: 소속 팀의 층(teamFloors), 무소속·외부 직원은 1층. 장면과 같은 층을 보이려면 allStaff도 넘긴다 */
export function staffFloor(staff: Pick<Staff, 'teamId'>, teams: FloorTeam[], level: number, floorOfTeam?: Map<string, number>, allStaff?: readonly Pick<Staff, 'teamId'>[]) {
  const floors = floorOfTeam ?? teamFloors(teams, level, allStaff)
  return (staff.teamId && floors.get(staff.teamId)) || 1
}

/** 회의가 열릴 층: 참석자가 가장 많은 층, 같으면 낮은 층 */
export function meetingFloor(participantIds: string[], floorOf: (staffId: string) => number) {
  const counts = new Map<number, number>()
  for (const id of new Set(participantIds)) {
    const floor = floorOf(id)
    counts.set(floor, (counts.get(floor) ?? 0) + 1)
  }
  let best = 1
  let bestCount = 0
  for (const [floor, n] of counts) if (n > bestCount || (n === bestCount && floor < best)) [best, bestCount] = [floor, n]
  return best
}

/** 레벨의 층수만큼 층 데이터를 만든다 (meetings에는 진행 중인 회의만 넘긴다) */
export function buildFloors<S extends FloorStaff, T extends FloorTeam, M extends Pick<Meeting, 'participantIds'>>(level: number, staff: S[], teams: T[], meetings: M[]): FloorData<S, T, M>[] {
  const floorOfTeam = teamFloors(teams, level, staff)
  const floorOf = (id: string) => {
    const s = staff.find((x) => x.id === id)
    return s ? staffFloor(s, teams, level, floorOfTeam) : 1
  }
  return Array.from({ length: officeOf(level).floors }, (_, i) => {
    const floor = i + 1
    return {
      floor,
      teams: teams.filter((t) => floorOfTeam.get(t.id) === floor),
      staff: staff.filter((s) => staffFloor(s, teams, level, floorOfTeam) === floor),
      meetingRoom: { meetings: meetings.filter((m) => meetingFloor(m.participantIds, floorOf) === floor) },
    }
  })
}
