// 공유기 포트 자동 열기(UPnP IGD): 찾기(SSDP) → 설명 문서에서 제어 주소 → SOAP로 포트 매핑 추가·삭제·외부 주소
// 실패해도 원격 서버는 켜 두고, 화면에 수동 포트포워딩 안내를 띄운다. 매핑은 1시간 임대라 앱이 죽어도 1시간 안에 닫힌다

import dgram from 'node:dgram'
import http from 'node:http'

const SSDP_ADDR = '239.255.255.250'
const SSDP_PORT = 1900
const DISCOVER_MS = 2500
const HTTP_TIMEOUT_MS = 4000
/** 공유기 응답 본문 상한 — 넘으면 끊는다 (큰 응답으로 메모리를 채우지 못하게) */
export const RESPONSE_MAX_BYTES = 256 * 1024
/** 매핑 임대 시간 (초) — 30분마다 다시 연장한다 */
export const LEASE_SEC = 3600
const DESCRIPTION = 'Claude Office remote'
const WAN_SERVICES = ['urn:schemas-upnp-org:service:WANIPConnection:2', 'urn:schemas-upnp-org:service:WANIPConnection:1', 'urn:schemas-upnp-org:service:WANPPPConnection:1']

// ── 순수 함수 (테스트 대상) ─────────────────────────────

/** SSDP 응답에서 LOCATION 헤더 */
export function parseSsdpLocation(message: string) {
  return message.match(/^location:\s*(\S+)\s*$/im)?.[1] ?? null
}

/** http://<사설 IPv4>:<포트>/… 인 주소의 호스트 (아니면 null) — 공유기는 같은 집 안의 사설 주소에만 있다 */
function privateHttpHost(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && isPrivateIpv4(u.hostname) && /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) ? u.hostname : null
  } catch {
    return null
  }
}

/** SSDP로 받은 설명 문서 위치가 쓸 만한지 (사설 IPv4의 http 주소만) */
export const isGatewayLocation = (location: string) => privateHttpHost(location) !== null

/**
 * 장치 설명 XML에서 WAN 연결 서비스의 제어 주소 (상대 주소면 설명 문서 위치 기준으로).
 * 설명 문서 위치와 제어 주소의 호스트가 같은 사설 IPv4가 아니면 버린다 — 같은 망의 가짜 응답이 PC에게 다른 곳(인터넷·다른 기기)으로 요청을 보내게 하지 못하게
 */
export function parseIgdDescription(xml: string, location: string): { controlUrl: string; serviceType: string } | null {
  const host = privateHttpHost(location)
  if (!host) return null
  const base = xml.match(/<URLBase>\s*([^<\s]+)\s*<\/URLBase>/i)?.[1] ?? location
  for (const block of xml.match(/<service>[\s\S]*?<\/service>/gi) ?? []) {
    const type = block.match(/<serviceType>\s*([^<\s]+)\s*<\/serviceType>/i)?.[1]
    const control = block.match(/<controlURL>\s*([^<\s]+)\s*<\/controlURL>/i)?.[1]
    if (type && control && WAN_SERVICES.includes(type)) {
      try {
        const controlUrl = new URL(control, base).toString()
        return privateHttpHost(controlUrl) === host ? { controlUrl, serviceType: type } : null
      } catch {
        return null
      }
    }
  }
  return null
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)

export function soapEnvelope(serviceType: string, action: string, args: Record<string, string | number>) {
  const body = Object.entries(args)
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join('')
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${serviceType}">${body}</u:${action}></s:Body></s:Envelope>`
}

export const soapValue = (xml: string, tag: string) => xml.match(new RegExp(`<(?:\\w+:)?${tag}>\\s*([^<]*?)\\s*</(?:\\w+:)?${tag}>`, 'i'))?.[1] ?? null

/** 통신사 공유 주소(CGNAT, 100.64.0.0/10)인지 — 이러면 공유기 포트를 열어도 밖에서 못 들어올 수 있다 */
export function isCarrierShared(ip: string) {
  const m = ip.match(/^100\.(\d{1,3})\./)
  return Boolean(m && Number(m[1]) >= 64 && Number(m[1]) <= 127)
}

/** 사설 주소인지 (공유기가 외부 주소로 사설 주소를 주면 이중 공유기 — 밖에서 못 들어온다) */
export function isPrivateIpv4(ip: string) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\./)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

// ── 네트워크 ────────────────────────────────────────────

function discover(): Promise<string[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    const found = new Set<string>()
    const done = () => {
      try {
        socket.close()
      } catch {
        // 이미 닫힘
      }
      resolve([...found])
    }
    socket.on('message', (msg) => {
      const loc = parseSsdpLocation(msg.toString())
      if (loc) found.add(loc)
    })
    socket.on('error', done)
    socket.bind(() => {
      for (const st of ['urn:schemas-upnp-org:device:InternetGatewayDevice:1', ...WAN_SERVICES]) {
        const msg = `M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDR}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`
        socket.send(msg, SSDP_PORT, SSDP_ADDR)
      }
      setTimeout(done, DISCOVER_MS)
    })
  })
}

/** 공유기에 HTTP 요청 (응답 본문은 RESPONSE_MAX_BYTES까지만) */
export function request(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: opts.method ?? 'GET', headers: opts.headers, timeout: HTTP_TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > RESPONSE_MAX_BYTES) req.destroy(new Error('response too large'))
        else chunks.push(c)
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end(opts.body)
  })
}

/** 공유기 쪽에서 본 이 PC의 주소 (공유기로 가는 경로의 출발 주소) */
function localAddressToward(host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4')
    s.connect(SSDP_PORT, host, () => {
      const addr = s.address().address
      s.close()
      resolve(addr)
    })
    s.on('error', reject)
  })
}

export interface Gateway {
  controlUrl: string
  serviceType: string
  localAddress: string
}

async function soap(gw: Gateway, action: string, args: Record<string, string | number>) {
  const r = await request(gw.controlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${gw.serviceType}#${action}"` },
    body: soapEnvelope(gw.serviceType, action, args),
  })
  if (r.status !== 200) throw new Error(`${action} ${r.status} ${soapValue(r.text, 'errorDescription') ?? ''}`.trim())
  return r.text
}

/** 공유기를 찾는다 (없거나 UPnP가 꺼져 있으면 null) */
export async function findGateway(): Promise<Gateway | null> {
  for (const location of await discover()) {
    if (!isGatewayLocation(location)) continue
    try {
      const desc = parseIgdDescription((await request(location)).text, location)
      if (!desc) continue
      return { ...desc, localAddress: await localAddressToward(new URL(location).hostname) }
    } catch {
      // 다음 장치
    }
  }
  return null
}

export async function addPortMapping(gw: Gateway, port: number) {
  await soap(gw, 'AddPortMapping', {
    NewRemoteHost: '',
    NewExternalPort: port,
    NewProtocol: 'TCP',
    NewInternalPort: port,
    NewInternalClient: gw.localAddress,
    NewEnabled: 1,
    NewPortMappingDescription: DESCRIPTION,
    NewLeaseDuration: LEASE_SEC,
  })
}

export async function deletePortMapping(gw: Gateway, port: number) {
  await soap(gw, 'DeletePortMapping', { NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP' })
}

export async function externalAddress(gw: Gateway) {
  return soapValue(await soap(gw, 'GetExternalIPAddress', {}), 'NewExternalIPAddress')
}
