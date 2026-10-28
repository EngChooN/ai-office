// 확인 카드에 보일 글을 앱이 실제 인자로 만든다 (한리뷰 H1) — 모델이 쓴 설명은 보조로만
// 실행될 값(지시 문장 전체·시간·폴더·권한)을 숨기지 않고, 위험한 값이면 위험도를 코드로 올린다. electron 없음 (테스트에서 그대로)
// 줄마다 사전 키+인자(I18nText)로 만들어 카드에 같이 저장한다 — 화면은 그때 언어로, detail 글자는 한국어로

import type { OfficeMethod } from '../shared/officeApiShape.ts'
import { SECRETARY_TOOLS, type SecretaryRisk } from '../shared/secretaryTools.ts'
import { shopItem } from '../shared/economy.ts'
import { tr, type I18nArg, type I18nText } from '../shared/i18n/index.ts'
import type { TKey } from '../shared/i18n/dict/index.ts'

/** 가구 방향 (화면 기준 — 사무실 화면의 돌리기 표시와 같다) */
const ROT = ['↙', '↖', '↗', '↘']

/** id → 이름 (직원·팀·랩·업무 카드·결재). 모르면 null */
export type NameOf = (id: string) => string | null

/** 사전 키 이름: secretary.setting.<키> */
const SETTING_KEYS = new Set(['monthlyBudgetUsd', 'tokenBudget', 'theme', 'dayNight', 'plants', 'isChatterOn', 'workHours', 'layout', 'isTrayOn', 'isOnboarded', 'isWorkMode', 'isFullAccessNoticeSeen', 'isProviderBannerSeen'])
/** 이 설정은 바꿔도 꾸미기라 보통 */
const COSMETIC_SETTINGS = new Set(['theme', 'dayNight', 'plants', 'isChatterOn', 'layout'])

/** 사전 키 이름: secretary.field.<키> */
const FIELD_KEYS = new Set([
  'name', 'role', 'title', 'detail', 'topic', 'goal', 'cwd', 'provider', 'model', 'avatar', 'systemPrompt', 'approvalMode', 'teamId', 'labId', 'labIds', 'leadId', 'memberIds', 'participantIds', 'assigneeId', 'status', 'rounds', 'color', 'time', 'weekdays', 'instruction', 'enabled', 'staffId', 'label', 'mcpServers', 'skills', 'allowedTools', 'disallowedTools', 'monthlyBudgetUsd', 'manualName', 'input', 'scope', 'body', 'description', 'kind', 'projectDir', 'floor', 'joinLabIds', 'leaveLabIds',
])

const ID_FIELDS = new Set(['teamId', 'labId', 'leadId', 'assigneeId', 'staffId', 'id'])
const ID_LIST_FIELDS = new Set(['joinLabIds', 'leaveLabIds', 'labIds', 'memberIds', 'participantIds', 'staffIds', 'taskIds', 'teamIds'])
const APPROVAL_MODES = new Set(['ask', 'acceptEdits'])

const L = (key: TKey, params?: Record<string, I18nArg>): I18nText => (params ? { key, params } : { key })
const list = (items: I18nArg[], sep = ', '): I18nArg => (items.length ? { list: items, sep } : L('secretary.v.none'))
const quote = (v: unknown) => `"${String(v)}"`
const fieldLabel = (k: string): I18nArg => (FIELD_KEYS.has(k) ? L(`secretary.field.${k}` as TKey) : k)
const settingLabel = (k: string): I18nArg => (SETTING_KEYS.has(k) ? L(`secretary.setting.${k}` as TKey) : fieldLabel(k))
/** "이름: 값" 한 줄 */
const kv = (label: I18nArg, value: I18nArg) => L('secretary.d.kv', { label, value })

const ref = (v: string) => (/^\$\d+\./.test(v) ? L('secretary.v.ref', { n: v.slice(1).split('.')[0] }) : null)

