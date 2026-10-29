# 휴대폰 앱 ↔ PC 화면 기능 차이 전수 점검

> 작성: 박패턴 (FE 설계) · 2026-10-29 · 조사만, 코드 수정 없음
> 발단: 대표님 "최신 버전인데 직원마켓이 안 보인다" → `HireDialog.tsx:82` `hasPack = typeof window.officePack !== 'undefined'`
> 범위: `app/src/renderer` 전체 + `main/remote/v2.ts` 메서드 분류 + `mobile/remoteOffice.ts` 어댑터

## 0. 휴대폰에서 기능이 갈리는 방식 4가지

| 방식 | 어디서 | 설명 |
|---|---|---|
| A. 셸 플래그 | `IS_MOBILE_SHELL` (`shell.ts:7`) | 화면이 직접 숨기거나 "보기만"으로 바꾼다 |
| B. preload 전용 API 존재 검사 | `window.officePack` · `officeScene` · `officeUpdate` · `officeWindow` | 모바일 빌드에는 preload가 없어서 **늘 undefined** → 기능이 통째로 사라진다. 원격 v2로는 갈 길이 아예 없다 (`OfficeApi` 밖) |
| C. 원격 v2 `P`(pc_only) | `main/remote/v2.ts` 메서드 표 | 버튼은 보이고, 누르면 어댑터(`remoteOffice.ts`)가 대체 동작 또는 "PC에서 열어 주세요" 안내 + `RemoteCallError` |
| D. 폰 배치 | `useLayout() === 'phone'` | 기능은 같고 자리만 바뀜 (예: ⌘K 비서 → 상단 바 버튼). 이번 점검에서 빠지는 기능 없음 |

**B가 문제의 뿌리**다. A·C는 누군가 "휴대폰에선 이렇게"를 정하고 쓴 코드지만, B는 "preload가 없으면 안 보임"이 부수 효과로 따라온다. 그래서 파일이 필요 없는 기능(직원마켓)까지 같이 사라졌다.

## 1. 전수 표

분류: **의도** = 파일 경로·PC 창·PC 설정이 필요해 일부러 뺌(문서·주석 근거 있음) · **누락** = 원격으로 될 수 있는데 빠짐 · **판단 필요** = 근거가 약함

### 1-1. preload 전용 API 검사 (방식 B)

| 위치 | 빠지는 기능 | 분류 | 휴대폰에서도 되게 하려면 |
|---|---|---|---|
| `features/HireDialog.tsx:82` (`hasPack`) | 고용 창의 **직원마켓 버튼** + 팩 파일 가져오기 버튼 | **누락**(마켓) / 의도(파일 가져오기) | 2절. `hasPack`을 "마켓 가능"·"파일 가능" 둘로 나눔. 원격 메서드 1개 추가(소) |
| `features/StaffMarketDialog.tsx:29·33` | 마켓 목록 불러오기·채용 (`officePack.market/hireMarket`) | **누락** | 2절 |
| `App.tsx:159` (`EmptyOfficeHint`) | 직원 0명일 때 "직원 마켓에서 데려오기" 안내 띠 | **누락** | 마켓이 원격으로 되면 검사만 바꾸면 됨(극소) |
| `features/Onboarding.tsx:456` | 첫 실행 마지막 단계의 "마켓에서 데려오기" 버튼 | **누락** | 같음(극소) |
| `features/StaffPanel.tsx:624` | 직원 내보내기(파일 저장) | 의도 — `dialog.showSaveDialog` | 원하면 셸 다운로드 경로(`download_file`)로 JSON 내려받기. 메서드 1개 + 셸 연동(중). 우선순위 낮음 |
| `features/LabSection.tsx:151·168` | 랩 내보내기(파일 저장) | 의도 — 같음 | 같음 |
| `features/sceneExport/SceneExport.tsx:15`, `useSceneExport.ts:96~247`, `map/OfficeMap.tsx:273` | 사무실 장면 GIF 내보내기 | 의도 — PC 폴더 고르기·저장·폴더 열기 | 폰에서 캔버스로 만들고 셸 다운로드로 저장(대). 지금은 불필요 |
| `lib/update.ts:6`, `SettingsPage.tsx:199` | 앱 업데이트 확인·설치 섹션 | 의도 — PC 앱(electron-updater) 업데이트. 폰 앱 업데이트는 별개 | 폰 앱 자체 업데이트 안내가 필요하면 셸 쪽 일. renderer 변경 아님 |
| `features/DemoStage.tsx:151`, `map/officeStage.ts:589` | 창 숨김/표시 때 Phaser 재우기 | 의도 — 데스크톱 창 이벤트. 기능 손실 없음 | 없음 |

