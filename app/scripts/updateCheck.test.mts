// 업데이트 알림: 버전 비교·알림 여부·설치 파일 고르기·Release 응답 해석 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ASSET_NAMES, assetTargetFor, compareVersions, isNewerVersion, parseRelease, parseVersion, pickDownloadUrl, pickLanguageSection, shouldNotify, summarizeNotes } from '../src/shared/updateCheck.ts'

const sign = (n: number | null) => (n === null ? null : Math.sign(n))

test('compareVersions: semver 순서 (v 접두어·자릿수·미리보기)', () => {
  assert.equal(sign(compareVersions('v0.12.0', '0.11.0')), 1)
  assert.equal(sign(compareVersions('0.11.0', 'v0.11.0')), 0)
  assert.equal(sign(compareVersions('0.11.1', '0.11.0')), 1)
  assert.equal(sign(compareVersions('0.10.0', '0.9.9')), 1, '문자열 비교가 아니라 숫자 비교')
  assert.equal(sign(compareVersions('1.0.0', '0.99.99')), 1)
  assert.equal(sign(compareVersions('0.12.0', '0.12.0-beta.1')), 1, '정식이 미리보기보다 높다')
  assert.equal(sign(compareVersions('0.12.0-beta.2', '0.12.0-beta.10')), -1, '미리보기 숫자는 숫자로')
  assert.equal(sign(compareVersions('0.12.0-alpha', '0.12.0-beta')), -1)
  assert.equal(sign(compareVersions('0.12.0-beta', '0.12.0-beta.1')), -1, '항목이 더 많은 쪽이 높다')
  assert.equal(sign(compareVersions('0.12.0+build.5', '0.12.0')), 0, '빌드 정보는 무시')
})

test('parseVersion / compareVersions: 형식이 다르면 null', () => {
  for (const bad of ['', 'latest', '0.12', '0.12.0.1', 'v.0.12.0', '01.x.0']) {
    assert.equal(parseVersion(bad), null, bad)
    assert.equal(compareVersions(bad, '0.11.0'), null, bad)
  }
})

test('isNewerVersion: 더 높을 때만 true, 형식이 다르면 알리지 않는다', () => {
  assert.equal(isNewerVersion('v0.12.0', '0.11.0'), true)
  assert.equal(isNewerVersion('0.11.0', '0.11.0'), false)
  assert.equal(isNewerVersion('0.10.5', '0.11.0'), false)
  assert.equal(isNewerVersion('nightly', '0.11.0'), false)
})

test('shouldNotify: 건너뛴 버전은 다시 띄우지 않고, 더 새 버전은 다시 알린다', () => {
  assert.equal(shouldNotify('0.12.0', '0.11.0', null), true)
  assert.equal(shouldNotify('0.12.0', '0.11.0', '0.12.0'), false)
  assert.equal(shouldNotify('0.12.0', '0.11.0', 'v0.12.0'), false, 'v 접두어가 달라도 같은 버전')
  assert.equal(shouldNotify('0.12.1', '0.11.0', '0.12.0'), true)
  assert.equal(shouldNotify('0.11.0', '0.11.0', null), false)
})

test('assetTargetFor / pickDownloadUrl: 플랫폼별 고정 파일 이름으로 찾는다', () => {
  assert.equal(assetTargetFor('darwin', 'arm64'), 'mac')
  assert.equal(assetTargetFor('darwin', 'x64'), null, 'dmg는 Apple Silicon 전용')
  assert.equal(assetTargetFor('win32', 'x64'), 'win')
  assert.equal(assetTargetFor('android', 'arm64'), 'android')
  assert.equal(assetTargetFor('linux', 'x64'), null)

  const url = (name: string) => `https://github.com/EngChooN/claude-office/releases/download/v0.12.0/${name}`
  const assets = Object.values(ASSET_NAMES).map((name) => ({ name, browser_download_url: url(name) }))
  assert.equal(pickDownloadUrl(assets, 'mac'), url(ASSET_NAMES.mac))
  assert.equal(pickDownloadUrl(assets, 'win'), url(ASSET_NAMES.win))
  assert.equal(pickDownloadUrl(assets, null), null)
  assert.equal(pickDownloadUrl([{ name: ASSET_NAMES.mac, browser_download_url: 'https://evil.example/x.dmg' }], 'mac'), null, 'GitHub 주소만')
  assert.equal(pickDownloadUrl(assets.slice(1), 'mac'), null, '파일이 없으면 null')
  assert.equal(pickDownloadUrl('nope', 'mac'), null)
})

