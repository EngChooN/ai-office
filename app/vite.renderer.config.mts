import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 업데이트 소식이 저장소 루트의 CHANGELOG.md를 읽는다
  // QA 실행 스크립트(scripts/qa-start.sh)가 AI_OFFICE_VITE_PORT로 직원마다 다른 포트를 준다 (없으면 vite 기본 5173)
  server: {
    fs: { allow: [path.resolve(import.meta.dirname, '..')] },
    ...(process.env.AI_OFFICE_VITE_PORT
      ? { host: '127.0.0.1', port: Number(process.env.AI_OFFICE_VITE_PORT), strictPort: true }
      : {}),
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@': path.resolve(import.meta.dirname, 'src/renderer'),
    },
  },
})
