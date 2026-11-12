# 설계안 B — 유지보수성·변경 영향 최소화·검증 가능성 (박패턴)

대상: 비개발자 사용성 개선 1차 요구사항 1~6. 구현은 하지 않음. 최가독 안과 합의 없이 독립 작성 (비교는 맨 끝 "참고" 절에 따로).
경로 기준: `app/src/...` (이하 `main/`, `renderer/`, `shared/`).

## 0. 핵심 한 줄

**"파일 이름(`name`)은 지금처럼 유일한 식별자로 두고, 표시 이름(`title`)은 SKILL.md frontmatter의 선택 필드 한 줄만 추가한다."**
식별자를 바꾸지 않으므로 직원 장비(`equipment.skills`)·랩/팀 연결(`manuals`)·실행 기록(`manualName`)·AI 호출명·`/슬래시 명령`은 한 줄도 안 바뀐다.

## 1. 조사 결과

### (a) 한글 표시 이름 — 영향 범위

| 영역 | 현재 | 영향 | 처리 |
|---|---|---|---|
| 이름 규칙 3곳 | `ManualsPage.tsx:20`, `main/manuals.ts:11`, `shared/staffPack.ts:32` 같은 정규식 `^[a-z0-9][a-z0-9-]{1,62}$`를 각각 복사 | 규칙이 바뀌지는 않음(파일 이름 규칙 그대로). 다만 **세 곳 → 한 곳**으로 모을 기회 | `shared/manualName.ts`(순수)에 `MANUAL_NAME_RE`·`isValidManualName`·`makeManualSlug` 두고 세 곳이 import. `shared`는 순수 모듈이라 staffPack(shared)도 import 가능 |
| 저장 포맷 | frontmatter `name`, `description`, `kind`(process일 때) | `title:` 한 줄 추가. `parse()`가 이미 임의 키를 `meta`로 읽고, 값은 `unquote()`가 JSON 문자열을 처리하므로 한글·따옴표 OK. 키 정규식 `[a-zA-Z_-]+`에 `title` 통과 | `render()`에서 `title`이 있을 때만 `title: <JSON.stringify>` 출력 |
| 기존 매뉴얼 | `title` 없음 | `parse()`가 `title: meta.title ?? ''` → 화면은 `title \|\| name` | 마이그레이션 없음. 파일을 다시 저장할 때까지 그대로 |
| 파일 이름 자동 생성 | 사용자가 직접 입력 | 한글 → 로마자 변환은 라이브러리·오변환 위험이 커서 **안 함**. 규칙: ① 제목에서 영문·숫자만 뽑은 슬러그가 2자 이상이면 사용(`PR 리뷰` → `pr`는 2자라 통과하지만 의미 약함 → 4자 미만이면 폴백) ② 아니면 `manual-` + 무작위 6자(base36) | **해시가 아니라 무작위**. 같은 제목이 항상 같은 슬러그가 되면, 직원 팩 가져오기에서 "같은 이름·다른 내용"이 조용히 건너뛰어짐(`applyPack`의 `existing.has` → continue) |
| 중복 파일 이름 | `saveManual`이 새로 만들 때 폴더가 있으면 throw | 화면이 목록(`store.manuals`)을 알고 있으므로 `makeManualSlug(title, takenNames)`가 `-2`, `-3`을 붙여 **저장 전에** 피함. main의 throw는 최후 방어로 그대로 둠(경쟁 상태·원격) | 같은 scope뿐 아니라 user+project 전체 이름을 피한다 (`name`이 장비·랩 연결에서 scope 없이 쓰이는 식별자이므로) |
| 직원 팩(`staffPack`) | `PackManual {name, description, body}`, `readManual`이 `MANUAL_NAME_RE` 검사 | `title` 없이도 파일은 유효(하위 호환). 새 앱이 낸 팩을 옛 앱이 읽으면: `readManual`이 필드를 골라 새 객체를 만들므로 `title`은 **무시됨**(오류 아님) | `PackManual`에 선택 `title?` 추가, `readManual`(길이 상한 `PACK_LIMITS.descMax` 재사용), `buildPack`(:347)·`applyPack`(main/staffPack.ts:49)에서 전달. 충돌 판정(`manualConflict`)은 `name`+`body` 그대로 |
| 원격(`remote/v2.ts`) | `saveManual: S('o s?')` + `V2_FIELDS.saveManual`이 허용 필드 목록(:255) | **`title`을 목록에 안 넣으면 폰에서 저장 시 제목이 막힌다.** `fieldsOf`는 `Record<keyof ManualInput, true>`로 타입 검사하므로 `ManualInput`에 `title`을 넣는 순간 컴파일 오류로 누락을 잡아 줌 | `title: true` 추가. 폰 화면 자체는 이번 범위 밖 |
| 비서 도구 | `secretaryTools.ts:341` saveManual 인자 설명 문자열, `secretaryCompact.ts:197`(비교 카드), `secretaryDescribe.ts`(`objectLines`가 화이트리스트 키 사용, `title`이 이미 포함) | ① 설명 문자열에 `title?` 추가 ② **비서가 title 없이 고치기(previousPath)로 저장하면 기존 제목이 지워진다** ③ `compactManual`이 `name`만 보여 주면 비서가 한글 제목을 모름 | ②는 `office.saveManual`에서 `input.title === undefined`이고 `prev`가 있으면 `prev.title` 유지(빈 문자열 `''`이면 의도적 삭제). ③ `compactManual`에 `title` 추가 |
| AI 호출명 | 직원 장비·`/명령`·Codex 스킬 루트(`codexSkillRoots`)가 모두 폴더·`name` 기준 | **영향 없음.** `title`은 모델이 보는 `name`/`description`과 무관 | Claude Code가 frontmatter의 모르는 키 `title`을 무시하는지는 `kind` 선례로 추정일 뿐 → **QA에서 실제 확인** (실패 시 대안: `title`을 `description` 앞에 붙이는 방식은 비추천, 대신 `x-office-title:` 같은 접두 키로 변경 — 키 이름만 바꾸면 되도록 상수 `TITLE_KEY` 한 곳에 둠) |
| 실행 기록 | `ProcessRun.manualName`(식별), `manualTitle`(표시: `description` 첫 문장 `\|\| name`, office.ts:3254) | 기존 기록은 스냅샷이라 변하지 않음 | 새 실행부터 `manual.title \|\| 첫 문장 \|\| name`. **추천: title 우선.** 사용자가 정한 이름이 가장 명확하므로 |
| 교육 알림 | office.ts:3213 `📘 "${manualName}" 매뉴얼 교육을 받았어요!` | 슬러그가 그대로 노출됨(한글 제목을 만든 사용자에게 `manual-a1b2c3`이 보임) | 알림 문구에만 `title \|\| name` 사용(`listManuals`로 한 번 조회). 문구는 요구사항 5의 "쓸 수 있게 하기" 용어와 함께 사전 키로 |
| 이름 바꾸기 | 편집에서 `name`을 바꾸면 폴더가 옮겨지지만 `equipment.skills`·`lab.manuals` 참조는 **갱신되지 않음**(`deleteManual`만 정리) | 기존 문제. 고급에서 파일 이름 수정을 열면 더 쉽게 밟음 | **기존 매뉴얼은 파일 이름을 읽기 전용으로 표시**(새 매뉴얼만 수정 가능). 참조 갱신 로직은 이번 범위 밖(별도 카드 제안) |

