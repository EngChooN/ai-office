import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 업데이트 소식이 저장소 루트의 CHANGELOG.md를 읽는다
  server: { fs: { allow: [path.resolve(import.meta.dirname, '..')] } },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@': path.resolve(import.meta.dirname, 'src/renderer'),
    },
  },
})
