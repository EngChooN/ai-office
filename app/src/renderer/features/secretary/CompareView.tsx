import { diffWords } from '@shared/textDiff'
import type { SecretaryCompare } from '@shared/types'
import { t } from '@shared/i18n'

// 확인 카드의 비교 보기: 원문 ↔ 수정본(글) · 전 ↔ 후(그림). 넓으면 나란히, 좁으면(휴대폰) 위아래 — 카드의 @container 기준
// 지운 말은 취소선, 더한 말은 밑줄 — 색만으로 구분하지 않는다 (첨삭 카드와 같은 표시)

/** 한쪽 글에서 바뀐 말만 표시한다 (del = 원문 쪽, add = 수정본 쪽) */
export function Words({ before, after, side }: { before: string; after: string; side: 'del' | 'add' }) {
  const ops = diffWords(before, after)
  return (
    <>
      {ops.map((op, i) =>
        op.type === 'same' ? (
          <span key={i}>{op.text}</span>
        ) : op.type === side ? (
          side === 'del' ? (
            <del key={i} className="text-status-error">
              {op.text}
            </del>
          ) : (
            <ins key={i} className="text-status-working underline underline-offset-2">
              {op.text}
            </ins>
          )
        ) : null,
      )}
    </>
  )
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-semibold">{title}</span>
      {children}
    </div>
  )
}

function TextCompare({ c }: { c: SecretaryCompare }) {
  const box = 'bg-muted selectable max-h-72 overflow-y-auto rounded-lg p-3 text-xs break-words whitespace-pre-wrap'
  return (
    <div className="flex flex-col gap-3 @2xl:flex-row">
      <Side title={t('secretary.compare.before')}>
        <div className={box}>{c.before ? <Words before={c.before} after={c.after} side="del" /> : <span className="text-muted-foreground">{t('secretary.diff.none')}</span>}</div>
      </Side>
      <Side title={t('secretary.compare.after')}>
        <div className={box}>{c.after ? <Words before={c.before} after={c.after} side="add" /> : <span className="text-muted-foreground">{t('secretary.diff.removed')}</span>}</div>
      </Side>
    </div>
  )
}

function ImageCompare({ c }: { c: SecretaryCompare }) {
  // 끝난 카드는 앱이 그림을 지운다 (상태가 휴대폰까지 가므로)
  if (!c.before || !c.after) return <p className="text-muted-foreground text-[11px]">{t('secretary.compare.imageGone')}</p>
  return (
    <div className="flex flex-col gap-3 @md:flex-row">
      <Side title={t('secretary.compare.imageBefore')}>
        <img src={c.before} alt={t('secretary.compare.imageBefore')} className="bg-muted w-full rounded-lg border object-contain [image-rendering:pixelated]" />
      </Side>
      <Side title={t('secretary.compare.imageAfter')}>
        <img src={c.after} alt={t('secretary.compare.imageAfter')} className="bg-muted w-full rounded-lg border object-contain [image-rendering:pixelated]" />
      </Side>
    </div>
  )
}

/** 카드에 붙은 비교 보기들 — 하나면 펼쳐서, 여럿이면 접어서 */
export function CompareList({ compares }: { compares: SecretaryCompare[] }) {
  const isOpen = compares.length === 1
  return (
    <div className="flex flex-col gap-2">
      {compares.map((c, i) => (
        <details key={i} open={isOpen} className="rounded-lg border p-2">
          <summary className="cursor-pointer text-xs font-medium">{t(c.kind === 'image' ? 'secretary.compare.imageTitle' : 'secretary.compare.textTitle', { label: c.label })}</summary>
          <div className="mt-2">{c.kind === 'image' ? <ImageCompare c={c} /> : <TextCompare c={c} />}</div>
        </details>
      ))}
    </div>
  )
}