### (b) `draftManual` — 직원 없이 가능한가

- **가능.** 필요한 것은 `cwd`·`model`·`system`뿐인데 직원에게서 오는 값은 `s.cwd`, `s.model`, 페르소나 문구, `recordUsage(staffId)` 네 가지.
- `askOnce`는 `cwd: string` 필수 → 직원 없음이면 `os.homedir()` (같은 파일 1220·3834행에 선례), `model` 생략 → 백엔드 기본, `tier: 'standard'` 유지. 시스템 문구는 페르소나 줄만 빼고 `t('staff.language')` 유지.
- `recordUsage`는 `staffId`가 있을 때만 호출(직원 없음이면 비용을 귀속할 곳이 없음). **알려진 한계**: 이 비용은 직원별 사용량에 안 잡힘. (1220행의 비직원 호출도 같은 사정인지 구현 때 확인 필요.)
- **시그니처는 바꾸지 않는다.** `draftManual(staffId: string, ...)` 그대로, **빈 문자열 `''` = 앱 기본 AI**. 근거: 원격 스키마가 `R('s s s')`(`typeof === 'string'`)라 `null`/`undefined`를 받으려면 프로토콜 스키마·`officeApiShape`·폰 쪽까지 건드려야 함. 반면 `''`는 변경 0. 존재하지 않는 비어 있지 않은 id는 지금처럼 오류(오타를 조용히 기본 AI로 돌리지 않음).
- 반환형에 `title` 추가: `Pick<ManualInput, 'name' | 'title' | 'description' | 'body' | 'steps'>` — 옛 폰 앱이 받아도 추가 필드는 무시되어 안전.
- 변경 범위 요약: `shared/types.ts:1200` 반환형·주석, `main/office.ts` `draftManual`(분기 3줄 + 프롬프트 JSON 예시에 `title`), `secretaryTools.ts:301` 설명 문자열, 화면. **`workspace.ts:226`(`write`)·`officeApiShape.ts`·`v2.ts:141`·`officeHandlers.ts:208`·`secretary.ts` 규칙은 변경 없음.**
- 쓰기 막기 표 참고: 새 메서드를 추가하지 않으므로 `Record<OfficeMethod,'read'|'write'>` 누락 위험 없음. (새 메서드가 필요해지면 기본값은 `write`.)

