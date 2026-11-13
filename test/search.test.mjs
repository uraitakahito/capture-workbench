/**
 * 検索の画面（`public/search.js`）の、画面に依らない部分。capture-ledger の `GET /api/search` の答えを行に組む形と、
 * 当たった行の replayweb-server の行き先（CAPTURE-53）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  answerOf,
  highlightParts,
  hitReplaywebHref,
  parseSearchHash,
  searchFailure,
  searchHash,
  searchPath,
  stageLabel,
} from "../public/search.js";
import { setLang, t } from "../public/i18n.js";

/** 英語で 1 つ試し、終わりに日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

const ORIGIN = "http://127.0.0.1:8899";
const DOC = {
  archiveId: "11111111-1111-1111-1111-111111111111",
  stage: null,
  url: "https://shop.test/search?q=lamp",
  title: "検索の結果: ランプ",
  objectKey: "task-a_corr-b.wacz",
  sourceUrl: "https://shop.test/search?q=lamp",
  capturedAt: "2026-11-04T13:58:20.974Z",
};
const SNAPSHOT = {
  ...DOC,
  stage: "after-behaviors",
  url: "urn:browserhive:snapshot:after-behaviors:https://shop.test/result",
};
const hashOf = (href) => new URLSearchParams(new URL(href).hash.slice(1));

test("検索のエンドポイントは語を q に符号化して運ぶ（空白・& ・日本語も）", () => {
  assert.equal(searchPath("ランプ & 机"), "/api/search?q=%E3%83%A9%E3%83%B3%E3%83%97+%26+%E6%9C%BA");
  assert.equal(new URLSearchParams(searchPath("a b&c").split("?")[1]).get("q"), "a b&c");
});

test("検索の画面の URL は #search/<語> で、読み直すと同じ語に戻る", () => {
  assert.equal(searchHash(""), "#search");
  for (const words of ["MacBook", "個人情報", "a/b c#d"]) {
    assert.equal(parseSearchHash(searchHash(words)), words);
  }
});

test("検索の画面でない hash は undefined、語の無い #search は空文字、壊れた符号も空文字", () => {
  assert.equal(parseSearchHash("#crawls"), undefined);
  assert.equal(parseSearchHash("#searching"), undefined);
  assert.equal(parseSearchHash("#search"), "");
  assert.equal(parseSearchHash("#search/"), "");
  assert.equal(parseSearchHash("#search/%E3%81"), "");
});

test("答えの total は数のまま使い、無ければ行の数にする", () => {
  assert.deepEqual(answerOf({ hits: [DOC], total: 1 }), { hits: [DOC], total: 1 });
  assert.deepEqual(answerOf({ hits: [DOC, SNAPSHOT] }), { hits: [DOC, SNAPSHOT], total: 2 });
  assert.deepEqual(answerOf({}), { hits: [], total: 0 });
});

test("時点の名前: 文書の行（stage が null）は「文書」、写しの行は時点そのまま", () => {
  assert.equal(stageLabel(null), "文書");
  assert.equal(stageLabel(undefined), "文書");
  assert.equal(stageLabel("after-load"), "after-load");
  assert.equal(stageLabel("after-behaviors"), "after-behaviors");
});

test("当たった所の断片は、<em> の中だけを印にし、ほかの山括弧は文字のまま残す", () => {
  assert.deepEqual(highlightParts("3 件の<em>ランプ</em>と<b>机</b>の<em>ランプ</em>"), [
    { text: "3 件の", mark: false },
    { text: "ランプ", mark: true },
    { text: "と<b>机</b>の", mark: false },
    { text: "ランプ", mark: true },
  ]);
  assert.deepEqual(highlightParts("印の無い断片"), [{ text: "印の無い断片", mark: false }]);
  assert.deepEqual(highlightParts("<em></em>空の印"), [{ text: "空の印", mark: false }]);
});

test("文書の行の再生のリンクは、取り込んだ URL を撮った時刻で直に開く", () => {
  const hash = hashOf(hitReplaywebHref(ORIGIN, DOC));
  assert.equal(hash.get("view"), "replay");
  assert.equal(hash.get("url"), "https://shop.test/search?q=lamp");
  assert.equal(hash.get("ts"), "20261104135820");
});

test("写しの行の再生のリンクは、写しの URI（urn）を直に開く", () => {
  const href = hitReplaywebHref(ORIGIN, SNAPSHOT);
  assert.ok(href.startsWith(`${ORIGIN}/?source=%2Fwacz%2Ftask-a_corr-b.wacz#`), href);
  const hash = hashOf(href);
  assert.equal(hash.get("url"), "urn:browserhive:snapshot:after-behaviors:https://shop.test/result");
  assert.equal(hash.get("ts"), "20261104135820");
});

test("時刻が読めない当たりは、replay のページ一覧を開く形のまま", () => {
  assert.equal(hitReplaywebHref(ORIGIN, { ...SNAPSHOT, capturedAt: "" }), `${ORIGIN}/?source=%2Fwacz%2Ftask-a_corr-b.wacz`);
});

test("引けなかったときの文: 503 は OpenSearch を、404 は検索のエンドポイントの無い capture-ledger を名指し、capture-ledger の message を先に出す", () => {
  assert.match(
    searchFailure(503, { error: "search unavailable", message: "OpenSearch did not answer" }),
    /OpenSearch。capture-ledger の CAPTURE_LEDGER_OPENSEARCH_URL の先）: OpenSearch did not answer$/,
  );
  assert.match(searchFailure(404, { error: "Not Found" }), /CAPTURE_LEDGER_OPENSEARCH_URL の無い capture-ledger）: Not Found$/);
  assert.equal(
    searchFailure(400, { error: "Bad Request", message: "querystring/q must NOT have fewer than 1 characters" }),
    "400 — querystring/q must NOT have fewer than 1 characters",
  );
  assert.equal(searchFailure(0, { message: "Failed to fetch" }), "workbench 自身に届きません（Failed to fetch）");
});

test("英語: 文書の行の時点は document、写しの行の時点の名前は訳さない", () => {
  assert.deepEqual(
    inEnglish(() => [null, "", "after-load", "after-behaviors"].map(stageLabel)),
    ["document", "document", "after-load", "after-behaviors"],
  );
});

test("英語: 引けなかったときの文は英語で、capture-ledger の文はそのまま後ろに付く", () => {
  assert.equal(
    inEnglish(() => searchFailure(503, { error: "search unavailable", message: "OpenSearch did not answer" })),
    "capture-ledger's full-text search does not answer (OpenSearch, where capture-ledger's CAPTURE_LEDGER_OPENSEARCH_URL points): OpenSearch did not answer",
  );
  assert.equal(
    inEnglish(() => searchFailure(404, { error: "Not Found" })),
    "capture-ledger has no search endpoint (a capture-ledger without CAPTURE_LEDGER_OPENSEARCH_URL): Not Found",
  );
  assert.equal(
    inEnglish(() => searchFailure(0, { message: "Failed to fetch" })),
    "The workbench itself cannot be reached (Failed to fetch)",
  );
  assert.equal(inEnglish(() => searchFailure(500, {})), "500 — The answer has no message");
  assert.equal(searchFailure(500, {}), "500 — 答えに文がありません");
});

test("当たりの数の文: 日本語は「N 件」、英語は 1 hit と 2 hits を分ける", () => {
  const found = (n) => t("search.found", { words: "ランプ", n });
  assert.equal(found(2), "「ランプ」: 2 件。1 件はアーカイブの 1 時点です（写しのある取り込みは写しの時点ごと）。");
  assert.match(inEnglish(() => found(1)), /^"ランプ": 1 hit\. A hit is one stage of one archive /);
  assert.match(inEnglish(() => found(2)), /^"ランプ": 2 hits\. /);
  assert.equal(inEnglish(() => t("search.none", { words: "ランプ" })), '"ランプ" was not found (among the archives you may view).');
});
