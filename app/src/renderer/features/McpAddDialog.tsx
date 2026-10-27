import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { t } from '@shared/i18n'
import { parseCustomMcp } from '@shared/customMcp'
import type { CustomMcp, CustomMcpInput } from '@shared/customMcp'
import type { EquipmentMcp } from '@shared/types'

// 장비 탭 › 연결 도구 추가·고치기 (PC 전용): 명령 / 주소(URL) / JSON 붙여넣기
// 검사는 main(parseCustomMcp)이 하고, 거절 문구(mcp.err.*)를 칸 아래에 그대로 보여 준다. 추가해도 자동으로 켜지 않는다

export type McpAddTab = 'command' | 'url' | 'json'
type Pair = { key: string; value: string }

const toPairs = (map?: Record<string, string>): Pair[] => Object.entries(map ?? {}).map(([key, value]) => ({ key, value }))
const toMap = (pairs: Pair[]) => {
  const filled = pairs.filter((p) => p.key.trim())
  return filled.length ? Object.fromEntries(filled.map((p) => [p.key.trim(), p.value])) : undefined
}
const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '') : String(e))
/** JSON에 설정 하나만 붙였으면 이름을 따로 받아야 한다 */
const isSingleConfig = (json: string) => {
  try {
    const data = JSON.parse(json)
    return typeof data?.command === 'string' || typeof data?.url === 'string'
  } catch {
    return false
  }
}