## 2. 요구사항별 설계

### 2-1. 구조 (역할 분리 — 이번 작업에서 이득이 있는 것만)

| 단위 | 위치 | 역할 | 분리 이유(이득) | 추가 복잡도 |
|---|---|---|---|---|
| 이름·슬러그 규칙 | `shared/manualName.ts` (순수) | 정규식, 검증, `makeManualSlug(title, taken)`, `manualLabel(m)` = `title \|\| name` | 규칙이 3곳 복사 → 1곳. 단위 테스트 가능 | 파일 1개 |
| 폼 검증 | `shared/manualForm.ts` (순수) | `manualProblems(form): Problem[]`(`{field, key, params}`), `isDirty(a, b)` | 요구 1(사유 문장+칸 강조)·요구 2(덮어쓰기 확인)의 판단이 화면 밖으로 → 컴포넌트 없이 테스트 | 파일 1개 |
| 저장 포맷 | `main/manuals.ts` | `title` 읽기·쓰기만 | 포맷 책임은 이미 여기 | 변경 ~6줄 |
| 초안 | `main/office.ts` `draftManual` | 직원 없음 분기 | 위 (b) | 분기 1개 |
| 화면 | `ManualsPage.tsx` | 목록 카드·편집·`TrainDialog`·3갈래 | **지금은 파일을 쪼개지 않음.** 편집 폼이 이미 별도 함수 `ManualEditor`. 3갈래 선택 창(`NewManualDialog`)만 새 컴포넌트로(폼 2개 흐름이 한 컴포넌트에 섞이면 안 됨). 편집 폼이 더 커져 가독성이 문제가 되면 그때 분리 | 컴포넌트 1개 |
| 접기 | `MoreToggle` 추출 | 채용 창의 "자세히 설정"을 재사용 | 같은 모양이 고급·단계 카드 2곳 추가로 생김(3곳 이상) | 추출 1개, 기존 채용 창은 동작 동일 |
| 예시 템플릿 | `renderer/features/manualTemplates.ts` | 구조(kind, 단계 수·role 키 `id`)만, 문구는 사전 키 | 김기획이 사전만 수정 가능 | 구조 파일 1개 |
| 빈 화면 | `EmptyGuide` 추출 | InboxPage의 마크업을 그대로 추출 | 요구 6이 5곳 반복 | 컴포넌트 1개. **먼저 InboxPage를 이 컴포넌트로 바꿔 시각 동일을 확인한 뒤** 4곳 적용 |

