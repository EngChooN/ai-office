/** 영역별 사전을 하나로 합친다. 새 영역 파일을 만들면 여기에 한 줄 추가 */
import common from './common.ts'
import settings from './settings.ts'
import featuresA from './featuresA.ts'
import featuresB from './featuresB.ts'
import shell from './shell.ts'
import game from './game.ts'
import main from './main.ts'
import staff from './staff.ts'
import logs from './logs.ts'
import update from './update.ts'
import tools from './tools.ts'

export interface Entry {
  ko: string
  en: string
  ja: string
  zh: string
}

/** 영역별 조각 (같은 키가 두 파일에 있으면 테스트가 잡는다) */
export const DICT_PARTS = { common, settings, featuresA, featuresB, shell, game, main, staff, logs, update, tools }

export const DICT = { ...common, ...settings, ...featuresA, ...featuresB, ...shell, ...game, ...main, ...staff, ...logs, ...update, ...tools } satisfies Record<string, Entry>
export type TKey = keyof typeof DICT
