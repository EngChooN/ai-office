// 바탕화면 비서 펼침 창 대화 흐름: 상대 목록·시간순 섞기·완료 카드·요약 한 줄·완료 감지 단위 테스트 — npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  doneFromChat,
  DONE_RECENT_MS,
  findPetTarget,
  mergeFeed,
  newReports,
  PET_SECRETARY,
  petTargetKey,
  petTargets,
  petWorkingCount,
  pickBubble,
  roomFeed,
  staffFeed,
  summaryLine,
  targetApprovals,
  type PetApproval,
  type PetFeedItem,
} from "../src/shared/deskPet.ts";
import type {
  ChatMessage,
  Lab,
  LogEntry,
  Staff,
  Team,
} from "../src/shared/types.ts";

const person = (id: string, over: Partial<Staff> = {}) =>
  ({
    id,
    kind: "hired",
    name: id,
    role: "역할",
    teamId: null,
    status: "idle",
    approvals: [],
    unreadReports: 0,
    ...over,
  }) as unknown as Staff;
const team = (id: string, over: Partial<Team> = {}) =>
  ({
    id,
    name: `팀${id}`,
    leadId: null,
    kind: "hired",
    color: "",
    ...over,
  }) as Team;
const lab = (id: string, memberIds: string[]) =>
  ({ id, name: `랩${id}`, leadId: null, memberIds }) as unknown as Lab;
const approval = (id: string, staffId: string, createdAt: number) =>
  ({
    id,
    staffId,
    staffName: staffId,
    staffRole: "",
    toolName: "Bash",
    summary: id,
    createdAt,
  }) as PetApproval;

test("상대 목록: 비서 · 고용 직원 · 전체 방 → 팀 방 → 랩 방 (외부 직원·프로젝트 팀·연습 팀 제외)", () => {
  const staff = [
    person("a", { teamId: "t1" }),
    person("b"),
    person("x", { kind: "external" }),
  ];
  const list = petTargets({
    staff,
    teams: [
      team("t1"),
      team("p", { kind: "project" }),
      team("z", { isPractice: true }),
    ],
    labs: [lab("l1", ["b"])],
  });
  assert.deepEqual(list.secretary.target, PET_SECRETARY);
  assert.deepEqual(
    list.staff.map((o) => o.name),
    ["a", "b"],
  );
  assert.deepEqual(
    list.rooms.map((o) => petTargetKey(o.target)),
    ["room:", "room:t1", "room:lab:l1"],
  );
  assert.deepEqual(list.rooms[1].memberIds, ["a"]);
  assert.deepEqual(list.rooms[2].memberIds, ["b"]);
});

test("없어진 상대(내보낸 직원·지운 방)는 비서로 돌아간다", () => {
  const list = petTargets({ staff: [person("a")], teams: [], labs: [] });
  assert.equal(findPetTarget({ kind: "staff", staffId: "a" }, list).name, "a");
  assert.deepEqual(
    findPetTarget({ kind: "staff", staffId: "gone" }, list).target,
    PET_SECRETARY,
  );
  assert.deepEqual(
    findPetTarget({ kind: "room", room: "gone" }, list).target,
    PET_SECRETARY,
  );
});

test("상대별 결재: 비서는 전부, 직원은 자기 것, 대화방은 참여 직원 것", () => {
  const list = petTargets({
    staff: [person("a", { teamId: "t1" }), person("b")],
    teams: [team("t1")],
    labs: [],
  });
  const all = [approval("1", "a", 1), approval("2", "b", 2)];
  assert.equal(targetApprovals(list.secretary, all).length, 2);
  assert.deepEqual(
    targetApprovals(list.staff[1], all).map((a) => a.id),
    ["2"],
  );
  assert.deepEqual(
    targetApprovals(list.rooms[1], all).map((a) => a.id),
    ["1"],
  );
});

test("시간순으로 섞고 같은 시각은 넣은 순서", () => {
  const m = (key: string, at: number): PetFeedItem => ({
    kind: "message",
    key,
    at,
    isMine: false,
    text: key,
    isMarkdown: false,
  });
  assert.deepEqual(
    mergeFeed([m("a", 1), m("c", 3)], [m("b", 2), m("c2", 3)]).map(
      (i) => i.key,
    ),
    ["a", "b", "c", "c2"],
  );
});

test("요약 한 줄: 마크다운 기호·빈 줄·구분선을 걷어 내고 길면 자른다", () => {
  assert.equal(summaryLine("\n## **결과** 정리\n- 둘째"), "결과 정리");
  assert.equal(summaryLine("---\n> [링크](http://x) 확인"), "링크 확인");
  assert.equal(summaryLine(""), "");
  const long = summaryLine("가".repeat(100));
  assert.equal([...long].length, 81);
  assert.ok(long.endsWith("…"));
});

