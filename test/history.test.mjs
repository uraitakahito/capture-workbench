/**
 * URL の履歴の画面（CAPTURE-462）の、画面に依らない部分（`public/history.js`）。行の印（「1 つ前から」「撮り方が替わった」）と
 * 選ぶ 2 本は、届いた行だけから workbench が決める —— ここで形を固める。代役の答えの欄は `test/sandbox.test.mjs`、
 * 書き込みの中継の形は `test/lib.test.mjs`。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  archiveChangesPath,
  changeMarkOf,
  comparable,
  differsNotes,
  historyError,
  historyHash,
  historyPath,
  marksOf,
  mayBeBefore,
  originText,
  parseHistoryHash,
  pickPair,
  reasonText,
  summaryBody,
  summaryLinesOf,
  summaryPath,
  summaryRefusal,
  withAfter,
  withBefore,
} from "../public/history.js";
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

/** かな・漢字と全角の記号。英語の文に 1 字でも在れば、訳せていない。 */
const JA = /[　-〿぀-ヿ㐀-鿿＀-￯]/u;

const id = (n) => `0000000${String(n)}-0000-4000-8000-00000000000${String(n)}`;
const [A, B, C, X] = [id(1), id(2), id(3), id(9)];
const sha = (letter) => letter.repeat(64);

/** 比べられる行。`text` は文字の digest の 1 字、`recipe` は撮り方の digest の 1 字（null なら分からない）。 */
const row = (rowId, text, recipe = "r") => ({
  id: rowId,
  capturedAt: "2026-11-10T00:00:00.000Z",
  objectKey: `k/${rowId}.wacz`,
  crawlId: null,
  origin: { kind: "manual", scheduleId: null, scheduleName: null },
  recipeSha256: recipe === null ? null : sha(recipe),
  browserhiveVersion: "32.0.0",
  text: { stage: "after-behaviors", sha256: sha(text), chars: 10 },
  notComparable: null,
});
/** 比べられない行（`text` が null）。 */
const bare = (rowId, reason = "no_text", recipe = null) => ({ ...row(rowId, "0", recipe), text: null, notComparable: reason });

