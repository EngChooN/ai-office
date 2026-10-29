# 하드코딩 색 정리 (최가독 설계 · 리드 확정: 안 1)

선행: `index.css`에 토큰 병합(theme-code-plan.md) 후 진행.

## 범위
- A. `map/OfficeMap.tsx` HUD 약 22곳: `bg-[#1a1d28]/90`→`bg-hud/90`, `text-white`→`text-hud-foreground`, `text-white/60`→`text-hud-foreground/60`, `border-white/10`→`border-hud-border`, `hover:bg-white/10`→`hover:bg-hud-foreground/10`. 반복 문자열은 파일 안 상수 `HUD_PANEL`.
- B. `ui/dialog.tsx` 오버레이 `bg-black/60`→`--overlay-bg`, `ui/button.tsx` destructive `text-white`→`--destructive-foreground`.
- C. 의미 색(`-400` 계열, 라이트에서 대비 깨짐): ReviewTab diff, StaffPanel·ReportPage(sky·violet), LabSection·OrgPage·StaffCard 왕관·별(yellow-400), ShopPage 희귀도 → **안 1: 상태 토큰(`--status-*`)과 `--spark-*`에 매핑, 구분이 필요한 곳은 새 토큰 `--accent-a`, `--accent-b`**(테마마다 라이트·다크, 라이트 AA).
- 남기는 것: D 데모·내보내기(DemoStage, SceneExport, LiveMiniView), E 데이터 색(상점 견본, 사무실 테마 견본, 팀 색), F 개발용 preview.

## `@theme inline`에 등록할 것
`--color-hud`, `--color-hud-foreground`, `--color-hud-border`, `--color-overlay`, `--color-accent-a`, `--color-accent-b`, 상태 색.

## 라벤더 소프트 컴포넌트 (`ui/*` 먼저)
- button: `--radius-pill`, 기본 변형 `bg-[image:var(--grad-primary)]` + `--shadow-primary`
- card: `--radius`, `--shadow-soft`
- input: 포커스 `--focus-ring`, `--focus-border`
- badge: `--chip-*`
- dialog: `--radius-dialog`, `--shadow-dialog`, `--overlay-bg`
- 시안 CSS의 덮어쓰기 규칙(`html[data-theme] header`, `[data-slot=button]` 등)은 쓰지 말고 컴포넌트에서 토큰을 쓴다.

## 순서
1. `ui/*` 2. OfficeMap HUD 3. 의미 색 4. 사이드바·대시보드·업무 보드·결재함·채팅·보고서·설정·대화상자(`bg-white/10` 등) 5. `dark:` 24곳 점검 6. 남은 색 grep → D·E·F 목록과 대조