test("직원 대화: 지시는 내 말풍선, 답은 직원 말풍선, 끝난 기록은 앞 답을 요약한 완료 카드", () => {
  const log = (id: number, type: LogEntry["type"], text: string) =>
    ({ id, staffId: "a", ts: id, type, text }) as LogEntry;
  const feed = staffFeed(
    [
      log(1, "instruction", "해 줘"),
      log(2, "tool", "Bash"),
      log(3, "reply", "# 끝냈어요\n자세히"),
      log(4, "result", "작업 완료"),
    ],
    "에이",
    10,
  );
  assert.deepEqual(
    feed.map((i) => i.kind),
    ["message", "message", "done"],
  );
  assert.equal(feed[0].kind === "message" && feed[0].isMine, true);
  assert.deepEqual(
    feed[2].kind === "done" && [feed[2].staffName, feed[2].summary],
    ["에이", "끝냈어요"],
  );
  // 답 없이 끝나면 요약이 비어 있다 (화면이 '앱에서 확인' 문구를 보인다)
  const bare = staffFeed([log(5, "result", "작업 완료")], "에이", 10);
  assert.equal(bare[0].kind === "done" && bare[0].summary, "");
});

const msg = (
  id: number,
  from: string,
  over: Partial<ChatMessage> = {},
): ChatMessage => ({ id, ts: id, from, text: `글${id}`, ...over });

test("대화방 글: 그 방 글만, 결재 메시지 제외, 직원 글엔 이름", () => {
  const chat = [
    msg(1, "me"),
    msg(2, "a", { room: "t1" }),
    msg(3, "a"),
    msg(4, "a", { approval: { id: "q" } }),
  ];
  const all = roomFeed(chat, "", (id) => `이름${id}`, 10);
  assert.deepEqual(
    all.map((i) => i.key),
    ["chat:1", "chat:3"],
  );
  assert.equal(all[1].kind === "message" && all[1].author, "이름a");
  assert.equal(all[0].kind === "message" && all[0].author, undefined);
  assert.deepEqual(
    roomFeed(chat, "t1", String, 10).map((i) => i.key),
    ["chat:2"],
  );
});

test("비서 대화의 완료 카드: 고용 직원이 최근에 올린 보고만", () => {
  const now = DONE_RECENT_MS * 2;
  const staff = [
    person("a", { name: "에이" }),
    person("x", { kind: "external" }),
  ];
  const chat = [
    msg(1, "a", { ts: 1 }),
    msg(2, "a", { ts: now - 10, text: "**완료** 보고" }),
    msg(3, "me", { ts: now }),
    msg(4, "x", { ts: now }),
    msg(5, "a", { ts: now, approval: { id: "q" } }),
  ];
  const done = doneFromChat(chat, staff, now);
  assert.equal(done.length, 1);
  assert.deepEqual(
    done[0].kind === "done" && [done[0].staffName, done[0].summary],
    ["에이", "완료 보고"],
  );
});

test("작업 중 인원: 고용 직원 가운데 working만", () => {
  assert.equal(
    petWorkingCount([
      person("a", { status: "working" }),
      person("b", { status: "waiting" }),
      person("x", { kind: "external", status: "working" }),
    ]),
    1,
  );
});

test("완료 감지: 안 읽은 보고 수가 늘어난 직원만, 첫 스냅샷은 기준만", () => {
  const first = newReports(null, [person("a", { unreadReports: 2 })]);
  assert.deepEqual(first.done, []);
  const next = newReports(first.counts, [
    person("a", { unreadReports: 3 }),
    person("b", { unreadReports: 1 }),
  ]);
  assert.deepEqual(
    next.done.map((d) => d.staffId),
    ["a", "b"],
  );
  // 읽음 처리로 줄어드는 것은 완료가 아니다
  assert.deepEqual(
    newReports(next.counts, [
      person("a", { unreadReports: 0 }),
      person("b", { unreadReports: 1 }),
    ]).done,
    [],
  );
});

test("말풍선: 완료는 새 결재 다음, 직원 업무보다 앞", () => {
  const base = {
    isBusy: false,
    reply: null,
    newApproval: null,
    workingCount: 2,
    isWorkShown: true,
  };
  const done = { staffName: "에이", count: 1 };
  assert.deepEqual(pickBubble({ ...base, done }), {
    kind: "done",
    staffName: "에이",
    count: 1,
  });
  assert.equal(
    pickBubble({ ...base, done, newApproval: { count: 1, title: "t" } })?.kind,
    "approval",
  );
  assert.equal(pickBubble({ ...base, done: null })?.kind, "working");
});
