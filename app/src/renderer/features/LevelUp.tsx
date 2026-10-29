import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatWon, LEVEL_REWARD_UNIT } from '@shared/economy'
import { COMPANY_LEVELS } from '@shared/types'
import { legacyLevelOfXp, MAX_LEVEL } from '@shared/officeLevel'
import { useOffice, useWorkMode } from '@/store'
import { t } from '@shared/i18n'

const SEEN_KEY = 'office:lastSeenLevel'
/** 사무실 개편(레벨 20단계·칸 배치) 안내를 본 기록 */
const REVAMP_KEY = 'office:levelRevamp20Seen'
/** 개편 전 레벨 단계 수 — MAX_LEVEL이 이보다 크면 개편이 들어온 것 */
const OLD_LEVEL_COUNT = 10
const CONFETTI = ['🎉', '✨', '🎊', '💰', '🏢', '⭐']
const CONFETTI_COUNT = 24

function readSeen(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function readRevampSeen() {
  try {
    return localStorage.getItem(REVAMP_KEY) === '1'
  } catch {
    return true
  }
}

function writeRevampSeen() {
  try {
    localStorage.setItem(REVAMP_KEY, '1')
  } catch {
    // 못 남기면 다음에 한 번 더 안내할 뿐이다
  }
}

function writeSeen(level: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(level))
  } catch {
    // 못 남기면 다음에 한 번 더 축하할 뿐이다
  }
}

/**
 * 회사 레벨이 오르면 축하 — 새로 생긴 공간과 보상 자금을 보여 준다 (앱이 꺼져 있던 사이에 오른 레벨도 처음 켤 때).
 * isBusy: 코치마크·튜토리얼 선택이 떠 있으면 닫힌 뒤로 미룬다 (튜토리얼 진행 중인지는 여기서 본다)
 */