### 2-2. 데이터 흐름

```
[새 매뉴얼] → NewManualDialog
   ├ ✨말로 설명: draftManual(drafter ?? '', request, kind) ─┐
   ├ 📋예시: manualTemplates[id] → t(키) 채움 ──────────────┤→ ManualInput(title, name 자동) → ManualEditor(initial)
   └ ✍️직접: 빈 ManualInput ─────────────────────────────┘
ManualEditor: title 입력 → name은 사용자가 고급에서 건드리기 전까지 makeManualSlug(title, taken)로 자동 갱신
              저장 → manualProblems(form) 비어 있으면 saveManual(form, previousPath)
                     → (새로 만든 경우만) TrainDialog 즉시 열기 / 고치기는 닫기
```
- `name`을 사용자가 직접 고쳤는지 `isNameManual` 상태 하나로 구분 (자동 갱신이 직접 입력을 덮어쓰지 않게).
- 초안 결과의 `name`은 **힌트**: `isValidManualName`이고 중복이 아니면 사용, 아니면 `makeManualSlug`. AI가 한글·공백 이름을 줘도 저장이 막히지 않음.

### 2-3. 상태·오류 처리 (요구 1·2)

- **저장 버튼은 비활성하지 않는다.** 비활성 버튼은 이유를 말해 주지 못함. 누르면 `manualProblems`를 계산해 ① 사유 문장 한 줄(첫 문제 + "외 N개") ② `problems[].field`에 해당하는 칸에 오류 테두리·`aria-invalid` ③ 첫 문제 칸으로 포커스. 한 번 눌린 뒤에는 입력할 때마다 재계산(사유가 실시간으로 줄어듦).
- 문제 종류(키): 제목 비어 있음 / 파일 이름 형식 오류(고급이 접혀 있으면 자동으로 펼침) / 언제 쓰는지 비어 있음 / 개인: 본문 비어 있음 / 프로세스: 단계 0개 / 단계 n의 담당·지시·제목 비어 있음. 단계 n 표기는 인덱스 `field: 'step.2.instruction'`로 칸을 지정.
- 저장 서버 오류(중복 이름 등)는 지금처럼 `error` 상태 문자열로 표시(기존 `replace` 정규식 유지). 중복은 슬러그 자동 회피로 대부분 도달하지 않음.
- **초안 덮어쓰기 확인(요구 2)**: 편집 창에서 초안을 다시 만들 일이 없어지면 확인이 필요 없지만, 기획서는 "덮어쓸 때 확인"을 요구하므로 구조를 단순하게 두는 대신 **확인을 둔다**: 초안 상자가 편집 창에 남는 경우(직접 만들기 폼 안의 "AI에게 초안 맡기기" 링크)에만 `isDirty(form, initial)`일 때 확인. 3갈래 진입의 ✨는 빈 폼에서 시작하므로 확인 없음.
- 초안 중 오류: 기존 `manuals.editor.draftFailed` 유지, 진행 중 중복 클릭 방지 `isDrafting` 유지.

### 2-4. 요구 5 — 저장 후 연결·용어

