# 설계안 A — 가독성·재활용 관점 (최가독)

- 대상: 비개발자 사용성 개선 1차 요구사항 1~6 (`usability-audit/audit.md` 3부 1~5순위)
- 작성 방식: 박패턴 안과 **합의 없이 독립 작성**. 최종 선택은 정리드.
- 확인 범위: `ManualsPage.tsx`(365줄)·`src/main/manuals.ts`·`InboxPage.tsx` 빈 화면·`HireDialog.tsx` 접기·`office.ts draftManual`·`guideHint.ts` 사전을 직접 읽음. **앱 실행은 안 함.**
- 원칙: ① 있는 것 재활용 ② 한 번만 쓰는 건 분리 안 함(3번 이상 반복되면 분리) ③ 상태는 쓰는 곳 가까이 ④ 단순해도 검증 가능한 순수 함수만 따로 뺀다.

---

## 0. 한눈에 (정리드용 요약)

| 쟁점 | A안 선택 |
|---|---|
| 화면 분해 | `ManualEditor`만 별도 파일로, 3갈래는 작은 `NewManualDialog` 1개. 나머지(목록·`TrainDialog`)는 `ManualsPage.tsx`에 둔다 |
| 한글 이름 | frontmatter에 `title:` 한 줄 추가(`name`은 영문 슬러그 유지). 이름 규칙은 `shared/manualName.ts` **한 곳**으로 |
| 저장 불가 사유 | `manualProblems(form)` 순수 함수 하나. 버튼은 막지 않고 누르면 사유 표시 + 칸 강조 |
| 직원 0명 초안 | `draftManual(staffId \| null, …)` — null이면 홈 폴더·기본 모델로 질문 (이미 `office.ts:1220`에 같은 호출 패턴 있음) |
| 초안 덮어쓰기 확인 | **상황 자체를 없앰**: 초안은 "새 매뉴얼 만들기" 단계에서만 만들고 편집 창 안 초안 상자는 제거 |
| 빈 화면 | `EmptyGuide` 공통 컴포넌트 1개(결재함 마크업을 그대로 추출), 결재함도 이걸로 교체 |
| 접기 | `MoreToggle` 추출 → 고용 창·편집 창 고급·단계 카드 3곳 사용 (3회라 분리 정당) |
| 예시 템플릿 | 구조는 `manualTemplates.ts`(코드), 글자는 사전(`manualTemplates` 영역 파일, 4개 언어) |

---

## 1. 요구사항 해석

1. **저장 불가 사유** — 지금 `isValid` 한 줄(139행)이 5개 조건을 `&&`로 묶어 "왜"를 버린다. 조건마다 사유를 남기도록 바꾼다.
2. **직원 0명 초안** — 화면 조건(`staff.length > 0`)뿐 아니라 **백엔드가 `staffId` 필수**(`draftManual`이 `this.hired.get`으로 던짐)라 두 곳을 같이 고쳐야 한다. audit.md "확인 필요"에 있던 부분을 코드로 확인함.
3. **한글 이름** — 현재 규칙 위치는 `ManualsPage.tsx:18`(NAME_RE)·`manuals.ts:12`(NAME_RE)·`staffPack.ts`. **`staffPack.ts`에는 자체 정규식이 없고** `office.saveManual` → `isValidManualName`을 거쳐 같은 규칙을 탄다(grep 확인). 즉 실제로는 "정규식 2곳 + 경유 1곳". 파일 이름(`name`)은 Claude Code 스킬 폴더명이므로 영문 규칙은 유지하고 **표시 이름을 따로** 둔다.
4. **3갈래** — "+ 새 매뉴얼" 1개 → 선택 창. 각 갈래는 결국 **채워진 `ManualInput`을 만들어 `ManualEditor`로 넘기는 것**으로 통일(말로 → AI 결과, 예시 → 템플릿, 직접 → 빈 폼).
5. **용어/연결** — 사전 문구 교체 + 저장 성공 시 `TrainDialog`를 바로 연다.
6. **빈 화면** — 결재함(`InboxPage.tsx:88~100`)이 이미 정답이라 그것을 추출해 4곳에 적용.

---

## 2. 파일 구성 (변경·신규)

