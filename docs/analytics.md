# 소개 페이지 방문 집계 · 다운로드 수 확인

## 1. 방문 집계 도구 비교 (쿠키·개인정보 없음, 무료)

| 항목 | GoatCounter (추천) | Cloudflare Web Analytics | Umami Cloud 무료 |
|---|---|---|---|
| 쿠키·개인 식별 | 없음 | 없음 | 없음 |
| 무료 조건 | 비영리·개인용 무료 | 무료 | 월 10만 이벤트 한도 |
| 가입 | 이메일로 가입, 서브도메인 선택 | Cloudflare 계정 필요 | 계정 필요 |
| GitHub Pages(github.io) 적용 | 스크립트 한 줄로 끝 | 비콘 스크립트 방식만 가능, 설정 단계 많음 | 스크립트 한 줄 |
| 주간 수치 확인 | 대시보드 기간 선택, API 제공 | 대시보드 기간 선택 | 대시보드 기간 선택 |
| 단점 | 화면이 단순함 | 대시보드 무거움, 계정 연결 부담 | 한도 초과 시 유료 |

**추천: GoatCounter.** 가입만 하면 되고 코드는 스크립트 한 줄입니다. 별도 도메인 없이 github.io에서 바로 동작합니다.

**상태: 대표님이 적용을 보류함(2026-10-29).** 가입과 스크립트 추가는 하지 않았습니다. 위 비교는 공식 문서를 확인한 것이 아니라 제가 아는 내용 기준이므로, 적용 전에 최신 약관과 한도를 확인해야 합니다.

### 적용할 때 할 일 (보류 해제 후)
1. 대표님이 goatcounter.com에서 사이트 코드(예: `aioffice`)로 가입.
2. `site/index.html`의 `</body>` 앞에 추가:
   ```html
   <script data-goatcounter="https://aioffice.goatcounter.com/count"
           async src="//gc.zgo.at/count.js"></script>
   ```
   사이트 코드는 가입한 값으로 바꿉니다.
3. 배포 후 소개 페이지를 열고 대시보드에 방문이 잡히는지 확인.
4. 개인정보 안내가 필요하면 푸터에 "쿠키 없는 익명 방문 집계를 사용합니다" 한 줄 추가(문구는 대표 확인).

### 주간 방문 수 확인 (적용 후)
- 대시보드: `https://<사이트코드>.goatcounter.com` → 기간을 "Last week"로 선택 → 방문 수(Visits)·페이지뷰 확인.
- 설정 › API에서 토큰을 만들면 `curl`로도 뽑을 수 있습니다. 엔드포인트는 가입 후 공식 API 문서에서 확인하세요.

## 2. GitHub 릴리즈 다운로드 수 (gh)

gh 경로: `~/.local/gh-cli/gh_2.103.2_macOS_arm64/bin/gh` (로그인 확인됨, 계정 EngChooN)

```sh
GH=~/.local/gh-cli/gh_2.103.2_macOS_arm64/bin/gh

# 릴리즈별·파일별 다운로드 수
$GH api repos/EngChooN/ai-office/releases \
  --jq '.[] | {tag:.tag_name, assets:[.assets[]|{n:.name,d:.download_count}]}'

# 플랫폼별 전체 누적 (파일 이름의 AI-/Claude- 접두사 구분 없이 합산)
$GH api repos/EngChooN/ai-office/releases --paginate \
  --jq '.[].assets[] | [.name,.download_count] | @tsv' \
  | awk '{n=$1; sub(/^(AI|Claude)-Office-/,"",n); s[n]+=$2} END{for(k in s) print k, s[k]}'

# 최신 릴리즈만 총합
$GH api repos/EngChooN/ai-office/releases/latest --jq '[.assets[].download_count]|add'
```

### 주간 증가분 보는 법
GitHub은 누적값만 줍니다. 매주 같은 요일에 위 "플랫폼별 전체 누적" 결과를 기록해 두고, 이번 주 값에서 지난주 값을 빼면 주간 다운로드 수입니다. 기록 양식 예:

| 날짜 | mac | win | android | 방문 수 |
|---|---|---|---|---|
| (기록) | | | | |

### 주의
- 다운로드 수에는 봇·재다운로드·업데이트 확인이 섞일 수 있어 실제 설치 수와 다릅니다.
- 파일 이름이 `Claude-Office-*`에서 `AI-Office-*`로 바뀌어서 접두사를 떼고 합산합니다.
- 2026-10-29 확인 시 v0.14.2: mac 3, win 2, android 1.
