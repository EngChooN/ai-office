import { app, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import type { OfficeSnapshot } from '../shared/types'
import { IS_WINDOWS } from './platform'
import { attentionCount, buildTrayMenu, menuKey, type TrayExtra, type TrayMenuActions } from './trayMenu'
import { t } from '../shared/i18n/index.ts'

// 메뉴바(윈도우는 작업 표시줄 알림 영역) 상주: 창을 닫아도 확인 필요 수를 보여 주고, 메뉴에서 바로 결재·자동결재·멈추기를 한다
// 메뉴 내용은 trayMenu.ts (테스트 가능), 여기는 아이콘과 그리기만

export class OfficeTray {
  private tray: Tray | null = null
  private lastKey = ''
  private last: OfficeSnapshot | null = null

  constructor(
    private actions: TrayMenuActions,
    private extra: () => Omit<TrayExtra, 'now'>,
  ) {}

  /** 스냅샷 없이 다시 그린다 (휴대폰 연결 상태처럼 스냅샷 밖의 값이 바뀌었을 때) */
  refresh() {
    if (this.last) this.update(this.last)
  }

  update(snap: OfficeSnapshot) {
    this.last = snap
    if (!snap.settings.isTrayOn) {
      this.tray?.destroy()
      this.tray = null
      this.lastKey = ''
      return
    }
    if (!this.tray) {
      const dir = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'build')
      // 맥 메뉴바는 흑백 템플릿, 윈도우 알림 영역은 16px 전용 컬러 아이콘(배율 높은 화면은 trayWin@2x.png를 알아서 쓴다)
      const icon = nativeImage.createFromPath(path.join(dir, IS_WINDOWS ? 'trayWin.png' : 'trayTemplate.png'))
      if (!IS_WINDOWS) icon.setTemplateImage(true)
      this.tray = new Tray(icon)
      // 윈도우는 아이콘을 왼쪽 클릭해도 메뉴 대신 사무실이 열리는 게 익숙하다 (메뉴는 오른쪽 클릭)
      if (IS_WINDOWS) this.tray.on('click', () => this.actions.open())
    }
    const items = buildTrayMenu(snap, { ...this.extra(), now: Date.now() }, this.actions)
    // 메뉴는 내용이 바뀔 때만 다시 만든다
    const key = menuKey(items)
    if (key === this.lastKey) return
    this.lastKey = key
    const count = attentionCount(snap)
    const isAuto = snap.autoApprove.isActive
    // 맥은 아이콘 옆 글자로 확인 필요 수(자동결재 중이면 🤖), 윈도우는 아이콘 옆 글자(setTitle)가 없어 툴팁에 넣는다
    this.tray.setTitle(`${isAuto ? ' 🤖' : ''}${count ? ` ${count}` : ''}`)
    this.tray.setToolTip(['AI Office', count ? t('tray.tooltipAttention', { n: count }) : '', isAuto ? t('tray.tooltipAuto') : ''].filter(Boolean).join(' · '))
    this.tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  destroy() {
    this.tray?.destroy()
    this.tray = null
  }
}