```
app/src/shared/manualName.ts            신규  이름 규칙·슬러그 생성 (renderer·main 공용, 순수 함수)
app/src/shared/types.ts                 수정  Manual/ManualInput에 title?: string, draftManual 시그니처
app/src/main/manuals.ts                 수정  title 읽기/쓰기, manualName.ts 사용
app/src/main/office.ts                  수정  draftManual(null 허용, title 요청), manualTitle 계산 1줄
app/src/main/officeHandlers.ts          수정  draftManual 인자 타입 (+ 원격 프로토콜 사용 여부 확인)
app/src/renderer/features/ManualsPage.tsx    수정  목록·TrainDialog·진입 연결만 남김 (365줄 → 약 230줄)
app/src/renderer/features/ManualEditor.tsx   신규  편집 폼 (ManualsPage에서 이동 + 수정)
app/src/renderer/features/NewManualDialog.tsx 신규  3갈래 선택/말로 설명/예시 고르기
app/src/renderer/features/manualTemplates.ts  신규  예시 구조(코드)
app/src/renderer/features/manualProblems.ts   신규  저장 불가 사유 계산 (순수 함수)
app/src/renderer/components/empty-guide.tsx   신규  빈 화면 공통
app/src/renderer/components/more-toggle.tsx   신규  "자세히 설정" 접기 (HireDialog에서 추출)
app/src/renderer/features/HireDialog.tsx      수정  more-toggle 사용 (마크업 동일, 동작 불변)
app/src/renderer/features/InboxPage.tsx       수정  EmptyGuide 사용
app/src/renderer/features/BoardPage.tsx · ChatPage.tsx · KnowledgePage.tsx  수정  EmptyGuide 적용
app/src/renderer/features/ChatPage.tsx(+ slash-menu 항목)  수정  매뉴얼 표시 이름(title ?? name)
app/src/shared/i18n/dict/featuresA.ts   수정  기존 manuals.* 문구 교체 (제자리 수정)
app/src/shared/i18n/dict/manualStart.ts      신규  새 UI 키 (index.ts에 import 한 줄)
app/src/shared/i18n/dict/manualTemplates.ts  신규  예시 템플릿 글자 (김기획 작성분)
app/scripts/manuals.test.mts            신규  슬러그·사유·title 저장/읽기·하위호환 테스트
CHANGELOG(ko/en/ja/zh).md, SPEC.md      수정  (정리드 구현 마무리 때)
```

**분해 이유:** `ManualEditor`는 이미 약 200줄이고 3갈래·사유·고급 접기로 더 커진다 → 파일 분리가 읽기 쉬움. 반면 `TrainDialog`(80줄)·목록 카드는 한 번만 쓰고 이번에 크게 안 바뀌므로 `ManualsPage.tsx`에 그대로 둔다(불필요한 분리 안 함). `StepCard`는 `ManualEditor.tsx` 안 내부 컴포넌트로 둔다(단계마다 접힘 상태를 가져야 하므로 컴포넌트가 필요하지만 다른 곳 재사용 없음 → 별도 파일 X).

---

## 3. 화면 흐름과 상태 위치

```
ManualsPage
 ├ state: starting(boolean), editing({input, previousPath?, isNew}), training(Manual|null)
 ├ [+ 새 매뉴얼] → NewManualDialog
 │     ├ 선택 화면: ✨말로(추천) / 📋예시 / ✍️직접   (카드 3장, 각 한 줄 설명)
 │     ├ 말로: 한 줄 입력 + 종류 질문(한 명/여러 명) + [자세히: 담당 직원] + [만들기]
 │     │        └ draftManual → ManualInput → onDone(input)
 │     ├ 예시: 카드 목록 → 클릭 → 템플릿을 t()로 풀어 ManualInput → onDone(input)
 │     └ 직접: onDone(emptyInput(kind))   ← 종류 질문은 선택 화면 직후 같은 방식
 ├ onDone(input) → NewManualDialog 닫고 setEditing({ input, isNew: true })
 └ ManualEditor onSaved(saved: Manual) → isNew면 setTraining(saved) (요구 5)
```

- `NewManualDialog`의 상태(`step`, `request`, `kind`, `drafter`, `isDrafting`, `error`)는 **그 창 안에만** 둔다. 스토어로 올리지 않음(공유 필요 없음).
- `ManualEditor`는 `initial`을 받아 자기 `form`만 관리(현재와 동일). 초안·템플릿 모두 "초기값을 바꿔 연다"로 끝나 **덮어쓰기 문제가 구조적으로 없음**.
- 종류 질문 문구: "한 명이 하는 업무 / 여러 명이 이어서 하는 업무" 라디오 2개. 말로 설명에서는 기본 선택 없이 시작해 입력 전 선택을 요구하기보다 **기본값 "한 명이 하는 업무"** + 변경 가능(질문이 하나 줄어듦). (AI가 종류까지 판단하는 안은 백엔드 프롬프트가 `kind` 분기라 변경량이 커서 보류 — 아래 6장 한계 참고.)

### 휴대폰(IS_REMOTE_SCREEN)
새 진입 구조도 그대로 쓰되 저장 위치 규칙(내 계정 비활성·랩 폴더만)은 **편집 창 고급 안**에서 현재 코드를 그대로 옮긴다. 이번 범위에서 로직 변경 없음.

