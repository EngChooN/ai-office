import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CheckIcon, GiftIcon, LockIcon, PackageIcon, ShoppingBagIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import {
  dailyDeals,
  drawerCount,
  formatWon,
  isGridCategory,
  isInSeason,
  isSetComplete,
  priceOf,
  RARITY_LABEL,
  SHOP_ITEMS,
  SHOP_SETS,
  ZONE_LABEL,
  shopItem,
  type LedgerRow,
  type MissionProgress,
  type MissionsView,
  type Rarity,
  type ShopCategory,
  type ShopItem,
  type Zone,
} from '@shared/economy'
import { drawChairEmpty, drawDesk, type ChairStyle, type DeskStyle } from '@/map/sprites'
import { useDecor } from '@/map/iso/decor'
import { drawSurfaceThumb, drawThumb } from '@/map/iso/isoArt'
import { fmtDate, fmtNumber, t, type TKey } from '@shared/i18n'

type Tab = 'deals' | ShopCategory | 'collection' | 'missions' | 'ledger'
const TABS: Tab[] = ['deals', 'furniture', 'level', 'wallpaper', 'floor', 'desk', 'chair', 'collection', 'missions', 'ledger']
const TAB_LABEL: Record<Tab, TKey> = {
  deals: 'shop.tab.deals',
  furniture: 'shop.tab.furniture',
  level: 'shop.tab.level',
  wallpaper: 'shop.tab.wallpaper',
  floor: 'shop.tab.floor',
  desk: 'shop.tab.desk',
  chair: 'shop.tab.chair',
  collection: 'shop.tab.collection',
  missions: 'shop.tab.missions',
  ledger: 'shop.tab.ledger',
}
/** 벽지는 위쪽 벽이 있는 구역에만. 칸 사무실에는 휴게실 구역이 따로 없어 업무 구역(방 전체)·회의실만 (예전에 고른 휴게실 바닥은 저장값에 그대로 둔다) */
const ZONES_FOR: Record<'wallpaper' | 'floor', Zone[]> = { wallpaper: ['work', 'meeting'], floor: ['work', 'meeting'] }
const isSurface = (item: ShopItem) => item.category === 'wallpaper' || item.category === 'floor'
const RARITY_STYLE: Record<Rarity, string> = { common: '', rare: 'border-accent-a/60', legend: 'border-status-waiting shadow-[0_0_12px_color-mix(in_oklab,var(--status-waiting)_25%,transparent)]' }
// 글자 토큰은 카드 바탕 기준으로 대비를 맞춘 색 → 배지 바탕도 bg-card로 (그림 위 반투명 검정이면 라이트에서 어두운 글자가 묻힌다)
const RARITY_TEXT: Record<Rarity, string> = { common: 'text-muted-foreground', rare: 'text-accent-a', legend: 'text-status-waiting' }
const NOTICE_MS = 3500