- 저장 성공 후 `setTraining({name, kind})`로 `TrainDialog` 열기(새로 만든 경우만; 고치기에서는 열지 않음 — 고칠 때마다 권한 창이 뜨면 방해).
- 기본 선택은 **비워 둠** + "모두 선택". 근거: 개인 매뉴얼을 쓸 수 있게 하는 것은 `equipment.skills`에 추가 = 직원 권한 확대. 전원 기본 체크는 의도치 않은 권한 부여. (기획서와 다르므로 정리드 판단 필요 — 쟁점 2.)
- 용어는 사전 값만 변경: 키 이름(`manuals.train*`)은 바꾸지 않아 참조 코드 영향 0. 단 '스킬'·'토큰' 노출 금지 점검은 사전 전체 grep(아래 테스트).

### 2-5. 요구 4·6 요약

- 템플릿 6~8개: 구조 파일에 `kind`, 단계 `role` 키워드, 되돌리기 여부만. 문구(제목·설명·본문·지시)는 `manuals.tpl.<id>.*` 사전 키 → 4개 언어. 템플릿의 `role`은 사무실 직무 키워드이므로 번역된 role 문자열이 `stepMember` 매칭(`role.includes(key)`, office.ts:3243)에 쓰임 → **언어를 바꾸면 매칭이 안 될 수 있음**: 템플릿 role 문구는 그 언어 사용자가 흔히 쓰는 직무명이어야 함(김기획에게 전달 필요).
- 종류 이름 "한 명이 하는 업무 / 여러 명이 이어서 하는 업무": 사전 값만 변경(`KIND_LABEL`).
- 빈 화면: 위 표. 업무 보드·대화방의 렌더 위치는 구현 때 찾음(최가독도 못 찾음) — 먼저 `grep` 해서 위치 확정이 구현 첫 작업.

## 3. 변경 파일 목록과 위험도

| 파일 | 변경 | 위험 |
|---|---|---|
| `shared/types.ts` | `Manual.title?`, `ManualInput.title?`, `draftManual` 반환·주석 | 낮음(선택 필드) |
| `shared/manualName.ts`·`manualForm.ts` (신규) | 순수 함수 | 낮음 |
| `shared/staffPack.ts` | 정규식 import, `PackManual.title?`, read/build | 낮음. 하위 호환 확인 테스트 필요 |
| `main/manuals.ts` | parse/render `title`, 정규식 import | 중간 — **저장 포맷**. 라운드트립 테스트 필수 |
| `main/office.ts` | `saveManual` title 유지, `draftManual` 분기, 교육 알림·`manualTitle` | 중간 |
| `main/staffPack.ts` | applyPack에 title 전달 | 낮음 |
| `main/remote/v2.ts` | `V2_FIELDS` `title` | 낮음(타입이 강제) |
| `shared/secretaryTools.ts`·`secretaryCompact.ts` | 설명 문구·compact에 title | 낮음 |
| `ManualsPage.tsx` 외 화면, 사전 4개 언어 | UI | 중간(범위 큼) |

**건드리지 않는 것**: 식별자(`name`) 의미, `equipment.skills`, `lab/team.manuals`, `ProcessRun.manualName`, `trainStaff/trainGroups` 시그니처, `workspace.ts` 읽기/쓰기 표, `v2.ts` 메서드 스키마.

## 4. 검증 방법 (추가할 단위 테스트)

기존 `app/scripts/*.test.mts` 방식(node 테스트)을 따른다. 새 파일: `manualName.test.mts`, `manualForm.test.mts`, `manuals.test.mts`(없으면 신규).

**manualName**
1. `makeManualSlug('주간 보고')` → `manual-` + 6자, `isValidManualName` 통과
2. `makeManualSlug('PR Review 체크')` → 영문 부분 사용, 규칙 통과
3. 영문 4자 미만(`'QA 점검'`)·빈 문자열·특수문자만 → 폴백 형식
4. `taken`에 같은 이름이 있으면 `-2`, `-3`, 63자 초과 시 잘라 붙여도 규칙 통과
5. 무작위 폴백 슬러그 두 번 호출 시 서로 다를 수 있고 항상 규칙 통과 (여러 번 반복)
6. 세 곳이 같은 규칙을 쓴다: `main/manuals.ts`·`shared/staffPack.ts`가 `shared/manualName`을 import 한다(소스에 정규식 리터럴 없음) — grep 테스트 또는 같은 입력 표(`Bad Name`, `a`, 64자, 한글)로 세 검증 결과 동일
7. `manualLabel`: title 있음/빈 문자열/없음

