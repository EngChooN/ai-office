import type { Rect } from '../shared/deskPet'

// 바탕화면 비서의 맥·윈도우 차이 (electron을 부르지 않는 순수 함수라 단위 테스트가 된다)

/** 비서를 띄울 수 있는 운영체제 — 맥·윈도우 (리눅스는 범위 밖) */
export const isPetPlatform = (platform: string) => platform === 'darwin' || platform === 'win32'

/** 항상 위 단계: 맥은 'floating', 윈도우는 작업표시줄 위까지 올리는 'screen-saver' */
export const petTopLevel = (platform: string) => (platform === 'win32' ? 'screen-saver' : 'floating')

/** 모든 데스크톱 위 표시는 맥에서만 한다 (윈도우는 지원하지 않는 호출) */
export const petAllWorkspaces = (platform: string) => platform === 'darwin'

const sameSize = (a: Rect, b: Rect) => a.width === b.width && a.height === b.height

/**
 * 배율이 다른 모니터 사이를 넘을 때 윈도우는 setBounds 뒤 창 크기가 바뀌는 일이 있다.
 * 바라던 크기와 다르면 true — 한 번 더 같은 값을 줘서 맞춘다 (맥은 그대로 한 번)
 */
export const needsBoundsRetry = (platform: string, want: Rect, got: Rect) => platform === 'win32' && !sameSize(want, got)
