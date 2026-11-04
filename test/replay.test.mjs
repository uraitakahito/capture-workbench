/**
 * 「replay ↗」の行き先（`public/replay.js`）。アーカイブの行は取り込んだ URL を撮った時刻で直に開く
 * （CAPTURE-48。replay は mainPageURL を読まず、一覧を新しい順に並べるので、行き先で名指す）。クロールの行と
 * ページの行はクロールの合本を開く（CAPTURE-54。`replayBundleHref`。WACZ 1 本の `replayHref` とは別に試す）。
 * `source` の綴りは 3 つの組み立て役（検索の当たりの `hitReplayHref` も）で同じ —— replay の server（v0.3.0 から）の
 * 読み方で鍵に戻るかを、3 つ全部で試す。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { replayBundleFailure, replayBundleHref, replayHref, replayTs } from "../public/replay.js";
import { hitReplayHref } from "../public/search.js";

const ORIGIN = "http://127.0.0.1:8899";
const ARCHIVE = {
  objectKey: "task-a_corr-b.wacz",
  sourceUrl: "https://www.apple.com/jp/",
  capturedAt: "2026-11-03T07:31:09.894Z",
};

const hashOf = (href) => new URLSearchParams(new URL(href).hash.slice(1));

test("取り込んだ URL を、撮った時刻で直に開く行き先になる", () => {
  const href = replayHref(ORIGIN, ARCHIVE);
  assert.ok(href.startsWith(`${ORIGIN}/?source=%2Fwacz%2Ftask-a_corr-b.wacz#`), href);
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
  const list = `${ORIGIN}/?source=%2Fwacz%2Ftask-a_corr-b.wacz`;
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, sourceUrl: undefined }), list);
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, sourceUrl: "" }), list);
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, capturedAt: null }), list);
  assert.equal(replayHref(ORIGIN, { ...ARCHIVE, capturedAt: "いつか" }), list);
  assert.equal(replayTs(null), undefined);
});

test("WACZ の鍵も合本と同じ綴り: 区切りごとに符号にした path を、source の値としてもう 1 度符号にする", () => {
  const href = replayHref(ORIGIN, { ...ARCHIVE, objectKey: "a b/c.wacz" });
  assert.ok(href.startsWith(`${ORIGIN}/?source=%2Fwacz%2Fa%2520b%2Fc.wacz#`), href);
  assert.equal(new URL(href).searchParams.get("source"), "/wacz/a%20b/c.wacz");
});

// ── クロールの合本（CAPTURE-54）。台帳の `replayBundle` とページの行の `capturedAt`・`bundledRev` から組む ──────────

const CRAWL = "5b0c0009-6a1e-4000-8000-000000000009";
/** 台帳の行の `replayBundle`（書けた版 r2）。 */
const BUNDLE = {
  key: `org/acme/crawls/${CRAWL}/r2/replay.json`,
  rev: 2,
  pages: 6,
  builtAt: "2026-10-12T08:41:20.000Z",
  error: null,
};
/** 1 度も書けず、失敗だけの `replayBundle`。 */
const NEVER_WRITTEN = {
  key: null,
  rev: null,
  pages: null,
  builtAt: null,
  error: "could not write r1 to the store: The specified bucket does not exist",
};
/** ページの行（WACZ が r1 で合本に入った）。 */
const PAGE = { id: "1201", url: "https://site.test/search?q=個人情報", capturedAt: "2026-10-12T08:40:00.000Z", bundledRev: 1 };

const sourceOf = (href) => new URL(href).searchParams.get("source");

test("合本の鍵の / は区切りのまま、path ごと source の値として符号にする（クロールの行は一覧を開く）", () => {
  const href = replayBundleHref(ORIGIN, BUNDLE);
  assert.equal(href, `${ORIGIN}/?source=%2Fwacz%2Forg%2Facme%2Fcrawls%2F${CRAWL}%2Fr2%2Freplay.json#view=pages`);
  assert.equal(sourceOf(href), `/wacz/org/acme/crawls/${CRAWL}/r2/replay.json`);
});

/**
 * replay の読み方で、行き先から保管庫の鍵の区切りを取り出す。replay（wabac）が `source` の値を 1 度解き、replay の
 * server が `/wacz/` の後ろを区切りごとに 1 度だけ解く（replay の docs/replay-bundle.md の「`/wacz/` の鍵の綴り」）。
 */
const keySegmentsOf = (href) => {
  const source = sourceOf(href);
  assert.ok(source.startsWith("/wacz/"), source);
  return source.slice("/wacz/".length).split("/").map(decodeURIComponent);
};

