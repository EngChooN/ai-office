// CHANGELOG(.en/.ja/.zh).md 읽기 — 앱(changelog.ts)과 테스트가 같이 쓴다
export type ChangeKind = 'feature' | 'improve' | 'fix' | 'other'

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
  '새 기능': 'feature', 개선: 'improve', '버그 수정': 'fix',
  'New features': 'feature', Improvements: 'improve', 'Bug fixes': 'fix',
  新機能: 'feature', 改善: 'improve', バグ修正: 'fix',
  新功能: 'feature', 改进: 'improve', 问题修复: 'fix',
}

export function parseChangelog(md: string): Release[] {
  const releases: Release[] = []
  for (const block of md.split(/^## /m).slice(1)) {
    const [headLine, ...rest] = block.split('\n')
    // 빌드 전 항목은 날짜·대시가 없을 수 있다 (예: "## [미정] (설치본 미빌드)")
    const head = headLine.match(/^\[([^\]]+)\]\s*(?:-\s*)?(\d{4}-\d{2}-\d{2})?\s*(.*)$/)
    if (!head) continue
    const sections: ChangeSection[] = []
    const [intro, ...parts] = rest.join('\n').split(/^### /m)
    // ### 앞의 본문 — 섹션이 없는 예전 형식이면 그대로 하나로 보여 준다
    if (intro.trim()) sections.push({ kind: 'other', title: '', body: intro.trim() })
    for (const part of parts) {
      const [titleLine, ...lines] = part.split('\n')
      const body = lines.join('\n').trim()
      if (body) sections.push({ kind: KIND_BY_TITLE[titleLine.trim()] ?? 'other', title: titleLine.trim(), body })
    }
    releases.push({ version: head[1], date: head[2] ?? '', note: head[3].replace(/^[—–-]\s*/, '').replace(/^\((.*)\)$/, '$1'), sections })
  }
  return releases
}
