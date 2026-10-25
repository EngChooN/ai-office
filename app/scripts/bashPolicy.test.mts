// 장비 "읽기 명령 자율"·"위험 명령 금지" 판단 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findRiskyCommand, isReadOnlyCommand } from '../src/shared/bashPolicy.ts'

test('읽기 명령: 단독·파이프·&& 로 이은 읽기는 허용', () => {
  for (const c of ['ls -la', 'git status', 'git --no-pager log --oneline -5', 'git diff HEAD~1', 'cat a.txt | grep foo | wc -l', 'pwd && ls', 'rg TODO src', 'find . -name "*.ts"'])
    assert.equal(isReadOnlyCommand(c), true, c)
})

test('읽기 명령: 쓰기·실행이 섞이면 결재', () => {
  for (const c of [
    '',
    'npm install',
    'ls && rm a',
    'cat a > b',
    'echo hi >> log',
    'ls $(rm -rf x)',
    'ls `whoami`',
    'sleep 1 & ls',
    'find . -delete',
    'find . -exec rm {} \\;',
    'git push',
    'git branch foo',
    'git diff --output=x',
    'ls\nrm a',
  ])
    assert.equal(isReadOnlyCommand(c), false, c)
})

test('위험 명령: 단독이든 이어 붙였든 찾아낸다', () => {
  assert.equal(findRiskyCommand('rm -rf dist'), 'rm -r/-f')
  assert.equal(findRiskyCommand('cd x && rm -fr y'), 'rm -r/-f')
  assert.equal(findRiskyCommand('rm --recursive y'), 'rm -r/-f')
  assert.equal(findRiskyCommand('sudo ls'), 'sudo')
  assert.equal(findRiskyCommand('git push --force origin main'), 'git push --force')
  assert.equal(findRiskyCommand('git push -f'), 'git push --force')
  assert.equal(findRiskyCommand('git push origin +main'), 'git push --force')
  assert.equal(findRiskyCommand('git reset --hard HEAD~1'), 'git reset --hard')
  assert.equal(findRiskyCommand('git clean -fd'), 'git clean -f')
  assert.equal(findRiskyCommand('git branch -D feat'), 'git branch -D')
  assert.equal(findRiskyCommand('dd if=/dev/zero of=/dev/disk2'), 'dd of=')
  // git 전역 옵션(-C·-c·--no-pager)을 건너뛰고 하위 명령으로 본다 (H1 — 전역 옵션에 뚫리지 않음)
  assert.equal(findRiskyCommand('git -C r reset --hard HEAD~3'), 'git reset --hard')
  assert.equal(findRiskyCommand('git -C /repo push --force'), 'git push --force')
  assert.equal(findRiskyCommand('git -c user.name=x push -f'), 'git push --force')
  assert.equal(findRiskyCommand('/usr/bin/git --no-pager clean -fd'), 'git clean -f')
  assert.equal(findRiskyCommand('"sudo" ls'), 'sudo')
  assert.equal(findRiskyCommand("git -C . reset '--hard'"), 'git reset --hard')
})

test('위험 명령: 평범한 명령은 통과', () => {
  for (const c of ['rm a.txt', 'git push origin main', 'git reset HEAD a.ts', 'git branch -d merged', 'npm run build', 'grep -rf patterns.txt .', 'git commit -m "force push 금지"'])
    assert.equal(findRiskyCommand(c), null, c)
})

test('읽기 명령(A6): 쓰기·실행 옵션이 섞인 rg·tree·date는 거른다', () => {
  for (const c of ['rg --pre sh TODO .', 'rg --pre-glob "*.gz" x .', 'tree -o out.txt', 'tree -O out.txt src', 'date -s "2020-01-01"', 'date --set "now"']) assert.equal(isReadOnlyCommand(c), false, c)
  // 평범한 rg·tree·date 는 그대로 읽기
  for (const c of ['rg TODO src', 'rg --pretty TODO', 'tree -L 2', 'date', 'date +%s']) assert.equal(isReadOnlyCommand(c), true, c)
})
