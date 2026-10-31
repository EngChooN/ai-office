import type { PetLayout } from "@shared/deskPet";

// 캐릭터 머리 위 도트 말풍선: 결재 대기는 빨간 '!', 생각 중은 '…', 펼침 창을 닫아 둔 사이 끝난 일은 초록 '✓' (대표 시안 — 캐릭터와 같은 도트 그림체)
// 그림은 14×13칸 도트 판으로 그리고, 한 칸 크기를 캐릭터 크기(layout.scale)에 맞춰 정수 px로 키워 흐려지지 않게 한다

export type PetBadgeKind = "approval" | "thinking" | "done";

/** 말풍선 판: B 테두리, W 바탕, . 투명 */
const FRAME = [
  "..BBBBBBBBBB..",
  ".BWWWWWWWWWWB.",
  "BWWWWWWWWWWWWB",
  "BWWWWWWWWWWWWB",
  "BWWWWWWWWWWWWB",
  "BWWWWWWWWWWWWB",
  "BWWWWWWWWWWWWB",
  "BWWWWWWWWWWWWB",
  "BWWWWWWWWWWWWB",
  ".BWWWWWWWWWWB.",
  "..BBBWWBBBBB..",
  ".....BWB......",
  "......B.......",
];

/** 말풍선 안 기호: X 칸만 칠한다 */
const GLYPH: Record<PetBadgeKind, { color: string; art: string[] }> = {
  approval: {
    color: "#e5383b",
    art: [
      "",
      "",
      "......XX......",
      "......XX......",
      "......XX......",
      "......XX......",
      "......XX......",
      "",
      "......XX......",
    ],
  },
  thinking: {
    color: "#1f1f2b",
    art: ["", "", "", "", "..XX..XX..XX..", "..XX..XX..XX.."],
  },
  done: {
    color: "#2f9e44",
    art: [
      "",
      "",
      "..........XX..",
      ".........XX...",
      "..XX....XX....",
      "...XX..XX.....",
      "....XXXX......",
      ".....XX.......",
    ],
  },
};

const COLS = FRAME[0].length;
const ROWS = FRAME.length;
const COLOR: Record<string, string> = { B: "#1f1f2b", W: "#ffffff" };

/** 같은 글자가 이어진 칸을 가로 막대 하나로 묶는다 (rect 개수를 줄인다) */
function runs(art: string[], pick: (ch: string) => string | undefined) {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  art.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const fill = pick(row[x]);
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (fill) out.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  return out;
}

const FRAME_RUNS = runs(FRAME, (ch) => COLOR[ch]);
const GLYPH_RUNS = Object.fromEntries(
  (Object.keys(GLYPH) as PetBadgeKind[]).map((k) => [
    k,
    runs(GLYPH[k].art, (ch) => (ch === "X" ? GLYPH[k].color : undefined)),
  ]),
) as Record<PetBadgeKind, ReturnType<typeof runs>>;

export function PetBadge({
  kind,
  layout,
  label,
}: {
  kind: PetBadgeKind;
  layout: PetLayout;
  label: string;
}) {
  // 112px일 때 한 칸 3px (말풍선 42×39) — 캐릭터 크기 80~160px에서 2~4px
  const dot = Math.max(2, Math.round(3 * layout.scale));
  // 캐릭터 가운데 위 — 반 픽셀에 걸려 흐려지지 않게 정수 px로
  const left = Math.round((layout.char.width - COLS * dot) / 2);
  return (
    <svg
      role="img"
      aria-label={label}
      width={COLS * dot}
      height={ROWS * dot}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      shapeRendering="crispEdges"
      className="pointer-events-none absolute"
      style={{ left, bottom: `calc(100% + ${dot}px)` }}
    >
      {[...FRAME_RUNS, ...GLYPH_RUNS[kind]].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
