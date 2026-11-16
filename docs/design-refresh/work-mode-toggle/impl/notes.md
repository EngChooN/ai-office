# 업무 모드 스위치 — 구현 기록 (정리드, 2026-11-16)

handoff.md 그대로 구현. 달라진 점과 판단만 적는다.

- 위치: `Sidebar.tsx` `WorkModeRow` — 메뉴 스크롤 영역 밖, '피드백 보내기' 바로 위. 줄 전체가 `role="switch"` 버튼 하나이고, 스위치 모양은 `SwitchTrack`(switch.tsx, 버튼 아닌 span)으로 넣어 버튼 안에 버튼이 없다. 레트로 스위치 규칙(data-slot·aria-checked)이 그대로 칠한다.
- 숨김: `IS_REMOTE_SCREEN`(휴대폰 앱 + 다른 PC 원격 창). 원격 창 판단 근거 — `isWorkMode`는 PC 한 대의 설정(`settings`)이고 원격도 `updateSettings`로 바꿀 수 있어(`main/remote/v2.ts` 허용 목록), 원격 창에서 누르면 본체 PC 화면도 바뀐다. 사이드바처럼 눈에 띄는 곳에서 실수로 바뀌지 않게 원격은 설정 화면에서만 바꾸게 했다. `IS_MOBILE_SHELL`은 배치 판정에만 쓰는 규칙(workspace.test)이라 쓰지 않았다.
- 설정 화면: 체크박스 → `Switch`, 안내 한 줄(`settingsPage.workMode.sidebarHint`)은 PC 창에서만.
- 레트로: 구분선 색만 `--retro-line-soft`(굵기는 기존 2px 규칙).
- 접힘용 문구(`stateOn/Off`)는 쓰는 곳이 없어 넣지 않았다.
- 업데이트 소식: 버전 번호가 정해지지 않아 CHANGELOG에는 아직 넣지 않았다. 버전을 정할 때 아래 줄을 `### 개선`에 넣는다.
  - ko: 업무 모드를 왼쪽 메뉴 맨 아래에서 바로 켜고 끌 수 있어요.
  - en: You can now turn work mode on or off right from the bottom of the left menu.
  - ja: 業務モードを左メニューのいちばん下からすぐにオン・オフできるようになりました。
  - zh: 现在可以在左侧菜单底部直接开启或关闭工作模式。

검증: tsc 0, 시험 1524(실패 0, 건너뜀 1). 개발 앱에서 레트로 ko·en·ja·zh 글자 잘림 없음(측정), 줄 클릭으로 켜고 끔·메뉴 사무실/상점 사라짐/돌아옴 확인. 캡처 `wm-*.png`(줄 배경은 마우스가 올라가 있어 생긴 hover).
확인 못 함: 키보드 Space 실제 입력(포커스만 확인), 윈도우 배율 125·150%, 태블릿 실기.
