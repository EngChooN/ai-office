// 휴대폰 푸시 알림(FCM)은 2단계 — 지금은 보낼 자리(인터페이스)만 둔다
// 서비스 계정 키는 앱에 넣지 않는다. 2단계에서 키를 어디에 둘지 정한 뒤 이 인터페이스를 구현한다

/** 휴대폰에 알릴 일. 본문에는 결재 요약·명령·경로를 넣지 않는다 (잠금 화면에 보일 수 있다) */
export interface RemoteNotice {
  kind: 'decision' | 'error' | 'done'
  /** 알림 제목 (예: "확인할 결정이 있어요") */
  title: string
  /** 앱이 열 화면 */
  screen: 'decisions' | 'staff'
}

export interface Notifier {
  /** 연결된 휴대폰에 알린다. 실패해도 사무실 동작은 멈추지 않는다 */
  notify(notice: RemoteNotice): Promise<void>
}

/** 1.0.0: 휴대폰이 15분마다 조회하므로 PC가 먼저 보내는 알림은 없다 */
export const noopNotifier: Notifier = { notify: async () => {} }
