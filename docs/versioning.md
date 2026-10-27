# 버전 관리 규칙

빌드할 때마다 이 문서로 **메이저 / 마이너 / 패치** 중 무엇을 올릴지 정합니다. 담당: 버전관리(김버전).

## 1. 번호 형식
`메이저.마이너.패치` (예: 0.6.0). 지금은 1.0 전(0.x)이라 "정식 출시 전 PoC" 단계입니다.

## 2. 무엇을 올릴까
| 올릴 번호 | 기준 | 예 |
|---|---|---|
| **메이저** (X.0.0) | 기존 사용을 깨는 변경(저장 데이터를 못 읽음, 쓰던 기능 제거·동작 뒤집힘) 또는 정식 출시 선언 | 1.0 출시, 데이터 초기화가 필요한 DB 개편 |
| **마이너** (0.X.0) | **새 기능 묶음**이 들어가거나 화면·사용 흐름이 크게 바뀜 (개선·버그 수정이 같이 있어도 마이너) | 0.4 → 0.5.0 (대시보드·업무 모드·직원 꾸미기), 0.6.0(건물 외관·여러 층), 0.7.0(윈도우 지원) |
| **패치** (0.0.X) | **기능 하나 정도의 작은 추가**, 또는 버그 수정·문구·성능·화면 다듬기 | 0.5.1(참고 문서 등록 하나), 0.7.1(터미널에서 이어 하기 + 입력창 다듬기) |

판단 순서: ① 깨지는 변경이 있나 → 메이저 ② 새 기능 묶음이거나 화면·흐름이 크게 바뀌었나 → 마이너 ③ 그 외(단일 기능 추가 포함) → 패치.
- 한 빌드에 여러 종류가 섞이면 **가장 높은 것 하나만** 올립니다. 올리면 아래 번호는 0으로 되돌립니다.
- **0.x 동안은** 깨지는 변경도 메이저 대신 마이너로 올리고, CHANGELOG에 "주의"로 적습니다. 메이저(1.0)는 대표가 정식 출시를 결정할 때만.
- 애매하면 "업데이트 소식에서 큰 변화로 읽히는가?"로 판단합니다. 기능 하나만 추가됐다면 패치입니다(프로젝트 관행).
- 같은 날 여러 번 올라갈 수 있으니, 올리기 전에 `package.json`·`CHANGELOG.md`의 현재 버전을 **다시 확인**합니다(다른 작업이 먼저 올렸을 수 있음).
- 내부 정리(리팩터링, 테스트·문서만 수정)는 번호를 올리지 않습니다. 다음 빌드에 같이 묻어갑니다.

### 휴대폰(안드로이드) 앱 번호
- **안드로이드 `versionName` = PC `app/package.json`의 `version`.** 폰 앱도 PC와 같은 번호를 씁니다(예: PC 0.10.1 ↔ 폰 0.10.1).
- **`versionCode`는 매 빌드 +1**(줄면 기존 앱 위에 업데이트가 안 됩니다).
- 폰만 고칠 때는 **같은 PC 번호에서 `versionCode`만 올립니다.** 번호가 같으면 같은 PC 화면이 들어 있는 짝입니다.
- 1.x 이력(1.0.0~1.1.3)은 0.10.1에서 PC 번호로 통일했습니다. 정식 출시 전이라 폰 앱도 0.x입니다.

## 3. 올릴 때 고치는 곳 (빠뜨리기 쉬움)
1. `app/package.json`의 `version` — **여기가 기준**. 앱 버전·dmg가 이 값을 따릅니다.
2. `android/app/build.gradle.kts`의 `versionName`(PC 번호와 같게)·`versionCode`(+1) — 폰 앱을 같이 빌드할 때.
3. `CHANGELOG.md` — 작업 중에는 `## [미정]` 아래에 쌓다가, 빌드할 때 `## [버전] - 날짜`로 확정. `### 새 기능 / 개선 / 버그 수정` 형식, 비개발자가 읽는 말로(앱의 "업데이트 소식"이 이 파일을 그대로 읽음).
4. `SPEC.md` — 새 기능이면 구현 기록 갱신(항목에 버전 표기).
5. `CONTEXT.md`(기준 버전·지금 상태), `README.md`(상태), `intro.html`(푸터·슬라이드 제목), `android/README.md`(앱 버전 줄) — 현재 버전 표기를 맞춤.

