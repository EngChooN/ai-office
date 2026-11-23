// 원격 창 결과물 미리보기: 저쪽 PC 원본으로 화면이 만든 문서를 잠깐 맡아, 그 창 안의 전용 주소(office-artifact://view/<토큰>)로 내준다
// srcDoc은 원격 창(remote.html)의 CSP를 물려받아 결과물의 외부 라이브러리가 막히므로, 응답 머리글로 결과물 CSP(sandbox 포함)를 따로 붙인다
import { randomUUID } from 'node:crypto'
import { ARTIFACT_CSP, ARTIFACT_SCHEME } from '../../shared/artifact.ts'

/** 창마다 최근 몇 개만 메모리에 둔다 (한 번에 하나를 보고, 버전을 바꾸면 새로 맡긴다) */
const KEEP = 4
const TOKEN = /^\/([a-f0-9-]{36})$/

export function createArtifactViews(keep = KEEP) {
  const byWorkspace = new Map<string, Map<string, string>>()
  return {
    /** 문서를 맡기고 주소를 돌려준다 */
    stage(workspaceId: string, html: string): string {
      const docs = byWorkspace.get(workspaceId) ?? new Map<string, string>()
      byWorkspace.set(workspaceId, docs)
      const token = randomUUID()
      docs.set(token, html)
      for (const k of docs.keys()) if (docs.size > keep) docs.delete(k)
      return `${ARTIFACT_SCHEME}://view/${token}`
    },
    /** 그 창이 맡긴 문서만 내준다 (다른 창·이 PC의 결과물은 못 연다) */
    respond(workspaceId: string, raw: string): Response {
      let u: URL | null = null
      try {
        u = new URL(raw)
      } catch {}
      const token = u?.hostname === 'view' ? TOKEN.exec(u.pathname)?.[1] : undefined
      const html = token ? byWorkspace.get(workspaceId)?.get(token) : undefined
      const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
      if (html === undefined) return new Response('not found', { status: 404, headers })
      return new Response(html, { status: 200, headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': ARTIFACT_CSP } })
    },
    /** 창을 닫으면 버린다 */
    drop(workspaceId: string) {
      byWorkspace.delete(workspaceId)
    },
  }
}