---

## 4. 항목별 설계

### 4-1. 저장 불가 사유 (`manualProblems.ts`)

```ts
export type ManualProblem = { field: string; key: TKey; vars?: Record<string, string | number> }
// field: 'title' | 'description' | 'body' | 'steps' | 'fileName' | `step:${id}:title|role|instruction`
export function manualProblems(f: ManualInput): ManualProblem[]
```

- 기존 5개 조건을 1:1로 풀어 쓴다: 이름(표시 이름 비었는지)·`description.trim()`·개인은 `body.trim()`·프로세스는 단계 0개·단계별 `title/role/instruction`·파일 이름 규칙(고급에서 고친 경우만 위반 가능).
- **버튼은 비활성하지 않는다.** `handleSave`가 `manualProblems(form)`이 비어 있지 않으면 `setShowProblems(true)` 후 return. 이유: 비활성 버튼은 "왜"를 말할 수 없고, 사유는 눌러 본 뒤에만 보이면 입력 중 빨간 줄로 방해하지 않는다.
- 표시: 푸터 위 한 줄 `"아직 비어 있는 곳이 있어요: 이름 · 단계 2의 지시"`(항목은 `manuals.problem.*` 키를 `t()`로 풀어 `manuals.problem.sep`로 연결 — 일본어·중국어 구분 기호 때문에 사전 키로 둠).
- 칸 강조: `const bad = (field) => showProblems && problems.some(p => p.field === field)`, 해당 `Input/Textarea`에 `className={cn(..., bad('title') && 'border-status-error')}`. **`input.tsx`·`textarea.tsx`에는 `aria-invalid` 스타일이 없음**(grep 확인) → 공통 컴포넌트를 건드리지 않고 클래스만 얹는다. 접힌 고급/단계 안에 문제가 있으면 해당 접힘을 자동으로 펼친다(`useEffect`로 `showProblems`가 켜질 때).
- 서버 에러(`handleSave` catch의 중복 이름 등)는 지금처럼 `error` 문구로 유지.
- 단계 맞는 순서 번호는 `i + 1`(화면 번호와 동일).

### 4-2. 직원 0명 AI 초안

- **화면**: 초안 입력은 `NewManualDialog`의 "말로 설명" 갈래로 이동. `staff.length > 0` 조건 삭제. 담당 직원 드롭다운은 `MoreToggle`("자세히") 안에, 기본값은 `''`(= 앱 기본 AI). 직원이 있을 때도 기본은 "알아서"로 두어 첫 사용자가 고를 것이 없다.
- **백엔드** `office.ts draftManual(staffId: string | null, request, kind)`:
  - `null`/빈 값이면 `cwd: os.homedir()`, `model` 생략, system은 직무 문구 없이 "회사 업무 매뉴얼을 작성합니다" + `t('staff.language')`, `recordUsage` 건너뜀. (같은 파일 1220행이 `askOnce({ tier:'light', cwd: os.homedir() })`로 이미 쓰는 패턴. `tier`는 기존 draft와 같은 `'standard'` 유지.)
  - 직원이 지정됐는데 못 찾으면 지금처럼 오류.
  - 프롬프트 JSON에 `"title":"한글 업무 이름(앱 언어)"` 추가 + 반환값에 `title` 포함. `name`은 계속 영문 슬러그 요청하되 **화면에서 쓰지 않고 `slugFromTitle`/중복 회피로 최종 결정**(AI가 준 name이 이미 있으면 충돌). 즉 AI의 `name`은 참고용, 신뢰하지 않는다.
- 타입: `draftManual(staffId: string | null, …): Promise<Pick<ManualInput,'name'|'title'|'description'|'body'|'steps'>>`. 휴대폰이 같은 메서드를 호출하는지 `officeHandlers.ts`·원격 프로토콜(`remote-protocol-v1.md`)에서 확인 필요(스키마가 있으면 `string | null` 반영).
- **덮어쓰기 확인(요구 2 후단)**: 위 구조로 초안은 항상 "새 폼"에만 들어가 입력을 덮어쓰지 않는다. 기획서 문구와 다르므로 정리드가 판단: (a) 이 안 그대로, (b) 편집 창에 "✨ AI로 다시 쓰기"를 남기고 `form`이 비어 있지 않으면 `window.confirm` — 비추천(편집 창이 다시 7칸 복잡해짐).
- 오류: 실패해도 입력한 문장은 유지하고 `manuals.editor.draftFailed` 재사용, 다시 만들기 가능.

### 4-3. 한글 이름 — 저장 위치와 하위호환

