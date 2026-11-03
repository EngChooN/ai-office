// 피드백 오류 기록: 공개 이슈로 나가기 전 가리기(홈 경로·이름·이메일·토큰·키)와 본문 길이 자르기
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { ErrorLog, scrubErrorText } from '../src/main/errorLog.ts'
import { ERROR_LOG_HEADING, ERROR_LOG_MAX, ERROR_MESSAGE_MAX, fitIssueBody, formatErrorLog, type ErrorEntry } from '../src/shared/errorReport.ts'

const MAC = { home: '/Users/hong.gildong', names: ['hong.gildong', 'Gildongs-MacBook-Pro'] }
const WIN = { home: 'C:\\Users\\Gildong', names: ['Gildong', 'GILDONG-PC'] }

test('가리기: 홈 경로는 ~ 로, 경로 속 사용자 이름이 남지 않는다', () => {
  const s = scrubErrorText('Error: ENOENT open /Users/hong.gildong/work/secret-plan/notes.md\n    at read (/Users/hong.gildong/app/main.js:10:5)', MAC)
  assert.ok(!s.includes('hong.gildong'), s)
  assert.ok(!s.includes('/Users/'), s)
  assert.match(s, /notes\.md/) // 파일 이름은 남아 고칠 때 쓸 수 있다
})

test('가리기: 윈도우 홈 경로(\\·/ 둘 다, 대소문자 무관)와 컴퓨터 이름', () => {
  const s = scrubErrorText('failed at c:\\users\\gildong\\AppData\\x.js and C:/Users/Gildong/y.js on GILDONG-PC', WIN)
  assert.ok(!/gildong/i.test(s), s)
})

test('가리기: 이메일·글 속 사용자 이름', () => {
  const s = scrubErrorText('login failed for hong.gildong (hong.gildong@example.com) by joonyoung.cho@flitto.com', MAC)
  assert.ok(!s.includes('@example.com') && !s.includes('flitto.com') && !s.includes('hong.gildong'), s)
})

test('가리기: 토큰·API 키·인증 머리글·URL 비밀번호·키=값', () => {
  const secrets = [
    'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX',
    'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123',
    'AKIAABCDEFGHIJKLMNOP',
    'AIzaSyA1234567890abcdefghijklmnopqrstu',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
    'hunter2pass',
  ]
  const s = scrubErrorText(
    `401 ${secrets[0]} ${secrets[1]} ${secrets[2]} ${secrets[3]}\nAuthorization: Bearer ${secrets[4]}\npostgres://admin:${secrets[5]}@db.local/x\napi_key="plainvalue123" OPENAI_API_KEY=abc123def456`,
    MAC,
  )
  for (const v of [...secrets, 'plainvalue123', 'abc123def456']) assert.ok(!s.includes(v), `${v} 가 남음: ${s}`)
})

test('가리기: 홈 아래 폴더 이름(프로젝트·고객 이름)은 남기지 않고 파일 이름·줄 번호만 남긴다', () => {
  const s = scrubErrorText('    at run (/Users/hong.gildong/clients/acme-corp/app/index.js:123:5)', MAC)
  assert.ok(!s.includes('acme-corp') && !s.includes('clients'), s)
  assert.match(s, /index\.js:123:5/)
})

test('가리기: 이미 가린 글을 다시 가려도 그대로다 (파일에서 읽을 때 한 번 더 가린다)', () => {
  const raw = 'Error at /Users/hong.gildong/a/b.ts:1:2 for hong.gildong@example.com Authorization: Bearer abcdefghijklmnop sk-ABCDEFGHIJKLMNOPQRSTUV'
  const once = scrubErrorText(raw, MAC)
  assert.equal(scrubErrorText(once, MAC), once)
})

test('가리기: 짧은 이름(2자 이하)은 낱말을 망가뜨리지 않게 건드리지 않는다', () => {
  assert.equal(scrubErrorText('TypeError: x is not a function', { home: '/home/jo', names: ['jo'] }), 'TypeError: x is not a function')
})

test('가리기: 가린 뒤 한 건 길이 상한', () => {
  const s = scrubErrorText('a '.repeat(5000), MAC)
  assert.ok(s.length <= ERROR_MESSAGE_MAX + 1)
})