function idText(v: unknown, nameOf: NameOf): I18nArg {
  if (typeof v !== 'string') return v === null ? L('secretary.v.none') : String(v)
  return ref(v) ?? nameOf(v) ?? v
}

/** 값 하나를 사람이 읽는 글로 (글자는 줄이지 않는다 — 실제로 보내질 문장이므로) */
function valueText(key: string, v: unknown, nameOf: NameOf): I18nArg {
  if (ID_FIELDS.has(key)) return idText(v, nameOf)
  if (ID_LIST_FIELDS.has(key) && Array.isArray(v)) return list(v.map((x) => idText(x, nameOf)))
  if (key === 'approvalMode' && typeof v === 'string') return APPROVAL_MODES.has(v) ? L(`secretary.v.approval.${v}` as TKey) : v
  if (key === 'weekdays' && Array.isArray(v)) return { list: v.map((d) => (Number(d) >= 0 && Number(d) <= 6 ? L(`secretary.v.weekday.${Number(d)}` as TKey) : String(d))), sep: '·' }
  if (key === 'provider' && typeof v === 'string') return v === 'codex' ? 'GPT' : v === 'claude' ? 'Claude' : v
  if (key === 'cwd' || key === 'projectDir') return v ? String(v) : L('secretary.v.noFolder')
  if (typeof v === 'boolean') return L(v ? 'secretary.v.on' : 'secretary.v.off')
  if (typeof v === 'string') return v === '' ? L('secretary.v.empty') : quote(v)
  if (Array.isArray(v)) return list(v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))))
  if (v && typeof v === 'object') return { list: Object.entries(v).map(([k, x]) => L('secretary.d.pair', { label: fieldLabel(k), value: valueText(k, x, nameOf) })), sep: ' · ' }
  return String(v)
}

function objectLines(o: Record<string, unknown>, nameOf: NameOf, label: (k: string) => I18nArg = fieldLabel) {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => kv(label(k), valueText(k, v, nameOf)))
}

const furniture = (id: unknown): I18nText => ({ key: `item.${String(id)}.name`, fallback: shopItem(String(id))?.name ?? String(id) })
const gridSpot = (args: unknown[]) => ({ floor: String(args[1]), x: String(args[2]), y: String(args[3]), rot: ROT[Number(args[4])] ?? String(args[4]) })

