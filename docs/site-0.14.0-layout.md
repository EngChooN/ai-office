# 소개 페이지 0.14.0 레이아웃·시각 요소

> 작성: 이디자(디자인) · 문구: `docs/site-0.14.0-copy.md`(김기획) · 대상: `site/index.html`
> 지금 `index.html`의 색(`--accent` 파랑 · `--accent2` 민트 · `#f6a77c` 주황), 카드, `.row`, `.features`, `.shots` 스타일을 그대로 씁니다. 새 CSS는 아래 **새로** 표시한 것만 추가합니다.

## 0. 스크린샷 (이번에 넣은 것)

모든 화면 사진은 **WebP**로 바꿨습니다(`assets/screens/{lang}/*.webp`). `index.html`의 `src`와 `setShot()` 확장자도 `.webp`로 바꿔 두었습니다.

| 파일 | 상태 | 쓰는 곳 | 내용 |
|---|---|---|---|
| `office.webp` | 교체(ko) | 히어로 | 레벨 13 사무실 2층 — 책상 세트·칸막이·레벨 가구 |
| `staff-mix.webp` | 새로(ko) | f1 | 직원 고용 창, AI에서 **Codex(베타)** 선택, 모델 `gpt-6-luna` |
| `providers.webp` | 새로(ko) | f1 보조 | 설정 > AI 공급자 (Claude·Codex 둘 다 준비됨, 앱 내부 AI 선택) |
| `inbox.webp` | 교체(ko) | f3 | 결재함: Codex 직원 파일 쓰기 + Claude 직원 명령 실행 카드 |
| `computer.webp` | 새로(ko) | f6 | 결재함: 컴퓨터 조작 `left_click` 결재 카드 |
| `secretary.webp` | 새로(ko) | f7 | 비서에게 "업무 보드 정리" → 확인 카드(체크 항목·실행) |
| `dashboard.webp` | 교체(ko) | f8 | 대시보드: Claude 플랜 + **GPT(Codex) 플랜 사용률** 카드 |
| `exterior.webp` | 교체(ko) | 꾸미기 1 | 레벨 13 건물 외관 |
| `decorate.webp` | 새로(ko) | 꾸미기 2 | 꾸미기 모드 + **레벨 전용** 탭(샤워 부스·수면 캡슐 등) |
| `chat` `board` `meeting` | 유지 | f2·f4·f5 | 기존 데모 사진(WebP로 변환만) |
| `phone-*` | 유지 | 휴대폰 | 기존 데모 사진(WebP로 변환만) — 아래 '남은 일' 참고 |

- 데스크톱 1360×860(1배), 장당 27~137KB. 언어 폴더 전체 ko 744KB · en 504KB · ja 468KB · zh 384KB (PNG일 때보다 약 40% 작음).
- 실데이터 복사본 개발 앱(`feature/codex-m2`, 데이터 `claude-office-dev-m2qa`)에서 찍었습니다. 찍기 전에 화면 글자에서 이메일 → `you@example.com`, `/Users/<이름>` → `~`, 회사명 → `acme`로 바꿨습니다. 1층은 외부 세션 이름표에 PC 사용자 이름이 보여 쓰지 않고, 2층을 썼습니다.
- 새 사진은 **ko만** 있습니다. en/ja/zh는 있으면 그 언어의 옛 사진, 없으면 ko 사진으로 바뀌어 보입니다(기존 대체 규칙).

## 1. 섹션별 레이아웃 (위 → 아래)

### 1-1. 히어로
- 지금 구조 그대로: 배지 → 제목 → 부제 → 버튼 → `.shot`(창 테두리 + `office.webp`).
- 배지 `badge.oss`의 "새로 GPT 직원"만 강조합니다. **새로** `.badge b{color:var(--accent2);font-weight:600}`를 추가하고, 문구의 '새로 GPT 직원' 부분을 `<b>`로 감쌉니다.

### 1-2. 사용 흐름 (#how)
- `.steps` 3칸 그대로. 1단계 예시 말풍선(`.say`)의 "(GPT)"는 그대로 글자로 둡니다.

### 1-3. 핵심 기능 (#features) — 큰 줄 6개 + 작은 카드 2개
`.rows`(글·사진 좌우 번갈아)에 사진이 있는 6개, 아래 `.features.more`에 작은 카드 2개를 둡니다. 8개를 모두 큰 줄로 두면 너무 길어집니다.

| 순서 | 형태 | 기능 | 사진 | 아이콘(지금 SVG 재사용) |
|---|---|---|---|---|
| 1 | 큰 줄 | f1 Claude와 GPT 직원을 함께 **(베타)** | `staff-mix` + `providers` 겹침 | 사람+ (지금 f1) |
| 2 | 큰 줄 | f3 결재와 되돌리기 | `inbox` | 클립보드 체크 (지금 f2) |
| 3 | 큰 줄 | f6 컴퓨터 조작 장비 **(새)** | `computer` | 모니터 (아래 SVG) |
| 4 | 큰 줄 | f7 비서와 튜토리얼 **(새)** | `secretary` | 반짝이 (아래 SVG) |
| 5 | 큰 줄 | f2 뽑고, 말로 시키기 | `chat` | 말풍선 (지금 f4) |
| 6 | 큰 줄 | f8 사용량·터미널 세션 | `dashboard` | 그래프 (지금 f5) |
| 작은 카드 | `.feat` | f4 팀장이 나눠서 진행 | 없음 | 칸반 (지금 f3) |
| 작은 카드 | `.feat` | f5 단체방과 회의실 | 없음 | 말풍선 |

