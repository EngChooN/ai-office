# 승인 카드 "결과 한 줄" — 설계안 A (최가독, 가독성·단순함·재활용)

> 요구: 결재 카드 제목에 원본 명령 대신 사람이 읽는 효과 문장을 보이고, 원본은 접어서 아래에 둔다. 못 풀어 쓰는 명령은 지금처럼 원문 그대로(추측 금지).
> 제약: `Approval.summary`는 허용 규칙·일회 허용 매칭 키(pendingApprovals grant/take, takeOneShotAllow·autoDecide)라 **바꾸지 않는다**. 표시용 필드를 따로 둔다.
> 박패턴 안은 받지 못해 비교하지 않았다. 이 문서는 읽고 확인한 코드에 근거한 단독 설계다.
> 확인한 파일: `shared/types.ts`, `main/hired.ts`(askApproval·summarizeInput), `shared/commandScan.ts`, `shared/approvalRules.ts`, `shared/i18n/index.ts`, `main/pendingApprovals.ts`, `main/office.ts`, `shared/peerProtocol.ts`, `main/peer/*`, 카드를 그리는 renderer 화면들.

---

## 1. 새 필드와 `summaryI18n`의 관계

```ts
// shared/types.ts  Approval
/** 사람이 읽는 효과 한 문장 ("src/a.ts 파일을 고칩니다"). 키+인자로 저장해 화면 언어로 그때 번역한다.
 *  없으면(못 풀어 쓰는 명령·예전 결재·질문) 원문(summary)만 보인다. 허용 규칙 매칭에는 쓰지 않는다 */
effectI18n?: I18nText
```

- 이름은 `effectI18n`, 타입은 `I18nText`(= `{ key, params? }`). `I18nArg`가 아니라 `I18nText`로 좁히는 이유: 항상 키 하나로 끝나는 문장이라 `list`·문자열이 들어올 일이 없고, 타입이 "이 필드는 문장 하나"임을 말해 준다. `tr()`은 둘 다 받으므로 렌더에 영향 없다.
- **`summaryI18n`과 역할이 다르다. 합치지 않는다.**

| | `summary` | `summaryI18n` | `effectI18n` (새) |
|---|---|---|---|
| 역할 | 원문. 규칙·일회 허용 **매칭 키** | 그 원문을 화면 언어로 다시 만드는 키+인자 (컴퓨터 조작만) | 원문 **위에** 올리는 사람 말 제목 |
| 바뀌나 | 안 바뀜 | 안 바뀜 | 새로 추가 |
| 없으면 | — | summary 그대로 | 원문 한 줄만 (지금과 동일) |

- 컴퓨터 조작(`computer_*`)은 이미 `summaryI18n`이 쉬운 말이라 `effectI18n`을 만들지 않는다(표에 없는 도구는 `null`).
- 화면 표시 규칙(공통 함수 하나로):
  - 제목 = `effectI18n ? tr(effectI18n) : trOr(summaryI18n, summary)`
  - 원문 = `trOr(summaryI18n, summary)` (효과 문장이 있을 때만 접어서 아래에)
- 질문 결재(`questions`), 피어 변경 묶음(`peerChanges`)에는 만들지 않는다.

### 필드가 지나가는 길목 (summaryI18n이 지나가는 곳마다 한 줄씩)
| 위치 | 변경 |
|---|---|
| `shared/types.ts` | 필드 추가 |
| `main/hired.ts` `askApproval` | 채움 (2장) |
| `main/pendingApprovals.ts` 저장(≈16·32줄)·복원(≈61줄) | `effectI18n` 같이 저장·복원 (재시작 뒤에도 유지) |
| `main/office.ts:1770` (도움 요청·잡 응답에 `summaryI18n`을 싣는 곳) | 같이 실음 |
| `shared/peerProtocol.ts:96` `PeerApprovalEvent` | `effectI18n?: unknown` |
| `main/peer/peerHost.ts:44` `safeApproval` | `redactPeerDeep(ev.effectI18n)` (인자의 경로·URL도 가림) |
| `main/peer/approvalRelay.ts:56` | `Approval['effectI18n']`로 되돌림 |
| 데스크펫 중계 (`petWindow`·`shared/deskPet.ts`의 PetApproval 만드는 곳) | **확인 필요**: `summaryI18n`을 넘기는 곳과 같은 자리에 같이 넘긴다 |