### 1-2. `IS_MOBILE_SHELL` 분기 (방식 A)

| 위치 | 빠지는 기능 | 분류 | 휴대폰에서도 되게 하려면 |
|---|---|---|---|
| `App.tsx:78` `RemoteUpgradeNotice` · `:79` `RemoteLanNotice` | 원격 보안 업그레이드·LAN 전용 안내 | 의도 — PC 원격 설정을 바꾸는 안내(`setRemoteLanOnly` 등 P) | 없음 |
| `App.tsx:81` `DemoStage` · `map/OfficeMap.tsx:388` `DemoDayBanner` · `:344` `DemoDayNowButton` | 데모데이 발표장 화면, "발표 중" 배너, "지금 열기" 버튼 | **판단 필요(발표장) / 누락(배너·버튼)** — `DemoStage.tsx:1` 주석에 "PC 전용"이라 적혀 있지만, 서버는 `runDemoDayNow`·`demoReact`를 **R(그대로 허용)** 로 열어 두었다(`v2.ts:155·157`). 배너·버튼은 Phaser 없이 DOM만 쓴다 | 배너·버튼: 분기만 풀면 됨(극소). 발표장: 폰 Phaser 성능 확인 후 결정(중) |
| `App.tsx:142` `ProviderBanner` | 0.14.0 "GPT 직원도 쓸 수 있어요" 1회 안내 | 판단 필요 — 눌러서 이어지는 Codex 로그인이 PC 전용이라 뺀 것으로 보임 | 그대로 둬도 됨 |
| `features/StaffPanel.tsx:159·162` `EngineSelect` | 직원 엔진 바꾸기 → "보기만 + PC에서" | 의도 — `changeEngine`이 P(`v2.ts:79`) | 엔진 바꾸기는 PC 파일·명령에 영향이 없어 S로 풀 여지 있음(소). 대표님 결정 |
| `features/McpSection.tsx:95·96·110·143·170` | 사용자 MCP 추가·수정·삭제, 목록 새로 고침 | 의도 — PC 설정 파일·명령 실행(`saveCustomMcp`·`refreshEquipment` P) | 없음 |

### 1-3. 원격 v2 `P`(pc_only) 인데 화면엔 버튼이 보이는 곳 (방식 C)

어댑터가 대체 동작을 주는 것(`pickFolder`·`pickFiles`→경로 입력, `openAttachment`→휴대폰 저장, `resumeInTerminal`·`openClaudeLogin`·`openCodexLogin`·`remoteQr`→안내)은 `android-pc-layout.md` 6절대로 **의도**이고 정상이다. 아래는 어댑터에 대체가 없어 **일반 안내 + 예외 throw** 로 끝나는 곳이다.

