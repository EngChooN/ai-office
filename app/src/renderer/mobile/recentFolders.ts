import type { Lab, Staff } from '../../shared/types.ts'

// 경로 입력 시트의 "최근 폴더": 직원 작업 폴더(최근에 상태가 바뀐 순) → 랩 폴더, 중복 없이. 홈 폴더만 쓰는 직원은 뺀다
// PC에 따로 기록하지 않고 스냅샷에 이미 있는 값만 쓴다 (배치안 10절 2번)

export const RECENT_FOLDERS_MAX = 8

export function recentFolders(staff: Pick<Staff, 'cwd' | 'cwdSource' | 'statusSince'>[], labs: Pick<Lab, 'cwd'>[]): string[] {
  const fromStaff = [...staff]
    .filter((s) => s.cwd && s.cwdSource !== 'none')
    .sort((a, b) => (b.statusSince ?? 0) - (a.statusSince ?? 0))
    .map((s) => s.cwd)
  const fromLabs = labs.map((l) => l.cwd).filter((c): c is string => Boolean(c))
  return [...new Set([...fromStaff, ...fromLabs])].slice(0, RECENT_FOLDERS_MAX)
}