export function LevelUp({ isBusy }: { isBusy: boolean }) {
  const level = useOffice((s) => s.company.level)
  // 칭호는 PC가 보낸 값 — 표를 레벨 숫자로 바로 읽으면 표보다 큰 레벨(더 새 PC)에서 화면 전체가 멈춘다 (office-iso-tech.md 4-3절)
  const title = useOffice((s) => s.company.title)
  const xp = useOffice((s) => s.company.xp)
  const isLoaded = useOffice((s) => s.isLoaded)
  const isOnboarded = useOffice((s) => s.settings.isOnboarded)
  const setView = useOffice((s) => s.setView)
  const isTutorialOn = useOffice((s) => Boolean(s.tutorial?.scenario))
  const isWorkMode = useWorkMode()
  /** 이번 실행에서 첫 실행 안내를 거쳤다 — 그 레벨은 새 사무실의 출발점이라 축하·개편 안내 없이 본 것으로 친다 */
  const isFirstRunRef = useRef(false)
  const [from, setFrom] = useState<number | null>(null)
  /** 개편 첫 실행 안내: 예전 10단계 기준 레벨 (null = 보통 축하) */
  const [revampFrom, setRevampFrom] = useState<number | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!isOnboarded) {
      isFirstRunRef.current = true
      return
    }
    // 첫 실행 안내·코치마크·튜토리얼이 끝날 때까지 오른 레벨은 축하 없이 넘긴다 (끝난 순간 안내창이 겹치지 않게)
    if (isFirstRunRef.current) {
      writeSeen(level)
      writeRevampSeen()
      if (!isBusy && !isTutorialOn) isFirstRunRef.current = false
      return
    }
    if (isBusy || isTutorialOn) return
    // 업무 모드에선 축하 창을 띄우지 않고, 본 것으로 쳐서 모드를 끈 뒤에 몰아서 뜨지 않게 한다
    const isRevampLive = MAX_LEVEL > OLD_LEVEL_COUNT
    if (isWorkMode) {
      writeSeen(level)
      if (isRevampLive) writeRevampSeen()
      setFrom(null)
      return
    }
    const seen = readSeen()
    // 개편 뒤 처음 켬: 개편 안내를 한 번 보여 준다. 새로 쓰는 기기는 안내 없이 본 것으로
    // 예전 레벨 = 이 기기가 본 레벨과 경험치로 센 예전 레벨 중 큰 것. 보상은 레벨마다 한 번이라(main/office.ts) 예전 레벨보다 높은 레벨만 새로 들어온다
    if (isRevampLive && !readRevampSeen()) {
      writeRevampSeen()
      if (seen !== null || level > 1) {
        const old = Math.max(Math.min(seen ?? 1, OLD_LEVEL_COUNT), legacyLevelOfXp(xp))
        setRevampFrom(old)
        // 올랐으면 새로 오른 레벨들을, 같거나 낮으면 지금 레벨 한 줄만 보여 준다
        setFrom(level > old ? old : level - 1)
        return
      }
    }
    // 처음 쓰는 기기면 지금 레벨부터 센다 — 단, 레벨 10단계 개편(0.4.0) 전부터 쓰던 사무실은 축하를 한 번 보여 준다
    if (seen === null) {
      if (level > 1) setFrom(1)
      else writeSeen(level)
      return
    }
    if (level > seen) setFrom(seen)
  }, [level, xp, isLoaded, isOnboarded, isWorkMode, isBusy, isTutorialOn])

  if (from === null) return null
  const gained = COMPANY_LEVELS.map((l, i) => ({ ...l, level: i + 1 })).filter((l) => l.level > from && l.level <= level)
  const isRevamp = revampFrom !== null
  // 개편 안내에서 레벨이 같거나 낮으면 이미 받은 레벨이라 새 보상이 없다
  const reward = isRevamp && level <= revampFrom ? 0 : gained.reduce((sum, l) => sum + l.level * LEVEL_REWARD_UNIT, 0)
  const close = () => {
    writeSeen(level)
    setFrom(null)
    setRevampFrom(null)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
            <span key={i} className="animate-confetti absolute text-lg" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 0.15}s` }}>
              {CONFETTI[i % CONFETTI.length]}
            </span>
          ))}
        </div>
        {isRevamp ? (
          <DialogHeader>
            <DialogTitle className="text-2xl">{t('levelUp.revamp.title')}</DialogTitle>
            <DialogDescription>
              {t('levelUp.revamp.levels', { max: MAX_LEVEL })}{' '}
              {level < revampFrom ? (
                <>
                  {t('levelUp.revamp.lower', { from: revampFrom, level, title })} <b>{t('levelUp.revamp.lowerBold')}</b>
                </>
              ) : level > revampFrom ? (
                <>
                  {t('levelUp.revamp.higherBefore', { from: revampFrom })}
                  <b>{t('levelUp.revamp.higherBold', { level, title })}</b>
                  {t('levelUp.revamp.higherAfter')}
                </>
              ) : (
                <>
                  {t('levelUp.revamp.same', { level, title })}
                </>
              )}{' '}
              {t('levelUp.revamp.drawer')}
            </DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <DialogTitle className="text-2xl">{t('levelUp.title', { level })}</DialogTitle>
            <DialogDescription>
              {t('levelUp.desc', { title })}
            </DialogDescription>
          </DialogHeader>
        )}
        <div className="flex flex-col gap-2">
          {gained.map((l) => (
            <div key={l.level} className="bg-muted flex items-baseline gap-3 rounded-lg px-3 py-2 text-sm">
              <span className="text-primary w-12 font-bold">Lv.{l.level}</span>
              <span className="flex-1">
                <b>{l.title}</b> — {l.unlock}
              </span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-center text-xs">
          {t('levelUp.drawerNote')}
        </p>
        {isRevamp && reward === 0 ? (
          <div className="bg-primary/10 text-primary rounded-lg px-3 py-2 text-center text-sm font-semibold">{t('levelUp.reward.kept')}</div>
        ) : isRevamp ? (
          <div className="bg-primary/10 text-primary rounded-lg px-3 py-2 text-center text-sm font-semibold">{t('levelUp.reward.newLevels', { amount: formatWon(reward) })}</div>
        ) : (
          <div className="bg-primary/10 text-primary rounded-lg px-3 py-2 text-center text-sm font-semibold">{t('levelUp.reward.received', { amount: formatWon(reward) })}</div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              close()
              setView('shop')
            }}
          >
            {t('levelUp.goShop')}
          </Button>
          <Button
            onClick={() => {
              close()
              setView('map')
            }}
          >
            {t('levelUp.viewOffice')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
