# 스크린샷 폴더 규칙

소개 페이지(`site/index.html`)는 고른 언어의 폴더에서 스크린샷을 불러옵니다. 파일은 모두 **WebP**이고, 레티나·휴대폰에서 번지지 않게 **PC는 2배, 휴대폰은 3배**로 찍었습니다. `<img>`의 `width/height`는 1배 크기(PC 1360×860, 휴대폰 390×844)로 둡니다.

```
screens/
  ko/  en/  ja/  zh/
    office.webp           PC 사무실 실내 — 맨 위 큰 사진 (2720×1720)
    staff-mix.webp        PC 직원 고용 창(Claude/Codex 베타 고르기) — 기능 f1
    providers.webp        PC 설정 > AI 공급자 — 기능 f1 보조
    chat.webp             PC 단체방(@이름 지시·GPT 직원 답) — 기능 f2
    inbox.webp            PC 결재함(질문·컴퓨터 조작·명령 실행) — 기능 f3
    board.webp            PC 업무 보드 — 기능 f4
    meeting.webp          PC 회의실(발언·결정 요청) — 기능 f5
    computer.webp         PC 컴퓨터 조작 결재 카드 + 장비 탭 — 기능 f6
    secretary.webp        PC 비서 확인 카드(전·후 비교, 못 하는 일 안내) — 기능 f7
    dashboard.webp        PC 대시보드(Claude·GPT 플랜 사용률) — 기능 f8
    exterior.webp         PC 건물 외관 (Lv.20) — 꾸미기 1
    decorate.webp         PC 꾸미기 모드(레벨 전용 가구) — 꾸미기 2
    demoday.webp          PC 데모데이 무대·뒷벽 스크린 — 꾸미기 3
    theme.webp            PC 설정 > 일반(화면 모드·색 테마 6종) — 스타일 l1·l2
    settings.webp         PC 설정 > AI·업무(왼쪽 분류) — 스타일 l3
    export.webp           PC 사무실 장면 내보내기 창(PNG/GIF) — 꾸미기 4
    interaction.webp      PC 직원 상호작용(👀 어깨 너머 검토·👍 승인) — 꾸미기 5
    phone-dashboard.webp  휴대폰 대시보드 (1170×2532)
    phone-inbox.webp      휴대폰 결재함 (1170×2532)
    phone-chat.webp       휴대폰 단체방 (1170×2532)

../video/
    approval-flow.webm          단체방 지시 → 결재함 카드 → 승인 (8.2초, 2720×1720, 한국어 화면)
    computer-approval.webm      컴퓨터 조작 장비 → 클릭 승인 (5.4초, 2720×1720, 한국어 화면)
    *-poster.webp               위 영상의 첫 장면 (`<video poster>`용)
```

- 폴더 이름은 언어 코드(`ko`, `en`, `ja`, `zh`), 파일 이름은 위 목록으로 고정입니다.
- 그 언어 파일이 없으면 **영어 → 한국어** 순으로 대신 보여 줍니다. 그래서 `ko/`에는 위 파일이 모두 꼭 있어야 하고, 다른 언어는 비어 있어도 됩니다.
- 앱이 새 언어를 지원하면 같은 크기·같은 이름으로 그 언어 폴더에 넣기만 하면 됩니다. 코드는 고칠 필요가 없습니다.
- `og:image`(링크 미리보기)는 따로 만든 `assets/og.png`(1200×630)를 씁니다.
- 압축: `cwebp -q 85 -m 6 -sharp_yuv in.png -o out.webp`, 300KB가 넘으면 품질을 5씩 낮춥니다(외관 사진만 75). 외관은 새 주변 그림 때문에 품질 75에서 약 460KB입니다(해상도를 지키려고 그대로 둠). PNG 원본은 저장소 밖 `~/flitto/poc/site-shots-lavender-dark/{언어}/`에 둡니다.
- 영상: `ffmpeg -f concat -i frames.txt -vf fps=30,format=yuv420p -c:v libvpx-vp9 -b:v 0 -crf 38 -an out.webm` (소리 없음 — 페이지에서 `muted loop playsinline autoplay`).
- 모든 캡처는 **라벤더 테마·다크 모드**입니다(데모 데이터 폴더의 설정에 `uiTheme: 'lavender'`, `uiMode: 'dark'`). 휴대폰은 `prefers-color-scheme: dark`로 찍습니다.
- 찍는 법 (0.14.0, 0.15.1 재촬영 때 `AI_OFFICE_USER_DATA`·디버그 포트 9447로 같은 방식)
  - 가상 회사 데모: 빈 데이터 폴더에 `node app/scripts/demo-seed.mts <폴더> <언어>`로 넣고, `CLAUDE_OFFICE_USER_DATA=<폴더> CLAUDE_OFFICE_DEMO=1`에 빈 HOME으로 개발 앱을 띄워 디버그 포트로 찍습니다. `CLAUDE_OFFICE_DEMO=1`이면 결재 카드·사용률·터미널 세션과 Claude·Codex 로그인 상태가 데모 값으로 채워집니다(`app/src/main/demoLive.ts`).
  - 외관·꾸미기·데모데이는 같은 데이터에 회사 레벨을 20으로 올려(`setting` 표의 `companyLevelMax`) 찍습니다. 나머지는 Lv.4입니다.
  - 휴대폰은 `pnpm preview:mobile` 주소(`mobile-preview.html?demo=<언어>`)를 390×844 3배로 찍습니다.
  - 찍기 전에 화면 글자의 이메일·`/Users/<이름>`·임시 폴더 경로를 샘플 값으로 바꿉니다. 대시보드의 '오늘' 기록은 자정 직후엔 비니 피해서 찍으세요.
