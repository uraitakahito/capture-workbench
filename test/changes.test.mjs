import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  changeBandLines,
  changeOf,
  changesError,
  changesHash,
  hunkLines,
  japaneseNote,
  neighborsOf,
  pageClaudeLine,
  parseChangesHash,
  pickPage,
  quoteLineOf,
  runTimeText,
  summaryLine,
  tocOf,
  versionNote,
} from "../public/changes.js";
import { setLang } from "../public/i18n.js";

/** 英語で 1 つ試し、終わりに日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

const ID = "11111111-1111-4111-8111-111111111111";
const PAGE = "22222222-2222-4222-8222-222222222222";
const change = (over) => ({ state: "summarized", pagesCompared: 5, pagesChanged: 3, significance: "minor", headline: "h", ...over });

describe("前回からの変化（CAPTURE-167）", () => {
  it("hash は #changes・#changes/<回>・#changes/<回>/<今回の WACZ の id> だけ", () => {
    assert.deepEqual(parseChangesHash("#changes"), { crawlId: undefined, pageId: undefined });
    assert.deepEqual(parseChangesHash(`#changes/${ID}`), { crawlId: ID, pageId: undefined });
    assert.deepEqual(parseChangesHash(`#changes/${ID}/${PAGE}`), { crawlId: ID, pageId: PAGE });
    assert.equal(parseChangesHash("#changes/nope"), undefined);
    assert.equal(parseChangesHash(`#changes/${ID}/nope`), undefined);
    assert.equal(parseChangesHash(`#changes/${ID}/${PAGE.slice(1)}`), undefined);
    assert.equal(parseChangesHash(`#changes/${ID}/${PAGE}/x`), undefined);
    assert.equal(parseChangesHash(`#changes/${"-".repeat(36)}`), undefined);
    assert.equal(parseChangesHash("#crawls"), undefined);
  });

  it("hash は往復する", () => {
    for (const [crawlId, pageId] of [[ID, PAGE], [ID, undefined]]) {
      assert.deepEqual(parseChangesHash(changesHash(crawlId, pageId)), { crawlId, pageId });
    }
    assert.equal(changesHash(ID, null), `#changes/${ID}`);
  });

  it("回の変化の字と色。無い・古い capture-ledger は「—」", () => {
    assert.deepEqual(changeOf(null), { kind: "", text: "—" });
    assert.deepEqual(changeOf(undefined), { kind: "", text: "—" });
    assert.deepEqual(changeOf(change({ state: "unchanged" })), { kind: "ok", text: "変化なし（5 ページ）" });
    assert.deepEqual(changeOf(change({ significance: "content" })), { kind: "content", text: "中身の変化（3 / 5 ページ）" });
    assert.equal(changeOf(change({ significance: "minor" })).kind, "warn");
    assert.deepEqual(changeOf(change({ significance: "none" })), { kind: "ok", text: "意味のある変化なし（3 / 5 ページ）" });
    assert.equal(changeOf(change({ state: "budget_wait" })).kind, "bad");
    assert.equal(changeOf(change({ state: "failed" })).kind, "bad");
    assert.equal(changeOf(change({ state: "no_previous" })).text, "初回（前の回が無い）");
  });

  it("帯は直近の回の要約が上限か失敗で止まったときだけ。中身の変化では出さない", () => {
    const schedule = (state) => ({ name: "毎朝", recentRuns: [{ change: change({ state }) }] });
    assert.deepEqual(changeBandLines([schedule("summarized"), schedule("unchanged")]), []);
    assert.equal(changeBandLines([schedule("budget_wait")]).length, 1);
    assert.match(changeBandLines([schedule("failed")])[0], /失敗/);
    assert.deepEqual(changeBandLines([{ name: "x", recentRuns: [] }]), []);
  });

  it("要約には必ず「証拠ではない」と model・版・費用を添える", () => {
    assert.equal(
      summaryLine({ evidence: false, model: "claude-opus-5-5", promptVersion: "change-v1", usd: 0.015 }),
      "Claude の要約（証拠ではない）・claude-opus-5-5・change-v1・$0.0150",
    );
    assert.equal(summaryLine(null), "要約はありません（差分だけ）");
  });

  it("差分の行は記号と字に分ける", () => {
    assert.deepEqual(hunkLines([" a", "-b", "+c"]), [
      { sign: " ", text: "a" },
      { sign: "-", text: "b" },
      { sign: "+", text: "c" },
    ]);
  });

  it("前と今で BrowserHive の版が違えば添える", () => {
    assert.equal(versionNote({ before: { browserhiveVersion: "28.0.1" }, after: { browserhiveVersion: "29.0.0" } }), "BrowserHive 28.0.1 → 29.0.0");
    assert.equal(versionNote({ before: { browserhiveVersion: "29.0.0" }, after: { browserhiveVersion: "29.0.0" } }), "");
  });

  it("404 のうち、変化のエンドポイントが無い古い capture-ledger は、そう言う", () => {
    assert.match(changesError(404, { message: "Route GET:/api/changes not found" }), /v0.93.0 より前/);
    assert.equal(changesError(404, { error: "not found" }), "404 —— not found");
  });

  it("ページの Claude の 1 行にも「証拠ではない」を添える", () => {
    assert.equal(pageClaudeLine("記事が加わった"), "Claude の 1 行（証拠ではない）: 記事が加わった");
  });
});

/** 目次の見本。毎朝の 5 サイトの 11-10 の回（提案で測った dev の回）と同じ顔ぶれ。 */
const ref = (id) => ({ archiveId: id, objectKey: `${id}.wacz`, sourceUrl: "u", capturedAt: "2026-11-10T13:42:00.000Z", browserhiveVersion: "29.0.2" });
const changed = (url, significance, added, removed, over = {}) => ({
  url,
  stage: "after-behaviors",
  state: "diffed",
  added,
  removed,
  hunks: [],
  significance,
  headline: null,
  quotes: [],
  before: ref(`${url}-before`),
  after: ref(`${url}-after`),
  ...over,
});
const same = (url) => ({ url, stage: "after-behaviors", before: ref(`${url}-before`), after: ref(`${url}-after`) });
const DETAIL = {
  pages: [
    changed("https://www.apple.com/", "minor", 17, 20),
    changed("https://www.cloudflare.com/", "none", 1, 1),
    changed("https://www.datadoghq.com/", "minor", 3, 3),
    changed("https://www.ana.co.jp/group/", "content", 9, 9),
  ],
  unchanged: [same("https://www.microsoft.com/")],
};
const urlsOf = (toc) => toc.map((row) => row.url.replace(/^https:\/\/(www\.)?/, ""));

