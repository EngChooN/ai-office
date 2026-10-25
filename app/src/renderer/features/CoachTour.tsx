import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOffice, useWorkMode, type View } from '@/store'
import { MOD_KEY, osText } from '@/lib/platform'
import { t } from '@shared/i18n'
import type { TKey } from '@shared/i18n'

interface TourStep {
  target: string
  icon: string
  /** 제목·설명 번역 키 (렌더할 때 t()로 읽는다) */
  title: TKey
  body: TKey
  /** 이 단계를 보여 주기 전에 열어 둘 화면 */
  view?: View
}

const STEPS: TourStep[] = [
  { target: 'nav-map', view: 'map', icon: '🏢', title: 'coachTour.map.title', body: 'coachTour.map.body' },
  { target: 'hud', view: 'map', icon: '📈', title: 'coachTour.hud.title', body: 'coachTour.hud.body' },
  { target: 'hire', icon: '🧑‍💼', title: 'coachTour.hire.title', body: 'coachTour.hire.body' },
  { target: 'nav-dashboard', icon: '🗂️', title: 'coachTour.dashboard.title', body: 'coachTour.dashboard.body' },
  { target: 'nav-org', icon: '🧭', title: 'coachTour.org.title', body: 'coachTour.org.body' },
  { target: 'nav-board', icon: '📋', title: 'coachTour.board.title', body: 'coachTour.board.body' },
  { target: 'nav-inbox', icon: '✅', title: 'coachTour.inbox.title', body: 'coachTour.inbox.body' },
  { target: 'nav-chat', icon: '💬', title: 'coachTour.chat.title', body: 'coachTour.chat.body' },
  { target: 'nav-meeting', icon: '🗣️', title: 'coachTour.meeting.title', body: 'coachTour.meeting.body' },
  { target: 'nav-manuals', icon: '📘', title: 'coachTour.manuals.title', body: 'coachTour.manuals.body' },
  { target: 'nav-schedule', icon: '⏰', title: 'coachTour.schedule.title', body: 'coachTour.schedule.body' },
  { target: 'nav-report', icon: '📑', title: 'coachTour.report.title', body: 'coachTour.report.body' },
  { target: 'nav-payroll', icon: '💳', title: 'coachTour.payroll.title', body: 'coachTour.payroll.body' },
  { target: 'nav-shop', icon: '🛍️', title: 'coachTour.shop.title', body: 'coachTour.shop.body' },
  { target: 'nav-settings', icon: '⚙️', title: 'coachTour.settings.title', body: 'coachTour.settings.body' },
  { target: 'nav-updates', icon: '📣', title: 'coachTour.updates.title', body: 'coachTour.updates.body' },
  { target: 'hire', icon: '🚀', title: 'coachTour.firstHire.title', body: 'coachTour.firstHire.body' },
]
/** 업무 모드에서 숨긴 화면을 설명하는 단계 */
const GAME_TARGETS = new Set(['nav-map', 'hud', 'nav-shop'])
const PAD = 6
const TIP_W = 300
const TIP_GAP = 14

/** 메뉴별 코치마크: 대상만 밝게 비추고 옆에 설명을 띄운다 */
export function CoachTour({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const setView = useOffice((s) => s.setView)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const isWorkMode = useWorkMode()
  const steps = useMemo(() => (isWorkMode ? STEPS.filter((s) => !GAME_TARGETS.has(s.target)) : STEPS), [isWorkMode])
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = steps[Math.min(index, steps.length - 1)]

  useEffect(() => {
    if (isOpen) setIndex(0)
  }, [isOpen])

  useEffect(() => {
    if (isOpen && step.view) setView(step.view)
  }, [isOpen, step, setView])

  // 대상 위치를 따라간다 (화면 전환·창 크기 변경)
  useLayoutEffect(() => {
    if (!isOpen) return
    const update = () => setRect(document.querySelector(`[data-tour="${step.target}"]`)?.getBoundingClientRect() ?? null)
    update()
    const timer = setInterval(update, 300)
    window.addEventListener('resize', update)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', update)
    }
  }, [isOpen, step])

  if (!isOpen) return null
  const isLast = index >= steps.length - 1
  const next = () => {
    if (!isLast) return setIndex(index + 1)
    onClose()
    setView('map')
    setHireOpen(true)
  }

  // 설명 상자는 대상 오른쪽(공간이 없으면 왼쪽·아래)에 둔다
  const tip = (() => {
    if (!rect) return { left: window.innerWidth / 2 - TIP_W / 2, top: window.innerHeight / 2 - 80 }
    const right = rect.right + TIP_GAP
    if (right + TIP_W < window.innerWidth) return { left: right, top: Math.min(rect.top, window.innerHeight - 220) }
    if (rect.left - TIP_GAP - TIP_W > 0) return { left: rect.left - TIP_GAP - TIP_W, top: Math.min(rect.top, window.innerHeight - 220) }
    return { left: Math.max(12, rect.right - TIP_W), top: rect.bottom + TIP_GAP }
  })()

  return (
    <div className="fixed inset-0 z-[90]">
      {rect ? (
        <div
          className="border-primary pointer-events-none fixed rounded-lg border-2 transition-all duration-300"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}
      <div className="bg-background fixed flex flex-col gap-3 rounded-xl border p-4 shadow-2xl transition-all duration-300" style={{ ...tip, width: TIP_W }}>
        <div className="text-muted-foreground text-[11px]">
          {index + 1} / {steps.length}
        </div>
        <div className="font-semibold">
          {step.icon} {t(step.title)}
        </div>
        <p className="text-muted-foreground text-sm">{t(step.body, { modKey: MOD_KEY, trayPlace: osText(t('coachTour.trayPlace.mac'), t('coachTour.trayPlace.win')) })}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('coachTour.stop')}
          </Button>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <Button size="sm" variant="outline" onClick={() => setIndex(index - 1)}>
                {t('coachTour.prev')}
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? t('coachTour.hireStaff') : t('coachTour.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
