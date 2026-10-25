// 미리보기 장치: 앱 renderer를 가짜 window.office로 브라우저에서 띄운다 (앱 소스는 건드리지 않음)
import { mergeConfig } from '/Users/pc-2311001/flitto/poc/claude-office/app/node_modules/vite/dist/node/index.js'
import base from '/Users/pc-2311001/flitto/poc/claude-office/app/vite.renderer.config.mts'

const HARNESS = '/Users/pc-2311001/claude-office-mockups/pc-layout/harness'
const html = `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Claude Office 미리보기</title></head><body><div id="root"></div><script type="module" src="/@fs${HARNESS}/main.ts"></script></body></html>`

const merged = mergeConfig({ ...base, plugins: [] }, {
  root: '/Users/pc-2311001/flitto/poc/claude-office/app',
  server: { port: 5199, strictPort: true, fs: { allow: ['/Users/pc-2311001/flitto/poc/claude-office', '/Users/pc-2311001/claude-office-mockups/pc-layout'] } },
  plugins: [{
    name: 'harness-tailwind-source',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('src/renderer/index.css')) return code + `\n@source "${HARNESS}";\n`
    },
  }, {
    name: 'harness-html',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/harness.html')) return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(await server.transformIndexHtml(req.url, html))
      })
    },
  }],
})
merged.plugins = [merged.plugins[0], ...(base.plugins ?? []), ...merged.plugins.slice(1)]
export default merged
