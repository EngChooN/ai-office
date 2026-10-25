import { defineConfig, mergeConfig } from 'vite'
import desktop from './vite.renderer.config.mts'

// 휴대폰 앱(안드로이드 WebView)용 화면 묶음: 데스크톱 renderer 설정에 덧붙인다 (데스크톱 설정·index.html은 그대로)
// pnpm build:mobile → dist-mobile/ (안드로이드 빌드가 APK의 assets/web/으로 복사)
// pnpm build:mobile:preview → dist-mobile-preview/ (가짜 셸로 브라우저 미리보기·캡처용, 앱에는 넣지 않는다)
export default defineConfig(({ mode }) => {
  const isPreview = mode === 'preview'
  return mergeConfig(
    desktop,
    defineConfig({
      // 자산을 https://appassets.androidplatform.net/app/ 아래에서 상대 경로로 읽는다
      base: './',
      build: {
        outDir: isPreview ? 'dist-mobile-preview' : 'dist-mobile',
        emptyOutDir: true,
        sourcemap: false,
        // Android System WebView (minSdk 26도 Play로 최신 WebView를 받는다)
        target: 'chrome100',
        rollupOptions: { input: isPreview ? { 'mobile-preview': 'mobile-preview.html' } : { mobile: 'mobile.html' } },
      },
      define: {
        __OFFICE_SHELL__: JSON.stringify('mobile'),
        // 첨부 그림은 셸이 가로채는 같은 출처 경로로 (토큰은 주소·화면에 나오지 않는다)
        __OFFICE_FILE_BASE__: JSON.stringify('https://appassets.androidplatform.net/office-file/'),
      },
    }),
  )
})
