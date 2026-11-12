# 페이블(Fable 5.1) 모델 추가 조사

> 조사만 했고 코드는 고치지 않았습니다. 기준: `app/` (앱 1.1.5, `@anthropic-ai/claude-agent-sdk` 0.3.304)

## 1. 결론 요약

- 모델은 별칭 4개 `default | opus | sonnet | haiku`를 **여러 파일에 같은 목록으로 따로 적어 둔 구조**입니다. 한 곳에서 가져다 쓰는 단일 출처가 없습니다. 페이블을 넣으려면 **소스 9개 파일의 목록 + 번역 사전 4곳 + 테스트 3개**를 같이 고쳐야 합니다.
- **SDK가 이미 페이블을 압니다.** 설치된 SDK(0.3.304)에 별칭 `fable`, `fable[1m]`과 전체 ID `claude-fable-5`, `claude-fable-5-1`이 들어 있습니다(`sdk.d.ts` 56줄 주석, `core-*.mjs` 52줄 목록). SDK 업그레이드는 필요 없어 보입니다. 단, 실제 호출이 되는지(계정·플랜에서 허용되는지)는 실행해 봐야 알 수 있습니다.
- 앱은 기존 모델도 별칭(`opus`)을 그대로 CLI에 넘깁니다(`claude.ts` 36~42). 같은 방식이면 `fable`을 넘기면 되지만, 별칭은 "그 시점의 최신 페이블"을 가리킵니다. **5.1에 고정하려면 `claude-fable-5-1`을 넘겨야 합니다** (아래 쟁점 1).

## 2. 모델이 쓰이는 모든 위치

### 2-1. 타입·값 목록 (여기가 "정의")

| 파일:줄 | 내용 | 페이블 추가 시 |
|---|---|---|
| `src/shared/types.ts:34` | `type ClaudeModel = 'default' \| 'opus' \| 'sonnet' \| 'haiku'` | `'fable'` 추가 (이 타입이 `MODEL_ID` 레코드의 키라서 안 넣으면 컴파일 오류가 나서 빠뜨림을 막아 줌) |
| `src/shared/types.ts:36` | `ModelChoice = ClaudeModel \| (string & {})` (Codex 모델 id도 같이 담는 문자열) | 그대로 |
| `src/shared/slashCommands.ts:122` | `CLAUDE_MODEL_CHOICES` — `/model` 슬래시 명령이 받는 값 | 추가 |
| `src/shared/engineModel.ts:6` | `CLAUDE_MODELS` Set — 엔진·모델 불일치 판정 | 추가 (안 넣으면 `fable` 직원이 "불일치"로 보여 `default`로 되돌려짐 ↓ 위험 참고) |
| `src/shared/engineModel.ts:40` | 비서 AI에게 주는 프롬프트에 "default\|opus\|sonnet\|haiku 중에서" 문장 | 문장에 추가 |
| `src/shared/staffPack.ts:29` | `MODELS` — 직원 팩(가져오기) 검증 | 추가 (안 넣으면 페이블 직원 팩 가져오기가 `pack.err.model`로 거부됨) |
| `src/shared/secretaryTools.ts:303` | 비서의 `hire` 도구 인자 설명 문자열 | 추가 |
| `src/main/agents.ts:8` | 에이전트 템플릿(.md) 파일의 `model:` 읽기 `['opus','sonnet','haiku']` (`includes`로 부분 일치) | 추가 (`claude-fable-5-1` 같은 값도 `includes('fable')`로 잡힘) |

### 2-2. CLI·SDK로 나가는 곳

| 파일:줄 | 내용 | 비고 |
|---|---|---|
| `src/main/ai/claude.ts:36~42` | `MODEL_ID` 별칭 → CLI 모델 문자열, `claudeModelId()` | **여기가 실제 호출 인자.** `fable: 'fable'` 또는 `'claude-fable-5-1'` |
| `src/main/ai/claude.ts:294` | `tierModel` — `light`면 haiku, 아니면 default | 변경 없음 |
| `src/main/ai/claude.ts:306·341` | `query()`의 `model:` 인자로 전달 | 변경 없음 |
| `src/main/ai/index.ts:19` | `modelIdFor` (Claude는 위 함수, Codex는 별도) | 변경 없음 |
| `src/main/hired.ts:138·158·318·359` | 직원 런타임의 `modelNow`, 시작 시 `modelId()`로 변환해 세션에 설정 | 변경 없음 (값만 흘려보냄) |
| `src/main/hired.ts:148~149` | `pickModel`: 가벼운 일이면 직원 모델 대신 `haiku`로 자동 전환 | 동작 확인 필요: 페이블 직원도 가벼운 일이면 Haiku로 내려감(장비 `lightModelOff`로 끌 수 있음). 의도와 맞는지 정해야 함 |
| `src/main/secretary.ts:38` | `SECRETARY_MODEL = 'sonnet'` 비서 모델 고정 | 변경 없음 |
| `src/main/tutorial.ts:170` | 튜토리얼 연습 직원 `haiku` | 변경 없음 |
| `src/main/office.ts` 1209·3822·4226~4394 | 스킬 번역·사용률 확인·데모데이 발표는 haiku 한 번 호출 | 변경 없음 |