describe("URL の履歴（CAPTURE-462）", () => {
  it("画面のアドレスは、URL と 2 本の id を書いて読み戻すと同じ。/・?・#・日本語を含む URL でも同じ", () => {
    const urls = [
      "https://site.test/",
      "https://site.test/a/b/c",
      "https://site.test/search?q=a/b&x=1#top",
      "https://site.test/製品/一覧?語=ランプ",
      "https://site.test/100%25",
    ];
    for (const url of urls) {
      for (const named of [
        { beforeId: undefined, afterId: undefined },
        { beforeId: undefined, afterId: A },
        { beforeId: B, afterId: A },
      ]) {
        const hash = historyHash(url, named);
        assert.deepEqual(parseHistoryHash(hash), { url, ...named }, hash);
        // URL は符号にする —— 頭の後ろの区切りは、id の前の / だけ
        assert.equal(hash.slice("#history/".length).split("/").length, 1 + Object.values(named).filter(Boolean).length, hash);
      }
    }
    assert.equal(historyHash("https://site.test/a", {}), "#history/https%3A%2F%2Fsite.test%2Fa");
    assert.equal(historyHash("https://site.test/a", { afterId: A }), `#history/https%3A%2F%2Fsite.test%2Fa/${A}`);
    assert.equal(historyHash("https://site.test/a", { beforeId: B, afterId: A }), `#history/https%3A%2F%2Fsite.test%2Fa/${B}/${A}`);
    // 「前」だけの形は無い。null も「無い」
    assert.equal(historyHash("https://site.test/a", { beforeId: B }), "#history/https%3A%2F%2Fsite.test%2Fa");
    assert.equal(historyHash("https://site.test/a", { beforeId: null, afterId: null }), "#history/https%3A%2F%2Fsite.test%2Fa");
  });

  it("壊れた符号・空の URL・id の形でない物・ほかの画面の hash は「読めない」", () => {
    const head = "#history/https%3A%2F%2Fsite.test%2F";
    assert.equal(parseHistoryHash("#history/%E0%A4%A"), undefined);
    assert.equal(parseHistoryHash("#history/%"), undefined);
    assert.equal(parseHistoryHash("#history/"), undefined);
    assert.equal(parseHistoryHash("#history"), undefined);
    assert.equal(parseHistoryHash(`${head}/nope`), undefined);
    assert.equal(parseHistoryHash(`${head}/${A.slice(1)}`), undefined);
    assert.equal(parseHistoryHash(`${head}/${A}/nope`), undefined);
    assert.equal(parseHistoryHash(`${head}/${B}/${A}/${C}`), undefined);
    assert.equal(parseHistoryHash(`${head}/${A}/`), undefined);
    // 符号にしていない URL は、/ で切れて id の形にならない
    assert.equal(parseHistoryHash("#history/https://site.test/a"), undefined);
    assert.equal(parseHistoryHash("#changes"), undefined);
    assert.equal(parseHistoryHash(`#changes/${A}`), undefined);
    assert.equal(parseHistoryHash(""), undefined);
  });

  it("エンドポイントの path: 一覧は url と before、差分は今の id と since、要約は今の id と本文の since", () => {
    assert.equal(historyPath("https://site.test/a?b=1"), "/api/history?url=https%3A%2F%2Fsite.test%2Fa%3Fb%3D1");
    assert.equal(historyPath("https://site.test/", null), "/api/history?url=https%3A%2F%2Fsite.test%2F");
    assert.equal(
      historyPath("https://site.test/", "2026-11-20T19:00:32.000Z"),
      "/api/history?url=https%3A%2F%2Fsite.test%2F&before=2026-11-20T19%3A00%3A32.000Z",
    );
    assert.equal(archiveChangesPath(A, B), `/api/archives/${A}/changes?since=${B}`);
    assert.equal(summaryPath(A), `/api/archives/${A}/changes/summary`);
    assert.deepEqual(summaryBody(B), { since: B });
  });

  it("「1 つ前から」: digest が同じなら同じ、違えば変わった。比べられない行は飛ばして、その前の比べられる行と比べる", () => {
    // 新しい A・比べられない X・古い B。A と B の digest が同じ —— 飛ばさずに隣と比べる形では、A は「同じ」にならない
    const skipped = marksOf([row(A, "a"), bare(X, "withheld"), row(B, "a")], false);
    assert.deepEqual(skipped.map((mark) => mark.change), ["same", "not_comparable", "first"]);
    assert.equal(skipped[1].reason, "withheld");
    assert.equal(skipped[0].reason, undefined);
    // 違う digest は「変わった」
    assert.deepEqual(marksOf([row(A, "b"), bare(X), row(B, "a")], false).map((mark) => mark.change), ["changed", "not_comparable", "first"]);
    assert.deepEqual(marksOf([row(A, "a"), row(B, "a"), row(C, "b")], false).map((mark) => mark.change), ["same", "changed", "first"]);
    // 訳を言わないが digest も無い行（来ないはず）は、文字の記録が無い行として飛ばす
    const noDigest = { ...row(X, "a"), text: null };
    assert.equal(comparable(noDigest), false);
    assert.deepEqual(marksOf([row(A, "a"), noDigest, row(B, "a")], false).map((mark) => [mark.change, mark.reason]), [
      ["same", undefined],
      ["not_comparable", "no_text"],
      ["first", undefined],
    ]);
    assert.deepEqual(marksOf([], false), []);
  });

  it("「1 つ前から」: 読んだ中でいちばん古い比べられる行は、続きが無ければ「最初」、続きが在れば「続きを読むと分かる」", () => {
    const rows = [row(A, "a"), row(B, "b"), bare(X)];
    assert.deepEqual(marksOf(rows, false).map((mark) => mark.change), ["changed", "first", "not_comparable"]);
    assert.deepEqual(marksOf(rows, true).map((mark) => mark.change), ["changed", "unknown", "not_comparable"]);
    // 続きが在っても、読んだ中に前の行が在る行の印は変わらない
    assert.equal(marksOf(rows, true)[0].change, marksOf(rows, false)[0].change);
    assert.deepEqual(changeMarkOf({ change: "first" }), { kind: "", text: "最初" });
    assert.deepEqual(changeMarkOf({ change: "unknown" }), { kind: "", text: "続きを読むと分かる" });
  });

  it("「1 つ前から」の字と色。比べられない行は訳を言い、知らない訳は届いた字のまま", () => {
    assert.deepEqual(changeMarkOf({ change: "same" }), { kind: "ok", text: "同じ" });
    assert.deepEqual(changeMarkOf({ change: "changed" }), { kind: "content", text: "変わった" });
    assert.deepEqual(changeMarkOf({ change: "not_comparable", reason: "not_inspected" }), { kind: "bad", text: "比べられない（まだ検めていない）" });
    assert.equal(reasonText("no_text"), "文字の記録が無い");
    assert.equal(reasonText("withheld"), "方針で文字を伏せた");
    assert.equal(reasonText("wacz_missing"), "WACZ が保管庫に無い");
    assert.equal(reasonText("too_large"), "大きすぎる");
    assert.equal(reasonText("something_new"), "something_new");
    for (const reason of ["not_inspected", "no_text", "withheld", "wacz_missing", "too_large"]) {
      assert.doesNotMatch(inEnglish(() => changeMarkOf({ change: "not_comparable", reason }).text), JA, reason);
    }
  });

  it("「撮り方が替わった」: 1 つ前の「撮り方の分かる行」と digest が違う行にだけ付く。撮り方の分からない行には付かない", () => {
    // A・撮り方の分からない X・B。A と B の撮り方が同じ —— すぐ隣の行と比べる形では、A に付いてしまう
    const skipped = marksOf([row(A, "a", "r"), row(X, "a", null), row(B, "a", "r")], false);
    assert.deepEqual(skipped.map((mark) => mark.recipeChanged), [false, false, false]);
    // 違えば、新しい側の行に付く。いちばん古い行には付かない（比べる相手が無い）
    assert.deepEqual(marksOf([row(A, "a", "s"), row(X, "a", null), row(B, "a", "r")], false).map((mark) => mark.recipeChanged), [true, false, false]);
    // 1 本だけ違う撮り方の行: その行と、元の撮り方へ戻った次の行に付く
    assert.deepEqual(
      marksOf([row(A, "a", "r"), row(B, "a", "s"), row(C, "a", "r")], false).map((mark) => mark.recipeChanged),
      [true, true, false],
    );
    // 撮り方は、比べられない行でも分かっていれば見る（文字と撮り方は別々に飛ばす）
    assert.deepEqual(
      marksOf([row(A, "a", "r"), bare(X, "withheld", "s"), row(B, "a", "r")], false).map((mark) => [mark.change, mark.recipeChanged]),
      [["same", true], ["not_comparable", true], ["first", false]],
    );
  });

  it("開いた時の 2 本: 名指しが無ければ、いちばん新しい比べられる行と、その 1 つ前。比べられる行が 1 本以下なら選ばない", () => {
    const rows = [bare(X), row(A, "a"), bare(id(8)), row(B, "b"), row(C, "c")];
    const picked = pickPair(rows);
    assert.deepEqual([picked.afterId, picked.beforeId], [A, B]);
    assert.deepEqual([picked.missing, picked.unusable, picked.wanting], [[], [], false]);
    assert.deepEqual(pickPair(rows, { beforeId: undefined, afterId: undefined }), picked);
    // 選ばない間は、続きを読めば 2 本そろいうる（呼び手が、続きの在る間だけ読み足す）
    for (const few of [[], [row(A, "a")], [row(A, "a"), bare(X)], [bare(X), bare(id(8))]]) {
      const none = pickPair(few);
      assert.deepEqual([none.afterId, none.beforeId, none.missing, none.unusable, none.wanting], [undefined, undefined, [], [], true]);
    }
  });

  it("開いた時の 2 本: 「今」だけの名指しなら、その行と 1 つ前の比べられる行。「前」は必ず「今」より古い", () => {
    const rows = [row(A, "a"), row(B, "b"), bare(X), row(C, "c")];
    const older = (pair) => rows.findIndex((r) => r.id === pair.beforeId) > rows.findIndex((r) => r.id === pair.afterId);
    const second = pickPair(rows, { afterId: B });
    assert.deepEqual([second.afterId, second.beforeId, second.wanting], [B, C, false]);
    assert.ok(older(second));
    const first = pickPair(rows, { afterId: A });
    assert.deepEqual([first.afterId, first.beforeId], [A, B]);
    assert.ok(older(first));
    // いちばん古い行を「今」に名指した: 「前」は無い。続きを読めば在りうる（呼び手が、続きの在る間だけ読み足す）
    const last = pickPair(rows, { afterId: C });
    assert.deepEqual([last.afterId, last.beforeId, last.wanting], [C, undefined, true]);
    // どの名指しでも、「前」に「今」より新しい行は選ばない
    for (const afterId of [A, B, C]) {
      const pair = pickPair(rows, { afterId });
      if (pair.beforeId !== undefined) assert.ok(older(pair), afterId);
    }
  });

  it("開いた時の 2 本: 2 本の名指しは、その 2 本。「前」が「今」より新しい・同じ・比べられないなら「今」だけ", () => {
    const rows = [row(A, "a"), row(B, "b"), bare(X), row(C, "c")];
    const named = pickPair(rows, { beforeId: C, afterId: A });
    assert.deepEqual([named.afterId, named.beforeId, named.wanting], [A, C, false]);
    // 逆さの名指し（「前」が新しい）と、同じ行の名指し
    for (const beforeId of [A, B]) {
      const pair = pickPair(rows, { beforeId, afterId: B });
      assert.deepEqual([pair.afterId, pair.beforeId, pair.missing, pair.wanting], [B, undefined, [], false], beforeId);
    }
    // 比べられない「前」
    const unusable = pickPair(rows, { beforeId: X, afterId: A });
    assert.deepEqual([unusable.afterId, unusable.beforeId, unusable.unusable, unusable.wanting], [A, undefined, [X], false]);
    // 比べられない「今」は、どちらも選ばない
    const bad = pickPair(rows, { beforeId: C, afterId: X });
    assert.deepEqual([bad.afterId, bad.beforeId, bad.unusable, bad.wanting], [undefined, undefined, [X], false]);
  });

  it("名指しの取り込みが読んだ行に無ければ、選ばずに「続きを読めば在りうる」と言う", () => {
    const rows = [row(A, "a"), row(B, "b")];
    const gone = pickPair(rows, { afterId: C });
    assert.deepEqual([gone.afterId, gone.beforeId, gone.missing, gone.wanting], [undefined, undefined, [C], true]);
    const half = pickPair(rows, { beforeId: C, afterId: A });
    assert.deepEqual([half.afterId, half.beforeId, half.missing, half.wanting], [A, undefined, [C], true]);
    // 続きを読んで行が増えたら、同じ名指しで選べる
    const more = pickPair([...rows, row(C, "c")], { beforeId: C, afterId: A });
    assert.deepEqual([more.afterId, more.beforeId, more.missing, more.wanting], [A, C, [], false]);
  });

  it("丸を選び直す: 「前」に選べるのは「今」より古い比べられる行だけ。「今」を古くすると、「前」はその前の行へ移る", () => {
    const rows = [row(A, "a"), row(B, "b"), bare(X), row(C, "c")];
    const pair = { beforeId: B, afterId: A };
    assert.deepEqual([A, B, X, C].map((rowId) => mayBeBefore(rows, pair, rowId)), [false, true, false, true]);
    assert.deepEqual([A, B, C].map((rowId) => mayBeBefore(rows, { afterId: undefined }, rowId)), [false, false, false]);
    assert.deepEqual(withBefore(rows, pair, C), { beforeId: C, afterId: A });
    assert.deepEqual(withBefore(rows, pair, A), pair);
    assert.deepEqual(withBefore(rows, pair, X), pair);
    // 「今」を B に: 「前」の B は古くなくなるので、その前の比べられる行（C）へ
    assert.deepEqual(withAfter(rows, pair, B), { afterId: B, beforeId: C });
    // 「前」が古いままなら残す
    assert.deepEqual(withAfter(rows, { beforeId: C, afterId: A }, B), { afterId: B, beforeId: C });
    // いちばん古い行を「今」に: 「前」は無い
    assert.deepEqual(withAfter(rows, pair, C), { afterId: C, beforeId: undefined });
    // 比べられない行・無い行は選べない
    assert.deepEqual(withAfter(rows, pair, X), pair);
    assert.deepEqual(withAfter(rows, pair, id(7)), pair);
  });

  it("どこで撮ったか: 予定の名前・消された予定・手で始めたクロール・分からない", () => {
    assert.equal(originText({ kind: "schedule", scheduleId: A, scheduleName: "毎朝の 5 サイト" }), "予定「毎朝の 5 サイト」");
    assert.equal(originText({ kind: "schedule", scheduleId: A, scheduleName: null }), "予定（消された）");
    assert.equal(originText({ kind: "manual", scheduleId: null, scheduleName: null }), "手で始めたクロール");
    assert.equal(originText({ kind: "unknown", scheduleId: null, scheduleName: null }), "分からない（クロールの記録なし）");
    assert.equal(originText(undefined), "分からない（クロールの記録なし）");
    assert.equal(inEnglish(() => originText({ kind: "schedule", scheduleId: A, scheduleName: "daily" })), 'Schedule "daily"');
  });

  it("失敗の字: capture-ledger が古い（経路が無い 404）と、取り込みが無い・見えない 404 を言い分ける。400・422・502 はそれぞれの文", () => {
    const noRoute = historyError(404, { statusCode: 404, error: "Not Found", message: "Route GET:/api/history?url=x not found" });
    const notFound = historyError(404, { error: "not found" });
    assert.equal(noRoute, "この capture-ledger は URL の履歴を返しません（履歴のエンドポイントが無い古い capture-ledger）");
    assert.equal(notFound, "404 —— 見つかりません");
    assert.notEqual(noRoute, notFound);
    assert.equal(historyError(422, { error: "different url" }), "422 —— 2 本の取り込みの URL が違います");
    assert.equal(historyError(502, { error: "storage unreachable" }), "502 —— 保管庫に届きません");
    assert.equal(historyError(400, { error: "invalid url" }), "400 —— http(s) の URL として読めません");
    // Fastify の検査の 400 は、中身（message）を出す
    assert.equal(
      historyError(400, { statusCode: 400, error: "Bad Request", message: 'querystring/before must match format "date-time"' }),
      '400 —— querystring/before must match format "date-time"',
    );
    assert.equal(historyError(500, {}), "500 —— 答えに文がありません");
    assert.equal(historyError(0, { message: "fetch failed" }), "workbench 自身に届きません（fetch failed）");
    const texts = [noRoute, notFound, historyError(422, { error: "different url" }), historyError(502, { error: "storage unreachable" })];
    assert.equal(new Set(texts).size, texts.length);
    assert.equal(inEnglish(() => historyError(422, { error: "different url" })), "422 — The two captures are of different URLs");
    assert.doesNotMatch(inEnglish(() => historyError(404, { message: "Route GET:/api/history not found" })), JA);
  });

  const SUMMARY = { evidence: false, model: "claude-opus-5-5", promptVersion: "change-v1", usd: 0.0123 };

  it("要約の字: 「証拠ではない」と model・版・費用が必ず付く。Claude の 1 行にも「証拠ではない」。要約が無ければ何も出さない", () => {
    const lines = summaryLinesOf({ summary: SUMMARY, headline: "料金が上がった" });
    assert.deepEqual(lines, [
      { text: "Claude の要約（証拠ではない）・claude-opus-5-5・change-v1・$0.0123", muted: true },
      { text: "Claude の 1 行（証拠ではない）: 料金が上がった", muted: false },
    ]);
    for (const word of ["証拠ではない", "claude-opus-5-5", "change-v1", "$0.0123"]) assert.ok(lines[0].text.includes(word), word);
    assert.ok(lines[1].text.includes("証拠ではない"));
    // 1 行の無い要約でも、添え書きは付く
    assert.deepEqual(summaryLinesOf({ summary: SUMMARY, headline: null }).map((line) => line.text), [lines[0].text]);
    assert.deepEqual(summaryLinesOf({ summary: null, headline: null }), []);
    assert.deepEqual(summaryLinesOf(undefined), []);
    // 日本語でない画面には、要約が日本語のままだという断りを足す
    const english = inEnglish(() => summaryLinesOf({ summary: SUMMARY, headline: "料金が上がった" }));
    assert.deepEqual(english.map((line) => line.text), [
      "Claude's summary (not evidence) · claude-opus-5-5 · change-v1 · $0.0123",
      "Claude's line (not evidence): 料金が上がった",
      "The summary is written in Japanese.",
    ]);
  });

  it("要約の断り: 月の上限・Claude が答えない・この capture-ledger では使えない、を言い分ける。422 の句もそれぞれの文", () => {
    const budget = summaryRefusal(429, { error: "claude budget exhausted", spentUsd: 5.0012, budgetUsd: 5 });
    const failed = summaryRefusal(502, { error: "claude failed" });
    const noRoute = summaryRefusal(404, { statusCode: 404, error: "Not Found", message: "Route POST:/api/archives/x/changes/summary not found" });
    assert.equal(budget, "429 —— Claude の月の上限に達しました（この月 $5.0012・上限 $5。Claude は呼んでいません）");
    assert.equal(failed, "502 —— Claude を呼べませんでした");
    assert.equal(noRoute, "404 —— この capture-ledger では要約を使えません（CAPTURE_LEDGER_ANTHROPIC_API_KEY の無い配備）。Claude は呼んでいません");
    const others = [
      summaryRefusal(404, { error: "not found" }),
      summaryRefusal(422, { error: "nothing to summarize" }),
      summaryRefusal(422, { error: "no organization" }),
      summaryRefusal(422, { error: "claude refused" }),
      summaryRefusal(422, { error: "different url" }),
      summaryRefusal(502, { error: "storage unreachable" }),
    ];
    assert.deepEqual(others, [
      "404 —— 見つかりません",
      "422 —— 要約する差分がありません",
      "422 —— 費用を数える組織がありません（クロールに繋がらない取り込み）",
      "422 —— Claude が断りました",
      "422 —— 2 本の取り込みの URL が違います",
      "502 —— 保管庫に届きません",
    ]);
    const texts = [budget, failed, noRoute, ...others];
    assert.equal(new Set(texts).size, texts.length);
    // 額の無い 429（形の違う答え）は、状態の数と句だけ
    assert.equal(summaryRefusal(429, { error: "claude budget exhausted" }), "429 —— Claude の月の上限に達しました");
    assert.equal(summaryRefusal(0, { error: "fetch failed" }), "workbench 自身に届きません（fetch failed）");
    for (const said of [
      () => summaryRefusal(429, { error: "claude budget exhausted", spentUsd: 5, budgetUsd: 5 }),
      () => summaryRefusal(404, { message: "Route POST:/x not found" }),
      () => summaryRefusal(422, { error: "nothing to summarize" }),
      () => summaryRefusal(422, { error: "no organization" }),
    ]) {
      assert.doesNotMatch(inEnglish(said), JA);
    }
  });

  it("差分の上の断り: 撮り方が違う・比べた行が違う。どちらかの撮り方が分からなければ（null）、撮り方は言わない", () => {
    assert.deepEqual(differsNotes({ recipeDiffers: true, stageDiffers: false }), ["撮り方が違います"]);
    assert.deepEqual(differsNotes({ recipeDiffers: true, stageDiffers: true }), [
      "撮り方が違います",
      "比べた行が違います（片方はスクリプトの後の写し、片方は文書の行）",
    ]);
    assert.deepEqual(differsNotes({ recipeDiffers: null, stageDiffers: false }), []);
    assert.deepEqual(differsNotes({ recipeDiffers: false, stageDiffers: false }), []);
    assert.deepEqual(differsNotes(undefined), []);
  });
});
