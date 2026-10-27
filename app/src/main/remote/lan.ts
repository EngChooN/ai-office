// 같은 네트워크 전용 모드: 고른 사설 주소 하나에만 귀를 열고, 사설 대역 밖과 공유기 주소의 연결은 TLS 전에 끊는다
// electron·네트워크 호출에 기대지 않는 순수 함수 + 게이트웨이 읽기(명령 실행)만 모아 둔다

import { execFile } from 'node:child_process'
import type { NetworkInterfaceInfo } from 'node:os'
import { isLanAddress } from './qr.ts'

/** 이 이름이면 VPN·가상 카드로 보고 실제 카드(와이파이·유선)를 먼저 고른다 */
const VIRTUAL_NAME = /^(utun|tun|tap|ppp|ipsec|wg|zt|tailscale|docker|veth|br-|bridge|vmnet|vboxnet|awdl|llw|lo)\d*|vpn|tap-|wireguard|zerotier|tailscale|hyper-v|vethernet|vmware|virtualbox|loopback|docker|wsl/i

type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>

/** 이 PC의 내부 IPv4 주소 — 사설 주소 중 VPN·가상이 아닌 실제 카드를 먼저. 사설 주소가 하나도 없으면 null */
export function pickLanAddress(ifaces: Interfaces): string | null {
  const real: string[] = []
  const virtual: string[] = []
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || !isLanAddress(a.address)) continue
      // VPN 카드는 물리 주소가 0으로만 차 있기도 하다
      const isVirtual = VIRTUAL_NAME.test(name) || /^(00:){5}00$/.test(a.mac ?? '')
      ;(isVirtual ? virtual : real).push(a.address)
    }
  }
  return real[0] ?? virtual[0] ?? null
}

/** IPv4-mapped IPv6(::ffff:a.b.c.d)를 IPv4로 */
export const plainIp = (ip: string) => ip.replace(/^::ffff:/i, '')

export const isLoopback = (ip: string) => {
  const p = plainIp(ip)
  return p === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p)
}

/** 전용 모드에서 연결을 받을지: 루프백 허용, 사설 대역(10/8·172.16/12·192.168/16, VPN 포함)만 허용하되 공유기(게이트웨이) 주소는 거절 */
export function isAllowedClient(ip: string, gateway: string | null): boolean {
  if (isLoopback(ip)) return true
  const p = plainIp(ip)
  if (!isLanAddress(p)) return false
  return !(gateway && p === gateway)
}

/** `route -n get default` (맥) 출력에서 gateway 주소 */
export function parseMacGateway(out: string): string | null {
  return out.match(/^\s*gateway:\s*(\d{1,3}(?:\.\d{1,3}){3})\s*$/m)?.[1] ?? null
}

/** `route print -4 0.0.0.0` (윈도우) 출력에서 기본 경로(0.0.0.0/0) 중 비용이 가장 낮은 게이트웨이 */
export function parseWindowsGateway(out: string): string | null {
  let best: { gw: string; metric: number } | null = null
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})\s+\S+\s+(\d+)$/)
    if (m && (!best || Number(m[2]) < best.metric)) best = { gw: m[1], metric: Number(m[2]) }
  }
  return best?.gw ?? null
}

/** `ip route show default` (리눅스) */
export const parseLinuxGateway = (out: string) => out.match(/default via (\d{1,3}(?:\.\d{1,3}){3})/)?.[1] ?? null

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(cmd, args, { timeout: 3000, windowsHide: true }, (e, stdout) => (e ? reject(e) : resolve(stdout))))
}

/** 기본 게이트웨이(공유기) 주소 — UPnP 없이 OS 명령으로 읽는다. 못 읽으면 null */
export async function readDefaultGateway(platform: NodeJS.Platform = process.platform): Promise<string | null> {
  try {
    if (platform === 'darwin') return parseMacGateway(await run('route', ['-n', 'get', 'default']))
    if (platform === 'win32') return parseWindowsGateway(await run('route', ['print', '-4', '0.0.0.0']))
    return parseLinuxGateway(await run('ip', ['route', 'show', 'default']))
  } catch {
    return null
  }
}
