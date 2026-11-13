# 코드 검토 — 매뉴얼실 개편 1차 (d6a1747 + 1951e1b manuals.ts title) · 한리뷰, 2026-11-12

기준: `design-decision.md` 1~18번. 확인 방법: 코드 읽기 + `scripts/manuals.test.mts` 25건 직접 실행(25 통과). 실제 화면 동작·Claude Code가 `title:` 스킬을 정상 호출하는지(QA 몫)는 보지 못했다.

## 판정: revise (막는 지적 1건, 작아서 한 번에 고칠 수 있음)

## 막는 지적
1. **초안 중 창 닫기 가드가 개발 모드(StrictMode)에서 항상 켜져 초안이 버려짐** — `renderer/features/NewManualDialog.tsx` `isClosed` ref(useRef(false)) + `useEffect(() => () => void (isClosed.current = true), [])`.
   - `renderer/main.tsx:26`이 `StrictMode`라 개발 모드에서 effect가 마운트→정리→재마운트를 한 번 돈다. 정리 때 `true`가 되고 재마운트에서 `false`로 되돌리지 않아, 창을 닫지 않았는데도 `handleDraft`가 결과를 무시한다. `isDrafting`도 안 풀려 버튼이 "만드는 중"에 멈춘다. 배포본에서는 안 나지만 개발 중 초안 갈래를 검증할 수 없다.
   - 수정: effect 본문에서 `isClosed.current = false`로 되돌린 뒤 정리에서 `true`로 둔다.
   - 결정 16번 시험(초안 중 창 닫기)이 시험 25건에 없다. 로직을 순수 함수로 빼기 어렵다면, 최소한 위 수정 + 수동 확인으로 대체하고 그 사실을 기록한다.

## 점검 항목별 결과 (7개 요청)
1. **파일 이름 읽기 전용·교육 연결 유지** — 편집 창 `isNameLocked = !!previousPath`로 입력을 `readOnly` 처리(`ManualEditor.tsx:166`). 교육 연결은 이름 기준이라 화면에서는 유지된다. 단, 서버(`manuals.ts saveManual`)는 `previousPath`가 있어도 다른 `name`이면 이동(moving)을 계속 허용한다 → 아래 권고 1.
2. **title 미전송 시 기존 제목 유지(resolveTitle)** — 이상 없음. `office.ts:3156` `if (prev) input = {...input, title: resolveTitle(prev.title, input.title)}`. 미지정=유지, `''`=삭제, 새로 만들 때는 그대로. 시험 있음(`manuals.test.mts:103`). 원격에서 `title`이 `V2_FIELDS`를 통과하므로 휴대폰 저장에도 같은 경로를 탄다.
3. **직원 팩 title 왕복·충돌 비교** — 이상 없음. 내보내기(`staffPack.ts:98`, `shared/staffPack.ts:350`)·가져오기(`readManual`, 길이 상한 `TITLE_MAX`)가 대칭이고 옛 팩은 title 없이 통과한다. 충돌 비교는 `prev.body !== m.body`만 본다(`shared/staffPack.ts:275`). 가져올 때 같은 이름이 이미 있으면 건너뛰어 기존 제목이 유지된다(`applyPack`). 시험 있음.
4. **원격** — `V2_FIELDS.saveManual`에 `name, autoName, title ...`가 들어 있고 모르는 칸은 버려진다(시험 `:179`). `draftManual: R('s s s')`는 `''`를 통과시키고(시험), `office.draftManual`은 `staffId ? hired.get : undefined`로 `''`를 앱 기본 AI(홈 폴더·기본 모델)로 분기한다. 사용량은 `SECRETARY_ID`로 기록. 이상 없음.
5. **사전 키·하드코딩** — 새 사전 항목은 `Entry` 타입상 ko·en·ja·zh 4개 모두 필수이고, 템플릿 키 순회 시험·개발 용어 검사 시험이 있다. 이번에 바꾼 렌더러 파일에서 한글 하드코딩 문자열은 찾지 못했다(`ManualEditor`·`NewManualDialog`·`empty-guide`·`more-toggle`). 권고 3(AI 이름 방어)은 별개.
6. **초안 중 창 닫기** — 설계 의도(호출은 두고 닫힌 뒤 결과는 무시, 편집 창 안 엶, 요청 문장은 실패 때 유지)는 구현돼 있다. 다만 위 막는 지적 1 때문에 개발 모드에서 깨진다.
7. **편집 창 닫을 때 고친 내용 확인(isDirty)** — 이상 없음. `handleClose`가 `isDirty(form, initial)`이면 `confirm`. 비교 대상은 title·name·description·kind·scope·projectDir·body·steps이고 단계만 달라도 감지(시험 있음). ESC·바깥 클릭도 `onOpenChange`로 같은 경로를 탄다.

