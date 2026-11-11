import type { DuoName } from '@shared/iconText'

/** 그림 조각 — fill이면 닫힌 모양이라 듀오톤 채움에도 그린다 */
export type DuoPart =
  | { t: 'path'; d: string; fill?: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill?: boolean }

// 24 격자 좌표 — 디자인 시안 docs/design-refresh/icons/icon-sets.html 의 ICONS를 그대로 옮겼다 (손으로 고치지 말고 시안을 고친 뒤 다시 옮긴다)
export const DUO_ICON_DATA: Record<DuoName, readonly DuoPart[]> = {
  done: [{ t: 'circle', cx: 12, cy: 12, r: 9, fill: true }, { t: 'path', d: 'M8 12.4l2.8 2.8L16.2 9.6' }],
  warn: [{ t: 'path', d: 'M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3Z', fill: true }, { t: 'path', d: 'M12 9.5v4.2' }, { t: 'path', d: 'M12 17h.01' }],
  reject: [{ t: 'circle', cx: 12, cy: 12, r: 9, fill: true }, { t: 'path', d: 'M9 9l6 6M15 9l-6 6' }],
  ask: [{ t: 'path', d: 'M5 4.5h14a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z', fill: true }, { t: 'path', d: 'M9.8 8.8a2.3 2.3 0 1 1 3.1 2.2c-.6.2-.9.7-.9 1.3' }, { t: 'path', d: 'M12 14.6h.01' }],
  ai: [{ t: 'rect', x: 4.5, y: 8, w: 15, h: 12, rx: 3.5, fill: true }, { t: 'path', d: 'M12 8V5.2' }, { t: 'circle', cx: 12, cy: 4, r: 1.2 }, { t: 'path', d: 'M9.4 13.2h.01' }, { t: 'path', d: 'M14.6 13.2h.01' }, { t: 'path', d: 'M10 16.6h4' }, { t: 'path', d: 'M2.5 12.5v3M21.5 12.5v3' }],
  repeat: [{ t: 'path', d: 'M17 2.8l3 3-3 3' }, { t: 'path', d: 'M4 11.2v-.7a4.7 4.7 0 0 1 4.7-4.7H20' }, { t: 'path', d: 'M7 21.2l-3-3 3-3' }, { t: 'path', d: 'M20 12.8v.7a4.7 4.7 0 0 1-4.7 4.7H4' }],
  schedule: [{ t: 'circle', cx: 12, cy: 13, r: 8.2, fill: true }, { t: 'path', d: 'M12 9v4.2l2.8 1.8' }, { t: 'path', d: 'M4.5 4.5l2.5-2M19.5 4.5l-2.5-2' }],
  manual: [{ t: 'path', d: 'M5 4.8A2 2 0 0 1 7 2.8h12v14.4H7a2 2 0 0 0-2 2Z', fill: true }, { t: 'path', d: 'M5 19.2a2 2 0 0 0 2 2h12v-4' }, { t: 'path', d: 'M9 7.5h6M9 11h4' }],
  lab: [{ t: 'path', d: 'M10.2 3v6.2L5 18.4A1.8 1.8 0 0 0 6.6 21h10.8a1.8 1.8 0 0 0 1.6-2.6L13.8 9.2V3Z', fill: true }, { t: 'path', d: 'M8.6 3h6.8' }, { t: 'path', d: 'M7.4 15h9.2' }],
  meeting: [{ t: 'rect', x: 4.8, y: 4.2, w: 14.4, h: 17, rx: 2.4, fill: true }, { t: 'path', d: 'M9 2.8h6v3H9z' }, { t: 'path', d: 'M8.6 11h6.8M8.6 14.8h4.6' }],
  plan: [{ t: 'path', d: 'M3 7.2a2 2 0 0 1 2-2h4.2l2 2.2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z', fill: true }, { t: 'path', d: 'M7.5 12.5h9M7.5 16h5.5' }],
  money: [{ t: 'circle', cx: 12, cy: 12, r: 9, fill: true }, { t: 'path', d: 'M7.8 8.2l1.9 7.6 2.3-5.6 2.3 5.6 1.9-7.6' }, { t: 'path', d: 'M7 12h10' }],
  phone: [{ t: 'rect', x: 6.8, y: 2.5, w: 10.4, h: 19, rx: 2.6, fill: true }, { t: 'path', d: 'M10.8 18.4h2.4' }],
  remote: [{ t: 'circle', cx: 12, cy: 12, r: 9, fill: true }, { t: 'path', d: 'M3 12h18' }, { t: 'path', d: 'M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3Z' }],
  pause: [{ t: 'circle', cx: 12, cy: 12, r: 9, fill: true }, { t: 'path', d: 'M10 9v6M14 9v6' }],
  party: [{ t: 'path', d: 'M3.5 20.5 8.4 8.6l7 7Z', fill: true }, { t: 'path', d: 'M13.5 3.2v2M20.8 10.5h-2M18.3 5.7l-1.4 1.4' }, { t: 'path', d: 'M10.5 4.5h.01' }, { t: 'path', d: 'M19.5 15h.01' }, { t: 'path', d: 'M13 8.5c1-1.6 2.6-2.2 4-1.6' }],
  trophy: [{ t: 'path', d: 'M7 3.5h10v5.3a5 5 0 0 1-10 0Z', fill: true }, { t: 'path', d: 'M7 5.5H4.6v1.3a3 3 0 0 0 3 3' }, { t: 'path', d: 'M17 5.5h2.4v1.3a3 3 0 0 1-3 3' }, { t: 'path', d: 'M12 13.8v3.6' }, { t: 'path', d: 'M8.5 21h7M9.8 17.4h4.4' }],
  like: [{ t: 'path', d: 'M7 10.2v10.6H4.6A1.6 1.6 0 0 1 3 19.2v-7.4a1.6 1.6 0 0 1 1.6-1.6Z', fill: true }, { t: 'path', d: 'M7 10.2l3.8-7a2 2 0 0 1 2.9 2.1L13 9.2h5.6a2 2 0 0 1 2 2.4l-1.5 7.4a2.3 2.3 0 0 1-2.3 1.8H7' }],
  new: [{ t: 'path', d: 'M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9Z', fill: true }, { t: 'path', d: 'M18.5 15v5M16 17.5h5' }],
  bug: [{ t: 'path', d: 'M8 10.5a4 4 0 0 1 8 0v4.8a4 4 0 0 1-8 0Z', fill: true }, { t: 'path', d: 'M12 10.5V19' }, { t: 'path', d: 'M4 13.5h4M16 13.5h4M5 8.8l3 1.8M19 8.8l-3 1.8M5 19.5l3-1.8M19 19.5l-3-1.8' }, { t: 'path', d: 'M10.2 6.8 9 4.8M13.8 6.8 15 4.8' }],
}