describe("変化の詳細の目次と 1 ページ（CAPTURE-236）", () => {
  it("目次は重さの順（中身・小さい・なし）、同じ順の中は URL の順、最後に同じだったページ", () => {
    const toc = tocOf(DETAIL);
    assert.deepEqual(urlsOf(toc), ["ana.co.jp/group/", "apple.com/", "datadoghq.com/", "cloudflare.com/", "microsoft.com/"]);
    assert.deepEqual(
      toc.map((row) => [row.kind, row.text]),
      [
        ["content", "中身の変化"],
        ["warn", "小さい変化"],
        ["warn", "小さい変化"],
        ["ok", "意味のある変化なし"],
        ["", "同じ"],
      ],
    );
    assert.equal(toc[0].id, "https://www.ana.co.jp/group/-after");
    assert.equal(toc[4].same, true);
  });

  it("要約の無い差分は足した行と消した行の多い順、差分を作れなかったページはその後", () => {
    const toc = tocOf({
      pages: [
        changed("https://a.test/", null, 1, 0),
        changed("https://b.test/", null, 0, 0, { state: "prev_missing" }),
        changed("https://c.test/", null, 5, 4),
        changed("https://d.test/", null, 5, 4),
      ],
      unchanged: [same("https://0.test/")],
    });
    assert.deepEqual(urlsOf(toc), ["c.test/", "d.test/", "a.test/", "b.test/", "0.test/"]);
    assert.deepEqual(toc[3], { ...toc[3], kind: "bad", text: "差分を作れなかった" });
    assert.equal(toc[0].text, "差分あり（要約なし）");
  });

  it("古い capture-ledger（unchanged が無い）でも目次を作る", () => {
    assert.deepEqual(urlsOf(tocOf({ pages: DETAIL.pages })), ["ana.co.jp/group/", "apple.com/", "datadoghq.com/", "cloudflare.com/"]);
    assert.deepEqual(tocOf({ pages: [] }), []);
  });

  it("右のページは名指し、無ければ同じでない先頭、名指しが目次に無ければ先頭と断り", () => {
    const toc = tocOf(DETAIL);
    assert.deepEqual(pickPage(toc, "https://www.datadoghq.com/-after"), { row: toc[2], missing: false });
    assert.deepEqual(pickPage(toc, "https://www.microsoft.com/-after"), { row: toc[4], missing: false });
    assert.deepEqual(pickPage(toc, undefined), { row: toc[0], missing: false });
    assert.deepEqual(pickPage(toc, PAGE), { row: toc[0], missing: true });
    const allSame = tocOf({ pages: [], unchanged: [same("https://a.test/")] });
    assert.deepEqual(pickPage(allSame, undefined), { row: undefined, missing: false });
    assert.deepEqual(pickPage([], undefined), { row: undefined, missing: false });
  });

  it("前と次は同じだったページを飛ばし、端では無い", () => {
    const toc = tocOf(DETAIL);
    assert.deepEqual(neighborsOf(toc, toc[0]), { prev: undefined, next: toc[1], index: 1, total: 4 });
    assert.deepEqual(neighborsOf(toc, toc[2]), { prev: toc[1], next: toc[3], index: 3, total: 4 });
    assert.deepEqual(neighborsOf(toc, toc[3]), { prev: toc[2], next: undefined, index: 4, total: 4 });
    assert.deepEqual(neighborsOf(toc, toc[4]), { prev: undefined, next: undefined, index: undefined, total: 4 });
    assert.deepEqual(neighborsOf(toc, undefined), { prev: undefined, next: undefined, index: undefined, total: 4 });
  });

  it("回の時刻は始まった時刻で、1 分以上遅れた回にだけ本来の時刻と遅れを添える（CAPTURE-235）", () => {
    assert.equal(
      runTimeText({ startedAt: "2026-11-10T13:42:00.000Z", scheduledFor: "2026-11-07T19:00:00.000Z" }),
      "11-10 22:42（本来 11-08 04:00・2 日遅れ）",
    );
    assert.equal(runTimeText({ startedAt: "2026-11-10T19:00:40.000Z", scheduledFor: "2026-11-10T19:00:00.000Z" }), "11-11 04:00");
    assert.equal(runTimeText({ startedAt: "2026-11-07T08:41:00.000Z", scheduledFor: null }), "11-07 17:41");
  });

  it("引用は、それを含む最初の足した行か消した行を指す（文脈の行は指さない）", () => {
    const hunks = [[" 告知", "-古い記事"], [" 告知 ANA", "+ANA月次輸送実績 10 月"]];
    assert.deepEqual(quoteLineOf(hunks, "ANA月次輸送実績"), { hunk: 1, line: 1 });
    assert.deepEqual(quoteLineOf(hunks, "古い"), { hunk: 0, line: 1 });
    assert.equal(quoteLineOf(hunks, "告知"), undefined);
    assert.equal(quoteLineOf(hunks, "無い字"), undefined);
  });
});

