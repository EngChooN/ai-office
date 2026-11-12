// CHANGELOG(.en/.ja/.zh).md 읽기 — 앱(changelog.ts)·업데이트 확인(새 버전 Release 설명)·테스트가 같이 쓴다
export type ChangeKind = 'summary' | 'feature' | 'improve' | 'fix' | 'other'

export interface ChangeSection {
  kind: ChangeKind
  title: string
  body: string
}

export interface Release {
  version: string
  date: string
  /** 제목 뒤 메모 (예: 첫 설치본) */
  note: string
  sections: ChangeSection[]
}

/** 섹션 제목(언어마다 다름) → 종류. 4개 변경 기록 파일이 같은 구조인지 테스트가 비교한다 */
const KIND_BY_TITLE: Record<string, ChangeKind> = {
  '한눈에 보기': 'summary', '새 기능': 'feature', 개선: 'improve', '버그 수정': 'fix',
  'At a glance': 'summary', 'New features': 'feature', Improvements: 'improve', 'Bug fixes': 'fix',
  ひと目で: 'summary', 新機能: 'feature', 改善: 'improve', バグ修正: 'fix',
  一览: 'summary', 新功能: 'feature', 改进: 'improve', 问题修复: 'fix',
}

/** '한눈에 보기' 줄 앞 굵은 말 → 종류 (예: "- **새 기능** 내 PC 여러 대를 연결해 오가요") */
const KIND_BY_BADGE: Record<string, ChangeKind> = {
  '새 기능': 'feature', 개선: 'improve', 수정: 'fix',
  New: 'feature', Better: 'improve', Fixed: 'fix',
  新機能: 'feature', 改善: 'improve', 修正: 'fix',
  新功能: 'feature', 改进: 'improve', 修复: 'fix',
}

export interface SummaryItem {
  /** 줄 앞 굵은 말로 읽은 종류 — 없거나 모르는 말이면 null */
  kind: ChangeKind | null
  text: string
}

/** '한눈에 보기' 본문 → 줄마다 종류와 문장 */
export function summaryItems(body: string): SummaryItem[] {
  return body
    .split('\n')
    .filter((l) => /^[-*] /.test(l))
    .map((l) => {
      const line = l.slice(2).trim()
      const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(line)
      const kind = m ? KIND_BY_BADGE[m[1].trim()] ?? null : null
      return kind ? { kind, text: m![2].trim() } : { kind: null, text: line }
    })
}

/** 한 버전의 본문을 섹션으로 — `###` 앞 본문(기기 안내·옛 형식)은 제목 없는 'other' */
export function parseSections(text: string): ChangeSection[] {
  const sections: ChangeSection[] = []
  const [intro, ...parts] = text.split(/^### /m)
  if (intro.trim()) sections.push({ kind: 'other', title: '', body: intro.trim() })
  for (const part of parts) {
    const [titleLine, ...lines] = part.split('\n')
    const body = lines.join('\n').trim()
    if (body) sections.push({ kind: KIND_BY_TITLE[titleLine.trim()] ?? 'other', title: titleLine.trim(), body })
  }
  return sections
}

export function parseChangelog(md: string): Release[] {
  const releases: Release[] = []
  for (const block of md.split(/^## /m).slice(1)) {
    const [headLine, ...rest] = block.split('\n')
    // 빌드 전 항목은 날짜·대시가 없을 수 있다 (예: "## [미정] (설치본 미빌드)")
    const head = headLine.match(/^\[([^\]]+)\]\s*(?:-\s*)?(\d{4}-\d{2}-\d{2})?\s*(.*)$/)
    if (!head) continue
    releases.push({ version: head[1], date: head[2] ?? '', note: head[3].replace(/^[—–-]\s*/, '').replace(/^\((.*)\)$/, '$1'), sections: parseSections(rest.join('\n')) })
  }
  return releases
}