**제안: SKILL.md frontmatter에 `title:` 한 줄.**

```
---
name: bug-report            ← 폴더·AI 호출명, 영문 규칙 그대로
title: "버그 리포트"         ← 신규, 한글 자유
description: "..."
---
```

- 이유: `kind: process`가 이미 같은 방식으로 앱 전용 키를 frontmatter에 둔 선례. 별도 인덱스 파일·DB를 만들면 파일을 복사/직원 팩으로 옮길 때 표시 이름이 떨어져 나가고 동기화 코드가 생긴다. 매뉴얼은 "파일 하나가 전부"인 단순함을 유지.
- **하위호환**: 기존 파일엔 `title`이 없음 → `parse`가 `title: meta.title || undefined`. 화면은 항상 `manualLabel(m) = m.title || m.name` 한 함수로 표시(목록 카드·`TrainDialog` 제목·삭제 확인·슬래시 메뉴·단계 진행 실행 기록). 목록 카드는 `title`이 있으면 제목은 표시 이름 + 파일명 `font-mono text-[10px]`, 없으면 지금과 동일한 파일명 한 줄.
- 편집 창에서 기존 매뉴얼 열기: 표시 이름 칸은 `title || name`으로 채움(저장하면 `title`이 생김 — 해롭지 않음).
- `manualTitle`(`office.ts:3254`, 실행 기록용)은 `manual.title || (description 첫 문장) || name` 순서로 한 줄만 바꾼다. **우선순위 변경**이라 실행 기록 표시가 달라지는 부작용(기존엔 설명 첫 문장)을 정리드가 판단. 기존 매뉴얼은 title 없으니 불변.
- **이름 규칙 단일화** `shared/manualName.ts`:
  ```ts
  export const NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/
  export const isValidManualName = (n: string) => NAME_RE.test(n)
  export function slugFromTitle(title: string, taken: Set<string>): string
  ```
  `slugFromTitle`: 소문자화 → 라틴 외 문자·공백 `-` → 연속 `-` 압축·양끝 제거 → 2자 미만(한글만 입력한 경우 포함)이면 `manual-<base36 시간 뒤 5자>` → 중복이면 `-2`, `-3`… 한글은 **음역하지 않는다**(번역/음역 라이브러리·품질 문제 회피).
  - `manuals.ts`는 여기서 import해 `isValidManualName`을 재사용(`export const isValidManualName`은 기존 호출처 보호용으로 re-export). 화면의 `NAME_RE`는 삭제.
  - **`taken`은 전체 매뉴얼 이름**(범위 무관). 이유: `trainStaff`·`trainGroups`가 이름을 키로 `equipment.skills`에 저장하므로 사용자 범위와 프로젝트 범위의 동명 매뉴얼이 섞인다(코드로 확인).
- 파일 이름 자동 생성: `ManualEditor`에서 `fileNameTouched` 플래그 — 사용자가 고급에서 직접 고치기 전엔 표시 이름이 바뀔 때마다 `form.name = slugFromTitle(...)`로 갱신. **편집 중인 기존 매뉴얼은 처음부터 touched=true**(이름을 조용히 바꿔 폴더 이동·교육 해제가 생기지 않게).
- 직원 팩(`staffPack.ts`): 가져오기는 `saveManual`을 거치므로 코드 변경 불필요. 팩 파일 형식에 `title`을 싣는 건 이번 범위 밖(내보낸 팩은 파일명으로 표시되는 하위호환 동작).
- 한계: Claude Code가 frontmatter의 모르는 키(`title`)를 무시한다는 것은 `kind` 선례로 추정할 뿐 **직접 확인 못 함** → QA에서 직원이 `title` 있는 스킬을 정상 호출하는지 확인.

### 4-4. 3갈래 진입 + 예시 템플릿

**`NewManualDialog.tsx`**: `step: 'choose' | 'describe' | 'templates'` 한 개의 상태. 카드 3장은 같은 마크업을 3번 쓰므로 `const START = [...]` 배열을 map(아이콘·키·핸들러). "직접 만들기"는 `onDone(emptyInput(kind))`; 종류는 직접·말로 모두 같은 `KindChoice`(라디오 2개, 함수 컴포넌트 한 개)로 선택.

