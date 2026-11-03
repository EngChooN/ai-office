# QA용 개발 앱 띄우기 (직원 셸)

직원(특히 QA)이 셸에서 개발 앱을 직접 띄워 화면을 읽고 누르는 방법입니다. 의존성 추가 없음.

## 쓰는 법
```bash
cd app
scripts/qa-start.sh start <이름> [--cdp 9450] [--vite 5190]   # 띄우기 (준비될 때까지 기다림)
node scripts/qa-cdp.mjs --port <cdp포트> <명령>                # 조작
scripts/qa-start.sh stop <이름>                               # 끄기
scripts/qa-start.sh status <이름>
```
- **이름은 사람마다 다르게**(예: `ocue`, `jeong`). 이름마다 데이터 폴더(`~/claude-office-qa-<이름>`)·PID 파일(`/tmp/aioqa-<이름>.pid`)·로그(`/tmp/aioqa-<이름>.log`)가 따로라 서로 안 건드립니다.
- **포트도 사람마다 다르게.** CDP(`--cdp`, 기본 9450)와 vite(`--vite`, 기본 5190)가 쓰는 중이면 시작을 거절합니다. 대표 확인용 앱이 9447을 쓰는 일이 있으니 9447은 피하세요.
- PATH(nvm의 node, pnpm)는 스크립트가 잡습니다. 끌 때는 자기 PID 트리만 끄므로 **`pkill`을 쓰지 마세요**(남의 앱이 같이 꺼집니다).
- 새 세션으로 띄워서 턴이 끝나도 꺼지지 않습니다. 다 쓰면 반드시 `stop`. (종료에 최대 10초: 앱이 TERM을 늦게 받아 마지막에 강제 종료함)

## 조작 명령 (`qa-cdp.mjs`)
| 명령 | 하는 일 |
|---|---|
| `tabs` | 열린 창 목록 (바탕화면 비서 창은 `?view=pet`) |
| `buttons` | 화면의 버튼·탭·링크 글자 |
| `open <글자>` | 그 글자의 버튼·탭을 눌러 화면 열기 (`click text=글자`와 같음) |
| `click <선택자 \| text=글자>` | 클릭 |
| `text [선택자]` | 화면 글자 읽기 |
| `shot <파일.png>` | 스크린샷 |
| `eval <식>` | 페이지에서 자바스크립트 실행 |

`--target <주소 일부>`로 다른 창을 고릅니다(기본은 메인 창). 요소가 아직 안 그려졌으면 최대 10초 기다립니다.

예: `scripts/qa-start.sh start ocue --cdp 9461 --vite 5191` → `node scripts/qa-cdp.mjs --port 9461 open 기록` → `... text` → `scripts/qa-start.sh stop ocue`

## 알아 둘 점
- 데이터 폴더가 새것이면 **첫 실행 마법사**가 화면을 덮어 클릭이 안 먹습니다. 먼저 `open 건너뛰기`.
- vite 포트는 `AI_OFFICE_VITE_PORT`로 정합니다(`vite.renderer.config.mts`, 127.0.0.1 고정·포트 사용 중이면 실패). 없으면 기본 5173.
- 데이터 폴더는 `AI_OFFICE_USER_DATA`로 분리합니다. 설치본이 켜져 있어도 충돌하지 않습니다.

## 5173 EPERM
`electron-forge start`가 직원 셸에서 vite 5173을 못 여는 증상은 이 맥의 일반 셸에서는 재현되지 않았습니다(127.0.0.1·localhost·::1·0.0.0.0, 5173·9447 모두 바인드 성공). 그래서 앱 코드 문제가 아니라 직원 셸 샌드박스의 포트 바인드 제한이 원인일 가능성이 큽니다. 위 스크립트는 `--vite`로 다른 포트를 받고 127.0.0.1에만 바인드하니, 그 포트가 샌드박스에서 허용되면 EPERM을 피합니다. 허용 포트 범위·샌드박스 설정은 직원 장비 설정에서 확인해야 합니다.
