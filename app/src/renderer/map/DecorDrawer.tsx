// 꾸미기 서랍 (김기획 문서 office-iso-levels.md 6-2·6-3절, 작업 C1).
// PC는 "꾸미기" 버튼 아래로 펼치고, 폰(phone:)은 화면 아래에서 올라오는 판. 들고 있으면 폰에서는 카드를 접고 조작 줄만 남긴다.
// 조작은 꾸미기 컨트롤러(iso/decor)가 하고, 여기서는 카드·조작 줄·확인 문구만 그린다
import { useMemo, useState } from 'react'
import { ArchiveIcon, CheckIcon, MoveIcon, PlusIcon, RotateCcwIcon, RotateCwIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IS_TOUCH } from '@/shell'
import { useOffice } from '@/store'
import { useMobileUi } from '@/mobile/ui'
import { pcUpdateText } from '@/mobile/remoteOffice'
import { drawerCount, isGridFurniture, shopItem } from '@shared/economy'
import { FURNITURE_GROUPS, isInGroup, specOf, type FurnitureGroup } from '@shared/iso/furniture'
import { artName, drawThumb } from './iso/isoArt'
import { stowTargets } from '@shared/iso/stowTargets'
import { decor, useDecor } from './iso/decor'
import { useSeatStatus } from './iso/seatStatus'
import { t } from '@shared/i18n'
import { itemName } from '@shared/i18n/names'

const nameOf = (itemId: string) => itemName(itemId, shopItem(itemId)?.name ?? artName(itemId))
const area = (itemId: string) => specOf(itemId).size[0] * specOf(itemId).size[1]

/** 그림은 한 번만 만든다 (카드가 다시 그려질 때마다 캔버스를 만들지 않게) */
const thumbs = new Map<string, string>()
const thumbOf = (itemId: string) => {
  if (!thumbs.has(itemId)) thumbs.set(itemId, drawThumb(itemId).toDataURL())
  return thumbs.get(itemId)!
}

/** PC는 버튼 아래 판, 폰은 화면 아래에서 올라오는 판 */
const PANEL =
  'bg-card text-card-foreground phone:fixed phone:inset-x-0 phone:bottom-0 phone:z-40 phone:w-auto phone:max-h-[55vh] phone:rounded-b-none phone:border-x-0 phone:border-b-0 phone:pb-[env(safe-area-inset-bottom)] flex max-h-[min(70vh,560px)] w-80 flex-col overflow-hidden rounded-lg border shadow-lg'

export function DecorDrawer() {
  const shop = useOffice((s) => s.shop)
  const hold = useDecor((s) => s.hold)
  const [tab, setTab] = useState<FurnitureGroup>('all')
  const [sort, setSort] = useState<'recent' | 'size'>('recent')
  const [isLeftOnly, setIsLeftOnly] = useState(false)
  // 폰이 예전 PC에 붙었으면 칸 배치를 못 한다 — 카드 대신 안내만 (데스크톱은 늘 false)
  const isPcOutdated = useMobileUi((s) => s.isPcOutdated)

  // 산 순서 = owned에 처음 들어간 순서 → 최근 산 것이 앞
  const cards = useMemo(() => {
    const ids = Object.keys(shop.owned)
      .filter((id) => shop.owned[id] > 0 && isGridFurniture(id))
      .reverse()
    const list = ids
      .map((id) => ({ id, owned: shop.owned[id], left: drawerCount(shop, id) }))
      .filter((c) => isInGroup(c.id, tab) && (!isLeftOnly || c.left > 0))
    return sort === 'size' ? list.sort((a, b) => area(b.id) - area(a.id)) : list
  }, [shop, tab, sort, isLeftOnly])

  if (isPcOutdated)
    return (
      <div role="region" aria-label={t('drawer.title')} className={PANEL}>
        <Bar tone="warn" text={pcUpdateText()} />
      </div>
    )

  return (
    <div
      role="region"
      aria-label={t('drawer.title')}
      className={PANEL}
    >
      <ActionBar />
      {/* 폰은 들고 있는 동안 카드를 접어 맵을 넓게 */}
      <div className={cn('flex min-h-0 flex-col', hold && 'phone:hidden')}>
        <div className="flex flex-wrap gap-1 border-b p-2">
          {FURNITURE_GROUPS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setTab(g.value)}
              className={cn('phone:min-h-10 rounded-full border px-2.5 py-0.5 text-xs', tab === g.value ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')}
            >
              {t(`drawer.group.${g.value}`)}
            </button>
          ))}
          <Button size="sm" variant="outline" className="phone:min-h-10 mt-1 w-full" onClick={() => useDecor.setState({ clearAsk: true })} disabled={(shop.grid ?? []).length === 0}>
            <Trash2Icon /> {t('drawer.clearAll')}
          </Button>
          <div className="text-muted-foreground flex w-full items-center gap-2 pt-1 text-xs">
            <button type="button" onClick={() => setSort(sort === 'recent' ? 'size' : 'recent')} className="phone:min-h-10 underline-offset-2 hover:underline">
              {sort === 'recent' ? t('drawer.sortRecent') : t('drawer.sortSize')}
            </button>
            <label className="ml-auto flex items-center gap-1">
              <input type="checkbox" checked={isLeftOnly} onChange={(e) => setIsLeftOnly(e.target.checked)} /> {t('drawer.leftOnly')}
            </label>
          </div>
        </div>
        <div className="phone:grid-cols-3 grid min-h-0 grid-cols-2 gap-2 overflow-y-auto p-2">
          {cards.map((c) => (
            <DrawerCard key={c.id} itemId={c.id} owned={c.owned} left={c.left} isHeld={hold?.itemId === c.id} />
          ))}
          {cards.length === 0 && <p className="text-muted-foreground col-span-full p-2 text-xs">{t('drawer.empty')}</p>}
        </div>
      </div>
    </div>
  )
}

