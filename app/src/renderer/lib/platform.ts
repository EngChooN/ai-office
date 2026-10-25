// 맥·윈도우에 따라 달라지는 화면 문구 (여백은 CSS의 win: 변형으로)
import { t } from '@shared/i18n'

export const IS_WINDOWS = window.office.platform === 'win32'

/** OS에 맞는 말 고르기 */
export const osText = (mac: string, win: string) => (IS_WINDOWS ? win : mac)

/** 확대 단축키에 쓰는 보조 키 표기 */
export const MOD_KEY = osText('⌘', 'Ctrl')

/** 창을 닫아도 남는 아이콘 자리: 맥 메뉴바 · 윈도우 작업 표시줄 알림 영역 */
export const trayPlace = () => osText(t('platform.trayPlace.mac'), t('platform.trayPlace.win'))
