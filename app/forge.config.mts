import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

/** Vite가 번들하지 않고 남겨 둔(main external) 패키지 — 설치본 node_modules에 직접 복사한다.
 * claude 실행 파일 패키지는 빌드하는 PC가 아니라 만드는 설치본의 OS·CPU 것을 넣는다 (맥에서 윈도우용을 만들 때 win32-x64) */
const runtimeModules = (platform: string, arch: string) => ['@anthropic-ai/claude-agent-sdk', `@anthropic-ai/claude-agent-sdk-${platform}-${arch}`, 'zod']

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Claude Office',
    executableName: 'claude-office',
    appBundleId: 'com.joonyoung.claude-office',
    // 확장자는 OS마다 붙는다 (맥 icon.icns · 윈도우 icon.ico)
    icon: 'build/icon',
    // 메뉴바(맥: 흑백 템플릿)·알림 영역(윈도우: 컬러 앱 아이콘) 아이콘은 Resources 폴더에 그대로 둔다
    // 비서가 사용법 근거로 읽는 문서(SPEC·업데이트 소식)도 함께 넣는다 (main/secretary.ts guidePath)
    extraResource: ['build/trayTemplate.png', 'build/trayTemplate@2x.png', 'build/icon.png', '../SPEC.md', '../CHANGELOG.md'],
    // claude 실행 파일은 asar 안에서 실행할 수 없어 풀어 둔다
    asar: { unpack: '**/node_modules/@anthropic-ai/**' },
  },
  rebuildConfig: {},
  hooks: {
    // 패키징 중 Info.plist·퓨즈가 바뀌어 처음 서명이 깨지므로, 마지막에 앱 전체를 임시(ad-hoc) 서명으로 다시 묶는다.
    // 깨진 서명은 내려받은 사람 맥에서 "손상되었기 때문에 열 수 없습니다"로 막힌다.
    postPackage: async (_config, result) => {
      if (result.platform !== 'darwin') return
      for (const dir of result.outputPaths) {
        for (const entry of fs.readdirSync(dir).filter((f) => f.endsWith('.app'))) {
          const app = path.join(dir, entry)
          execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
          execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
        }
      }
    },
    packageAfterPrune: async (_config, buildPath, _electronVersion, platform, arch) => {
      for (const name of runtimeModules(platform, arch)) {
        const from = path.resolve(import.meta.dirname, 'node_modules', name)
        fs.cpSync(from, path.join(buildPath, 'node_modules', name), { recursive: true, dereference: true })
      }
    },
  },
  // 윈도우는 설치 없이 풀어서 실행하는 zip (설치형 Squirrel·서명은 확인 후 추가)
  makers: [new MakerDMG({ name: 'Claude Office', format: 'ULFO', icon: 'build/icon.icns' }), new MakerZIP({}, ['darwin', 'win32'])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.mts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}

export default config
