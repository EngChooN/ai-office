// 앱 업데이트 상태 — main(update:*)이 보내는 상태를 받아 배지·안내 창·설정 화면이 같이 본다
// preload가 없는 모바일 빌드에서는 늘 idle이라 아무것도 보이지 않는다
import { create } from 'zustand'
import { shouldNotify, type UpdateStatus } from '@shared/updateCheck'

const bridge = window.officeUpdate

interface UpdateStore {
  status: UpdateStatus | null
  /** 이번 실행에서 안내 창을 닫은 버전 ([나중에]와 달리 다음에 켜면 다시 알린다) */
  dismissedVersion: string | null
  isNoticeOpen: boolean
}

export const useUpdateStore = create<UpdateStore>(() => ({ status: null, dismissedVersion: null, isNoticeOpen: false }))

/** 알려 줄 새 버전 (건너뛴 버전이면 null) — 배지·안내 창 기준 */
export function notifiableVersion(status: UpdateStatus | null): string | null {
  const latest = status?.state === 'available' ? status.latest : null
  return latest && shouldNotify(latest.version, status!.current, status!.skippedVersion) ? latest.version : null
}

function receive(status: UpdateStatus) {
  const version = notifiableVersion(status)
  useUpdateStore.setState((s) => ({
    status,
    // 새로 알릴 버전이 생기면 한 번 띄운다 (이번 실행에서 닫은 버전은 다시 띄우지 않는다)
    isNoticeOpen: version ? s.isNoticeOpen || s.dismissedVersion !== version : false,
  }))
}

if (bridge) {
  bridge.onStatus(receive)
  void bridge.status().then(receive)
}

export const updateActions = {
  isAvailable: Boolean(bridge),
  check: () => bridge?.check().then(receive),
  download: () => void bridge?.download(),
  /** [나중에]: 그 버전은 다시 알리지 않는다 */
  skip: (version: string) => {
    useUpdateStore.setState({ isNoticeOpen: false })
    void bridge?.skip(version).then(receive)
  },
  openNotice: () => useUpdateStore.setState({ isNoticeOpen: true }),
  closeNotice: () => useUpdateStore.setState((s) => ({ isNoticeOpen: false, dismissedVersion: notifiableVersion(s.status) })),
}
