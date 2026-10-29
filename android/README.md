# AI Office 원격 (안드로이드 앱)

PC에서 도는 AI Office를 밖에서 휴대폰으로 확인하고 조종하는 **원격 컴패니언** 앱입니다. 상태 보기 · 결재·질문·기획 확인 · 지시 보내기만 합니다. 직원 실행·파일 접근·설정 변경은 PC에서만 합니다.

| 항목 | 값 |
|---|---|
| 앱 버전 | **0.15.1** (`versionCode` 29) — PC 앱과 같은 번호. 0.15.1(`versionCode` 29): 사진 첨부 때 실시간 연결(EventStream) 오류로 앱이 꺼지던 문제 수정 · 0.15.0(`versionCode` 28): PC 0.15.0과 번호 맞춤(폰은 PC에서 고른 색 테마·화면 모드를 따라 보여 주고 폰에서는 바꾸지 못함) · 0.14.4(`versionCode` 27): PC 0.14.4와 번호만 맞춤(폰 기능 변경 없음). 0.14.3(`versionCode` 26): PC 0.14.3과 번호 맞춤 · 0.14.2(`versionCode` 25): PC 0.14.2와 번호 맞춤 · 0.14.1(`versionCode` 24): PC 0.14.1과 번호 맞춤 · 0.14.0(`versionCode` 23): PC 0.14.0과 번호 맞춤 · 0.13.2(`versionCode` 22): PC 0.13.2와 번호 맞춤(같은 번호로 다시 빌드) · 0.13.1(`versionCode` 20): PC 0.13.1과 번호 맞춤 · 0.13.0(`versionCode` 18): PC 0.13.0과 번호 맞춤 · 0.12.2(`versionCode` 17): PC 0.12.2와 번호 맞춤 · 0.12.1(`versionCode` 16): PC 0.12.1과 번호 맞춤 · 0.12.0(`versionCode` 13): PC 0.12.0과 번호 맞춤 · 0.11.1(`versionCode` 12): PC 0.11.1과 번호 맞춤(미출시) · 0.11.0(`versionCode` 11): PC 0.10.2와 번호만 맞춤 · 0.10.1(`versionCode` 9: 대시보드 직원 카드 상태색·미니 뷰 비율 화면 반영, 8:  앱 아이콘을 PC 아이콘(픽셀아트 사무실 직원)으로 통일) · 이전 1.1.3: 최신 PC 화면(대화 새로 넘기기·급여 명세서 개편·직원 패널) · 1.1.2: 최신 PC 화면(비서·자동결재·직원 실시간 미니 뷰) · 1.1.1: 폴드·폰 키보드(화면이 `--ime`로 비킴, 셸은 WebView를 줄이지 않음) · 1.1.0: PC 화면 전체(원격 v2, WebView 셸) · 1.0.1: 같은 와이파이에서 QR `lan` 주소로 연결 (예전 번호 1.x는 0.10.1부터 PC 번호로 통일) |
| 짝이 되는 데스크톱 | **0.8.0 이상** (전체 기능은 **0.9.0 이상**, 비서·자동결재 화면은 **0.10.0 이상**) |
| 프로토콜 | **v1**, **v2** (`docs/specs/remote-protocol-v1.md`, `remote-protocol-v2.md`) · 화면 브리지: `docs/specs/android-bridge.md` |
| 패키지 | `com.claudeoffice.remote` |
| 지원 | Android 8.0(API 26) 이상, 네이티브 Kotlin(Jetpack Compose) |

## 서명 지문
릴리스 APK는 아래 키로 서명합니다. 설치 전에 받은 APK의 지문이 같은지 확인하세요(`apksigner verify --print-certs <APK>`).

```
CN=AI Office Remote, O=AI Office
SHA-256: 0d0c4c7953462e5850b9d0c4a5281dbab25db806a062cfc5e602f52e10818f76
```
- 이 지문은 공개해도 되는 값입니다(키 자체가 아닙니다).
- 지문이 다르면 **설치하지 마세요.** 같은 키로 서명한 APK만 업데이트로 설치됩니다.

## 서명 키 보관 (프로젝트 밖)
- 키 파일: `~/.claude-office-signing/claude-office-release.p12` (폴더 0700, 파일 0600). **프로젝트 폴더에는 키도 비밀번호도 두지 않습니다.**
- 설정 파일: `~/.claude-office-signing/keystore.properties` — 키 경로와 별칭만 들어 있고 비밀번호는 없습니다.
- 비밀번호: macOS 키체인(서비스 `claude-office-android-signing`, 계정 `claude-office-release`)에만 있습니다.
- **같은 키를 계속 씁니다.** 키를 잃으면 이미 설치된 앱을 업데이트로 덮을 수 없습니다. 이 PC 밖에 안전한 백업 한 부를 두세요(백업은 아직 만들지 않았습니다 — 기획서 D6).

## 빌드
PC 화면 모바일 빌드가 있으면 먼저 만듭니다(없으면 기존 네이티브 화면만 들어갑니다).
```bash
(cd app && npm run build:mobile)   # → app/dist-mobile/ — 안드로이드 빌드가 assets/web/ 으로 복사
cd android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export CLAUDE_OFFICE_STORE_PASSWORD="$(security find-generic-password -a claude-office-release -s claude-office-android-signing -w)"
./gradlew testDebugUnitTest assembleRelease
unset CLAUDE_OFFICE_STORE_PASSWORD
```
- 결과: `android/app/build/outputs/apk/release/app-release.apk`
- 서명 확인: `~/Library/Android/sdk/build-tools/34.0.0/apksigner verify --verbose --print-certs <APK>`
- 키체인 설정이 없으면 릴리스 APK는 서명 없이 나옵니다(`app/build.gradle.kts`).
- 버전 규칙(`app/build.gradle.kts`): **`versionName`은 PC `app/package.json`의 `version`과 같게**, **`versionCode`는 매 빌드 +1**(줄면 기존 앱 위에 업데이트가 안 됩니다).
- 앱 아이콘은 PC 아이콘 `app/build/icon.png`(32×32 픽셀아트)에서 만든 PNG입니다: 적응형 foreground `mipmap-*/ic_launcher_foreground.png`(108dp 캔버스, 1칸 2dp, 가운데 64dp에 그림·바깥은 벽을 이어 그림, nearest-neighbor 정수배), 구형 `ic_launcher.png`·`ic_launcher_round.png`, 테마 아이콘용 `drawable/ic_launcher_monochrome.xml`. 알림 아이콘 `ic_notification`은 단색 그대로입니다.

## 설치
1. APK를 폰으로 옮깁니다.
2. "출처를 알 수 없는 앱 설치"를 이 파일을 연 앱에 한해 허용합니다.
3. 설치 뒤 PC의 AI Office 설정 › 휴대폰 연결에서 QR을 만들어 앱으로 스캔합니다.

## 알아 둘 것
- 원격은 PC에서 **기본으로 꺼져** 있습니다. 켜면 PC의 포트가 인터넷 쪽으로 열립니다.
- 알림은 15분쯤마다 PC에 물어보는 방식이라 **수십 분 늦을 수 있습니다.** 푸시 알림(FCM)은 2단계입니다.
- 폰에서 하는 결재·지시는 PC에서 직접 하는 것과 같은 힘이 있습니다.
- 자세한 규칙: `docs/specs/android-mvp.md`(기획), `docs/specs/android-design.md`(화면), `docs/specs/android-qa.md`(검증), `docs/specs/android-real-device-checklist.md`(실기기 체크리스트).
