/**
 * クロールの行を開いたときの「ページ」の表と、1 ページのログ（`public/pages.js`）。台帳の
 * `GET /api/crawls/:id/pages` と `GET /api/crawls/:id/pages/:page/log` の答え（CAPTURE-18 で台帳が足す形）を
 * 描く形にするだけ。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dataOf,
  droppedOf,
  FILTERS,
  levelKind,
  linesAt,
  logPath,
  moreOf,
  msOf,
  outcomeOf,
  pagesPath,
  readPages,
  WACZ_LOG_PATH,
  waczLogTarget,
  reasonText,
  rowsOf,
  sourceOf,
  tallyOf,
  toggleLog,
  viewOf,
} from "../public/pages.js";

const CRAWL = "5b0c0009-6a1e-4000-8000-000000000009";

const page = (id, extra = {}) => ({
  id,
  url: `https://sandbox.test/p/${id}`,
  depth: 1,
  state: "captured",
  reason: null,
  taskId: `task-${id}`,
  archiveId: null,
  logCounts: { debug: 0, info: 1, warn: 0, error: 0, dropped: 0 },
  ...extra,
});

/** 台帳の代わり。id の昇順に並べたページを、after の後から size 件ずつ返し、引かれた口を覚える。 */
const ledger = (ids, size) => {
  const asked = [];
  const read = async (path) => {
    asked.push(path);
    const after = new URL(path, "http://dashboard.test").searchParams.get("after");
    const rest = after === null ? ids : ids.filter((id) => Number(id) > Number(after));
    const pages = rest.slice(0, size).map((id) => page(id));
    return { pages, next: rest.length > size ? pages.at(-1).id : null };
  };
  return { read, asked };
};

test("口: ページの一覧は after を前の答えの next で、ログはクロールとページの組で引く（どちらも % で包む）", () => {
  assert.equal(pagesPath(CRAWL), `/api/crawls/${CRAWL}/pages`);
  assert.equal(pagesPath(CRAWL, null), `/api/crawls/${CRAWL}/pages`);
  assert.equal(pagesPath(CRAWL, "1300"), `/api/crawls/${CRAWL}/pages?after=1300`);
  assert.equal(logPath(CRAWL, "1234"), `/api/crawls/${CRAWL}/pages/1234/log`);
  assert.equal(logPath("a/b", "1 2"), "/api/crawls/a%2Fb/pages/1%202/log");
});

test("続き: 0 件を覆うなら台帳の 1 回分だけを引き、自分では続きを取りに行かない", async () => {
  const { read, asked } = ledger(["1", "2", "3", "4", "5"], 2);
  const list = await readPages(read, CRAWL, 0);
  assert.deepEqual(asked, [pagesPath(CRAWL)]);
  assert.deepEqual(
    list.pages.map((p) => p.id),
    ["1", "2"],
  );
  assert.equal(list.next, "2");
});

test("続き: 「続きを読む」の件数を覆うまで、next で次を引いて後ろに足す（引き直しでも同じ所まで覆う）", async () => {
  const { read, asked } = ledger(["1", "2", "3", "4", "5"], 2);
  const first = await readPages(read, CRAWL, 0);
  const more = moreOf(first);
  assert.deepEqual(more, { label: "続きを読む（3 件目から）", want: 3 });
  asked.length = 0;
  const list = await readPages(read, CRAWL, more.want);
  assert.deepEqual(asked, [pagesPath(CRAWL), pagesPath(CRAWL, "2")]);
  assert.deepEqual(
    list.pages.map((p) => p.id),
    ["1", "2", "3", "4"],
  );
  // 最後まで読めば next は null で、続きの button は出ない
  const all = await readPages(read, CRAWL, moreOf(list).want);
  assert.deepEqual(
    all.pages.map((p) => p.id),
    ["1", "2", "3", "4", "5"],
  );
  assert.equal(all.next, null);
  assert.equal(moreOf(all), undefined);
});

test("続き: 空の答えが来たら、そこで終わりにする（進まない next で回り続けない）", async () => {
  let calls = 0;
  const read = async (path) => {
    calls += 1;
    return path.includes("after=") ? { pages: [], next: "2" } : { pages: [page("1"), page("2")], next: "2" };
  };
  const list = await readPages(read, CRAWL, 10);
  assert.equal(calls, 2);
  assert.equal(list.next, null);
  assert.equal(list.pages.length, 2);
});

