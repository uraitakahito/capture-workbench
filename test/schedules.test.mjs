/**
 * 定期実行の画面（`public/schedules.js`）の、画面に依らない部分。capture-ledger の `GET /api/schedules` の語を、帯の文・状態の字・
 * 回の行にする形（CAPTURE-174）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  actionAnswer,
  bandOf,
  closableCrawl,
  createAnswer,
  createBody,
  cronWords,
  healthOf,
  markOf,
  pollMs,
  runDelay,
  runMissed,
  runResult,
  runWhen,
  scriptsText,
  shortTime,
  spanText,
  troubleCount,
} from "../public/schedules.js";

const NOW = Date.parse("2026-11-07T05:10:00.000Z"); // 14:10 JST
const hoursAgo = (hours) => new Date(NOW - hours * 3_600_000).toISOString();

const RUN = {
  crawlId: "c1",
  state: "succeeded",
  scheduledFor: "2026-11-06T19:00:00.000Z",
  startedAt: "2026-11-06T19:00:20.000Z",
  finishedAt: "2026-11-06T19:01:00.000Z",
  scheduleMissed: 0,
  pagesCaptured: 5,
  pagesFailed: 0,
  error: null,
};

const schedule = (over = {}) => ({
  id: "s1",
  name: "毎朝",
  cron: "0 4 * * *",
  timezone: "Asia/Tokyo",
  enabled: true,
  health: "ok",
  blockedBy: null,
  nextRunAt: "2026-11-07T19:00:00.000Z",
  runRequestedAt: null,
  scripts: [{ id: "autoscroll", version: 2, latest: 2 }],
  outdated: false,
  recentRuns: [RUN],
  ...over,
});

test("cron はよく使う形だけ言葉にし、ほかは式のまま", () => {
  assert.equal(cronWords("0 4 * * *"), "毎日 04:00");
  assert.equal(cronWords("30 16 * * *"), "毎日 16:30");
  assert.equal(cronWords("0 4 * * 1"), "毎週月曜 04:00");
  assert.equal(cronWords("0 4 1 * *"), "0 4 1 * *");
  assert.equal(cronWords("0 */6 * * *"), "0 */6 * * *");
});

test("時刻は予定の時差で短く言う", () => {
  assert.equal(shortTime("2026-11-07T19:00:00.000Z"), "11-08 04:00");
  assert.equal(shortTime("2026-11-07T19:00:00.000Z", "UTC"), "11-07 19:00");
});

test("長さは分・時間・日のどれか 1 つで言う", () => {
  assert.equal(spanText(59 * 60_000), "59 分");
  assert.equal(spanText(2 * 3_600_000), "2 時間");
  assert.equal(spanText(47 * 3_600_000), "47 時間");
  assert.equal(spanText(72 * 3_600_000), "3 日");
  assert.equal(spanText(-1000), "0 分");
});

test("状態の語を字と色にする", () => {
  assert.deepEqual(healthOf(schedule(), NOW), { kind: "ok", text: "予定どおり" });
  assert.deepEqual(healthOf(schedule({ health: "paused" }), NOW), { kind: "", text: "止めています" });
  assert.equal(healthOf(schedule({ health: "failing" }), NOW).kind, "bad");
  assert.deepEqual(healthOf(schedule({ health: "overdue", nextRunAt: hoursAgo(2) }), NOW), {
    kind: "bad",
    text: "次の回が 2 時間遅れています",
  });
  assert.deepEqual(
    healthOf(schedule({ health: "stuck", recentRuns: [{ ...RUN, state: "running", startedAt: hoursAgo(3) }] }), NOW),
    { kind: "bad", text: "回が 3 時間走ったままです" },
  );
});

test("遅れは、期限といま撮るの頼みの早い方から数える", () => {
  assert.equal(
    healthOf(schedule({ health: "overdue", nextRunAt: hoursAgo(1), runRequestedAt: hoursAgo(5) }), NOW).text,
    "次の回が 5 時間遅れています",
  );
});

