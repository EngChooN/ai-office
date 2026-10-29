# Show GN 글 초안 + SNS 짧은 버전 (게시 전 대표 검토용)

> 게시 금지 상태. 대표 승인 후 대표 지시로만 올립니다. `[확인 필요]`는 확정 전 값입니다.
> 첫머리 GIF: `gif/draft-approval-flow.gif` (임시본 — 아래 "GIF 상태" 참고)

## 1. 긱뉴스 Show GN

**제목(안)** Show GN: AI Office – Claude Code 직원들을 '사무실'에서 고용하고 결재하는 데스크톱 앱 (베타)

**본문(안)**

![AI Office 데모](업로드한 GIF 주소)

안녕하세요. 코드 없이 AI 직원을 고용해 일을 맡기는 **AI 사무실, AI Office**를 만들었습니다. 지금은 **베타**입니다. 1.0 전에 피드백을 받고 싶어 먼저 올립니다.

**무엇인가요**
- 내 PC의 Claude Code를 직원 여러 명으로 나눠 쓰는 데스크톱 앱입니다. 직원을 고용하고, 단체방·회의실에서 지시하고, 파일 수정·명령 실행 같은 위험한 요청은 **결재함**에서 내가 승인한 뒤에만 실행됩니다.
- 무료·오픈소스입니다. 별도 서버 없이 내 컴퓨터의 Claude Code 로그인을 그대로 씁니다.
- GPT(Codex) 직원도 쓸 수 있습니다(베타 기능).

**지원 플랫폼 (3종)**
- macOS — Apple Silicon 전용(.dmg)
- Windows — 시험판(.zip)
- Android — PC 앱과 연결해 쓰는 원격 앱(.apk). PC 앱이 실행 중이어야 합니다.

**알려진 제한 사항**
- 베타라 동작·화면이 예고 없이 바뀔 수 있습니다.
- Claude Code 설치·로그인이 먼저 필요하고, 계정 플랜의 사용 한도 영향을 받습니다.
- 코드 서명이 안 되어 설치 시 OS 보안 경고가 뜰 수 있습니다.
- 윈도우는 시험판입니다. [확인 필요: 지원 범위·알려진 차이는 윈도우 PC QA 결과 반영]
- 안드로이드는 PC 앱이 있어야 동작합니다. 집 밖 연결 조건 [확인 필요]

**써 보기**: https://engchoon.github.io/ai-office/ (다운로드 버튼 1번)
첫 실행 때 설치·로그인 점검부터 예제 업무 1건까지 안내합니다. [확인 필요: 소요 시간 표기 — QA 후 실측값]

**피드백 경로**
- 앱 설정 › 안내 › **피드백 보내기** (버전·OS가 채워진 GitHub 이슈가 열림)
- 소개 페이지의 '피드백 보내기' 또는 https://github.com/EngChooN/ai-office/issues/new
- 특히 알고 싶은 것: 설치·첫 업무 중 막힌 곳, 윈도우·안드로이드 동작, 결재 흐름이 불편한 점

**링크**: 소개 https://engchoon.github.io/ai-office/ · 소스·릴리즈 https://github.com/EngChooN/ai-office

## 2. 짧은 버전 (GIF 첨부, 링크는 소개 페이지)

**X (한국어, 280자 이내 기준)**
> Claude Code를 '직원'으로 고용해 사무실에서 일 시키는 앱, AI Office 베타 공개했어요. 위험한 작업은 결재함에서 승인해야만 실행. 맥·윈도우·안드로이드, 무료·오픈소스. 피드백 환영 🙏
> https://engchoon.github.io/ai-office/

**X (영어)**
> AI Office (beta): hire Claude Code "employees" in a pixel office, assign work, and approve risky actions from an inbox. Free & open source. macOS / Windows / Android. Feedback welcome.
> https://engchoon.github.io/ai-office/

**스레드**
> 코드 없이 AI 직원을 고용해 일 시키는 'AI 사무실' 만들었어요 (베타).
> 직원이 파일을 고치거나 명령을 돌리려 하면 결재함에 올라오고, 내가 승인해야 실행돼요.
> 맥(Apple Silicon)·윈도우(시험판)·안드로이드(PC 앱 연결) / 무료·오픈소스
> 써 보시고 불편한 점 알려 주세요 → 링크는 댓글에
> (댓글) https://engchoon.github.io/ai-office/

**디스코드(커뮤니티 공지용)**
> **AI Office 베타 공개** 🏢
> Claude Code 직원을 고용하고, 위험한 작업은 결재함에서 승인하는 데스크톱 앱입니다. 무료·오픈소스.
> • 플랫폼: macOS(Apple Silicon) / Windows(시험판) / Android(PC 앱 연결)
> • 알려진 제한: 베타라 변경 잦음, Claude Code 로그인 필요, 코드 서명 없음(OS 경고 가능)
> • 피드백: 앱 설정 › 피드백 보내기, 또는 GitHub 이슈
> 다운로드·소개: https://engchoon.github.io/ai-office/
> (첨부: 10초 데모 GIF)

## 3. 게시 전 체크
- [ ] 소개 페이지·릴리즈가 배포돼 위 주소가 열림 (현재 변경은 미커밋·미배포)
- [ ] 필수 범위 QA 재확인(앱 안 온보딩·피드백 버튼은 3단계에서 미확인)
- [x] 방문 집계는 보류 확정(가입·서버 방식 지양). 게시 후 유입은 다운로드 수·검색 클릭수로 확인
- [ ] GIF 5MB 이하·긱뉴스 업로드 한도 확인 [확인 필요]
- [ ] 긱뉴스 글 게시 규칙(Show GN 형식·자기 홍보 정책) 확인 [확인 필요]
- [ ] 베타 문구·알려진 제한이 소개 페이지와 일치
