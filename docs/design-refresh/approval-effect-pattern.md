# 승인 카드 '결과 한 줄' — 설계안 B (박패턴: 유지보수성·변경 영향 최소화·검증 가능성)

작성: 박패턴 · 대상: `/Users/pc-2311001/flitto/poc/claude-office/app` · 코드 수정 없음(설계만)
최가독의 설계안은 받지 못해 비교하지 않는다. 정리드의 잠정 결정(필드 `effectI18n`, 타입 `I18nText`, pendingApprovals·peerProtocol 동반 전달)을 반영해 다시 정리했다.

## 0. 요구 해석
- 결재 카드 제목에 원본 명령 대신 사람이 읽는 효과 문장을 보이고, 원본은 접어서 아래에 둔다.
- 못 풀어 쓰는 명령(파이프·스크립트 등)은 지금처럼 원문 그대로. 억지 추측 금지.
- 문구는 한·영·일·중 i18n dict. 순수 함수 + 단위 테스트가 가능해야 한다.
- 제약: `Approval.summary`는 허용 규칙·일회 허용 매칭(pendingApprovals grant/take, takeOneShotAllow·autoDecide)의 키라서 바꾸지 않는다.
- 커밋 안 된 `helpRequest.ts`·`office.ts`·`helpRequest.test.mts`는 건드리지 않는다.

## 1. 새 필드와 `summaryI18n`의 관계
| | `summary` | `summaryI18n` (기존) | `effectI18n` (신규) |
|---|---|---|---|
| 역할 | 매칭 키 + 원문 표시 | 원문 요약을 화면 언어로 (컴퓨터 조작만) | 원문과 별개의 **효과 해설 문장** |
| 타입 | `string` | `I18nArg` | `I18nText` (`{ key, params? }`) |
| 바뀌는가 | 절대 안 바꿈 | 안 바꿈 | 새로 추가 |
| 없을 때 | — | `summary` 표시 | 지금처럼 원문 제목 |

- `Approval.effectI18n?: I18nText` (`shared/types.ts`, `summaryI18n` 바로 아래). **선택 필드**라서 옛 결재·옛 저장분은 영향 없음.
- 합치지 않는 이유: `summaryI18n`은 "원문의 번역"이고 `effectI18n`은 "원문의 해설"이라 둘이 동시에 있어야 한다(해설 제목 + 접힌 원문). 한 필드에 합치면 원문이 사라지거나 컴퓨터 조작과 충돌한다.
- 타입을 `I18nArg`가 아닌 `I18nText`로 좁힌 잠정 결정에 **동의**한다. 효과 문장은 늘 키 하나이고 `list` 합성이 필요 없다. `tr()`가 `I18nArg`를 받으므로 `I18nText`는 그대로 넘어가 호환된다. 반대 의견 없음.
- 필드 이름 `effectI18n`도 `summaryI18n`과 짝이 맞아 동의.
- **표시 규칙** (공통 함수 한 곳): `effectI18n`이 있으면 제목 = `tr(effectI18n)`, 원문 = `trOr(summaryI18n, summary)`를 접어서 아래. 없으면 지금과 같음.
- **생성 위치**: `main/hired.ts` `askApproval`의 `summaryI18n:` 줄 바로 아래에 `effectI18n: (!questions && effectOf(toolName, input)) || undefined` 한 줄. 질문(AskUserQuestion)에는 만들지 않는다.

## 2. 효과 문장 함수
- **위치**: `app/src/shared/approvalEffect.ts` (신규). `approvalRules.ts`·`bashPolicy.ts`처럼 electron 없이 시험하는 shared 순수 로직. 기존 부품 `commandScan`(`lexSegments`·`resolveCommand`·`base`·`gitSubcommand`)을 그대로 써서 `approvalRules`·`autoApprove`와 명령 해석이 어긋나지 않게 한다. 새 파서는 만들지 않는다.
- **시그니처**: `export function effectOf(toolName: string, input: Record<string, unknown>): I18nText | null`
  - `null` = 원문 유지. `t()`는 부르지 않고 `tk('approval.effect.xxx', 인자)`만 만든다 → 화면 언어를 바꿔도 다시 번역됨.