test("結末は台帳の state をそのまま、理由があれば後ろに（state は言い分けない）", () => {
  assert.equal(outcomeOf(page("1")), "captured");
  assert.equal(outcomeOf(page("2", { state: "failed", reason: "timeout: Timeout: Task processing (45000ms)" })), "failed: timeout: Timeout: Task processing (45000ms)");
  assert.equal(outcomeOf(page("3", { state: "someday", reason: undefined })), "someday");
});

test("結末: 終わったクロールの pending は、報告が来ないまま終わったと添える（走行中の pending はそのまま）", () => {
  const pending = page("4", { state: "pending", taskId: null, logCounts: null });
  assert.equal(outcomeOf(pending, "failed"), "pending（報告なし —— クロールが先に終わった）");
  assert.equal(outcomeOf(pending, "succeeded"), "pending（報告なし —— クロールが先に終わった）");
  assert.equal(outcomeOf(pending, "running"), "pending");
  // クロールの状態が分からないときは、台帳の語だけ
  assert.equal(outcomeOf(pending), "pending");
  // ほかの状態には添えない
  assert.equal(outcomeOf(page("5"), "failed"), "captured");
});

test("数: logCounts が null なら「—」（読んでいない）、0 は色なし、0 より大きい warn と error に色", () => {
  assert.deepEqual(tallyOf(null, "warn"), { text: "—", kind: "muted" });
  assert.deepEqual(tallyOf(undefined, "error"), { text: "—", kind: "muted" });
  // 欠けた level も 0 とは言わない
  assert.deepEqual(tallyOf({ info: 3 }, "warn"), { text: "—", kind: "muted" });
  const counts = { debug: 0, info: 1208, warn: 0, error: 2, dropped: 1204 };
  assert.deepEqual(tallyOf(counts, "warn"), { text: "0", kind: undefined });
  assert.deepEqual(tallyOf(counts, "error"), { text: "2", kind: "bad" });
  assert.deepEqual(tallyOf({ ...counts, warn: 1234 }, "warn"), { text: "1,234", kind: "warn" });
});

const LINES = [
  { ms: 10, source: "browserhive", level: "debug", msg: "a" },
  { ms: 20, source: "script", script: "inline-search", level: "info", msg: "b" },
  { ms: 30, source: "page", level: "warn", msg: "c" },
  { ms: 40, source: "page", level: "error", msg: "d" },
  { ms: 50, source: "browserhive", level: "fatal", msg: "e" },
];