test("順番待ちは、塞いでいる行の有無で理由を言い分ける", () => {
  assert.match(healthOf(schedule({ health: "blocked", blockedBy: { crawlId: "x" } }), NOW).text, /走っているクロール/);
  assert.match(healthOf(schedule({ health: "blocked" }), NOW).text, /静かな時間/);
});

test("帯は失敗・遅れ・走ったままだけを言い、順番待ちと止めた予定は言わない", () => {
  const list = [
    schedule({ name: "A", health: "ok" }),
    schedule({ name: "B", health: "blocked" }),
    schedule({ name: "C", health: "paused" }),
  ];
  assert.equal(bandOf(list, undefined, NOW), undefined);
  assert.equal(troubleCount(list), 0);
});

test("帯は走ったままの回を言う", () => {
  const stuck = schedule({ health: "stuck", recentRuns: [{ ...RUN, state: "running", startedAt: hoursAgo(2) }] });
  assert.equal(bandOf([stuck], undefined, NOW), "定期実行「毎朝」: 回が 2 時間走ったままです");
  assert.equal(troubleCount([stuck]), 1);
});

test("帯は遅れを言う", () => {
  const late = schedule({ health: "overdue", nextRunAt: hoursAgo(2) });
  assert.equal(bandOf([late], undefined, NOW), "定期実行「毎朝」: 次の回が 2 時間遅れています");
});

test("帯は失敗の理由の 1 行目を添え、長ければ切る", () => {
  const failing = schedule({
    health: "failing",
    recentRuns: [{ ...RUN, state: "failed", error: `${"x".repeat(200)}\n続き` }],
  });
  const said = bandOf([failing], undefined, NOW);
  assert.ok(said.startsWith("定期実行「毎朝」: 直近の回が失敗しました（xxx"));
  assert.ok(said.endsWith("…）"));
  assert.ok(!said.includes("続き"));
});

test("帯は複数の予定を並べる", () => {
  const list = [
    schedule({ name: "A", health: "failing", recentRuns: [{ ...RUN, state: "failed", error: "" }] }),
    schedule({ name: "B", health: "overdue", nextRunAt: hoursAgo(2) }),
  ];
  assert.equal(
    bandOf(list, undefined, NOW),
    "定期実行「A」: 直近の回が失敗しました ／ 定期実行「B」: 次の回が 2 時間遅れています",
  );
  assert.equal(troubleCount(list), 2);
});

test("読めないときは、何も起きていないと取り違えないように帯で言う", () => {
  assert.equal(bandOf([], "capture-ledger に届きません", NOW), "定期実行の状態を読めません（capture-ledger に届きません）");
  // 前に読めた予定があっても、読めないことを先に言う
  assert.match(bandOf([schedule({ health: "failing" })], "x", NOW), /読めません/);
});

test("待っている物があれば速く引く", () => {
  assert.equal(pollMs([schedule()]), 30_000);
  assert.equal(pollMs([]), 30_000);
  assert.equal(pollMs([schedule({ runRequestedAt: hoursAgo(0) })]), 5_000);
  assert.equal(pollMs([schedule({ health: "blocked" })]), 5_000);
  assert.equal(pollMs([schedule({ recentRuns: [{ ...RUN, state: "running" }] })]), 5_000);
});

test("回の結果を字にする。頁の一部だけの失敗は言い分ける", () => {
  assert.deepEqual(runResult(RUN), { kind: "ok", text: "撮れた 5" });
  assert.deepEqual(runResult({ ...RUN, state: "failed" }), { kind: "bad", text: "失敗" });
  assert.deepEqual(runResult({ ...RUN, state: "running" }), { kind: "run", text: "走行中" });
  assert.deepEqual(runResult({ ...RUN, pagesCaptured: 4, pagesFailed: 1 }), {
    kind: "warn",
    text: "一部失敗（撮れた 4・失敗 1）",
  });
});

