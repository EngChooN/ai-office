// 로그인할 때 자동 실행 — 설치본만 로그인 항목에 넣는다 (개발 실행을 등록하면 엉뚱한 실행 파일이 켜진다)
// 로그인으로 켜졌을 때는 창을 띄우지 않고 시작한다 (맥은 Dock, 윈도우는 트레이에 남는다)
import { app } from 'electron'

/** 마지막으로 OS에 쓴 값 — 설정이 바뀔 때만 다시 쓴다 */
let applied: boolean | null = null

/** 설정의 launchAtLogin을 OS 로그인 항목에 맞춘다 */
export function syncLoginItem(isOn: boolean) {
  if (!app.isPackaged || isOn === applied) return
  applied = isOn
  // args는 윈도우에서만 쓰인다 (맥은 wasOpenedAtLogin으로 로그인 실행을 안다)
  app.setLoginItemSettings({ openAtLogin: isOn, args: ['--hidden'] })
}

/** 이번 실행이 로그인 때 자동으로 켜진 것인지 */
export function startedHidden(): boolean {
  return process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
}
