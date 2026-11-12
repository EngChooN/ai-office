import { defineConfig, mergeConfig } from 'vite'
import desktop from './vite.renderer.config.mts'

// 원격 창(다른 PC 화면)용 화면 묶음: 데스크톱 renderer 설정에 덧붙인다 (데스크톱 설정·index.html은 그대로)
// forge renderer 'remote_window'로 빌드돼 .vite/renderer/remote_window/remote.html 이 된다 (main/workspace가 연다)
export default defineConfig(
  mergeConfig(
    desktop,
    defineConfig({
      build: { rollupOptions: { input: { remote: 'remote.html' } } },
      // QA 실행(AI_OFFICE_VITE_PORT)은 데스크톱 화면 포트를 고정한다 — 원격 창 화면은 그다음 포트로 (같은 포트를 잡아 실패하지 않게)
      ...(process.env.AI_OFFICE_VITE_PORT ? { server: { port: Number(process.env.AI_OFFICE_VITE_PORT) + 1 } } : {}),
      define: { __OFFICE_SHELL__: JSON.stringify('remote') },
    }),
  ),
)