describe("前回からの変化の英語の字（CAPTURE-294）", () => {
  it("回の変化: 比べたページの数で単数と複数を分ける", () => {
    const text = (over) => inEnglish(() => changeOf(change(over)).text);
    assert.equal(text({ state: "unchanged", pagesCompared: 1 }), "No change (1 page)");
    assert.equal(text({ state: "unchanged", pagesCompared: 2 }), "No change (2 pages)");
    assert.equal(text({ significance: "content" }), "Change of content (3 / 5 pages)");
    assert.equal(text({ significance: "none", pagesChanged: 1, pagesCompared: 1 }), "Nothing that matters (1 / 1 page)");
    assert.equal(text({ state: "diffed" }), "Diff in 3 / 5 pages, no summary");
    assert.equal(text({ state: "budget_wait" }), "Diff in 3 / 5 pages, summary stopped at the monthly limit");
    assert.equal(text({ state: "no_previous" }), "First run (no previous run)");
  });

  it("知らない重さと知らない状態は、届いた字のまま", () => {
    assert.equal(changeOf(change({ significance: "huge" })).text, "huge（3 / 5 ページ）");
    assert.equal(inEnglish(() => changeOf(change({ significance: "huge" })).text), "huge (3 / 5 pages)");
    assert.equal(changeOf(change({ state: "later" })).text, "later");
    assert.equal(inEnglish(() => changeOf(change({ state: "later" })).text), "later");
  });

  it("要約とページの 1 行は、英語でも「証拠ではない」と言う", () => {
    assert.equal(
      inEnglish(() => summaryLine({ model: "claude-opus-5-5", promptVersion: "change-v1", usd: 0.015 })),
      "Claude's summary (not evidence) · claude-opus-5-5 · change-v1 · $0.0150",
    );
    assert.equal(inEnglish(() => summaryLine(null)), "No summary (diff only)");
    assert.equal(inEnglish(() => pageClaudeLine("記事が加わった")), "Claude's line (not evidence): 記事が加わった");
  });

  it("要約が日本語だという断りは、日本語の画面には出さない", () => {
    assert.equal(japaneseNote(), undefined);
    assert.equal(inEnglish(() => japaneseNote()), "The summary is written in Japanese.");
  });

  it("目次・帯・読めないときの文", () => {
    assert.deepEqual(
      inEnglish(() => tocOf(DETAIL)).map((row) => row.text),
      ["Change of content", "Small change", "Small change", "Nothing that matters", "The same"],
    );
    const schedule = { name: "毎朝", recentRuns: [{ change: change({ state: "failed" }) }] };
    assert.deepEqual(inEnglish(() => changeBandLines([schedule])), [
      'Schedule "毎朝": the summary of the change since the previous run failed',
    ]);
    assert.match(inEnglish(() => changesError(404, {})), /before v0\.93\.0/);
    assert.equal(inEnglish(() => changesError(404, { error: "not found" })), "404 — not found");
    assert.equal(inEnglish(() => changesError(500, {})), "500 — Could not be read");
    assert.equal(changesError(500, {}), "500 —— 読めませんでした");
  });
});
