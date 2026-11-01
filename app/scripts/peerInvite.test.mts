// 다른 PC 연결 화면: 붙여 넣은 연결 정보 해석, 오류 이름 접두어 지우기
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePeerInvite } from '../src/shared/peerProtocol.ts'
import { ipcErrorText } from '../src/shared/ipcError.ts'

const P = 47900
const parse = (s: string) => parsePeerInvite(s, P)

test('복사한 그대로("주소:포트 코드")를 나눈다', () => {
  assert.deepEqual(parse('100.64.0.5:47900 ABCD-2345-EFGH'), { host: '100.64.0.5', port: 47900, code: 'ABCD2345EFGH' })
})

test('줄바꿈·앞뒤 공백·순서 바뀜·http://·소문자도 받는다', () => {
  assert.deepEqual(parse('  abcd-2345-efgh\n http://100.64.0.5:48000/ \n'), { host: '100.64.0.5', port: 48000, code: 'ABCD2345EFGH' })
})

test('포트가 없으면 기본 포트', () => {
  assert.deepEqual(parse('office.tail1234.ts.net ABCD2345EFGH'), { host: 'office.tail1234.ts.net', port: P, code: 'ABCD2345EFGH' })
})

test('코드가 띄어 쓰여 있어도 합친다', () => {
  assert.deepEqual(parse('100.64.0.5 ABCD 2345 EFGH'), { host: '100.64.0.5', port: P, code: 'ABCD2345EFGH' })
})

test('점 없는 기기 이름도 나머지가 코드면 주소로 본다', () => {
  assert.deepEqual(parse('office-pc ABCD-2345-EFGH'), { host: 'office-pc', port: P, code: 'ABCD2345EFGH' })
})

test('잘못된 포트는 port=null', () => {
  assert.equal(parse('100.64.0.5:70000 ABCD-2345-EFGH').port, null)
  assert.equal(parse('100.64.0.5:0 ABCD-2345-EFGH').port, null)
})

test('코드만·주소만·빈 입력', () => {
  assert.deepEqual(parse('ABCD-2345-EFGH'), { host: null, port: P, code: 'ABCD2345EFGH' })
  assert.deepEqual(parse('100.64.0.5:47900'), { host: '100.64.0.5', port: 47900, code: null })
  assert.deepEqual(parse('   '), { host: null, port: P, code: null })
})

test('오류 문구에서 IPC 포장과 오류 이름만 지운다', () => {
  assert.equal(ipcErrorText(new Error("Error invoking remote method 'peer:pairStart': InvalidArgsError: 원격을 켜 주세요")), '원격을 켜 주세요')
  assert.equal(ipcErrorText(new Error("Error invoking remote method 'x': Error: 실패")), '실패')
  assert.equal(ipcErrorText(new Error('그냥 문구: Error: 아님')), '그냥 문구: Error: 아님')
  assert.equal(ipcErrorText('문자열', '기본'), '기본')
})

test('formatPairCode는 이미 하이픈이 있어도 한 번만 꾸민다', async () => {
  const { formatPairCode } = await import('../src/shared/peerProtocol.ts')
  assert.equal(formatPairCode('5YXCBB7T6GQZ'), '5YXC-BB7T-6GQZ')
  assert.equal(formatPairCode('5YXC-BB7T-6GQZ'), '5YXC-BB7T-6GQZ')
})