**manuals (main, 임시 폴더 HOME 대체 또는 `projectDir` scope 사용)**
8. title 있는 매뉴얼 save → 파일에 `title: "..."` 한 줄, load하면 `title` 일치(한글·따옴표·콜론·개행 포함 제목 라운드트립)
9. 옛 형식 파일(title 없음, CRLF 포함) load → `title === ''`, 나머지 필드 동일(하위 호환)
10. title 없이 save(`title` 미지정) → frontmatter에 `title` 줄 없음(불필요한 diff 없음)
11. title이 개행·너무 긴 값이면 한 줄로 정리·상한 적용
12. `office.saveManual` — `previousPath` 있고 `title` 미지정이면 기존 제목 유지, `''`이면 삭제 (office 통째 인스턴스가 무거우면 이 규칙을 `shared/manualName`의 순수 함수 `resolveTitle(prev, input)`로 빼서 테스트)
13. 같은 name 새로 저장 → 기존 오류 유지(회귀)

**manualForm**
14. 빈 폼 → 제목·언제 쓰는지·본문 사유 3개, 사유 문장 키·`field` 값 정확
15. 프로세스: 단계 0개 / 단계 2의 지시 비어 있음 → `step.1.instruction`(0 기준) 지정, 문장에 "단계 2" 표시 (인덱스 +1 변환 한 곳)
16. 파일 이름 형식 오류 → 해당 필드, 모든 항목 정상이면 빈 배열
17. `isDirty`: 초기값과 같음/한 글자 다름/단계만 다름

**직원 팩**
18. `title` 있는 팩 라운드트립(`buildPack` → `parsePack`), title 없는 옛 팩 통과(기존 테스트 그대로 녹색), 길이 초과 title 거절
19. 같은 name·다른 body 충돌 규칙 회귀 (기존 테스트 유지)

**초안·원격·비서**
20. `draftManual('')`가 직원 조회를 건너뛴다 — 순수화가 어렵다면 프롬프트·옵션 조립을 `buildDraftRequest(staff | null, request, kind, roles)` 함수로 빼고: 직원 있음→`cwd=s.cwd`·`model` 포함, 없음→`cwd=homedir`·`model` 없음·페르소나 문구 없음 (모델 호출은 스텁). 비어 있지 않은 모르는 id는 오류
21. 초안 응답 파서: `title` 있음/없음, `name`이 한글·공백(규칙 위반) → 힌트 무시, JSON 앞뒤 잡음 허용(기존 `indexOf('{')` 동작 회귀)
22. `V2_FIELDS.saveManual`에 `title` 포함(`remote-v2.test` 확장): 폰이 보낸 title이 통과하고, 모르는 필드는 여전히 거절
23. `compareSteps`(secretaryManualStaff.test 확장): title 필드가 있어도 비교 카드 동작
24. `secretaryTools` 인자 설명에 `title`·`draftManual` 안내(`''`)가 들어 있다(회귀용 문자열 단정은 최소한으로)

**사전·문구**
25. 기존 `i18n.test.mts`로 4개 언어 키 누락 0 확인(새 키 전부)
26. 화면 문구 금지어 점검: `manuals.*`·`empty.*`·`board.empty.*` 등 이번에 건드린 키의 4개 언어 값에 '스킬'·'토큰'(및 en `skill`/`token`, ja `スキル`/`トークン`, zh `技能`/`令牌`)이 없는지 검사하는 단위 테스트 1개(범위를 신규 키 접두사로 한정, 기존 키는 건드리지 않음)