test('parseRelease: 응답 해석 · 초안/미리보기/이상한 응답은 null', () => {
  const json = {
    tag_name: 'v0.12.0',
    html_url: 'https://github.com/EngChooN/claude-office/releases/tag/v0.12.0',
    body: '## 새 기능\n- **업데이트 알림**\n- [링크](https://x.y)',
    assets: [{ name: ASSET_NAMES.win, browser_download_url: 'https://github.com/a/b/releases/download/v0.12.0/Claude-Office-win-x64.zip' }],
  }
  const r = parseRelease(json, 'win')
  assert.deepEqual(r, {
    version: '0.12.0',
    body: json.body,
    downloadUrl: 'https://github.com/a/b/releases/download/v0.12.0/Claude-Office-win-x64.zip',
    pageUrl: json.html_url,
  })
  assert.equal(parseRelease(json, 'mac')?.downloadUrl, null, '내 파일이 없으면 Release 페이지로 대신')
  assert.equal(parseRelease({ ...json, draft: true }, 'win'), null)
  assert.equal(parseRelease({ ...json, prerelease: true }, 'win'), null)
  assert.equal(parseRelease({ ...json, tag_name: 'latest' }, 'win'), null)
  assert.equal(parseRelease({ ...json, html_url: 'https://evil.example' }, 'win'), null)
  assert.equal(parseRelease({ message: 'API rate limit exceeded' }, 'win'), null)
  assert.equal(parseRelease(null, 'win'), null)
  assert.equal(parseRelease({ ...json, body: null }, 'win')?.body, '', '본문이 없으면 빈 글')
})

test('summarizeNotes: 앞부분만 남기고 줄인 표시', () => {
  assert.equal(summarizeNotes(undefined, 'ko'), '')
  assert.equal(summarizeNotes('\r\n\r\n첫 줄\r\n\r\n\r\n둘째 줄\n\n', 'ko'), '첫 줄\n\n둘째 줄')
  assert.equal(summarizeNotes('<!-- 숨김 -->![img](a.png)보임', 'ko'), '보임', 'ko')
  const long = Array.from({ length: 20 }, (_, i) => `- 항목 ${i}`).join('\n')
  const s = summarizeNotes(long, 'ko', 3)
  assert.equal(s, '• 항목 0\n• 항목 1\n• 항목 2…')
  assert.ok(summarizeNotes('가'.repeat(1000), 'ko', 8, 100).length <= 101)
})

// docs/release-notes 형식: 언어마다 '## 한국어' · '## English' · '## 日本語' · '## 中文' 섹션
const MULTI = '# Claude Office 0.12.0\r\n\r\n## 한국어\r\n\r\n### 새 기능\r\n- 한국어 설명\r\n\r\n## English\r\n\r\n### New features\r\n- **English** note\r\n\r\n## 日本語\r\n\r\n### 新機能\r\n- 日本語の説明\r\n\r\n## 中文\r\n\r\n### 新功能\r\n- 中文说明\r\n'

test('summarizeNotes: 앱 언어 섹션만 요약', () => {
  assert.equal(summarizeNotes(MULTI, 'ko'), '새 기능\n• 한국어 설명')
  assert.equal(summarizeNotes(MULTI, 'en'), 'New features\n• English note')
  assert.equal(summarizeNotes(MULTI, 'ja'), '新機能\n• 日本語の説明')
  assert.equal(summarizeNotes(MULTI, 'zh'), '新功能\n• 中文说明')
})

test('pickLanguageSection: 없으면 English → 한국어, 언어 머리말이 없으면 전체', () => {
  const koEn = '## 한국어\n가\n## English\nA'
  assert.equal(pickLanguageSection(koEn, 'ja'), 'A', '일본어가 없으면 영어')
  assert.equal(pickLanguageSection('## 한국어\n가\n## 中文\n中', 'ja'), '가', '영어도 없으면 한국어')
  assert.equal(pickLanguageSection('## 日本語\n日', 'zh'), '日', '영어·한국어도 없으면 처음 섹션')
  const old = '## 새 기능\n- 옛 본문'
  assert.equal(pickLanguageSection(old, 'en'), old, '언어 머리말이 없는 옛 본문은 그대로')
  assert.equal(summarizeNotes(old, 'en'), '새 기능\n• 옛 본문')
})
