// 레벨업 연출 미리보기 (시제품 iso-preview.html?levelup=1) — 장면과 같은 levelUpFx로 그린다 (이디자 C3)
// &from=5&to=6 레벨 · &t=0.8 그 순간에 멈춤(캡처용, 없으면 되풀이 재생)
import { useEffect, useRef } from 'react'
import * as Phaser from 'phaser'
import { toWorld, type Origin } from '@shared/iso/grid'
import { roomOf } from '@shared/iso/levels'
import type { Rot } from '@shared/iso/furniture'
import { drawItem, drawRoom, finishKey, finishLabel, finishOf, roomTextureKey } from '../isoArt'
import { LEVEL_UP_FX_S, LevelUpFx } from '../levelUpFx'

const q = new URLSearchParams(location.search)
const FROM = Number(q.get('from')) || 5
const TO = Number(q.get('to')) || FROM + 1
const FREEZE = q.has('t') ? Number(q.get('t')) : null
const MARGIN = 40
const TOP_SPACE = 110

/** 방 구석의 책상 자리·소파·화분 (연출이 가구 위에 어떻게 보이는지) */
const FURNISH: [string, number, number, Rot][] = [
  ['monstera', 0, 0, 0],
  ['desk', 2, 1, 0],
  ['chair', 2, 2, 0],
  ['desk', 4, 1, 0],
  ['chair', 4, 2, 0],
  ['sofa-green', 1, 5, 1],
  ['monstera', 6, 0, 0],
]

class LevelUpDemoScene extends Phaser.Scene {
  private fx: LevelUpFx | null = null
  private t = 0

  constructor() {
    super('levelup-demo')
  }

  private roomTexture(level: number) {
    const room = roomOf(level, 1)
    const key = `iso-${roomTextureKey(room.cols, room.rows, finishOf(level))}`
    if (!this.textures.exists(key)) {
      const art = drawRoom(room.cols, room.rows, finishOf(level))
      this.textures.addCanvas(key, art.canvas)
      this.textures.get(key).customData = { anchor: art.anchor }
    }
    return { key, room, anchor: (this.textures.get(key).customData as { anchor: { x: number; y: number } }).anchor, img: this.textures.get(key).getSourceImage() as HTMLCanvasElement }
  }

  create() {
    const was = this.roomTexture(FROM)
    const now = this.roomTexture(TO)
    const o: Origin = { x: MARGIN + now.anchor.x, y: MARGIN + TOP_SPACE + now.anchor.y }
    this.add.image(MARGIN, MARGIN + TOP_SPACE, now.key).setOrigin(0, 0).setDepth(-10_000)
    FURNISH.forEach(([id, gx, gy, r], i) => {
      const art = drawItem(id, r)
      const key = `demo-${id}-${r}`
      if (!this.textures.exists(key)) this.textures.addCanvas(key, art.canvas)
      const p = toWorld(o, gx, gy)
      this.add.image(p.x, p.y, key).setOrigin(art.anchor.x / art.canvas.width, art.anchor.y / art.canvas.height).setDepth(gx + gy * 2 + i * 0.01)
    })
    const isFinishChanged = finishKey(finishOf(FROM)) !== finishKey(finishOf(TO))
    const lines: string[] = []
    if (was.room.cols !== now.room.cols) lines.push(`사무실이 넓어졌어요 · ${was.room.cols}×${was.room.rows} → ${now.room.cols}×${now.room.rows}칸`)
    if ([6, 10, 14, 18].includes(TO)) lines.push(`${[6, 10, 14, 18].indexOf(TO) + 2}층이 생겼어요`)
    if (isFinishChanged && (finishOf(FROM).floor !== finishOf(TO).floor || finishOf(FROM).wall !== finishOf(TO).wall)) lines.push(`새 바닥·벽 — ${finishLabel(finishOf(TO)).split(' · ').slice(1).join(' · ')}`)
    const make = () =>
      new LevelUpFx(this, { level: TO, o, from: was.room, to: now.room, oldFloor: isFinishChanged ? { texKey: was.key, anchor: was.anchor } : undefined, depth: 55_000, floorDepth: -10_000, lines })
    this.fx = make()
    if (FREEZE !== null) this.fx.seek(FREEZE)
    const w = MARGIN * 2 + now.img.width
    const h = MARGIN * 2 + TOP_SPACE + now.img.height
    const cam = this.cameras.main
    cam.setZoom(Math.min(cam.width / w, cam.height / h))
    cam.centerOn(w / 2, h / 2)
    this.events.on(Phaser.Scenes.Events.UPDATE, (_: number, dt: number) => {
      if (FREEZE !== null) return
      this.t += dt / 1000
      if (this.t > LEVEL_UP_FX_S + 0.8) {
        this.t = 0
        this.fx?.destroy()
        this.fx = make()
      } else this.fx?.step(dt / 1000)
    })
    Object.assign(window, { levelUpReady: true })
  }
}

export function LevelUpDemo() {
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = hostRef.current!
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, backgroundColor: '#15181e', pixelArt: true, scale: { mode: Phaser.Scale.NONE, width: host.clientWidth, height: host.clientHeight }, scene: [LevelUpDemoScene], banner: false })
    return () => game.destroy(true)
  }, [])
  return (
    <div className="flex h-screen flex-col bg-[#0d1014] text-white">
      <div className="px-4 py-2 text-xs text-white/70">
        레벨업 연출 · Lv.{FROM} → Lv.{TO}
        {FREEZE !== null ? ` · ${FREEZE.toFixed(2)}초` : ' · 되풀이 재생'}
      </div>
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  )
}
