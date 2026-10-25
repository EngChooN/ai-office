// 휴대폰 연결 QR: 외부 주소·(같은 와이파이 주소)·포트·토큰·인증서 지문 (규격 8절). 화면에만 보이고 파일·클립보드·로그에 남기지 않는다

import qrcode from 'qrcode-generator'
import { PROTOCOL_VERSION } from './protocol.ts'
import { isPrivateIpv4 } from './upnp.ts'

export interface QrPayload {
  v: number
  host: string
  port: number
  token: string
  spki: string
  /** 같은 와이파이에서 먼저 붙어 볼 이 PC의 사설 IPv4 (선택 — host와 다를 때만). 공유기가 외부 주소로 되돌아 들어오기(헤어핀)를 못 하면 이걸로 붙는다 */
  lan?: string
  /** 이 PC가 제공하는 가장 높은 프로토콜 버전 (선택 — v2 규격 2-1절. 없으면 v1만) */
  pv?: number
}

const HOST = /^(?:[A-Za-z0-9.-]{1,255}|\[?[0-9A-Fa-f:.]{2,45}\]?)$/
const SPKI = /^sha256\/[A-Za-z0-9+/]{43}=$/
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/** lan으로 쓸 수 있는 주소: 사설 IPv4(RFC1918)만 */
export const isLanAddress = (ip: string) => IPV4.test(ip) && ip.split('.').every((n) => Number(n) <= 255) && isPrivateIpv4(ip)

/** QR에 넣을 값이 규격에 맞는지 (주소 모양·포트 범위·토큰·지문, lan은 있으면 사설 IPv4이고 host와 달라야 한다) */
export function isValidQrPayload(p: QrPayload) {
  const isLanOk = p.lan === undefined || (isLanAddress(p.lan) && p.lan !== p.host)
  const isPvOk = p.pv === undefined || (Number.isInteger(p.pv) && p.pv >= 1)
  return isPvOk && p.v === PROTOCOL_VERSION && HOST.test(p.host) && Number.isInteger(p.port) && p.port >= 1024 && p.port <= 65535 && TOKEN.test(p.token) && SPKI.test(p.spki) && isLanOk
}

/** QR 내용 — lan이 있으면 맨 뒤에 붙인다 (모르는 앱은 무시한다) */
export const qrText = (p: QrPayload) => JSON.stringify({ v: p.v, host: p.host, port: p.port, token: p.token, spki: p.spki, ...(p.lan ? { lan: p.lan } : {}), ...(p.pv ? { pv: p.pv } : {}) })

/** QR에 넣을 같은 와이파이 주소: 사설 IPv4이고 외부 주소(host)와 다를 때만 */
export const lanForQr = (host: string, lan: string | null) => (lan && isLanAddress(lan) && lan !== host ? lan : undefined)

/** QR 그림 (SVG data URL) */
export function qrImage(p: QrPayload) {
  const qr = qrcode(0, 'M')
  qr.addData(qrText(p), 'Byte')
  qr.make()
  return `data:image/svg+xml;base64,${Buffer.from(qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true })).toString('base64')}`
}