**수동(QA 확인)**
27. Claude Code·Codex가 `title:`이 든 SKILL.md를 정상 로드(`/이름` 호출, 직원 장비에 포함)
28. 폰에서 한글 제목 매뉴얼 목록 표시(목록은 읽기만이라 `Manual.title`이 내려가는지)

## 5. 정리드가 정할 쟁점 (추천 포함)

1. **초안 덮어쓰기 확인** — 추천: 3갈래 ✨는 빈 폼에서 시작해 확인 불필요, 편집 안의 "AI로 다시 쓰기"가 있을 때만 `isDirty` 확인. 기획서의 요구를 그대로 충족하면서 확인 로직이 순수 함수 하나로 한정됨.
2. **교육 창 기본 선택** — 추천: 비워 두고 "모두 선택" 제공(권한 확대 위험). 기획서의 "전원 기본 체크"와 다름.
3. **기존 매뉴얼 파일 이름** — 추천: 편집에서 읽기 전용. 이름 변경 시 장비·랩 연결이 끊기는 기존 결함이 있어서(별도 카드로 분리 제안).
4. **`manualTitle`** — 추천: `title` 우선.
5. **`draftManual` 시그니처** — 추천: 유지하고 `''` = 기본 AI (프로토콜·폰 영향 0).
6. **`title` 키 이름** — 추천: `title`. Claude Code 무시 여부가 QA에서 실패하면 `TITLE_KEY` 상수 한 곳만 바꿈.
7. 범위 밖이지만 알림: 직원 없이 만든 초안의 비용은 직원별 사용량에 잡히지 않음.

## 6. 하지 않은 것 (과한 일반화 방지)

- 한글→로마자 변환 라이브러리 도입 안 함(오변환·번들 크기·유지 부담 대비 이득 없음; 표시 이름이 있으므로 파일 이름은 사용자에게 중요하지 않음).
- 매뉴얼 저장소를 별도 인덱스/DB로 바꾸지 않음(파일이 원본이라는 현재 구조 유지).
- `trainStaff`/`trainGroups` 참조를 title 기반으로 바꾸지 않음.
- 편집 폼·목록 컴포넌트 선제 분리 안 함.

## 참고 — 최가독 안(A)과의 비교 (요약만 받은 상태에서 작성)

**공통**: `title` frontmatter + `name` 슬러그 유지 / `title || name` 하위 호환 / 규칙 한 곳으로 모음 / `manualProblems` 순수 함수 / 저장 버튼 비비활성 / `draftManual`이 직원 필수라 main 수정 필요 / 템플릿 구조·문구 분리 / `MoreToggle`·`EmptyGuide` 추출 / 교육 기본 선택 비움 추천.
**차이**
- 파일 분리: A는 `ManualEditor.tsx`도 분리. B는 3갈래 창만 새 컴포넌트, 편집기는 지금 크기에서 이득이 작아 보류 — A가 읽기 쉬움에서 유리, B는 diff 최소.
- 초안 덮어쓰기: A는 편집 창 초안 상자를 없애 확인 자체를 제거(단순). B는 확인 로직을 순수 함수로 두고 요구에 맞춤. 기획서에 확인이 명시되어 있어 B 추천이나, 편집 창 초안 상자를 없애기로 하면 A의 방식이 더 단순.
- 영향 조사: B는 직원 팩·원격 허용 필드·비서 title 소실·교육 알림·슬러그 무작위 이유를 추가로 확인함(A 요약에는 없었음). A를 고르더라도 이 항목들(특히 `V2_FIELDS`·비서의 title 유지·무작위 슬러그)은 반영 권장.
- `draftManual` 직원 없음 표현: B는 `''` 센티널(프로토콜 변경 0). A의 방식이 시그니처 변경이라면 원격 스키마 `R('s s s')` 영향을 확인해야 함.
**추천**: 구조(파일 분리 정도)는 A, 영향 조사 항목과 `''` 센티널·테스트 목록은 B를 조합.
