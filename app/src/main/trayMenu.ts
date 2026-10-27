// 메뉴바(맥)·알림 영역 트레이(윈도우) 메뉴 내용 — electron 없이 만들어 테스트한다 (그리는 건 tray.ts)
// 순서: 요약 → 자동결재 → 결재 대기 → 직원 전체(팀·랩 하위 메뉴) → 빠른 동작 → 사무실 열기·종료

import type { MenuItemConstructorOptions } from 'electron'
import { AUTO_DAILY_DEFAULT, AUTO_HOURS, formatRemaining, type AutoApprovePlan } from '../shared/autoApprove.ts'
import { remoteActivity } from './remote/protocol.ts'
import type { OfficeSnapshot, Staff } from '../shared/types'
import { t } from '../shared/i18n/index.ts'

const TEXT_MAX = 40
const APPROVALS_MAX = 15
const STATUS_DOT: Record<string, string> = {
  working: '🟢',
  waiting: '🟡',
  error: '🔴',
  idle: '⚪️',
  offline: '⚫️',
}

export interface TrayMenuActions {
  open(staffId?: string): void
  decide(approvalId: string, allow: boolean): void
  setAutoApprove(plan: AutoApprovePlan): void
  stopAll(): void
  /** 클립보드 글로 업무 보드에 할 일 추가 */
  quickTask(): void
  /** 비서에게 말하기 — 비서 기획 뒤 연결 (없으면 메뉴는 "준비 중") */
  talkToSecretary?: () => void
  setRemoteEnabled(isOn: boolean): void
}

export interface TrayExtra {
  now: number
  today: { done: number; costUsd: number }
  /** 휴대폰 연결 상태 (원격이 준비 안 됐으면 null) */
  remote: { isEnabled: boolean; isListening: boolean; port: number } | null
}

