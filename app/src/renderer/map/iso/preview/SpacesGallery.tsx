// 디자인 보강 1단계 시안 (시제품 iso-preview.html?spaces=1) — 외관 E1~E7 · 회의실 6단계 · 휴게 공간 · 비정사각 평면 (이디자)
// &part=exterior|meeting|lounge|plan 으로 한 묶음만 (캡처용). 그림은 spacesDraft.ts — 앱은 쓰지 않는다
import { useEffect, useRef } from 'react'
import { toCanvas, type Cv } from '../isoArt'
import { EXTERIOR_STAGES, exteriorScene, LOUNGE_SCENES, MEETING_STAGES, meetingScene, PLAN_PIECES, planDemoObjs, PLANS, planScene } from './spacesDraft'

function Art({ make, scale = 2 }: { make: () => Cv; scale?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host) return
    const canvas = toCanvas(make(), scale)
    canvas.style.imageRendering = 'pixelated'
    host.replaceChildren(canvas)
  }, [make, scale])
  return <div ref={ref} />
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-1 rounded-lg bg-[#15181e] p-3">
      {children}
      <figcaption className="text-xs text-white/70">
        <b className="text-white">{title}</b>
        {note && <div>{note}</div>}
      </figcaption>
    </figure>
  )
}

const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-primary mt-2 mb-2 text-sm font-semibold">{children}</h2>

function Exterior() {
  const q = new URLSearchParams(location.search)
  const isNight = q.get('night') === '1'
  // &scale=1 → 캡처용으로 작게
  const scale = Number(q.get('scale')) || 2
  return (
    <>
      <H>지적 1 · 외관 E1~E7 — 하늘 위에 뜬 땅 한 판(디오라마), 건물은 층 평면을 줄여 쌓음 {isNight ? '· 밤' : '· 낮'}</H>
      <div className="flex flex-wrap items-end gap-3">
        {EXTERIOR_STAGES.map((s) => (
          <Card key={s.stage} title={`${s.name} (${s.levels})`} note={s.note}>
            <Art make={() => exteriorScene(s, isNight)} scale={scale} />
          </Card>
        ))}
        <Card title="E6 밤" note="불 켜진 창·가로등 빛만 남기고 남색으로 어둡게">
          <Art make={() => exteriorScene(EXTERIOR_STAGES[5], true)} scale={scale} />
        </Card>
      </div>
    </>
  )
}

function Meeting() {
  return (
    <>
      <H>지적 3 · 회의실 기본 테이블 6단계 — 의자 수 = 정원 (김기획 1-5 크기, 레벨의 방 마감 위)</H>
      <div className="flex flex-wrap items-end gap-3">
        {MEETING_STAGES.map((st) => (
          <Card key={st.key} title={`${st.name} · ${st.levels} · 정원 ${st.cap} · ${st.w}×${st.d}`} note={st.note}>
            <Art make={() => meetingScene(st)} />
          </Card>
        ))}
      </div>
    </>
  )
}

function Lounge() {
  return (
    <>
      <H>지적 4·5 · 휴게 공간 — 벽 없는 구역(바닥재로 구분) + 기본 가구 묶음</H>
      <div className="flex flex-wrap items-end gap-3">
        {LOUNGE_SCENES.map((s) => (
          <Card key={s.key} title={s.title} note={s.note}>
            <Art make={s.draw} />
          </Card>
        ))}
      </div>
    </>
  )
}

function Plan() {
  return (
    <>
      <H>비정사각 평면 — 칸 표로 바닥판·벽·유리벽·난간을 1칸 조각으로 (김기획 1-3 평면 그대로, 1배)</H>
      <div className="flex flex-wrap items-end gap-3">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((k) => (
          <Card key={k} title={PLANS[k].title}>
            <Art make={() => planScene(PLANS[k].mask, planDemoObjs(k))} scale={1} />
          </Card>
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-white/70">
        {PLAN_PIECES.map((p) => (
          <li key={p.key}>
            <b className="text-white">{p.name}</b> — {p.where}
          </li>
        ))}
      </ul>
    </>
  )
}

export function SpacesGallery() {
  const part = new URLSearchParams(location.search).get('part')
  return (
    <div className="min-h-screen bg-[#0d1014] p-5 text-white">
      <h1 className="mb-1 text-sm font-semibold">새 사무실 디자인 보강 — 그림 시안 (docs/specs/office-iso-spaces.md 2절)</h1>
      {(!part || part === 'exterior') && <Exterior />}
      {(!part || part === 'meeting') && <Meeting />}
      {(!part || part === 'lounge') && <Lounge />}
      {(!part || part === 'plan') && <Plan />}
    </div>
  )
}
