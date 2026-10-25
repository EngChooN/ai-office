// 아이소메트릭 칸 배치 시제품 미리보기 진입 (pnpm preview:iso) — 앱 창·preload 없이 브라우저에서 바로 뜬다
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { ExteriorGallery } from './ExteriorGallery'
import { IsoArtGallery } from './IsoArtGallery'
import { IsoPrototypeApp } from './IsoPrototypeApp'
import { LevelUpDemo } from './LevelUpDemo'
import { SpacesGallery } from './SpacesGallery'

// ?gallery=1 → 그림 모음(이디자 A3: 품목 4방향·재질 단계·직원·고정 칸)
const isGallery = new URLSearchParams(location.search).get('gallery') === '1'
// ?exterior=1 → 개편 외관 E1~E6 (이디자 C3)
const isExterior = new URLSearchParams(location.search).get('exterior') === '1'
// ?levelup=1 → 레벨업 연출 (이디자 C3)
const isLevelUp = new URLSearchParams(location.search).get('levelup') === '1'
// ?spaces=1 → 디자인 보강 1단계 시안: 외관 E1~E7 · 회의실 6단계 · 휴게 공간 · 비정사각 평면 (이디자)
const isSpaces = new URLSearchParams(location.search).get('spaces') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSpaces ? <SpacesGallery /> : isLevelUp ? <LevelUpDemo /> : isExterior ? <ExteriorGallery /> : isGallery ? <IsoArtGallery /> : <IsoPrototypeApp />}
  </StrictMode>,
)
