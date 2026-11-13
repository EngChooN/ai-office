import { useOffice } from "@/store";
import { EMPTY_SECRETARY } from "@shared/types";
import { queuePosition } from "@shared/secretaryQueue";
import { t } from "@shared/i18n";

// 차례를 기다리는 내 질문 아래 한 줄: '차례 기다림 · n번째' · [빼기], 맨 앞 질문에는 대기가 2개 이상일 때 [하나로 합쳐 묻기].
// ⌘K 비서·비서 화면·바탕화면 비서가 같이 쓴다 (줄은 main이 갖고, 여기서는 스냅샷 queued를 보여 주기만)

const EMPTY_QUEUE: number[] = [];

export const useQueuePosition = (msgId: number) =>
  useOffice((s) => queuePosition((s.secretary ?? EMPTY_SECRETARY).queued ?? [], msgId));

export function QueuedBadge({ msgId }: { msgId: number }) {
  // 옛 PC(이 칸이 없는 스냅샷)에 붙은 원격 화면도 깨지지 않게 빈 줄로
  const queued = useOffice((s) => (s.secretary ?? EMPTY_SECRETARY).queued ?? EMPTY_QUEUE);
  const n = queuePosition(queued, msgId);
  // 누르는 사이 답이 시작됐으면 main이 false를 돌려주고 queued에서도 빠져 이 줄이 저절로 사라진다
  if (!n) return null;
  return (
    <span className="text-muted-foreground flex flex-wrap items-center justify-end gap-x-2 text-[11px]">
      <span>{t("secretary.queue.position", { n })}</span>
      <button
        type="button"
        aria-label={t("secretary.queue.cancelLabel")}
        onClick={() => void window.office.secretaryCancelQueued(msgId)}
        className="hover:text-foreground underline-offset-2 hover:underline"
      >
        {t("secretary.queue.cancel")}
      </button>
      {n === 1 && queued.length >= 2 && (
        <button
          type="button"
          title={t("secretary.queue.mergeHint", { n: queued.length })}
          onClick={() => void window.office.secretaryMergeQueued()}
          className="text-primary underline-offset-2 hover:underline"
        >
          {t("secretary.queue.merge")}
        </button>
      )}
    </span>
  );
}
