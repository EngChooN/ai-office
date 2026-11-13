// 민감한 글 가리기 (main/peer/redact.ts) — 오류 기록(피드백에 붙임)이 쓴다. 1.3.1까지는 다른 PC로 나가는 글에도 썼다
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { redactPeerDeep, redactPeerText } from '../src/main/peer/redact.ts'

test('가리기: 절대 경로는 이름만, 토큰·비밀번호 모양은 가린다 (일반 문장은 그대로)', () => {
  const out = redactPeerText('빌드 끝: /Users/joonyoung/secret-proj/dist/app.js 와 ~/.ssh/id_rsa 를 봤어요. token=abcd1234efgh, Bearer abcdefghijklmnop, sk-abcdefghijklmnopqrstuvwx, C:\\Users\\kim\\a.txt')
  assert.equal(out.includes('/Users/joonyoung'), false)
  assert.equal(out.includes('abcd1234efgh'), false)
  assert.equal(out.includes('abcdefghijklmnop'), false)
  assert.equal(out.includes('sk-abcdef'), false)
  assert.equal(out.includes('C:\\Users'), false)
  assert.match(out, /…\/app\.js/)
  assert.equal(redactPeerText('src/main/office.ts 를 고쳤어요. 테스트 960개 통과'), 'src/main/office.ts 를 고쳤어요. 테스트 960개 통과')
  assert.equal(redactPeerText('postgres://admin:hunter22@db.local/x').includes('hunter22'), false)
  // 4차 P2: 열거 밖 절대 경로·따옴표 안 공백 비밀값
  assert.equal(redactPeerText('결과: /data/internal/report.txt 참고'), '결과: …/report.txt 참고')
  for (const s of ['password="alpha beta"', "token='a b c d'", '"api_key": "x y z w"', '{"password":"alpha \\"beta gamma\\""}']) {
    const o = redactPeerText(s)
    assert.ok(o.includes('‹가림›') && !/alpha|beta|\bb c d|y z w/.test(o), `${s} → ${o}`)
  }
  for (const s of ['https://x/y', 'https://example.com/a/b', 'and/or', '읽기/쓰기', 'A / B', '1/2/3', 'src/a/b.ts 수정', 'see http://h.io/a/b/c'])
    assert.equal(redactPeerText(s), s)
  assert.equal(redactPeerText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U').includes('eyJhbGci'), false)
  assert.deepEqual(redactPeerDeep({ a: ['/home/x/y.txt'], b: { c: 1 } }), { a: ['…/y.txt'], b: { c: 1 } })
})

