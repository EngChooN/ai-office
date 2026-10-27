// 확인 카드에 보일 글을 앱이 실제 인자로 만든다 (한리뷰 H1) — 모델이 쓴 설명은 보조로만
// 실행될 값(지시 문장 전체·시간·폴더·권한)을 숨기지 않고, 위험한 값이면 위험도를 코드로 올린다. electron 없음 (테스트에서 그대로)

import type { OfficeMethod } from '../shared/officeApiShape.ts'
import { SECRETARY_TOOLS, type SecretaryRisk } from '../shared/secretaryTools.ts'
import { furnitureName } from './secretaryDecor.ts'

/** 가구 방향 (화면 기준 — 사무실 화면의 돌리기 표시와 같다) */
const ROT = ['↙', '↖', '↗', '↘']

/** id → 이름 (직원·팀·랩·업무 카드·결재). 모르면 null */
export type NameOf = (id: string) => string | null

const SETTING_LABEL: Record<string, string> = {
  monthlyBudgetUsd: '월 비용 예산($)',
  tokenBudget: '토큰 한도(일·주·월)',
  theme: '테마',
  dayNight: '낮과 밤',
  plants: '화분',
  isChatterOn: '휴게실 수다',
  workHours: '근무시간',
  layout: '소품 배치',
  isTrayOn: '메뉴바 아이콘',
  isOnboarded: '첫 실행 안내 마침',
  isWorkMode: '업무 모드',
  isFullAccessNoticeSeen: '휴대폰 안내 봄',
}
/** 이 설정은 바꿔도 꾸미기라 보통 */
const COSMETIC_SETTINGS = new Set(['theme', 'dayNight', 'plants', 'isChatterOn', 'layout'])

const FIELD_LABEL: Record<string, string> = {
  name: '이름',
  role: '직무',
  title: '제목',
  detail: '설명',
  topic: '주제',
  goal: '목표',
  cwd: '작업 폴더',
  model: '모델',
  avatar: '모습 번호',
  systemPrompt: '업무 지침',
  approvalMode: '결재 방식',
  teamId: '팀',
  labId: '랩',
  labIds: '랩',
  leadId: '리드',
  memberIds: '멤버',
  participantIds: '참석자',
  assigneeId: '담당',
  status: '칸',
  rounds: '발언 바퀴',
  color: '색',
  time: '시각',
  weekdays: '요일',
  instruction: '지시',
  enabled: '사용',
  staffId: '직원',
  label: '이름',
  mcpServers: 'MCP 서버',
  skills: '스킬',
  allowedTools: '결재 없이 쓰는 도구',
  disallowedTools: '막는 도구',
  monthlyBudgetUsd: '월 예산($)',
  manualName: '매뉴얼',
  input: '입력',
  scope: '범위',
  body: '본문',
  description: '설명',
  kind: '종류',
  projectDir: '프로젝트 폴더',
  floor: '층',
  joinLabIds: '넣을 랩',
  leaveLabIds: '뺄 랩',
}

const ID_FIELDS = new Set(['teamId', 'labId', 'leadId', 'assigneeId', 'staffId', 'id'])
const ID_LIST_FIELDS = new Set(['joinLabIds', 'leaveLabIds', 'labIds', 'memberIds', 'participantIds', 'staffIds', 'taskIds', 'teamIds'])
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const APPROVAL_MODE: Record<string, string> = { ask: '모두 결재', acceptEdits: '파일 수정은 자율(결재 없이)' }

const ref = (v: string) => (/^\$\d+\./.test(v) ? `${v.slice(1).split('.')[0]}번에서 만든 것` : null)

function idText(v: unknown, nameOf: NameOf) {
  if (typeof v !== 'string') return v === null ? '없음' : String(v)
  return ref(v) ?? nameOf(v) ?? v
}

/** 값 하나를 사람이 읽는 글로 (글자는 줄이지 않는다 — 실제로 보내질 문장이므로) */
function valueText(key: string, v: unknown, nameOf: NameOf): string {
  if (ID_FIELDS.has(key)) return idText(v, nameOf)
  if (ID_LIST_FIELDS.has(key) && Array.isArray(v)) return v.length ? v.map((x) => idText(x, nameOf)).join(', ') : '없음'
  if (key === 'approvalMode' && typeof v === 'string') return APPROVAL_MODE[v] ?? v
  if (key === 'weekdays' && Array.isArray(v)) return v.map((d) => WEEKDAY[Number(d)] ?? d).join('·')
  if (key === 'cwd' || key === 'projectDir') return v ? String(v) : '지정 없음'
  if (typeof v === 'boolean') return v ? '켬' : '끔'
  if (typeof v === 'string') return v === '' ? '(비어 있음)' : `"${v}"`
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ') : '없음'
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${FIELD_LABEL[k] ?? k} ${valueText(k, x, nameOf)}`).join(' · ')
  return String(v)
}

function objectLines(o: Record<string, unknown>, nameOf: NameOf, labels: Record<string, string> = FIELD_LABEL) {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${labels[k] ?? k}: ${valueText(k, v, nameOf)}`)
}