test("% を含む鍵は、source を 1 度解いて path を区切りごとに 1 度解くと元の鍵に戻る（3 つの組み立て役とも）", () => {
  // BrowserHive はラベルを百分率の符号で鍵に入れる（replay の docs の例に、空白・日本語・/ の入ったラベルを足した）。
  // 鍵の中の %2F は区切りではない —— 区切りの数まで元の鍵と同じかを見る
  const wacz = "org/acme/2026-11/a_c1_hello%20world%2F%E3%83%A9%E3%83%B3%E3%83%97.wacz";
  const bundle = "org/a%2Fb c/crawls/x%25y/r1/replay.json";
  const hit = {
    stage: "after-behaviors",
    url: "urn:browserhive:snapshot:after-behaviors:https://shop.test/result",
    objectKey: wacz,
    sourceUrl: "https://shop.test/search?q=lamp",
    capturedAt: "2026-11-04T13:58:20.974Z",
  };
  const cases = [
    ["アーカイブの行（replayHref）", replayHref(ORIGIN, { ...ARCHIVE, objectKey: wacz }), wacz],
    ["アーカイブの行・一覧（replayHref）", replayHref(ORIGIN, { ...ARCHIVE, objectKey: wacz, capturedAt: null }), wacz],
    ["検索の写しの行（hitReplayHref）", hitReplayHref(ORIGIN, hit), wacz],
    ["検索の写しの行・一覧（hitReplayHref）", hitReplayHref(ORIGIN, { ...hit, capturedAt: "" }), wacz],
    ["検索の文書の行（hitReplayHref）", hitReplayHref(ORIGIN, { ...hit, stage: null }), wacz],
    ["クロールの行（replayBundleHref）", replayBundleHref(ORIGIN, { ...BUNDLE, key: bundle, rev: 1 }), bundle],
    ["ページの行（replayBundleHref）", replayBundleHref(ORIGIN, { ...BUNDLE, key: bundle, rev: 1 }, PAGE), bundle],
  ];
  for (const [name, href, key] of cases) assert.deepEqual(keySegmentsOf(href), key.split("/"), name);
});

test("source は replay と同じ origin の path で、.json で終わる（replay は拡張子で合本と読む）", () => {
  for (const href of [replayBundleHref(ORIGIN, BUNDLE), replayBundleHref(ORIGIN, BUNDLE, PAGE)]) {
    const url = new URL(href);
    assert.equal(url.origin, ORIGIN);
    assert.equal(url.pathname, "/");
    assert.deepEqual([...url.searchParams.keys()], ["source"]);
    assert.ok(sourceOf(href).startsWith("/wacz/"), href);
    assert.ok(sourceOf(href).endsWith(".json"), href);
  }
});

test("ページは、合本の中で撮った時刻に直に開く（source はクロールの行と同じ）", () => {
  const href = replayBundleHref(ORIGIN, BUNDLE, PAGE);
  const hash = hashOf(href);
  assert.deepEqual([...hash.keys()], ["view", "url", "ts"]);
  assert.equal(hash.get("view"), "replay");
  assert.equal(hash.get("url"), PAGE.url);
  assert.equal(hash.get("ts"), "20261012084000");
  assert.equal(sourceOf(href), sourceOf(replayBundleHref(ORIGIN, BUNDLE)));
});

test("台帳が合本を持たない行（replayBundle が null・欄の無い古い台帳）には、行き先が無い", () => {
  assert.equal(replayBundleHref(ORIGIN, null), undefined);
  assert.equal(replayBundleHref(ORIGIN, undefined), undefined);
  assert.equal(replayBundleHref(ORIGIN, null, PAGE), undefined);
});

test("1 度も書けず失敗だけの行（key が無く error だけ）には行き先が無く、書けた版の後の失敗なら前の版を開く", () => {
  assert.equal(replayBundleHref(ORIGIN, NEVER_WRITTEN), undefined);
  assert.equal(replayBundleHref(ORIGIN, NEVER_WRITTEN, PAGE), undefined);
  const later = { ...BUNDLE, error: "could not write r3 to the store: socket hang up" };
  assert.equal(sourceOf(replayBundleHref(ORIGIN, later)), `/wacz/org/acme/crawls/${CRAWL}/r2/replay.json`);
});

test("ページの WACZ が台帳の指す版より後の版に入ったなら（bundledRev > rev）、行き先が無い", () => {
  assert.equal(replayBundleHref(ORIGIN, BUNDLE, { ...PAGE, bundledRev: 3 }), undefined);
  assert.notEqual(replayBundleHref(ORIGIN, BUNDLE, { ...PAGE, bundledRev: 2 }), undefined, "指す版で入った");
  assert.notEqual(replayBundleHref(ORIGIN, BUNDLE, { ...PAGE, bundledRev: 1 }), undefined, "前の版で入った");
});

test("WACZ がどの版にも入っていないページ（bundledRev が null）には、行き先が無い", () => {
  assert.equal(replayBundleHref(ORIGIN, BUNDLE, { ...PAGE, bundledRev: null }), undefined);
  // 欄の無い台帳のページ
  assert.equal(replayBundleHref(ORIGIN, BUNDLE, { id: PAGE.id, url: PAGE.url }), undefined);
});

test("合本に入ったページでも、URL か撮った時刻が読めなければ合本の一覧を開く", () => {
  const list = replayBundleHref(ORIGIN, BUNDLE);
  assert.equal(replayBundleHref(ORIGIN, BUNDLE, { ...PAGE, capturedAt: null }), list);
  assert.equal(replayBundleHref(ORIGIN, BUNDLE, { ...PAGE, capturedAt: "いつか" }), list);
  assert.equal(replayBundleHref(ORIGIN, BUNDLE, { ...PAGE, url: "" }), list);
});

test("合本を書けなかった理由は 1 行で、台帳の文のまま。書けた版が在れば、前の版を開くと添える", () => {
  assert.equal(replayBundleFailure(BUNDLE), undefined);
  assert.equal(replayBundleFailure(null), undefined);
  assert.equal(replayBundleFailure(undefined), undefined);
  assert.equal(
    replayBundleFailure({ ...BUNDLE, error: "could not write r3 to the store: socket hang up" }),
    "合本の新しい版を書けませんでした（replay ↗ は前の版 r2 を開きます）: could not write r3 to the store: socket hang up",
  );
  assert.equal(
    replayBundleFailure(NEVER_WRITTEN),
    "合本を書けませんでした（replay で開ける版はまだありません）: could not write r1 to the store: The specified bucket does not exist",
  );
});
