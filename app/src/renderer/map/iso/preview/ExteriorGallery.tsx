// 개편 외관 모음 (시제품 iso-preview.html?exterior=1) — 건물 단계 E1~E6과 레벨별 꾸밈을 낮·밤으로 (이디자 C3)
// ?exterior=1 → 단계마다 마지막 꾸밈 낮·밤 / &stage=3 → 그 단계의 레벨 전부 낮·밤
import { exteriorSpecOf, STAGE_NAMES, type ExteriorFeature } from '../../exteriorSpec'
import { dioramaPreviewUrl } from '../../exteriorDiorama'

const FEATURE_NAMES: Record<ExteriorFeature, string> = {
  sign: '간판',
  awning: '차양',
  litSign: '조명 간판',
  planters: '화분·벤치',
  canopy: '입구 캐노피',
  landscape: '조경',
  pylon: '옥외 간판',
  parking: '주차장',
  garden: '정원',
  logo: '로고 사인',
  fountain: '분수 앞마당',
  rooftop: '옥상 정원',
  nightLights: '야간 조명',
}
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)
const W = 360
const ZOOM = 2

function Shot({ level, isNight }: { level: number; isNight: boolean }) {
  const spec = exteriorSpecOf(level)
  const on = (Object.keys(spec.features) as ExteriorFeature[]).map((f) => FEATURE_NAMES[f])
  return (
    <figure className="flex flex-col gap-1">
      <img src={dioramaPreviewUrl(level, isNight)} alt="" style={{ width: W * ZOOM, imageRendering: 'pixelated' }} className="rounded" />
      <figcaption className="text-xs text-white/70">
        <b className="text-white">Lv.{level}</b> · E{spec.stage} {STAGE_NAMES[spec.stage]}
        {spec.stage === 7 && ' (지금은 E6으로)'} · {isNight ? '밤' : '낮'} {on.length > 0 && `· ${on.join(' · ')}`}
      </figcaption>
    </figure>
  )
}

export function ExteriorGallery() {
  const q = new URLSearchParams(location.search)
  const stage = Number(q.get('stage')) || null
  const levels = stage ? LEVELS.filter((lv) => exteriorSpecOf(lv).stage === stage || (stage === 6 && exteriorSpecOf(lv).stage === 7)) : [2, 5, 9, 13, 17, 19]
  return (
    <div className="min-h-screen bg-[#0d1014] p-5 text-white">
      <h1 className="text-primary mb-3 text-sm font-semibold">{stage ? `외관 E${stage} ${STAGE_NAMES[stage as 1]} — 레벨별 꾸밈` : '외관 E1~E6 — 단계마다 꾸밈을 다 켠 모습'}</h1>
      <div className="flex flex-col gap-5">
        {levels.map((lv) => (
          <div key={lv} className="flex gap-4">
            <Shot level={lv} isNight={false} />
            <Shot level={lv} isNight />
          </div>
        ))}
      </div>
    </div>
  )
}