test('ErrorLog: 넣을 때 가리고, 최근 20건만, 같은 오류는 횟수로 묶고, 파일로 다시 읽는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'errlog-'))
  const file = path.join(dir, 'error-log.json')
  let now = 1
  const log = new ErrorLog(MAC, () => now++)
  log.open(file)
  const boom = new Error('boom at /Users/hong.gildong/x.ts token=abcdef123456')
  log.record('staff', boom)
  log.record('staff', boom)
  assert.equal(log.list().length, 1)
  assert.equal(log.list()[0].count, 2)
  for (let i = 0; i < 30; i++) log.record('main', `err ${i}`)
  assert.equal(log.list().length, ERROR_LOG_MAX)
  assert.equal(log.list()[0].message, 'err 29')
  const raw = fs.readFileSync(file, 'utf8')
  assert.ok(!raw.includes('hong.gildong') && !raw.includes('abcdef123456'))
  const again = new ErrorLog(MAC)
  again.open(file)
  assert.deepEqual(again.list(), log.list())
  fs.rmSync(dir, { recursive: true, force: true })
})

test('ErrorLog: 파일에 가려지지 않은 글이 있어도 읽을 때 다시 가린다, 깨진 파일은 빈 기록', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'errlog-'))
  const file = path.join(dir, 'error-log.json')
  fs.writeFileSync(file, JSON.stringify([{ at: 1, source: 'main', message: 'x /Users/hong.gildong/a.ts sk-ABCDEFGHIJKLMNOPQRSTUV', count: 1 }, { bad: true }]))
  const log = new ErrorLog(MAC)
  log.open(file)
  assert.equal(log.list().length, 1)
  assert.ok(!log.list()[0].message.includes('hong.gildong') && !log.list()[0].message.includes('sk-ABC'))
  fs.writeFileSync(file, '{not json')
  const broken = new ErrorLog(MAC)
  broken.open(file)
  assert.deepEqual(broken.list(), [])
  fs.rmSync(dir, { recursive: true, force: true })
})

const entry = (i: number, message = `error number ${i}`): ErrorEntry => ({ at: Date.UTC(2026, 10, 3, 0, 0, i), source: 'staff', message, count: 1 })

test('본문: 짧으면 오류 기록 절을 통째로 넣고 자르지 않는다', () => {
  const { body, isTruncated } = fitIssueBody('base', formatErrorLog([entry(1)]), 'NOTE')
  assert.equal(isTruncated, false)
  assert.ok(body.startsWith('base') && body.includes(ERROR_LOG_HEADING) && body.includes('error number 1') && !body.includes('NOTE'))
})

test('본문: 오류가 없으면 본문 그대로', () => {
  assert.deepEqual(fitIssueBody('base', formatErrorLog([]), 'NOTE'), { body: 'base', isTruncated: false })
})

test('본문: 길면 상한 안으로 자르고 잘렸다고 표시, 코드 블록은 닫힌다', () => {
  const log = formatErrorLog(Array.from({ length: 20 }, (_, i) => entry(i, 'x'.repeat(700))))
  const { body, isTruncated } = fitIssueBody('base text', log, 'NOTE', 6000)
  assert.equal(isTruncated, true)
  assert.ok(body.length <= 6000, String(body.length))
  assert.ok(body.endsWith('NOTE'))
  assert.equal(body.split('```').length - 1, 2)
  assert.ok(body.includes('…'))
})

test('본문: 오류 글 속 ``` 이 코드 블록을 깨지 않는다', () => {
  const { body } = fitIssueBody('base', formatErrorLog([entry(1, 'a ``` b')]), 'NOTE')
  assert.equal(body.split('```').length - 1, 2)
})

test('본문: 기본 글만으로 상한에 닿으면 기록 없이 안내만', () => {
  const { body, isTruncated } = fitIssueBody('b'.repeat(100), 'log', 'NOTE', 90)
  assert.equal(isTruncated, true)
  assert.ok(!body.includes(ERROR_LOG_HEADING) && body.endsWith('NOTE'))
})