/** 벽지·바닥 견본 (CSS 배경) */
export const SWATCH: Record<string, string> = {
  'wall-cream': '#f4ead6',
  'wall-polka': 'radial-gradient(#f08aa8 2px, #fbe4ec 2px) 0 0 / 12px 12px',
  'wall-brick': 'repeating-linear-gradient(0deg, #8a4430 0 1px, #b05a3c 1px 8px)',
  'wall-wave': 'repeating-linear-gradient(170deg, #6ab4e0 0 2px, #d8ecf8 2px 12px)',
  'wall-stripe': 'repeating-linear-gradient(90deg, #a8dcc8 0 6px, #dcf0ea 6px 16px)',
  'wall-concrete': 'linear-gradient(#989aa0 1px, #a8aab0 1px) 0 0 / 100% 24px',
  'wall-forest': 'radial-gradient(#6aa85a 3px, #cfe8c4 3px) 0 0 / 16px 10px',
  'wall-navy': 'repeating-linear-gradient(90deg, #283250 0 2px, #34405e 2px 40px)',
  'wall-sunset': 'linear-gradient(180deg, #f8c070, #9a6ab8)',
  'wall-wood': 'repeating-linear-gradient(90deg, #a87a4c 0 2px, #d0a070 2px 8px)',
  'wall-glass': 'linear-gradient(180deg, #c8e4f4, #a8d0ea)',
  'wall-gold': 'radial-gradient(#c8a030 3px, #6a4a20 3px) 0 0 / 14px 14px',
  'wall-galaxy': 'radial-gradient(#ffffff 1px, transparent 1px) 0 0 / 9px 11px, linear-gradient(#1c1838, #3a2a6a)',
  'wall-halloween': 'radial-gradient(#f08a3a 4px, #3a2a4a 4px) 0 0 / 22px 22px',
  'wall-xmas': 'repeating-linear-gradient(90deg, #c83a3a 0 12px, #f4f0ea 12px 24px)',
  'floor-vinyl': 'repeating-linear-gradient(0deg, #d4c4a6 0 1px, #e8dcc4 1px 16px)',
  'floor-cork': 'radial-gradient(#a87e50 1px, #c8a070 1px) 0 0 / 5px 5px',
  'floor-checker': 'repeating-conic-gradient(#3a3e4a 0 25%, #f0f0f4 0 50%) 0 0 / 24px 24px',
  'floor-bluecarpet': '#3e4c82',
  'floor-terrazzo': 'radial-gradient(#e8835a 1.5px, transparent 1.5px) 0 0 / 9px 9px, radial-gradient(#5ab4e8 1.5px, #ece8e0 1.5px) 4px 4px / 11px 11px',
  'floor-carpet': '#8f95a5',
  'floor-hex': 'repeating-linear-gradient(60deg, #b8bac6 0 1px, #dcdce4 1px 12px)',
  'floor-grass': 'radial-gradient(#7cbc6a 1px, #6aa85a 1px) 0 0 / 6px 6px',
  'floor-parquet': 'repeating-linear-gradient(45deg, #c89a68 0 8px, #b8885a 8px 16px)',
  'floor-marble': 'linear-gradient(135deg, #f6f6f8 40%, #d4d6de 42%, #f6f6f8 44%)',
  'floor-gold': 'repeating-conic-gradient(#d8b040 0 25%, #e8c858 0 50%) 0 0 / 24px 24px',
  'floor-cloud': 'radial-gradient(#ffffff 8px, #9ad0f4 9px) 0 0 / 30px 20px',
  'floor-leaves': 'radial-gradient(#e8835a 2px, transparent 2px) 0 0 / 8px 8px, radial-gradient(#f0c84a 2px, #b8884a 2px) 4px 4px / 9px 9px',
  'floor-snow': 'radial-gradient(#d8e4f0 2px, #f4f8fc 2px) 0 0 / 10px 10px',
}

function itemCanvas(item: ShopItem): HTMLCanvasElement | null {
  // 벽지·바닥재는 방 모서리 그림 (1배로 그려 카드 높이에 맞춘다)
  if (isSurface(item)) return drawSurfaceThumb(item.id, 1)
  if (isGridCategory(item.category)) return drawThumb(item.id)
  if (item.category === 'desk') return drawDesk('on1', 1, 1, item.id as DeskStyle)
  if (item.category === 'chair') return drawChairEmpty(item.id as ChairStyle)
  return null
}

function Preview({ item }: { item: ShopItem }) {
  const src = useMemo(() => itemCanvas(item)?.toDataURL() ?? null, [item])
  const isRoomThumb = isSurface(item)
  return (
    <div className="bg-muted flex h-24 items-center justify-center overflow-hidden rounded-lg" style={!isRoomThumb && SWATCH[item.id] ? { background: SWATCH[item.id] } : undefined}>
      {src && (isRoomThumb ? <img src={src} alt="" className="h-[92px] object-contain [image-rendering:pixelated]" /> : <img src={src} alt="" className="max-h-20 max-w-[85%] object-contain [image-rendering:pixelated]" style={{ transform: 'scale(1.6)' }} />)}
    </div>
  )
}