위 목록에 반대 의견은 없다. 정리드의 잠정 결정(`effectI18n`·`I18nText`·pendingApprovals 저장·peerProtocol 전달 포함)에 동의한다.

---

## 2. 효과 문장을 채우는 곳

### 순수 함수: 새 파일 `shared/approvalEffect.ts`
```ts
import type { I18nText } from './i18n/index.ts'

/** 이 요청이 하는 일을 사람 말 한 문장(키+인자)으로. 확실히 풀 수 있는 경우만, 아니면 null (원문 그대로 보인다) */
export function effectOf(toolName: string, input: Record<string, unknown>): I18nText | null

/** 카드 제목에 보일 글 — 효과 문장이 있으면 그것, 없으면 원문. 알림 제목처럼 접을 수 없는 곳이 쓴다 */
export function approvalHeadline(a: Pick<Approval, 'summary' | 'summaryI18n' | 'effectI18n'>): string
```
- `shared/`에 두는 이유: main(채움)과 renderer(`approvalHeadline`)가 같이 쓴다. `computerTools.ts`가 이미 `shared`에서 `tr`을 쓰는 같은 모양이다.
- **재활용**: `lexSegments`(따옴표·이스케이프 처리)·`resolveCommand`(sudo·env·command 같은 앞말 벗기기, `UNPARSEABLE`, `localScript`)·`base`·`gitSubcommand`. 셸 낱말 분해를 새로 짜지 않는다. 경로·URL 값은 `maskSecrets`(`shared/redact.ts`)를 거친다.
- 안에서는 도구별 작은 함수로 나눈다: `bashEffect(command)`, `fileEffect(toolName, input)`, `webEffect(toolName, input)`. 명령별 해석(`rm`·`git`·`curl`…)은 `Record<string, (args: string[]) => I18nText | null>` 표 하나로 두어 한 줄에 한 명령이 보이게 한다.

### 채우는 곳: `main/hired.ts` `askApproval` (`summaryI18n` 바로 아래)
```ts
effectI18n: (!questions && effectOf(toolName, input)) || undefined,
```
- `summary`·`alwaysRule`·`waitReason` 줄은 손대지 않는다. 대표가 읽는 문장일 뿐, 판정·매칭은 전부 기존 경로 그대로다.

---

## 3. 다루는 도구·명령과 문장 표

키는 모두 `approval.effect.*`, 4개 언어(ko/en/ja/zh)를 `shared/i18n/dict/featuresB.ts`의 `approval.requestedBy` 옆에 둔다. 아래 `{…}`는 `params`다.
인자 값(경로·URL·검색어)은 번역하지 않는 문자열이고 `maskSecrets`를 거친다. 개수 `{n}`은 숫자다.
언어마다 복수형이 달라 문장은 `{n}`만 끼우는 형태로 둔다 (한국어 예: "파일 {n}개").

### 3-1. Bash (한 토막으로 풀리는 명령만)

