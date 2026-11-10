/**
 * workbench が state をどう言葉にするか。
 *
 * **ここが嘘をつくと、workbench 全体が嘘になる。** 実機の 68 本のうち 41 本は「成功」だが
 * 打ち切りだった —— `state` だけを描く実装は、その 41 本を取り違える。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { checkVerdict, forgetMissing, linksOf, stateOf, took } from "../public/format.js";

const crawl = (state, stopReason, pagesFailed = 0) => ({ state, stopReason, pagesFailed });

test("完走と打ち切りを、同じ「成功」にしない", () => {
  assert.equal(stateOf(crawl("succeeded", "completed")).text, "完走");
  assert.equal(stateOf(crawl("succeeded", "max_depth")).text, "打ち切り (深さ)");
  assert.equal(stateOf(crawl("succeeded", "max_pages")).text, "打ち切り (枚数)");
  // 色も分ける —— 完走だけが緑。
  assert.equal(stateOf(crawl("succeeded", "completed")).kind, "ok");
  assert.equal(stateOf(crawl("succeeded", "max_depth")).kind, "warn");
});

test("知らない stopReason は、そのまま見せる（緑にしない）", () => {
  const odd = stateOf(crawl("succeeded", "なにか新しい理由"));
  assert.equal(odd.text, "成功 (なにか新しい理由)");
  assert.notEqual(odd.kind, "ok");
});

test("取れなかったページがあれば数を添え、全部を辿っても緑にしない", () => {
  assert.deepEqual(stateOf(crawl("succeeded", "completed", 2)), {
    text: "完走・2 枚取れず",
    kind: "warn",
  });
  assert.equal(stateOf(crawl("succeeded", "max_depth", 1)).text, "打ち切り (深さ)・1 枚取れず");
  assert.equal(stateOf(crawl("succeeded", "max_pages", 3)).text, "打ち切り (枚数)・3 枚取れず");
  assert.equal(stateOf(crawl("succeeded", "なにか新しい理由", 1)).text, "成功 (なにか新しい理由)・1 枚取れず");
});

test("取れなかったページが無ければ、緑の完走のまま", () => {
  assert.deepEqual(stateOf(crawl("succeeded", "completed", 0)), { text: "完走", kind: "ok" });
});

test("リンクの数は、1 枚でも撮れていれば数のまま（0 も 0 と言う）", () => {
  assert.equal(linksOf({ pagesCaptured: 1, pagesDiscovered: 47 }), "47");
  assert.equal(linksOf({ pagesCaptured: 1, pagesDiscovered: 0 }), "0");
});

test("1 枚も撮れていなければ、リンクの数は − で、0 本だったとは言わない", () => {
  assert.equal(linksOf({ pagesCaptured: 0, pagesDiscovered: 0 }), "−");
});

test("深さ 0 のクロールは、理由によらず「このページだけ」と言い、打ち切りと言わない", () => {
  // 辿らないと頼んだのだから、リンクが残っていても（max_depth）打ち切りではない
  const page = (stopReason, pagesFailed = 0) => ({ ...crawl("succeeded", stopReason, pagesFailed), maxDepth: 0 });
  assert.deepEqual(stateOf(page("max_depth")), { text: "このページだけ", kind: "ok" });
  assert.deepEqual(stateOf(page("completed")), { text: "このページだけ", kind: "ok" });
  // 取れなかった数は添え、緑にしない
  assert.deepEqual(stateOf(page("completed", 1)), { text: "このページだけ・1 枚取れず", kind: "warn" });
});

test("深さが 1 以上なら、打ち切りと完走を言い分けたまま", () => {
  const followed = (stopReason) => ({ ...crawl("succeeded", stopReason), maxDepth: 1 });
  assert.equal(stateOf(followed("max_depth")).text, "打ち切り (深さ)");
  assert.equal(stateOf(followed("completed")).text, "完走");
});

test("深さ 0 でも、走行中と失敗はそのまま", () => {
  assert.equal(stateOf({ ...crawl("running", null), maxDepth: 0 }).text, "走行中");
  assert.equal(stateOf({ ...crawl("failed", "failed"), maxDepth: 0 }).text, "失敗");
});

test("走行中と失敗は stopReason を見ず、取れなかった数も添えない", () => {
  assert.equal(stateOf(crawl("running", null, 2)).text, "走行中");
  assert.equal(stateOf(crawl("failed", "failed", 2)).text, "失敗");
});

test("走行中は「いままで」を出す —— finishedAt の null は時間が無いことではない", () => {
  const started = "2026-09-21T00:00:00.000Z";
  const now = new Date("2026-09-21T00:00:42.000Z").getTime();
  assert.equal(took({ startedAt: started, finishedAt: null }, now), "42s");
});

test("90 秒を超えたら分で言う", () => {
  assert.equal(
    took({ startedAt: "2026-09-21T00:00:00.000Z", finishedAt: "2026-09-21T00:02:05.000Z" }),
    "2m 5s",
  );
});

/**
 * 検証の結果の描き方。
 *
 * **失敗 0 を「問題なし」と言い切らない。** 実機の WACZ は 21 passed / 1 warning で、
 * 失敗は 0 —— そこを緑 1 色にすると、警告が画面から消える。
 */