## 4. 빌드·설치 순서
1. 위 판단 → 번호 결정, 3번 항목 수정
2. `cd app && pnpm typecheck && pnpm test` (통과해야 빌드)
3. 맥 `pnpm make` → `app/out/make/dmg/arm64/Claude Office.dmg` / 윈도우 `pnpm make:win` → `app/out/make/zip/win32/x64/*.zip`
4. 맥은 `/Applications/Claude Office.app` 교체 후 `CFBundleShortVersionString`이 새 버전인지 확인
- 이 맥은 쉘에 node가 없을 수 있어 nvm의 node 경로(예: v24)와 `~/Library/pnpm`을 PATH에 넣어 실행.
- 실행 중인 앱이 있으면 종료 여부를 먼저 확인(작업 중인 세션이 날아갈 수 있음).
- **맥 서명(권한 유지):** 맥 빌드는 로그인 키체인의 자체 서명 인증서 `Claude Office Local Signing`으로 서명합니다. 같은 인증서면 업데이트 뒤에도 화면 기록·손쉬운 사용 권한이 유지됩니다. 인증서가 없으면 ad-hoc으로 빌드됩니다(권한을 다시 물음). 한 번만 만듭니다(개인 키는 저장소·공유 폴더에 두지 않음):
  1. 임시 폴더(저장소 밖)에서 `openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout key.pem -out cert.pem -subj "/CN=Claude Office Local Signing" -addext "extendedKeyUsage=critical,codeSigning" -addext "keyUsage=critical,digitalSignature"`
  2. `openssl pkcs12 -export -inkey key.pem -in cert.pem -name "Claude Office Local Signing" -passout pass:<임의> -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -out cert.p12`
  3. `security import cert.p12 -k ~/Library/Keychains/login.keychain-db -P <임의> -T /usr/bin/codesign` → `security add-trusted-cert -d -r trustRoot -p codeSign -k ~/Library/Keychains/login.keychain-db cert.pem`
  4. `key.pem`·`cert.p12`를 지우고, `security find-identity -v -p codesigning`에 이름이 보이는지 확인.
  - 확인: `codesign -d -r- "Claude Office.app"`의 designated requirement가 빌드마다 같아야 합니다. 서명 훅은 `app/forge.config.mts`(`LOCAL_SIGN_IDENTITY`).

## 5. 기록 남기기
- 버전을 올린 이유(어떤 기능 때문에 마이너/패치인지)를 최종 보고에 한 줄로 적습니다.
- 태그는 `vX.Y.Z` 형식(예: `v0.11.1`)이고, 앱 업데이트 알림이 이 태그를 현재 버전과 비교합니다. 올리는 방법은 6번을 봅니다.

## 6. 릴리즈 (GitHub Release)
업데이트 알림은 서버 없이 GitHub Release를 읽습니다. 저장소는 `EngChooN/claude-office`(origin)이고, 앱은 `https://api.github.com/repos/EngChooN/claude-office/releases/latest`를 인증 없이 조회합니다.

- **태그:** `vX.Y.Z` (예: `v0.11.1`). 앱은 `tag_name`을 현재 앱 버전과 semver로 비교해 더 높을 때만 알립니다. 태그 번호 = `app/package.json`의 `version` = 안드로이드 `versionName`.
- **고정 파일 이름 3개:** 앱이 이름으로 파일을 찾으므로 빌드 산출물 이름 그대로 올리지 말고, 복사해서 아래 이름으로 바꿔 올립니다.

| 플랫폼 | Release에 올릴 이름 | 빌드 산출물 (복사해서 이름 변경) |
|---|---|---|
| Mac (Apple Silicon) | `Claude-Office-mac-arm64.dmg` | `app/out/make/dmg/arm64/Claude Office.dmg` |
| Windows (x64) | `Claude-Office-win-x64.zip` | `app/out/make/zip/win32/x64/*.zip` |
| Android | `Claude-Office-android.apk` | `android/app/build/outputs/apk/release/app-release.apk` |

- **Release 설명은 4개 언어로 쓴다**(한·영·일·중). `docs/release-notes/X.Y.Z.md` 한 파일에 `## 한국어` / `## English` / `## 日本語` / `## 中文` 섹션으로 두고, 내용은 같은 버전의 `CHANGELOG*.md` 항목을 따른다. 이 파일을 그대로 notes로 넣는다. 앱(PC·휴대폰)은 화면 언어에 맞는 섹션만 골라 안내 창에 요약해 보여 준다(없으면 English → 한국어).
- **gh 도구:** PATH에 없습니다. `~/.local/gh-cli/gh_2.103.2_macOS_arm64/bin/gh`를 씁니다(버전이 바뀌면 이 경로를 확인). 처음 한 번 `gh auth status`로 로그인을 확인합니다.
- **명령 예:**
  ```
  ~/.local/gh-cli/gh_2.103.2_macOS_arm64/bin/gh release create vX.Y.Z \
    --repo EngChooN/claude-office --title "Claude Office X.Y.Z" \
    --notes-file <notes.md> \
    <Claude-Office-mac-arm64.dmg> <Claude-Office-win-x64.zip> <Claude-Office-android.apk>
  ```
- **순서:** 번호 결정 → 3번 항목 수정 → 4번 빌드·검증 → 파일 3개 복사·이름 변경(저장소 밖 임시 폴더) → notes 파일 작성 → `gh release create`.
- **주의:** `gh release create`는 공개 작업이라(태그 생성·파일 공개) 실행 전에 리드 확인을 받습니다. 잘못 올렸으면 `gh release delete vX.Y.Z --cleanup-tag`로 되돌립니다.