**예시 템플릿 위치 — 구조는 코드, 글자는 사전.**
```ts
// manualTemplates.ts (구조만; 글자는 키로 참조)
export const TEMPLATES: TemplateDef[] = [
  { id: 'writeReview', kind: 'process', icon: '✍️', steps: [
      { role: 'writer', needsMyCheck: false, onRevise: null },
      { role: 'reviewer', needsMyCheck: true, onRevise: 0 } ] },
  ...
]
export const fromTemplate = (d: TemplateDef): ManualInput  // t(`manualTpl.${id}.title`) 등을 tx()로 풀어 채움
```
- 사전 키 규칙: `manualTpl.<id>.title|desc|body`, `manualTpl.<id>.s<N>.title|role|instr` → 계산된 키이므로 `tx(key, '')` 사용(CONTEXT 다국어 절의 허용 방식). i18n 테스트의 "사전에 없는 키" 검사는 리터럴만 잡으므로 **템플릿 id×필드 목록을 테스트에서 순회해 누락 확인**하는 케이스를 `manuals.test.mts`에 넣는다.
- 글자는 별도 영역 파일 `dict/manualTemplates.ts`로 분리 → 김기획이 구조 변경 없이 문구만 작성·수정 가능(위임 경계가 깔끔). 구조(id·단계 수·`needsMyCheck`·`onRevise`)는 코드에 있어 타입 검사 가능.
- 템플릿 열기 = 현재 언어로 **풀어서 저장 가능한 폼에 복사**. 저장되는 글자는 사용자 데이터라 번역 대상이 아님(언어를 바꿔도 이미 만든 건 그대로).
- 역할 키워드: 템플릿의 `role`은 직원 직무에 포함 매칭되는 키워드이므로 언어별로 사전에 둔다. **'리뷰어' 같은 키워드는 한국어 직무명 기준** — 직원이 없을 때 무엇이 일치하지 않는지 확인 필요(기획 단계에서 audit 1-1 #9와 같은 한계, 이번 범위에선 그대로).
- 템플릿 6~8개 목록·문구는 김기획 몫. 구조 상한 제안: 개인 3 + 프로세스 4 정도로 섞고 단계 2~4개.

### 4-5. 고급 접기 (`MoreToggle`)

HireDialog 237~247행(버튼+쉐브론+"자세히/간단히"+접혔을 때 설명)을 그대로 추출:
```tsx
<MoreToggle open={isOpen} onToggle={...} hint={t('manuals.editor.moreDesc')} />
```
- 라벨은 기존 `guideHint.hire.more/less`를 그대로 재사용(일반 문구라 새 키 불필요). 설명(`hint`)만 용도별 새 키.
- 사용처 3곳: 고용 창(교체), 편집 창 고급, 단계 카드 "이 단계 설정". 3번째이므로 분리 정당.
- 편집 창 기본: 표시 이름 · 언제 쓰는지 · (개인) 절차 / (프로세스) 단계(제목·담당·지시). 고급: 저장 위치(+폴더…)·파일 이름·공통 안내(프로세스 body). 단계 카드 고급: 내 확인·되돌리기·최대 반복. 어디서든 처음 열 때 값이 기본과 다르면(템플릿이 `needsMyCheck`를 켠 경우) **자동 펼침**으로 숨은 설정을 놓치지 않게.
- 개인 매뉴얼의 "절차·주의점"은 기본에 남김(그 종류의 본체).
- 되돌리기 용어: `onRevise`/`maxLoops` 라벨은 audit 용어표대로 "검토 후 고쳐야 하면 → [앞 단계로 다시 보내기]" / "다시 보내는 건 최대 N번까지". 첫 단계에서는 의미 없으므로 `i === 0`이면 이 줄을 아예 숨김(데이터 변경 없음).
- 저장 위치 기본값 변경(audit 5순위, 요구 1~6 밖)은 이번에 **손대지 않을 것을 제안**. 단 한 줄(`emptyInput` scope)이므로 원하면 정리드가 포함 가능.

### 4-6. 저장 후 "쓸 수 있게 하기" 연결 (요구 5)

- `ManualEditor`에 `onSaved(saved: Manual)` 추가(`saveManual`이 이미 `Manual` 반환 — `handleSave`에서 `await`한 값 사용). `ManualsPage`가 `isNew`(새로 만든 경우만; 고치기는 제외)일 때 `setTraining(saved)`로 연다. 닫기(`onClose`)는 취소 경로 그대로.
- `TrainDialog` 변경: 제목 "누가 쓰나요?", 제출 버튼 "쓸 수 있게 하기"(해제도 같은 버튼이므로 동사 중립). **저장 직후 열릴 때만** 상단에 "저장했어요. 누가 쓰게 할까요?" 한 줄(prop `justSaved`). 기본 선택은 현재 구현(이미 쓰는 사람 체크)에서 **"모든 직원/랩"을 체크해 열기**를 audit이 제안했으나, 암묵적으로 전원에게 권한이 가는 것이라 **기본은 비어 있게 하고 "모두 선택" 칩 하나**를 추가하는 안을 추천(되돌릴 수 없는 건 아니지만 의도하지 않은 교육을 막음). 정리드 판단 사항.
- 직원이 0명이면 `TrainDialog` 안에 빈 상태(`EmptyGuide` 재사용: "아직 고용한 직원이 없어요" + 고용 버튼). 현재는 칩이 비어 보이기만 함.
- 목록 카드 버튼: `🎓 교육 N` → `사용 중 N` 류(`manuals.trainCount`) + 0이면 눈에 띄게(`variant="default"`)로 "쓸 수 있게 하기" 노출. 아이콘 `GraduationCapIcon` 교체(학사모는 '교육' 연상).

### 4-7. 빈 화면 공통 컴포넌트 `EmptyGuide`

```tsx
// components/empty-guide.tsx
type Props = {
  icon?: ReactNode            // 선택
  title: string               // "결재할 건이 없어요 🎉"  (IconText로 이모지 처리)
  what?: string               // 이게 뭔지   (없으면 생략)
  when: string                // 언제 생기는지
  children?: ReactNode        // 첫 행동 버튼들 (Button)
  className?: string
}
```
- 결재함 마크업(`flex flex-col items-start gap-2 text-sm text-muted-foreground`, 제목 `<p>`, 설명 `text-xs`)을 그대로 옮김 → 외형 일관. 버튼은 호출자가 `children`으로 넘기는 단순 API(액션 배열 props 만들 필요 없음 — 버튼 종류·조건이 화면마다 달라 일반화하면 오히려 복잡).
- 적용:
  - **결재함**: 기존 3줄을 `EmptyGuide`로 교체(키 `guideHint.inbox.*` 유지 → 동작·사전 불변). 직원 없을 때 고용 버튼은 `children`.
  - **매뉴얼실**: 매뉴얼이 0개일 때만 목록 대신 `EmptyGuide`(무엇인지: 직원이 일하는 순서를 적은 문서 / 언제: 만들면 여기 쌓이고 직원이 '쓸 수 있게' 한 뒤 쓴다 / 버튼: ✨말로 설명해서 만들기). 한 종류만 비었을 땐 기존 한 줄 유지(2번 안내하면 소음).
  - **업무 보드**: 카드가 하나도 없을 때. 버튼: 카드 만들기(기존 핸들러) — 직원이 없으면 고용. **BoardPage 안 "카드 만들기" 진입점과 빈 상태 렌더 위치는 이번 조사에서 못 찾음 → 구현 시 확인.**
  - **대화방**: 기록 0건일 때 입력창 위(또는 목록 영역)에 표시. 버튼: 직원이 없으면 고용, 있으면 "예시 지시 넣기"(입력창에 문장 채우기). 같은 이유로 **위치 구현 시 확인**. `StaffPanel.tsx:747`의 `guideHint.panel.*` 빈 직원 패널 방식(예시 3개)이 가장 가까운 선례.
  - **지식**: 현재 점선 박스(`KnowledgePage.tsx:88`)를 `EmptyGuide`로 교체. `entries.length===0`일 때만(검색 결과 없음 `noMatch`는 그대로). 버튼: 지식 남기기.
- 사전: 화면별 키(`guideHint.<screen>.emptyTitle/What/When/Action`)를 `guideHint.ts`에 추가(이미 이 파일이 "빈 결재함·빈 직원 패널" 영역이라 위치 일관). 매뉴얼 쪽은 `manualStart.ts`와 중복 정의하지 말고 여기만 사용.

---

## 5. 4개 언어 사전 키 (ko·en·ja·zh 동시, 제안 목록)

**수정(기존 키, `featuresA.ts` 제자리)**
`manuals.description`(스킬 제거), `manuals.kind.personal`("한 명이 하는 업무"), `manuals.kind.process`("여러 명이 이어서 하는 업무"), `manuals.section.process/personal`, `manuals.empty`, `manuals.trainCount`, `manuals.confirmDelete`, `manuals.editor.newTitle/descProcess/descPersonal`, `manuals.editor.nameLabel`("이름"), `manuals.editor.location`("어디서 쓰나요?")·`locationUser`("모든 일에서 (추천)")·`locationProject`, `manuals.editor.stepRolePlaceholder`("누가 하나요? 예: 리뷰어"), `manuals.editor.needsMyCheck`, `manuals.editor.onRevise`("검토 후 고쳐야 하면"), `manuals.editor.noRevise`, `manuals.editor.reviseTo`, `manuals.editor.maxLoopsBefore/After`("다시 보내는 건 최대 / 번까지"), `manuals.train.title`("누가 쓰나요? · {name}"), `manuals.train.descPersonal/descProcess`, `manuals.train.submit`("쓸 수 있게 하기"). 
삭제 후보: `manuals.editor.draftLabel`·`draft`·`draftPlaceholderProcess/Personal`(말로 설명 갈래로 이전 — 키 이름은 `manualStart.describe.*`로 새로 만들고 옛 키 삭제. i18n 테스트가 "사용 안 하는 키"를 잡는지 확인).
`manuals.editor.draftFailed`·`drafting`은 재사용.

**신규 `manualStart.ts`**
- 진입: `manualStart.button`("새 매뉴얼"), `manualStart.title`, `manualStart.choose.hint`
- 카드 3장: `manualStart.describe.title/desc/badge(추천)`, `manualStart.template.title/desc`, `manualStart.direct.title/desc`
- 말로 설명: `manualStart.describe.label`, `manualStart.describe.placeholderOne`, `…placeholderMany`, `manualStart.describe.make`, `manualStart.describe.making`, `manualStart.describe.moreDesc`, `manualStart.describe.drafter`, `manualStart.describe.drafterAuto`
- 종류 질문: `manualStart.kind.question`, `manualStart.kind.one`, `manualStart.kind.oneDesc`, `manualStart.kind.many`, `manualStart.kind.manyDesc`
- 예시: `manualStart.template.pick`, `manualStart.template.stepsCount`, `manualStart.template.use`
- 편집 창: `manuals.editor.titleLabel`(표시 이름), `…titlePlaceholder`, `manuals.editor.fileName`, `manuals.editor.fileNameHint`, `manuals.editor.moreDesc`, `manuals.editor.stepMore`, `manuals.editor.stepMoreDesc`, `manuals.editor.reviseHint`, `manuals.editor.maxLoopsHint`, `manuals.editor.reviewTip`
- 저장 불가: `manuals.problem.header`, `manuals.problem.sep`, `manuals.problem.title`, `manuals.problem.description`, `manuals.problem.body`, `manuals.problem.steps`, `manuals.problem.stepTitle`({n}), `manuals.problem.stepRole`, `manuals.problem.stepInstruction`, `manuals.problem.fileName`
- 저장 후/교육 창: `manuals.train.justSaved`, `manuals.train.selectAll`, `manuals.train.noStaff`, `manuals.train.useNow`(카드 버튼), `manuals.card.fileName`(a11y 라벨)
- 삭제 확인: 기존 `window.confirm` 유지(audit의 앱 내 확인창은 요구 1~6 밖, 이번엔 손대지 않음)

**신규 `manualTemplates.ts`(글자)**: `manualTpl.<id>.title|desc|body` + `manualTpl.<id>.s<N>.title|role|instr` (id·단계 수는 김기획 확정 후).

**수정 `guideHint.ts`**: `guideHint.manuals.{emptyTitle,emptyWhat,emptyWhen,emptyAction}`, `guideHint.board.{…}`, `guideHint.chat.{…}`, `guideHint.knowledge.{…}` (4필드 × 3화면 + 매뉴얼 = 16개). 휴대폰 문구가 필요하면 `…Remote` 변형은 만들지 않고 버튼만 조건부 숨김.

공통 규칙: 화면 문구에 '스킬'·'토큰' 금지(영어는 skill/token 금지). 키 일괄 점검은 `pnpm test` i18n 테스트로.

---

## 6. 단순함의 한계·비용 (A안의 약점)

- 사유 목록은 문자열 조합이라 **입력 중 실시간 피드백은 없음**(눌러 봐야 보임). 즉각 피드백이 필요하면 파생 상태 `problems`를 매 렌더 계산하는 것은 같으니(이미 구현됨) 표시 시점만 바꾸면 된다.
- 한글 제목만 입력하면 파일 이름이 `manual-xxxxx`로 의미 없는 값이 되어 **터미널·파일 탐색기로 볼 때 알아보기 어렵다**. 대신 앱 안에서는 항상 표시 이름이 보인다. 영문 변환이 필요하면 AI 초안의 `name`을 쓰는 안이 있으나 신뢰·중복 문제 때문에 안 함.
- `title`을 SKILL.md에 두는 안은 **외부(터미널)에서 파일을 편집하는 사람이 `title` 줄을 지울 수 있음** → 그 경우 파일명으로 되돌아가 표시(안전한 하위호환이라 오류는 없음).
- 템플릿 문구를 사전에 두면 키가 많다(6~8개 × 약 10키 × 4언어). 단순함·번역 일관성을 우선했고, 대안(템플릿 텍스트를 한국어 코드에만 두기)은 "4개 언어 동시" 기준을 위반해서 택하지 않음.
- 편집 창 안 AI 초안 제거는 **기존 매뉴얼을 AI로 다시 쓰는 경로가 사라지는** 기능 후퇴다. 사용 빈도 데이터 없음(확인 필요).
- 3갈래 후에도 단계 5칸 입력 부담은 접기로만 줄임(마법사는 범위 제외).

---

## 7. 검증 방법

**자동 (`pnpm typecheck`, `pnpm test`)**
- `scripts/manuals.test.mts`(신규):
  1. `slugFromTitle`: 영문·한글·혼합·빈 값·중복(`-2`)·특수문자·63자 초과 → 항상 `NAME_RE` 통과.
  2. `saveManual`/`listManuals`(임시 홈 디렉터리): `title` 있는 파일 왕복, `title` 없는 기존 형식(영문)이 그대로 읽히고 `title`이 `undefined`, `kind: process`+`title` 공존, 따옴표·콜론 포함 제목, CRLF.
  3. `manualProblems`: 5개 조건 각각·여러 개 동시·단계 번호·정상 폼이면 빈 배열.
  4. 템플릿 완전성: `TEMPLATES` × 필드의 사전 키 4개 언어 존재 + `fromTemplate` 결과가 `manualProblems`에서 **빈 배열**(저장 가능한 상태로 열린다는 보증).
  5. `isValidManualName`이 main·renderer 양쪽에서 같은 함수를 가리킴(import 경로 하나).
- 기존 `i18n.test.mts`가 4개 언어 누락·`{변수}` 불일치·키 중복을 확인. `staffPack.test.mts`는 한글 title 없는 팩 가져오기 회귀로 그대로 통과해야 함.
- 직원 0명 초안: `draftManual(null, …)` 호출 경로는 `askOnce`를 가짜로 바꿔 인자(`cwd`=홈, `model` 없음)·반환(`title` 포함)·`recordUsage` 미호출을 확인하는 테스트 1개(기존 `reviewFixes.test.mts` 류의 목 방식 참고).

**수동/QA (정리드·오큐에이)**
- 직원 0명 상태에서 새 매뉴얼 → 말로 설명 → 초안 생성 → 저장 → "쓸 수 있게 하기" 창(직원 없음 안내).
- "버그 리포트" 한글 이름 저장 → 목록 카드 제목 한글 + 작은 글씨 파일명 → 직원에게 쓸 수 있게 → 단체방 `/` 메뉴에서 표시 이름으로 보이고 호출됨.
- 기존 영문 매뉴얼: 목록·편집·교육 모두 이전과 동일.
- 저장 막힘: 이름 비우고·단계 2 지시 비우고 저장 → 사유 문장 + 해당 칸 빨간 테두리 + 접힌 영역 자동 펼침.
- 휴대폰 화면에서 새 진입·내 계정 비활성 규칙.
- 빈 화면 4곳(매뉴얼·보드·대화방·지식) + 결재함 회귀: 문구와 첫 행동 버튼, 직원 0명일 때 고용 버튼. 라이트/다크·4개 언어 줄바꿈.
- 화면 문구에서 '스킬'·'토큰' 검색(사전 grep: ko/en/ja/zh 4언어 모두).

---

## 8. 정리드께 — 결정이 필요한 쟁점과 A안 추천

| # | 쟁점 | A안 추천 | 대안 |
|---|---|---|---|
| 1 | 표시 이름 저장 위치 | frontmatter `title:` | 별도 인덱스 JSON(동기화 비용·복사 시 유실 → 비추천) |
| 2 | 초안 덮어쓰기 확인 | 초안을 새 매뉴얼 단계에만 두어 문제 제거 | 편집 창에 초안 유지 + confirm |
| 3 | 저장 버튼 | 활성 유지, 누르면 사유 표시·강조 | 비활성 + 항상 사유 표시(조용하지만 실시간 노이즈) |
| 4 | 저장 직후 교육 기본 선택 | 비어 있게 + "모두 선택" 칩 | 전원 기본 체크(audit 제안, 의도하지 않은 권한 위험) |
| 5 | 종류 판단 | 라디오로 사용자가 선택(기본 한 명) | AI가 판단(프롬프트·백엔드 변경 큼, 이번 보류) |
| 6 | 저장 위치 기본값 "모든 일에서" | 이번엔 보류(범위 밖), 한 줄이라 요청 시 포함 | 이번에 포함 |
| 7 | `manualTitle`(실행 기록) 우선순위 | `title` → 설명 첫 문장 → name | 기존 유지(한글 이름이 실행 기록에 안 보임) |

미확인(구현 중 확인 필요): BoardPage·ChatPage 빈 상태 렌더 위치, `draftManual` 원격 프로토콜 노출 여부, Claude Code의 frontmatter 미지정 키 허용, i18n 테스트의 미사용 키 검사 여부.
