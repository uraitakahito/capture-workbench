/**
 * 検索の画面（`public/search.js`）の、画面に依らない部分。台帳の `GET /api/search` の答えを行に組む形と、
 * 当たった行の replay の行き先（CAPTURE-53）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  answerOf,
  highlightParts,
  hitReplayHref,
  parseSearchHash,
  searchFailure,
  searchHash,
  searchPath,
  stageLabel,
} from "../public/search.js";

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

test("検索の口は語を q に符号化して運ぶ（空白・& ・日本語も）", () => {
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

test("文書の行の replay ↗ は、取り込んだ URL を撮った時刻で直に開く", () => {
  const hash = hashOf(hitReplayHref(ORIGIN, DOC));
  assert.equal(hash.get("view"), "replay");
  assert.equal(hash.get("url"), "https://shop.test/search?q=lamp");
  assert.equal(hash.get("ts"), "20261104135820");
});

test("写しの行の replay ↗ は、写しの URI（urn）を直に開く", () => {
  const href = hitReplayHref(ORIGIN, SNAPSHOT);
  assert.ok(href.startsWith(`${ORIGIN}/?source=/wacz/task-a_corr-b.wacz#`));
  const hash = hashOf(href);
  assert.equal(hash.get("url"), "urn:browserhive:snapshot:after-behaviors:https://shop.test/result");
  assert.equal(hash.get("ts"), "20261104135820");
});

test("時刻が読めない当たりは、replay のページ一覧を開く形のまま", () => {
  assert.equal(hitReplayHref(ORIGIN, { ...SNAPSHOT, capturedAt: "" }), `${ORIGIN}/?source=/wacz/task-a_corr-b.wacz`);
});

test("引けなかったときの文: 503 は OpenSearch を、404 は検索の口の無い台帳を名指し、台帳の message を先に出す", () => {
  assert.match(
    searchFailure(503, { error: "search unavailable", message: "OpenSearch did not answer" }),
    /OpenSearch。台帳の CAPTURE_LEDGER_OPENSEARCH_URL の先）: OpenSearch did not answer$/,
  );
  assert.match(searchFailure(404, { error: "Not Found" }), /CAPTURE_LEDGER_OPENSEARCH_URL の無い台帳）: Not Found$/);
  assert.equal(
    searchFailure(400, { error: "Bad Request", message: "querystring/q must NOT have fewer than 1 characters" }),
    "400 — querystring/q must NOT have fewer than 1 characters",
  );
  assert.equal(searchFailure(0, { message: "Failed to fetch" }), "dashboard 自身に届きません（Failed to fetch）");
});
