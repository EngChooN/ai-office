// 비서 화면 시안 (설계 목업용) — 단체방 말풍선·입력창, 기획 카드·질문 상자, 대시보드 패널의 기존 컴포넌트·클래스만 쓴다
// 구현 코드가 아니다. 최가독이 앱 안에 SecretaryPage 등으로 만든다.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangleIcon, ArrowRightIcon, CheckIcon, MinusIcon, RefreshCwIcon, SendIcon, SparklesIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Page } from '@/components/ui/page'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { attentionItems, countByStatus } from '@shared/dashboard'
import { AttentionCard, SummaryRow, usePayslip } from '@/features/DashboardPanels'
import { Avatar, Elapsed } from '@/features/StaffCard'

type Scene = 'home' | 'confirm' | 'result' | 'danger' | 'edit' | 'partial' | 'status' | 'waiting'

/** 비서 얼굴: 직원 아바타 자리(size-8)에 아이콘 원 */
export const SecretaryFace = ({ className }: { className?: string }) => (
  <span className={cn('bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-full', className)}>
    <SparklesIcon className="size-4" />
  </span>
)

// 단체방 Bubble과 같은 모양 (내 말은 primary, 비서 말은 card + border)
function Me({ text, ts }: { text: string; ts: string }) {
  return (
    <div className="flex flex-row-reverse gap-2">
      <div className="flex max-w-[75%] flex-col items-end gap-0.5">
        <div className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap">{text}</div>
        <span className="text-muted-foreground text-[10px]">{ts}</span>
      </div>
    </div>
  )
}
function Sec({ children, ts, usage, wide }: { children: React.ReactNode; ts: string; usage?: string; wide?: boolean }) {
  return (
    <div className="flex gap-2">
      <SecretaryFace />
      <div className={cn('flex min-w-0 flex-col gap-0.5', wide ? 'flex-1' : 'max-w-[75%]')}>
        <span className="text-muted-foreground text-xs">비서</span>
        <div className="bg-card min-w-0 rounded-2xl border px-3 py-2 text-sm">{children}</div>
        <span className="text-muted-foreground text-[10px]">
          {ts}
          {usage && ` · 이번 답 ${usage} 토큰`}
        </span>
      </div>
    </div>
  )
}

const CHIPS = ['직원은 어떻게 뽑아?', '지금 다들 뭐 해?', '결재 기다리는 거 있어?', '밤사이 뭐 했어?', '디자이너한테 로그인 화면 시안 맡겨 줘', '오큐에이 업무 지침 좀 다듬어 줘']
// 회의실 팀·직원 칩과 같은 모양
function Chips({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {CHIPS.map((c) => (
        <button key={c} type="button" className="hover:bg-accent rounded-full border px-2.5 py-1 text-xs">
          {c}
        </button>
      ))}
    </div>
  )
}

/** 단체방 Composer와 같은 줄: Textarea + 보내기 */
export function SecComposer({ placeholder = '비서에게 묻거나 시키기 (예: 개발팀 만들고 프론트 개발자 뽑아 줘)' }: { placeholder?: string }) {
  return (
    <div className="border-t p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea rows={1} placeholder={placeholder} className="field-sizing-content max-h-32 min-h-9 resize-none py-[7px]" />
        <Button aria-label="보내기">
          <SendIcon />
        </Button>
      </div>
    </div>
  )
}

// ── 확인 카드: 기획 카드(PlanCard)와 같은 틀 · 단계 줄은 하위 업무 줄 모양 ──
type StepState = 'todo' | 'done' | 'failed' | 'skipped'
function Step({ n, title, detail, state = 'todo', children }: { n: number; title: string; detail?: string; state?: StepState; children?: React.ReactNode }) {
  const mark =
    state === 'done' ? <CheckIcon className="text-status-working size-4" /> : state === 'failed' ? <XIcon className="text-status-error size-4" /> : state === 'skipped' ? <MinusIcon className="text-muted-foreground size-4" /> : <span className="text-[11px] font-semibold">{n}</span>
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border p-2', state === 'skipped' && 'opacity-60')}>
      <span className="bg-muted flex size-5 shrink-0 items-center justify-center rounded-full">{mark}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium break-words">{title}</div>
        {detail && <div className={cn('text-[11px] break-words', state === 'failed' ? 'text-status-error' : 'text-muted-foreground')}>{detail}</div>}
        {children}
      </div>
    </div>
  )
}