### 2-3. 저장·변경 흐름 (코드 수정 필요 없음, 호환 확인용)

| 파일:줄 | 내용 |
|---|---|
| `src/main/db.ts:63·226·237·243` | `staff.model TEXT NOT NULL` — **문자열 그대로 저장**, 열거형 제약 없음. 마이그레이션 불필요 |
| `src/main/office.ts:559~563` | 시작할 때 `isEngineMismatch`이면 `fitEngineModel`로 `default`로 고쳐 DB에 저장 (↓ 위험 1) |
| `src/main/office.ts:908~909` | 고용 시 토큰 절약 기본값 + `fitEngineModel` |
| `src/main/office.ts:1020~1023` | 엔진 바꿀 때 모델을 `default`로 |
| `src/main/office.ts:1043~1055` | `updateStaff`: `fitEngineModel` 통과 후 저장, 바뀌면 런타임 재시작 |
| `src/main/office.ts:1186~1194` | `applySettingCommand` — `/model` 처리 (`CLAUDE_MODEL_CHOICES`, `parseModelArg` 사용) |
| `src/main/staffPack.ts:54·77~83·99` | 팩 가져오기·내보내기·템플릿 → `fitEngineModel` |
| `src/main/office.ts:3096~3107` | 외부 직원 영입(`recruitExternal`)의 모델 |
| `src/main/peer/*` | 원격 팀원에게 `model` 문자열을 그대로 노출 (다른 PC의 앱이 구버전이면 `fable`을 모를 수 있음, ↓ 위험 5) |
| `src/main/secretaryCompact.ts:93` | 비서에게 주는 직원 요약에 `모델 ${s.model}` 그대로 출력 (페이블이면 `fable`로 보임) |

### 2-4. 화면 (선택 UI·표기 이름)

| 파일:줄 | 화면 | 내용 | 페이블 추가 시 |
|---|---|---|---|
| `src/renderer/features/HireDialog.tsx:28~32` | **고용 창 → 모델 고르기(Segmented 버튼)** | `{value, label:'Opus', hint}` 4개 | `{ value:'fable', label:'Fable', hint: t('guideHint.model.fable') }` 추가. 버튼이 5개로 늘어 가로 폭 확인 필요 |
| `src/renderer/features/HireDialog.tsx:154` | 고용 창 | 템플릿 선택 시 `tpl.model` 적용 | 변경 없음 |
| `src/renderer/features/StaffPanel.tsx:146` | 직원 패널 → 프로필 모델 드롭다운 | `MODELS` 배열 | 추가 |
| `src/renderer/features/StaffPanel.tsx:148~149` | 직원 패널 머리말(`· Opus` 배지 줄 495) | `CLAUDE_MODEL_NAME` 표기 이름 사전 | `fable: 'Fable'` 추가 (안 넣으면 `fable` 소문자로 보임) |
| `src/renderer/features/StaffPanel.tsx:1066~1071` | 외부 직원 영입 폼의 모델 select | `<option>` 3개를 하드코딩 (다른 곳과 따로) | `<option value="fable">Fable</option>` 추가 |
| `src/renderer/features/secretary/ConfirmCard.tsx:149·163` | 비서 확인 카드(고용 승인) 모델 select | 목록 하드코딩, 이름은 값 그대로(`opus` 소문자) | 추가. 표기는 현재도 소문자라 같이 맞출지 결정 |
| `src/renderer/features/TokenSaverTop3.tsx:77` | 토큰 아끼기 카드 | `saver.action`(model from→to) 문구 | ↓ 토큰 절약 항목 |
| `src/shared/i18n/dict/guideHint.ts:20~38` | 고용 창 모델 힌트 | `guideHint.model.opus/sonnet/haiku` 4개 언어 | `guideHint.model.fable` 4개 언어 추가 |
| `src/shared/i18n/dict/tools.ts:423~426` | 슬래시 명령 목록의 `/model` 설명 | "(default·opus·sonnet·haiku)" 4개 언어 | 문구에 추가 |
| `src/renderer/mobile/*` | 휴대폰 화면 | 모델 표기 사용처 없음(grep 결과 없음) | 변경 없음 |
| `android/` | 안드로이드 | 모델 관련 코드 없음 | 변경 없음 |