- **보조(같은 파일)**: `approvalTitle(a: Pick<Approval,'summary'|'summaryI18n'|'effectI18n'>): string` — 한 줄 제목만 필요한 곳(펫 알림 제목 등)용. 효과 문장 우선, 없으면 `trOr(summaryI18n, summary)`. 단위 시험 대상.
- 이 문장은 **표시용 해설일 뿐 허용 판정에 쓰이지 않는다**(규칙·자동결재는 계속 `summary`·`commandKeys`를 본다).

## 3. 다루는 도구·명령과 문장 표 (1차 범위)
문장 예시는 한국어/영어. 실제 4개 언어 문구는 dict(`featuresB.ts` 등 승인 관련 사전)에 추가.

### 3-1. 도구별
| 도구 | 입력 조건 | 키 | params | ko 예 | en 예 |
|---|---|---|---|---|---|
| Write | `file_path` 문자열 | `approval.effect.fileWrite` | `path` | `src/a.ts` 파일을 씁니다 | Writes `src/a.ts` |
| Edit / MultiEdit | `file_path` 문자열 | `approval.effect.fileEdit` | `path` | `src/a.ts` 파일을 고칩니다 | Edits `src/a.ts` |
| WebFetch | `url` 파싱 성공 | `approval.effect.webFetch` | `host` | `example.com` 페이지를 읽습니다 | Reads a page on `example.com` |
| 그 외 도구(WebSearch·Task·MCP 등) | — | — | — | **null(원문 유지)** | |

### 3-2. Bash 명령 종류별 (토막 하나일 때만)
| 명령 | 조건 | 키 | params | ko 예 |
|---|---|---|---|---|
| `rm` 대상 1개 | 플래그 없음 또는 `-f`만 | `approval.effect.rmOne` | `path` | `notes/a.md`을(를) 삭제합니다 |
| `rm` 대상 N개(N≥2) | 글롭·변수 없음 | `approval.effect.rmMany` | `path`(첫 대상), `count`(전체 개수) | `notes/a.md` 등 3개를 삭제합니다 |
| `rm -r`/`-rf` 대상 1개 | 대상 확정 | `approval.effect.rmDir` | `path` | `notes` 폴더를 통째로 삭제합니다 |
| `rm -r` 대상 N개 | 대상 확정 | `approval.effect.rmDirMany` | `path`, `count` | `notes` 등 폴더·파일 3개를 통째로 삭제합니다 |
| `git push <원격> <브랜치>` | 둘 다 있음, 플래그 없음 | `approval.effect.gitPush` | `remote`, `branch` | origin/main에 올립니다 |
| `git push <원격>` | 브랜치 생략 | `approval.effect.gitPushRemote` | `remote` | origin에 올립니다 |
| `git push` | 인자 없음 | `approval.effect.gitPushDefault` | — | 기본 원격에 올립니다 |
| `git push --force`/`-f`/`--force-with-lease` | 위 세 경우에 플래그 | `approval.effect.gitPushForce` | `target`(원격/브랜치 또는 원격) | origin/main에 **강제로** 올립니다(기존 기록을 덮어쓸 수 있음) |
| `curl`/`wget` 읽기 | URL 하나·`-X`·`-d`·`-F`·`--data*`·`-T` 없음 | `approval.effect.fetchGet` | `host` | `example.com`에서 받아옵니다 |
| `curl` 전송 | `-X POST/PUT/PATCH/DELETE` 또는 `-d`·`--data*`·`-F`·`-T`·`--upload-file` | `approval.effect.fetchSend` | `host` | `example.com`에 데이터를 보냅니다 |

- 1차에서 제외(원문 유지): `git commit/checkout/reset/rebase`, `mv`, `cp`, `chmod`, `npm`·`pip` 설치 등. 요청이 반복되면 표에 한 줄씩 추가(표 구동 구조라 추가 비용이 작음).
- `curl`/`wget`은 **호스트만** 문장에 넣는다. 경로·쿼리·토큰·헤더는 넣지 않는다(비밀 노출 방지).
- 경로는 문장에 넣기 전에 문자열 그대로 쓰되 길이 상한(예: 60자, 앞을 `…`로 줄임)을 둔다. 줄이는 규칙도 순수 함수로 시험.