function DrawerCard({ itemId, owned, left, isHeld }: { itemId: string; owned: number; left: number; isHeld: boolean }) {
  const [w, d] = specOf(itemId).size
  const isAllPlaced = left <= 0
  // 남은 게 없으면 놓인 자리를 깜빡여 보여 준다
  const handleClick = () => (isAllPlaced ? decor()?.flash(itemId) : decor()?.take(itemId))
  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('bg-background hover:bg-accent flex flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs', isAllPlaced && 'opacity-50', isHeld && 'border-primary')}
    >
      <img src={thumbOf(itemId)} alt="" className="h-12 max-w-full object-contain [image-rendering:pixelated]" />
      <span className="w-full truncate font-medium">{nameOf(itemId)}</span>
      <span className="text-muted-foreground">
        {t('drawer.cells', { w, d })} · {isAllPlaced ? t('drawer.allPlaced') : t('drawer.leftOf', { left, owned })}
      </span>
    </button>
  )
}

/** 들고 있을 때·고른 가구가 있을 때의 조작 줄 + 자리 모자람 안내. 폰 버튼은 손가락 크기(40px) */
function ActionBar() {
  const shop = useOffice((s) => s.shop)
  const { hold, selected, stowAsk, message, autoSeats, clearAsk, undo } = useDecor()
  const seatShort = useSeatStatus((s) => (s.isAutoOff ? s.short : 0))
  const d = decor()
  const btn = 'h-10 min-w-10'

  if (clearAsk) return <ClearAsk />

  if (stowAsk)
    return (
      <Bar tone="warn" text={t('drawer.stowAsk', { short: stowAsk.short })}>
        <Button size="sm" className={btn} onClick={() => d?.stow(true)}>
          {t('drawer.stow')}
        </Button>
        <Button size="sm" variant="outline" className={btn} onClick={() => useDecor.setState({ stowAsk: null })}>
          {t('common.cancel')}
        </Button>
      </Bar>
    )

  if (hold) {
    const hint = IS_TOUCH ? t('drawer.hintTouch') : t('drawer.hintDesktop')
    const canAgain = !hold.uid && drawerCount(shop, hold.itemId) > 1
    return (
      <Bar tone={hold.ok ? 'ok' : 'bad'} title={nameOf(hold.itemId)} text={message ?? hold.reason ?? hint}>
        <Button size="icon" variant="outline" className={btn} onClick={() => d?.rotate()} aria-label={t('drawer.rotate')}>
          <RotateCwIcon />
        </Button>
        <Button size="icon" className={btn} onClick={() => d?.confirm()} disabled={!hold.ok} aria-label={t('drawer.place')}>
          <CheckIcon />
        </Button>
        {canAgain && (
          <Button size="sm" variant="outline" className={btn} onClick={() => d?.confirm(true)} disabled={!hold.ok}>
            <PlusIcon /> {t('drawer.another')}
          </Button>
        )}
        {hold.uid && (
          <Button size="icon" variant="outline" className={btn} onClick={() => d?.stow()} aria-label={t('drawer.stowItem')}>
            <ArchiveIcon />
          </Button>
        )}
        <Button size="icon" variant="ghost" className={btn} onClick={() => d?.cancel()} aria-label={t('common.cancel')}>
          <XIcon />
        </Button>
      </Bar>
    )
  }

  if (selected)
    return (
      <Bar tone="ok" title={nameOf(selected.itemId)} text={message ?? (IS_TOUCH ? t('drawer.selectedHintTouch') : t('drawer.selectedHintDesktop'))}>
        <Button size="sm" variant="outline" className={btn} onClick={() => d?.pickUp(selected.uid)}>
          <MoveIcon /> {t('drawer.move')}
        </Button>
        <Button size="icon" variant="outline" className={btn} onClick={() => d?.rotate()} aria-label={t('drawer.rotate')}>
          <RotateCwIcon />
        </Button>
        <Button size="sm" variant="outline" className={btn} onClick={() => d?.stow()}>
          <ArchiveIcon /> {t('drawer.toDrawer')}
        </Button>
        <Button size="icon" variant="ghost" className={btn} onClick={() => d?.select(null)} aria-label={t('drawer.deselect')}>
          <XIcon />
        </Button>
      </Bar>
    )

  if (message) return <Bar tone="bad" text={message} />
  if (undo)
    return (
      <Bar tone="ok" text={t('drawer.stowed', { n: undo.length }) + (seatShort > 0 ? t('drawer.stowedShort', { n: seatShort }) : '')}>
        <Button size="sm" variant="outline" className={btn} onClick={() => d?.undoClear()}>
          <RotateCcwIcon /> {t('drawer.undo')}
        </Button>
      </Bar>
    )
  if (seatShort > 0) return <Bar tone="warn" text={t('drawer.seatShort', { n: seatShort })} />
  if (autoSeats > 0) return <Bar tone="warn" text={t('drawer.autoSeats', { n: autoSeats })} />
  return null
}

