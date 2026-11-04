/**
 * アーカイブの行の「replay ↗」の行き先（`public/replay.js`）。取り込んだ URL を撮った時刻で直に開く
 * （CAPTURE-48。replay は mainPageURL を読まず、一覧を新しい順に並べるので、行き先で名指す）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { replayHref, replayTs } from "../public/replay.js";

const ORIGIN = "http://127.0.0.1:8899";
const ARCHIVE = {
  objectKey: "task-a_corr-b.wacz",
  sourceUrl: "https://www.apple.com/jp/",
  capturedAt: "2026-11-03T07:31:09.894Z",
};

const hashOf = (href) => new URLSearchParams(new URL(href).hash.slice(1));

test("取り込んだ URL を、撮った時刻で直に開く行き先になる", () => {
  const href = replayHref(ORIGIN, ARCHIVE);
  assert.ok(href.startsWith(`${ORIGIN}/?source=/wacz/task-a_corr-b.wacz#`));
  const hash = hashOf(href);
  assert.equal(hash.get("view"), "replay");
  assert.equal(hash.get("url"), "https://www.apple.com/jp/");
  assert.equal(hash.get("ts"), "20261103073109");
});

test("URL の ? # & と日本語は、hash の中で符号化して運ぶ", () => {
  const sourceUrl = "https://laws.e-gov.go.jp/search?q=個人情報&x=1#top";
  const hash = hashOf(replayHref(ORIGIN, { ...ARCHIVE, sourceUrl }));
  assert.equal(hash.get("url"), sourceUrl);
  assert.equal([...hash.keys()].join(","), "view,url,ts");
});

test("時刻は UTC の 14 桁にそろえる（時差のある書き方でも）", () => {
  assert.equal(replayTs("2026-11-03T07:31:09.894Z"), "20261103073109");
  assert.equal(replayTs("2026-11-03T16:31:09+09:00"), "20261103073109");
});

test("時刻か URL が無ければ、いままでどおりページ一覧を開く", () => {
  const list = `${ORIGIN}/?source=/wacz/task-a_corr-b.wacz`;
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, sourceUrl: undefined }), list);
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, sourceUrl: "" }), list);
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, capturedAt: null }), list);
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, capturedAt: "いつか" }), list);
  assert.equal(replayTs(null), undefined);
});

test("WACZ の鍵は、いままでどおり source の中で符号化する", () => {
  const href = replayHref(ORIGIN, { ...ARCHIVE, objectKey: "a b/c.wacz" });
  assert.ok(href.startsWith(`${ORIGIN}/?source=/wacz/a%20b%2Fc.wacz#`));
});