### 2-5. 토큰 절약·사용량 한도

| 파일:줄 | 내용 | 추가 시 |
|---|---|---|
| `src/shared/tokenSaving.ts:26` | `saverFor`: `model === 'opus'`일 때만 "Sonnet으로 한 단계 낮추기" 제안 | **페이블은 제안 대상에서 빠짐.** 넣으려면 `fable → opus`(또는 sonnet) 규칙과 문구(`tokenSaver.reason.*`, `tokenSaver.hint.*`)가 필요. 안 넣으면 가장 비싼 모델이 절약 제안에서 빠지는 모순 |
| `src/shared/tokenSaving.ts:48` | 절약 모드 새 직원 기본값 `haiku` | 변경 없음 |
| `src/shared/types.ts:884~901` `PLAN_WINDOW_LABEL` | 사용률 창 이름 (`seven_day_opus`, `seven_day_sonnet`) | 페이블 전용 창(`seven_day_fable`로 추정, **이름 미확인**)이 올 때를 대비해 라벨·번역 4곳 추가 필요 (`planUsage.window.*`, `notify.planWindow.*`). 모르는 창은 화면에 영문 키 그대로 보임(`PlanUsageCard.tsx:14`). 목록에 없으면 정렬 순서에서도 빠짐(`ORDER = Object.keys(PLAN_WINDOW_LABEL)`) |
| `src/shared/planHold.ts:7~8` | 자동 보류는 `five_hour`·`seven_day` 두 창만 봄 | 모델별 창이 막혀도 앱은 보류하지 않음 → 페이블 창만 100%일 때 페이블 직원은 계속 호출해 실패할 수 있음 |
| `src/shared/planUsageChip.ts:7` | 헤더 칩은 `five_hour·seven_day·thirty_day`만 | 변경 없음 |

### 2-6. 테스트·문서

| 파일 | 고칠 곳 |
|---|---|
| `app/scripts/slashCommands.test.mts:154~166` | `CLAUDE_MODEL_CHOICES` `deepEqual` 기대값(162줄)에 `fable` 추가. 거부 목록(166줄)에 `claude-opus-4-1` 같은 **전체 ID는 거부**한다고 이미 못박혀 있음 → 전체 ID를 `/model`에서 받을지가 쟁점이면 이 테스트와 충돌 |
| `app/scripts/engineModel.test.mts` | 페이블 직원이 불일치로 판정되지 않는 케이스 추가 |
| `app/scripts/staffPack.test.mts` | 페이블 팩 가져오기 케이스 추가 |
| `app/scripts/tokenSaving.test.mts` | 페이블 규칙을 넣는다면 케이스 추가 |
| `SPEC.md`·`README*`·`site` | 모델 이름 언급 없음 (고칠 곳 없음). 기능 추가 시 `CHANGELOG*` 4개 언어 기록 |

## 3. 고칠 파일·함수 체크리스트

**필수 (이것만으로 고르기·호출·저장이 동작)**
1. `shared/types.ts` — `ClaudeModel`에 `'fable'`
2. `main/ai/claude.ts` — `MODEL_ID.fable`
3. `shared/slashCommands.ts` — `CLAUDE_MODEL_CHOICES`
4. `shared/engineModel.ts` — `CLAUDE_MODELS` Set, 프롬프트 문장
5. `shared/staffPack.ts` — `MODELS`
6. `renderer/features/HireDialog.tsx` — `models()`
7. `renderer/features/StaffPanel.tsx` — `MODELS`, `CLAUDE_MODEL_NAME`, 외부 직원 `<option>`
8. `renderer/features/secretary/ConfirmCard.tsx` — select 목록
9. `shared/secretaryTools.ts` — hire 인자 설명
10. `main/agents.ts` — `MODELS`
11. 사전: `guideHint.ts`(새 키), `tools.ts`(`/model` 설명) — 4개 언어
12. 테스트 3개(`slashCommands`·`engineModel`·`staffPack`)

**선택 (결정이 필요)**
13. `shared/tokenSaving.ts` + `tokenSaving` 사전 — 페이블을 절약 제안에 포함할지
14. `shared/types.ts` `PLAN_WINDOW_LABEL` + 사전 — 페이블 전용 사용량 창 라벨(창 이름 실측 후)
15. `main/hired.ts` `pickModel` — 페이블 직원의 가벼운 일 자동 Haiku 전환 유지 여부