function ConfirmA1({ state }: { state: 'ask' | 'result' }) {
  const isResult = state === 'result'
  return (
    <div className={cn('bg-card @container flex flex-col gap-3 rounded-xl border p-4 text-sm', !isResult && 'border-status-waiting')}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{isResult ? '실행 결과' : '이렇게 할까요?'}</span>
        <span className="text-muted-foreground text-xs">{isResult ? '1번은 됐고 2번에서 멈췄어요' : '3단계'}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Step n={1} title="팀 만들기 — 개발팀" state={isResult ? 'done' : 'todo'} detail={isResult ? '만들었어요' : undefined} />
        <Step n={2} title="직원 고용 — 프론트엔드 개발" state={isResult ? 'failed' : 'todo'} detail={isResult ? '이름 "김코드"가 이미 있어요' : '이름 김코드 · 모습은 직무에 맞춰'}>
          {!isResult && (
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 @md:grid-cols-2">
              <NativeSelect className="h-7 text-xs" defaultValue="default">
                <option value="default">모델: 앱 기본</option>
                <option>모델: 소넷 (빠름·저렴)</option>
              </NativeSelect>
              <NativeSelect className="h-7 text-xs" defaultValue="none">
                <option value="none">작업 폴더: 지정 없음</option>
                <option>~/flitto/poc/claude-office (랩)</option>
                <option>폴더 고르기…</option>
              </NativeSelect>
            </div>
          )}
        </Step>
        <Step n={3} title="팀 배치 — 새 직원 → 개발팀" state={isResult ? 'skipped' : 'todo'} detail={isResult ? '2번이 안 돼서 건너뛰었어요' : '1·2번 결과를 이어서 써요'} />
      </div>
      {!isResult && (
        <p className="text-status-waiting flex items-center gap-1.5 text-xs">
          <AlertTriangleIcon className="size-3.5 shrink-0" /> 같은 이름 "개발팀"이 이미 있어요. 이름을 고치거나 그대로 하나 더 만들어요.
        </p>
      )}
      <div className="flex items-center gap-2 border-t pt-3">
        {isResult ? (
          <>
            <Button size="sm">
              <RefreshCwIcon /> 2번부터 이어서 하기
            </Button>
            <span className="text-muted-foreground text-xs">이미 된 1번은 그대로 둬요</span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground mr-auto text-[11px]">10분 안에 실행하지 않으면 다시 확인해요</span>
            <Button size="sm" variant="ghost">
              취소
            </Button>
            <Button size="sm" variant="outline">
              고치기
            </Button>
            <Button size="sm">
              <CheckIcon /> 실행
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function DangerCard() {
  return (
    <div className="bg-card border-status-error flex flex-col gap-3 rounded-xl border p-4 text-sm">
      <span className="font-semibold">이걸 할까요?</span>
      <Step n={1} title="퇴사 — 오큐에이 (QA)" detail="진행 중인 업무 1건이 멈추고 할 일로 돌아가요" />
      <p className="text-status-error flex items-center gap-1.5 text-xs font-medium">
        <AlertTriangleIcon className="size-3.5 shrink-0" /> 되돌릴 수 없어요. 대화 기록과 장비 설정이 사라져요.
      </p>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button size="sm" variant="ghost">
          취소
        </Button>
        <Button size="sm" variant="destructive">
          퇴사시키기
        </Button>
      </div>
    </div>
  )
}

// ── 첨삭 비교: 질문 상자·기획서 영역(bg-muted rounded-lg)을 두 칸으로 ──
const del = (t: string) => <del className="text-status-error decoration-status-error/70">{t}</del>
const ins = (t: string) => <ins className="text-status-working decoration-status-working/70 underline-offset-2">{t}</ins>
function EditCard({ partial }: { partial: boolean }) {
  const chunks = [
    { before: <>테스트를 꼼꼼히 하세요.</>, after: <>{del('테스트를 꼼꼼히 하세요.')}{ins('기능마다 정상·실패·빈 값 세 경우를 확인하고 결과를 표로 남겨요.')}</>, checked: true },
    { before: <>버그를 찾으면 알려주세요.</>, after: <>버그를 찾으면 {ins('재현 순서와 스크린샷을 붙여 업무 카드로 ')}알려 주세요.</>, checked: true },
    { before: <>모르는건 물어보세요.</>, after: <>{del('모르는건 물어보세요.')}{ins('기획서에 근거가 없을 때만 물어봐요.')}</>, checked: false },
  ]
  return (
    <div className="bg-card @container flex flex-col gap-3 rounded-xl border p-4 text-sm">
      <div className="flex items-center gap-2">
        <Avatar avatar={7} name="오큐에이" teamId="t1" className="size-6" />
        <span className="font-semibold">오큐에이 업무 지침 다듬기</span>
      </div>
      <div className="bg-muted rounded-lg p-3 text-xs">
        <div className="text-muted-foreground mb-1 font-semibold">바꾼 이유</div>
        <ul className="list-disc pl-4">
          <li>"꼼꼼히"처럼 기준이 없는 말을 확인할 항목으로 바꿨어요</li>
          <li>버그 보고에 필요한 것(재현 순서·스크린샷)을 적었어요</li>
          <li>질문할 때를 기획서 근거가 없는 경우로 좁혔어요</li>
        </ul>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">바뀐 곳 3군데</span>
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <input type="checkbox" /> 바뀐 곳만 보기
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-semibold">지금</span>
          <div className="bg-muted flex flex-col gap-1.5 rounded-lg p-3 text-xs">
            {chunks.map((c, i) => (
              <p key={i}>{c.before}</p>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-semibold">다듬은 안</span>
          <div className="bg-muted flex flex-col gap-1.5 rounded-lg p-3 text-xs">
            {chunks.map((c, i) => (
              <label key={i} className={cn('flex items-start gap-1.5', partial && !c.checked && 'opacity-50')}>
                {partial && <input type="checkbox" defaultChecked={c.checked} className="mt-0.5" />}
                <span>{c.after}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {partial ? (
          <>
            <span className="text-muted-foreground mr-auto text-xs">3군데 중 2군데 고름</span>
            <Button size="sm" variant="ghost">
              돌아가기
            </Button>
            <Button size="sm">
              <CheckIcon /> 이대로 적용
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" className="mr-auto">
              취소
            </Button>
            <Button size="sm" variant="outline">
              다시 다듬기
            </Button>
            <Button size="sm" variant="outline">
              일부 적용
            </Button>
            <Button size="sm">
              <CheckIcon /> 적용
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ── 현황 요약: 대시보드 SummaryRow·AttentionCard를 그대로 답 안에 ──
function StatusS1() {
  const staff = useOffice((s) => s.staff)
  const slip = usePayslip()
  const working = staff.filter((s) => s.status === 'working')
  return (
    <div className="@container flex flex-col gap-3">
      <Markdown>{'지금 **일하는 중 4명**, **확인 필요 2명**, 오류 1명이에요.'}</Markdown>
      <SummaryRow counts={countByStatus(staff)} todayDone={staff.reduce((n, s) => n + s.todayDone, 0)} slip={slip} filter={null} onFilter={() => {}} />
      <div className="flex flex-col divide-y rounded-lg border">
        {working.map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-3 py-2">
            <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-6" />
            <span className="text-xs font-medium">{s.name}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{s.activity}</span>
            <Elapsed staff={s} />
          </div>
        ))}
      </div>
      <button type="button" className="text-primary flex w-fit items-center gap-1 text-xs hover:underline">
        대시보드에서 보기 <ArrowRightIcon className="size-3" />
      </button>
    </div>
  )
}
function StatusS2() {
  const staff = useOffice((s) => s.staff)
  const items = useMemo(() => attentionItems(staff, new Map()), [staff])
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  return (
    <div className="flex flex-col gap-3">
      <Markdown>{'기다리는 게 **3건** 있어요. 오래 기다린 순서예요. 승인·반려는 여기서 바로 누를 수 있어요.'}</Markdown>
      <AttentionCard items={items} staffById={staffById} />
    </div>
  )
}

export function SecretaryPage({ scene }: { scene: Scene }) {
  const isHome = scene === 'home'
  return (
    <Page
      title="비서"
      description="말로 묻고 시켜요. 무언가를 바꾸는 일은 확인 카드에서 [실행]을 눌러야 해요."
      className="flex flex-col p-0"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">오늘 비서 12.4K 토큰</span>
          <Button size="sm" variant="ghost">
            <Trash2Icon /> 대화 지우기
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {isHome && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <SecretaryFace className="size-12 [&_svg]:size-6" />
              <div className="font-semibold">무엇을 도와드릴까요?</div>
              <p className="text-muted-foreground max-w-sm text-xs">사용법을 묻거나, 사무실 현황을 물어보거나, "팀 만들고 직원 뽑아 줘"처럼 시켜 보세요.</p>
              <Chips className="max-w-xl justify-center" />
            </div>
          )}
          {(scene === 'confirm' || scene === 'result') && (
            <>
              <Me text="개발팀 만들고 프론트 개발자 한 명 뽑아서 넣어 줘" ts="10. 23. 오전 10:12" />
              <Sec ts="10. 23. 오전 10:12" usage="2.1K" wide>
                <div className="flex flex-col gap-3">
                  <Markdown>{'세 가지를 차례대로 할게요. 모델과 작업 폴더는 기본값으로 두었어요. 바꾸려면 카드에서 고르세요.'}</Markdown>
                  <ConfirmA1 state={scene === 'result' ? 'result' : 'ask'} />
                </div>
              </Sec>
            </>
          )}
          {scene === 'danger' && (
            <>
              <Me text="QA 담당자 내보내 줘" ts="10. 23. 오후 3:02" />
              <Sec ts="10. 23. 오후 3:02" wide>
                <div className="flex flex-col gap-3">
                  <Markdown>{'QA 담당은 **오큐에이** 한 명이에요. 퇴사는 되돌릴 수 없어서 한 번 더 확인할게요.'}</Markdown>
                  <DangerCard />
                </div>
              </Sec>
            </>
          )}
          {(scene === 'edit' || scene === 'partial') && (
            <>
              <Me text="오큐에이 업무 지침 좀 다듬어 줘" ts="10. 23. 오전 11:40" />
              <Sec ts="10. 23. 오전 11:40" usage="3.8K" wide>
                <EditCard partial={scene === 'partial'} />
              </Sec>
            </>
          )}
          {scene === 'status' && (
            <>
              <Me text="지금 다들 뭐 해?" ts="10. 23. 오전 9:30" />
              <Sec ts="10. 23. 오전 9:30" wide>
                <StatusS1 />
              </Sec>
            </>
          )}
          {scene === 'waiting' && (
            <>
              <Me text="결재 기다리는 거 있어?" ts="10. 23. 오전 9:31" />
              <Sec ts="10. 23. 오전 9:31" wide>
                <StatusS2 />
              </Sec>
            </>
          )}
        </div>
      </div>
      {!isHome && <Chips className="mx-auto w-full max-w-3xl px-4 pb-2 [&>button]:shrink-0 flex-nowrap overflow-x-auto" />}
      <SecComposer />
    </Page>
  )
}

/** ⌘K 빠른 창: 어느 화면에서나 띄우는 대화상자 (DialogContent 그대로) */
export function QuickSecretary() {
  const [, setTick] = useState(0)
  useEffect(() => setTick(1), [])
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60" />
      <div className="bg-background fixed top-[18%] left-1/2 z-50 flex w-full max-w-xl -translate-x-1/2 flex-col gap-3 rounded-xl border p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <SecretaryFace className="size-7" />
          <Input autoFocus defaultValue="결재 기다리는 거 있어?" className="h-9 flex-1" />
          <kbd className="text-muted-foreground rounded border px-1.5 text-[10px]">Esc</kbd>
        </div>
        <div className="bg-card rounded-xl border px-3 py-2 text-sm">
          <Markdown>{'기다리는 게 **3건** 있어요.\n- 한리뷰 · 결재 · 파일 수정: remote-protocol-v2.md · 8분째\n- 이디자 · 질문 · 아래 탭 순서 · 5분째\n- 정리드 · 기획 확인 · 안드로이드 1.1 · 20분째'}</Markdown>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-[11px]">바꾸는 일은 비서 화면의 확인 카드로 이어져요</span>
          <Button size="sm" variant="outline" className="ml-auto">
            비서에서 이어 보기 <ArrowRightIcon />
          </Button>
        </div>
        <div className="border-t pt-2">
          <span className="text-muted-foreground mb-1 block text-[10px]">자주 묻는 것</span>
          <Chips />
        </div>
      </div>
    </div>
  )
}
