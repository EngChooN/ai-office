import { DicesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { avatarUrl } from '@/map/sprites'
import { t, type TKey } from '@shared/i18n'
import { decodeLook, encodeLook, HAIR_COLORS, PANTS, randomLook, SKINS, TOP_COLORS, type Look } from '@shared/look'

// 부품 이름은 @shared/look 목록과 같은 순서로 번역한다
const HAIR_KEYS = ['avatar.hair.short', 'avatar.hair.long', 'avatar.hair.bob', 'avatar.hair.ponytail', 'avatar.hair.spiky', 'avatar.hair.fluffy', 'avatar.hair.sidePart', 'avatar.hair.buzz'] as const satisfies readonly TKey[]
const TOP_KEYS = ['avatar.top.tshirt', 'avatar.top.hoodie', 'avatar.top.shirtTie', 'avatar.top.cardigan', 'avatar.top.suit'] as const satisfies readonly TKey[]
const FACE_KEYS = ['avatar.none', 'avatar.face.glasses', 'avatar.face.sunglasses', 'avatar.face.beard', 'avatar.face.mustache'] as const satisfies readonly TKey[]
const HEAD_KEYS = ['avatar.none', 'avatar.head.headset', 'avatar.head.cap', 'avatar.head.beanie', 'avatar.head.hairpin', 'avatar.head.beret'] as const satisfies readonly TKey[]

function Swatches({ colors, value, onPick }: { colors: readonly string[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(i)}
          aria-label={t('avatar.color', { n: i + 1 })}
          style={{ backgroundColor: c }}
          className={cn('focus-ring size-5 rounded-full border-2', value === i ? 'border-primary ring-primary/40 ring-2' : 'border-foreground/20')}
        />
      ))}
    </div>
  )
}

function PartSelect({ options, value, onPick }: { options: readonly string[]; value: number; onPick: (i: number) => void }) {
  return (
    <NativeSelect value={value} onChange={(e) => onPick(Number(e.target.value))} className="h-8 text-xs">
      {options.map((o, i) => (
        <option key={o} value={i}>
          {o}
        </option>
      ))}
    </NativeSelect>
  )
}

/** 생김새 고르기: 부품별로 고르거나 🎲로 무작위. 무작위는 옷·옷 색까지 전부 새로 뽑는다 (직무 기본 옷을 얹지 않는다) */
export function AvatarEditor({ value, onChange }: { value: number; onChange: (avatar: number) => void }) {
  const look = decodeLook(value)
  const set = (patch: Partial<Look>) => onChange(encodeLook({ ...look, ...patch }))
  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <img src={avatarUrl(value)} alt="" className="bg-muted size-20 rounded-lg object-contain p-1 [image-rendering:pixelated]" />
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange(encodeLook(randomLook()))}>
          <DicesIcon /> {t('avatar.random')}
        </Button>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.hairStyle')}</span>
          <PartSelect options={HAIR_KEYS.map((k) => t(k))} value={look.hairStyle} onPick={(hairStyle) => set({ hairStyle })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.top')}</span>
          <PartSelect options={TOP_KEYS.map((k) => t(k))} value={look.top} onPick={(top) => set({ top })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.faceItem')}</span>
          <PartSelect options={FACE_KEYS.map((k) => t(k))} value={look.face} onPick={(face) => set({ face })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.headItem')}</span>
          <PartSelect options={HEAD_KEYS.map((k) => t(k))} value={look.head} onPick={(head) => set({ head })} />
        </label>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.hairColor')}</span>
          <Swatches colors={HAIR_COLORS.map(([c]) => c)} value={look.hairColor} onPick={(hairColor) => set({ hairColor })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.skin')}</span>
          <Swatches colors={SKINS} value={look.skin} onPick={(skin) => set({ skin })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.topColor')}</span>
          <Swatches colors={TOP_COLORS.map(([c]) => c)} value={look.topColor} onPick={(topColor) => set({ topColor })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-muted-foreground">{t('avatar.pants')}</span>
          <Swatches colors={PANTS} value={look.pants} onPick={(pants) => set({ pants })} />
        </div>
      </div>
    </div>
  )
}