/** 확인 카드 단계의 내용: 실제로 실행될 인자를 줄마다 (id는 이름으로) — 사전 키+인자 */
export function describeLines(method: OfficeMethod, args: unknown[], nameOf: NameOf): I18nText[] {
  const [a0, a1, a2] = args
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const id = (v: unknown) => idText(v, nameOf)
  const lines: I18nText[] = []
  switch (method) {
    case 'instruct':
    case 'interrupt':
    case 'forkExternal':
      lines.push(L('secretary.d.recipient', { who: id(a0) }), L('secretary.d.order', { text: a1 === undefined || a1 === null ? L('secretary.v.stopOnly') : quote(a1) }))
      break
    case 'sendChat':
      lines.push(L('secretary.d.chat', { text: quote(a0) }))
      break
    case 'decide':
      lines.push(L('secretary.d.approval', { target: id(a0) }), L(a1 ? 'secretary.d.approve' : 'secretary.d.reject'))
      break
    case 'answerQuestion':
      lines.push(L('secretary.d.question', { target: id(a0) }), ...Object.entries(obj(a1)).map(([q, a]) => L('secretary.d.answer', { q, a: quote(a) })))
      break
    case 'reviewPlan':
      lines.push(L('secretary.d.plan', { target: id(a0) }), L(a1 ? 'secretary.d.planApprove' : 'secretary.d.redo'), ...(a2 ? [L('secretary.d.opinion', { text: quote(a2) })] : []))
      break
    case 'setAutoApprove': {
      const p = obj(a0)
      lines.push(
        p.mode === 'off'
          ? L('secretary.d.autoOff')
          : p.mode === 'hours'
            ? L('secretary.d.autoHours', { hours: String(p.hours) })
            : p.mode === 'daily'
              ? L('secretary.d.autoDaily', { start: String(p.start), end: String(p.end) })
              : L('secretary.d.autoOther', { value: valueText('', p, nameOf) }),
      )
      if (p.mode !== 'off') lines.push(L('secretary.d.autoNote'))
      break
    }
    case 'updateSettings':
      lines.push(...objectLines(obj(a0), nameOf, settingLabel))
      break
    case 'createTeam':
      lines.push(kv(fieldLabel('name'), quote(a0)), kv(fieldLabel('color'), String(a1)))
      break
    case 'assignTask':
      lines.push(L('secretary.d.task', { target: id(a0) }), L('secretary.d.assignee', { who: id(a1) }))
      break
    case 'trainStaff':
      lines.push(kv(fieldLabel('manualName'), String(a0)), kv(fieldLabel('staffId'), valueText('staffIds', a1, nameOf)))
      break
    case 'trainGroups':
      lines.push(kv(fieldLabel('manualName'), String(a0)), kv(fieldLabel('labIds'), valueText('labIds', a1, nameOf)), kv(fieldLabel('teamId'), valueText('teamIds', a2, nameOf)))
      break
    case 'setRefDocs':
      lines.push(L('secretary.d.target', { target: id(obj(a0).id) }), L('secretary.d.docs', { list: valueText('', a1, nameOf) }))
      break
    case 'saveManual':
      lines.push(...objectLines(obj(a0), nameOf), ...(a1 ? [L('secretary.d.overwrite', { file: String(a1) })] : []))
      break
    case 'deleteManual':
      lines.push(L('secretary.d.deleteFile', { file: String(a0) }))
      break
    case 'endMeeting':
      lines.push(L('secretary.d.meeting', { target: id(a0) }), L(a1 === 'discard' ? 'secretary.d.endDiscard' : 'secretary.d.endSummarize'))
      break
    case 'answerMeetingDecision':
      lines.push(L('secretary.d.meeting', { target: id(a0) }), L('secretary.d.meetingAnswer', { text: quote(a2) }))
      break
    case 'reviewRun':
      lines.push(L('secretary.d.run', { target: id(a0) }), L(a1 ? 'secretary.d.pass' : 'secretary.d.redo'), ...(a2 ? [L('secretary.d.opinion', { text: quote(a2) })] : []))
      break
    case 'startTasks':
      lines.push(L('secretary.d.task', { target: valueText('taskIds', a0, nameOf) }))
      break
    case 'mergeTasks':
      lines.push(L('secretary.d.keepCard', { target: id(a0) }), L('secretary.d.mergeCards', { list: valueText('taskIds', a1, nameOf) }))
      break
    case 'mergeTeams':
      lines.push(L('secretary.d.removeTeam', { target: id(a0) }), L('secretary.d.intoTeam', { target: id(a1) }))
      break
    // 꾸미기 (가지고 있는 가구만 — 사는 일은 비서 도구에 없다)
    case 'placeGridItem':
      lines.push(L('secretary.d.furniture', { name: furniture(a0) }), L('secretary.d.gridSpot', gridSpot(args)))
      break
    case 'moveGridItem':
      lines.push(L('secretary.d.furniture', { name: id(a0) }), L('secretary.d.gridMove', gridSpot(args)))
      break
    case 'placeItem':
      lines.push(L('secretary.d.furniture', { name: furniture(a0) }), L('secretary.d.placeFirst'))
      break
    case 'storeItem':
      lines.push(L('secretary.d.store', { target: id(a0) }))
      break
    case 'setGridItemOn':
      lines.push(L('secretary.d.prop', { target: id(a0) }), L(a1 ? 'secretary.d.turnOn' : 'secretary.d.turnOff'))
      break
    case 'stowAllGrid':
      lines.push(
        L('secretary.d.scope', { scope: Number(a0) > 0 ? L('secretary.v.floor', { n: String(a0) }) : L('secretary.v.wholeBuilding') }),
        L(a1 ? 'secretary.d.keepDesks' : 'secretary.d.stowDesks'),
        L('secretary.d.stowNote'),
      )
      break
    case 'moveSeatSet':
      lines.push(L('secretary.d.moveSeatSet'))
      break
    case 'restoreGridItems':
      lines.push(L('secretary.d.restore', { n: Array.isArray(a0) ? a0.length : 0 }))
      break
    default: {
      // 첫 인자가 id면 대상 이름, 객체 인자는 칸마다
      for (const [i, a] of args.entries()) {
        if (typeof a === 'string' && i === 0) lines.push(L('secretary.d.target', { target: id(a) }))
        else if (a && typeof a === 'object' && !Array.isArray(a)) lines.push(...objectLines(a as Record<string, unknown>, nameOf))
        else lines.push(L('secretary.d.plain', { value: valueText('', a, nameOf) }))
      }
    }
  }
  return lines
}

