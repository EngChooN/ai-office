import { useEffect, useState } from 'react'
import { BookOpenIcon, CameraIcon, CompassIcon, FilePenIcon, LockIcon, PlugIcon, SearchIcon, SparklesIcon, TerminalIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Equipment, EquipmentCatalog, Staff } from '@shared/types'
import { changedRows, levelOf, policyLevels, policyRow, withLevel, type PolicyLevel, type PolicyRowId } from '@shared/toolPolicyRows'
import { McpSection } from './McpSection'
import { NotOnWindows } from '@/components/not-on-windows'
import { t } from '@shared/i18n'
import type { TKey } from '@shared/i18n'
import { PcOnlyState } from '@/components/pc-only-state'
import { IS_REMOTE_SCREEN } from '@/shell'

const LEVEL_LABEL: Record<PolicyLevel, TKey> = { block: 'policy.level.block', ask: 'policy.level.ask', auto: 'policy.level.auto' }

/** 개발자용 자세히: 고른 칸이 실제로 허용·금지하는 도구 이름 (영어 도구 이름은 여기에만) */
const DETAIL: Partial<Record<`${PolicyRowId}.${PolicyLevel}`, TKey>> = {
  'edit.auto': 'equipment.preset.autoEdit.detail',
  'web.block': 'equipment.preset.noWeb.detail',
  'web.auto': 'equipment.preset.autoWeb.detail',
  'shell.block': 'equipment.preset.noShell.detail',
  'shell.auto': 'equipment.preset.autoShell.detail',
  'readOnly.auto': 'equipment.preset.autoRead.detail',
  'risky.block': 'equipment.preset.noRisky.detail',
  'capture.auto': 'equipment.preset.autoCapture.detail',
}
const ROW_TITLE: Record<PolicyRowId, TKey> = {
  edit: 'policy.edit.title',
  web: 'policy.web.title',
  shell: 'policy.shell.title',
  readOnly: 'policy.readOnly.title',
  risky: 'policy.risky.title',
  capture: 'policy.capture.title',
}

function Chip({ isOn, onClick, children, title, disabled }: { isOn: boolean; onClick: () => void; children: React.ReactNode; title?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} className={cn('rounded-md border px-2 py-1 text-left text-xs disabled:opacity-60', isOn && 'border-primary bg-accent')}>
      {children}
    </button>
  )
}

/** 일 하나에 카드 한 장: 아이콘·제목·한 줄 설명, 아래에 고르는 칸 */
export function EquipCard({ icon, title, desc, badge, children }: { icon: React.ReactNode; title: string; desc?: string; badge?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="bg-card flex flex-col gap-2.5 rounded-xl border p-3">
      <div className="flex items-start gap-2.5">
        <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {desc && <p className="text-muted-foreground text-xs">{desc}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}

/** [막기 · 결재 받기 · 결재 없이] — 묶음이 없는 칸은 빼고. 저장값이 칸 하나로 안 정해지면 아무 칸도 고르지 않고 '직접 고름' */
function LevelPicker({ id, eq, setEq, disabled }: { id: PolicyRowId; eq: Equipment; setEq: React.Dispatch<React.SetStateAction<Equipment>>; disabled?: boolean }) {
  const row = policyRow(id)
  const state = levelOf(eq, row)
  return (
    <div className="flex flex-col gap-1">
      <div className="bg-muted flex rounded-lg p-0.5" role="radiogroup" aria-label={t(ROW_TITLE[id])}>
        {policyLevels(row).map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={state === level}
            disabled={disabled}
            onClick={() => setEq((e) => withLevel(e, row, level))}
            className={cn(
              'focus-ring flex-1 rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-60',
              state === level ? cn('bg-background shadow-sm', level === 'auto' && 'text-status-working', level === 'block' && 'text-destructive') : 'text-muted-foreground',
            )}
          >
            {t(LEVEL_LABEL[level])}
          </button>
        ))}
      </div>
      {state === 'custom' && (
        <p className="text-muted-foreground text-[11px]">
          <b className="text-foreground">{t('policy.custom')}</b> · {t('policy.custom.hint')}
        </p>
      )}
    </div>
  )
}

/** 체크 칸 하나로 고르는 행 (보기만 하는 실행 = 결재 없이, 위험한 것 = 막기) */
function LevelCheck({ id, on, eq, setEq, desc, disabled }: { id: PolicyRowId; on: PolicyLevel; eq: Equipment; setEq: React.Dispatch<React.SetStateAction<Equipment>>; desc: string; disabled?: boolean }) {
  const row = policyRow(id)
  return (
    <label className={cn('flex items-center gap-2 text-xs', disabled && 'opacity-60')}>
      <input type="checkbox" checked={levelOf(eq, row) === on} disabled={disabled} onChange={(e) => setEq((x) => withLevel(x, row, e.target.checked ? on : 'ask'))} />
      <span>
        <span className="font-medium">{t(ROW_TITLE[id])}</span> <span className="text-muted-foreground">{desc}</span>
      </span>
    </label>
  )
}