- 새 기능 셋(GPT·컴퓨터·비서)을 위쪽에 모았습니다. 문서의 f번호와 화면 순서가 다르니 `data-i18n` 키는 문서 번호대로 쓰고 HTML 순서만 위 표대로 둡니다.
- 작은 카드가 2개라 **새로** `.features.more{grid-template-columns:repeat(2,1fr)}`로 바꿉니다(모바일 1칸 규칙은 그대로).
- **베타·새 표시(새로):** 제목 옆 작은 알약.
  ```css
  .tag{display:inline-block;vertical-align:middle;margin-left:8px;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;
    color:var(--accent2);background:rgba(94,234,212,.08);border:1px solid rgba(94,234,212,.25)}
  ```
  `<h3><span data-i18n="f1.t"></span><span class="tag" data-i18n="tag.beta"></span></h3>`. 문구 키 추가: `tag.beta`(베타 / Beta / ベータ / 测试版), `tag.new`(새 기능 / New / 新機能 / 新功能). f6·f7에 `tag.new`.
- **f1 사진 두 장 겹치기(새로):** 고용 창 위에 설정 카드를 오른쪽 아래로 살짝 겹칩니다.
  ```html
  <figure class="stack"><img data-shot="staff-mix" …><img class="over" data-shot="providers" data-i18n-alt="alt.f1b" …></figure>
  ```
  ```css
  .row figure.stack{position:relative;overflow:visible;border:0;background:none;box-shadow:none}
  .stack img{border:1px solid var(--line2);border-radius:12px;box-shadow:0 30px 80px -24px rgba(124,156,255,.14),0 16px 40px rgba(0,0,0,.45)}
  .stack .over{position:absolute;width:58%;right:-4%;bottom:-10%}
  @media (max-width:640px){.stack .over{display:none}}
  ```
  `alt.f1b`: AI 공급자 설정에서 Claude와 GPT 계정이 모두 준비된 화면 / AI provider settings with both Claude and GPT ready / ClaudeとGPTのアカウントが両方準備済みのAI提供元設定 / Claude 与 GPT 账号均已就绪的 AI 提供方设置
- 새 아이콘 SVG(지금 아이콘과 같은 선 굵기 1.7):
  - 컴퓨터: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M11 9l3 3-1.2.3.8 1.7"/>`
  - 비서(반짝이): `<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>`

### 1-4. 꾸미기·레벨 (#grow) — 새 섹션
- 머리말(`.head`) 아래에 **큰 사진 2장 + 글 카드 1장**:
  - 위: `.row` 한 줄 — 왼쪽 글(블록 1 레벨과 사무실), 오른쪽 `exterior`.
  - 아래: `.row` 한 줄(좌우 반대) — 왼쪽 `decorate`, 오른쪽 글(블록 2 꾸미기).
  - 맨 아래: 데모데이(블록 3)는 사진 없이 가로 긴 카드 1장(`.feat` 1칸, 마이크 아이콘). 데모데이 사진은 이번에 찍지 않았습니다(아래 '남은 일').
- 레벨 숫자 강조(새로, 선택): 블록 1 글 위에 `Lv.1 → Lv.20` 작은 진행 막대.
  ```css
  .lvbar{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--dim);margin-bottom:16px}
  .lvbar i{flex:1;max-width:220px;height:6px;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent2) 65%,var(--line2) 65%)}
  ```
- 내비에 `꾸미기(#grow)`를 '기능'과 '휴대폰' 사이에 넣습니다.

### 1-5. 휴대폰 (#screens)
- `.shots` 3장 그대로. 아래에 보조 한 줄 `ph.note`를 `.sub` 스타일로 가운데 정렬(`margin:28px auto 0;text-align:center;font-size:14px`).

### 1-6. 다운로드 · FAQ · 마지막 권유
- 구조는 그대로입니다. Mac 카드의 용량 안내 한 줄은 지금 카드의 보조 줄과 같은 스타일(`--dim`, 13px)을 씁니다.

## 2. 반응형·4개 언어 확인할 곳
- `.tag`가 붙은 h3는 ja·zh에서 줄이 바뀔 수 있습니다. `.tag`가 다음 줄로 내려가도 괜찮게 `white-space:nowrap`을 줍니다.
- `.stack .over`는 640px 이하에서 숨깁니다(작은 화면에서 겹치면 둘 다 안 보임).
- 기능 6줄은 900px 이하에서 지금 규칙대로 1칸으로 쌓입니다(사진이 글 아래).

## 3. 남은 일 (이번에 못 한 것)
1. **휴대폰 3장은 실데이터로 다시 찍지 못했습니다.** 휴대폰 화면은 안드로이드 앱이 PC에 붙어야 나오는데, 개발 앱의 휴대폰 연결 포트(47900)를 설치된 앱이 쓰고 있고, 에뮬레이터 연결은 QR을 찍어 짝지어야 합니다. 그래서 이틀 전 데모 사진(같은 UI)을 WebP로만 바꿨습니다. GPT 직원이 보이는 휴대폰 사진이 꼭 필요하면 실제 휴대폰을 연결해서 찍어야 합니다.
2. **데모데이(`demoday`) 사진은 없습니다.** 대상 목록에 없었고, 데모데이를 열면 직원들이 실제로 발표하면서 사용량을 씁니다.
3. **en/ja/zh 새 사진**: 지금은 ko만 있습니다. 앱 언어를 바꿔 같은 장면을 다시 찍을 수 있습니다(설정 > 언어). 다만 업무·대화 내용은 한국어로 남습니다.
