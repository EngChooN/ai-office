// 아이소메트릭 그림 모음 (시제품 iso-preview.html?gallery=1) — isoArt.ts로 그린 품목 4방향·재질 단계·직원·고정 칸을 한 화면에
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SHOP_ITEMS } from '@shared/economy'
import { FURNITURE, specOf, type Rot } from '@shared/iso/furniture'
import { HH, HW, PIXEL } from '@shared/iso/grid'
import {
  artMeetingRoom,
  artName,
  drawItem,
  drawPersonSet,
  drawRoom,
  drawThumb,
  finishLabel,
  finishOf,
  hasArt,
  lookOf,
  PROP_KEYS,
  STAGE_FINISH,
  toCanvas,
  type Finish,
  type Material,
} from '../isoArt'

const ROTS: Rot[] = [0, 1, 2, 3]
const GROUPS = [
  { id: 'level', title: '레벨 전용 가구', ids: Object.keys(FURNITURE).filter((id) => id.startsWith('lv-')) },
  { id: 'shop', title: '상점 가구', ids: SHOP_ITEMS.filter((i) => i.category === 'furniture').map((i) => i.id) },
  { id: 'gear', title: '상점 책상·의자 (gear)', ids: SHOP_ITEMS.filter((i) => i.category === 'desk' || i.category === 'chair').map((i) => i.id) },
  { id: 'prop', title: '고정 소품 prop-*', ids: PROP_KEYS.map((k) => `prop-${k}`) },
  { id: 'base', title: '기본 자리 · 고정 칸', ids: ['desk', 'chair', 'plant', 'fixed-stairs', 'fixed-elevator', 'fixed-entrance'] },
] as const
type Tab = (typeof GROUPS)[number]['id'] | 'rooms' | 'people'

/** 방 + 기본 자리 한 벌 (재질 단계 미리보기) */
function roomPreview(f: Finish, n = 6) {
  const room = drawRoom(n, n, f)
  const ctx = room.canvas.getContext('2d')!
  const put = (itemId: string, gx: number, gy: number, r: Rot) => {
    const a = drawItem(itemId, r)
    ctx.drawImage(a.canvas, Math.round(room.anchor.x + (gx - gy) * HW * PIXEL - a.anchor.x), Math.round(room.anchor.y + (gx + gy) * HH * PIXEL - a.anchor.y))
  }
  // 뒤 → 앞 순서로 (미리보기라 깊이 정렬 없이 순서만 맞춘다)
  put('plant', n - 1, 0, 0)
  put('chair', 1, 1, 0)
  put('desk', 1, 2, 0)
  put('desk', 3, 3, 1)
  put('chair', 4, 3, 1)
  put('sofa-green', 0, n - 2, 3)
  return room.canvas.toDataURL()
}

function meetingPreview() {
  const pieces = artMeetingRoom(4, 3, 1)
  const canvas = document.createElement('canvas')
  const pad = 16
  canvas.width = (7 * HW + pad * 2) * PIXEL
  canvas.height = (7 * HH + 30 + pad * 2) * PIXEL
  const ctx = canvas.getContext('2d')!
  const o = { x: (3 * HW + pad) * PIXEL, y: (30 + pad) * PIXEL }
  const at = (c: HTMLCanvasElement, ax: number, ay: number, gx = 0, gy = 0) => ctx.drawImage(c, o.x + (gx - gy) * HW * PIXEL - ax, o.y + (gx + gy) * HH * PIXEL - ay)
  for (const p of pieces.filter((p) => p.kind === 'floor' || p.box.y < 2.5)) at(toCanvas(p.cv), p.o[0] * PIXEL, p.o[1] * PIXEL)
  const t = drawItem('lv-meeting-table', 0)
  at(t.canvas, t.anchor.x, t.anchor.y, 1, 0)
  for (const p of pieces.filter((p) => p.kind === 'wall' && p.box.y >= 2.5)) at(toCanvas(p.cv), p.o[0] * PIXEL, p.o[1] * PIXEL)
  return canvas.toDataURL()
}

