import { useState } from 'react'
import { MessageSquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { openFeedbackIssue, recentErrors } from '@/lib/feedback'
import { formatErrorLog, type ErrorEntry } from '@shared/errorReport'
import { t } from '@shared/i18n'

/** 사이드바 '피드백 보내기' — 최근 오류가 있으면 함께 보낼지 묻고 보낼 내용을 미리 보여 준다 (없으면 바로 연다) */
export function FeedbackButton() {
  const [errors, setErrors] = useState<ErrorEntry[] | null>(null)
  const [isAttached, setIsAttached] = useState(true)

  const start = async () => {
    const list = await recentErrors()
    if (!list.length) return void openFeedbackIssue()
    setIsAttached(true)
    setErrors(list)
  }
  const send = () => {
    void openFeedbackIssue(isAttached ? (errors ?? []) : [])
    setErrors(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        className="text-muted-foreground hover:bg-accent/60 hover:text-foreground mt-1 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs"
      >
        <MessageSquareIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={t('settingsPage.guide.feedback')}>{t('settingsPage.guide.feedback')}</span>
      </button>
      <Dialog open={errors !== null} onOpenChange={(isOpen) => !isOpen && setErrors(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('feedback.errors.title', { n: errors?.length ?? 0 })}</DialogTitle>
            <DialogDescription>{t('feedback.errors.desc')}</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isAttached} onChange={(e) => setIsAttached(e.target.checked)} /> {t('feedback.errors.include')}
          </label>
          {isAttached && (
            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">{t('feedback.errors.preview')}</span>
              <pre className="bg-muted max-h-60 overflow-auto rounded-md p-2 text-[11px] break-all whitespace-pre-wrap">{formatErrorLog(errors ?? [])}</pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrors(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={send}>{t('feedback.errors.continue')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
