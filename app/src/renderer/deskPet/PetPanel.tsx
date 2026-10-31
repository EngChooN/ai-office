import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  EyeOffIcon,
  MessagesSquareIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { JumpToBottom, useStickToBottom } from "@/components/stick-to-bottom";
import { cn } from "@/lib/utils";
import { useOffice } from "@/store";
import { SecretaryComposer } from "@/features/secretary/SecretaryChat";
import { SecretaryFace } from "@/features/secretary/SecretaryFace";
import { QuestionBox } from "@/features/QuestionBox";
import {
  EMPTY_SECRETARY,
  type AutoHandled,
  type ChatMessage,
  type LogEntry,
} from "@shared/types";
import {
  addSettled,
  doneFromChat,
  findPetTarget,
  fitsPetPanel,
  mergeFeed,
  PET_SECRETARY,
  petApprovals,
  petTargetKey,
  petTargets,
  petWorkingCount,
  pruneSettled,
  recentAuto,
  roomFeed,
  settleVanished,
  staffFeed,
  targetApprovals,
  type PetApproval,
  type PetFeedItem,
  type PetOpenTarget,
  type PetSettled,
  type PetSettledKind,
  type PetTarget,
  type PetTargetOption,
} from "@shared/deskPet";
import { toolDisplayName } from "@shared/computerTools";
import { maskSecrets } from "@shared/redact";
import { t, trOr } from "@shared/i18n";

// 펼침 창: 머리줄(상대 고르기 · 작업 중 N명 · 결재 N) · 대화 흐름(메시지 + 결재·질문·완료 카드를 시간순) · 입력창
// 디자인: docs/design/desktop-secretary/README.md "대화 흐름·윈도우 배치 추가 시안". 섞는 규칙은 shared/deskPet.ts (mergeFeed·staffFeed·roomFeed·doneFromChat)
// 직원·대화방에는 앱과 같은 처리 함수(instruct·sendChat)로 보내 기록이 앱에도 남는다. 바꾸는 일(비서 확인 카드)은 앱의 비서 화면으로 넘긴다.
// 결재 승인·반려와 직원 질문 답하기는 여기서 바로 (pet:decide·pet:answer — 너무 길거나 복잡한 질문은 fitsPetPanel로 걸러 앱에서 열기)

const pet = () => window.officePet!;
const open = (target: PetOpenTarget) => pet().openApp(target);
const RECENT_MAX = 20;
const NO_LOGS: LogEntry[] = [];
/** 직원이 일하는 동안 대화를 다시 읽는 간격 (중간 답도 보이게) */
const STAFF_REFRESH_MS = 4000;

const titleOf = (a: PetApproval) =>
  `${a.staffName} · ${trOr(a.summaryI18n, a.summary)}`;
const optionName = (o: PetTargetOption) =>
  o.target.kind === "secretary"
    ? t("secretary.name")
    : o.target.kind === "room" && !o.target.room
      ? t("chat.room.all")
      : o.name;