test("失敗が無くても、警告があれば緑にしない", async () => {
  const { verdict } = await import("../public/format.js");
  assert.deepEqual(verdict({ failed: 0, warnings: 1 }), { text: "警告 1", kind: "warn" });
  assert.deepEqual(verdict({ failed: 0, warnings: 0 }), { text: "問題なし", kind: "ok" });
  assert.equal(verdict({ failed: 2, warnings: 9 }).kind, "bad");
});

test("知らない severity を「問題なし」に倒さない", async () => {
  const { severityKind } = await import("../public/format.js");
  assert.equal(severityKind("error"), "bad");
  assert.equal(severityKind("warning"), "warn");
  assert.equal(severityKind("info"), "muted");
  // 検証器が新しく言い始めたことを、黙って緑にしない。
  assert.notEqual(severityKind("なにか新しい severity"), "ok");
});

/**
 * 報告がどの条件で作られたか。**版は報告のまま出す** —— 2026-09-26 まで、workbench は
 * 検証器の版を出していなかった。v0.28.1 の daemon が 2 日動いていても、どの報告からも
 * 分からなかった。
 */
test("報告を作った検証器の版と profile を、報告のまま出す", async () => {
  const { judgedUnder } = await import("../public/format.js");
  assert.deepEqual(
    judgedUnder({ validatorVersion: "0.31.0+3.gabcdef1", profile: { name: "browserhive" } }),
    ["wacz-validator 0.31.0+3.gabcdef1", "profile browserhive"],
  );
});

/**
 * **`stats` は best-effort で、無いことがある** —— WARC が統計を取れないほど壊れていても、
 * そう言う報告は出す (wacz-validator の約束)。workbench は在るものとして読み、無い報告では
 * 検証の行ごと「検証できず」に落ちていた。
 */
test("stats の無い報告でも、行を落とさない", async () => {
  const { statsOf } = await import("../public/format.js");
  assert.deepEqual(statsOf({}), []);
  assert.deepEqual(
    statsOf({ stats: { warcRecordCount: 3, hosts: ["a.test", "b.test"] } }),
    ["WARC 3 レコード", "a.test, b.test"],
  );
  assert.deepEqual(statsOf({ stats: { warcRecordCount: 0 } }), ["WARC 0 レコード"]);
});

test("検証の結論は、未検証は空・失敗は「検証できず」・報告は合格と区別して言う", () => {
  assert.equal(checkVerdict(undefined), undefined);
  assert.deepEqual(checkVerdict(new Error("x")), { text: "検証できず", kind: "bad" });
  assert.deepEqual(checkVerdict({ summary: { failed: 1, warnings: 0 } }), { text: "失敗 1", kind: "bad" });
  assert.deepEqual(checkVerdict({ summary: { failed: 0, warnings: 0 } }), { text: "問題なし", kind: "ok" });
});

test("一覧から消えた id だけを、覚えた答えから忘れる", () => {
  const map = new Map([["a", 1], ["b", 2], ["c", 3]]);
  forgetMissing(map, ["a", "c", "z"]);
  assert.deepEqual([...map.keys()], ["a", "c"]);
});