test("絞り込み: 「すべて」が既定で、warn 以上・error だけ。並びは台帳のまま、知らない level は隠さない", () => {
  assert.equal(FILTERS[0][0], "all");
  const msgs = (filter) => linesAt(LINES, filter).map((line) => line.msg);
  assert.deepEqual(msgs("all"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(msgs("warn"), ["c", "d", "e"]);
  assert.deepEqual(msgs("error"), ["d", "e"]);
  assert.deepEqual(
    FILTERS.map(([id]) => id),
    ["all", "warn", "error"],
  );
});

test("level の印の色。知らない level（Object の鍵の名前も）は warn の色", () => {
  assert.deepEqual(
    ["error", "warn", "info", "debug", "fatal", "constructor"].map(levelKind),
    ["bad", "warn", "info", "muted", "warn", "warn"],
  );
});

test("行の欄: ms は 3 桁ずつ、出どころにスクリプトの id、data は JSON のまま（無ければ空）", () => {
  assert.equal(msOf({ ms: 14873 }), "14,873 ms");
  assert.equal(sourceOf(LINES[1]), "script inline-search");
  assert.equal(sourceOf(LINES[2]), "page");
  assert.equal(dataOf({ data: { query: "個人情報", n: [1, 2] } }), '{"query":"個人情報","n":[1,2]}');
  assert.equal(dataOf({}), "");
  assert.equal(dataOf({ data: null }), "null");
});

test("残さなかった行は 0 より大きいときだけ「N 行は残していない（上限か方針で）」", () => {
  assert.equal(droppedOf(0), undefined);
  assert.equal(droppedOf(undefined), undefined);
  assert.equal(droppedOf(1204), "1,204 行は残していない（上限か方針で）");
});

test("読めない理由は短い文に。知らない理由は「読めません」とだけ言う", () => {
  for (const reason of ["not-captured", "no-manifest", "manifest-missing", "manifest-invalid", "no-log"]) {
    assert.notEqual(reasonText(reason), "ログを読めません", reason);
  }
  assert.match(reasonText("not-captured"), /^取り込みの答えがありません/);
  assert.equal(reasonText("toString"), "ログを読めません");
  assert.equal(reasonText("someday"), "ログを読めません");
});

// ── 計画の 8 節の 12 番: 引き直しで開いたログが閉じない ─────────────────────────
// 表は引くたびに作り直す。開いたログは id で覚え、新しく届いたページの行（別の object）にも、同じ箱の状態が付く

test("開いたログは、引き直しで届いた新しい行にも同じ状態で付く —— 箱・絞り込み・流した位置を作り直さない", () => {
  const views = new Map();
  const first = { pages: [page("1201"), page("1202")], next: null };
  const state = toggleLog(views, CRAWL, "1202");
  assert.deepEqual(state, { answer: undefined, filter: "all", scrollTop: 0, box: undefined });
  // 描いた後に、人が絞り込みを替えて流した（box は app.js が作る DOM の箱）
  const box = { dom: "the box" };
  Object.assign(state, { box, filter: "warn", scrollTop: 120 });
  assert.equal(rowsOf(views, CRAWL, first)[1].log, state);

  // 引き直し: 同じ id の、新しい object の行（状態も数も変わった）
  const again = {
    pages: [page("1201"), page("1202", { state: "failed", reason: "timeout" }), page("1203")],
    next: null,
  };
  const rows = rowsOf(views, CRAWL, again);
  assert.deepEqual(
    rows.map((row) => row.log === undefined),
    [true, false, true],
  );
  assert.equal(rows[1].log, state, "同じ状態の object");
  assert.equal(rows[1].log.box, box, "箱は作り直さない");
  assert.deepEqual([rows[1].log.filter, rows[1].log.scrollTop], ["warn", 120]);
});

test("ログを閉じれば、その 1 つだけを忘れる。行を閉じたクロールの分は、まとめて忘れる", () => {
  const views = new Map();
  const list = { pages: [page("1"), page("2")], next: null };
  toggleLog(views, CRAWL, "1");
  const other = toggleLog(views, CRAWL, "2");
  const elsewhere = toggleLog(views, "5b0c0007-6a1e-4000-8000-000000000007", "1");
  assert.equal(toggleLog(views, CRAWL, "1"), undefined, "閉じた");
  assert.deepEqual(
    rowsOf(views, CRAWL, list).map((row) => row.log),
    [undefined, other],
  );
  // 「続きを読む」の件数も同じ所に覚える
  viewOf(views, CRAWL).want = 101;
  assert.equal(viewOf(views, CRAWL).want, 101);
  // 行を閉じた（app.js は opened と一緒に views から消す）
  views.delete(CRAWL);
  assert.deepEqual(
    rowsOf(views, CRAWL, list).map((row) => row.log),
    [undefined, undefined],
  );
  assert.equal(viewOf(views, CRAWL).want, 0, "開き直せば台帳の 1 回分から");
  assert.equal(rowsOf(views, "5b0c0007-6a1e-4000-8000-000000000007", list)[0].log, elsewhere, "ほかのクロールは残る");
});

test("WACZ の画面へは、ページに WACZ（archiveId）が在るときだけ。行き先は logs/capture.jsonl", () => {
  assert.equal(WACZ_LOG_PATH, "logs/capture.jsonl");
  assert.deepEqual(waczLogTarget({ archiveId: "a1b2" }), { archiveId: "a1b2", path: "logs/capture.jsonl" });
  assert.equal(waczLogTarget({ archiveId: null }), undefined);
  assert.equal(waczLogTarget({ archiveId: "" }), undefined);
  assert.equal(waczLogTarget({}), undefined);
  assert.equal(waczLogTarget(undefined), undefined);
});