export function PetPanel() {
  const secretary = useOffice((s) => s.secretary ?? EMPTY_SECRETARY);
  const isAuto = useOffice((s) => s.autoApprove.isActive);
  const staff = useOffice((s) => s.staff);
  const teams = useOffice((s) => s.teams);
  const labs = useOffice((s) => s.labs);
  const approvals = useMemo(() => petApprovals(staff), [staff]);
  const targets = useMemo(
    () => petTargets({ staff, teams, labs }),
    [staff, teams, labs],
  );
  const [target, setTarget] = useState<PetTarget>(PET_SECRETARY);
  const option = findPetTarget(target, targets);
  const current = option.target;
  const currentKey = petTargetKey(current);
  const currentStaff =
    current.kind === "staff"
      ? staff.find((s) => s.id === current.staffId)
      : undefined;
  const workingCount = petWorkingCount(staff);
  // 창을 열 때마다 올라가는 번호 — 대화 끝(최근 메시지)으로 다시 내려간다
  const [shownCount, setShownCount] = useState(0);
  const [isPickerOpen, setPickerOpen] = useState(false);

  const autoLog = useAutoLog();
  const actions = useApprovalActions(approvals);
  const { chat, reload: reloadChat } = useChat(staff, shownCount);
  const { logs, reload: reloadLogs } = useStaffLogs(
    currentStaff?.id,
    `${currentStaff?.status}:${currentStaff?.unreadReports ?? 0}:${currentStaff?.approvals.length ?? 0}:${shownCount}`,
    currentStaff?.status === "working",
  );

  useEffect(() => {
    // 열 때마다 최근 대화가 보이고 입력창에 바로 적을 수 있게
    const off = pet().onPanelShown(() => {
      setShownCount((n) => n + 1);
      setPickerOpen(false);
      document
        .querySelector<HTMLTextAreaElement>(".pet-composer textarea")
        ?.focus();
    });
    return off;
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      pet().closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 대화 흐름: 상대의 메시지 + 그 상대와 관련된 결재·질문 카드 (+ 비서는 최근 완료·자동결재 기록)
  const shownApprovals = useMemo(
    () => targetApprovals(option, actions.shown),
    [option, actions.shown],
  );
  const feed = useMemo<PetFeedItem[]>(() => {
    const cards: PetFeedItem[] = shownApprovals.map((a) => ({
      kind: "approval",
      key: `approval:${a.id}`,
      at: a.createdAt,
      approval: a,
    }));
    if (current.kind === "staff")
      return mergeFeed(
        staffFeed(logs, currentStaff?.name ?? "", RECENT_MAX * 2),
        cards,
      );
    if (current.kind === "room")
      return mergeFeed(
        roomFeed(
          chat,
          current.room,
          (id) =>
            staff.find((s) => s.id === id)?.name ?? t("common.formerStaff"),
          RECENT_MAX * 2,
        ),
        cards,
      );
    const now = Date.now();
    const messages: PetFeedItem[] = secretary.messages
      .slice(-RECENT_MAX)
      .map((m) => ({
        kind: "message",
        key: `sec:${m.id}`,
        at: m.ts,
        isMine: m.role === "me",
        text: m.text,
        isMarkdown: m.role !== "me",
        isError: m.isError,
        hasCard: !!m.card,
      }));
    const autos: PetFeedItem[] = recentAuto(autoLog, now).map((h) => ({
      kind: "auto",
      key: `auto:${h.id}`,
      at: h.at,
      handled: h,
    }));
    return mergeFeed(messages, cards, doneFromChat(chat, staff, now), autos);
  }, [
    current,
    currentStaff?.name,
    logs,
    chat,
    staff,
    secretary.messages,
    autoLog,
    shownApprovals,
  ]);

  const scroll = useStickToBottom(
    feed,
    (i) => i.key,
    `${currentKey}:${shownCount}`,
  );

  // 결재 배지: 첫 대기 카드로 이동 (지금 상대에 없으면 모든 결재가 보이는 비서로 바꾼 뒤)
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const jumpToApproval = () => {
    const first = approvals[0];
    if (!first) return;
    if (!shownApprovals.some((a) => a.id === first.id))
      setTarget(PET_SECRETARY);
    setJumpTo(first.id);
  };
  useEffect(() => {
    if (!jumpTo) return;
    const el = document.querySelector<HTMLElement>(
      `[data-approval="${CSS.escape(jumpTo)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
    setJumpTo(null);
  }, [jumpTo, feed]);

  const pick = (next: PetTarget) => {
    setTarget(next);
    setPickerOpen(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLTextAreaElement>(".pet-composer textarea")
        ?.focus(),
    );
  };
  const send = useMemo(() => {
    // 실패는 입력창(SecretaryComposer)이 받아 쓴 내용을 되돌리고 안내한다
    if (current.kind === "staff")
      return (text: string) =>
        window.office.instruct(current.staffId, text).finally(reloadLogs);
    if (current.kind === "room")
      return (text: string) =>
        window.office
          .sendChat(text, undefined, current.room || undefined)
          .finally(reloadChat);
    return undefined;
  }, [current, reloadLogs, reloadChat]);

  const name = optionName(option);
  const placeholder =
    current.kind === "secretary"
      ? t("deskPet.placeholder")
      : current.kind === "staff"
        ? t("deskPet.placeholderStaff", { name })
        : t("deskPet.placeholderRoom", { name });
  const busyLine =
    current.kind === "secretary"
      ? secretary.isBusy
        ? secretary.activity || t("deskPet.thinking")
        : ""
      : currentStaff?.status === "working"
        ? `${currentStaff.name} · ${currentStaff.activity || t("deskPet.workingNow")}`
        : "";
  const openTarget: PetOpenTarget =
    current.kind === "secretary"
      ? { kind: "secretary" }
      : current.kind === "staff"
        ? { kind: "staff", staffId: current.staffId }
        : { kind: "app" };
  const workingNames = staff
    .filter((s) => s.kind === "hired" && s.status === "working")
    .map((s) => s.name);

  return (
    <div className="pet-panel bg-background text-foreground relative flex h-screen flex-col text-[13px]">
      <header className="flex items-center gap-1.5 border-b px-3 py-2.5 [-webkit-app-region:drag]">
        <SecretaryFace className="size-7 shrink-0" />
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={isPickerOpen}
          aria-label={t("deskPet.pickTarget", { name })}
          title={name}
          onClick={() => setPickerOpen((v) => !v)}
          className="hover:bg-accent focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-2 [-webkit-app-region:no-drag]"
        >
          <span className="truncate text-[15px] font-semibold">{name}</span>
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
        </button>
        {workingCount > 0 && (
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
            title={workingNames.join(", ")}
          >
            {t("deskPet.workingChip", { n: workingCount })}
          </span>
        )}
        {approvals.length > 0 && (
          <button
            type="button"
            onClick={jumpToApproval}
            aria-label={`${t("deskPet.pending", { n: approvals.length })} — ${t("deskPet.jumpApproval")}`}
            title={t("deskPet.jumpApproval")}
            className="hover:bg-accent focus-visible:ring-ring border-primary/50 text-primary shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap outline-none focus-visible:ring-2 [-webkit-app-region:no-drag]"
          >
            {t("deskPet.approvalChip", { n: approvals.length })}
          </button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 [-webkit-app-region:no-drag]"
          aria-label={t("deskPet.openApp")}
          title={t("deskPet.openApp")}
          onClick={() => open(openTarget)}
        >
          <ArrowUpRightIcon />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 [-webkit-app-region:no-drag]"
          aria-label={t("deskPet.hide")}
          title={`${t("deskPet.hide")} — ${t("deskPet.hideHint")}`}
          onClick={() => pet().hide()}
        >
          <EyeOffIcon />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 [-webkit-app-region:no-drag]"
          aria-label={t("deskPet.close")}
          onClick={() => pet().closePanel()}
        >
          <XIcon />
        </Button>
      </header>
      {isPickerOpen && (
        <TargetPicker
          targets={targets}
          currentKey={currentKey}
          staff={staff}
          onPick={pick}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroll.ref}
          onScroll={scroll.onScroll}
          className="h-full overflow-y-auto px-4"
          aria-label={t("deskPet.recent")}
          role="log"
        >
          <div ref={scroll.contentRef} className="flex flex-col gap-3 py-3">
            {isAuto && (
              <p
                className="text-muted-foreground text-xs"
                title={t("deskPet.autoOnHint")}
              >
                {t("deskPet.autoOn")}
              </p>
            )}
            {feed.length === 0 && (
              <p className="text-muted-foreground">
                {current.kind === "secretary"
                  ? t("deskPet.empty")
                  : current.kind === "staff"
                    ? t("deskPet.emptyStaff", { name })
                    : t("deskPet.emptyRoom")}
              </p>
            )}
            {feed.map((item) => (
              <FeedRow
                key={item.key}
                item={item}
                actions={actions}
                hasStaff={(id) => staff.some((s) => s.id === id)}
              />
            ))}
            {busyLine && (
              <p className="text-muted-foreground self-start">{busyLine}</p>
            )}
          </div>
        </div>
        <JumpToBottom
          isNear={scroll.isNear}
          unread={scroll.unread}
          onClick={() => scroll.scrollToBottom(true)}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {actions.announce}
      </span>

      <div className="pet-composer border-t px-3 py-2.5">
        <SecretaryComposer
          key={currentKey}
          placeholder={placeholder}
          onSubmit={send}
          onSent={() => scroll.scrollToBottom()}
        />
      </div>
    </div>
  );
}

/** 상대 고르기: 비서 · 직원 · 대화방 (앱의 직원 목록·단체방 탭과 같은 목록) */
function TargetPicker({
  targets,
  currentKey,
  staff,
  onPick,
  onClose,
}: {
  targets: ReturnType<typeof petTargets>;
  currentKey: string;
  staff: { id: string; role: string; status: string }[];
  onPick: (t: PetTarget) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (
        !ref.current?.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[aria-haspopup="menu"]')
      )
        onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  // 위·아래 화살표로 항목 사이를 옮긴다
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]',
      ) ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[
      (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
    ]?.focus();
  };
  const item = (o: PetTargetOption, icon: React.ReactNode, sub?: string) => {
    const key = petTargetKey(o.target);
    const isOn = key === currentKey;
    return (
      <button
        key={key}
        type="button"
        role="menuitemradio"
        aria-checked={isOn}
        onClick={() => onPick(o.target)}
        className={cn(
          "hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none",
          isOn && "font-semibold",
        )}
      >
        <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{optionName(o)}</span>
        {sub && (
          <span className="text-muted-foreground shrink-0 text-xs">{sub}</span>
        )}
        {isOn && (
          <CheckIcon className="text-primary size-4 shrink-0" aria-hidden />
        )}
      </button>
    );
  };
  const group = (label: string, children: React.ReactNode[]) =>
    children.length > 0 && (
      <div
        role="group"
        aria-label={label}
        className="flex flex-col gap-0.5 border-t pt-1.5"
      >
        <p
          className="text-muted-foreground px-2 text-[11px] font-semibold"
          aria-hidden
        >
          {label}
        </p>
        {children}
      </div>
    );
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("deskPet.targets")}
      onKeyDown={onKeyDown}
      className="bg-popover text-popover-foreground absolute top-12 left-3 z-20 flex max-h-[60vh] w-64 flex-col gap-1.5 overflow-y-auto rounded-lg border p-1.5 shadow-lg"
    >
      {item(targets.secretary, <SecretaryFace className="size-5" />)}
      {group(
        t("deskPet.groupStaff"),
        targets.staff.map((o) => {
          const s =
            o.target.kind === "staff"
              ? staff.find(
                  (x) => x.id === (o.target as { staffId: string }).staffId,
                )
              : undefined;
          return item(
            o,
            <UserIcon className="size-4" />,
            s?.status === "working" ? t("deskPet.workingNow") : s?.role,
          );
        }),
      )}
      {group(
        t("deskPet.groupRooms"),
        targets.rooms.map((o) =>
          item(o, <MessagesSquareIcon className="size-4" />),
        ),
      )}
    </div>
  );
}

function FeedRow({
  item,
  actions,
  hasStaff,
}: {
  item: PetFeedItem;
  actions: ApprovalActions;
  hasStaff: (id: string) => boolean;
}) {
  switch (item.kind) {
    case "message":
      return (
        <div
          className={cn(
            "flex max-w-[90%] flex-col gap-0.5",
            item.isMine ? "self-end" : "self-start",
          )}
        >
          {item.author && (
            <span className="text-muted-foreground px-1 text-xs">
              {item.author}
            </span>
          )}
          <div
            className={cn(
              "rounded-xl px-3 py-2",
              item.isMine ? "bg-primary text-primary-foreground" : "bg-muted",
              item.isError && "text-destructive",
            )}
          >
            {item.isMarkdown ? (
              <Markdown>{item.text}</Markdown>
            ) : (
              <p className="break-words whitespace-pre-wrap">{item.text}</p>
            )}
            {item.hasCard && (
              <div className="mt-2 flex flex-col items-start gap-1.5 border-t pt-2">
                <span className="text-muted-foreground text-xs">
                  {t("deskPet.cardInApp")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => open({ kind: "secretary" })}
                >
                  {t("deskPet.openApp")}
                </Button>
              </div>
            )}
          </div>
        </div>
      );
    case "approval":
      return <ApprovalCard approval={item.approval} actions={actions} />;
    case "done":
      return (
        <DoneCard
          staffId={item.staffId}
          staffName={item.staffName}
          summary={item.summary}
          canOpen={hasStaff(item.staffId)}
        />
      );
    case "auto":
      return <AutoCard handled={item.handled} />;
  }
}

/** 완료 카드: "○○ 완료" · 결과 요약 한 줄 · 결과 열기(앱의 그 직원 대화 — 보고 원문과 결과물이 있는 곳) */
function DoneCard({
  staffId,
  staffName,
  summary,
  canOpen,
}: {
  staffId: string;
  staffName: string;
  summary: string;
  canOpen: boolean;
}) {
  const title = t("deskPet.doneTitle", { name: staffName });
  return (
    <div className="bg-card flex flex-col gap-1.5 rounded-xl border px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[14px] font-semibold">
        <CircleCheckIcon
          className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden
        />
        <span className="min-w-0 truncate">{title}</span>
      </p>
      <p
        className={cn(
          "line-clamp-2 break-words",
          !summary && "text-muted-foreground",
        )}
      >
        {summary || t("deskPet.doneNoSummary")}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="justify-between"
        disabled={!canOpen}
        aria-label={t("deskPet.openResultOf", { name: staffName })}
        onClick={() => open({ kind: "staff", staffId })}
      >
        {canOpen ? t("deskPet.openResult") : t("deskPet.cannotOpen")}
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

function AutoCard({ handled: h }: { handled: AutoHandled }) {
  return (
    <div className="bg-muted/50 flex flex-col gap-0.5 rounded-lg border border-dashed px-3 py-2 text-xs">
      <span className="text-muted-foreground font-medium">{autoLabel(h)}</span>
      <span className="line-clamp-2 break-words">
        {h.staffName} ·{" "}
        {h.kind === "answer" ? "" : `${toolDisplayName(h.toolName)} `}
        {maskSecrets(trOr(h.summaryI18n, h.summary))}
      </span>
    </div>
  );
}

function ApprovalCard({
  approval: a,
  actions,
}: {
  approval: PetApproval;
  actions: ApprovalActions;
}) {
  const done = actions.settledOf.get(a.id);
  const state: ItemState | undefined = actions.states[a.id];
  const title = titleOf(a);
  const summary = trOr(a.summaryI18n, a.summary);
  const isInline = !done && !!a.questions?.length && fitsPetPanel(a.questions);
  return (
    <div
      data-approval={a.id}
      tabIndex={-1}
      className="bg-card focus-visible:ring-ring flex flex-col gap-2 rounded-xl border px-3 py-2.5 outline-none focus-visible:ring-2"
    >
      <p className="text-muted-foreground truncate text-xs">
        {[a.staffName, a.staffRole].filter(Boolean).join(" · ")}
      </p>
      {/* 여기서 답할 질문은 질문 글이 곧 제목 (QuestionBox가 보여 준다) */}
      {!isInline && (
        <p
          className="line-clamp-2 text-[14px] font-semibold break-words"
          title={summary}
        >
          {summary}
        </p>
      )}
      {done ? (
        <span className="text-muted-foreground text-xs font-medium">
          {t(SETTLED_LABEL[done.kind])}
        </span>
      ) : isInline ? (
        // 처리 중에는 통째로 막아 두 번 보내지 않게 (fieldset disabled는 안의 버튼·입력칸을 모두 끈다)
        <fieldset
          disabled={state?.kind === "busy"}
          aria-busy={state?.kind === "busy"}
          className="flex min-w-0 flex-col gap-2"
        >
          <QuestionBox
            approval={a}
            isCompact
            onAnswer={(answers) =>
              void actions.run(a, () => pet().answer(a.id, answers), "answered")
            }
            onSkip={() =>
              void actions.run(a, () => pet().skip(a.id), "skipped")
            }
          />
          {state?.kind === "busy" && (
            <span className="text-muted-foreground text-xs">
              {t("deskPet.busy")}
            </span>
          )}
          {state?.kind === "error" && (
            <span className="text-destructive text-xs">
              {t("deskPet.failed")}
            </span>
          )}
        </fieldset>
      ) : a.questions?.length ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground flex-1 text-xs">
            {t("deskPet.question")}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="min-w-11"
            aria-label={t("deskPet.openOf", { title })}
            onClick={() => open({ kind: "staff", staffId: a.staffId })}
          >
            {t("deskPet.openApp")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="min-w-11"
            disabled={state?.kind === "busy"}
            aria-label={t("deskPet.approveOf", { title })}
            onClick={() => void actions.decide(a, true)}
          >
            {state?.kind === "busy" ? t("deskPet.busy") : t("deskPet.approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-w-11"
            disabled={state?.kind === "busy"}
            aria-label={t("deskPet.rejectOf", { title })}
            onClick={() => void actions.decide(a, false)}
          >
            {t("deskPet.reject")}
          </Button>
          {state?.kind === "error" && (
            <p className="text-destructive w-full text-xs">
              {t("deskPet.failed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** 자동결재가 대신 처리한 기록 (결재함 "자동 처리됨"과 같은 기록 — autoApproveLog). 새 기록이 생기거나 켜고 끌 때 다시 읽는다 */
function useAutoLog() {
  const counts = useOffice((s) => s.autoApprove.counts);
  const isActive = useOffice((s) => s.autoApprove.isActive);
  const total =
    counts.edit +
    counts.command +
    counts.other +
    counts.answered +
    counts.waited;
  const [log, setLog] = useState<AutoHandled[]>([]);
  useEffect(() => {
    let isLive = true;
    void window.office
      .autoApproveLog()
      .then((l) => isLive && setLog(l))
      .catch(() => {});
    return () => {
      isLive = false;
    };
  }, [total, isActive]);
  return log;
}

/** 단체방 글 (대화방 대화 · 직원 보고 = 완료 카드). 새 글·결재 결과가 올 때(onChat), 보고가 늘거나(안 읽은 보고 수) 창을 열거나 보낸 뒤 다시 읽는다 */
function useChat(staff: { unreadReports?: number }[], shownCount: number) {
  const reports = staff.reduce((n, s) => n + (s.unreadReports ?? 0), 0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let isLive = true;
    void window.office
      .chatHistory()
      .then((c) => isLive && setChat(c))
      .catch(() => {});
    return () => {
      isLive = false;
    };
  }, [reports, shownCount, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  // 글이 연달아 오면 한 번만 다시 읽는다
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.office.onChat(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, 250);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [reload]);
  return { chat, reload };
}

const isSameLogs = (a: LogEntry[], b: LogEntry[]) =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id && x.text === b[i].text);

/** 고른 직원의 오늘 기록 (앱 직원 패널과 같은 getRecord). 상태·보고·결재가 바뀌거나 일하는 동안 몇 초마다 다시 읽는다 */
function useStaffLogs(
  staffId: string | undefined,
  refreshKey: string,
  isWorking: boolean,
) {
  const [logs, setLogs] = useState<{
    staffId: string;
    logs: LogEntry[];
  } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!staffId) return;
    let isLive = true;
    void window.office
      .getRecord(staffId)
      // 몇 초마다 다시 읽어도 기록이 그대로면 다시 그리지 않는다
      .then((r) => isLive && setLogs((prev) => (prev?.staffId === staffId && isSameLogs(prev.logs, r.logs) ? prev : { staffId, logs: r.logs })))
      .catch(() => {});
    return () => {
      isLive = false;
    };
  }, [staffId, refreshKey, tick]);
  useEffect(() => {
    if (!staffId || !isWorking) return;
    const timer = setInterval(() => setTick((n) => n + 1), STAFF_REFRESH_MS);
    return () => clearInterval(timer);
  }, [staffId, isWorking]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return {
    logs: logs && logs.staffId === staffId ? logs.logs : NO_LOGS,
    reload,
  };
}

/** 처리 중·실패는 아직 목록에 있는 결재에만 붙는다 (목록을 떠나면 settled가 맡는다) */
type ItemState = { kind: "busy" } | { kind: "error" };
type ApprovalActions = ReturnType<typeof useApprovalActions>;

const SETTLED_LABEL = {
  approved: "deskPet.didApprove",
  rejected: "deskPet.didReject",
  answered: "deskPet.didAnswer",
  skipped: "deskPet.didSkip",
  elsewhere: "deskPet.elsewhere",
} as const satisfies Record<PetSettledKind, string>;
/** 내가 처리했을 때 화면 읽기 프로그램에 알리는 말 */
const DONE_ANNOUNCE = {
  approved: "deskPet.approved",
  rejected: "deskPet.rejected",
  answered: "deskPet.answered",
  skipped: "deskPet.skipped",
} as const;

function autoLabel(h: AutoHandled) {
  return h.kind === "answer"
    ? t("autoApprove.answered")
    : h.kind === "skipped"
      ? t("autonomy.skipped")
      : h.kind === "plan"
        ? t("autonomy.planApproved")
        : t("deskPet.autoApproved");
}

/** 결재 카드 상태: 처리 중·실패, 목록을 떠난 결재(내가 처리·다른 곳에서 처리됨 — 항목마다 SETTLED_MS 뒤 빠진다) */
function useApprovalActions(approvals: PetApproval[]) {
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [settled, setSettled] = useState<PetSettled[]>([]);
  const [announce, setAnnounce] = useState("");
  const prev = useRef<PetApproval[]>([]);
  const busy = useRef(new Set<string>());
  useEffect(() => {
    const before = prev.current;
    prev.current = approvals;
    setSettled((l) =>
      settleVanished(l, before, approvals, busy.current, Date.now()),
    );
    // 목록에서 빠진 결재의 실패 표시는 버린다 (처리 중은 결과가 오면 지운다)
    setStates((st) => {
      const ids = new Set(approvals.map((a) => a.id));
      const kept = Object.entries(st).filter(
        ([id, v]) => ids.has(id) || v.kind === "busy",
      );
      return kept.length === Object.keys(st).length
        ? st
        : Object.fromEntries(kept);
    });
  }, [approvals]);
  // 가장 먼저 끝나는 항목에 맞춰 하나의 타이머로 정리한다 (창을 닫으면 타이머도 정리)
  useEffect(() => {
    if (!settled.length) return;
    const wait = Math.max(
      0,
      Math.min(...settled.map((x) => x.until)) - Date.now(),
    );
    const timer = setTimeout(
      () => setSettled((l) => pruneSettled(l, Date.now())),
      wait,
    );
    return () => clearTimeout(timer);
  }, [settled]);

  /** 결재 승인·반려, 질문 답하기·넘기기를 같은 흐름으로: 처리 중 표시 → 결과(내가 처리·다른 곳에서 처리됨·실패) */
  const run = async (
    a: PetApproval,
    call: () => Promise<string>,
    doneKind: keyof typeof DONE_ANNOUNCE,
  ) => {
    busy.current.add(a.id);
    setStates((s) => ({ ...s, [a.id]: { kind: "busy" } }));
    const settle = (kind: PetSettledKind) =>
      setSettled((l) => addSettled(l, a, kind, Date.now()));
    // 처리하는 동안 스냅샷에서 이미 빠졌으면(settleVanished가 건너뛴 경우) 여기서 남긴다
    const isGone = () => !prev.current.some((x) => x.id === a.id);
    try {
      const result = await call();
      if (result === "done") {
        settle(doneKind);
        setAnnounce(t(DONE_ANNOUNCE[doneKind], { title: titleOf(a) }));
      } else if (result === "busy") {
        // 같은 결재를 다른 곳(앱 등)에서 처리하는 중 — 결과는 스냅샷으로 온다
        if (isGone()) settle("elsewhere");
      } else if (result === "already") {
        settle("elsewhere");
        setAnnounce(t("deskPet.already"));
      } else {
        // 질문이 바뀌어 여기서 답할 수 없게 됨 (tooComplex·invalid 등) — 앱에서 답하도록 실패로 남긴다
        setStates((s) => ({ ...s, [a.id]: { kind: "error" } }));
        setAnnounce(t("deskPet.failed"));
        return;
      }
      setStates(({ [a.id]: _, ...rest }) => rest);
    } catch {
      if (isGone()) settle("elsewhere");
      setStates((s) => ({ ...s, [a.id]: { kind: "error" } }));
      setAnnounce(t("deskPet.failed"));
    } finally {
      busy.current.delete(a.id);
    }
  };
  const decide = (a: PetApproval, allow: boolean) =>
    run(a, () => pet().decide(a.id, allow), allow ? "approved" : "rejected");

  const settledOf = new Map(settled.map((x) => [x.approval.id, x]));
  // 대기 중 + 방금 처리돼 잠시 남겨 둔 결재
  const shown = useMemo(
    () => [
      ...approvals,
      ...settled
        .map((x) => x.approval)
        .filter((g) => !approvals.some((a) => a.id === g.id)),
    ],
    [approvals, settled],
  );
  return { states, settledOf, shown, announce, run, decide };
}