/** 확인 카드 단계의 내용: 실제로 실행될 인자를 줄마다 (id는 이름으로) */
export function describeStep(method: OfficeMethod, args: unknown[], nameOf: NameOf): string {
  const [a0, a1, a2] = args
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const lines: string[] = []
  switch (method) {
    case 'instruct':
    case 'interrupt':
    case 'forkExternal':
      lines.push(`받는 사람: ${idText(a0, nameOf)}`, `보낼 지시: ${a1 === undefined || a1 === null ? '(없음 — 멈추기만)' : `"${String(a1)}"`}`)
      break
    case 'sendChat':
      lines.push(`보낼 말: "${String(a0)}"`)
      break
    case 'decide':
      lines.push(`결재: ${idText(a0, nameOf)}`, `→ ${a1 ? '승인' : '반려'}`)
      break
    case 'answerQuestion':
      lines.push(`질문: ${idText(a0, nameOf)}`, ...Object.entries(obj(a1)).map(([q, a]) => `${q} → "${String(a)}"`))
      break
    case 'reviewPlan':
      lines.push(`기획: ${idText(a0, nameOf)}`, `→ ${a1 ? '승인하고 배정' : '다시'}`, ...(a2 ? [`의견: "${String(a2)}"`] : []))
      break
    case 'setAutoApprove': {
      const p = obj(a0)
      lines.push(p.mode === 'off' ? '자동결재 끄기' : p.mode === 'hours' ? `지금부터 ${p.hours}시간 동안 자동결재` : p.mode === 'daily' ? `매일 ${p.start}부터 ${p.end}까지 자동결재` : `자동결재: ${valueText('', p, nameOf)}`)
      if (p.mode !== 'off') lines.push('그동안 직원의 파일 수정·명령을 대표 대신 승인해요')
      break
    }
    case 'updateSettings':
      lines.push(...objectLines(obj(a0), nameOf, { ...FIELD_LABEL, ...SETTING_LABEL }))
      break
    case 'createTeam':
      lines.push(`이름: "${String(a0)}"`, `색: ${String(a1)}`)
      break
    case 'assignTask':
      lines.push(`업무: ${idText(a0, nameOf)}`, `담당: ${idText(a1, nameOf)} (맡기면 바로 지시가 나가요)`)
      break
    case 'trainStaff':
      lines.push(`매뉴얼: ${String(a0)}`, `직원: ${valueText('staffIds', a1, nameOf)}`)
      break
    case 'trainGroups':
      lines.push(`매뉴얼: ${String(a0)}`, `랩: ${valueText('labIds', a1, nameOf)}`, `팀: ${valueText('teamIds', a2, nameOf)}`)
      break
    case 'setRefDocs':
      lines.push(`대상: ${idText(obj(a0).id, nameOf)}`, `문서: ${valueText('', a1, nameOf)}`)
      break
    case 'saveManual':
      lines.push(...objectLines(obj(a0), nameOf), ...(a1 ? [`덮어쓸 파일: ${String(a1)}`] : []))
      break
    case 'deleteManual':
      lines.push(`지울 파일: ${String(a0)}`)
      break
    case 'endMeeting':
      lines.push(`회의: ${idText(a0, nameOf)}`, a1 === 'discard' ? '회의록 없이 끝내기' : '정리해서 끝내기')
      break
    case 'answerMeetingDecision':
      lines.push(`회의: ${idText(a0, nameOf)}`, `답: "${String(a2)}"`)
      break
    case 'reviewRun':
      lines.push(`프로세스: ${idText(a0, nameOf)}`, `→ ${a1 ? '통과' : '다시'}`, ...(a2 ? [`의견: "${String(a2)}"`] : []))
      break
    case 'startTasks':
      lines.push(`업무: ${valueText('taskIds', a0, nameOf)}`)
      break
    case 'mergeTasks':
      lines.push(`남길 카드: ${idText(a0, nameOf)}`, `합칠 카드: ${valueText('taskIds', a1, nameOf)} (설명은 남길 카드에 덧붙이고 지워요)`)
      break
    case 'mergeTeams':
      lines.push(`없앨 팀: ${idText(a0, nameOf)}`, `옮길 팀: ${idText(a1, nameOf)} (직원·카드를 모두 옮긴 뒤 없애요)`)
      break
    // 꾸미기 (가지고 있는 가구만 — 사는 일은 비서 도구에 없다)
    case 'placeGridItem':
      lines.push(`가구: ${furnitureName(String(a0))}`, `${String(a1)}층 ${String(a2)},${String(args[3])}칸 · 방향 ${ROT[Number(args[4])] ?? String(args[4])}`)
      break
    case 'moveGridItem':
      lines.push(`가구: ${idText(a0, nameOf)}`, `→ ${String(a1)}층 ${String(a2)},${String(args[3])}칸 · 방향 ${ROT[Number(args[4])] ?? String(args[4])}`)
      break
    case 'placeItem':
      lines.push(`가구: ${furnitureName(String(a0))}`, '1층 첫 빈자리에 놓아요')
      break
    case 'storeItem':
      lines.push(`서랍에 넣을 가구: ${idText(a0, nameOf)}`)
      break
    case 'setGridItemOn':
      lines.push(`소품: ${idText(a0, nameOf)}`, a1 ? '→ 켜기' : '→ 끄기')
      break
    case 'stowAllGrid':
      lines.push(`범위: ${Number(a0) > 0 ? `${String(a0)}층` : '건물 전체'}`, a1 ? '직원 책상·의자는 남겨요' : '책상·의자까지 모두 서랍으로', '파는 게 아니라 서랍에 넣어요. 끝나면 되돌리기 카드를 올려요')
      break
    case 'restoreGridItems':
      lines.push(`되놓을 가구: ${Array.isArray(a0) ? a0.length : 0}개 (치우기 전 자리로 — 그사이 막힌 자리는 건너뛰어요)`)
      break
    default: {
      // 첫 인자가 id면 대상 이름, 객체 인자는 칸마다
      for (const [i, a] of args.entries()) {
        if (typeof a === 'string' && i === 0) lines.push(`대상: ${idText(a, nameOf)}`)
        else if (a && typeof a === 'object' && !Array.isArray(a)) lines.push(...objectLines(a as Record<string, unknown>, nameOf))
        else lines.push(valueText('', a, nameOf))
      }
    }
  }
  return lines.join('\n')
}

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
