import { defineConfig } from 'vite'

// Agent SDK는 플랫폼별 claude 바이너리를 띄우므로 번들하지 않고 node_modules에서 require한다
export default defineConfig({
  build: {
    rollupOptions: { external: ['@anthropic-ai/claude-agent-sdk', 'zod'] },
  },
})
