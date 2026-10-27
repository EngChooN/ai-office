# 스크린샷 폴더 규칙

소개 페이지(`site/index.html`)는 고른 언어의 폴더에서 스크린샷을 불러옵니다. 파일은 모두 **WebP**입니다.

```
screens/
  ko/  en/  ja/  zh/
    office.webp           PC 사무실 실내 — 맨 위 큰 사진 (1360×860)
    staff-mix.webp        PC 직원 고용 창(Claude/Codex 고르기) — 기능 f1
    providers.webp        PC 설정 > AI 공급자 — 기능 f1 보조
    chat.webp             PC 단체방 — 기능 f2
    inbox.webp            PC 결재함 — 기능 f3
    board.webp            PC 업무 보드 — 기능 f4
    meeting.webp          PC 회의실 — 기능 f5
    computer.webp         PC 컴퓨터 조작 결재 카드 — 기능 f6
    secretary.webp        PC 비서 확인 카드 — 기능 f7
    dashboard.webp        PC 대시보드(Claude·GPT 플랜 사용률) — 기능 f8
    exterior.webp         PC 건물 외관 — 꾸미기 1
    decorate.webp         PC 꾸미기 모드(레벨 전용 가구) — 꾸미기 2
    phone-dashboard.webp  휴대폰 대시보드 (390×844)
    phone-inbox.webp      휴대폰 결재함 (390×844)
    phone-chat.webp       휴대폰 단체방 (390×844)
```

- 폴더 이름은 언어 코드(`ko`, `en`, `ja`, `zh`), 파일 이름은 위 목록으로 고정입니다.
- 그 언어 파일이 없으면 **영어 → 한국어** 순으로 대신 보여 줍니다. 그래서 `ko/`에는 위 파일이 모두 꼭 있어야 하고, 다른 언어는 비어 있어도 됩니다.
- 앱이 새 언어를 지원하면 같은 크기·같은 이름으로 그 언어 폴더에 넣기만 하면 됩니다. 코드는 고칠 필요가 없습니다.
- `og:image`(링크 미리보기)는 따로 만든 `assets/og.png`(1200×630)를 씁니다.
- 압축: `cwebp -q 80 -m 6 in.png -o out.webp` (PC 1배 1360×860, 장당 150KB 이하 목표).
- 찍는 법
  - 0.14.0 PC 사진: 실데이터 복사본 개발 앱(`AI_OFFICE_USER_DATA=<복사본 폴더>`, `--remote-debugging-port`)을 띄우고 디버그 포트로 찍습니다. 찍기 전에 화면 글자에서 이메일·`/Users/<이름>` 경로·회사명을 샘플 값으로 바꿉니다. 사무실 캔버스의 이름표는 바꿀 수 없으니, 개인 정보가 보이는 층은 피합니다.
  - 가상 회사 데모: `app/scripts/demo-seed.mts`(빈 데이터 폴더 + 빈 HOME)로 앱을 띄워 찍습니다. 휴대폰은 `pnpm preview:mobile` 주소(`mobile-preview.html?demo=ko`)로 찍습니다. 대시보드의 '오늘' 기록은 자정 직후엔 비니 피해서 찍으세요.
