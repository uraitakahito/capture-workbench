import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORIGIN_ALL,
  ORIGIN_SCHEDULE,
  ORIGIN_UNKNOWN,
  originChips,
  originOf,
  startedByLine,
  whoMarks,
  whoOf,
  withOrigin,
} from "../public/requester.js";

/**
 * クロールを誰が・どこから始めたかの字（CAPTURE-450）。capture-ledger が行に残す写し（名前・app client・申告の席の名前・
 * 「いま撮る」を押した者）を、一覧の「始めた人」・開いた行の 1 行・出どころで絞る chip にする。
 * 写しを持たない行（古い capture-ledger・それより前の行）は、今までどおり主体の ID で出す。
 */
const human = { requestedBy: "3f1c-sub", orgId: "acme", requestedByName: "alice", requestedClient: "workbench", requestedActor: null, schedule: null };
const agent = { requestedBy: "ai-client-id", orgId: "acme", requestedByName: "ai", requestedClient: "ai", requestedActor: "swe-seat-1", schedule: null };
// 古い capture-ledger は欄そのものを返さない。新しい capture-ledger の古い行は null を返す。どちらも同じに扱う
const oldLedger = { requestedBy: "old-sub", orgId: "acme", schedule: null };
const oldRow = { ...oldLedger, requestedByName: null, requestedClient: null, requestedActor: null, runRequestedBy: null, runRequestedByName: null };
const scheduled = { requestedBy: "3f1c-sub", orgId: "acme", requestedByName: "alice", requestedClient: null, requestedActor: null, schedule: { id: "s1", name: "毎朝" }, scheduledFor: null, runRequestedBy: "bob-sub", runRequestedByName: "bob" };

test("始めた人: 名前が在れば名前を出し、主体の ID は title に", () => {
  const who = whoOf(human);
  assert.equal(who.text, "alice / acme");
  assert.match(who.title, /3f1c-sub/);
});

test("始めた人: 名前を持たない行は、今までどおり主体の ID（title は無い）", () => {
  for (const crawl of [oldLedger, oldRow]) {
    assert.deepEqual(whoOf(crawl), { text: "old-sub / acme" });
  }
});

test("印: app client の名前と、申告の席の名前（申告と書く）", () => {
  const marks = whoMarks(agent);
  assert.deepEqual(
    marks.map((mark) => [mark.kind, mark.text]),
    [
      ["client", "ai"],
      ["actor", "席 swe-seat-1（申告）"],
    ],
  );
  // 申告は確かめていない物。title がそう言う
  assert.match(marks[1].title, /確かめていない/);
});

test("印: 人が画面から始めた行は、app client だけ", () => {
  assert.deepEqual(
    whoMarks(human).map((mark) => mark.text),
    ["workbench"],
  );
});

test("印: 写しを持たない行には何も付けない", () => {
  assert.deepEqual(whoMarks(oldLedger), []);
  assert.deepEqual(whoMarks(oldRow), []);
});

test("印: 「いま撮る」を押した人。名前が無ければ主体の ID で出す", () => {
  assert.deepEqual(
    whoMarks(scheduled).map((mark) => [mark.kind, mark.text]),
    [["pressed", "押した人 bob"]],
  );
  assert.equal(whoMarks({ ...scheduled, runRequestedByName: null })[0].text, "押した人 bob-sub");
  // 期限の回は押した人が居ない
  assert.deepEqual(whoMarks({ ...scheduled, runRequestedBy: null, runRequestedByName: null }), []);
});

test("出どころ: 定期が先、次に app client の名前、どちらも無ければ不明", () => {
  assert.equal(originOf(scheduled), ORIGIN_SCHEDULE);
  assert.equal(originOf(human), "client:workbench");
  assert.equal(originOf(oldLedger), ORIGIN_UNKNOWN);
  // `schedule` という名前の app client が在っても、定期と取り違えない
  assert.equal(originOf({ ...human, requestedClient: "schedule" }), "client:schedule");
});

test("chip: 一覧に在る出どころだけを、数つきで並べる", () => {
  const chips = originChips([human, agent, { ...agent, requestedActor: "x" }, scheduled, oldRow]);
  assert.deepEqual(
    chips.map((chip) => [chip.id, chip.text]),
    [
      [ORIGIN_ALL, "すべて 5"],
      ["client:ai", "ai 2"],
      ["client:workbench", "workbench 1"],
      [ORIGIN_SCHEDULE, "定期 1"],
      [ORIGIN_UNKNOWN, "不明 1"],
    ],
  );
});

test("chip: 出どころが 1 種類だけなら、何も出さない", () => {
  assert.deepEqual(originChips([oldLedger, oldRow]), []);
  assert.deepEqual(originChips([]), []);
});

test("絞る: 選んだ出どころの行だけ。「すべて」と、一覧にもう無い出どころは全部", () => {
  const all = [human, agent, scheduled, oldRow];
  assert.deepEqual(withOrigin(all, "client:ai"), [agent]);
  assert.deepEqual(withOrigin(all, ORIGIN_SCHEDULE), [scheduled]);
  assert.equal(withOrigin(all, ORIGIN_ALL), all);
  // 引き直しで行が消えた出どころ。空の表にしない
  assert.equal(withOrigin(all, "client:gone"), all);
});

test("開いた行: 名前・主体の ID・組織・app client・申告の席を 1 行で言う", () => {
  assert.equal(
    startedByLine(agent),
    "始めた人: ai（主体の ID ai-client-id）・組織 acme・app client ai・席 swe-seat-1（申告。確かめていない）",
  );
});

test("開いた行: 定期の回は、押した人も言う", () => {
  assert.match(startedByLine(scheduled), /「いま撮る」を押した人 bob$/);
});

test("開いた行: 名前が無ければ主体の ID だけ。1 本の答えが主体を持たなければ（古い capture-ledger）出さない", () => {
  assert.equal(startedByLine(oldRow), "始めた人: 主体の ID old-sub・組織 acme");
  assert.equal(startedByLine({ crawlId: "x", state: "succeeded" }), undefined);
});