export function McpAddDialog({
  isOpen,
  onOpenChange,
  initialTab,
  editing,
  others,
  onSaved,
}: {
  isOpen: boolean
  onOpenChange: (v: boolean) => void
  initialTab: McpAddTab
  /** 고칠 항목 (없으면 새로 추가) */
  editing: CustomMcp | null
  /** 이름 겹침 경고용 — 직접 추가가 아닌 출처의 목록 */
  others: EquipmentMcp[]
  onSaved: (list: CustomMcp[]) => void
}) {
  const [tab, setTab] = useState<McpAddTab>(initialTab)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [env, setEnv] = useState<Pair[]>([])
  const [url, setUrl] = useState('')
  const [transport, setTransport] = useState<'http' | 'sse'>('http')
  const [headers, setHeaders] = useState<Pair[]>([])
  const [json, setJson] = useState('')
  const [isSecretShown, setIsSecretShown] = useState(false)
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  // 열 때마다 비우고, 고치기면 저장된 값으로 채운다
  useEffect(() => {
    if (!isOpen) return
    const c = editing?.config
    const isUrl = Boolean(c && 'url' in c)
    setTab(editing ? (isUrl ? 'url' : 'command') : initialTab)
    setName(editing?.name ?? '')
    setCommand(c && 'command' in c ? c.command : '')
    setArgsText(c && 'command' in c ? (c.args ?? []).join('\n') : '')
    setEnv(c && 'command' in c ? toPairs(c.env) : [])
    setUrl(c && 'url' in c ? c.url : '')
    setTransport(c && 'url' in c && c.type === 'sse' ? 'sse' : 'http')
    setHeaders(c && 'url' in c ? toPairs(c.headers) : [])
    setJson('')
    setIsSecretShown(false)
    setError('')
  }, [isOpen, editing, initialTab])

  const input: CustomMcpInput =
    tab === 'command'
      ? { kind: 'command', name, command, args: argsText.split('\n').filter((a) => a.trim()), env: toMap(env) }
      : tab === 'url'
        ? { kind: 'url', name, url, transport, headers: toMap(headers) }
        : { kind: 'json', json, ...(name ? { name } : {}) }
  // 미리 읽기: 화면에서도 같은 검사를 돌려 개수·이름 겹침을 보여 준다 (저장 거절은 main 문구로 다시 보여 준다)
  let preview: CustomMcp[] = []
  let previewError = ''
  try {
    preview = parseCustomMcp(input, 0)
  } catch (e) {
    previewError = errorText(e)
  }
  const isNameShown = tab !== 'json' || isSingleConfig(json)
  const shadows = preview.flatMap((m) => others.filter((o) => o.name === m.name).map((o) => ({ name: m.name, source: o.source })))

  const handleSubmit = async () => {
    setIsBusy(true)
    try {
      onSaved(await window.office.saveCustomMcp(input, editing?.name))
      onOpenChange(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t('mcpAdd.editTitle') : t('mcpAdd.title')}</DialogTitle>
        </DialogHeader>
        {!editing && (
          <div className="flex gap-1">
            {(['command', 'url', 'json'] as const).map((k) => (
              <Button key={k} size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => (setTab(k), setError(''))}>
                {t(`mcpAdd.tab.${k}`)}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 text-sm">
          {tab === 'json' && (
            <label className="flex flex-col gap-1">
              <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={7} className="font-mono text-xs" placeholder='{ "mcpServers": { "jira": { … } } }' />
              <span className="text-muted-foreground text-xs">{t('mcpAdd.json.hint')}</span>
              {json.trim() && preview.length > 0 && (
                <span className="text-xs">
                  {preview.map((m) => `${m.name} (${'url' in m.config ? t('mcpAdd.kind.url') : t('mcpAdd.kind.command')})`).join(' · ')} — <b>{t('mcpAdd.json.preview', { n: preview.length })}</b>
                </span>
              )}
            </label>
          )}

          {isNameShown && (
            <label className="flex flex-col gap-1">
              {t('mcpAdd.name')}
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 font-mono" />
              <span className="text-muted-foreground text-xs">{t('mcpAdd.name.hint')}</span>
            </label>
          )}

          {tab === 'command' && (
            <>
              <label className="flex flex-col gap-1">
                {t('mcpAdd.command')}
                <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" className="h-8 font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                {t('mcpAdd.args')}
                <Textarea value={argsText} onChange={(e) => setArgsText(e.target.value)} rows={3} placeholder={'-y\n@org/mcp-server'} className="font-mono text-xs" />
              </label>
              <PairRows label={t('mcpAdd.env')} pairs={env} setPairs={setEnv} isSecretShown={isSecretShown} keyPlaceholder="API_KEY" />
            </>
          )}

          {tab === 'url' && (
            <>
              <label className="flex flex-col gap-1">
                {t('mcpAdd.url')}
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/mcp" className="h-8 font-mono" />
              </label>
              <div className="flex items-center gap-3 text-xs">
                {t('mcpAdd.transport')}
                {(['http', 'sse'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1">
                    <input type="radio" checked={transport === k} onChange={() => setTransport(k)} /> {k}
                  </label>
                ))}
              </div>
              <PairRows label={t('mcpAdd.headers')} pairs={headers} setPairs={setHeaders} isSecretShown={isSecretShown} keyPlaceholder="Authorization" />
            </>
          )}

          {tab !== 'json' && (
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input type="checkbox" checked={isSecretShown} onChange={(e) => setIsSecretShown(e.target.checked)} /> {t('mcpAdd.showSecrets')}
            </label>
          )}

          {shadows.map((s) => (
            <p key={`${s.source}-${s.name}`} className="text-status-waiting text-xs">
              ⚠ {t('mcpAdd.shadow', { source: s.source, name: s.name })}
            </p>
          ))}
          {/* JSON은 붙여 넣는 대로 읽은 결과를, 나머지는 추가를 눌렀을 때 거절 이유를 보여 준다 */}
          {(error || (tab === 'json' && json.trim() && previewError)) && <p className="text-status-error text-xs">⚠ {error || previewError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={isBusy} onClick={() => void handleSubmit()}>
            {editing ? t('mcpAdd.save') : t('mcpAdd.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 환경 변수·헤더 입력 줄 — 값은 비밀일 수 있어 기본으로 가린다 */
function PairRows({ label, pairs, setPairs, isSecretShown, keyPlaceholder }: { label: string; pairs: Pair[]; setPairs: (p: Pair[]) => void; isSecretShown: boolean; keyPlaceholder: string }) {
  const update = (i: number, patch: Partial<Pair>) => setPairs(pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="flex flex-col gap-1">
      {label}
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input value={p.key} onChange={(e) => update(i, { key: e.target.value })} placeholder={keyPlaceholder} className="h-8 w-40 font-mono" />=
          <Input type={isSecretShown ? 'text' : 'password'} value={p.value} onChange={(e) => update(i, { value: e.target.value })} className="h-8 flex-1 font-mono" />
          <Button size="sm" variant="ghost" onClick={() => setPairs(pairs.filter((_, j) => j !== i))}>
            ✕
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="w-fit" onClick={() => setPairs([...pairs, { key: '', value: '' }])}>
        {t('mcpAdd.addRow')}
      </Button>
    </div>
  )
}
