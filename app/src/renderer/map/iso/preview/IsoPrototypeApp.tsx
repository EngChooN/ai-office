// 아이소메트릭 칸 배치 시제품 화면: 맵(Phaser) + 위 막대(방 크기·꾸미기·성능 시험) + 아래 서랍 + 든 가구 버튼
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Phaser from 'phaser'
import { CheckIcon, PackageIcon, RotateCwIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sizeOf, type Rot } from '@shared/iso/furniture'
import { drawItem, type Material } from '../isoArt'
import { ITEM_NAME, IsoPrototypeScene, KINDS, type PerfResult, type ProtoItem, type ProtoState } from '../IsoPrototypeScene'

const params = new URLSearchParams(location.search)
// 폰 폭(840 미만) 버튼 높이 40px — 앱 폰 배치(phone:min-h-10)와 같게
const PHONE_H = 'max-[839px]:min-h-10'
/** 캡처 주소의 예전 이름 (take=sofa|plant) */
const TAKE_ALIAS: Record<string, ProtoItem> = { sofa: 'sofa-green', plant: 'monstera' }
const isTouchDevice = params.get('touch') === '1' || window.matchMedia('(pointer: coarse)').matches

export function IsoPrototypeApp() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<IsoPrototypeScene | null>(null)
  const [state, setState] = useState<ProtoState | null>(null)
  const [perf, setPerf] = useState<PerfResult | null>(null)
  const [isMeasuring, setIsMeasuring] = useState(false)
  const thumbs = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, drawItem(k, 0).canvas.toDataURL()])) as Record<ProtoItem, string>, [])

  // 맵: 기기 픽셀 크기로 그리고 CSS로 줄여 또렷하게 (사무실 맵과 같은 방식)
  useEffect(() => {
    const host = hostRef.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = () => ({ w: Math.max(1, Math.round(host.clientWidth * dpr)), h: Math.max(1, Math.round(host.clientHeight * dpr)) })
    const { w, h } = size()
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, backgroundColor: '#15181e', pixelArt: true, scale: { mode: Phaser.Scale.NONE, width: w, height: h }, scene: [IsoPrototypeScene], banner: false })
    const layout = () => {
      const s = size()
      if (game.scale.width !== s.w || game.scale.height !== s.h) game.scale.resize(s.w, s.h)
      game.canvas.style.width = `${s.w / dpr}px`
      game.canvas.style.height = `${s.h / dpr}px`
      game.scale.refresh()
    }
    const ro = new ResizeObserver(layout)
    game.events.once(Phaser.Core.Events.READY, () => {
      layout()
      ro.observe(host)
    })
    // 장면이 만들어지면 스스로 알린다
    game.events.once('iso-ready', (sc: IsoPrototypeScene) => {
      sc.setTouch(isTouchDevice)
      // 캡처·성능 측정 스크립트가 상태를 읽는다 (미리보기 전용)
      Object.assign(window, { isoScene: sc })
      sc.events.on('state', setState)
      setScene(sc)
      setState(sc.getState())
    })
    return () => {
      ro.disconnect()
      game.destroy(true)
    }
  }, [])

  // 주소 쿼리로 캡처할 상태를 만든다: size=20 · staff=n · m=1~5(재질 단계) · decorate=1 · take=desk · rot=1 · at=3,4 · perf=1
  useEffect(() => {
    if (!scene) return
    const size = Number(params.get('size') || 10)
    if (size !== 10 || params.get('staff')) scene.setRoom(size, Number(params.get('staff') || 2))
    const m = Number(params.get('m'))
    if (m >= 1 && m <= 5) scene.setMaterial(m as Material)
    if (params.get('decorate') === '1') scene.setDecorating(true)
    const raw = params.get('take')
    const take = raw ? (TAKE_ALIAS[raw] ?? (raw as ProtoItem)) : null
    if (take && KINDS.includes(take)) {
      scene.take(take)
      for (let i = 0; i < Number(params.get('rot') || 0); i++) scene.rotate()
      const at = params.get('at')?.split(',').map(Number)
      if (at?.length === 2) scene.moveHoldingTo(at[0], at[1])
    }
    if (params.get('perf') === '1') void measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  const measure = async () => {
    if (!scene) return
    setIsMeasuring(true)
    setPerf(null)
    setPerf(await scene.runPerf(Number(params.get('furniture') || 60), Number(params.get('staffN') || 20), Number(params.get('seconds') || 5)))
    setIsMeasuring(false)
  }

  const holding = state?.holding ?? null
  const isDecorating = state?.isDecorating ?? false

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <header className="max-[839px]:justify-end flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h1 className="max-[839px]:sr-only mr-auto text-sm font-semibold">사무실 칸 배치 시제품</h1>
        <div className="flex rounded-md border p-0.5">
          {[10, 20].map((n) => (
            <Button key={n} size="sm" variant={state?.size === n ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => scene?.setRoom(n)}>
              {n}×{n}
            </Button>
          ))}
        </div>
        <div className="flex rounded-md border p-0.5" title="바닥·벽 재질 단계 (방 크기의 레벨표 단계가 기본)">
          {([1, 2, 3, 4, 5] as Material[]).map((m) => (
            <Button key={m} size="sm" variant={state?.material === m ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => scene?.setMaterial(m)}>
              M{m}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
          <a href="?gallery=1">그림 모음</a>
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!scene || isMeasuring} onClick={() => void measure()}>
          {isMeasuring ? '재는 중…' : '성능 시험'}
        </Button>
        <Button size="sm" variant={isDecorating ? 'default' : 'outline'} className="h-7 text-xs" disabled={!scene} onClick={() => scene?.setDecorating(!isDecorating)}>
          <PackageIcon /> 꾸미기
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0 touch-none" />
        <div className="text-muted-foreground pointer-events-none absolute top-2 left-3 text-[11px] tabular-nums">
          {state && `${state.fps} fps · 가구 ${state.furniture} · 직원 ${state.staff} (앉음 ${state.seated})`}
        </div>
        {perf && <PerfCard perf={perf} />}
        {holding && (
          <HoldBar
            ok={holding.ok}
            reason={holding.reason}
            itemId={holding.itemId}
            rot={holding.rot}
            onRotate={() => scene?.rotate()}
            onConfirm={() => scene?.confirm()}
            onStow={() => scene?.stow()}
            onCancel={() => scene?.cancel()}
          />
        )}
      </div>

      {isDecorating && (
        <section aria-label="서랍" className="bg-card border-t px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-[11px]">
            <span className="text-foreground font-semibold">서랍</span>
            <span>{isTouchDevice ? '눌러 꺼내고, 끌어서 옮긴 뒤 ✓로 놓아요. 놓인 가구를 누르면 다시 집어요.' : '눌러 꺼내 클릭으로 놓아요 · R·오른쪽 클릭 돌리기 · Delete 서랍에 넣기 · Esc 취소 · 놓인 가구 클릭 = 다시 집기'}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {KINDS.map((k) => {
              const left = state?.drawer[k] ?? 0
              const { w, d } = sizeOf(k, 0)
              return (
                <button
                  key={k}
                  type="button"
                  disabled={left === 0}
                  onClick={() => scene?.take(k)}
                  className={cn('bg-background hover:bg-accent flex w-24 shrink-0 flex-col items-center gap-0.5 rounded-lg border p-1.5 text-xs disabled:opacity-40', holding?.itemId === k && !holding.from && 'border-primary')}
                >
                  <img src={thumbs[k]} alt="" className="h-12 object-contain [image-rendering:pixelated]" />
                  <span>{ITEM_NAME[k]}</span>
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    {w}×{d}칸 · {left}개
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

/** 든 가구: 놓을 수 있는지 한 줄 + 돌리기·놓기·서랍에 넣기·취소 (폰은 버튼 40px) */
function HoldBar(props: { ok: boolean; reason: string | null; itemId: ProtoItem; rot: Rot; onRotate: () => void; onConfirm: () => void; onStow: () => void; onCancel: () => void }) {
  const { w, d } = sizeOf(props.itemId, props.rot)
  return (
    <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5 px-2">
      <div role="status" className={cn('bg-card rounded-md border px-2 py-1 text-xs font-medium shadow', props.ok ? 'border-status-working text-status-working' : 'border-status-error text-status-error')}>
        {ITEM_NAME[props.itemId]} {w}×{d}칸 · {props.ok ? '여기에 놓을 수 있어요' : (props.reason ?? '')}
      </div>
      <div className="bg-card/95 flex justify-center gap-1.5 rounded-lg border p-1.5 shadow-lg">
        <Button size="sm" variant="outline" className={PHONE_H} onClick={props.onRotate}>
          <RotateCwIcon /> 돌리기 <kbd className="max-[839px]:hidden text-muted-foreground text-[10px]">R</kbd>
        </Button>
        <Button size="sm" className={PHONE_H} disabled={!props.ok} onClick={props.onConfirm}>
          <CheckIcon /> 놓기
        </Button>
        <Button size="sm" variant="outline" className={PHONE_H} onClick={props.onStow}>
          <PackageIcon /> 서랍으로
        </Button>
        <Button size="sm" variant="ghost" className={PHONE_H} onClick={props.onCancel}>
          <Undo2Icon /> 취소
        </Button>
      </div>
    </div>
  )
}

function PerfCard({ perf }: { perf: PerfResult }) {
  return (
    <div className="bg-card/95 absolute top-8 left-3 rounded-lg border p-2 text-xs tabular-nums shadow-lg">
      <div className="mb-1 font-semibold">
        성능 시험 — 가구 {perf.furniture} · 직원 {perf.staff} · {perf.seconds}초
      </div>
      <div>
        평균 <b>{perf.avgFps} fps</b> · 느린 5% 프레임 {perf.p95FrameMs}ms
      </div>
      <div className="text-muted-foreground">
        프레임당 직원·정렬 {perf.updateMs}ms · 그리기 {perf.renderMs}ms
      </div>
    </div>
  )
}
