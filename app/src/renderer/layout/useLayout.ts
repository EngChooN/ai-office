import { useSyncExternalStore } from 'react'
import { IS_MOBILE_SHELL } from '@/shell'
import { getLayoutState, subscribeLayout } from './layoutState'

// 폰·PC 배치. 판정은 layoutState.ts(키보드를 뺀 안정 높이) 한 곳 — CSS phone:·short:도 같은 판정이 붙인 <html data-layout>을 본다
// 데스크톱 빌드는 창을 좁혀도 늘 'desktop'
// feature 화면은 이 훅을 쓰지 않는다 — 분기는 틀(App·PhoneShell)·UI 부품·CSS phone: 변형에서만 (scripts/mobile.test.mts가 확인)

export type Layout = 'desktop' | 'phone'

export const isPhoneLayout = () => IS_MOBILE_SHELL && getLayoutState().isPhone

const noop = () => () => {}

export function useLayout(): Layout {
  const isPhone = useSyncExternalStore(IS_MOBILE_SHELL ? subscribeLayout : noop, isPhoneLayout)
  return isPhone ? 'phone' : 'desktop'
}
