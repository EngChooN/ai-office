import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { RotateCwIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { handleComposerKey, NEWLINE_HINT } from "@/lib/composerKeys";
import { cn } from "@/lib/utils";
import { useOffice } from "@/store";
import {
  EMPTY_SECRETARY,
  formatTokens,
  type SecretaryMessage,
} from "@shared/types";
import { ApprovalCards } from "./ApprovalCards";
import { ConfirmCard } from "./ConfirmCard";
import { EditCompareCard } from "./EditCompareCard";
import { useSecretaryDraft } from "./draft";
import { SecretaryFace } from "./SecretaryFace";
import { QueuedBadge, useQueuePosition } from "./QueuedBadge";
import { fmtDate, t } from "@shared/i18n";
import { QUEUE_MAX } from "@shared/secretaryQueue";
import { isResumable, type SecretaryResumeFail } from "@shared/secretaryProgress";
import { IS_TOUCH } from "@/shell";
import { findSecretaryHits, stepIndex } from "@shared/chatFind";
import { SearchField, useSearchHighlight } from "../ChatExtras";

// 비서 대화: 단체방 말풍선·입력창과 같은 모양 (secretary-ui.md 2·3절). 비서 화면과 ⌘K 빠른 창이 함께 쓴다

export const useSecretary = () =>
  useOffice((s) => s.secretary ?? EMPTY_SECRETARY);

const timeText = (ts: number) =>
  fmtDate(ts, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 예시 질문 (완료 기준 ★ 질문에서) — 이름이 들어가는 칩은 이 사무실 직원으로 채운다 */
export function useExampleQuestions() {
  const staff = useOffice((s) => s.staff);
  const hired = staff.filter((s) => s.kind === "hired");
  const qa = hired.find((s) => /QA|큐에이|테스트/i.test(s.role)) ?? hired[0];
  const designer = hired.find((s) => /디자/.test(s.role));
  return [
    t("secretary.ex.hire"),
    t("secretary.ex.status"),
    t("secretary.ex.approvals"),
    t("secretary.ex.overnight"),
    designer
      ? t("secretary.ex.designNamed", { name: designer.name })
      : t("secretary.ex.design"),
    qa
      ? t("secretary.ex.guideNamed", { name: qa.name })
      : t("secretary.ex.guide"),
  ];
}

export function ExampleChips({
  className,
  onPick,
}: {
  className?: string;
  onPick?: () => void;
}) {
  const questions = useExampleQuestions();
  const isBusy = useOffice((s) => (s.secretary ?? EMPTY_SECRETARY).isBusy);
  return (
    <div className={cn("flex gap-1.5", className)}>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          disabled={isBusy}
          onClick={() => {
            void window.office.secretaryAsk(q);
            onPick?.();
          }}
          className="hover:bg-accent shrink-0 rounded-full border px-2.5 py-1 text-xs disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

/** 아침 요약 아래 [다시 안 보기] — 누르면 설정이 꺼지고 안내 문구로 바뀐다 */
function BriefOff() {
  const isOn = useOffice((s) => s.settings.isSecretaryBriefOn);
  if (!isOn)
    return (
      <span className="text-muted-foreground text-xs">
        {t("secretary.brief.offDone")}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => void window.office.updateSettings({ isSecretaryBriefOn: false })}
      className="text-muted-foreground self-start text-xs underline-offset-2 hover:underline"
    >
      {t("secretary.brief.off")}
    </button>
  );
}

/** 상한에 걸려 멈춘 안내 아래 [이어서 하기] — 누르면 답하는 동안 꺼지고, 비서가 실제로 일을 시작하면 서버가 '썼음'으로 바꿔 사라진다 (시작 전에 실패하면 다시 누를 수 있다). 그 뒤 새 질문을 했으면 안 보인다.
 *  다른 기기에서 먼저 눌러 늦게 누른 쪽은 버튼이 사라져도 안내 한 줄을 남긴다 */
function ResumeButton({ noticeId }: { noticeId: number }) {
  const { messages, isBusy } = useSecretary();
  const [failed, setFailed] = useState<SecretaryResumeFail | null>(null);
  const isOpen = isResumable(messages, noticeId);
  if (!isOpen && !failed) return null;
  const press = async () => {
    const r = await window.office.secretaryResume(noticeId);
    setFailed(r.ok ? null : r.reason);
  };
  // 버튼이 없어졌으면(다른 기기에서 먼저 시작 등) 어떤 이유로 못 눌렀든 "이미 이어서 하는 중"
  const error = !failed
    ? ""
    : !isOpen || failed === "gone"
      ? t("secretary.resume.gone")
      : failed === "rate"
        ? t("secretary.queue.rate")
        : t("secretary.resume.busy");
  return (
    <>
      {isOpen && (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => void press()}
          className={cn(IS_TOUCH && "min-h-9 px-4")}
        >
          <RotateCwIcon />
          {t("secretary.resume.button")}
        </Button>
      )}
      {error && (
        <span className="text-muted-foreground text-xs">{error}</span>
      )}
    </>
  );
}

export const SecretaryBubble = memo(function SecretaryBubble({
  message: m,
  onRetry,
}: {
  message: SecretaryMessage;
  onRetry?: () => void;
}) {
  if (m.role === "notice")
    return (
      <div className="flex flex-col items-center gap-1.5">
        <span className="bg-muted text-muted-foreground max-w-[90%] rounded-2xl px-3 py-1 text-xs whitespace-pre-wrap">
          {m.text}
        </span>
        {m.resume && <ResumeButton noticeId={m.id} />}
      </div>
    );
  if (m.role === "me") return <MyBubble message={m} />;
  return (
    <div className="flex gap-2">
      <SecretaryFace />
      <div
        className={cn(
          "flex min-w-0 flex-col gap-0.5",
          m.card || m.approvalIds ? "flex-1" : "max-w-[75%]",
        )}
      >
        <span className="text-muted-foreground text-xs">
          {t("secretary.name")}
        </span>
        {m.approvalIds ? (
          <ApprovalCards ids={m.approvalIds} />
        ) : m.card ? (
          m.card.kind === "edit" ? (
            <EditCompareCard card={m.card} />
          ) : (
            <ConfirmCard card={m.card} />
          )
        ) : (
          <div className="bg-card selectable min-w-0 rounded-2xl border px-3 py-2 text-sm">
            {m.isError ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-status-error text-xs">{m.text}</span>
                {onRetry && (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    {t("secretary.resend")}
                  </Button>
                )}
              </div>
            ) : (
              <Markdown>{m.text}</Markdown>
            )}
          </div>
        )}
        {m.isBrief && <BriefOff />}
        <span className="text-muted-foreground text-[10px]">
          {timeText(m.ts)}
          {m.tokens
            ? ` · ${t("secretary.replyTokens", { n: formatTokens(m.tokens) })}`
            : ""}
        </span>
      </div>
    </div>
  );
});

/** 내 말풍선: 차례를 기다리는 동안은 흐리게 + '차례 기다림 · n번째' 줄 */
function MyBubble({ message: m }: { message: SecretaryMessage }) {
  const isQueued = useQueuePosition(m.id) > 0;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div
        className={cn(
          "bg-primary text-primary-foreground selectable max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
          isQueued && "opacity-60",
        )}
      >
        {m.text}
      </div>
      {isQueued ? (
        <QueuedBadge msgId={m.id} />
      ) : (
        <span className="text-muted-foreground text-[10px]">
          {timeText(m.ts)}
        </span>
      )}
    </div>
  );
}