/** 카드 detail 글자 (한국어 — 예전 카드·모델에게 보이는 값과 같은 모양) */
export const linesText = (lines: I18nText[]) => lines.map((l) => tr(l, 'ko')).join('\n')

export const describeStep = (method: OfficeMethod, args: unknown[], nameOf: NameOf): string => linesText(describeLines(method, args, nameOf))

const ORDER: SecretaryRisk[] = ['normal', 'caution', 'danger']
const max = (a: SecretaryRisk, b: SecretaryRisk) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a)

/** 단계 위험도: 메서드 기본값 + 인자 값으로 올린다 (자동결재 켜기·권한 넓히기·지침·폴더·지시 문장) */
export function stepRisk(method: OfficeMethod, args: unknown[]): { risk: SecretaryRisk; reason?: string } {
  const base = SECRETARY_TOOLS[method].risk ?? 'normal'
  const [a0, a1] = args
  const o0 = (a0 && typeof a0 === 'object' ? a0 : {}) as Record<string, unknown>
  const o1 = (a1 && typeof a1 === 'object' ? a1 : {}) as Record<string, unknown>
  let reason: string | undefined
  let risk = base
  const up = (why: string) => {
    risk = max(risk, 'caution')
    reason ??= why
  }
  if (method === 'setAutoApprove' && o0.mode !== 'off') up('자동결재를 켜면 그동안 결재를 대표 대신 승인해요')
  if (method === 'updateSettings' && Object.keys(o0).some((k) => !COSMETIC_SETTINGS.has(k))) up('예산·업무 모드 같은 설정이 바뀌어요')
  if (method === 'setEquipment') up('직원이 쓸 수 있는 도구·결재 없이 쓰는 도구가 바뀌어요')
  // 자동결재가 기다리게 한 명령도 이 카드 한 번으로 승인되므로 (Round 2 B3)
  if (method === 'decide' && a1 === true) up('직원이 기다리는 결재를 대표 대신 승인해요 — 승인할 명령을 확인하세요')
  if (method === 'answerQuestion') up('직원 질문에 대표 대신 답해요 — 답을 확인하세요')
  if ((method === 'hire' ? o0 : method === 'recruitExternal' ? o1 : {}).approvalMode === 'acceptEdits') up('파일 수정을 결재 없이 하는 직원이에요')
  if (method === 'hire' && (o0.systemPrompt || o0.cwd)) up('업무 지침·작업 폴더가 정해져요')
  if (method === 'updateStaff' && ('systemPrompt' in o1 || 'cwd' in o1)) up('업무 지침이나 작업 폴더가 바뀌어요')
  if (['instruct', 'interrupt', 'forkExternal', 'sendChat', 'saveSchedule', 'runScheduleNow', 'startRun', 'assignTask', 'startTasks'].includes(method)) up('직원에게 지시가 나가요 — 지시 문장을 확인하세요')
  return { risk, reason }
}

export const maxRisk = (risks: SecretaryRisk[]) => risks.reduce(max, 'normal' as SecretaryRisk)