/** 전부 치우기 확인 창: 범위·직원 자리 남기기·넣을 가구 수 */
function ClearAsk() {
  const grid = useOffice((s) => s.shop.grid ?? [])
  const viewFloor = useOffice((s) => s.viewFloor)
  const [scope, setScope] = useState<'floor' | 'all'>('all')
  const [keepSeats, setKeepSeats] = useState(true)
  const count = stowTargets(grid, scope === 'floor' ? viewFloor : null, keepSeats).length
  const btn = 'h-10 min-w-10'
  return (
    <div role="alertdialog" aria-label={t('drawer.clearAll')} className="flex flex-col gap-2 border-b p-2 text-xs">
      <p className="font-semibold">{t('drawer.clearTitle')}</p>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="clear-scope" checked={scope === 'all'} onChange={() => setScope('all')} /> {t('drawer.scopeAll')}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="clear-scope" checked={scope === 'floor'} onChange={() => setScope('floor')} /> {t('drawer.scopeFloor', { floor: viewFloor })}
        </label>
        <label className="flex items-center gap-1.5 pt-1">
          <input type="checkbox" checked={keepSeats} onChange={(e) => setKeepSeats(e.target.checked)} /> {t('drawer.keepSeats')}
        </label>
      </div>
      <p className={count > 0 ? 'text-status-waiting' : 'text-muted-foreground'}>{count > 0 ? t('drawer.clearCount', { n: count }) : t('drawer.clearNone')}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className={btn} disabled={count === 0} onClick={() => decor()?.clearAll(scope, keepSeats)}>
          {t('drawer.clearDo')}
        </Button>
        <Button size="sm" variant="outline" className={btn} onClick={() => useDecor.setState({ clearAsk: false })}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}

const TONE = { ok: 'text-status-working', bad: 'text-status-error', warn: 'text-status-waiting' } as const

function Bar({ tone, title, text, children }: { tone: keyof typeof TONE; title?: string; text: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-2 border-b p-2">
      <p className="text-xs">
        {title && <span className="mr-1.5 font-semibold">{title}</span>}
        <span className={TONE[tone]}>{text}</span>
      </p>
      {children && <div className="flex flex-wrap gap-1.5">{children}</div>}
    </div>
  )
}