test("回の時刻・遅れ・欠け", () => {
  assert.equal(runWhen(RUN, "Asia/Tokyo"), "11-07 04:00");
  assert.equal(runWhen({ ...RUN, scheduledFor: null }, "Asia/Tokyo"), "いま撮る");
  assert.equal(runDelay(RUN), "");
  assert.equal(runDelay({ ...RUN, startedAt: "2026-11-06T19:12:00.000Z" }), "12 分遅れ");
  assert.equal(runDelay({ ...RUN, scheduledFor: null }), "");
  assert.equal(runMissed(RUN), "");
  assert.equal(runMissed({ ...RUN, scheduleMissed: 3 }), "欠け 3");
});

test("撮り方の字は、新しい版が出ていれば添える", () => {
  assert.equal(scriptsText(schedule()), "autoscroll@2");
  assert.equal(
    scriptsText(schedule({ scripts: [{ id: "a", version: 1, latest: 3 }, { id: "inline-b", version: 1, latest: null }] })),
    "a@1（新しい版 3）・inline-b@1",
  );
  assert.equal(scriptsText(schedule({ scripts: [] })), "走らせない");
});

test("締められるのは、止まった回か遅れの元の行だけ", () => {
  const blockedBy = { crawlId: "x", startedAt: hoursAgo(2) };
  assert.equal(closableCrawl(schedule({ health: "stuck", blockedBy })), "x");
  assert.equal(closableCrawl(schedule({ health: "overdue", blockedBy })), "x");
  // 順番待ちの間は本当に走っているかもしれない
  assert.equal(closableCrawl(schedule({ health: "blocked", blockedBy })), undefined);
  assert.equal(closableCrawl(schedule({ health: "overdue" })), undefined);
});

test("クロールの行の印", () => {
  assert.equal(markOf({ schedule: null }), undefined);
  assert.equal(markOf({}), undefined);
  const mark = markOf({
    schedule: { id: "s1", name: "毎朝" },
    scheduledFor: "2026-11-06T19:00:00.000Z",
    scheduleMissed: 3,
  });
  assert.equal(mark.text, "定期・欠け 3");
  assert.match(mark.title, /毎朝/);
  assert.match(mark.title, /11-07 04:00/);
  assert.match(mark.title, /3 回をまとめた/);
  assert.equal(markOf({ schedule: { id: "s1", name: "x" }, scheduledFor: null, scheduleMissed: 0 }).text, "定期");
  assert.match(markOf({ schedule: { id: "s1", name: "x" }, scheduledFor: null, scheduleMissed: 0 }).title, /いま撮る/);
});

test("作る本文は名前と式の前後の空白を落とす", () => {
  assert.deepEqual(createBody(" 毎朝 ", " 0 4 * * * ", { seeds: ["u"] }), {
    name: "毎朝",
    cron: "0 4 * * *",
    request: { seeds: ["u"] },
  });
});

test("作った答えの 1 行", () => {
  assert.deepEqual(createAnswer(201, { nextRunAt: "2026-11-07T19:00:00.000Z", timezone: "Asia/Tokyo" }), {
    kind: "ok",
    text: "予定を作りました。次の回は 11-08 04:00 です。",
  });
  assert.equal(createAnswer(409, {}).kind, "bad");
  assert.match(createAnswer(400, { error: "invalid cron", hint: "cron must have 5 fields" }).text, /5 fields/);
  assert.equal(
    createAnswer(400, { error: "cron runs too often", gapMinutes: 5, minIntervalMinutes: 60 }).text,
    "間隔が短すぎます（5 分。下限は 60 分です）",
  );
  // 頼みの中身の断りは始めるエンドポイントと同じ文
  assert.match(createAnswer(400, { error: "every seed must be an http(s) URL" }).text, /every seed/);
});

test("操作の答えの 1 行。断られたら capture-ledger の文をそのまま", () => {
  assert.equal(actionAnswer("pause", 200, {}).kind, "ok");
  assert.equal(actionAnswer("run", 202, {}).kind, "ok");
  assert.equal(actionAnswer("delete", 200, {}).text, "消しました。");
  assert.equal(actionAnswer("close", 200, { closed: true }).text, "締めました。");
  const refused = actionAnswer("repin", 400, { error: "unknown script ids", ids: ["gone"] });
  assert.equal(refused.kind, "bad");
  assert.match(refused.text, /unknown script ids/);
});
