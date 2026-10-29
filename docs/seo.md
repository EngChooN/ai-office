# 소개 페이지 검색엔진 최적화(SEO)

## 구조
- 언어별 주소: `/`(한국어) · `/en/` · `/ja/` · `/zh/`. 각 주소가 자기 언어의 title·description·canonical·OG·JSON-LD와 본문 글을 정적으로 가진다(JS 없이도 보임).
- 4개 주소는 `hreflang`(ko·en·ja·zh-CN·x-default=루트)으로 서로 연결되고 `sitemap.xml`에도 같이 적혀 있다.
- `/en/` `/ja/` `/zh/` 와 `sitemap.xml`은 **생성물**이다: `node site/build-langs.mjs` (배포 때 `pages.yml`이 자동 실행). `site/index.html`의 `I18N` 문구나 본문을 고친 뒤에는 이 명령을 돌려 같이 커밋한다. `index.html`의 `<!--p-->…<!--/p-->` 구간은 스크립트가 채우므로 직접 고치지 않는다.
- 루트(`/`)는 처음 방문한 사람의 브라우저 언어로 제자리에서 바뀐다(검색엔진에는 한국어). 언어 주소에서 언어를 고르면 해당 주소로 이동한다.

## 한계
- **robots.txt는 `engchoon.github.io/robots.txt`(호스트 루트)에서만 효력이 있다.** 프로젝트 페이지(`/ai-office/`)의 `site/robots.txt`는 크롤러가 읽지 않는다. 막는 규칙이 없으니 기본 허용이라 문제는 없고, 사이트맵은 아래 서치 콘솔·서치어드바이저에 직접 제출한다. 별도 도메인을 쓰면 이 파일이 그대로 유효해진다.
- 구글 소프트웨어 앱 리치 결과는 평점·리뷰(`aggregateRating`/`review`)가 있어야 노출 대상이다. 지금은 없어서 구조화 데이터 문법 검사는 통과해도 리치 결과 자격은 없을 수 있다. 평점을 지어내지 않는다.

## 구글 서치 콘솔 (대표 계정)
1. https://search.google.com/search-console → 속성 추가 → **URL 접두어** `https://engchoon.github.io/ai-office/`
2. 소유 확인 방법 **HTML 태그** 선택 → 나온 `content` 값을 `site/index.html` 맨 위의 `google-site-verification` 주석 자리에 넣고 주석을 풀기(생성 후 `/en/` 등에도 복사됨) → 배포.
3. 확인 버튼 → 완료 후 **Sitemaps**에 `sitemap.xml` 제출 → URL 검사로 4개 주소 색인 요청.
4. 구조화 데이터 검사: https://search.google.com/test/rich-results 에 주소 입력.

## 네이버 서치어드바이저 (대표 계정)
1. https://searchadvisor.naver.com → 웹마스터 도구 → 사이트 등록 `https://engchoon.github.io/ai-office/`
2. **HTML 태그** 확인 → `naver-site-verification` 주석 자리에 값 넣고 배포 → 소유확인.
3. 요청 → 사이트맵 제출 `https://engchoon.github.io/ai-office/sitemap.xml`, 웹 페이지 수집 요청으로 루트 주소 제출.
(네이버는 github.io 하위 주소 등록이 제한될 수 있다. 막히면 별도 도메인이 필요 — 열린 질문 5번.)

## 점검 결과 (Lighthouse 12.8, 모바일, 로컬 서버)
| 주소 | SEO | 성능 | 접근성 | 권장사항 |
|---|---|---|---|---|
| / (ko) | 100 | 86 | 96 | 100 |
| /en/ | 100 | 84 | 96 | 100 |
| /ja/ · /zh/ | 100 | 84 | 96 | 100 |
- 성능 감점은 LCP 약 4.1~4.6초(첫 화면 큰 스크린샷). 로컬 서버는 압축을 안 해 "텍스트 압축" 항목이 깎이지만 GitHub Pages는 gzip을 쓴다. 용량(스크린샷 webp 75~290KB)은 이미 작은 편.