| 명령 | 조건 | 키 | 인자 | ko 예 |
|---|---|---|---|---|
| `rm` (플래그 `-r -R -f -v -i --`만 허용) | 대상 1개, `-r` 없음 | `rm.one` | `path` | "src/a.ts 파일을 삭제합니다" |
| | 대상 1개, `-r` 있음 | `rm.tree` | `path` | "build 폴더를 통째로 삭제합니다" |
| | 대상 N개(≥2), 모두 같은 상위 폴더, `-r` 없음 | `rm.inDir` | `dir`, `n` | "/notes 폴더의 파일 3개를 삭제합니다" |
| | 〃 `-r` 있음 | `rm.inDirItems` | `dir`, `n` | "/notes 폴더의 항목 3개를 삭제합니다" |
| | 대상 N개, 상위 폴더가 제각각 | `rm.many` | `n` | "파일 3개를 삭제합니다" |
| `git push` | 원격과 브랜치가 모두 있음 | `git.push.to` | `remote`, `branch` | "origin/main에 올립니다" |
| | 원격만 있음 | `git.push.remote` | `remote` | "origin에 올립니다" |
| | `--force`·`-f`·`--force-with-lease` 포함 | `git.push.force` | `remote`, `branch` | "origin/main에 강제로 올립니다 (기록을 덮어씁니다)" |
| `git commit` | `-m '글'` 있음 | `git.commit` | `message` | "변경을 커밋합니다: …" |
| `git add` | 경로 N개, 글롭·`.`·`-A` 없음 | `git.add` | `n` | "파일 3개를 커밋 대상에 올립니다" |
| `git pull` | 원격(·브랜치) 있음 | `git.pull` | `remote` | "origin에서 가져옵니다" |
| `mv` | 인자 2개 | `mv` | `from`, `to` | "a.ts를 b.ts로 옮깁니다" |
| `cp` | 인자 2개 | `cp` | `from`, `to` | "a.ts를 b.ts로 복사합니다" |
| `mkdir` | 대상 1개 (`-p` 허용) | `mkdir` | `path` | "out 폴더를 만듭니다" |
| `curl` / `wget` | URL 1개, 플래그 `-s -S -L -f --silent --location`만, 메서드 GET | `net.get` | `host`, `path` | "example.com/api에서 가져옵니다" |
| | `-X POST·PUT·PATCH·DELETE` 또는 `-d/--data` (비밀 가능성 있는 `-H`는 인자에서 뺀다) | `net.send` | `method`, `host`, `path` | "example.com/api에 POST로 보냅니다" |

- 2차(목록 밖, 필요가 보이면 표에 한 줄씩 추가): `touch`, `git checkout/reset/merge/rebase`, `npm|pnpm|yarn install|test|run <script>`.
- `git push`에서 원격만 있고 브랜치가 없으면 "origin에 올립니다"로, 둘 다 없으면 **원문 유지**(어디로 가는지 이 입력만으로는 모른다).
- URL은 `host + path`까지만 보이고 쿼리·프래그먼트·`user:pass@`는 버린다(비밀 노출 방지). 원문은 접힌 곳에서 그대로 볼 수 있다.
- `rm -rf`는 문장을 약하게 만들지 않는다. 대상 하나(`rm.tree`)는 "통째로"가 붙고, 대상이 하나로 안 읽히면 `rm.many`가 되지 않고 **원문 유지**다 (아래 3-4의 글롭 규칙).

### 3-2. 파일 도구

| 도구 | 입력 | 키 | 인자 | ko 예 |
|---|---|---|---|---|
| `Write` | `file_path` | `file.write` | `path` | "src/a.ts 파일을 만들거나 덮어씁니다" |
| `Edit`, `MultiEdit` | `file_path` | `file.edit` | `path` | "src/a.ts 파일을 고칩니다" |
| `NotebookEdit` | `notebook_path` | `file.edit` | `path` | 같음 |

### 3-3. 네트워크·웹

| 도구 | 입력 | 키 | 인자 | ko 예 |
|---|---|---|---|---|
| `WebFetch` | `url` (http/https) | `web.fetch` | `host`, `path` | "example.com/docs의 내용을 가져옵니다" |
| `WebSearch` | `query` | `web.search` | `query` | "'검색어'를 검색합니다" |