/** 장비 지급: 일마다 카드 한 장(파일·인터넷·프로그램·브라우저·연결된 서비스·화면 찍기·매뉴얼). 바꾸면 다음 지시부터 새 장비로 일한다 */
export function EquipmentTab({ staff }: { staff: Staff }) {
  const [catalog, setCatalog] = useState<EquipmentCatalog | null>(null)
  const [eq, setEq] = useState<Equipment>(staff.equipment)
  const isDirty = JSON.stringify(eq) !== JSON.stringify(staff.equipment)

  useEffect(() => {
    void window.office.equipmentCatalog(staff.cwd).then(setCatalog)
  }, [staff.cwd])
  // 브라우저 자동 허용은 결재 카드·직원 요청으로도 바뀐다 — 열어 둔 탭에도 따라 바꿔 저장할 때 되돌리지 않게
  useEffect(() => setEq((e) => ({ ...e, browserAuto: staff.equipment.browserAuto })), [staff.equipment.browserAuto])

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  // 바꾼 것 수: 권한 행 + 그 밖의 장비 칸 (연결된 서비스 결재 없이 쓰기는 allowedTools라 '연결된 서비스' 한 칸으로 센다)
  const others = (['mcpServers', 'skills', 'lightModelOff', 'shellNetwork', 'browserAuto'] as const).filter((k) => JSON.stringify(eq[k] ?? null) !== JSON.stringify(staff.equipment[k] ?? null)).length
  const changed = isDirty ? Math.max(1, changedRows(staff.equipment, eq) + others) : 0
  // 월 예산은 없앴다 (실제 한도는 엔진 플랜 사용률이 정한다) — 예전에 정한 값도 지운다
  const handleSave = () => void window.office.setEquipment(staff.id, { ...eq, monthlyBudgetUsd: 0 })
  // 도구 허용·금지는 PC에서만 (PC가 휴대폰에서 온 값을 버린다) — 휴대폰은 지금 상태만 보여 준다
  const isLocked = IS_REMOTE_SCREEN
  const pcBadge = isLocked ? (
    <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px]" title={t('pcOnly.hint')}>
      <LockIcon className="size-2.5" /> PC
    </span>
  ) : undefined
  const isShellBlocked = levelOf(eq, policyRow('shell')) === 'block'
  const editLevel = levelOf(eq, policyRow('edit'))
  const details = (Object.keys(DETAIL) as (keyof typeof DETAIL)[]).filter((k) => {
    const [id, level] = k.split('.') as [PolicyRowId, PolicyLevel]
    return levelOf(eq, policyRow(id)) === level
  })

  return (
    <section data-split-rest className="flex min-h-0 flex-1 flex-col overflow-y-auto text-sm">
      <div className="flex flex-col gap-3 p-4">
        <p className="text-muted-foreground text-xs">{t('equipment.intro')}</p>
        {isLocked && <PcOnlyState />}

        <EquipCard icon={<FilePenIcon />} title={t('policy.edit.title')} desc={t('policy.edit.desc')} badge={pcBadge}>
          <LevelPicker id="edit" eq={eq} setEq={setEq} disabled={isLocked} />
          {editLevel === 'auto' && (
            <p className="text-status-waiting flex items-start gap-1 text-[11px]">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
              {t('policy.edit.autoWarn')}
            </p>
          )}
          {/* 결재 방식(acceptEdits)은 고용 때 정해지고 효과가 다르다 — 범위를 말로 알린다 */}
          {editLevel !== 'auto' && staff.approvalMode === 'acceptEdits' && <p className="text-muted-foreground text-[11px]">{t('policy.edit.profileNote')}</p>}
        </EquipCard>

        <EquipCard icon={<SearchIcon />} title={t('policy.web.title')} desc={t('policy.web.desc')} badge={pcBadge}>
          <LevelPicker id="web" eq={eq} setEq={setEq} disabled={isLocked} />
        </EquipCard>

        <EquipCard icon={<TerminalIcon />} title={t('policy.shell.title')} desc={t('policy.shell.desc')} badge={pcBadge}>
          <LevelPicker id="shell" eq={eq} setEq={setEq} disabled={isLocked} />
          {levelOf(eq, policyRow('shell')) === 'auto' && <p className="text-status-waiting text-[11px]">{t('policy.shell.autoHint')}</p>}
          <LevelCheck id="readOnly" on="auto" eq={eq} setEq={setEq} desc={t('policy.readOnly.desc')} disabled={isLocked || isShellBlocked} />
          <LevelCheck id="risky" on="block" eq={eq} setEq={setEq} desc={t('policy.risky.desc')} disabled={isLocked || isShellBlocked} />
          {isShellBlocked && <p className="text-muted-foreground text-[11px]">{t('policy.shell.blockedNote')}</p>}
          {/* 명령 실행 중 인터넷은 GPT(Codex) 직원만 — Claude 직원은 샌드박스가 달라 해당 없다 */}
          {staff.provider === 'codex' && (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={eq.shellNetwork === true} onChange={(e) => setEq((x) => ({ ...x, shellNetwork: e.target.checked }))} />
              <span>
                {t('equipment.shellNetwork')}
                <span className="text-muted-foreground block">{t('equipment.shellNetwork.hint')}</span>
              </span>
            </label>
          )}
        </EquipCard>

        {/* 브라우저 자동 허용: 자동결재·자율 진행 중 브라우저 조작을 결재 없이 (PC에서만 바꾼다 — 휴대폰 값은 PC가 무시한다) */}
        {!IS_REMOTE_SCREEN && (
          <EquipCard icon={<CompassIcon />} title={t('policy.browser.title')} desc={t('policy.browser.desc')}>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={eq.browserAuto === true} onChange={(e) => setEq((x) => ({ ...x, browserAuto: e.target.checked }))} />
              <span>
                {t('equipment.browserAuto')}
                <span className="text-muted-foreground block">{t('equipment.browserAuto.hint')}</span>
              </span>
            </label>
          </EquipCard>
        )}

        <EquipCard icon={<PlugIcon />} title={t('equipment.mcp.title')}>
          <McpSection cwd={staff.cwd} eq={eq} setEq={setEq} catalog={catalog} setCatalog={setCatalog} provider={staff.provider} />
        </EquipCard>

        <EquipCard icon={<CameraIcon />} title={t('policy.capture.title')} desc={t('policy.capture.desc')} badge={pcBadge}>
          <NotOnWindows reason={t('equipment.tools.captureMacOnly')} />
          <LevelPicker id="capture" eq={eq} setEq={setEq} disabled={isLocked} />
        </EquipCard>

        <EquipCard icon={<BookOpenIcon />} title={t('equipment.skills.title')}>
          <Chip isOn={eq.skills === 'all'} onClick={() => setEq((e) => ({ ...e, skills: e.skills === 'all' ? [] : 'all' }))}>
            {t('equipment.skills.all')}
          </Chip>
          {eq.skills !== 'all' && (
            <div className="flex flex-wrap gap-1">
              {catalog?.skills.length === 0 && <p className="text-muted-foreground text-xs">{t('equipment.skills.empty')}</p>}
              {catalog?.skills.map((sk) => (
                <Chip
                  key={`${sk.source}-${sk.name}`}
                  isOn={(eq.skills as string[]).includes(sk.name)}
                  onClick={() => setEq((e) => ({ ...e, skills: toggleIn(e.skills as string[], sk.name) }))}
                  title={sk.description}
                >
                  {sk.name}
                </Chip>
              ))}
            </div>
          )}
        </EquipCard>

        {/* 가벼운 모델(Haiku) 자동 전환은 Claude 직원만 — GPT 직원에겐 효과가 없어 숨긴다 (hired.ts pickModel) */}
        {staff.provider === 'claude' && (
          <EquipCard icon={<SparklesIcon />} title={t('policy.ai.title')}>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!eq.lightModelOff} onChange={(e) => setEq((x) => ({ ...x, lightModelOff: !e.target.checked }))} />
              {t('equipment.lightModel')}
            </label>
          </EquipCard>
        )}

        {details.length > 0 && (
          <details className="text-muted-foreground text-[11px]">
            <summary className="cursor-pointer py-0.5">{t('equipment.preset.detailTitle')}</summary>
            <ul className="mt-1 list-disc pl-4">
              {details.map((k) => (
                <li key={k}>
                  <b>{t(ROW_TITLE[k.split('.')[0] as PolicyRowId])}</b> — {t(DETAIL[k]!)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* '이대로 지급' 줄은 아래에 붙어 있어 저장 버튼을 찾아 내려가지 않아도 된다 */}
      <div className="bg-card/95 sticky bottom-0 mt-auto flex items-center gap-3 border-t px-4 py-2.5 backdrop-blur">
        <div className="min-w-0 flex-1 text-[11px]">
          {changed > 0 && <b className="block text-xs">{t('equipment.changed', { n: changed })}</b>}
          <span className="text-muted-foreground">{t('equipment.saveNote')}</span>
        </div>
        <Button size="sm" disabled={!isDirty} onClick={handleSave}>
          {t('equipment.save')}
        </Button>
      </div>
    </section>
  )
}