/** 상점: 회사 자금으로 벽지·바닥·가구·직원 책상·의자를 사고, 도감·미션으로 보너스를 모은다 */
export function ShopPage() {
  const funds = useOffice((s) => s.funds)
  const level = useOffice((s) => s.company.level)
  const claimable = useOffice((s) => s.claimable)
  const [tab, setTab] = useState<Tab>('deals')
  const [notice, setNotice] = useState('')

  const say = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((m) => (m === message ? '' : m)), NOTICE_MS)
  }

  return (
    <Page
      title={t('shop.title')}
      description={t('shop.desc')}
      actions={
        <div className="text-right">
          <div className="text-muted-foreground text-[11px]">{t('shop.funds')}</div>
          <div className="text-xl font-bold tabular-nums">{formatWon(funds)}</div>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-1">
        {TABS.map((tb) => (
          <button key={tb} type="button" onClick={() => setTab(tb)} className={cn('relative rounded-full border px-3 py-1 text-xs', tab === tb ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent')}>
            {t(TAB_LABEL[tb])}
            {tb === 'missions' && claimable > 0 && <span className="bg-status-waiting absolute -top-1.5 -right-1.5 rounded-full px-1.5 text-[10px] font-semibold text-background">{claimable}</span>}
          </button>
        ))}
      </div>
      {notice && <div className="bg-primary/10 text-primary mb-4 rounded-lg px-3 py-2 text-sm">{notice}</div>}
      {tab === 'deals' && <Deals level={level} funds={funds} onNotice={say} />}
      {tab === 'collection' && <Collection />}
      {tab === 'missions' && <Missions onNotice={say} />}
      {tab === 'ledger' && <Ledger />}
      {tab !== 'deals' && tab !== 'collection' && tab !== 'missions' && tab !== 'ledger' && <Catalog category={tab} level={level} funds={funds} onNotice={say} />}
    </Page>
  )
}

type CardProps = { level: number; funds: number; onNotice: (m: string) => void }

/** 오늘의 특가 + 지금 시즌 한정 */
function Deals({ level, funds, onNotice }: CardProps) {
  const deals = dailyDeals()
  const seasonal = SHOP_ITEMS.filter((i) => i.season && isInSeason(i))
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">🔥 {t('shop.deals.title')} <span className="text-muted-foreground text-xs font-normal">· {t('shop.resetsAtMidnight')}</span></h2>
        <Grid>
          {deals.map((d) => (
            <ItemCard key={d.itemId} item={shopItem(d.itemId)!} level={level} funds={funds} onNotice={onNotice} />
          ))}
        </Grid>
      </section>
      {seasonal.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">🗓️ {t('shop.seasonal.title')} <span className="text-muted-foreground text-xs font-normal">· {t('shop.seasonal.hint')}</span></h2>
          <Grid>
            {seasonal.map((i) => (
              <ItemCard key={i.id} item={i} level={level} funds={funds} onNotice={onNotice} />
            ))}
          </Grid>
        </section>
      )}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">{children}</div>
}

function Catalog({ category, level, funds, onNotice }: CardProps & { category: ShopCategory }) {
  const owned = useOffice((s) => s.shop.owned)
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  const [isAffordableOnly, setIsAffordableOnly] = useState(false)
  // 시즌이 지난 한정판은 가진 것만 보인다
  const items = SHOP_ITEMS.filter(
    (i) =>
      i.category === category &&
      (isInSeason(i) || owned[i.id]) &&
      (rarity === 'all' || i.rarity === rarity) &&
      (!isAffordableOnly || (level >= i.minLevel && funds >= priceOf(i))),
  )
  return (
    <div className="flex flex-col gap-4">
      {category === 'furniture' && <PlacedList onNotice={onNotice} />}
      {(category === 'wallpaper' || category === 'floor') && <SurfaceSummary slot={category} />}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {(['all', 'common', 'rare', 'legend'] as const).map((r) => (
          <button key={r} type="button" onClick={() => setRarity(r)} className={cn('rounded-full border px-2.5 py-0.5', rarity === r ? 'bg-accent font-semibold' : 'text-muted-foreground')}>
            {r === 'all' ? t('shop.rarity.all') : RARITY_LABEL[r]}
          </button>
        ))}
        <label className="text-muted-foreground ml-3 flex items-center gap-1">
          <input type="checkbox" checked={isAffordableOnly} onChange={(e) => setIsAffordableOnly(e.target.checked)} /> {t('shop.affordableOnly')}
        </label>
      </div>
      <Grid>
        {items.map((item) => (
          <ItemCard key={item.id} item={item} level={level} funds={funds} onNotice={onNotice} />
        ))}
      </Grid>
      {items.length === 0 && <p className="text-muted-foreground text-sm">{t('shop.noItems')}</p>}
    </div>
  )
}

function ItemCard({ item, level, funds, onNotice }: CardProps & { item: ShopItem }) {
  const shop = useOffice((s) => s.shop)
  const owned = shop.owned[item.id] ?? 0
  const left = drawerCount(shop, item.id)
  const isLocked = level < item.minLevel
  const isOwnedOnce = !isGridCategory(item.category) && owned > 0
  const price = priceOf(item)
  const isDeal = price < item.price

  const handleBuy = async () => onNotice((await window.office.buyItem(item.id)).message)
  // 사무실 꾸미기를 열고 이 가구를 든 채로 시작한다
  const handlePlace = async () => openDecorWith(item.id)

  return (
    <div className={cn('bg-card flex flex-col gap-2 rounded-xl border p-3', RARITY_STYLE[item.rarity], isLocked && 'opacity-60')}>
      <div className="relative">
        <Preview item={item} />
        <div className="absolute top-1 left-1 flex gap-1">
          {item.rarity !== 'common' && <span className={cn('bg-card rounded px-1.5 text-[10px] font-semibold', RARITY_TEXT[item.rarity])}>{RARITY_LABEL[item.rarity]}</span>}
          {item.season && <span className="rounded bg-black/60 px-1.5 text-[10px] font-semibold text-orange-300">{t('shop.seasonLimited', { season: item.season.name })}</span>}
          {isDeal && <span className="rounded bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">-{Math.round((1 - price / item.price) * 100)}%</span>}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 truncate text-sm font-semibold">{item.name}</span>
        {isDeal && <span className="text-muted-foreground text-[11px] line-through">{formatWon(item.price)}</span>}
        <span className={cn('text-xs font-semibold tabular-nums', isDeal && 'text-destructive')}>{formatWon(price)}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2 text-xs">{item.description}</p>
      {isLocked ? (
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <LockIcon className="size-3" /> {t('shop.lockedUntil', { level: item.minLevel })}
        </span>
      ) : isOwnedOnce ? (
        <ApplyControl item={item} />
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void handleBuy()} disabled={funds < price}>
            <ShoppingBagIcon /> {t('shop.buy')}
          </Button>
          {isGridCategory(item.category) && owned > 0 && (
            <>
              <span className="text-muted-foreground text-[11px]">
                {t('shop.ownedDrawer', { owned, left })}
              </span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => void handlePlace()} disabled={left <= 0}>
                <PackageIcon /> {t('shop.place')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 도감: 전체 수집률과 세트 진행도 */
function Collection() {
  const owned = useOffice((s) => s.shop.owned)
  const total = SHOP_ITEMS.length
  const have = SHOP_ITEMS.filter((i) => owned[i.id]).length
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="bg-card flex flex-col gap-2 rounded-xl border p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{t('shop.collection.rate')}</span>
          <span className="ml-auto text-lg font-bold tabular-nums">
            {have} / {total}
          </span>
        </div>
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div className="bg-primary h-full" style={{ width: `${(have / total) * 100}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {SHOP_SETS.map((set) => {
          const isDone = isSetComplete(set, owned)
          const got = set.itemIds.filter((id) => owned[id]).length
          return (
            <div key={set.id} className={cn('bg-card flex flex-col gap-2 rounded-xl border p-4', isDone && 'border-status-waiting')}>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl">{set.emoji}</span>
                <span className="flex-1 font-semibold">{set.name}</span>
                <span className="text-xs tabular-nums">
                  {got}/{set.itemIds.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {set.itemIds.map((id) => (
                  <span key={id} className={cn('rounded-full border px-2 py-0.5 text-[11px]', owned[id] ? 'bg-primary/15 text-primary border-primary/40' : 'text-muted-foreground')}>
                    {owned[id] ? '✓ ' : ''}
                    {shopItem(id)?.name}
                  </span>
                ))}
              </div>
              <div className={cn('text-xs', isDone ? 'font-semibold text-status-waiting' : 'text-muted-foreground')}>{isDone ? `🏆 ${t('shop.collection.done', { reward: formatWon(set.reward) })}` : t('shop.collection.reward', { reward: formatWon(set.reward) })}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 오늘의 미션 + 업적 */
function Missions({ onNotice }: { onNotice: (m: string) => void }) {
  const funds = useOffice((s) => s.funds)
  const claimable = useOffice((s) => s.claimable)
  const [view, setView] = useState<MissionsView | null>(null)
  useEffect(() => {
    void window.office.missions().then(setView)
  }, [funds, claimable])
  if (!view) return null
  const handleClaim = async (key: string) => onNotice((await window.office.claimMission(key)).message)
  const row = (m: MissionProgress) => {
    const isDone = m.progress >= m.target
    return (
      <div key={m.key} className={cn('bg-card flex items-center gap-3 rounded-xl border p-3', isDone && !m.isClaimed && 'border-status-waiting')}>
        <span className="text-2xl">{m.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{m.label}</div>
          <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
            <div className={cn('h-full', isDone ? 'bg-status-working' : 'bg-primary')} style={{ width: `${(m.progress / m.target) * 100}%` }} />
          </div>
          <div className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
            {m.metric === 'tokens' || m.metric === 'earned' ? `${formatWon(m.progress).replace('₩', '')} / ${formatWon(m.target).replace('₩', '')}` : `${fmtNumber(m.progress)} / ${fmtNumber(m.target)}`}
          </div>
        </div>
        <span className="text-xs font-semibold tabular-nums">{formatWon(m.reward)}</span>
        {m.isClaimed ? (
          <span className="text-muted-foreground flex w-20 items-center justify-center gap-1 text-xs">
            <CheckIcon className="size-3.5" /> {t('shop.mission.claimed')}
          </span>
        ) : (
          <Button size="sm" className="w-20" disabled={!isDone} onClick={() => void handleClaim(m.key)}>
            <GiftIcon /> {t('shop.mission.claim')}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">🎯 {t('shop.mission.daily')} <span className="text-muted-foreground text-xs font-normal">· {t('shop.resetsAtMidnight')}</span></h2>
        {view.daily.map(row)}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">🏅 {t('shop.mission.achievements')}</h2>
        {view.achievements.map(row)}
      </section>
    </div>
  )
}

/** 산 벽지·바닥은 구역에, 책상·의자는 직원에게 적용 */
function ApplyControl({ item }: { item: ShopItem }) {
  const shop = useOffice((s) => s.shop)
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  if (item.category === 'wallpaper' || item.category === 'floor') {
    const slot = item.category
    return (
      <div className="flex flex-wrap gap-1">
        {ZONES_FOR[slot].map((zone) => {
          const isOn = shop.surfaces[zone]?.[slot] === item.id
          return (
            <Button key={zone} size="sm" variant={isOn ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => void window.office.applySurface(zone, slot, isOn ? null : item.id)}>
              {isOn && <CheckIcon />}
              {ZONE_LABEL[zone]}
            </Button>
          )
        })}
      </div>
    )
  }
  const slot = item.category === 'desk' ? 'desk' : 'chair'
  const users = staff.filter((s) => shop.gear[s.id]?.[slot] === item.id)
  const handleApply = (value: string) => {
    if (value === '__all') for (const s of staff) void window.office.setGear(s.id, slot, item.id)
    else if (value) void window.office.setGear(value, slot, item.id)
  }
  return (
    <div className="flex flex-col gap-1">
      <NativeSelect value="" onChange={(e) => handleApply(e.target.value)} className="h-7 text-xs">
        <option value="">{t('shop.gear.assign')}</option>
        <option value="__all">{t('shop.gear.allStaff')}</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {shop.gear[s.id]?.[slot] === item.id ? ' ✓' : ''}
          </option>
        ))}
      </NativeSelect>
      <span className="text-muted-foreground text-[11px]">{users.length ? t('shop.gear.inUse', { names: users.map((u) => u.name).join(', ') }) : t('shop.gear.noUsers')}</span>
    </div>
  )
}

/** 지금 구역마다 적용된 벽지·바닥 (기본으로 되돌리기) */
function SurfaceSummary({ slot }: { slot: 'wallpaper' | 'floor' }) {
  const shop = useOffice((s) => s.shop)
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {ZONES_FOR[slot].map((zone) => {
        const id = shop.surfaces[zone]?.[slot]
        return (
          <div key={zone} className="bg-card flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <span className="text-muted-foreground">{ZONE_LABEL[zone]}</span>
            <span className="font-medium">{id ? shopItem(id)?.name : t('shop.surface.levelDefault')}</span>
            {id && (
              <button type="button" className="text-muted-foreground hover:text-foreground underline" onClick={() => void window.office.applySurface(zone, slot, null)}>
                {t('shop.surface.reset')}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 사무실 꾸미기를 열고 이 가구를 든다 (서랍 흐름, office-iso-levels.md 6절) */
function openDecorWith(itemId: string) {
  useDecor.setState({ pendingTake: itemId })
  const st = useOffice.getState()
  st.setView('map')
  st.setInside(true)
  st.setDecorating(true)
}

/** 사무실에 놓은 상점 가구 — 서랍으로 돌려놓을 수 있다 (칸 배치 + 옮기기 전 예전 배치) */
function PlacedList({ onNotice }: { onNotice: (m: string) => void }) {
  const grid = useOffice((s) => s.shop.grid)
  const legacy = useOffice((s) => s.shop.placed)
  const placed = [...grid, ...legacy].filter((p) => shopItem(p.itemId))
  if (placed.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs font-semibold">{t('shop.placed.title', { n: placed.length })}</span>
      <div className="flex flex-wrap gap-1">
        {placed.map((p) => (
          <span key={p.uid} className="bg-card flex items-center gap-2 rounded-full border py-0.5 pr-1 pl-3 text-xs">
            {shopItem(p.itemId)?.name}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground rounded-full px-1.5"
              onClick={() => {
                void window.office.storeItem(p.uid)
                onNotice(t('shop.placed.stored'))
              }}
            >
              {t('shop.placed.toDrawer')}
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

const LEDGER_ICON: Record<LedgerRow['kind'], string> = { wage: '💼', bonus: '✅', levelup: '🎉', purchase: '🛍️', refund: '↩️' }

function Ledger() {
  const funds = useOffice((s) => s.funds)
  const [rows, setRows] = useState<LedgerRow[]>([])
  useEffect(() => {
    void window.office.ledger().then(setRows)
  }, [funds])
  return (
    <div className="flex max-w-2xl flex-col">
      {rows.length === 0 && <p className="text-muted-foreground text-sm">{t('shop.ledger.empty')}</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 border-b py-2 text-sm">
          <span>{LEDGER_ICON[r.kind]}</span>
          <span className="min-w-0 flex-1 truncate">{r.label}</span>
          <span className="text-muted-foreground text-xs">{fmtDate(r.ts, { month: 'numeric', day: 'numeric' })}</span>
          <span className={cn('w-28 text-right font-semibold tabular-nums', r.amount < 0 ? 'text-status-error' : 'text-status-working')}>
            {r.amount > 0 ? '+' : ''}
            {formatWon(r.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}
