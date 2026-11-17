# 스크린샷 폴더 규칙

소개 페이지(`site/index.html`)는 고른 언어의 폴더에서 스크린샷을 불러옵니다. 파일은 모두 **WebP**이고, 레티나·휴대폰에서 번지지 않게 **PC는 2배(2800×1770), 휴대폰은 3배(1170×2532)** 로 찍습니다. `<img>`의 `width/height`는 1배 크기(PC 1400×885, 휴대폰 390×844)로 둡니다.

사이트는 **라이트·다크** 두 모드를 지원하므로 같은 장면을 두 벌 둡니다. 라이트용은 `이름.webp`, 다크용은 `이름-dark.webp`입니다. 페이지가 지금 모드에 맞는 쪽을 골라 보여 줍니다(모드를 바꾸면 사진도 바로 바뀝니다). 레트로 테마 사진처럼 한 벌만 있는 것은 `data-nodark` 표시로 항상 같은 파일을 씁니다.

```
screens/
  ko/  en/  ja/  zh/
    office.webp  office-dark.webp            사무실 안(직원·가구) — 꾸미기 칸 맨 위 큰 그림 (1600×1000)
    missions.webp  missions-dark.webp        상점 › 미션·업적 — 꾸미기 '1 · 모으기' 카드 (1580×868)
    shop.webp  shop-dark.webp                상점 › 레벨 전용 — 꾸미기 '2 · 사기' 카드 (1600×880)
    chat.webp  chat-dark.webp                PC 대화방(단체방) — 검색엔진용 구조 데이터(screenshot)에만 씀
    inbox.webp  inbox-dark.webp              PC 결재함 — 구조 데이터에만 씀
    board.webp  board-dark.webp              PC 업무 보드 — 구조 데이터에만 씀
    secretary.webp  secretary-dark.webp      PC 비서(말로 직원 뽑기 확인 카드) 전체 화면 — 구조 데이터
    phone-chat.webp  phone-chat-dark.webp    휴대폰 단체방 (1170×2532) — 기능 07 왼쪽 휴대폰
    phone-inbox.webp  phone-inbox-dark.webp  휴대폰 결재함 (1170×2532) — 기능 07 오른쪽 휴대폰
    pcs.webp  pcs-dark.webp                  PC 바꾸기 메뉴 — 'PC 연결' 칸
    feat-*.webp  feat-*-dark.webp            기능 줄(03~06·08·09)용으로 미리 잘라 둔 그림 (아래 '기능 줄 그림')
```

- 폴더 이름은 언어 코드(`ko`, `en`, `ja`, `zh`), 파일 이름은 위 목록으로 고정입니다.
- 그 언어 파일이 없으면 **영어 → 한국어** 순으로 대신 보여 줍니다. 그래도 4개 언어 모두 전체 파일을 둡니다.
- `og:image`(링크 미리보기)는 따로 만든 `assets/og.png`(1200×630)를 씁니다.
- 파일을 늘리거나 줄이면 `node site/check-i18n.mjs`로 4개 언어 사전의 키 개수와 사진 파일이 모두 맞는지 확인합니다.

## 찍는 법 (모의 데이터 미리보기)

실제 회사 데이터가 나오지 않게 **모의 데이터 미리보기**(`pnpm preview:mobile`, `app/src/renderer/mobile/preview/`)로 찍습니다. 가상 직원·가상 업무는 `demoData.ts`에 4개 언어로 들어 있습니다.

- 주소: `http://localhost:5299/mobile-preview.html?view=<화면>&theme=lavender&mode=<light|dark>&demo=<ko|en|ja|zh>`
  - `view`: `map`(+`inside=1`이면 사무실 안)·`chat`·`inbox`·`board`·`secretary`·`settings`
  - 레트로: `theme=retro&mode=dark`. `theme`을 넣어야 `mode`가 먹습니다.
  - `demo=<언어>`는 그 언어의 가상 회사 데이터와 앱 화면 언어를 함께 정합니다(비서 대화 예시도 4개 언어로 들어 있음).