### 3-4. 문장을 못 만들 때 (`null` → 지금처럼 원문 한 줄, 접지 않음)
하나라도 걸리면 `null`. 억지로 추측하지 않는다.
1. 토막이 둘 이상 (`|` · `&&` · `||` · `;` · 줄바꿈 · 괄호). **한 토막일 때만** 푼다 (같은 동작이 여러 개인 경우를 합치는 일은 이번 범위 밖).
2. `seg.hasSubst`(`$(…)`·백틱) 또는 `literalSubst`. 인자에 `$`·글롭(`*` `?` `[`)·`~` 확장이 있을 때.
3. 리다이렉트(`>` `>>` `<`)가 있을 때.
4. `resolveCommand`가 `UNPARSEABLE`을 주거나 `localScript`(`./x.sh`)이거나 `cmd`가 없을 때(변수 대입만).
5. 표에 없는 명령, 표에 없는 플래그 (알 수 없는 옵션이 하나라도 있으면 의미를 모른다).
6. 필수 인자가 없을 때 (`git push` 인자 없음, `rm` 대상 없음, `curl` URL 없음, `mv` 인자 개수가 2가 아님).
7. 파일 도구에서 `file_path`가 문자열이 아니거나 비어 있을 때. URL이 http/https가 아닐 때.
8. 그 밖의 도구: MCP·브라우저·`Task`·`Skill`·`computer_*`·`AskUserQuestion` 등은 이번 범위 밖이라 `null`.
9. 인자 길이 상한(경로 200자 등)을 넘을 때는 잘라 보이지 않고 `null`로 둔다 (잘라 놓은 경로는 다른 파일처럼 읽힌다).

---

## 4. 화면 렌더 변경

### 공통 부품 1개: `renderer/features/ApprovalSummary.tsx`
```tsx
<ApprovalSummary approval={a} variant="block" | "compact" />
```
- 효과 문장이 있을 때: 제목 한 줄(`tr(effectI18n)`) + 아래에 네이티브 `<details>`로 접은 원문(`font-mono selectable`, `maskSecrets` 적용은 기존 화면과 같게). 접는 라벨은 새 키 `approval.effect.showRaw`("원본 명령 보기").
- 없을 때: 지금과 똑같이 원문만 (접지 않음, DOM·스타일 변화 없음 → 회귀 위험 최소).
- `variant`는 기존 두 모양을 그대로 유지하려는 것: `block` = 결재함·직원 패널(`<pre>` / `line-clamp-3`), `compact` = 데스크펫(`line-clamp-2`).
- 한 번에 열리는 접힘은 카드마다 독립이다. 상태는 `<details>`가 가지므로 store·useState를 쓰지 않는다.

