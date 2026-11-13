// 비서 파일 찾기·열기: 어디서 찾고 무엇을 열 수 있는지 (규칙은 fileFinder.ts, 기획서 secretary-next.md 4·6절)
// 찾는 곳: 직원 결과물 · 대화 첨부 · 프로젝트(랩)·직원 작업 폴더 안 (홈·앱 데이터 폴더가 루트면 뺀다)

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { app, shell } from 'electron'
import type { OfficeSnapshot } from '../shared/types.ts'
import { artifactList, artifactOpenExternal, artifactReveal } from './artifacts'
import { attachmentsRoot } from './attachments'
import { checkOpen, FIND_MAX_RESULTS, FileRegistry, findInRoot, usableRoot, type FoundEntry, type OpenHow } from './fileFinder'
import { isRemoteCall } from './remoteContext.ts'

export const fileRegistry = new FileRegistry()

export interface FoundFile {
  id: string
  name: string
  /** 출처: 직원 결과물·첨부 파일·프로젝트 폴더 */
  source: 'artifact' | 'attachment' | 'project'
  who: string
  at: number
}

/** 프로젝트·직원 작업 폴더 중 찾기 범위로 쓸 수 있는 것 (realpath, 겹침 제거) */
export function projectRoots(snap: Pick<OfficeSnapshot, 'staff' | 'labs'>): string[] {
  const danger = { home: os.homedir(), userData: app.getPath('userData') }
  const dirs = [...snap.labs.map((l) => l.cwd ?? ''), ...snap.staff.filter((s) => s.kind === 'hired' && s.cwdSource !== 'none').map((s) => s.cwd)].filter(Boolean)
  return [...new Set(dirs.map((d) => usableRoot(d, danger)).filter((r): r is string => !!r))]
}

const attachmentName = (file: string) => path.basename(file).replace(/^[a-f0-9-]{36}__/, '')

/** 이름 낱말·시각으로 찾아 id를 붙여 돌려준다 (경로는 돌려주지 않는다) */
export function findFiles(snap: Pick<OfficeSnapshot, 'staff' | 'labs'>, q: { words: string[]; sinceMs?: number; staffName?: string }): FoundFile[] {
  const words = q.words.map((w) => w.toLowerCase()).filter(Boolean)
  const out: FoundFile[] = []
  const push = (entry: FoundEntry, source: FoundFile['source']) => out.push({ id: fileRegistry.register(entry), name: entry.name, source, who: entry.who, at: entry.at })
  const room = () => out.length < FIND_MAX_RESULTS
  for (const a of artifactList()) {
    if (!room()) break
    const hay = `${a.title} ${a.name}`.toLowerCase()
    if (!words.every((w) => hay.includes(w)) || (q.sinceMs && a.updatedAt < q.sinceMs) || (q.staffName && !a.staffName.includes(q.staffName))) continue
    push({ kind: 'artifact', artifactId: a.id, name: a.title || a.name, who: a.staffName, at: a.updatedAt }, 'artifact')
  }
  // 첨부·프로젝트 파일은 만든 직원을 알 수 없어 직원 이름으로 좁히면 제외한다
  if (!q.staffName) {
    const attach = fs.realpathSync(attachmentsRoot())
    for (const c of findInRoot(attach, { words, sinceMs: q.sinceMs }, FIND_MAX_RESULTS - out.length)) push({ kind: 'file', path: c.path, root: attach, source: 'attachment', name: attachmentName(c.path), who: '', at: c.mtime }, 'attachment')
    for (const root of projectRoots(snap)) {
      if (!room()) break
      for (const c of findInRoot(root, { words, sinceMs: q.sinceMs }, FIND_MAX_RESULTS - out.length)) push({ kind: 'file', path: c.path, root, source: 'project', name: c.name, who: path.basename(root), at: c.mtime }, 'project')
    }
  }
  return out
}

/** 확인 카드에 보일 한 줄 — 모델이 쓴 글이 아니라 찾기 결과에 기록된 실제 이름·출처 */
export function describeFound(id: string): string | null {
  const e = fileRegistry.get(id)
  if (!e) return null
  const src = e.kind === 'artifact' ? '직원 결과물' : e.source === 'attachment' ? '첨부 파일' : '프로젝트 폴더'
  return `${e.name} (${src}${e.who ? ` · ${e.who}` : ''} · ${new Date(e.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })})`
}

/** 비서가 찾은 파일 열기·폴더에서 보기 — 원격에서는 부르지 못한다 (카드 단계에서도 막지만 여기서도) */
export async function openFound(snap: Pick<OfficeSnapshot, 'staff' | 'labs'>, id: string, how: OpenHow) {
  if (isRemoteCall()) throw new Error('파일 열기는 이 PC 앞에서만 할 수 있어요.')
  const e = fileRegistry.get(id)
  if (!e) throw new Error('찾기 결과에 없거나 시간이 지난 파일이에요. 다시 찾아 달라고 해 주세요.')
  if (e.kind === 'artifact') {
    // 결과물은 앱이 만든 안전한 사본(브라우저 CSP)으로 열거나 폴더에서 보여 준다
    if (how === 'reveal') artifactReveal(e.artifactId)
    else await artifactOpenExternal(e.artifactId)
    return
  }
  const attach = fs.realpathSync(attachmentsRoot())
  const r = checkOpen(e, how, [attach, ...projectRoots(snap)])
  if (!r.ok) {
    throw new Error(r.reason === 'not_openable' ? '프로그램 파일이거나 열 수 없는 형식이라 제가 열지 않아요. "폴더에서 보기"로 해 주세요.' : '그 파일을 찾을 수 없어요. 허용된 폴더 밖이거나 이미 없어졌어요.')
  }
  if (how === 'reveal') shell.showItemInFolder(r.path)
  else {
    const err = await shell.openPath(r.path)
    if (err) throw new Error(err)
  }
}
