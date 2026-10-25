# 스크린샷 폴더 규칙

소개 페이지(`site/index.html`)는 고른 언어의 폴더에서 스크린샷을 불러옵니다.

```
screens/
  ko/  en/  ja/  zh/
    office.png            PC 사무실 실내 — 맨 위 큰 사진 (1360×860)
    chat.png              PC 단체방 — 기능 f1 (1360×860)
    inbox.png             PC 결재함 — 기능 f2
    board.png             PC 업무 보드 — 기능 f3
    meeting.png           PC 회의실 — 기능 f4
    dashboard.png         PC 대시보드 — 기능 f5
    exterior.png          PC 외관(거리) — 기능 f7
    phone-dashboard.png   휴대폰 대시보드 (390×844)
    phone-inbox.png       휴대폰 결재함 (390×844)
    phone-chat.png        휴대폰 단체방 (390×844)
```

- 폴더 이름은 언어 코드(`ko`, `en`, `ja`, `zh`), 파일 이름은 위 세 개로 고정입니다.
- 그 언어 파일이 없으면 **영어 → 한국어** 순으로 대신 보여 줍니다. 그래서 `ko/`에는 위 파일이 모두 꼭 있어야 하고, 다른 언어는 비어 있어도 됩니다.
- 앱이 새 언어를 지원하면 같은 크기·같은 이름으로 그 언어 폴더에 넣기만 하면 됩니다. 코드는 고칠 필요가 없습니다.
- `og:image`(링크 미리보기)는 따로 만든 `assets/og.png`(1200×630)를 씁니다.
- 찍는 법: 가상 회사 데모(`app/scripts/demo-seed.mts`, 빈 데이터 폴더 + 빈 HOME)로 앱을 띄워 PC 화면을 찍고, 휴대폰은 `pnpm preview:mobile` 주소(`mobile-preview.html?demo=ko`)로 찍습니다. 대시보드의 '오늘' 기록은 자정 직후엔 비니 피해서 찍으세요.
