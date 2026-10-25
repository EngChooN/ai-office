// 구역 기본 가구 묶음 (office-iso-spaces.md 3-3절 B안): 구역이 열리는 레벨에 지급하고 평면의 구역 칸에 정해 둔 위치로 놓는다
// 지급 개수는 여기 위치 목록에서 세어 ZONE_GRANTS(economy.ts)로 쓴다 — 구역마다 zonegrant:{구역} 키로 한 번씩 (레벨 지급 levelgrant:{n}과 따로)
// 구역 id는 바닥 종류 이름(kitchen·lounge·game·sleep·library·fitness·cafe·cafeteria·sky·ceo) 또는 같은 종류가 또 있으면 `이름:번호`
// 위치는 그 구역이 열리는 레벨의 층 안에서 정했다(앞쪽 가장자리를 쓴다 — 레벨이 올라 칸이 늘어도 바닥은 줄지 않는다). 시험(isoZones.test.mts)이 모든 레벨·층에서 놓이는지 본다

import { cellsOf, spotsOf, type GridPose } from './furniture.ts'
import type { ZoneRect } from './grid.ts'

export interface ZoneLayout {
  /** 이 레벨에 도달하면 지급·배치 */
  level: number
  floor: number
  items: readonly GridPose[]
}

const L = (itemId: string, gx: number, gy: number, rot: GridPose['rot'] = 0): GridPose => ({ itemId, gx, gy, rot })

export const ZONE_LAYOUTS: Readonly<Record<string, ZoneLayout>> = {
  // 1층 앞 왼쪽: 휴게 코너(Lv.3) → 탕비실(Lv.7) → 카페테리아(Lv.15)
  lounge: { level: 3, floor: 1, items: [L('lv-studio-sofa', 1, 7), L('zone-low-table', 1, 8), L('lv-studio-sofa', 1, 9, 2)] },
  kitchen: { level: 7, floor: 1, items: [L('lv-fridge', 0, 10), L('lv-vending', 2, 10), L('zone-high-table', 4, 10), L('zone-high-table', 4, 12)] },
  cafeteria: {
    level: 15,
    floor: 1,
    items: [
      L('lv-long-table', 1, 15),
      ...[1, 2, 3, 4].map((x) => L('lv-bar-stool', x, 14)),
      ...[1, 2, 3, 4].map((x) => L('lv-bar-stool', x, 17, 2)),
      L('lv-salad-bar', 6, 15),
    ],
  },
  // 2층(ㄱ자): 층이 생기는 Lv.6에 쉴 곳부터, 게임 존(Lv.9)·도서관(Lv.12)
  'lounge:2': { level: 6, floor: 2, items: [L('lv-studio-sofa', 1, 7), L('zone-low-table', 1, 8), L('lv-studio-sofa', 1, 9, 2)] },
  game: { level: 9, floor: 2, items: [L('lv-pingpong', 1, 11), L('zone-bistro', 5, 12)] },
  library: {
    level: 12,
    floor: 2,
    items: [L('lv-tall-bookshelf', 7, 12), L('lv-tall-bookshelf', 9, 12), L('zone-low-table', 8, 14), L('lv-reading-chair', 8, 15, 2), L('lv-reading-chair', 9, 15, 2)],
  },
  // 3층(ㄷ자): 엘리베이터 홀 벤치(Lv.10, 오른쪽 날개) · 수면실(Lv.11, 왼쪽 날개) · 피트니스(Lv.13, 오른쪽 날개)
  'lounge:3': { level: 10, floor: 3, items: [L('lv-hall-bench', 12, 13), L('zone-bistro', 14, 12)] },
  sleep: { level: 11, floor: 3, items: [L('lv-sleep-pod', 0, 12), L('lv-sleep-pod', 1, 12), L('lv-sleep-pod', 2, 12), L('lv-shower', 0, 14), L('lv-shower', 2, 14)] },
  fitness: { level: 13, floor: 3, items: [L('lv-dumbbell', 12, 14), L('lv-dumbbell', 14, 14), L('lv-dumbbell', 16, 14)] },
  // 4층(T자): 카페 바(Lv.14) — 앞쪽 가운데 줄기
  cafe: {
    level: 14,
    floor: 4,
    items: [L('lv-espresso-bar', 5, 14), L('lv-bar-stool', 6, 15, 2), L('lv-bar-stool', 7, 15, 2), L('lv-bar-stool', 8, 15, 2), L('zone-bistro', 10, 15), L('zone-bistro', 10, 17)],
  },
  // 5층(탑): 스카이 라운지(Lv.18) · 대표실(Lv.20)
  sky: { level: 18, floor: 5, items: [L('lv-lounge-sofa', 8, 12, 2), L('zone-low-table', 8, 11), L('lv-telescope', 13, 13)] },
  ceo: { level: 20, floor: 5, items: [L('lv-ceo-desk', 10, 19), L('lv-reading-chair', 11, 21, 2), L('lv-trophy-case', 14, 19), L('lv-hall-of-fame', 7, 19)] },
}

/** 위치 목록에서 센 레벨별 지급 개수 { 레벨: { 품목: 개수 } } */
export function zoneGrantCounts(layouts: Readonly<Record<string, ZoneLayout>>): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {}
  for (const z of Object.values(layouts)) {
    const row = (out[z.level] ??= {})
    for (const it of z.items) row[it.itemId] = (row[it.itemId] ?? 0) + 1
  }
  return out
}

/** 구역별 지급 개수 { 구역 id: { 품목: 개수 } } — 지급 키 zonegrant:{구역} 한 번에 이만큼 */
export function zoneGrantsById(layouts: Readonly<Record<string, ZoneLayout>>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [id, z] of Object.entries(layouts)) {
    const row = (out[id] ??= {})
    for (const it of z.items) row[it.itemId] = (row[it.itemId] ?? 0) + 1
  }
  return out
}

/** 그 레벨·층에 열린 구역의 바닥 사각형 — 놓은 가구 칸과 서는·앉는 자리를 감싸는 가장 작은 사각형 (planOf가 room.zones에 넣는다) */
export function zoneRectsOf(level: number, floor: number, layouts: Readonly<Record<string, ZoneLayout>> = ZONE_LAYOUTS): ZoneRect[] {
  const out: ZoneRect[] = []
  for (const [id, z] of Object.entries(layouts)) {
    if (z.floor !== floor || z.level > level) continue
    const pts = z.items.flatMap((it) => [...cellsOf(it), ...spotsOf(it)])
    const [x0, x1] = [Math.min(...pts.map((c) => c.gx)), Math.max(...pts.map((c) => c.gx))]
    const [y0, y1] = [Math.min(...pts.map((c) => c.gy)), Math.max(...pts.map((c) => c.gy))]
    out.push({ id, gx: x0, gy: y0, w: x1 - x0 + 1, d: y1 - y0 + 1 })
  }
  return out
}