> 개선 제안(이번 범위 밖): 같은 목록이 8곳에 중복돼 있어 다음 모델이 나올 때 또 빠뜨리기 쉽습니다. `shared`에 `CLAUDE_MODELS = ['default','opus','sonnet','haiku','fable'] as const` 한 곳을 두고 나머지가 가져다 쓰게 하면 추가 비용이 줄지만, 이번 작업 범위는 넓어집니다. 정리드가 이번에 묶을지 따로 할지 정하면 됩니다.

## 4. 위험

1. **기존 설정 호환(구버전 앱으로 되돌릴 때)**: DB는 문자열이라 마이그레이션은 필요 없습니다. 그러나 `fable`로 저장한 뒤 구버전 앱을 켜면 `isEngineMismatch`가 참이 되어 시작 시 **조용히 `default`로 덮어 씁니다**(`office.ts:559~563`). 구버전 → 신버전은 안전, 신버전 → 구버전 되돌림만 영향입니다.
2. **`CLAUDE_MODELS`를 빠뜨리면 즉시 사고**: 페이블을 고른 직원이 다음 시작 때 "불일치"로 판정돼 `default`로 되돌아갑니다. 위 필수 4번은 반드시 같이 넣어야 합니다.
3. **전체 ID와 별칭**: `claude-fable-5-1`을 직접 저장하면 `isEngineMismatch`에 걸립니다(Set에 없음). 저장값은 별칭 `fable`로 하고 `MODEL_ID`에서 전체 ID로 바꿔 넘기는 쪽이 기존 구조와 맞습니다.
4. **사용량 한도 영향**: (a) 페이블 사용분이 어느 창에 집계되는지 확인되지 않았습니다. 모델별 창(`seven_day_<model>`)이 새로 올 수 있고, 앱의 자동 보류(`planHold`)는 모델별 창을 보지 않아 페이블 창만 소진돼도 호출을 계속 시도합니다. (b) Opus 힌트가 "사용량이 많다"고 적혀 있는데 페이블은 더 비쌀 수 있어 힌트 문구에 근거가 필요합니다. 실제 배율은 이 조사에서 확인하지 못했습니다. (c) 토큰 절약 제안과 `pickModel`(가벼운 일 → Haiku)은 현재 페이블을 특별 취급하지 않습니다. 가장 비싼 모델이 절약 제안에서 빠지는 점이 가장 눈에 띕니다.
5. **원격 팀원(피어)**: 모델 문자열을 그대로 주고받으므로 상대가 구버전이면 이 모델을 모를 수 있습니다. 표시만 영향이고 호출은 각자 PC에서 합니다.
6. **고용 창 폭**: 모델 선택이 Segmented 버튼 5개가 됩니다(기본·Opus·Sonnet·Haiku·Fable). 4개 언어 라벨에서 줄바꿈이 생기는지 화면 확인 필요.
7. **계정 권한**: 페이블이 모든 플랜·계정에서 쓸 수 있는지 이 조사로는 알 수 없습니다. 쓸 수 없을 때 오류가 나는 방식을 구현 전에 실제 호출로 확인해야 합니다.

## 5. 정리드가 정할 쟁점 (추천 포함)

1. **저장값·CLI 인자**: 별칭 `fable` 저장 + CLI에 `claude-fable-5-1` 고정 전달(추천: 요청이 5.1 지정이고, 별칭은 나중에 5.2로 바뀔 수 있음) vs 기존처럼 별칭 `fable` 그대로 전달(5.2 나오면 자동 이동, 표기도 "Fable"만). 표기는 `Fable`로 두고 버전은 힌트에서만 쓰는 쪽을 추천합니다.
2. **토큰 절약 규칙**: 페이블 → Opus 한 단계 낮추기를 같이 넣을지(추천: 넣기. 안 그러면 가장 비싼 모델이 제안에서 빠짐).
3. **`pickModel`**: 가벼운 일이면 페이블 직원도 Haiku로 내려가게 둘지(현행 유지 추천, `lightModelOff`로 끌 수 있음).
4. **사용량 창 라벨**: 실제 창 이름을 확인한 뒤 추가(추천: 이번에는 보류하고 실측 후 후속).
5. **중복 목록 정리**: 이번에 단일 출처로 묶을지(추천: 이번에는 묶지 않고 필수 12곳만. 묶으면 변경 범위가 비즈니스 로직까지 번짐).
