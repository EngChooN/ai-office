/** 저장된 원문(한국어 이름) 대신 화면에 보일 이름 — 사전에 없으면 원문 그대로. 사전 키: item.<id>.name · item.<id>.desc · level.<n> · set.<id> */
import { tx } from './index.ts'

export const itemName = (id: string, fallback: string) => tx(`item.${id}.name`, fallback)
export const itemDesc = (id: string, fallback: string) => tx(`item.${id}.desc`, fallback)
export const levelTitle = (level: number, fallback: string) => tx(`level.${level}`, fallback)