### 바꾸는 곳
| 파일 | 위치 | 변경 |
|---|---|---|
| `features/InboxPage.tsx` | ≈134 `<pre>…trOr(a.summaryI18n, a.summary)…</pre>` | `<ApprovalSummary variant="block">`으로 교체 |
| `features/StaffPanel.tsx` | ≈617 결재 칸 `line-clamp-3` 줄 | 교체. `side:text-[11px]` 같은 분할 화면 클래스는 `className`으로 그대로 전달 |
| `deskPet/PetPanel.tsx` | ≈664 `summary`와 제목 `<p>` | 교체 (`isInline` 질문 분기는 그대로) |
| `deskPet/PetPanel.tsx:70`, `deskPet/PetCharacter.tsx:110` | 한 줄 글(알림 제목·말풍선) | `approvalHeadline(a)`로 교체 (접을 수 없는 곳은 효과 문장만) |
| `features/DashboardPanels.tsx` | ≈233 `item.approval?.summary` | 지금 `summaryI18n`도 안 쓰고 원문만 쓴다. `approvalHeadline`으로 맞추되, `isLongApproval`(길이·줄바꿈) 판정은 **headline 기준**으로 바꿔야 효과 문장이 인라인으로 보인다 |
| 채팅 승인 (`ChatPage.tsx` `ApprovalActions` ≈535) | 지금 이 컴포넌트는 **버튼만** 그리고 요청 문구는 위의 말풍선 글에 있다 | **구현 때 확인 필요**: 그 말풍선 글을 만드는 곳(결재 요청을 채팅 메시지로 올리는 main 쪽, 이번 조사에서 위치를 못 찾았다)이 원문을 쓰는지 본다. 원문이면 거기에 `approvalHeadline` 상당(효과 문장)을 써야 하는데, **저장된 메시지 글을 바꾸는 일이라 언어가 저장 시점에 굳는다**. 그때는 `ApprovalActions`가 `pending`(`Approval`)을 이미 들고 있으니, 말풍선은 그대로 두고 `ApprovalActions`에 `ApprovalSummary`를 한 줄 더하는 쪽이 낫다 |
| `features/ApprovalSplit.tsx` | 높이 조절 틀 | 글을 직접 그리지 않아 바꿀 것 없음 (구현 때 재확인) |
| `features/Onboarding.tsx:486`(`CheckRow title`) | 온보딩 안내용 | 범위 밖 (그대로) |
| `features/AutoApprove.tsx`, `office.ts` 로그 | 이미 처리된 기록 | 범위 밖 (기록은 원문 유지가 맞다) |
| `mobile/preview/fakeShell.ts` | 미리보기 가짜 결재 | 선택: 데모 결재 하나에 `effectI18n`을 달아 캡처에서 보이게 |

---

## 5. 시험 목록

### 5-1. 순수 함수 `scripts/approvalEffect.test.mts` (표로 구동, 입력 → 기대 키/인자)
| 입력 | 기대 |
|---|---|
| `Bash rm /notes/a.txt /notes/b.txt /notes/c.txt` | `approval.effect.rm.inDir` `{dir:'/notes', n:3}` |
| `Bash rm -rf /notes/a /notes/b` | `rm.inDirItems` `{dir:'/notes', n:2}` |
| `Bash rm src/a.ts lib/b.ts` | `rm.many` `{n:2}` |
| `Bash rm src/a.ts` | `rm.one` `{path:'src/a.ts'}` |
| `Bash rm -rf build` | `rm.tree` `{path:'build'}` |
| `Bash rm *.log` · `rm $DIR/x` · `rm -rf` (대상 없음) · `rm --no-preserve-root /` | `null` |
| `Bash git push origin main` | `git.push.to` `{remote:'origin', branch:'main'}` |
| `Bash git -C . push origin main` | 위와 같음 (`gitSubcommand` 재활용) |
| `Bash git push --force origin main` · `git push -f origin main` | `git.push.force` |
| `Bash git push origin` | `git.push.remote` |
| `Bash git push` (인자 없음) | `null` |
| `Bash git commit -m 'fix'` | `git.commit` `{message:'fix'}` |
| `Bash mv a.ts b.ts` / `cp a.ts b.ts` | `mv` / `cp` |
| `Bash mv a b c` | `null` |
| `Bash curl https://example.com/api?token=abc` | `net.get` `{host:'example.com', path:'/api'}` (쿼리 버림) |
| `Bash curl -X POST -d x https://example.com/a` | `net.send` `{method:'POST', ...}` |
| `Bash curl https://u:p@example.com/a` | `net.get`, 인자에 `u:p`가 없음 |
| `Bash curl -o out.bin https://x.com/a` | `null` (알 수 없는 플래그) |
| `Write {file_path:'src/a.ts'}` | `file.write` `{path:'src/a.ts'}` |
| `Edit` / `MultiEdit` / `NotebookEdit` | `file.edit` |
| `Write {}` · `Edit {file_path: 1}` | `null` |
| `WebFetch https://example.com/docs?x=1` | `web.fetch` `{host, path:'/docs'}` |
| `WebSearch {query:'abc'}` | `web.search` `{query:'abc'}` |
| **원문 유지** `ls | grep x` · `a && b` · `rm a; rm b` · `rm $(ls)` · `./run.sh` · `cat > f` · `unknown-cmd x` · `''` | 전부 `null` |
| 앞말 `sudo rm a` · `env X=1 rm a` | `resolveCommand`가 벗긴 결과로 `rm.one` (벗기지 못하면 `null`) |
| `computer_click` · `mcp__x__y` · `Task` | `null` |
| 비밀 `rm /tmp/sk-ant-…` 류 | 인자가 `maskSecrets`를 거쳐 가려짐 |