const clip = (t: string) => (t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX)}…` : t)
const hhmm = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 아이콘 옆 숫자·툴팁에 쓰는 확인 필요 수 (결재·질문 + 외부 직원 확인 요청) */
export function attentionCount(snap: OfficeSnapshot) {
  return snap.staff.reduce((n, s) => n + s.approvals.length, 0) + snap.staff.filter((s) => s.kind === 'external' && s.status === 'waiting').length
}

/** 자동결재 한 줄: "🤖 자동결재 중 · 남은 3시간 12분" */
export function autoApproveLine(snap: OfficeSnapshot, now: number) {
  const a = snap.autoApprove
  if (a.isActive && a.endsAt) return t('tray.autoActive', { left: formatRemaining(a.endsAt - now) })
  if (a.config.mode === 'daily') return t('tray.autoDaily', { start: a.config.start, end: a.config.end }) + (a.startsAt ? t('tray.autoNext', { time: hhmm(a.startsAt) }) : '')
  return t('tray.autoOff')
}

const staffItem = (s: Staff, actions: TrayMenuActions): MenuItemConstructorOptions => {
  // 지금 하는 일은 도구 이름 수준만 (명령·경로가 메뉴에 그대로 보이지 않게, L2 — 원격과 같은 remoteActivity)
  const act = remoteActivity(s.status, s.activity)
  return { label: clip(`${STATUS_DOT[s.status] ?? ''} ${s.name}${act ? ` — ${act}` : ''}`), click: () => actions.open(s.id) }
}

/** 직원 전체: 팀별·랩별 하위 메뉴 (한 사람이 팀과 랩에 함께 보일 수 있다). 팀 없는 직원·외부 직원도 빠짐없이 */
function staffMenu(snap: OfficeSnapshot, actions: TrayMenuActions): MenuItemConstructorOptions[] {
  const hired = snap.staff.filter((s) => s.kind === 'hired')
  const external = snap.staff.filter((s) => s.kind === 'external')
  const working = (list: Staff[]) => list.filter((s) => s.status === 'working').length
  const group = (name: string, list: Staff[]): MenuItemConstructorOptions => ({
    label: clip(`${name} (${list.length}${working(list) ? t('tray.workingCount', { n: working(list) }) : ''})`),
    submenu: list.map((s) => staffItem(s, actions)),
  })
  const items: MenuItemConstructorOptions[] = []
  for (const tm of snap.teams.filter((x) => x.kind !== 'project')) {
    const members = hired.filter((s) => s.teamId === tm.id)
    if (members.length) items.push(group(t('tray.team', { name: tm.name }), members))
  }
  const teamIds = new Set(snap.teams.map((x) => x.id))
  const noTeam = hired.filter((s) => !s.teamId || !teamIds.has(s.teamId))
  if (noTeam.length) items.push(group(t('tray.noTeam'), noTeam))
  const labs = snap.labs.map((l) => ({ l, members: hired.filter((s) => s.labIds.includes(l.id)) })).filter((x) => x.members.length)
  if (labs.length) {
    items.push({ type: 'separator' })
    for (const { l, members } of labs) items.push(group(t('tray.lab', { name: l.name }), members))
  }
  if (external.length) {
    items.push({ type: 'separator' })
    items.push(group(t('tray.external'), external))
  }
  return items
}

function autoMenu(snap: OfficeSnapshot, extra: TrayExtra, actions: TrayMenuActions): MenuItemConstructorOptions {
  const a = snap.autoApprove
  const c = a.counts
  const done = c.edit + c.command + c.other
  const isDailyDefault = a.config.mode === 'daily' && a.config.start === AUTO_DAILY_DEFAULT.start && a.config.end === AUTO_DAILY_DEFAULT.end
  const submenu: MenuItemConstructorOptions[] = [
    { label: autoApproveLine(snap, extra.now), enabled: false },
    ...(a.isActive
      ? [
          {
            label: t('tray.autoDone', { done, answered: c.answered }),
            enabled: false,
          },
        ]
      : []),
    ...(a.config.mode !== 'off'
      ? [
          {
            label: t('tray.autoStop'),
            click: () => actions.setAutoApprove({ mode: 'off' }),
          },
        ]
      : []),
    { type: 'separator' },
    ...AUTO_HOURS.map((hours) => ({
      label: t('tray.autoHours', { hours }),
      click: () => actions.setAutoApprove({ mode: 'hours', hours }),
    })),
    {
      label: t('tray.autoEveryDay', { start: AUTO_DAILY_DEFAULT.start, end: AUTO_DAILY_DEFAULT.end }),
      type: 'checkbox',
      checked: isDailyDefault,
      click: () => actions.setAutoApprove(isDailyDefault ? { mode: 'off' } : { mode: 'daily', ...AUTO_DAILY_DEFAULT }),
    },
    { type: 'separator' },
    { label: t('tray.autoWaits'), enabled: false },
  ]
  return { label: autoApproveLine(snap, extra.now), submenu }
}

export function buildTrayMenu(snap: OfficeSnapshot, extra: TrayExtra, actions: TrayMenuActions): MenuItemConstructorOptions[] {
  const approvals = snap.staff.flatMap((s) => s.approvals.map((a) => ({ ...a, name: s.name })))
  const waitingExternal = snap.staff.filter((s) => s.kind === 'external' && s.status === 'waiting')
  const count = attentionCount(snap)
  const working = snap.staff.filter((s) => s.status === 'working').length
  const items: MenuItemConstructorOptions[] = [
    { label: 'AI Office', enabled: false },
    {
      label: t('tray.summary', { working, count, done: extra.today.done, cost: extra.today.costUsd.toFixed(2) }),
      enabled: false,
    },
    { type: 'separator' },
    autoMenu(snap, extra, actions),
    { type: 'separator' },
  ]
  if (approvals.length) {
    items.push({ label: t('tray.approvalsWaiting', { n: approvals.length }), enabled: false })
    for (const a of approvals.slice(0, APPROVALS_MAX)) {
      const full = `${a.name} — ${a.toolName} ${a.summary}`
      // 질문이거나, 요약이 라벨보다 길어 잘리면 메뉴에서 바로 승인하지 않고 사무실에서 전체를 보고 처리한다 (L2)
      const openOnly = Boolean(a.questions) || full.length > TEXT_MAX
      items.push({
        label: clip(full),
        submenu: openOnly
          ? [{ label: t('tray.openInOffice'), click: () => actions.open(a.staffId) }]
          : [
              { label: t('tray.approve'), click: () => actions.decide(a.id, true) },
              { label: t('tray.reject'), click: () => actions.decide(a.id, false) },
              { label: t('tray.openInOffice'), click: () => actions.open(a.staffId) },
            ],
      })
    }
    if (approvals.length > APPROVALS_MAX)
      items.push({
        label: t('tray.moreApprovals', { n: approvals.length - APPROVALS_MAX }),
        click: () => actions.open(),
      })
    items.push({ type: 'separator' })
  }
  for (const s of waitingExternal)
    items.push({
      label: clip(t('tray.externalWaiting', { name: s.name })),
      click: () => actions.open(s.id),
    })
  const staff = staffMenu(snap, actions)
  if (staff.length) items.push({ label: t('tray.allStaff', { n: snap.staff.length }), submenu: staff }, { type: 'separator' })

  const r = extra.remote
  items.push(
    {
      label: t('tray.stopAll'),
      enabled: working > 0 || snap.staff.some((s) => s.kind === 'hired' && s.status === 'waiting'),
      click: () => actions.stopAll(),
    },
    { label: t('tray.quickTask'), click: () => actions.quickTask() },
    actions.talkToSecretary ? { label: t('tray.talkSecretary'), click: () => actions.talkToSecretary!() } : { label: t('tray.talkSecretarySoon'), enabled: false },
    {
      label: r ? t('tray.phone', { state: r.isListening ? t('tray.phoneOn', { port: r.port }) : r.isEnabled ? t('tray.phoneStarting') : t('tray.phoneOff') }) : t('tray.phoneSoon'),
      enabled: Boolean(r),
      submenu: r
        ? [
            r.isEnabled
              ? {
                  label: t('tray.phoneDisable'),
                  click: () => actions.setRemoteEnabled(false),
                }
              : {
                  label: t('tray.phoneEnable'),
                  click: () => actions.setRemoteEnabled(true),
                },
          ]
        : [],
    },
    { type: 'separator' },
    { label: t('tray.open'), click: () => actions.open() },
    { label: t('tray.quit'), role: 'quit' },
  )
  return items
}

/** 메뉴가 바뀌었는지 비교하는 열쇠 (클릭 함수는 빼고 글자·구조만) */
export function menuKey(items: MenuItemConstructorOptions[]): string {
  const strip = (i: MenuItemConstructorOptions): unknown => [i.label ?? i.type ?? i.role, i.enabled, i.checked, Array.isArray(i.submenu) ? i.submenu.map(strip) : null]
  return JSON.stringify(items.map(strip))
}