- 크기: PC는 1400×885(배율 2), 휴대폰은 390×844(배율 3). 1400 이상이어야 PC 배치가 나옵니다.
- 색 테마 사진(`theme`)은 `settings` 화면을 0.8배 줄여 찍어 10개 칩이 한 장에 다 보이게 합니다.
- WebP 변환: `cwebp -q 82 -m 6` 또는 같은 품질의 다른 도구. 한 장이 330KB를 넘으면 품질을 5씩 낮춥니다(레트로 사무실은 약 210KB).
- `app/src/renderer/mobile/preview/fakeShell.ts`의 `demo` 구간에서 비서 예시(`SEC`)를 바꾸면 비서 사진의 대화를 바꿀 수 있습니다.
- 대화방 사진에 시험용 이상한 글이 보이지 않는지 확인하세요. `demo=<언어>`로 찍으면 가상 대화만 나옵니다(`demo` 없이 찍으면 시험용 글이 섞입니다).

## 기능 줄 그림 (`feat-*`, 2026-11 안 3 개편)

소개 페이지 기능 줄은 큰 캡처를 CSS로 자르지 않고 **미리 잘라 둔 16:10 파일**을 씁니다. 언어·라이트/다크마다 한 벌씩(6종 × 4개 언어 × 2). 07 연결은 `phone-chat`·`phone-inbox` 두 장을 휴대폰 틀 두 개에 통째로 넣는다.

| 파일 | 줄 | 만드는 법 (왼쪽·위·오른쪽 비율, 높이는 폭의 10/16) |
|---|---|---|
| `feat-approve` | 03 결재 | `chat` 캡처 `.36,.555,.68` |
| `feat-lead` | 04 팀장 | `inbox` 캡처 `.145,.245,.50` |
| `feat-secretary` | 05 비서 | 아래 '실제 앱으로 찍기'의 비서 화면을 1400×885 기준 (372,125)부터 830×519 |
| `feat-ai` | 06 AI | 미리보기 `view=payroll`(AI 사용 비용)을 1400×885·배율 2로 열고 (180,100)부터 800×500 |
| `feat-dash` | 08 안심 | 미리보기 `view=dashboard`(직원 현황)를 (180,86)부터 800×500 |
| `feat-tools` | 09 도구 | `board` 캡처 `.14,.44,.62` |

원본 캡처를 새로 찍으면 `feat-*`도 같이 다시 자르세요. WebP 품질 0.82.

## 건물 7단계 (`site/assets/building/lv1~7.webp`)

레벨 막대의 건물 그림은 언어와 상관없어 한 벌만 둡니다. 실제 앱을 따로 띄워(`app/scripts/qa-start.sh start <이름> --cdp 9447`, 데이터 폴더 분리) 설정 › 사무실 › **레벨 미리보기**(개발 빌드 전용)로 Lv.1·3·6·10·14·18·20을 고른 뒤, 사무실 외관 2D 캔버스에서 화면에 보이는 영역만 잘라 저장했습니다(사람 표시·안내 칸 없이 앱이 맞춘 시점 그대로). 픽셀 그림이라 원래 크기(폭 458~883px)로 두고 페이지에서 `image-rendering:pixelated`로 키웁니다.

## 실제 앱으로 찍기 (2026-11-17, office·missions·shop·secretary·feat-secretary)

따로 띄운 앱 + 가상 회사 데이터로 찍었습니다. 휴대폰 두 장(phone-chat·phone-inbox)은 위 '모의 데이터 미리보기'(`view=chat`·`view=inbox`, 처음 힌트 칸은 찍기 전에 걷어 냄)로 찍었습니다.

1. 빈 데이터 폴더로 앱을 한 번 켰다 끈다: `HOME=<빈 폴더> app/scripts/qa-start.sh start <이름> --cdp 9447 --vite 5210` → `stop`
2. `node app/scripts/demo-seed.mts <데이터 폴더> <언어>`로 가상 회사를 넣는다. 비서 그림은 비서 대화를 '말로 직원 뽑기' 장면(확인 카드 `hire`, 이름·직무·결재 방식·팀)으로 바꾸고, 설정 `isSecretaryBriefOn: false`로 '돌아오면 요약'이 끼지 않게 한다
3. `CLAUDE_OFFICE_DEMO=1`을 붙여 다시 켜고, CDP로 화면 크기 1400×885·배율 2(사무실 안은 1800×885 — 오른쪽 위 통계 칸이 방과 겹치지 않게)로 찍는다. 창이 숨으면 `officeWorkspaces.switchTo('self')`로 다시 띄운다
4. 자르기(CSS px): 사무실 안 (520,178) 970×606 · 미션 (190,170) 790×434 · 상점 (182,62) 1200×660 · 비서 기능 줄 (372,125) 830×519. WebP 품질 0.82
