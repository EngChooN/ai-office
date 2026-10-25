import { defineConfig, mergeConfig } from 'vite'
import desktop from './vite.renderer.config.mts'

// 아이소메트릭 칸 배치 시제품 미리보기 (앱과 분리 — 앱 빌드에는 들어가지 않는다)
// pnpm preview:iso → dist-iso-preview/ 를 http://localhost:5301/iso-preview.html 로
export default defineConfig(() =>
  mergeConfig(
    desktop,
    defineConfig({
      base: './',
      build: { outDir: 'dist-iso-preview', emptyOutDir: true, sourcemap: false, rollupOptions: { input: { 'iso-preview': 'iso-preview.html' } } },
    }),
  ),
)
