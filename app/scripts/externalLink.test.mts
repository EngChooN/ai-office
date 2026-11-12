import { test } from 'node:test'
import assert from 'node:assert/strict'
import { externalUrl } from '../src/shared/externalLink.ts'

test('http·https 주소는 브라우저로 연다 (예전엔 https만 열려 http://localhost 링크가 아무 반응이 없었다)', () => {
  assert.equal(externalUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1')
  assert.equal(externalUrl('http://localhost:5173/'), 'http://localhost:5173/')
  assert.equal(externalUrl('HTTP://Example.com'), 'http://example.com/')
})

test('그 밖의 스킴·깨진 주소는 열지 않는다', () => {
  for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'office-file://file/x', 'mailto:a@b.c', 'vscode://x', 'http://', 'notaurl', '', '#view=inbox'])
    assert.equal(externalUrl(u), null, u)
})