## 권고 (필수 아님)
1. **파일 이름 읽기 전용을 서버에서도 지키기** — 결정 5번의 목적(교육 연결 끊김 방지)은 화면에서만 막혀 있다. 비서·원격이 `previousPath`와 다른 `name`을 보내면 폴더가 이동하고 직원 교육 목록(이름 기준)은 갱신되지 않는다. `office.saveManual`에서 `prev`가 있으면 `name`을 `prev.name`으로 고정하는 한 줄을 권한다(1단계 범위 밖이면 다음 차수 기록).
2. **새 초안·템플릿은 열자마자 isDirty=false** — `initial`이 곧 초안이라, 방금 AI가 만든 초안을 아무것도 안 고치고 닫으면 확인 없이 사라진다(결정 15번 문구와는 일치). 새로 만들기 흐름(`previousPath` 없음)은 닫을 때 항상 확인하는 편이 안전하다. 의도라면 현 상태 유지.
3. **AI 초안 `name` 방어** — `NewManualDialog.tsx`의 `isValidManualName(d.name)`은 `d.name`이 undefined일 때 문자열 "undefined"로 검사돼 통과할 수 있다(`RegExp.test`의 형변환). `typeof d.name === 'string'` 확인을 더하거나 `office.draftManual`에서 `name`을 문자열로 정리해 달라. `description`·`body`가 없는 JSON도 `.trim()`에서 터진다(`manualProblems`) — `draftManual` 반환 시 `String(d.description ?? '')`.
4. **같은 한글 제목 중복 안내** — 결정 문서가 다음 차수 후보로 둔 항목, 확인만.
5. **시험 보강** — 서버 이름 이동 방지(권고 1)·초안 중 닫기·`draftManual`의 JSON 이상 응답(name 없음) 각 1건.

## 잔여물
- `console.log`·디버그 코드 없음(변경 파일 대상 grep). 작업 트리의 미커밋 파일(ChatPage·StaffPanel·SecretaryChat, 다른 docs·스크린샷)은 이번 커밋 범위가 아니라 보지 않았다.

---

## 재검토 (작업 트리 diff 기준, 커밋 전) — 한리뷰

### 판정: approve

| 지적 | 결과 |
|---|---|
| 막는 지적(StrictMode에서 초안 무시) | 해결. effect 본문에서 `isClosed.current = false`로 되돌리고 정리에서 `true`. 마운트→정리→재마운트에서도 열려 있는 동안은 `false`. `close()`의 `true`와도 충돌 없음 |
| 권고1(서버 이름 고정) | 해결. `office.saveManual`에서 `prev`가 있으면 `name: prev.name, autoName: false`. `saveManual`의 이동 분기는 이제 scope·projectDir 변경에서만 발생하고 폴더 이름은 유지. 원격 권한 검사·`resolveTitle`보다 뒤라 순서도 맞음 |
| 권고3(AI 응답 정리) | 해결. 칸을 문자열로, `steps`를 배열로 정리. 직접 확인한 한계는 아래 권고 A |
| 교육 용어 | 채팅 문구·사전 3건(4개 언어 모두 짝 맞음)이 일관되게 바뀜. 코드 전체에서 '교육을 받' 잔여 없음 |
| 권고2 | 결정 15번대로 유지 — 동의 |

직접 확인: diff 읽기, '교육을 받' grep. 시험·tsc는 직접 돌리지 않고 보고(1391 통과·실패 0)를 따랐다. 화면 동작은 보지 못했다.

### 남은 권고 (필수 아님)
- A. `draftManual`의 `steps`는 배열인지만 확인한다. 원소가 객체가 아니면(문자열 등) `NewManualDialog`의 `{...newStep(i), ...s}`가 이상한 칸을 만든다. `steps.filter(isObject)`를 한 번 더 걸면 충분.
- B. 시험 추가가 안 된 것으로 보임: (1) 이름이 다른 `saveManual`에 `previousPath`가 있어도 폴더가 안 바뀌는 것, (2) `draftManual` 응답에 `name` 없음·`steps` 문자열. 둘 다 순수 함수가 아니라 Office 인스턴스가 필요해 부담이면 다음 차수로.
- C. 사전에 `slashMenu.tag.custom`의 '매뉴얼(스킬)' 같은 "스킬" 표기가 남아 있음 — 이번 범위(교육 용어)는 아니므로 참고만.
