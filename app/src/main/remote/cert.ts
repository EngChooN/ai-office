// 자체 서명 인증서: Node 기본 기능(ECDSA P-256 키·서명)으로 만든다. 맥·윈도우 모두 외부 프로그램·패키지 없이 동작
// 휴대폰은 시스템 인증서를 믿지 않고, QR에 담은 공개키 지문(spki)과 같은지만 본다 (규격 8절)

import crypto from 'node:crypto'

const VALID_YEARS = 10
const COMMON_NAME = 'Claude Office'

// ── 최소 DER 인코더 (인증서에 필요한 형식만) ──────────────
function len(n: number) {
  if (n < 0x80) return Buffer.from([n])
  const bytes: number[] = []
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}
const tlv = (tag: number, value: Buffer) => Buffer.concat([Buffer.from([tag]), len(value.length), value])
const seq = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items))
const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items))
function oid(dotted: string) {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const out = [a * 40 + b]
  for (const n of rest) {
    const chunk = [n & 0x7f]
    for (let v = n >> 7; v > 0; v >>= 7) chunk.unshift((v & 0x7f) | 0x80)
    out.push(...chunk)
  }
  return tlv(0x06, Buffer.from(out))
}
/** 양의 정수 — DER은 가장 짧은 꼴만 허용한다: 앞쪽 0바이트는 지우고, 맨 앞 비트가 1이면 0을 하나 붙인다
 * (앞에 쓸데없는 0이 남으면 "illegal padding"으로 인증서 전체를 읽지 못한다) */
function integer(bytes: Buffer) {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  const v = bytes.subarray(i)
  return tlv(0x02, v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : v)
}
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, 'utf8'))
const bitString = (b: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]))
/** 2050년 전은 UTCTime, 그 뒤는 GeneralizedTime */
function time(d: Date) {
  const iso = d.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return d.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(`${iso.slice(2)}Z`)) : tlv(0x18, Buffer.from(`${iso}Z`))
}

const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'))
const name = () => seq(set(seq(oid('2.5.4.3'), utf8(COMMON_NAME))))

/** 새 키쌍과 자체 서명 인증서 (PEM). 키는 ECDSA P-256 */
export function createSelfSignedCert(now = new Date()) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  // 일련번호: 양수이고 첫 바이트가 0이 아니게 (01xxxxxx)
  const serial = crypto.randomBytes(16)
  serial[0] = (serial[0] & 0x3f) | 0x40
  const notAfter = new Date(now)
  notAfter.setUTCFullYear(now.getUTCFullYear() + VALID_YEARS)
  const tbs = seq(
    tlv(0xa0, integer(Buffer.from([2]))), // v3
    integer(serial),
    ECDSA_SHA256,
    name(),
    seq(time(new Date(now.getTime() - 60_000)), time(notAfter)),
    name(),
    publicKey.export({ type: 'spki', format: 'der' }),
  )
  const signature = crypto.sign('sha256', tbs, privateKey)
  const der = seq(tbs, ECDSA_SHA256, bitString(signature))
  const certPem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  return { certPem, keyPem }
}

/** QR에 담는 지문: 인증서 공개키(SPKI) DER의 SHA-256을 base64로 쓰고 "sha256/"를 붙인다 */
export function spkiFingerprint(certPem: string) {
  const spki = new crypto.X509Certificate(certPem).publicKey.export({ type: 'spki', format: 'der' })
  return `sha256/${crypto.createHash('sha256').update(spki).digest('base64')}`
}
