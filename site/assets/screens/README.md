# 스크린샷 폴더 규칙

소개 페이지(`site/index.html`)는 고른 언어의 폴더에서 스크린샷을 불러옵니다. 파일은 모두 **WebP**이고, 레티나·휴대폰에서 번지지 않게 **PC는 2배(2800×1770), 휴대폰은 3배(1170×2532)** 로 찍습니다. `<img>`의 `width/height`는 1배 크기(PC 1400×885, 휴대폰 390×844)로 둡니다.

사이트는 **라이트·다크** 두 모드를 지원하므로 같은 장면을 두 벌 둡니다. 라이트용은 `이름.webp`, 다크용은 `이름-dark.webp`입니다. 페이지가 지금 모드에 맞는 쪽을 골라 보여 줍니다(모드를 바꾸면 사진도 바로 바뀝니다). 레트로 테마 사진처럼 한 벌만 있는 것은 `data-nodark` 표시로 항상 같은 파일을 씁니다.

```
screens/
  ko/  en/  ja/  zh/
    office.webp  office-dark.webp            PC 사무실 실내 — 첫 화면 큰 사진
    chat.webp  chat-dark.webp                PC 대화방(단체방) — 사용법 1단계
    inbox.webp  inbox-dark.webp              PC 결재함 — 사용법 2단계
    board.webp  board-dark.webp              PC 업무 보드 — 사용법 3단계
    secretary.webp  secretary-dark.webp      PC 비서(밤사이 요약 + 답 안 결재 카드) — 비서 칸
    theme.webp  theme-dark.webp              PC 설정 > 일반(화면 모드·색 테마 10종) — 스타일 칸
    retro.webp                               PC 사무실, 레트로 오피스 게임 테마(다크 전용 — 한 벌만)
    phone-secretary.webp  phone-secretary-dark.webp   휴대폰 비서 (1170×2532)
    phone-inbox.webp  phone-inbox-dark.webp           휴대폰 결재함 (1170×2532)
    phone-chat.webp  phone-chat-dark.webp             휴대폰 대화방 (1170×2532)
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