export function IsoArtGallery() {
  const [tab, setTab] = useState<Tab>('rooms')
  const [isThumb, setIsThumb] = useState(false)
  const rooms = useMemo(() => (tab === 'rooms' ? { stages: ([1, 2, 3, 4, 5] as Material[]).map((m) => ({ m, label: finishLabel(STAGE_FINISH[m]), src: roomPreview(STAGE_FINISH[m]) })), levels: [1, 3, 5, 8, 10, 12, 14, 18, 20].map((L) => ({ L, label: finishLabel(finishOf(L)), src: drawRoom(5, 5, finishOf(L)).canvas.toDataURL() })), meeting: meetingPreview() } : null), [tab])
  const group = GROUPS.find((g) => g.id === tab)
  const items = useMemo(() => group?.ids.map((id) => ({ id, name: artName(id), size: specOf(id).size, art: hasArt(id), thumb: drawThumb(id).toDataURL(), rots: ROTS.map((r) => drawItem(id, r).canvas.toDataURL()) })) ?? [], [group])
  const people = useMemo(
    () =>
      tab === 'people'
        ? [0, 3, 6, 9].map((n) => {
            const set = drawPersonSet(lookOf(n))
            return Object.entries(set).map(([k, c]) => ({ k, src: c.toDataURL() }))
          })
        : [],
    [tab],
  )

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h1 className="mr-auto text-sm font-semibold">아이소메트릭 그림 모음 (A 파스텔)</h1>
        {[{ id: 'rooms', title: '바닥·벽' }, ...GROUPS, { id: 'people', title: '직원' }].map((g) => (
          <Button key={g.id} size="sm" variant={tab === g.id ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setTab(g.id as Tab)}>
            {g.title}
          </Button>
        ))}
        {group && (
          <Button size="sm" variant={isThumb ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setIsThumb(!isThumb)}>
            미리보기 카드
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
          <a href="?">시제품으로</a>
        </Button>
      </header>

      <main className="p-3">
        {rooms && (
          <>
            <h2 className="text-primary mb-2 text-sm font-semibold">재질 단계 M1~M5 (대표 마감)</h2>
            <div className="flex flex-wrap gap-3">
              {rooms.stages.map((s) => (
                <figure key={s.m} className="bg-card rounded-lg border p-2">
                  <img src={s.src} alt="" className="h-56 [image-rendering:pixelated]" />
                  <figcaption className="text-muted-foreground mt-1 text-xs">{s.label}</figcaption>
                </figure>
              ))}
            </div>
            <h2 className="text-primary mt-4 mb-2 text-sm font-semibold">레벨별 마감 (레벨표 2-2절)</h2>
            <div className="flex flex-wrap gap-3">
              {rooms.levels.map((l) => (
                <figure key={l.L} className="bg-card rounded-lg border p-2">
                  <img src={l.src} alt="" className="h-36 [image-rendering:pixelated]" />
                  <figcaption className="text-muted-foreground mt-1 text-xs">
                    Lv.{l.L} · {l.label}
                  </figcaption>
                </figure>
              ))}
            </div>
            <h2 className="text-primary mt-4 mb-2 text-sm font-semibold">회의실 고정 칸 (바닥 + 유리 칸막이)</h2>
            <img src={rooms.meeting} alt="" className="bg-card rounded-lg border p-2 [image-rendering:pixelated]" />
          </>
        )}

        {group && (
          <div className="flex flex-wrap items-end gap-2">
            {items.map((it) =>
              isThumb ? (
                // 상점 카드·서랍 칸 크기(w-24)에서 어떻게 보이는지
                <div key={it.id} className="bg-card flex w-24 flex-col items-center gap-0.5 rounded-lg border p-1.5 text-xs">
                  <img src={it.thumb} alt="" className="h-12 object-contain [image-rendering:pixelated]" />
                  <span className="truncate">{it.name}</span>
                  <span className="text-muted-foreground text-[10px] tabular-nums">{it.size.join('×')}칸</span>
                </div>
              ) : (
                <figure key={it.id} className={cn('bg-card rounded-lg border p-2', !it.art && 'border-status-error')}>
                  <div className="flex items-end gap-2">
                    {it.rots.map((src, r) => (
                      <img key={r} src={src} alt={`r${r}`} className="[image-rendering:pixelated]" style={{ zoom: 0.5 }} />
                    ))}
                  </div>
                  <figcaption className="text-muted-foreground mt-1 text-xs">
                    <b className="text-foreground">{it.name}</b> {it.id} · {it.size.join('×')}
                    {!it.art && <span className="text-status-error"> · 임시 상자</span>}
                  </figcaption>
                </figure>
              ),
            )}
          </div>
        )}

        {tab === 'people' && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">서기·걷기1·걷기2·앉기 × 앞(↙)/뒤(↖). ↘·↗은 좌우 반전 (3배 확대)</p>
            {people.map((row, i) => (
              <div key={i} className="flex gap-3">
                {row.map((p) => (
                  <figure key={p.k} className="text-center">
                    <img src={p.src} alt="" className="[image-rendering:pixelated]" style={{ zoom: 1.5 }} />
                    <figcaption className="text-muted-foreground text-[10px]">{p.k}</figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