### 3-3. 문장을 못 만들 때(null → 원문 유지) 규칙
하나라도 해당하면 `null`:
1. 토막이 둘 이상이거나 파이프·`;`·`&&`·`||`·리다이렉트·백그라운드가 있음(`lexSegments` 결과 토막이 1개가 아님).
2. `resolveCommand`가 `via`(래퍼 `sudo`·`env`·`xargs`…)를 갖거나 `localScript`(`bash x.sh`, `./run.sh`)이거나 `sh -c`·`eval`·`source`.
3. 명령 머리(`base(cmd)`)가 처리 표에 없음.
4. 인자에 글롭(`* ? [`)·명령 치환(`$(`, 백틱)·변수 확장(`$`)·중괄호 확장(`{a,b}`)이 있어 대상·개수를 확정할 수 없음.
5. `rm` 대상이 없거나(`rm` 단독) 알 수 없는 플래그 조합으로 대상을 못 뽑음, `git push`에 알 수 없는 플래그(`--delete`·`--mirror`·`--tags`·`:ref` 삭제 refspec 등)가 있음 → 오해 소지가 있으니 원문 유지.
6. URL을 `new URL`로 파싱 못 하거나 호스트가 비었음.
7. 필수 입력(`file_path` 등)이 문자열이 아님.
- 원칙: **확신이 없으면 null.** 틀린 해설은 원문보다 위험하다. 이 원칙을 시험으로 고정한다.

### 3-4. 접힌 원문 라벨
- 키 `approval.effect.rawLabel` ("원본 명령" / "Original command" / 「元のコマンド」 / "原始命令"). 컴퓨터 조작·질문처럼 효과가 없는 카드에는 보이지 않는다.

## 4. pendingApprovals 저장 · peerProtocol 전달 (잠정 결정에 동의)
- `main/pendingApprovals.ts`: `PendingApproval`에 `effectI18n?: Approval['effectI18n']` 추가, `toPending`·`toRestoredApproval`에서 `summaryI18n`과 같은 방식(`...(x ? { effectI18n: x } : {})`)으로 싣고 복원. 옛 저장분은 필드가 없어 원문 제목으로 보임(깨지지 않음).
  - **저장 형태 영향**: pendingApprovals는 JSON 저장이라 선택 필드 추가는 마이그레이션이 필요 없다. 구버전 앱이 새 저장분을 읽으면 모르는 필드를 무시한다(되돌림 안전). DB 스키마 변경 없음.
- `shared/peerProtocol.ts`: `PeerApprovalEvent`에 `effectI18n?: unknown` 추가(`summaryI18n?: unknown`과 같은 규칙: 상대 버전이 달라도 안전하게 받도록 `unknown`).
- `main/peer/peerHost.ts` `safeApproval`: `effectI18n`도 `redactPeerDeep`을 거쳐 보냄. 경로·호스트에 비밀이 섞일 수 있어서.
- `main/peer/approvalRelay.ts:56`: 받은 쪽은 `summaryI18n`처럼 `as Approval['effectI18n']`로 복원. 받은 값이 `I18nText` 모양이 아니면 버린다(`isI18nText` 검사 한 줄) — 상대 버전이 임의 값을 보내도 화면이 깨지지 않게.
- `main/office.ts:1770`(helpRequest 전달부): 같은 한 줄을 더해야 하지만 **커밋 안 된 `office.ts`와 겹친다.** 선택지: (가) 정리드가 그쪽을 커밋한 뒤 추가(추천), (나) 이번엔 전달에서 빼서 원격 쪽은 원문만 보이게 하고 후속으로 추가. 이번 설계에서는 수정하지 않는다.
- 로그·자동결재 기록(`office.ts` 로그, `AutoApprove`)은 감사 목적이라 **원문 유지**. 이번 범위 밖.