/** 찾기 결과로 갈 말풍선 — seq는 같은 말풍선으로 다시 갈 때도 움직이게 */
export interface SecretaryFocus {
  id: number;
  seq: number;
}

/** 대화 목록 (아래로 스크롤 고정). since를 주면 그 뒤 대화만 (빠른 창). searchQuery·focus는 비서 화면의 대화 찾기 */
export function SecretaryMessages({
  since,
  className,
  empty,
  searchQuery = "",
  focus = null,
}: {
  since?: number;
  className?: string;
  empty?: React.ReactNode;
  searchQuery?: string;
  focus?: SecretaryFocus | null;
}) {
  const { messages, isBusy, activity, summary } = useSecretary();
  const shown = since ? messages.filter((m) => m.ts >= since) : messages;
  const endRef = useRef<HTMLDivElement>(null);
  // 중괄호로 감싼다: 요즘 Chrome의 scrollIntoView는 Promise를 돌려줘서 그대로 돌려주면 React가 정리 함수로 부른다
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length, isBusy, shown.at(-1)?.card?.status]);
  // 대화 찾기: 찾는 말 표시 · 결과로 고른 말풍선으로 스크롤하고 잠깐 강조 (단체방과 같은 방식)
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  useSearchHighlight(box, searchQuery, shown);
  const [flashId, setFlashId] = useState<number | null>(null);
  useEffect(() => {
    if (!focus) return;
    box
      ?.querySelector(`[data-secretary-id="${focus.id}"]`)
      ?.scrollIntoView({ block: "center" });
    setFlashId(focus.id);
    const timer = setTimeout(() => setFlashId(null), 1600);
    return () => clearTimeout(timer);
  }, [focus, box]);
  const lastMine = [...messages].reverse().find((m) => m.role === "me");
  const retry = lastMine
    ? () => void window.office.secretaryAsk(lastMine.text)
    : undefined;
  if (shown.length === 0 && !isBusy) return <>{empty}</>;
  return (
    <div ref={setBox} className={cn("flex flex-col gap-3", className)}>
      {summary && !since && (
        <details className="text-muted-foreground bg-muted/50 rounded-xl px-3 py-1.5 text-xs">
          <summary className="cursor-pointer select-none">
            {t("secretary.summary.title")}
          </summary>
          <p className="selectable mt-1 whitespace-pre-wrap">{summary}</p>
        </details>
      )}
      {shown.map((m) => (
        <div
          key={m.id}
          data-secretary-id={m.id}
          className={cn(
            "rounded-2xl transition-shadow",
            flashId === m.id &&
              "ring-primary/70 ring-offset-background ring-2 ring-offset-4",
          )}
        >
          <SecretaryBubble
            message={m}
            onRetry={m.isError ? retry : undefined}
          />
        </div>
      ))}
      {isBusy && (
        <div className="flex items-center gap-2">
          <SecretaryFace />
          <span className="text-muted-foreground animate-pulse text-xs">
            {activity || t("secretary.thinking")}
          </span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

const SEARCH_GO_DELAY_MS = 250;

/** 비서 대화 찾기 줄 (#18): 단체방 찾기 줄을 그대로 쓰고, 결과는 화면에 있는 비서 대화에서 바로 찾는다 */
export function SecretarySearch({
  onClose,
  onQuery,
  onGo,
}: {
  onClose: () => void;
  onQuery: (q: string) => void;
  onGo: (id: number) => void;
}) {
  const { messages } = useSecretary();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const hits = useMemo(
    () => findSecretaryHits(messages, query),
    [messages, query],
  );
  // 새 대화가 와서 결과가 줄어도 칸을 넘지 않게
  const current = Math.min(index, Math.max(hits.length - 1, 0));
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  useEffect(() => {
    const q = query.trim();
    onQuery(q);
    setIndex(0);
    if (!q) return;
    // 치는 동안 매번 끌려가지 않게 잠깐 멈췄을 때 가장 최근 결과로
    const timer = setTimeout(() => {
      const first = hitsRef.current[0];
      if (first !== undefined) onGo(first);
    }, SEARCH_GO_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 찾는 말이 바뀔 때만
  }, [query]);
  useEffect(() => () => onQuery(""), [onQuery]);
  const move = (step: number) => {
    const next = stepIndex(current, step, hits.length);
    if (next === null) return;
    setIndex(next);
    onGo(hits[next]);
  };
  return (
    <SearchField
      query={query}
      onChange={setQuery}
      total={hits.length}
      index={current}
      onMove={move}
      onClose={onClose}
    />
  );
}

const askFailText = (reason: "full" | "rate" | "empty") =>
  reason === "full"
    ? t("secretary.queue.full", { n: QUEUE_MAX })
    : reason === "rate"
      ? t("secretary.queue.rate")
      : "";

/** placeholder: 좁은 창(바탕화면 비서 펼침 창)은 짧은 안내로 바꿔 끼운다 */
/** onSubmit을 주면 비서 대신 그쪽으로 보낸다 (바탕화면 비서 펼침 창에서 직원·대화방에 보낼 때).
 * 보내기가 실패하면 쓴 내용을 입력창에 되돌리고 sendFailedText를 보여 준다 — 그 사이 새로 쓴 글은 덮어쓰지 않는다 */
export function SecretaryComposer({
  autoFocus,
  onSent,
  placeholder,
  onSubmit,
  sendFailedText = t("deskPet.sendFailed"),
}: {
  autoFocus?: boolean;
  onSent?: () => void;
  placeholder?: string;
  onSubmit?: (text: string) => Promise<unknown> | void;
  sendFailedText?: string;
}) {
  const [draft, setDraft] = useState("");
  // 보내지 못한 까닭 (빈 글이면 안내 없음). 쓴 글은 입력창에 되돌린다
  const [failText, setFailText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const prefill = useSecretaryDraft((s) => s.prefill);
  useEffect(() => {
    if (!prefill) return;
    setDraft(prefill.text);
    ref.current?.focus();
  }, [prefill]);
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setFailText("");
    // 그 사이 새로 쓴 글은 덮어쓰지 않는다
    const restore = (why: string) => {
      setDraft((now) => (now.trim() ? now : text));
      setFailText(why);
    };
    if (onSubmit) {
      void Promise.resolve(onSubmit(text)).catch(() => restore(sendFailedText));
    } else {
      // 비서: 기다리는 줄이 꽉 찼거나 너무 잦으면 main이 받지 않는다 — 대화에 남지 않으니 입력창에 그대로 둔다
      void window.office
        .secretaryAsk(text)
        .then((r) => {
          if (r && !r.ok) restore(askFailText(r.reason));
        })
        .catch(() => restore(sendFailedText));
    }
    onSent?.();
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) =>
    handleComposerKey(e, send, setDraft);
  return (
    <div>
      {failText && (
        <p role="alert" className="text-destructive mb-1.5 text-xs">
          {failText}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setFailText("");
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            placeholder ??
            t("secretary.placeholder", { hint: String(NEWLINE_HINT) })
          }
          className="field-sizing-content placeholder:truncate placeholder-shown:field-sizing-fixed placeholder-shown:h-9 placeholder-shown:overflow-hidden placeholder-shown:whitespace-nowrap max-h-32 min-h-9 resize-none py-[7px]"
        />
        <Button
          size="icon"
          onClick={send}
          disabled={!draft.trim()}
          aria-label={t("secretary.send")}
        >
          <SendIcon />
        </Button>
      </div>
    </div>
  );
}
