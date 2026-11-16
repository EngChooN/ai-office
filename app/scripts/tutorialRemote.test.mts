// 휴대폰·원격 화면에서는 연습(튜토리얼)을 막고 처음 힌트·? 도움말만 남긴다 — npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { remoteTutorialSnapshot, type TutorialSnapshot } from '../src/shared/tutorial.ts'
import { V2_METHODS } from '../src/main/remote/v2.ts'
import { DICT as dict } from '../src/shared/i18n/dict/index.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const running: TutorialSnapshot = {
  scenario: 'task',
  step: 'p2',
  stepAt: 1,
  hint: 'tutorial.task.p2.hint' as TutorialSnapshot['hint'],
  note: null,
  until: 'act' as TutorialSnapshot['until'],
  view: null,
  waitMs: null,
  completed: ['meeting'],
  reward: 0,
  hasPractice: true,
  cast: { labId: 'l', teamId: 't', leadId: 'a', designerId: 'b', devId: 'c' },
  taskId: 'task1',
  meetingId: null,
  chatRoom: '',
}

test('원격 스냅샷: PC에서 진행 중인 연습 단계는 빼고, 해 본 기록·연습 회사 여부는 남긴다', () => {
  const r = remoteTutorialSnapshot(running)!
  assert.equal(r.scenario, null)
  assert.equal(r.step, null)
  assert.equal(r.hint, null)
  assert.equal(r.taskId, null)
  assert.equal(r.cast, null)
  assert.equal(r.chatRoom, null)
  assert.deepEqual(r.completed, ['meeting'])
  assert.equal(r.hasPractice, true)
  // 축하 단계(done)도 뜨지 않는다
  assert.equal(remoteTutorialSnapshot({ ...running, step: 'done', reward: 3000 })!.scenario, null)
  // 연습 중이 아니면 그대로
  const idle = { ...running, scenario: null, step: null }
  assert.equal(remoteTutorialSnapshot(idle), idle)
  assert.equal(remoteTutorialSnapshot(undefined), undefined)
})

test('원격 화면: 스냅샷을 받을 때 IS_REMOTE_SCREEN이면 연습 단계를 뺀다', () => {
  assert.match(src('src/renderer/store.ts'), /IS_REMOTE_SCREEN \? remoteTutorialSnapshot\(snap\.tutorial\) : snap\.tutorial/)
})

test('원격 프로토콜: 연습 시작·진행·정리는 PC 전용(pc_only)', () => {
  for (const m of ['tutorialStart', 'tutorialAct', 'tutorialCleanup'] as const) {
    assert.equal(V2_METHODS[m].cls, 'P', m)
    assert.equal(V2_METHODS[m].alternative, 'open_on_pc', m)
  }
})

test('원격 화면: 처음 안내·연습 입구는 숨기고 둘러보기·힌트 다시 보기는 남긴다', () => {
  assert.match(src('src/renderer/features/Onboarding.tsx'), /step === 'practice' \|\| IS_REMOTE_SCREEN\) return null/)
  const help = src('src/renderer/features/HelpMenu.tsx')
  assert.match(help, /IS_REMOTE_SCREEN && <p[^>]*>\{t\('helpMenu\.practicePcOnly'\)\}/)
  assert.match(help, /!IS_REMOTE_SCREEN && <div className=\{heading\}>\{t\('helpMenu\.practice'\)\}/)
  assert.match(help, /!IS_REMOTE_SCREEN && \(\['task', 'meeting'\] as const\)\.map/)
  assert.match(help, /!IS_REMOTE_SCREEN && \(\s*<button[^>]*onClick=\{run\(\(\) => void window\.office\.updateSettings\(\{ isOnboarded: false \}\)\)\}/)
  assert.match(help, /requestTour\(\)/)
  assert.match(help, /resetHints/)
  const settings = src('src/renderer/features/SettingsPage.tsx')
  assert.match(settings, /!IS_REMOTE_SCREEN && \(\s*<Button[^>]*onClick=\{requestPractice\}/)
  assert.match(settings, /!IS_REMOTE_SCREEN && \(\s*<Button[^>]*onClick=\{\(\) => update\(\{ isOnboarded: false \}\)\}/)
  assert.match(settings, /hasPractice && !IS_REMOTE_SCREEN/)
  assert.match(src('src/renderer/App.tsx'), /!IS_REMOTE_SCREEN && \(\s*<Button[^\n]*onClick=\{\(\) => void window\.office\.updateSettings\(\{ isOnboarded: false \}\)\}/)
})

test('원격 화면: 회의실 힌트는 연습 안내 없는 문구 (4개 언어)', () => {
  assert.match(src('src/renderer/features/FirstHint.tsx'), /meeting: IS_REMOTE_SCREEN \? 'firstHint\.meeting\.remote' : 'firstHint\.meeting'/)
  for (const key of ['firstHint.meeting.remote', 'helpMenu.practicePcOnly'] as const) {
    const entry = (dict as Record<string, Record<string, string>>)[key]
    for (const lang of ['ko', 'en', 'ja', 'zh']) assert.ok(entry?.[lang], `${key}.${lang}`)
  }
  assert.doesNotMatch((dict as Record<string, Record<string, string>>)['firstHint.meeting.remote'].ko, /\?/)
})