| 위치 | 빠지는 기능 | 분류 | 휴대폰에서도 되게 하려면 |
|---|---|---|---|
| `features/ReviewTab.tsx:45~51` `handleRevert` → `revertWork`(P) | 작업 되돌리기 | 의도(PC 파일을 git으로 되돌림) — **단 처리 누락**: try가 없어 throw 뒤 `setIsBusy(false)`가 안 돌아 **버튼이 '처리 중'에 멈춘다** | 폰에서는 버튼 숨김 또는 try/finally(극소) |
| `features/SettingsPage.tsx:85~96` hooks 토글 → `setHooksInstalled`·`setAskHookInstalled`(P) | 외부 직원 알림 hooks 켜기·끄기 | 의도 — **단 노출 누락**: 체크박스가 그대로 보이고 누르면 안내 + 처리 안 된 reject | 폰에서는 "PC에 적용돼요" 보기 전용(문서 `android-pc-layout.md` 91행에 이미 적혀 있음, 미구현)(극소) |
| `features/RemoteSection.tsx:34·72·78·172` → `setRemoteMode`·`refreshRemoteTailscale`·`dismissRemoteTsNotice`(P) | 원격 방식(Tailscale) 바꾸기·새로 고침 | 의도 — **단 노출 누락**: 같은 증상. 특히 `:34`는 화면 열 때 자동 호출이라 들어가자마자 안내가 뜰 수 있음 | 폰에서는 상태만 보이고 버튼 숨김(소) |

## 2. 직원마켓 판단

**결론: 내장 팩 목록 보기와 채용은 파일 없이 원격으로 된다. 파일 가져오기·직원/랩 내보내기만 PC 전용으로 남기면 된다.**

근거 (`main/staffPack.ts`):
- `marketItems()`(70행) — `shared/staffPack.ts:366`의 `STAFF_MARKET`을 i18n 문구로 바꿀 뿐. 파일·dialog 없음. **renderer에서도 같은 shared 상수로 만들 수 있다.**
- `hireMarket()`(75행) — 파일 없이 템플릿으로 `PackStaff`를 만들고 파일 가져오기와 같은 검증(`validatePackObject`)을 거쳐 `office.hire`. 위험 요소가 원격용으로 이미 막혀 있다:
  - `cwd` = PC 설정의 `defaultCwd` (폰이 고를 수 없음)
  - `approvalMode` = `'ask'` 고정
  - 장비 = 빈 목록 (MCP·도구 허용 없음)
  - `provider` = `claude`·`codex`만 받음 (그 외 `pack.err.provider`)
  - 즉 원격 `hire`의 `V2_FIELDS`(`v2.ts:208`, cwd·approvalMode 제외)보다 **더 좁다**. 새 위험 면이 생기지 않는다.
- `importFile`·`exportStaff`·`exportLab` — `dialog.showOpenDialog/showSaveDialog` 사용. PC 전용 유지.

### 설계안 (패턴 우선)

| 단위 | 변경 | 이유 |
|---|---|---|
| `shared/officeApiShape.ts` `OFFICE_METHODS` | `hireMarket` 추가 | 어댑터가 목록으로 자동 연결하므로 폰 쪽 손댈 곳이 없어진다 |
| `shared/types.ts` `OfficeApi` | `hireMarket(id: string, provider?: AiProvider): Promise<PackResult>` | 화면은 `window.office` 하나만 본다 |
| `preload.ts` | `office` 객체에 `hireMarket` (기존 IPC `pack:hireMarket` 재사용) · `officePack`에서는 `market`·`hireMarket` 제거 | `officePack` = "파일이 필요한 것만"으로 의미를 좁힌다 |
| `main/remote/v2.ts` | `hireMarket: S('s s?')` (restrict 불필요 — main이 안전값으로 채움) | 2절 근거 |
| 마켓 목록 | renderer에서 `STAFF_MARKET` + `t()`로 계산하는 순수 함수(`shared/staffPack.ts`에 `marketItems(t)` 꼴로 옮김) | 원격 메서드를 하나 덜 만든다. main도 같은 함수를 쓰면 출처 하나 |
| `HireDialog.tsx:82` | `hasPack` → `canMarket`(늘 true) / `canImportFile`(`officePack` 존재) 둘로 분리 | 이번 버그의 직접 원인 |
| `App.tsx:159`, `Onboarding.tsx:456` | `officePack` 검사 제거 | 마켓 진입점 |
| `mobile/preview/fakeShell.ts` | `hireMarket` 가짜 응답 | 브라우저 미리보기 검증 |
| 예전 PC 호환 | 폰이 새 버전, PC가 예전 → `unknown_method` 404. 어댑터의 칸 배치 처리(`gridCall`)처럼 `pcUpdateText()` 안내로 | 대표님 상황(폰만 최신)에서 그대로 터질 수 있음 |