## 5. 화면 렌더 변경 5곳 + 공통 부품
공통 부품 1개 + 함수 1개로 5곳을 덮는다.
- **`renderer/components/ApprovalHeadline.tsx`** (신규): `<ApprovalHeadline approval={a} variant="inbox|panel" />`. 효과 문장이 있으면 제목, 원문은 `<details>`로 접어서(`summary` 라벨 = `approval.effect.rawLabel`). 효과 없으면 원문만(지금 모양). 이득: 4개 언어·접기·`maskSecrets` 규칙을 한 곳에. 비용: 호출부별 스타일 차이를 `variant`·className으로 받음.
  - 위험 표시(`waitReason`)가 있거나 `findRiskyCommand`에 걸린 결재는 원문을 **펼친 채** 시작(`open`). 접힘이 위험 확인을 방해하지 않게.
- 호출부:
  1. `features/InboxPage.tsx:134` — `<pre>`(원문)를 `ApprovalHeadline`으로 교체. 제목 줄(`toolDisplayName`)은 유지.
  2. `features/StaffPanel.tsx:617` — `line-clamp-3 font-mono` 블록을 교체. 분할 화면용 `side:text-[11px]`은 variant로 보존. 좁은 폭에서는 제목 `line-clamp-2`.
  3. `deskPet/PetPanel.tsx:664` — `summary` 상수를 `approvalTitle(a)`로(제목 `line-clamp-2`), 원문은 카드 아래 접기. `title` 속성에는 원문 포함.
  4. `deskPet/PetPanel.tsx:70` — `${staffName} · ${approvalTitle(a)}`.
  5. `deskPet/PetCharacter.tsx:110` — 알림 제목에 `approvalTitle(approvals[0])`.
- 채팅 승인 말풍선(`ChatPage`의 `ApprovalActions`, `pendingApproval` prop)도 같은 요구 대상이다. 이번 조사에서 그 컴포넌트의 본문 렌더는 읽지 못했다 → 구현 때 `summary`를 직접 쓰는지 grep으로 확인하고 `ApprovalHeadline`으로 교체. (화면 목록 5곳 외 6번째로 취급)
- `features/Onboarding.tsx:486`(첫 결재 안내)은 원문 유지(효과 문장을 보이면 안내 문구와 어긋날 수 있음). `ApprovalSplit.tsx`는 높이 분할 핸들뿐이라 카드 본문이 없다.
- `mobile/preview/fakeShell.ts`의 가짜 결재(`summary[demo]`)는 `effectI18n`이 없는 옛 모양 그대로 두어 하위 호환 시험을 겸한다.

## 6. 시험 목록
### 6-1. 새 `scripts/approvalEffect.test.mts` — 표 기반(입력 → 기대 키 + params)
| # | toolName | input | 기대 |
|---|---|---|---|
| 1 | Write | `{file_path:'src/a.ts'}` | `approval.effect.fileWrite` `{path:'src/a.ts'}` |
| 2 | Edit | `{file_path:'src/a.ts'}` | `approval.effect.fileEdit` |
| 3 | Edit | `{}` / `{file_path:1}` | null |
| 4 | Bash | `rm notes/a.md` | `rmOne` `{path:'notes/a.md'}` |
| 5 | Bash | `rm a b c` | `rmMany` `{path:'a', count:3}` |
| 6 | Bash | `rm -rf notes` | `rmDir` `{path:'notes'}` |
| 7 | Bash | `rm -r a b` | `rmDirMany` `{count:2}` |
| 8 | Bash | `rm *.log` | null (글롭) |
| 9 | Bash | `rm $(ls)` / `rm $X` | null (치환·변수) |
| 10 | Bash | `rm` | null (대상 없음) |
| 11 | Bash | `git push origin main` | `gitPush` `{remote:'origin', branch:'main'}` |
| 12 | Bash | `git push origin` | `gitPushRemote` |
| 13 | Bash | `git push` | `gitPushDefault` |
| 14 | Bash | `git push --force origin main` | `gitPushForce` `{target:'origin/main'}` |
| 15 | Bash | `git push --delete origin x` / `git push origin :x` | null |
| 16 | Bash | `curl https://example.com/a?token=1` | `fetchGet` `{host:'example.com'}` (쿼리·토큰이 params에 없음) |
| 17 | Bash | `curl -X POST -d x https://example.com` | `fetchSend` |
| 18 | Bash | `curl notaurl` | null |
| 19 | WebFetch | `{url:'https://example.com/x'}` | `webFetch` `{host:'example.com'}` |
| 20 | Bash | `foo \| bar` / `a && b` / `a; b` / `ls > x` | null (토막·파이프) |
| 21 | Bash | `bash run.sh` / `sh -c "rm a"` / `sudo rm a` | null (스크립트·래퍼) |
| 22 | Bash | `''` / 알 수 없는 머리 `frobnicate x` | null |
| 23 | `mcp__office__computer` 등 컴퓨터 도구 | 임의 | null |
| 24 | WebSearch·Task·AskUserQuestion | 임의 | null |

