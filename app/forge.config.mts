import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
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

/** 맥 서명에 쓸 로그인 키체인의 자체 서명 인증서 이름 (만드는 법: CONTEXT.md 빌드 절).
 * 같은 인증서로 서명하면 빌드를 바꿔도 designated requirement가 같아서, 맥이 권한(화면 기록·손쉬운 사용)을 다시 묻지 않는다. */
const LOCAL_SIGN_IDENTITY = 'Claude Office Local Signing'

/** 인증서가 있으면 그 이름, 없으면 ad-hoc('-')로 서명한다 (인증서 없는 환경 fallback) */
const macSignIdentity = (): string => {
  const list = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
  return list.includes(`"${LOCAL_SIGN_IDENTITY}"`) ? LOCAL_SIGN_IDENTITY : '-'
}

const MACHO_MAGIC = [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca]

/** 하위 실행 파일을 다시 서명할 때 원래 엔타이틀먼트(JIT 등)와 hardened runtime을 보존한다.
 * 빠지면 bun 기반 claude 바이너리가 JIT 메모리 할당에서 막힐 수 있다. 원본 서명에 엔타이틀먼트가 없으면 빈 값을 돌려준다. */
const signNested = (bin: string, identity: string): void => {
  const xml = execFileSync('codesign', ['-d', '--entitlements', '-', '--xml', bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-ent-'))
  try {
    const args = ['--force', '--options', 'runtime', '--sign', identity]
    if (xml.includes('<key>')) {
      const plist = path.join(dir, 'ent.plist')
      fs.writeFileSync(plist, xml)
      args.push('--entitlements', plist)
    }
    execFileSync('codesign', [...args, bin], { stdio: 'inherit' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** 폴더 아래의 Mach-O 실행 파일(심볼릭 링크 제외). --deep 서명은 번들 밖의 단독 실행 파일을 건너뛰므로 따로 찾는다 */
const machOFiles = (dir: string): string[] => {
  const found: string[] = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) found.push(...machOFiles(full))
    else if (ent.isFile() && fs.statSync(full).size >= 4) {
      const fd = fs.openSync(full, 'r')
      const head = Buffer.alloc(4)
      fs.readSync(fd, head, 0, 4, 0)
      fs.closeSync(fd)
      if (MACHO_MAGIC.includes(head.readUInt32BE(0))) found.push(full)
    }
  }
  return found
}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'AI Office',
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
    // 패키징 중 Info.plist·퓨즈가 바뀌어 처음 서명이 깨지므로, 마지막에 앱 전체를 다시 묶어 서명한다.
    // 깨진 서명은 내려받은 사람 맥에서 "손상되었기 때문에 열 수 없습니다"로 막힌다.
    // 하위 실행 파일(claude-agent-sdk 바이너리 등)은 먼저 같은 인증서로 서명하고, 그다음 앱 전체를 --deep으로 묶는다.
    postPackage: async (_config, result) => {
      if (result.platform !== 'darwin') return
      const identity = macSignIdentity()
      console.log(`[sign] identity: ${identity === '-' ? 'ad-hoc (인증서 없음)' : identity}`)
      for (const dir of result.outputPaths) {
        for (const entry of fs.readdirSync(dir).filter((f) => f.endsWith('.app'))) {
          const app = path.join(dir, entry)
          for (const bin of machOFiles(path.join(app, 'Contents', 'Resources'))) {
            signNested(bin, identity)
          }
          execFileSync('codesign', ['--force', '--deep', '--sign', identity, app], { stdio: 'inherit' })
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
  makers: [new MakerDMG({ name: 'AI Office', format: 'ULFO', icon: 'build/icon.icns' }), new MakerZIP({}, ['darwin', 'win32'])],
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