크기: 파일 8~9개, 실코드 60~80줄 + 테스트(`officeApiShape`·`v2` 표 일치 검사가 있으면 자동으로 걸림). **소~중**.

> 가독성형 안과 갈릴 지점: 목록을 renderer에서 계산(메서드 1개) vs `marketItems`도 원격 메서드로(메서드 2개, main이 목록의 유일한 출처). 저는 앞쪽을 권합니다 — 목록은 순수 데이터라 IPC를 거칠 이유가 없습니다.

## 3. 요약

**누락으로 보이는 것 6개**
1. 직원마켓 진입·목록·채용 (`HireDialog:82`, `StaffMarketDialog:29·33`)
2. 빈 사무실 마켓 안내 띠 (`App:159`)
3. 첫 실행 마켓 버튼 (`Onboarding:456`)
4. 데모데이 배너·"지금 열기" 버튼 (`OfficeMap:344·388`) — 서버는 허용, 화면만 숨김
5. 작업 되돌리기 버튼이 폰에서 '처리 중'에 멈춤 (`ReviewTab:45~51`)
6. PC 전용 설정 버튼이 폰에 그대로 노출 (`SettingsPage:85~96` hooks, `RemoteSection:34·72·78·172`)

**판단 필요 3개**: 데모데이 발표장 화면, 엔진 바꾸기(`changeEngine` P → S 가능?), `ProviderBanner`

**우선순위 상위 3개**
1. 직원마켓 원격화(1~3번 한 번에) — 대표님 신고 건, 위험 면 없음, 소~중
2. 되돌리기 멈춤(5번) — 실제 고장, 극소
3. PC 전용 설정 노출 정리(6번) — 누르면 안내 + 처리 안 된 오류, 문서엔 이미 정해진 내용, 소

## 4. 처리 결과 (2026-10-29)

대표님 결정: 데모데이 발표장까지 휴대폰에서 열기 · 휴대폰에서도 엔진 바꾸기 허용 · GPT 안내 띠(`ProviderBanner`)는 지금처럼 숨김.

| 항목 | 처리 |
|---|---|
| 1~3 직원마켓 | `OfficeApi.hireMarket` 추가(`officeApiShape`·`types`·`officeHandlers`, v2 `S('s s?')`), 비서 도구에서는 제외. `pack:market`·`pack:hireMarket` IPC를 없애고 `officePack`은 파일 가져오기·내보내기만 남김. 목록은 `shared/staffPack.ts` `marketItems()`로 화면에서 만듦. `HireDialog`는 마켓은 늘 보이고 파일 가져오기만 `canImportFile`로 나눔. `App` 빈 사무실 안내 띠와 `Onboarding` 마켓 버튼의 검사를 풀었음. 예전 PC(`unknown_method`)면 어댑터가 `{ ok:false, message: pcUpdateText() }`를 돌려줌 |
| 4 데모데이 | 배너·"지금 열기" 버튼·발표장(`DemoStage`) 모두 휴대폰에서 보임 |
| 5 되돌리기 | 휴대폰에서는 버튼을 숨기고, `handleRevert`에 try/finally를 넣음 |
| 6 PC 전용 설정 | hooks 토글 2개는 휴대폰에서 `PcOnlyState`(상태와 "PC에서 바꿀 수 있어요")로 보여 줌. `RemoteSection`의 Tailscale 자동 확인(3초마다)을 휴대폰에서는 하지 않고, 방식 고르기는 막은 채 안내만 보여 줌. Tailscale 전환 안내 띠와 "다시 확인" 버튼은 숨김 |
| 엔진 바꾸기 | v2 `changeEngine`을 P에서 R로 바꿈(PC의 `office.changeEngine`이 로그인 상태와 쉬는 중인지 다시 확인). 휴대폰에서도 엔진 선택이 열림 |