### 6-2. 속성·보조 시험
- **4개 언어 렌더**: 위 non-null 결과 전부를 `tr(v, lang)`으로 ko/en/ja/zh 렌더해 빈 문자열이 아니고 `{`가 남지 않음.
- **비밀 안전**: 결과 params 어디에도 쿼리 문자열·헤더·`-d` 값이 들어 있지 않음(16번 확장).
- **경로 줄임**: 60자 초과 경로가 상한 이하로 줄고 파일명 끝은 보존.
- **`approvalTitle`**: effect 있음 → 효과 문장, 없음 + summaryI18n → 번역 원문, 둘 다 없음 → summary.
- **`summary` 불변**: `askApproval`을 시험하는 기존 방식(가짜 엔진)으로 같은 입력에서 `summary`가 `effectI18n` 도입 전과 같음 → 허용 규칙 매칭 안전의 근거.
- **저장·복원**: `toPending`→`toRestoredApproval` 왕복에서 `effectI18n` 보존, 없는 결재는 필드가 생기지 않음.
- **피어**: `safeApproval`이 `effectI18n`을 redact하고, `approvalRelay`가 모양이 틀린 값을 버림.
- **`i18n.test`**: 기존 시험이 새 키의 4개 언어 존재·변수 일치를 잡음(별도 작업 없음).
- 시각 확인: 624×986(분할)·모바일·데스크펫에서 긴 경로·접힘 캡처 1~2장(오큐에이).

## 7. 위험과 대응
1. **틀린 해설**(`rm -rf ~/x`를 "파일 1개"로): null 규칙 3-3과 `-r` 구분·시험.
2. **원문을 안 보게 됨**: 위험 표시 결재는 펼침 유지. 원문은 늘 한 번 눌러 보이는 위치.
3. **비밀 노출**: 호스트만 사용, 원격 중계는 `redactPeerDeep`, 표시 시 `maskSecrets`.
4. **`office.ts` 충돌**: §4의 (가)/(나).
5. **상대 버전 불일치**: `effectI18n`은 선택·`unknown` 수신·모양 검사. 구버전은 무시하고 원문을 본다.
6. **좁은 화면 줄바꿈**: `line-clamp-2` + `title`.
7. **표가 자라며 복잡해짐**: 명령 표를 데이터로 두고 새 명령은 한 줄 추가. 1차 범위 밖 명령은 원문 유지가 기본값이다.

## 8. 정리드가 정할 쟁점 / 확인하지 못한 것
- 쟁점: ①위험 표시 결재의 원문을 펼쳐 둘지(추천: 펼침) ②`office.ts` 전달 줄을 지금/나중에 ③Onboarding·로그를 원문 유지로 둘지(추천: 유지) ④`rm`·`git push`·`curl`·Write·Edit·WebFetch 외 명령을 1차에서 뺄지(추천: 뺌).
- 못 읽은 것: 채팅 승인 말풍선 본문, `lexSegments`가 글롭·치환을 어떤 모양으로 돌려주는지(시그니처만 확인), Write/Edit/MultiEdit/WebFetch의 정확한 입력 키(`file_path`·`url`은 `summarizeInput`의 키 목록으로 추정). 구현 때 grep과 3-3 시험으로 확정.