### 5-2. 언어
- `scripts/i18n.test.mts` 기존 시험(4개 언어 키 누락·`{변수}` 일치)이 새 키에 대해 통과.
- `tr(effectOf(...), lang)`가 4개 언어에서 변수가 모두 채워진 문장이 나오는지 표 시험 1건 (`{n}` 같은 자리 남지 않음).

### 5-3. 연결 (불변 확인이 핵심)
- `askApproval`로 만든 `Approval`의 `summary`가 변경 전과 **바이트 단위로 같다**. 기존 `approvalRules`·`autoApprove`·`pendingApprovals` 시험이 수정 없이 통과한다.
- `pendingApprovals`: `effectI18n` 저장 → 복원 후 동일. 예전 JSON(필드 없음)은 `undefined`.
- `peerHost`: `redactPeerDeep`가 인자 안의 비밀을 가림. `approvalRelay`가 필드를 되돌림.
- `askApproval(questions)`에서는 `effectI18n`이 없다.

### 5-4. 화면
- `ApprovalSummary`: `effectI18n` 없음 → 원문만 (`<details>` 없음). 있음 → 제목 + 접힌 원문, 펼치면 원문 그대로.
- `approvalHeadline`: effect > summaryI18n > summary 우선순위 표 시험.
- 화면 코드에서 `trOr(a.summaryI18n, a.summary)`를 직접 쓰는 곳이 결재 카드에 남지 않게 하는 grep 시험 1건 (`AutoApprove`·로그는 허용 목록).
- 캡처: 624폭·일반 폭에서 결재함·직원 패널·데스크펫 각 1장.

---

## 6. 위험·확인 필요

1. **잘못 읽은 문장이 가장 위험하다.** 대표가 문장만 보고 승인할 수 있다. 의심스러우면 `null`, 위험 동작(`--force`, `-rf`)은 문장에서 약해지지 않게, 원문은 항상 아래에 접어 둔다.
2. 길목 누락: 피어 중계·복원·데스크펫·`office.ts:1770` 중 한 곳이라도 필드를 빠뜨리면 그 경로에서만 원문이 보인다(깨지지는 않는다). 5-3 연결 시험으로 막는다.
3. 비밀 노출: URL의 쿼리·사용자 정보, 경로 속 토큰. 문장 인자에 `maskSecrets` + URL은 host·path만.
4. **채팅 승인**은 요청 문구가 말풍선(저장된 글)에 있을 가능성이 높아 4장 표의 확인이 필요하다. 이 한 곳은 구현 전에 정리드가 위치를 정해 주면 좋겠다.
5. 데스크펫 알림 제목 길이: 효과 문장은 짧게(경로는 `…` 중간 생략은 하지 않고 줄임 없이 `line-clamp`에 맡긴다).
6. 규모: `approvalEffect.ts`가 커지면 명령 표를 `approvalEffectBash.ts`로 나눈다. 처음에는 한 파일, 표 한 줄 한 명령으로 둔다.

## 7. 한 줄 추천
새 필드는 `effectI18n: I18nText` 하나, 순수 함수는 `shared/approvalEffect.ts`의 `effectOf`·`approvalHeadline` 둘, 화면 공통 부품은 `ApprovalSummary` 하나. 풀 수 있는 것만 풀고 나머지는 지금과 똑같이 둔다.
