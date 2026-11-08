# 직원 브라우저에서 내 크롬 쓰기: 가능 여부와 위험 (구현 안 함)

출처: Playwright MCP 공식 README (github.com/microsoft/playwright-mcp)에서 확인한 내용만 적었습니다. 확장 설치 방법 문서는 열어 보지 못했습니다.

## 가능한가
- **가능한 방법이 문서에 있습니다.** `--extension` 옵션은 "Connect to a running browser instance (Edge/Chrome only). Requires the "Playwright Extension" to be installed." 입니다. 이미 켜 둔 내 크롬에 확장을 깔고 붙이는 방식입니다.
- `--cdp-endpoint` ("CDP endpoint to connect to.")로 열려 있는 크롬 디버깅 포트에 붙는 길도 옵션 표에 있습니다.
- 현재 앱은 `--user-data-dir`로 직원 전용 프로필을 쓰고, 한 번 로그인하면 유지됩니다. README도 이 프로필이 기본으로 "persistent profile like a regular browser"라고 설명합니다. 옵션 표에는 "If not specified, a temporary directory will be created."라고도 적혀 있어 서로 어긋나므로, 앱은 경로를 직접 지정합니다.

## 위험 (문서에서 확인된 것 + 구조상 따라오는 것)
- 문서 확인: "A persistent profile can only be used by one browser instance at a time" — 같은 프로필을 동시에 쓰면 충돌합니다. 그래서 공용 로그인 모드는 한 번에 한 직원만 브라우저를 붙입니다.
- 구조상 위험(문서 인용 아님): 내 크롬에 직접 붙으면 직원이 내 모든 로그인·쿠키·패스키로 열린 사이트(메일, 은행 등)에 접근할 수 있습니다. 현재처럼 이동·클릭·입력마다 결재를 받아도 범위가 전부 열립니다. 이것이 지금 프로필을 나눠 둔 이유입니다.
- `--allowed-origins` 등 도메인 제한은 문서에 "does not serve as a security boundary"라고 되어 있어 안전장치로 믿을 수 없습니다.

## 권장
- 이번 1.2.0에서는 구현하지 않고, "직원 전용 프로필 + 모든 직원이 같은 로그인 쓰기" 옵션까지만 제공합니다.
- 내 크롬 연결은 확장 설치·권한 안내와 "어느 사이트까지 허용" 같은 별도 결재 설계가 있어야 안전합니다. 필요하면 다음 버전 과제로 둡니다.
